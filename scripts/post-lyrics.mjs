#!/usr/bin/env node
//
// 🌙 歌词入库：本地 LRC 优先，缺失时可从 LRCLIB 获取同步歌词
//    → 清洗 / 校验 / 合并中文译词 → 生成版本化 JSON + manifest
//    → 可选上传到 oasis-audio/lyrics 并逐一校验。
//
// 用法：
//   npm run lyric -- --track m_06 --lrc ~/Downloads/メルト.lrc
//   npm run lyric -- --track m_06 --fetch
//   npm run lyric -- --category Miku --fetch
//   npm run lyric -- --category Miku --fetch --publish
//
// 中文译词放在 lyrics-src/<trackId>/translation.zh.lrc，时间轴与日文允许 ±350ms。
// 网络查询只发生在本地导入阶段；访客浏览器只读取自己的 R2 JSON。
//
import { access, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { constants as fsConstants, existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  buildTrackIdentities,
  parsePlaylist,
  readIdentityConfig,
} from './lib/track-identity.mjs';
import {
  acceptableLrclibCandidate,
  overlap,
  rankLrclibCandidates,
} from './lib/lyrics-match.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PLAYLIST_FILE = path.join(PROJECT_ROOT, 'src/hooks/useSoundscape.ts');
const IDENTITY_CONFIG_FILE = path.join(PROJECT_ROOT, 'lyrics-config/overrides.json');
const SOURCE_DIR = path.join(PROJECT_ROOT, 'lyrics-src');
const OUT_DIR = path.join(PROJECT_ROOT, 'dist-lyrics');
const DEV_DIR = path.join(PROJECT_ROOT, 'public/lyrics');
const REMOTE = 'oasis-r2:oasis-audio/lyrics';
const PUBLIC_BASE = 'https://audio.boblee.dev/lyrics';
const MAX_LRC_BYTES = 2 * 1024 * 1024;
const MAX_LINES = 2_000;
const TIMESTAMP = /\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const run = (cmd, args) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} 退出码 ${code}`)));
});

const capture = (cmd, args) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args);
  let out = '';
  let err = '';
  child.stdout.on('data', chunk => { out += chunk; });
  child.stderr.on('data', chunk => { err += chunk; });
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolve(out) : reject(new Error(err.trim() || `${cmd} 退出码 ${code}`)));
});

const clean = value => String(value ?? '')
  .replace(/^\uFEFF/, '')
  .replace(/\0/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 500);

const parseArgs = argv => {
  const options = {
    trackIds: [],
    category: '',
    lrc: '',
    translation: '',
    fetch: false,
    publish: false,
    dry: false,
    force: false,
    refresh: false,
    debug: false,
    offsetMs: 0,
    translationStatus: 'machine',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--track') options.trackIds.push(argv[++i] ?? '');
    else if (arg === '--category') options.category = argv[++i] ?? '';
    else if (arg === '--lrc') options.lrc = argv[++i] ?? '';
    else if (arg === '--translation') options.translation = argv[++i] ?? '';
    else if (arg === '--offset') options.offsetMs = Number(argv[++i] ?? 0);
    else if (arg === '--machine') options.translationStatus = 'machine';
    else if (arg === '--reviewed') options.translationStatus = 'reviewed';
    else if (arg === '--fetch') options.fetch = true;
    else if (arg === '--publish') options.publish = true;
    else if (arg === '--dry') options.dry = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--refresh') options.refresh = true;
    else if (arg === '--debug') options.debug = true;
    else throw new Error(`未知参数：${arg}`);
  }
  if (options.lrc && options.trackIds.length !== 1) throw new Error('--lrc 必须与单个 --track 一起使用');
  if (options.translation && options.trackIds.length !== 1) throw new Error('--translation 必须与单个 --track 一起使用');
  if (!Number.isFinite(options.offsetMs) || Math.abs(options.offsetMs) > 60_000) throw new Error('--offset 必须在 ±60000ms 内');
  return options;
};

const fractionToMs = fraction => {
  if (!fraction) return 0;
  if (fraction.length === 1) return Number(fraction) * 100;
  if (fraction.length === 2) return Number(fraction) * 10;
  return Number(fraction.slice(0, 3));
};

const looksChinese = text => {
  const simplified = text.match(/[这为发后里个们时会说开关从对过还进无与么]/g)?.length ?? 0;
  const kana = text.match(/[\u3040-\u30ff]/g)?.length ?? 0;
  return simplified > 0 && kana === 0;
};

const parseLrc = input => {
  const raw = [];
  const warnings = [];
  let offsetMs = 0;
  input.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((sourceLine, order) => {
    const line = sourceLine.trim();
    if (!line) return;
    const offset = line.match(/^\[offset:([+-]?\d+)]$/i);
    if (offset) {
      const value = Number(offset[1]);
      if (Math.abs(value) <= 60_000) offsetMs = value;
      return;
    }
    if (/^\[[a-z][a-z0-9_-]*:.*]$/i.test(line)) return;
    const stamps = [...line.matchAll(TIMESTAMP)];
    if (!stamps.length) {
      warnings.push(`第 ${order + 1} 行没有时间戳`);
      return;
    }
    const text = clean(line.replace(TIMESTAMP, ''));
    if (!text) return;
    for (const stamp of stamps) {
      const startMs = Number(stamp[1]) * 60_000 + Number(stamp[2]) * 1_000 + fractionToMs(stamp[3]);
      if (startMs <= 86_400_000) raw.push({ startMs, text, order });
    }
  });
  raw.sort((a, b) => a.startMs - b.startMs || a.order - b.order);
  const grouped = new Map();
  for (const line of raw) {
    const texts = grouped.get(line.startMs) ?? [];
    if (!texts.includes(line.text)) texts.push(line.text);
    grouped.set(line.startMs, texts);
  }
  const starts = [...grouped.keys()].slice(0, MAX_LINES);
  const lines = starts.map((startMs, index) => {
    const texts = grouped.get(startMs);
    const chineseIndex = texts.findIndex(looksChinese);
    const ja = chineseIndex > 0 ? texts.slice(0, chineseIndex).join(' / ') : texts[0];
    const zh = chineseIndex >= 0
      ? texts.slice(chineseIndex).join(' / ')
      : texts.length > 1 ? texts.slice(1).join(' / ') : '';
    return {
      startMs,
      endMs: Math.max(startMs + 250, starts[index + 1] ?? startMs + 8_000),
      ja,
      ...(zh ? { zh } : {}),
    };
  });
  if (raw.length > MAX_LINES) warnings.push(`超过 ${MAX_LINES} 行，已截断`);
  return { lines, offsetMs, warnings };
};

const mergeTranslation = (lines, translated, toleranceMs = 350) => {
  let cursor = 0;
  return lines.map(line => {
    while (
      cursor + 1 < translated.length &&
      Math.abs(translated[cursor + 1].startMs - line.startMs) <=
        Math.abs(translated[cursor].startMs - line.startMs)
    ) cursor += 1;
    const candidate = translated[cursor];
    if (!candidate || Math.abs(candidate.startMs - line.startMs) > toleranceMs) return line;
    return { ...line, zh: candidate.ja };
  });
};

const safeReadLrc = async filename => {
  const info = await stat(filename);
  if (!info.isFile() || info.size <= 0 || info.size > MAX_LRC_BYTES) {
    throw new Error(`歌词文件大小异常：${filename}`);
  }
  return readFile(filename, 'utf8');
};

const fetchLrclib = async (track, identity, identityConfig) => {
  const query = new URLSearchParams({ track_name: identity.lookup.title });
  // 搜索端只给曲名，避免合集/再版专辑名把正确条目预先过滤掉；
  // 艺人、专辑和时长均在本地候选排序中校验，其中艺人是硬门槛。
  let response;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(`https://lrclib.net/api/search?${query}`, {
        headers: { 'User-Agent': 'Oasis personal music garden/1.0 (lyrics import)' },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status !== 429 && response.status < 500) break;
      const retryAfter = Number(response.headers.get('retry-after') ?? 0);
      await wait(Math.min(8_000, Math.max(500 * 2 ** attempt, retryAfter * 1_000)));
    } catch (error) {
      lastError = error;
      if (attempt < 2) await wait(500 * 2 ** attempt);
    }
  }
  if (!response) throw lastError ?? new Error('LRCLIB 请求失败');
  if (!response.ok) throw new Error(`LRCLIB HTTP ${response.status}`);
  const body = await response.text();
  if (body.length > MAX_LRC_BYTES) throw new Error('LRCLIB 响应过大');
  const candidates = JSON.parse(body);
  if (!Array.isArray(candidates)) throw new Error('LRCLIB 响应格式异常');

  const ranked = rankLrclibCandidates(candidates, identity, identityConfig);

  const best = ranked[0];
  // 艺人是硬门槛；时长仍保持宽容，只参与排序。
  // 这能拒绝标题/时长碰巧相同的跨艺人曲目，又不误伤不同母带。
  if (!acceptableLrclibCandidate(best)) {
    if ((process.env.LYRICS_DEBUG || process.argv.includes('--debug')) && best) {
      console.log('候选未通过：', {
        id: track.id,
        candidate: best.candidate.trackName,
        artist: best.candidate.artistName,
        album: best.candidate.albumName,
        score: best.score,
        titleScore: best.titleScore,
        artistScore: best.artistScore,
        albumScore: best.albumScore,
        durationDelta: best.durationDelta,
      });
    }
    return null;
  }
  return {
    lrc: best.candidate.syncedLyrics,
    source: {
      kind: 'lrclib',
      label: 'LRCLIB',
      url: `https://lrclib.net/api/get/${best.candidate.id}`,
      fetchedAt: new Date().toISOString(),
    },
    score: best.score,
    match: {
      trackName: clean(best.candidate.trackName),
      artistName: clean(best.candidate.artistName),
      albumName: clean(best.candidate.albumName),
      durationDelta: best.durationDelta,
      titleScore: best.titleScore,
      artistScore: best.artistScore,
      albumScore: best.albumScore,
    },
  };
};

const firstExisting = async candidates => {
  for (const candidate of candidates.filter(Boolean)) {
    try {
      await access(candidate, fsConstants.R_OK);
      return candidate;
    } catch {
      // 继续寻找
    }
  }
  return '';
};

const loadManifest = async () => {
  const filename = path.join(OUT_DIR, 'manifest.json');
  if (!existsSync(filename)) return { version: 1, generatedAt: '', tracks: {} };
  try {
    const value = JSON.parse(await readFile(filename, 'utf8'));
    return value?.version === 1 && value?.tracks ? value : { version: 1, generatedAt: '', tracks: {} };
  } catch {
    return { version: 1, generatedAt: '', tracks: {} };
  }
};

const assertNoSuspiciousDuplicate = async (document, track, manifest, identities) => {
  const signature = document.lines.map(line => line.ja).join('\n');
  for (const [otherId, entry] of Object.entries(manifest.tracks)) {
    if (otherId === track.id) continue;
    if (entry.kind === 'instrumental' || !entry.key) continue;
    try {
      const other = JSON.parse(await readFile(path.join(OUT_DIR, entry.key), 'utf8'));
      const otherSignature = Array.isArray(other.lines) ? other.lines.map(line => line.ja).join('\n') : '';
      const identity = identities.get(track.id);
      const otherIdentity = identities.get(otherId);
      const declaredReuse =
        identity?.sameLyricsAs === otherId ||
        otherIdentity?.sameLyricsAs === track.id;
      if (
        signature &&
        signature === otherSignature &&
        overlap(track.title, other.title) < 0.65 &&
        !declaredReuse
      ) {
        // 不让导入顺序决定谁留下：冲突组全部从 manifest 隔离，等待人工定夺。
        delete manifest.tracks[otherId];
        throw new Error(`歌词正文与 ${otherId}「${other.title}」完全相同，双方已隔离等待复核`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('双方已隔离')) throw error;
      // 旧清单里的缺失/损坏项由前端边界校验处理，不阻塞当前曲目。
    }
  }
};

const writeJson = async (filename, value) => {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const publishAndVerify = async generatedKeys => {
  await run('rclone', ['copy', OUT_DIR, REMOTE, '--include', '*.json', '--s3-no-check-bucket']);
  for (const key of [...generatedKeys, 'manifest.json']) {
    const url = `${PUBLIC_BASE}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const code = (await capture('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-m', '15', '-I', url])).trim();
    if (code !== '200') throw new Error(`歌词线上校验失败（HTTP ${code}）：${url}`);
  }
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (!options.trackIds.length && !options.category) {
    console.log('用法：npm run lyric -- --track <id> [--lrc <file> | --fetch] [--translation <file>] [--publish]');
    console.log('   或：npm run lyric -- --category Miku --fetch [--publish]');
    process.exit(1);
  }

  const playlist = parsePlaylist(await readFile(PLAYLIST_FILE, 'utf8'));
  const identityConfig = await readIdentityConfig(IDENTITY_CONFIG_FILE);
  const identityList = await buildTrackIdentities(PROJECT_ROOT, playlist, identityConfig);
  const identities = new Map(identityList.map(identity => [identity.id, identity]));
  const selected = playlist.filter(track =>
    options.trackIds.includes(track.id) || (options.category && track.category === options.category));
  const missing = options.trackIds.filter(id => !selected.some(track => track.id === id));
  if (missing.length) throw new Error(`曲库里找不到：${missing.join(', ')}`);
  if (!selected.length) throw new Error('没有匹配的曲目');

  const manifest = await loadManifest();
  const generatedKeys = [];
  const report = { ready: [], instrumental: [], unavailable: [], skipped: [], failed: [] };

  for (const [index, track] of selected.entries()) {
    const label = `[${index + 1}/${selected.length}] ${track.id} ${track.title}`;
    try {
      const identity = identities.get(track.id);
      if (!identity) throw new Error('缺少音频身份信息');
      if (identity.kind === 'instrumental') {
        manifest.tracks[track.id] = { kind: 'instrumental' };
        console.log(`${label} · 纯器乐`);
        report.instrumental.push(track.id);
        continue;
      }
      const key = `${track.id}.json`;
      if (
        !options.force &&
        manifest.tracks[track.id]?.kind !== 'instrumental' &&
        manifest.tracks[track.id] &&
        existsSync(path.join(OUT_DIR, key))
      ) {
        console.log(`${label} · 已存在，跳过`);
        report.skipped.push(track.id);
        continue;
      }

      const audioLocal = path.join(PROJECT_ROOT, 'public', track.url.replace(/^\//, ''));
      const sidecar = audioLocal.replace(/\.[^.]+$/, '.lrc');
      const sourceFolder = path.join(SOURCE_DIR, track.id);
      const archivedLrc = path.join(sourceFolder, 'original.lrc');
      const localLrc = await firstExisting([
        options.lrc ? path.resolve(options.lrc.replace(/^~/, process.env.HOME ?? '~')) : '',
        sidecar,
        options.refresh ? '' : archivedLrc,
      ]);

      let originalText = '';
      let source = null;
      if (localLrc) {
        originalText = await safeReadLrc(localLrc);
        source = { kind: 'local', label: '本地 LRC' };
        if (localLrc === archivedLrc) {
          try {
            const archivedMeta = JSON.parse(await readFile(path.join(sourceFolder, 'meta.json'), 'utf8'));
            if (archivedMeta?.source?.kind === 'lrclib') source = archivedMeta.source;
          } catch {
            // 旧归档没有元数据时才按本地 LRC 处理。
          }
        }
        console.log(`${label} · 本地歌词`);
      } else if (options.fetch) {
        const found = await fetchLrclib(track, identity, identityConfig);
        if (found) {
          originalText = found.lrc;
          source = found.source;
          console.log(
            `${label} · LRCLIB 匹配 ${(found.score * 100).toFixed(0)}%` +
            ` · ${found.match.artistName || '未知艺人'}` +
            `${found.match.durationDelta === null ? '' : ` · Δ${found.match.durationDelta.toFixed(1)}s`}`,
          );
        }
      }

      if (!originalText || !source) {
        console.log(`${label} · 暂无可靠同步歌词`);
        if (options.force) delete manifest.tracks[track.id];
        report.unavailable.push(track.id);
        continue;
      }

      const parsed = parseLrc(originalText);
      if (parsed.lines.length < 2) throw new Error('有效同步歌词不足 2 行');

      const translationPath = await firstExisting([
        options.translation ? path.resolve(options.translation.replace(/^~/, process.env.HOME ?? '~')) : '',
        path.join(sourceFolder, 'translation.zh.lrc'),
      ]);
      let lines = parsed.lines;
      let translationStatus = lines.some(line => line.zh) ? 'reviewed' : 'none';
      if (translationPath) {
        const translated = parseLrc(await safeReadLrc(translationPath));
        lines = mergeTranslation(lines, translated.lines);
        const matched = lines.filter(line => line.zh).length;
        const coverage = matched / lines.length;
        if (coverage < 0.7) throw new Error(`中文译词时间轴覆盖率仅 ${(coverage * 100).toFixed(0)}%`);
        translationStatus = options.translationStatus;
      }

      const document = {
        version: 1,
        trackId: track.id,
        title: track.title,
        artist: track.artist,
        language: /[\u3040-\u30ff]/.test(lines.map(line => line.ja).join('')) ? 'ja' : 'und',
        offsetMs: parsed.offsetMs + options.offsetMs,
        translationStatus,
        source,
        lines,
      };
      await assertNoSuspiciousDuplicate(document, track, manifest, identities);

      if (!options.dry) {
        await mkdir(sourceFolder, { recursive: true });
        if (!existsSync(path.join(sourceFolder, 'original.lrc'))) {
          await writeFile(path.join(sourceFolder, 'original.lrc'), originalText, 'utf8');
        }
        await writeJson(path.join(sourceFolder, 'meta.json'), {
          trackId: track.id,
          source,
          warnings: parsed.warnings.slice(0, 100),
          translationStatus,
        });
        await writeJson(path.join(OUT_DIR, key), document);
        await writeJson(path.join(DEV_DIR, key), document);
      }

      manifest.tracks[track.id] = { kind: 'lyrics', key, translationStatus };
      generatedKeys.push(key);
      report.ready.push(track.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`${label} · 失败：${message}`);
      if (options.force) delete manifest.tracks[track.id];
      report.failed.push({ id: track.id, message });
    }
  }

  manifest.generatedAt = new Date().toISOString();
  manifest.tracks = Object.fromEntries(Object.entries(manifest.tracks).sort(([a], [b]) => a.localeCompare(b)));
  if (!options.dry) {
    await writeJson(path.join(OUT_DIR, 'manifest.json'), manifest);
    await writeJson(path.join(DEV_DIR, 'manifest.json'), manifest);
  }

  if (options.publish && !options.dry && Object.keys(manifest.tracks).length) {
    const publishedKeys = [...new Set(
      Object.values(manifest.tracks)
        .map(entry => entry.key)
        .filter(Boolean),
    )];
    await publishAndVerify(publishedKeys);
    console.log(`\n☁️  已发布并校验 ${publishedKeys.length} 首歌词`);
  }

  console.log('\n' + '─'.repeat(64));
  console.log(
    `可用 ${report.ready.length} · 已有 ${report.skipped.length} · 纯器乐 ${report.instrumental.length}` +
    ` · 暂缺 ${report.unavailable.length} · 失败 ${report.failed.length}`,
  );
  if (report.unavailable.length) console.log(`暂缺：${report.unavailable.join(', ')}`);
  if (report.failed.length) report.failed.forEach(item => console.log(`失败：${item.id} ${item.message}`));
  if (options.dry) console.log('演练模式：没有写文件或上传。');
  else if (!options.publish && report.ready.length) console.log('本地预览已就绪；确认后加 --publish 发布到 R2。');
};

main().catch(error => {
  console.error(`\n❌ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
