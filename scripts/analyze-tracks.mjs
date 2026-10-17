#!/usr/bin/env node
// 🎚 曲目特征离线分析（docs/miku-design.md A2.3–A2.7）：npm run song:analyze [-- <id…> | --all]
//
//   每首：ffmpeg 解码成 11025Hz 单声道 PCM → STFT 得到起音包络 / 谱质心 / RMS；ebur128 得到整合响度与 LRA；
//   歌词（public/lyrics/<id>.json）用来检副歌与季语。原始量逐首存进产物，arousal / contrast 按「曲库内百分位」
//   在全体上重算——所以只分析一首新歌时，也会刷新所有歌的 arousal（加一首歌会轻微挪动别人的名次，这是百分位的本义）。
//
//   产物 src/data/trackFeatures.generated.json 是「自动」这一层；人标写在 music-data/tracks/<id>.json 的 mood，
//   由 trackMood.ts（以及音乐页的 music:build）按 人标 > 导入 > 自动 > 专辑默认 > 缺省 合并。
//
//   默认只分析产物里还没有的曲目；传 id 只分析这些；--all 全部重算。
//   声波峰值另存 src/data/trackPeaks.generated.json（音乐页的声波进度条按需加载，不进 Miku 的包）：
//   解码时顺带算；缺峰值的曲目单独补解码一遍（不重算特征）。--peaks 只补峰值，配 --all 则全部重算峰值。
//   只靠歌词的量（歌词法副歌、段落、季语、意象、时段）每次都对全体重算，不用解码音频——补了歌词以后
//   直接 `npm run song:analyze` 就会刷新。
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { parsePlaylist } from './lib/track-identity.mjs';
import {
  analyzeSpectrum, arousalFromRaw, chorusFromEnergy, chorusFromLyrics, DEFAULT_AROUSAL_WEIGHTS, estimateBpm,
  imageryOf, median, onsetRate, round3, seasonOf, segmentsFromLyrics, segmentsFromSections, spearman, timeOf,
} from './lib/track-features.mjs';
import { PEAK_COUNT, encodePeaks, peaksOf } from './lib/peaks-core.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PLAYLIST_FILE = path.join(ROOT, 'src/hooks/useSoundscape.ts');
const OUT_FILE = path.join(ROOT, 'src/data/trackFeatures.generated.json');
const PEAKS_FILE = path.join(ROOT, 'src/data/trackPeaks.generated.json');
const WEIGHTS_FILE = path.join(ROOT, 'music-data/arousal-weights.json');
const PROFILE_DIR = path.join(ROOT, 'music-data/tracks');
const SR = 11025;

const run = (cmd, args, { binary = false } = {}) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args);
  const out = [];
  let err = '';
  child.stdout.on('data', chunk => out.push(chunk));
  child.stderr.on('data', chunk => { err += chunk; });
  child.on('error', reject);
  child.on('close', code => {
    if (code !== 0) return reject(new Error(err.split('\n').slice(-4).join('\n') || `${cmd} 退出码 ${code}`));
    const buf = Buffer.concat(out);
    resolve({ out: binary ? buf : buf.toString('utf8'), err });
  });
});

const decode = async file => {
  const { out } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { binary: true });
  // Buffer 的 byteOffset 未必 4 字节对齐，拷一份再视作 Float32Array
  const aligned = new Uint8Array(out.byteLength);
  aligned.set(out);
  return new Float32Array(aligned.buffer);
};

const loudness = async file => {
  const { err } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=none', '-f', 'null', '-']);
  const summary = err.slice(err.lastIndexOf('Summary:'));
  const I = Number(summary.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
  const LRA = Number(summary.match(/LRA:\s+([\d.]+) LU/)?.[1]);
  return { lufs: I, lra: LRA };
};

// 「/audio/2019.08.28 [Album] エルマ/03 - ….flac」→「エルマ」；DECO_27 这类合集文件夹原样返回
const albumFromUrl = url => {
  const folder = decodeURI(url).split('/').slice(-2, -1)[0] ?? '';
  return folder.replace(/^\d{4}\.\d{2}\.\d{2}\s*\[[^\]]+\]\s*/, '').replace(/^.+?\s-\s/, '').trim();
};

const readJson = async (file, fallback) => {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
};

const lyricsOf = async id => {
  const doc = await readJson(path.join(ROOT, 'public/lyrics', `${id}.json`), null);
  return Array.isArray(doc?.lines) ? doc.lines : [];
};

const audioFileOf = track => {
  const file = path.join(ROOT, 'public', decodeURI(track.url));
  if (!existsSync(file)) throw new Error(`找不到音频：${path.relative(ROOT, file)}`);
  return file;
};

/** 只为声波进度条解码：不跑 STFT 与响度 */
const peaksOne = async track => encodePeaks(peaksOf(await decode(audioFileOf(track))));

const analyzeOne = async track => {
  const file = audioFileOf(track);
  const [pcm, loud, lines] = await Promise.all([decode(file), loudness(file), lyricsOf(track.id)]);
  const { flux, centroid, rms, hopSec } = analyzeSpectrum(pcm, SR);
  // 谱质心只统计有声的帧（静音帧的质心是噪声），取中位数
  const rmsGate = median([...rms]) * 0.25;
  const voiced = [...centroid].filter((_, i) => rms[i] > rmsGate);
  const fromLyrics = chorusFromLyrics(lines);
  const sections = fromLyrics ?? chorusFromEnergy(rms, hopSec);
  return {
    raw: {
      lufs: loud.lufs,
      lra: loud.lra,
      centroid: Math.round(median(voiced)),
      onsetRate: round3(onsetRate(flux, hopSec)),
      bpm: estimateBpm(flux, hopSec),
      durationSec: Math.round(pcm.length / SR),
    },
    sections: sections ?? undefined,
    sectionsSource: fromLyrics ? 'lyrics' : sections ? 'energy' : undefined,
    peaks: encodePeaks(peaksOf(pcm)),
  };
};

const pool = async (items, size, fn) => {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }));
  return results;
};

const main = async () => {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const peaksOnly = args.includes('--peaks');
  const ids = args.filter(a => !a.startsWith('--'));
  const playlist = parsePlaylist(await readFile(PLAYLIST_FILE, 'utf8'));
  const previous = await readJson(OUT_FILE, { tracks: {} });
  const previousPeaks = (await readJson(PEAKS_FILE, { tracks: {} })).tracks ?? {};
  const weights = { ...DEFAULT_AROUSAL_WEIGHTS, ...(await readJson(WEIGHTS_FILE, {})).weights };

  const unknown = ids.filter(id => !playlist.some(t => t.id === id));
  if (unknown.length) throw new Error(`PLAYLIST 里没有：${unknown.join(', ')}`);
  const picked = t => all || (ids.length ? ids.includes(t.id) : false);
  const targets = peaksOnly ? [] : playlist.filter(t => picked(t) || (!ids.length && !previous.tracks[t.id]));
  console.log(`分析 ${targets.length} / ${playlist.length} 首（权重 ${JSON.stringify(weights)}）`);

  const workers = Math.max(1, Math.min(4, os.cpus().length - 1));
  const fresh = {};
  const freshPeaks = {};
  let done = 0;
  await pool(targets, workers, async track => {
    try {
      const { peaks, ...entry } = await analyzeOne(track);
      fresh[track.id] = entry;
      freshPeaks[track.id] = peaks;
    } catch (error) {
      console.warn(`  ✗ ${track.id} ${track.title}：${error.message}`);
    }
    done++;
    if (done % 10 === 0 || done === targets.length) console.log(`  ${done}/${targets.length}`);
  });

  // 声波峰值：刚分析过的已经有了；其余缺的（或 --all / 点名的）单独解码补上
  const peakTargets = playlist.filter(t => !freshPeaks[t.id] && (picked(t) || (!ids.length && !previousPeaks[t.id])));
  if (peakTargets.length) console.log(`补声波峰值 ${peakTargets.length} 首`);
  let peaksDone = 0;
  await pool(peakTargets, workers, async track => {
    try {
      freshPeaks[track.id] = await peaksOne(track);
    } catch (error) {
      console.warn(`  ✗ ${track.id} ${track.title}：${error.message}`);
    }
    peaksDone++;
    if (peaksDone % 20 === 0 || peaksDone === peakTargets.length) console.log(`  峰值 ${peaksDone}/${peakTargets.length}`);
  });
  const peaksOut = {
    version: 1,
    generatedBy: 'scripts/analyze-tracks.mjs',
    count: PEAK_COUNT,
    tracks: Object.fromEntries(playlist
      .map(track => [track.id, freshPeaks[track.id] ?? previousPeaks[track.id]])
      .filter(([, peaks]) => peaks)),
  };
  await writeFile(PEAKS_FILE, `${JSON.stringify(peaksOut, null, 1)}\n`, 'utf8');
  console.log(`写出 ${path.relative(ROOT, PEAKS_FILE)}：${Object.keys(peaksOut.tracks).length} / ${playlist.length} 首有声波`);
  if (peaksOnly) return;

  // 只保留仍在 PLAYLIST 里的曲目（删歌后产物自动收缩）
  const merged = {};
  for (const track of playlist) {
    const entry = fresh[track.id] ?? previous.tracks[track.id];
    if (entry) merged[track.id] = { ...entry };
  }

  // 百分位在全体上重算：arousal / contrast，以及依赖 arousal 的 time
  const order = Object.keys(merged);
  const scored = arousalFromRaw(order.map(id => merged[id].raw), weights);
  for (const [i, id] of order.entries()) {
    const entry = merged[id];
    entry.arousal = scored[i].arousal;
    entry.contrast = scored[i].contrast;
    entry.percentiles = scored[i].percentiles;
    const track = playlist.find(t => t.id === id);
    const lines = await lyricsOf(id);
    const text = lines.map(l => `${l.ja ?? ''} ${l.text ?? ''}`).join('\n');
    // 歌词法的副歌优先于能量法（歌词是后来补的也认）；段落跟着副歌走（docs/song-emotion-design.md §2.2）
    const lyricChorus = chorusFromLyrics(lines);
    if (lyricChorus) {
      entry.sections = lyricChorus;
      entry.sectionsSource = 'lyrics';
    }
    const durationMs = (entry.raw.durationSec ?? 0) * 1000 || undefined;
    entry.segments = (lyricChorus ? segmentsFromLyrics(lines, durationMs) : null)
      ?? segmentsFromSections(entry.sections, durationMs)
      ?? (lines.length ? segmentsFromLyrics(lines, durationMs) : null)
      ?? undefined;
    entry.season = seasonOf(track.title, text).season ?? undefined;
    entry.imagery = imageryOf(track.title, text).imagery ?? undefined;
    entry.time = timeOf(track.title, text, entry.arousal).time ?? undefined;
    entry.bpm = entry.raw.bpm ?? undefined;
    // 导入层的两个事实顺带带出（运行时就不必打包整份档案原始 JSON）：网易云 BPM 与专辑名。
    // 优先级仍由 trackMood.ts 决定：bpm 人标 > 网易云 > 自动；专辑名用来挂专辑默认心境。
    const profile = await readJson(path.join(PROFILE_DIR, `${id}.json`), {});
    entry.bpmNetease = profile.sources?.netease?.bpm || undefined;
    entry.album = profile.album ?? profile.sources?.netease?.album ?? albumFromUrl(track.url);
  }

  const out = {
    version: 1,
    generatedBy: 'scripts/analyze-tracks.mjs',
    weights,
    tracks: Object.fromEntries(order.map(id => {
      const { arousal, contrast, bpm, bpmNetease, album, sections, sectionsSource, segments, season, imagery, time, percentiles, raw } = merged[id];
      return [id, JSON.parse(JSON.stringify({ album, arousal, contrast, bpm, bpmNetease, sections, sectionsSource, segments, season, imagery, time, percentiles, raw }))];
    })),
  };
  await writeFile(OUT_FILE, `${JSON.stringify(out, null, 1)}\n`, 'utf8');

  // 报告：覆盖率与网易云 BPM 的吻合度（导入层有 bpm 的才比）
  const entries = Object.values(out.tracks);
  const withLyricChorus = entries.filter(e => e.sectionsSource === 'lyrics').length;
  const withLyrics = (await Promise.all(order.map(async id => (await lyricsOf(id)).length > 0))).filter(Boolean).length;
  const seasons = entries.reduce((acc, e) => (e.season ? { ...acc, [e.season]: (acc[e.season] ?? 0) + 1 } : acc), {});
  console.log(`\n写出 ${path.relative(ROOT, OUT_FILE)}：${entries.length} 首`);
  console.log(`  副歌：歌词法 ${withLyricChorus}/${withLyrics}（有歌词的）· 能量法补 ${entries.filter(e => e.sectionsSource === 'energy').length} · 无 ${entries.filter(e => !e.sections).length}`);
  const labels = entries.flatMap(e => (e.segments ?? []).map(seg => seg[0])).reduce((acc, at) => ({ ...acc, [at]: (acc[at] ?? 0) + 1 }), {});
  console.log(`  段落：${entries.filter(e => e.segments).length} 首 ${JSON.stringify(labels)}`);
  console.log(`  意象：${JSON.stringify(entries.reduce((acc, e) => (e.imagery ? { ...acc, [e.imagery]: (acc[e.imagery] ?? 0) + 1 } : acc), {}))}`);
  console.log(`  季节：${JSON.stringify(seasons)}  时段：${JSON.stringify(entries.reduce((a, e) => (e.time ? { ...a, [e.time]: (a[e.time] ?? 0) + 1 } : a), {}))}`);

  const pairs = [];
  for (const id of order) {
    const profile = await readJson(path.join(PROFILE_DIR, `${id}.json`), null);
    const ref = profile?.sources?.netease?.bpm;
    if (ref && out.tracks[id].bpm) pairs.push([out.tracks[id].bpm, ref]);
  }
  if (pairs.length) {
    const within = tol => pairs.filter(([a, b]) => Math.abs(a - b) / b <= tol).length;
    const octave = pairs.filter(([a, b]) => [0.5, 2, 2 / 3, 1.5].some(k => Math.abs(a - b * k) / (b * k) <= 0.04)).length;
    console.log(`  BPM 对照网易云（${pairs.length} 首）：±4% 内 ${within(0.04)} · ±8% 内 ${within(0.08)} · 倍频/三连关系 ${octave}`);
  }
  const arousals = entries.map(e => e.arousal);
  const bpms = entries.map(e => e.raw.bpm ?? 0);
  console.log(`  arousal 与 bpm 的 Spearman：${spearman(arousals, bpms).toFixed(2)}（只作健康检查，不是目标）`);
};

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
