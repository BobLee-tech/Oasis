#!/usr/bin/env node
//
// 🗂 曲目档案构建（docs/music-design.md A3.2 / P5）：npm run music:build，挂在 prebuild。
//
//   1. 校验：档案 id 必须在 PLAYLIST 里；字段类型；note ≤ 40 字，intro ≤ 120 字
//   2. 合并：人标 > 导入 > 自动 > 专辑默认 > 缺省，并记下每个字段的出处（lib/profile-merge.mjs）
//   3. 写出 src/data/trackProfiles.generated.json：前端按需 import() 的独立 chunk
//
// 只读进 git 的文件（music-data/、tracks.identity.json、PLAYLIST、trackFeatures.generated.json），Vercel 上也能跑。
// 输出不带时间戳：内容不变，文件就不变，git diff 只在真的改了资料时出现。
// notePrivate 的曲目根本不写 note——公开 chunk 谁都能下载，「不显示」不等于「不泄露」。
//
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parsePlaylist } from './lib/track-identity.mjs';
import { listAlbums, listProfiles } from './lib/track-profile.mjs';
import { mergeProfile, validateProfile } from './lib/profile-merge.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PLAYLIST_FILE = path.join(PROJECT_ROOT, 'src/hooks/useSoundscape.ts');
const IDENTITY_FILE = path.join(PROJECT_ROOT, 'lyrics-config/tracks.identity.json');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'src/data/trackProfiles.generated.json');
// 自动层：Miku 的 analyze-tracks 产出（arousal / bpm / 副歌 / 季节 / 时段）；没有就当空
const FEATURES_FILE = path.join(PROJECT_ROOT, 'src/data/trackFeatures.generated.json');

const main = async () => {
  const playlist = parsePlaylist(await readFile(PLAYLIST_FILE, 'utf8'));
  const knownIds = new Set(playlist.map(track => track.id));
  const identity = JSON.parse(await readFile(IDENTITY_FILE, 'utf8')).tracks;
  const profiles = await listProfiles();
  const albums = await listAlbums();
  const albumOf = name => albums.find(album => album.album === name) ?? null;
  let features = {};
  try {
    features = JSON.parse(await readFile(FEATURES_FILE, 'utf8')).tracks ?? {};
  } catch {
    // 还没跑过 npm run song:analyze
  }

  const problems = profiles.flatMap(profile => validateProfile(profile, knownIds));
  const identityDrift = playlist.filter(track => !identity[track.id]).map(track => `${track.id}：tracks.identity.json 里没有（先跑 npm run lyric:identity）`);
  problems.push(...identityDrift);
  if (problems.length) {
    console.error(`❌ 曲目档案校验失败（${problems.length}）：\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }

  const byId = new Map(profiles.map(profile => [profile.id, profile]));
  const missing = playlist.filter(track => !byId.has(track.id)).map(track => track.id);

  const tracks = {};
  for (const track of playlist) {
    const merged = mergeProfile(
      byId.get(track.id) ?? { id: track.id },
      identity[track.id],
      albumOf(identity[track.id]?.tags?.album),
      features[track.id] ?? {},
    );
    const { id: _id, ...rest } = merged;
    tracks[track.id] = rest;
  }
  const usedAlbums = new Set(Object.values(tracks).map(track => track.albumSlug).filter(Boolean));
  const document = {
    version: 1,
    albums: Object.fromEntries(albums
      .filter(album => usedAlbums.has(album.slug))
      .map(album => [album.slug, { album: album.album }])),
    tracks,
  };

  const text = `${JSON.stringify(document)}\n`;
  let previous = '';
  try {
    previous = await readFile(OUTPUT_FILE, 'utf8');
  } catch {
    // 第一次构建
  }
  if (previous !== text) await writeFile(OUTPUT_FILE, text, 'utf8');

  const count = key => Object.values(tracks).filter(track => track[key] !== undefined).length;
  console.log(
    `🗂  曲目档案 ${playlist.length} 首 → ${path.relative(PROJECT_ROOT, OUTPUT_FILE)}（${(text.length / 1024).toFixed(1)} KB${previous === text ? '，无变化' : ''}）`,
  );
  console.log(`   署名 ${count('credits')} · 译名 ${count('titleAlt')} · 介绍 ${count('intro')} · 一句话 ${count('note')} · 心境 ${count('mood')} · 关联 ${count('relations')}`);
  if (missing.length) console.log(`   ⚠ 还没有档案文件（npm run music:netease 可生成）：${missing.join(', ')}`);
};

main().catch(error => {
  console.error(`\n❌ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
