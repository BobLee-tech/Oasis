#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { listAlbums } from './lib/track-profile.mjs';
import { spawn } from 'node:child_process';
import {
  buildTrackIdentities,
  parsePlaylist,
  readIdentityConfig,
} from './lib/track-identity.mjs';
import { sourceHashOf, stampLrc } from './lib/lrc-parse.mjs';
import { anthropicMessage, extractJson } from './lib/anthropic.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PLAYLIST_FILE = path.join(PROJECT_ROOT, 'src/hooks/useSoundscape.ts');
const IDENTITY_CONFIG_FILE = path.join(PROJECT_ROOT, 'lyrics-config/overrides.json');
const GLOSSARY_FILE = path.join(PROJECT_ROOT, 'lyrics-config/glossary.json');
const OUT_DIR = path.join(PROJECT_ROOT, 'dist-lyrics');
const SOURCE_DIR = path.join(PROJECT_ROOT, 'lyrics-src');

const parseArgs = argv => {
  const options = {
    trackIds: [],
    category: '',
    album: '',
    force: false,
    importReviewed: '',
    reuseReviewedFrom: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--track') options.trackIds.push(argv[++index] ?? '');
    else if (arg === '--category') options.category = argv[++index] ?? '';
    else if (arg === '--album') options.album = argv[++index] ?? '';
    else if (arg === '--force') options.force = true;
    else if (arg === '--import-reviewed') options.importReviewed = argv[++index] ?? '';
    else if (arg === '--reuse-reviewed-from') options.reuseReviewedFrom = argv[++index] ?? '';
    else throw new Error(`未知参数：${arg}`);
  }
  if (!options.trackIds.length && !options.category && !options.album) {
    throw new Error('请用 --track、--category 或 --album 选择曲目');
  }
  if (options.importReviewed && options.trackIds.length !== 1) {
    throw new Error('--import-reviewed 必须与单个 --track 一起使用');
  }
  if (options.reuseReviewedFrom && options.trackIds.length !== 1) {
    throw new Error('--reuse-reviewed-from 必须与单个 --track 一起使用');
  }
  if (options.importReviewed && options.reuseReviewedFrom) {
    throw new Error('--import-reviewed 与 --reuse-reviewed-from 不能同时使用');
  }
  return options;
};

const readJson = async filename => JSON.parse(await readFile(filename, 'utf8'));

const writeJson = async (filename, value) => {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const writeTranslationLrc = async (trackId, sourceLines, translatedLines) => {
  const text = sourceLines
    .map((line, index) => `${stampLrc(line.startMs)}${translatedLines[index].zh.trim()}`)
    .join('\n');
  await writeFile(path.join(SOURCE_DIR, trackId, 'translation.zh.lrc'), `${text}\n`, 'utf8');
};

const assertTranslation = (sourceLines, translatedLines) => {
  if (!Array.isArray(translatedLines) || translatedLines.length !== sourceLines.length) {
    throw new Error(`译文行数 ${translatedLines?.length ?? 0} 与原文 ${sourceLines.length} 不一致`);
  }
  return translatedLines.map((line, index) => {
    if (Number(line?.index) !== index + 1) throw new Error(`译文行号在 ${index + 1} 处不连续`);
    const zh = String(line?.zh ?? '').replace(/\s+/g, ' ').trim();
    if (!zh) throw new Error(`译文第 ${index + 1} 行为空`);
    if (zh.length > 500) throw new Error(`译文第 ${index + 1} 行过长`);
    return {
      index: index + 1,
      zh,
      ...(line?.ambiguity ? { ambiguity: String(line.ambiguity).slice(0, 500) } : {}),
    };
  });
};

const translatorSystem = `
你是日中歌词文学翻译与审校专家。目标是为私人音乐花园制作阅读型逐行译文，不做可演唱填词。
硬约束：
1. 忠实语义，保留歧义，中文自然；不押韵、不解释、不美化、不添加原文没有的情绪或意象。
2. 原文与上下文仍未明确主语时，使用自然的中文无主句，不擅自决定为“我”或“你”。
3. 若专辑语境已明确说话人，可以谨慎补足中文必需成分，并在 ambiguity 中说明。
4. 不合并、不拆分、不遗漏任何行；专名严格遵守术语表。
5. 只输出 JSON：{"lines":[{"index":1,"zh":"译文","ambiguity":"可选审校提示"}]}。
`.trim();

const criticSystem = `
你是日中歌词审校者。只检查给定初译，不整体重写。
检查主语、否定、条件、时态、一词多义、专名、重复句一致性、过度解释和中文可读性。
只输出需要修改的具体补丁 JSON：
{"patches":[{"index":1,"replacement":"替换译文","reason":"简短原因"}]}。
没有问题则输出 {"patches":[]}。
`.trim();

// 专辑叙事住在 music-data/albums/<slug>.json（曲目档案的专辑层，docs/music-design.md A3.1），
// 按文件里的 album 字段对号，不靠从专辑名猜 slug。
const loadAlbumContext = async album => {
  if (!album) return null;
  const found = (await listAlbums()).find(entry => entry.album === album);
  return found ?? { album, story: '' };
};

const applyCriticPatches = (lines, patches) => {
  const next = lines.map(line => ({ ...line }));
  for (const patch of Array.isArray(patches) ? patches : []) {
    const index = Number(patch?.index);
    const replacement = String(patch?.replacement ?? '').replace(/\s+/g, ' ').trim();
    if (!Number.isInteger(index) || index < 1 || index > next.length || !replacement) continue;
    next[index - 1] = {
      ...next[index - 1],
      zh: replacement,
      criticReason: String(patch?.reason ?? '').slice(0, 500),
    };
  }
  return next;
};

const runPostLyrics = trackId => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [
    path.join(PROJECT_ROOT, 'scripts/post-lyrics.mjs'),
    '--track', trackId,
    '--force',
    '--machine',
  ], { cwd: PROJECT_ROOT, stdio: 'inherit' });
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolve() : reject(new Error(`歌词合并失败，退出码 ${code}`)));
});

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const playlist = parsePlaylist(await readFile(PLAYLIST_FILE, 'utf8'));
  const config = await readIdentityConfig(IDENTITY_CONFIG_FILE);
  const identities = await buildTrackIdentities(PROJECT_ROOT, playlist, config);
  const identityMap = new Map(identities.map(identity => [identity.id, identity]));
  const selected = playlist.filter(track => {
    const identity = identityMap.get(track.id);
    return options.trackIds.includes(track.id) ||
      (options.category && track.category === options.category) ||
      (options.album && identity?.tags.album === options.album);
  });
  if (!selected.length) throw new Error('没有匹配的曲目');

  const glossary = await readJson(GLOSSARY_FILE);
  for (const [position, track] of selected.entries()) {
    const identity = identityMap.get(track.id);
    if (!identity || identity.kind === 'instrumental') {
      console.log(`[${position + 1}/${selected.length}] ${track.id} · 纯器乐，跳过`);
      continue;
    }
    const documentFile = path.join(OUT_DIR, `${track.id}.json`);
    if (!existsSync(documentFile)) {
      console.log(`[${position + 1}/${selected.length}] ${track.id} · 尚无原文，跳过`);
      continue;
    }
    const document = await readJson(documentFile);
    const sourceLines = document.lines.map(({ startMs, ja }) => ({ startMs, ja }));
    const sourceHash = sourceHashOf(sourceLines);
    const sourceFolder = path.join(SOURCE_DIR, track.id);
    await mkdir(sourceFolder, { recursive: true });

    if (options.reuseReviewedFrom) {
      const originId = options.reuseReviewedFrom;
      const originDocument = await readJson(path.join(OUT_DIR, `${originId}.json`));
      const originReviewed = await readJson(
        path.join(SOURCE_DIR, originId, 'translation.reviewed.json'),
      );
      const originIdentity = identityMap.get(originId);
      const declaredSameLyrics = identity.sameLyricsAs === originId ||
        originIdentity?.sameLyricsAs === track.id;
      const lineDifferences = originDocument.lines.flatMap((line, index) => {
        const originJa = line.ja.trim();
        const targetJa = sourceLines[index]?.ja.trim() ?? '';
        return originJa === targetJa ? [] : [{ index: index + 1, originJa, targetJa }];
      });
      const differsByOneInsertion = (left, right) => {
        const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
        return longer.length - shorter.length === 1 &&
          [...longer].some((_, index) => longer.slice(0, index) + longer.slice(index + 1) === shorter);
      };
      const onlyMinorEdits = lineDifferences.every(({ originJa, targetJa }) =>
        differsByOneInsertion(originJa, targetJa));
      const reusable = originDocument.lines.length === sourceLines.length &&
        (lineDifferences.length === 0 || (declaredSameLyrics && onlyMinorEdits));
      if (!reusable) throw new Error(`${originId} 与 ${track.id} 的日文歌词不满足安全复用条件`);
      const lines = assertTranslation(
        sourceLines,
        originReviewed.lines.map((line, index) => ({ index: index + 1, zh: line.zh })),
      );
      await writeJson(path.join(sourceFolder, 'translation.reviewed.json'), {
        version: 1,
        trackId: track.id,
        sourceHash,
        translationStatus: 'reviewed',
        reviewedAt: new Date().toISOString(),
        reusedFrom: originId,
        ...(lineDifferences.length ? { sourceTextDifferences: lineDifferences } : {}),
        lines,
      });
      await writeTranslationLrc(track.id, sourceLines, lines);
      const child = spawn(process.execPath, [
        path.join(PROJECT_ROOT, 'scripts/post-lyrics.mjs'),
        '--track', track.id,
        '--force',
        '--reviewed',
      ], { cwd: PROJECT_ROOT, stdio: 'inherit' });
      await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', code => code === 0 ? resolve() : reject(new Error(`复用译文合并失败，退出码 ${code}`)));
      });
      continue;
    }

    if (options.importReviewed) {
      const reviewed = await readJson(path.resolve(options.importReviewed));
      if (reviewed.trackId !== track.id || reviewed.sourceHash !== sourceHash) {
        throw new Error('审校文件与当前曲目原文不匹配');
      }
      const lines = assertTranslation(sourceLines, reviewed.lines);
      await writeJson(path.join(sourceFolder, 'translation.reviewed.json'), {
        ...reviewed,
        trackId: track.id,
        sourceHash,
        translationStatus: 'reviewed',
        reviewedAt: new Date().toISOString(),
        lines,
      });
      await writeTranslationLrc(track.id, sourceLines, lines);
      const child = spawn(process.execPath, [
        path.join(PROJECT_ROOT, 'scripts/post-lyrics.mjs'),
        '--track', track.id,
        '--force',
        '--reviewed',
      ], { cwd: PROJECT_ROOT, stdio: 'inherit' });
      await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', code => code === 0 ? resolve() : reject(new Error(`审校稿合并失败，退出码 ${code}`)));
      });
      continue;
    }

    const machineFile = path.join(sourceFolder, 'translation.machine.json');
    if (!options.force && existsSync(machineFile)) {
      const previous = await readJson(machineFile);
      if (previous.sourceHash === sourceHash) {
        console.log(`[${position + 1}/${selected.length}] ${track.id} · 机器稿已是最新`);
        continue;
      }
    }

    const albumContext = await loadAlbumContext(identity.tags.album);
    const payload = {
      track: {
        id: track.id,
        title: identity.lookup.title,
        artist: identity.lookup.artists[0] ?? track.artist,
        album: identity.tags.album ?? '',
      },
      albumContext,
      glossary,
      lines: sourceLines.map((line, index) => ({ index: index + 1, ja: line.ja })),
    };
    console.log(`[${position + 1}/${selected.length}] ${track.id} ${track.title} · 整首初译`);
    const draftValue = extractJson(await anthropicMessage({
      system: translatorSystem,
      user: JSON.stringify(payload),
    }));
    const draftLines = assertTranslation(sourceLines, draftValue.lines);

    console.log(`[${position + 1}/${selected.length}] ${track.id} · 定点自检`);
    const criticValue = extractJson(await anthropicMessage({
      system: criticSystem,
      user: JSON.stringify({ ...payload, translation: draftLines }),
    }));
    const lines = assertTranslation(
      sourceLines,
      applyCriticPatches(draftLines, criticValue.patches),
    );
    const artifact = {
      version: 1,
      trackId: track.id,
      sourceHash,
      translationStatus: 'machine',
      generatedAt: new Date().toISOString(),
      provider: 'anthropic',
      model: process.env.LYRICS_TRANSLATION_MODEL,
      promptVersion: 1,
      lines,
    };
    await writeJson(machineFile, artifact);
    await writeTranslationLrc(track.id, sourceLines, lines);
    await runPostLyrics(track.id);
  }
};

main().catch(error => {
  console.error(`\n❌ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
