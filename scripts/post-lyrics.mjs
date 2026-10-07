#!/usr/bin/env node
//
// 🌙 歌词入库：本地 LRC 优先，缺失时可从 LRCLIB 或网易云获取同步歌词
//    → 清洗 / 校验 / 合并中文译词 → 生成版本化 JSON + manifest
//    → 可选上传到 oasis-audio/lyrics 并逐一校验。
//
// 用法：
//   npm run lyric -- --track m_06 --lrc ~/Downloads/メルト.lrc
//   npm run lyric -- --track m_06 --fetch
//   npm run lyric -- --category Miku --fetch
//   npm run lyric -- --category Miku --fetch --netease
//   npm run lyric -- --category Miku --fetch --publish
//
// 中文译词放在 lyrics-src/<trackId>/translation.zh.lrc，时间轴与日文允许 ±350ms。
// --netease 拉到的官方译文只落在 translation.netease.lrc，且无论 --reviewed 与否
// 都只标记 machine（待校）——reviewed 只能来自 translate-lyrics.mjs --import-reviewed
// 这条人工闸门，见 docs/lyrics-pipeline.md。
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
import { clean, mergeTranslation, parseLrc } from './lib/lrc-parse.mjs';
import {
  acceptableNeteaseCandidate,
  fetchNeteaseLyric,
  rankNeteaseCandidates,
  resolveNeteaseOverrideId,
  searchNetease,
} from './lib/netease-lyrics.mjs';
import { GATE_LABELS, checkLyrics, creditsFromLines, stripHeaderLines } from './lib/lyrics-gate.mjs';
import { extractInlineRuby, lineKey, loadTokenizer, readingForLine } from './lib/kana.mjs';
import { pairLyrics, parseLyricResponse } from './lib/sources/netease.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PLAYLIST_FILE = path.join(PROJECT_ROOT, 'src/hooks/useSoundscape.ts');
const IDENTITY_CONFIG_FILE = path.join(PROJECT_ROOT, 'lyrics-config/overrides.json');
const SOURCE_DIR = path.join(PROJECT_ROOT, 'lyrics-src');
const OUT_DIR = path.join(PROJECT_ROOT, 'dist-lyrics');
const DEV_DIR = path.join(PROJECT_ROOT, 'public/lyrics');
const REMOTE = 'oasis-r2:oasis-audio/lyrics';
const PUBLIC_BASE = 'https://audio.boblee.dev/lyrics';
const MAX_LRC_BYTES = 2 * 1024 * 1024;
const PROFILE_DIR = path.join(PROJECT_ROOT, 'music-data/tracks');
// 五道闸里现在就拒绝生成的几道（lib/lyrics-gate.mjs）。译文与读音要等工坊（P3）
// 和读音层（P4）就位后再加进来，否则旧曲目一首都发不出去；现在只打印警告。
const ENFORCED_GATES = ['version', 'clean'];
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

const parseArgs = argv => {
  const options = {
    trackIds: [],
    category: '',
    lrc: '',
    translation: '',
    translator: '',
    fetch: false,
    netease: false,
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
    else if (arg === '--translator') options.translator = argv[++i] ?? '';
    else if (arg === '--offset') options.offsetMs = Number(argv[++i] ?? 0);
    else if (arg === '--machine') options.translationStatus = 'machine';
    else if (arg === '--reviewed') options.translationStatus = 'reviewed';
    else if (arg === '--fetch') options.fetch = true;
    else if (arg === '--netease') options.netease = true;
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

/**
 * 网易云原文与官方译文；identityConfig.tracks[id].neteaseId 存在时跳过搜索，直接拉取。
 * 搜索候选比 LRCLIB 噪音大得多（翻唱/伴奏/live 同名曲极多），门槛也更严——见
 * lib/netease-lyrics.mjs 的 acceptableNeteaseCandidate。
 */
const fetchNetease = async (track, identity, identityConfig, { debug = false } = {}) => {
  const overrideId = resolveNeteaseOverrideId(track.id, identityConfig);
  let songId = overrideId;
  let matchInfo = null;
  if (!songId) {
    const candidates = await searchNetease(identity);
    const ranked = rankNeteaseCandidates(candidates, identity, identityConfig);
    const best = ranked[0];
    if (!acceptableNeteaseCandidate(best)) {
      if ((process.env.LYRICS_DEBUG || debug) && best) {
        console.log('网易候选未通过：', {
          id: track.id,
          candidate: best.candidate.name,
          artists: best.candidate.artistNames.join('/'),
          album: best.candidate.albumName,
          score: best.score,
          titleScore: best.titleScore,
          artistScore: best.artistScore,
          durationDelta: best.durationDelta,
        });
      }
      return null;
    }
    songId = best.candidate.id;
    matchInfo = best;
  }
  const { lrc, tlyric } = await fetchNeteaseLyric(songId);
  return {
    lrc,
    tlyricRaw: tlyric,
    songId,
    matchInfo,
    source: {
      kind: 'netease',
      label: '网易云音乐',
      url: `https://music.163.com/#/song?id=${songId}`,
      fetchedAt: new Date().toISOString(),
    },
  };
};

/** 网易云成对版本里的罗马音，按行文本对号（LRCLIB 版本与网易云版本的同一句也能借到）。 */
const neteaseRomaMap = async trackId => {
  const map = new Map();
  try {
    const profile = JSON.parse(await readFile(path.join(PROFILE_DIR, `${trackId}.json`), 'utf8'));
    if (!profile.ncmId) return map;
    const raw = JSON.parse(await readFile(path.join(SOURCE_DIR, trackId, 'ncm', `lyric.${profile.ncmId}.json`), 'utf8'));
    for (const line of pairLyrics(parseLyricResponse(raw))) {
      const key = lineKey(line.ja);
      if (line.roma && key && !map.has(key)) map.set(key, line.roma);
    }
  } catch {
    // 没有档案或缓存：只用词典读音
  }
  return map;
};

const attachReadings = async (trackId, document, overrides = {}) => {
  const tokenizer = await loadTokenizer();
  const romaMap = await neteaseRomaMap(trackId);
  const report = { trackId, generatedAt: new Date().toISOString(), tokenizer: Boolean(tokenizer), lines: [], conflicts: [] };
  document.lines = document.lines.map((line, index) => {
    const roma = romaMap.get(lineKey(line.ja)) ?? '';
    const result = readingForLine(line, roma, tokenizer, overrides);
    report.lines.push({ index, source: result.source, ...(roma ? { roma } : {}) });
    for (const conflict of result.conflicts) report.conflicts.push({ index, ja: line.ja, ...conflict });
    const { kana: _previous, ...rest } = line;
    return result.kana.length ? { ...rest, kana: result.kana } : rest;
  });
  return report;
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
    console.log('用法：npm run lyric -- --track <id> [--lrc <file> | --fetch | --netease] [--translation <file>] [--publish]');
    console.log('   或：npm run lyric -- --category Miku --fetch --netease [--publish]');
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
      let neteaseTlyricRaw = '';
      if (localLrc) {
        originalText = await safeReadLrc(localLrc);
        source = { kind: 'local', label: '本地 LRC' };
        if (localLrc === archivedLrc) {
          try {
            const archivedMeta = JSON.parse(await readFile(path.join(sourceFolder, 'meta.json'), 'utf8'));
            // 归档的原文记得自己从哪来（LRCLIB / 工坊换上的网易云成对版本），重建时沿用。
            if (['lrclib', 'netease'].includes(archivedMeta?.source?.kind)) source = archivedMeta.source;
            if (archivedMeta?.source?.label === '工坊打点') source = archivedMeta.source;
          } catch {
            // 旧归档没有元数据时才按本地 LRC 处理。
          }
        }
        console.log(`${label} · 本地歌词`);
      } else {
        if (options.fetch) {
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
        if (!originalText && options.netease) {
          const found = await fetchNetease(track, identity, identityConfig, { debug: options.debug });
          if (found) {
            originalText = found.lrc;
            source = found.source;
            neteaseTlyricRaw = found.tlyricRaw;
            const matchLabel = found.matchInfo
              ? `匹配 ${(found.matchInfo.score * 100).toFixed(0)}%`
              : '人工指定 neteaseId';
            console.log(`${label} · 网易云原文 ${matchLabel}${found.tlyricRaw ? '（含官方译文）' : ''}`);
          }
        }
      }

      if (!originalText || !source) {
        console.log(`${label} · 暂无可靠同步歌词`);
        if (options.force) delete manifest.tracks[track.id];
        report.unavailable.push(track.id);
        continue;
      }

      const parsed = parseLrc(originalText);
      // 「作词 : …」「曲名 - 艺人」这类歌词头不是正文：解析进 credits，再从行里拿掉。
      const credits = creditsFromLines(parsed.lines);
      parsed.lines = stripHeaderLines(parsed.lines, track.title).map(line => {
        // 「空（そら）」这类行内注音：正文去掉括号，读音进 kana（读音层的第一来源）
        const { text, ruby } = extractInlineRuby(line.ja);
        return ruby.length ? { ...line, ja: text, kana: ruby } : line;
      });
      if (parsed.lines.length < 2) throw new Error('有效同步歌词不足 2 行');

      const translationPath = await firstExisting([
        options.translation ? path.resolve(options.translation.replace(/^~/, process.env.HOME ?? '~')) : '',
        path.join(sourceFolder, 'translation.zh.lrc'),
      ]);
      const neteaseCache = path.join(sourceFolder, 'translation.netease.lrc');
      let translatedText = '';
      let usedNeteaseTranslation = false;
      if (translationPath) {
        translatedText = await safeReadLrc(translationPath);
      } else if (neteaseTlyricRaw) {
        translatedText = neteaseTlyricRaw;
        usedNeteaseTranslation = true;
      } else if (!options.refresh && existsSync(neteaseCache)) {
        translatedText = await safeReadLrc(neteaseCache);
        usedNeteaseTranslation = true;
      }

      let lines = parsed.lines;
      let translationStatus = lines.some(line => line.zh) ? 'reviewed' : 'none';
      let translator = options.translator.trim().slice(0, 80);
      // 重建时沿用上一次的译者署名（如「网易云」），不因为没传 --translator 就丢掉出处
      if (!translator && !options.refresh) {
        try {
          const previousMeta = JSON.parse(await readFile(path.join(sourceFolder, 'meta.json'), 'utf8'));
          if (typeof previousMeta.translator === 'string') translator = previousMeta.translator.trim().slice(0, 80);
        } catch {
          // 第一次导入没有 meta.json
        }
      }
      if (translatedText) {
        const translated = parseLrc(translatedText);
        const merged = mergeTranslation(lines, translated.lines);
        const matched = merged.filter(line => line.zh).length;
        const coverage = parsed.lines.length ? matched / parsed.lines.length : 0;
        if (usedNeteaseTranslation) {
          // 网易云译文未经站主逐行复核，无论传不传 --reviewed 都只能是「待校」，
          // 真正的 reviewed 只能来自 translate-lyrics.mjs --import-reviewed 这条人工闸门。
          if (coverage >= 0.7) {
            lines = merged;
            translationStatus = 'machine';
            if (!translator) translator = '网易云';
          } else {
            console.log(`${label} · 网易云译文覆盖率仅 ${(coverage * 100).toFixed(0)}%，暂不采用`);
          }
        } else {
          if (coverage < 0.7) throw new Error(`中文译词时间轴覆盖率仅 ${(coverage * 100).toFixed(0)}%`);
          lines = merged;
          translationStatus = options.translationStatus;
          if (translationStatus === 'reviewed' && !translator) {
            try {
              const reviewedMeta = JSON.parse(
                await readFile(path.join(sourceFolder, 'translation.reviewed.json'), 'utf8'),
              );
              if (typeof reviewedMeta.translator === 'string' && reviewedMeta.translator.trim()) {
                translator = reviewedMeta.translator.trim().slice(0, 80);
              }
            } catch {
              // 没有审校元信息（比如手动传 --translation）时不附署名。
            }
          }
        }
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
        ...(translator ? { translator } : {}),
        lines,
      };
      await assertNoSuspiciousDuplicate(document, track, manifest, identities);

      let outroMs = 0;
      let readingOverrides = {};
      try {
        const profile = JSON.parse(await readFile(path.join(PROFILE_DIR, `${track.id}.json`), 'utf8'));
        outroMs = Number(profile?.lyrics?.outroMs ?? 0) || 0;
        if (profile?.lyrics?.readings && typeof profile.lyrics.readings === 'object') readingOverrides = profile.lyrics.readings;
      } catch {
        // 还没有曲目档案时按默认 45s 尾奏判断。
      }
      // 读音层：你定的读法 > 行内注音 > 网易云罗马音 > kuromoji；冲突记到 lyrics-src/<id>/kana.json 给工坊
      const kanaReport = await attachReadings(track.id, document, readingOverrides);
      if (kanaReport.conflicts.length) {
        console.log(`${label} · 读音冲突 ${kanaReport.conflicts.length} 处（工坊「歌词」页签可见）`);
      }
      const gate = checkLyrics(document, { durationMs: identity.tags.durationMs, outroMs });
      const refused = ENFORCED_GATES.filter(name => !gate.gates[name].pass);
      if (refused.length) {
        const error = new Error(refused.map(name => `${GATE_LABELS[name]}闸：${gate.gates[name].detail}`).join('；'));
        // 新生成的版本过不了闸，不等于旧版本也该下线：保留 manifest 里已有的那份
        error.keepExisting = true;
        throw error;
      }
      const warned = gate.blocked.filter(name => !ENFORCED_GATES.includes(name));
      if (warned.length) {
        console.log(`${label} · 待补：${warned.map(name => `${GATE_LABELS[name]}（${gate.gates[name].detail}）`).join('、')}`);
      }

      if (!options.dry) {
        await mkdir(sourceFolder, { recursive: true });
        if (!existsSync(path.join(sourceFolder, 'original.lrc'))) {
          await writeFile(path.join(sourceFolder, 'original.lrc'), originalText, 'utf8');
        }
        if (neteaseTlyricRaw && (options.refresh || !existsSync(neteaseCache))) {
          await writeFile(neteaseCache, neteaseTlyricRaw, 'utf8');
        }
        await writeJson(path.join(sourceFolder, 'meta.json'), {
          trackId: track.id,
          source,
          warnings: parsed.warnings.slice(0, 100),
          ...(Object.keys(credits).length ? { credits } : {}),
          translationStatus,
          ...(translator ? { translator } : {}),
        });
        await writeJson(path.join(sourceFolder, 'kana.json'), kanaReport);
        await writeJson(path.join(OUT_DIR, key), document);
        await writeJson(path.join(DEV_DIR, key), document);
      }


      manifest.tracks[track.id] = { kind: 'lyrics', key, translationStatus };
      generatedKeys.push(key);
      report.ready.push(track.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`${label} · 失败：${message}`);
      if (options.force && !error?.keepExisting) delete manifest.tracks[track.id];
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
