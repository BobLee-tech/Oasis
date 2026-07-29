#!/usr/bin/env node
//
// 🎋 网易云译文导入：为已经有原文（LRCLIB/本地）的曲目拉一份网易云官方译文，
//    用文本对齐把它的时间戳换算到本地轴上，直接写进
//    lyrics-src/<id>/translation.zh.lrc 并重新发布——译文状态永远是
//    machine（待校），不会因为这一步就变成 reviewed。真正校对、逐行修改，
//    用 lyric:review 生成的页面手改后下载，走 --import-reviewed 那条人工闸门。
//
//    默认不覆盖已经存在的 translation.zh.lrc（保护你手改过的内容）；
//    要用网易云译文替换已有内容（比如某批从未被真正审校过的旧译文），加 --force。
//
// 用法：
//   npm run lyric:netease -- --track y_18_02
//   npm run lyric:netease -- --category Miku
//   npm run lyric:netease -- --category Yorushika --force   # 替换已有译文
//   npm run lyric:netease -- --track y_18_02 --refresh       # 重新向网易云查询
//
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  buildTrackIdentities,
  parsePlaylist,
  readIdentityConfig,
} from './lib/track-identity.mjs';
import { mergeTranslation, parseLrc, stampLrc } from './lib/lrc-parse.mjs';
import {
  acceptableNeteaseCandidate,
  fetchNeteaseLyric,
  rankNeteaseCandidates,
  resolveNeteaseOverrideId,
  searchNetease,
} from './lib/netease-lyrics.mjs';
import { alignNeteaseTranslation } from './lib/lyrics-transplant.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PLAYLIST_FILE = path.join(PROJECT_ROOT, 'src/hooks/useSoundscape.ts');
const IDENTITY_CONFIG_FILE = path.join(PROJECT_ROOT, 'lyrics-config/overrides.json');
const OUT_DIR = path.join(PROJECT_ROOT, 'dist-lyrics');
const SOURCE_DIR = path.join(PROJECT_ROOT, 'lyrics-src');
// 同一次网易云抓取里，原文与官方译文本就来自同一份 LRC 的两个区块，容差可以给宽一点。
const NETEASE_INTERNAL_TOLERANCE_MS = 600;
// 必须和 post-lyrics.mjs 里的合并覆盖率门槛一致——低于这个值它会直接拒绝合并，
// 这里提前挡住，避免明明知道会被拒绝还先把 translation.zh.lrc 覆盖掉。
const PUBLISH_COVERAGE_THRESHOLD = 0.7;

const parseArgs = argv => {
  const options = { trackIds: [], category: '', refresh: false, force: false, debug: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--track') options.trackIds.push(argv[++index] ?? '');
    else if (arg === '--category') options.category = argv[++index] ?? '';
    else if (arg === '--refresh') options.refresh = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--debug') options.debug = true;
    else throw new Error(`未知参数：${arg}`);
  }
  if (!options.trackIds.length && !options.category) {
    throw new Error('请用 --track 或 --category 选择曲目');
  }
  return options;
};

const readJson = async filename => JSON.parse(await readFile(filename, 'utf8'));

const writeJson = async (filename, value) => {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const loadManifest = async () => {
  const filename = path.join(OUT_DIR, 'manifest.json');
  if (!existsSync(filename)) return { tracks: {} };
  try {
    return await readJson(filename);
  } catch {
    return { tracks: {} };
  }
};

const resolveNeteaseSongId = async (track, identity, identityConfig, debug) => {
  const overrideId = resolveNeteaseOverrideId(track.id, identityConfig);
  if (overrideId) return { songId: overrideId, matchInfo: null };
  const candidates = await searchNetease(identity);
  const ranked = rankNeteaseCandidates(candidates, identity, identityConfig);
  const best = ranked[0];
  if (!acceptableNeteaseCandidate(best)) {
    if ((process.env.LYRICS_DEBUG || debug) && best) {
      console.log('网易候选未通过：', {
        id: track.id,
        candidate: best.candidate.name,
        artists: best.candidate.artistNames.join('/'),
        score: best.score,
        titleScore: best.titleScore,
        artistScore: best.artistScore,
        durationDelta: best.durationDelta,
      });
    }
    return null;
  }
  return { songId: best.candidate.id, matchInfo: best };
};

// 每首歌用 --machine 重新跑一次 post-lyrics.mjs：把刚写好的 translation.zh.lrc
// 合并进 dist-lyrics 并republish。永远不传 --reviewed——网易云译文未经站主
// 逐行看过，这条命令本身就不该有让它变成 reviewed 的能力。
//
// post-lyrics.mjs 对单曲调用即使内部失败（比如合并覆盖率不足 70%）也会以退出码 0
// 结束——它是为批量场景设计的，个别曲目失败不该中断整批。所以这里不能只看退出码，
// 必须搜子进程自己打印的「失败：」来判断这一次调用到底有没有真的把内容换掉。
const republish = trackId => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [
    path.join(PROJECT_ROOT, 'scripts/post-lyrics.mjs'),
    '--track', trackId,
    '--force',
    '--machine',
    '--translator', '网易云',
  ], { cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk); });
  child.stderr.on('data', chunk => { output += chunk; process.stderr.write(chunk); });
  child.on('error', reject);
  child.on('close', code => {
    if (code !== 0) return reject(new Error(`发布失败，退出码 ${code}`));
    const failureLine = output.split('\n').find(line => line.includes(' · 失败：'));
    if (failureLine) return reject(new Error(failureLine.trim()));
    resolve();
  });
});

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const playlist = parsePlaylist(await readFile(PLAYLIST_FILE, 'utf8'));
  const identityConfig = await readIdentityConfig(IDENTITY_CONFIG_FILE);
  const identityList = await buildTrackIdentities(PROJECT_ROOT, playlist, identityConfig);
  const identities = new Map(identityList.map(identity => [identity.id, identity]));
  const manifest = await loadManifest();
  const selected = playlist.filter(track =>
    options.trackIds.includes(track.id) || (options.category && track.category === options.category));
  const missing = options.trackIds.filter(id => !selected.some(track => track.id === id));
  if (missing.length) throw new Error(`曲库里找不到：${missing.join(', ')}`);
  if (!selected.length) throw new Error('没有匹配的曲目');

  const report = { published: [], keptExisting: [], lowCoverage: [], unavailable: [], skipped: [], failed: [] };

  for (const [index, track] of selected.entries()) {
    const label = `[${index + 1}/${selected.length}] ${track.id} ${track.title}`;
    try {
      if (manifest.tracks?.[track.id]?.kind === 'instrumental') {
        console.log(`${label} · 纯器乐，跳过`);
        report.skipped.push(track.id);
        continue;
      }
      const documentFile = path.join(OUT_DIR, `${track.id}.json`);
      if (!existsSync(documentFile)) {
        console.log(`${label} · 本地还没有原文，先跑 lyric --fetch`);
        report.skipped.push(track.id);
        continue;
      }
      const sourceFolder = path.join(SOURCE_DIR, track.id);
      const zhLrcFile = path.join(sourceFolder, 'translation.zh.lrc');
      const alreadyHasTranslation = existsSync(zhLrcFile);
      if (alreadyHasTranslation && !options.force) {
        console.log(`${label} · 已有译文，跳过（--force 用网易云替换）`);
        report.keptExisting.push(track.id);
        continue;
      }

      const cacheFile = path.join(sourceFolder, 'translation.netease.lrc');
      if (!options.refresh && existsSync(cacheFile)) {
        console.log(`${label} · 沿用已抓取的网易云原始数据（--refresh 重新查询）`);
      }

      const identity = identities.get(track.id);
      if (!identity) throw new Error('缺少音频身份信息');

      let lrcText;
      let matchLabel;
      if (!options.refresh && existsSync(cacheFile)) {
        lrcText = await readFile(cacheFile, 'utf8');
        matchLabel = '（复用缓存）';
      } else {
        const resolved = await resolveNeteaseSongId(track, identity, identityConfig, options.debug);
        if (!resolved) {
          console.log(`${label} · 网易云没有可靠匹配`);
          report.unavailable.push(track.id);
          continue;
        }

        const { lrc, tlyric } = await fetchNeteaseLyric(resolved.songId);
        if (!tlyric) {
          console.log(`${label} · 网易云该曲目没有官方译文`);
          report.unavailable.push(track.id);
          continue;
        }

        const neteaseOriginal = parseLrc(lrc).lines;
        const neteaseTranslated = parseLrc(tlyric).lines;
        const neteaseLines = mergeTranslation(neteaseOriginal, neteaseTranslated, NETEASE_INTERNAL_TOLERANCE_MS)
          .filter(line => line.zh);
        if (!neteaseLines.length) {
          console.log(`${label} · 网易云原文与译文对不上时间轴，放弃`);
          report.unavailable.push(track.id);
          continue;
        }

        const document = await readJson(documentFile);
        const sourceLines = document.lines.map(({ startMs, endMs, ja }) => ({ startMs, endMs, ja }));
        const aligned = alignNeteaseTranslation(sourceLines, neteaseLines);

        // 覆盖率不够高就不碰 translation.zh.lrc——post-lyrics.mjs 的合并门槛也是 70%，
        // 提前在这里挡住，好过先覆盖掉已有译文、republish 时才被拒绝。
        // 仍然把网易云原始数据存起来，供之后人工对齐或换个 neteaseId 覆盖再试。
        await mkdir(sourceFolder, { recursive: true });
        await writeFile(cacheFile, aligned.lines
          .filter(line => line.zh)
          .map(line => `${stampLrc(line.startMs)}${line.zh}`)
          .join('\n') + '\n', 'utf8');
        await writeJson(path.join(sourceFolder, 'netease.meta.json'), {
          trackId: track.id,
          songId: resolved.songId,
          matchInfo: resolved.matchInfo
            ? {
                score: resolved.matchInfo.score,
                titleScore: resolved.matchInfo.titleScore,
                artistScore: resolved.matchInfo.artistScore,
                durationDelta: resolved.matchInfo.durationDelta,
              }
            : { manual: true },
          fetchedAt: new Date().toISOString(),
          coverage: aligned.coverage,
          matchedCount: aligned.matchedCount,
          totalSource: aligned.totalSource,
          totalNetease: aligned.totalNetease,
        });

        if (aligned.coverage < PUBLISH_COVERAGE_THRESHOLD) {
          console.log(
            `${label} · 对齐覆盖率仅 ${(aligned.coverage * 100).toFixed(0)}%` +
            `（${aligned.matchedCount}/${aligned.totalSource} 行），低于发布门槛 70%，未采用` +
            `（保留原有译文；原始数据已存到 lyrics-src/${track.id}/ 供人工核对）`,
          );
          report.lowCoverage.push({ id: track.id, coverage: aligned.coverage });
          continue;
        }

        lrcText = aligned.lines
          .filter(line => line.zh)
          .map(line => `${stampLrc(line.startMs)}${line.zh}`)
          .join('\n') + '\n';
        matchLabel = `对齐覆盖率 ${(aligned.coverage * 100).toFixed(0)}%（${aligned.matchedCount}/${aligned.totalSource} 行）· song ${resolved.songId}`;
      }

      // 写完 zh.lrc 才知道 post-lyrics.mjs 会不会接受；先备份，republish 失败就原样恢复，
      // 不留一个被拒绝、内容却已经换掉的 zh.lrc 在那里。
      const previousZhLrc = alreadyHasTranslation ? await readFile(zhLrcFile, 'utf8') : null;
      await writeFile(zhLrcFile, lrcText, 'utf8');
      console.log(`${label} · ${matchLabel}`);
      try {
        await republish(track.id);
        report.published.push(track.id);
      } catch (publishError) {
        if (previousZhLrc === null) await rm(zhLrcFile, { force: true });
        else await writeFile(zhLrcFile, previousZhLrc, 'utf8');
        throw publishError;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`${label} · 失败：${message}`);
      report.failed.push({ id: track.id, message });
    }
  }

  console.log('\n' + '─'.repeat(64));
  console.log(
    `已发布 ${report.published.length} · 保留已有译文 ${report.keptExisting.length}` +
    ` · 覆盖率不足 ${report.lowCoverage.length} · 跳过 ${report.skipped.length}` +
    ` · 暂无 ${report.unavailable.length} · 失败 ${report.failed.length}`,
  );
  if (report.lowCoverage.length) {
    report.lowCoverage
      .sort((a, b) => a.coverage - b.coverage)
      .forEach(item => console.log(`覆盖率不足：${item.id}（${(item.coverage * 100).toFixed(0)}%）`));
  }
  if (report.unavailable.length) console.log(`暂无：${report.unavailable.join(', ')}`);
  if (report.failed.length) report.failed.forEach(item => console.log(`失败：${item.id} ${item.message}`));
  if (report.published.length) console.log('已写入 translation.zh.lrc 并以 machine（待校）状态重新发布本地预览。');
};

main().catch(error => {
  console.error(`\n❌ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
