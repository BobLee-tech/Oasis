#!/usr/bin/env node
//
// 🎐 网易云事实层：把每首歌在网易云上的资料拉齐，写进曲目档案的 sources.netease
//    （docs/music-design.md P2）。歌词正文不在这里发布——这里只出「换源提案」，
//    由你在工坊里逐首点选。
//
// 用法：
//   npm run music:netease                         全曲库（有缓存的直接读缓存，不联网）
//   npm run music:netease -- --track m_24         单曲
//   npm run music:netease -- --category Miku
//   npm run music:netease -- --refresh            忽略缓存重新抓取
//   npm run music:netease -- --dry                只打印，不写档案
//
// 写入：music-data/tracks/<id>.json 的 ncmId 与 sources.netease（进 git，人能审）
// 缓存：lyrics-src/<id>/ncm/*.json（gitignore，原始响应，含歌词正文）
//
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readIdentityConfig } from './lib/track-identity.mjs';
import { pairLyrics, resolveNetease } from './lib/sources/netease.mjs';
import { compareLyricVersions } from './lib/lyrics-compare.mjs';
import { readProfile, writeProfile } from './lib/track-profile.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const IDENTITY_FILE = path.join(PROJECT_ROOT, 'lyrics-config/tracks.identity.json');
const CONFIG_FILE = path.join(PROJECT_ROOT, 'lyrics-config/overrides.json');
const SOURCE_DIR = path.join(PROJECT_ROOT, 'lyrics-src');
const LYRICS_DIR = path.join(PROJECT_ROOT, 'dist-lyrics');

const parseArgs = argv => {
  const options = { tracks: [], category: '', refresh: false, dry: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--track') options.tracks.push(argv[++i] ?? '');
    else if (arg === '--category') options.category = argv[++i] ?? '';
    else if (arg === '--refresh') options.refresh = true;
    else if (arg === '--dry') options.dry = true;
    else throw new Error(`未知参数：${arg}`);
  }
  return options;
};

const readCurrentLyrics = async id => {
  const manifestFile = path.join(LYRICS_DIR, 'manifest.json');
  if (!existsSync(manifestFile)) return null;
  const entry = JSON.parse(await readFile(manifestFile, 'utf8')).tracks?.[id];
  if (!entry?.key || !existsSync(path.join(LYRICS_DIR, entry.key))) return null;
  return JSON.parse(await readFile(path.join(LYRICS_DIR, entry.key), 'utf8'));
};

/** 供工坊复用：单曲解析 + 换源比对。 */
export const importNetease = async (identity, { identityConfig, refresh = false, profile }) => {
  const vocal = identity.kind !== 'instrumental';
  const result = await resolveNetease(identity, {
    cacheDir: path.join(SOURCE_DIR, identity.id, 'ncm'),
    identityConfig,
    refresh,
    wantLyrics: vocal,
  });
  if (!result.songId) return { result, facts: null, proposal: null };

  const credits = result.lyric?.credits ?? {};
  const facts = {
    songId: result.songId,
    fetchedAt: new Date().toISOString().slice(0, 10),
    ...(result.match?.manual ? { matchedBy: 'neteaseId' } : {}),
    titleAlt: result.detail?.titleAlt,
    album: result.detail?.album,
    trackNo: result.detail?.trackNo,
    disc: result.detail?.disc,
    released: result.detail?.released,
    ...(Object.keys(credits).length ? { credits } : vocal ? { creditsMissing: true } : {}),
    tieIn: result.wiki?.tieIn ?? result.detail?.tieInHint,
    bpm: result.wiki?.bpm,
    ...(vocal
      ? {
        hasLyrics: Boolean(result.lyric?.hasLyrics),
        hasTranslation: Boolean(result.lyric?.tlyric),
        hasRoma: Boolean(result.lyric?.romalrc),
        lyricUser: result.lyric?.lyricUser,
        transUser: result.lyric?.transUser,
      }
      : {}),
  };

  let proposal = null;
  if (vocal && result.lyric?.hasLyrics) {
    const paired = pairLyrics(result.lyric, identity.display.title);
    const current = await readCurrentLyrics(identity.id);
    proposal = compareLyricVersions(current, { lines: paired }, {
      title: identity.display.title,
      durationMs: identity.tags.durationMs,
      outroMs: profile?.lyrics?.outroMs ?? 0,
    });
  }
  return { result, facts, proposal };
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const identities = Object.values(JSON.parse(await readFile(IDENTITY_FILE, 'utf8')).tracks);
  const identityConfig = await readIdentityConfig(CONFIG_FILE);
  const selected = identities.filter(identity =>
    (!options.tracks.length || options.tracks.includes(identity.id)) &&
    (!options.category || identity.category === options.category));
  if (!selected.length) throw new Error('没有匹配的曲目');

  const report = { found: [], notFound: [], withLyrics: [], credits: [], creditsMissing: [], proposals: [], failed: [] };
  for (const [index, identity] of selected.entries()) {
    const label = `[${index + 1}/${selected.length}] ${identity.id} ${identity.display.title}`;
    try {
      const profile = await readProfile(identity.id);
      const { result, facts, proposal } = await importNetease(identity, {
        identityConfig,
        refresh: options.refresh,
        profile,
      });
      if (!facts) {
        console.log(`${label} · 未找到：${result.reason}`);
        report.notFound.push(identity.id);
        continue;
      }
      report.found.push(identity.id);
      if (identity.kind !== 'instrumental') {
        if (facts.hasLyrics) report.withLyrics.push(identity.id);
        if (facts.credits) report.credits.push(identity.id);
        else report.creditsMissing.push(identity.id);
      }
      if (proposal?.recommend) report.proposals.push({ id: identity.id, title: identity.display.title, reason: proposal.reason });
      const notes = [
        facts.titleAlt && `译名「${facts.titleAlt}」`,
        facts.credits && Object.entries(facts.credits).map(([role, names]) => `${role}:${names.join('/')}`).join(' '),
        facts.tieIn && `出处 ${facts.tieIn}`,
        identity.kind !== 'instrumental' && (facts.hasLyrics ? `词${facts.hasTranslation ? '+译' : ''}${facts.hasRoma ? '+罗' : ''}` : '无词'),
        proposal && (proposal.recommend ? `⇄ 建议换源（${proposal.reason}）` : `· ${proposal.reason}`),
      ].filter(Boolean);
      console.log(`${label} · ${facts.songId} ${notes.join(' · ')}`);
      if (!options.dry) {
        await writeProfile({ ...profile, id: identity.id, ncmId: facts.songId, sources: { ...profile.sources, netease: facts } });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`${label} · 失败：${message}`);
      report.failed.push({ id: identity.id, message });
    }
  }

  const vocal = selected.filter(identity => identity.kind !== 'instrumental');
  console.log('\n' + '─'.repeat(64));
  console.log(`找到 ${report.found.length}/${selected.length} · 人声 ${vocal.length} 首中有词 ${report.withLyrics.length}`);
  console.log(`署名：有 ${report.credits.length} · 来源无署名 ${report.creditsMissing.length}`);
  if (report.notFound.length) console.log(`未找到：${report.notFound.join(', ')}`);
  if (report.failed.length) report.failed.forEach(item => console.log(`失败：${item.id} ${item.message}`));
  console.log(`\n换源提案 ${report.proposals.length} 首（在工坊「歌词」页签逐首确认）：`);
  for (const item of report.proposals) console.log(`  ${item.id} ${item.title} — ${item.reason}`);
  if (options.dry) console.log('\n演练模式：没有写档案。');
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(`\n❌ ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
