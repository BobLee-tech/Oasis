// 曲目工坊的本机 API（docs/music-design.md P3）。只由 plugin.mjs 在 `vite serve` 下挂载。
//
//   GET  /__studio/api/library                      全曲库：五道闸 + 资料完整度
//   GET  /__studio/api/track/:id                    单曲：档案（原始/合并/出处）、歌词版本、比对、参考
//   POST /__studio/api/track/:id/profile            保存你写的字段（只写 music-data/tracks/<id>.json 顶层）
//   POST /__studio/api/album/:slug                  保存专辑叙事与心境默认
//   POST /__studio/api/track/:id/draft/accept       采纳这首的草稿（只填你还没写的 intro / valence / feel）
//   POST /__studio/api/album/:slug/draft/accept     采纳整张专辑：专辑心境草稿 + 每首的草稿
//   POST /__studio/api/track/:id/lyrics/netease     换成网易云成对版本（原文+译文+罗马音同一时间轴）
//   POST /__studio/api/track/:id/lyrics/tapsync     打点结果写成 original.lrc
//   POST /__studio/api/track/:id/lyrics/rebuild     按现有源文件重建（改了尾奏豁免之后）
//   POST /__studio/api/track/:id/lyrics/translation 逐行改译文（状态仍为 machine）
//   POST /__studio/api/track/:id/lyrics/reviewed    听完一遍：走 lyric:translate --import-reviewed 这道人工闸门
//   POST /__studio/api/track/:id/netease/refresh    重新抓网易云（忽略缓存）
//   POST /__studio/api/import/:kind                 vocadb / wikipedia / musicbrainz / url
//   POST /__studio/api/track/:id/import/save        只保存你框选的那部分，记下 URL 与时间
//   GET  /__studio/api/session                      本次会话写过哪些文件
//
// 写文件只发生在 music-data/、lyrics-src/、dist-lyrics/、public/lyrics/；不上传、不发布。
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { auditLibrary } from '../lyric-gate.mjs';
import { importNetease } from '../music-netease.mjs';
import { checkLyrics } from '../lib/lyrics-gate.mjs';
import { pairLyrics, parseLyricResponse } from '../lib/sources/netease.mjs';
import { compareLyricVersions } from '../lib/lyrics-compare.mjs';
import { sourceHashOf, stampLrc } from '../lib/lrc-parse.mjs';
import { listAlbums, listProfiles, profilePath, readProfile, writeAlbum, writeProfile } from '../lib/track-profile.mjs';
import { FEELS, INTRO_MAX, NOTE_MAX, RELATION_KINDS, mergeProfile, validateAlbumMood, validateProfile } from '../lib/profile-merge.mjs';
import { parsePlaylist, readIdentityConfig } from '../lib/track-identity.mjs';
import { searchVocadb } from '../lib/sources/vocadb.mjs';
import { searchWikipedia } from '../lib/sources/wikipedia.mjs';
import { lookupIsrc } from '../lib/sources/musicbrainz.mjs';
import { fetchPageText } from '../lib/sources/webpage.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const IDENTITY_FILE = path.join(PROJECT_ROOT, 'lyrics-config/tracks.identity.json');
const CONFIG_FILE = path.join(PROJECT_ROOT, 'lyrics-config/overrides.json');
const PLAYLIST_FILE = path.join(PROJECT_ROOT, 'src/hooks/useSoundscape.ts');
const SOURCE_DIR = path.join(PROJECT_ROOT, 'lyrics-src');
const LYRICS_DIR = path.join(PROJECT_ROOT, 'dist-lyrics');

const ID = /^[a-z0-9_]{1,32}$/i;
const SLUG = /^[a-z0-9-]{1,64}$/;
const touched = new Map(); // 相对路径 → 最后写入时间

const rel = filename => path.relative(PROJECT_ROOT, filename);
const touch = filename => touched.set(rel(filename), new Date().toISOString());

const readJson = async filename => JSON.parse(await readFile(filename, 'utf8'));
const readJsonIfExists = async filename => (existsSync(filename) ? readJson(filename) : null);
const writeText = async (filename, text) => {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, text, 'utf8');
  touch(filename);
};
const writeJsonFile = (filename, value) => writeText(filename, `${JSON.stringify(value, null, 2)}\n`);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const runScript = (script, args) => new Promise(resolve => {
  const child = spawn(process.execPath, [path.join(PROJECT_ROOT, 'scripts', script), ...args], {
    cwd: PROJECT_ROOT,
    env: process.env,
  });
  let log = '';
  child.stdout.on('data', chunk => { log += chunk; });
  child.stderr.on('data', chunk => { log += chunk; });
  child.on('close', code => resolve({ ok: code === 0, log: log.trim().slice(-6_000) }));
  child.on('error', error => resolve({ ok: false, log: String(error) }));
});

// ── 共享上下文 ─────────────────────────────────────────────────────────────

const loadContext = async () => {
  const identity = (await readJson(IDENTITY_FILE)).tracks;
  const features = (await readJsonIfExists(path.join(PROJECT_ROOT, 'src/data/trackFeatures.generated.json')))?.tracks ?? {};
  const playlist = parsePlaylist(await readFile(PLAYLIST_FILE, 'utf8'));
  const albums = await listAlbums();
  const albumOf = name => albums.find(album => album.album === name) ?? null;
  return { identity, playlist, albums, albumOf, features };
};

const requireTrack = (context, id) => {
  if (!ID.test(id ?? '') || !context.identity[id]) throw new HttpError(404, `曲库里没有 ${id}`);
  return context.identity[id];
};

const readCurrentLyrics = async id => {
  const manifest = await readJsonIfExists(path.join(LYRICS_DIR, 'manifest.json'));
  const key = manifest?.tracks?.[id]?.key;
  if (!key) return null;
  return readJsonIfExists(path.join(LYRICS_DIR, key));
};

/** 网易云缓存里这首当前选中的歌词响应（不联网）。 */
const readNeteaseLyric = async (id, songId) => {
  if (!songId) return null;
  const raw = await readJsonIfExists(path.join(SOURCE_DIR, id, 'ncm', `lyric.${songId}.json`));
  return raw ? parseLyricResponse(raw) : null;
};

const readNeteaseTags = async (id, songId) => {
  const raw = await readJsonIfExists(path.join(SOURCE_DIR, id, 'ncm', `wiki.${songId}.json`));
  if (!raw) return [];
  for (const block of raw?.data?.blocks ?? []) {
    for (const creative of block.creatives ?? []) {
      if (creative?.uiElement?.mainTitle?.title === '推荐标签') {
        return (creative.resources ?? []).map(item => item?.uiElement?.mainTitle?.title).filter(Boolean);
      }
    }
  }
  return [];
};

// 草稿（sources.draft，网络资料整理出的初稿）里还没被你采纳、而你自己也还没写的字段。
// 情绪草稿（docs/song-emotion-design.md §4）：feels 向量与词 / 曲效价；旧草稿只有单个 feel，采纳时读作 { feel: 3 }。
const DRAFT_FIELDS = ['intro', 'valence', 'lyricValence', 'soundValence', 'feels', 'imagery'];
const draftValue = (draft, field) => (field === 'feels' ? draft.feels ?? (draft.feel ? { [draft.feel]: 3 } : undefined) : draft[field]);
const moodHas = (mood, field) => (field === 'feels' ? mood?.feels !== undefined || mood?.feel !== undefined : mood?.[field] !== undefined);
const pendingDraftFields = profile => {
  const draft = profile.sources?.draft;
  if (!draft) return [];
  return DRAFT_FIELDS.filter(field => {
    const value = draftValue(draft, field);
    if (value === undefined || value === '') return false;
    if (field === 'intro') return !profile.intro;
    return !moodHas(profile.mood, field);
  });
};

/** 采纳草稿：只填你还没写的字段（已写的永远不覆盖），草稿本身留在 sources 里作记录。 */
const acceptDraft = async (id, fields = DRAFT_FIELDS) => {
  const profile = await readProfile(id);
  const draft = profile.sources?.draft;
  if (!draft) return { accepted: [] };
  // 兼容旧调用方传 'feel'
  const wanted = fields.map(field => (field === 'feel' ? 'feels' : field));
  const pending = pendingDraftFields(profile).filter(field => wanted.includes(field));
  if (!pending.length) return { accepted: [] };
  const next = { ...profile, mood: { ...profile.mood } };
  for (const field of pending) {
    if (field === 'intro') next.intro = draft.intro;
    else next.mood[field] = draftValue(draft, field);
  }
  next.sources = { ...profile.sources, draft: { ...draft, acceptedAt: new Date().toISOString().slice(0, 10) } };
  await writeProfile(next);
  touch(profilePath(id));
  return { accepted: pending };
};

// 专辑默认可写的情绪字段（docs/song-emotion-design.md §2.2）；arc / imagery 是逐曲的，草稿的 basis / refs 等说明也不进
const ALBUM_MOOD_KEYS = ['valence', 'lyricValence', 'soundValence', 'feel', 'feels'];
const pickAlbumMood = (mood = {}) => {
  const picked = Object.fromEntries(ALBUM_MOOD_KEYS.filter(key => mood?.[key] !== undefined && mood?.[key] !== null).map(key => [key, mood[key]]));
  return Object.keys(picked).length ? picked : undefined;
};

const completeness = (merged, kind) => ({
  credits: Boolean(merged.credits),
  titleAlt: Boolean(merged.titleAlt),
  intro: Boolean(merged.intro),
  note: Boolean(merged.note || merged.notePrivate),
  // 心境：情绪向量是写出来的（你或专辑默认），不算 VA 猜的
  feel: ['manual', 'album'].includes(merged.provenance['mood.feels']),
  /** 这一首你亲手标过情绪（⌘⏎「下一首没标的」按它找） */
  feelsMine: merged.provenance['mood.feels'] === 'manual',
  valence: typeof merged.mood?.valence === 'number',
  sections: kind === 'instrumental' || Boolean(merged.mood?.sections),
});

// ── 路由 ──────────────────────────────────────────────────────────────────

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

route('GET', /^\/library$/, async () => {
  const context = await loadContext();
  const audit = new Map((await auditLibrary()).map(row => [row.id, row]));
  const profiles = new Map((await listProfiles()).map(profile => [profile.id, profile]));
  const rows = Object.values(context.identity).map(identity => {
    const profile = profiles.get(identity.id) ?? { id: identity.id };
    const merged = mergeProfile(profile, identity, context.albumOf(identity.tags.album), context.features[identity.id]);
    const row = audit.get(identity.id);
    const track = context.playlist.find(item => item.id === identity.id);
    return {
      id: identity.id,
      title: identity.display.title,
      artist: identity.display.artist,
      category: identity.category,
      album: merged.album ?? '',
      kind: row?.kind ?? identity.kind,
      gates: row?.gates ? Object.fromEntries(Object.entries(row.gates).map(([name, gate]) => [name, gate.pass])) : null,
      translationStatus: row?.translationStatus,
      have: completeness(merged, identity.kind),
      draftPending: pendingDraftFields(profile).length > 0,
      ncm: Boolean(profile.ncmId),
      url: track?.url ?? identity.url,
    };
  });
  return {
    rows,
    albums: context.albums.map(album => ({ slug: album.slug, album: album.album, moodDefaults: album.moodDefaults ?? null, moodDraft: album.moodDraft ?? null })),
    feels: FEELS,
    relationKinds: RELATION_KINDS,
    limits: { note: NOTE_MAX, intro: INTRO_MAX },
  };
});

route('GET', /^\/track\/([^/]+)$/, async ([id]) => {
  const context = await loadContext();
  const identity = requireTrack(context, id);
  const profile = await readProfile(id);
  const album = context.albumOf(identity.tags.album);
  const merged = mergeProfile(profile, identity, album, context.features[id]);
  const current = await readCurrentLyrics(id);
  const outroMs = profile.lyrics?.outroMs ?? 0;
  const gateContext = { durationMs: identity.tags.durationMs, outroMs, title: identity.display.title };
  const ncm = await readNeteaseLyric(id, profile.ncmId);
  let netease = null;
  if (ncm?.hasLyrics) {
    const lines = pairLyrics(ncm, identity.display.title);
    netease = {
      songId: profile.ncmId,
      lines,
      transUser: ncm.transUser,
      lyricUser: ncm.lyricUser,
      compare: compareLyricVersions(current, { lines }, gateContext),
    };
  }
  const imported = await readJsonIfExists(path.join(SOURCE_DIR, id, 'imported.json'));
  const kana = await readJsonIfExists(path.join(SOURCE_DIR, id, 'kana.json'));
  return {
    identity,
    track: context.playlist.find(item => item.id === id) ?? null,
    profile,
    merged,
    album,
    // 自动层的唤醒度（情绪板显示「自动值」；你覆盖过时 merged 里看不到它）
    autoArousal: context.features[id]?.arousal ?? null,
    // 自动层的段落与意象（docs/song-emotion-design.md §13）：标注页的段落条与意象 chip 用
    autoSegments: context.features[id]?.segments ?? null,
    autoImagery: context.features[id]?.imagery ?? null,
    lyrics: current ? { document: current, gate: checkLyrics(current, gateContext) } : null,
    netease,
    neteaseTags: profile.ncmId ? await readNeteaseTags(id, profile.ncmId) : [],
    imported,
    readingConflicts: kana?.conflicts ?? [],
    problems: validateProfile(profile, new Set(Object.keys(context.identity))),
  };
});

// 你写的字段：只接受白名单里的键，其余（sources、ncmId）保持原样
const MANUAL_KEYS = ['titleAlt', 'album', 'trackNo', 'released', 'credits', 'tieIn', 'intro', 'note', 'noteVisitor', 'notePrivate', 'relations', 'mood', 'lyrics'];
route('POST', /^\/track\/([^/]+)\/profile$/, async ([id], body) => {
  const context = await loadContext();
  requireTrack(context, id);
  const profile = await readProfile(id);
  const next = { ...profile, id };
  for (const key of MANUAL_KEYS) {
    if (!(key in body)) continue;
    const value = body[key];
    if (value === null || value === '' || (Array.isArray(value) && !value.length)) delete next[key];
    else next[key] = value;
  }
  const problems = validateProfile(next, new Set(Object.keys(context.identity)));
  if (problems.length) throw new HttpError(400, problems.join('\n'));
  const written = await writeProfile(next);
  touch(profilePath(id));
  return { profile: written };
});

route('POST', /^\/track\/([^/]+)\/draft\/accept$/, async ([id], body) => {
  const context = await loadContext();
  requireTrack(context, id);
  return acceptDraft(id, Array.isArray(body.fields) ? body.fields : DRAFT_FIELDS);
});

// 整张专辑：专辑心境草稿 → moodDefaults（你没定过时），再逐曲采纳草稿
route('POST', /^\/album\/([^/]+)\/draft\/accept$/, async ([slug]) => {
  if (!SLUG.test(slug)) throw new HttpError(400, '非法专辑');
  const context = await loadContext();
  const album = context.albums.find(entry => entry.slug === slug);
  if (!album) throw new HttpError(404, `没有专辑 ${slug}`);
  let albumAccepted = false;
  if (album.moodDraft && !album.moodDefaults) {
    await writeAlbum({ ...album, moodDefaults: pickAlbumMood(album.moodDraft) });
    touch(path.join(PROJECT_ROOT, 'music-data/albums', `${slug}.json`));
    albumAccepted = true;
  }
  const ids = Object.values(context.identity).filter(track => track.tags.album === album.album).map(track => track.id);
  const tracks = {};
  for (const id of ids) {
    const { accepted } = await acceptDraft(id);
    if (accepted.length) tracks[id] = accepted;
  }
  return { albumAccepted, tracks };
});

route('POST', /^\/album\/([^/]+)$/, async ([slug], body) => {
  if (!SLUG.test(slug)) throw new HttpError(400, '非法专辑');
  const album = (await listAlbums()).find(entry => entry.slug === slug);
  if (!album) throw new HttpError(404, `没有专辑 ${slug}`);
  const next = { ...album };
  if ('story' in body) next.story = String(body.story ?? '').trim() || undefined;
  if ('moodDefaults' in body) {
    next.moodDefaults = pickAlbumMood(body.moodDefaults);
    const problems = validateAlbumMood(next);
    if (problems.length) throw new HttpError(400, problems.join('\n'));
  }
  const written = await writeAlbum(next);
  touch(path.join(PROJECT_ROOT, 'music-data/albums', `${slug}.json`));
  return { album: written };
});

const rebuildLyrics = async (id, extraArgs = []) => {
  const result = await runScript('post-lyrics.mjs', ['--track', id, '--force', ...extraArgs]);
  for (const file of [`dist-lyrics/${id}.json`, `public/lyrics/${id}.json`, 'dist-lyrics/manifest.json']) {
    touched.set(file, new Date().toISOString());
  }
  return result;
};

route('POST', /^\/track\/([^/]+)\/lyrics\/netease$/, async ([id]) => {
  const context = await loadContext();
  const identity = requireTrack(context, id);
  const profile = await readProfile(id);
  const ncm = await readNeteaseLyric(id, profile.ncmId);
  if (!ncm?.hasLyrics) throw new HttpError(400, '网易云缓存里没有这首的歌词；先「重新抓取」');
  const current = await readCurrentLyrics(id);
  if (current?.translationStatus === 'reviewed') throw new HttpError(409, '当前歌词已校，不替换');
  const folder = path.join(SOURCE_DIR, id);
  // 原文、译文、罗马音来自同一份转写：直接落盘，post-lyrics 合并时同轴命中。
  await writeText(path.join(folder, 'original.lrc'), `${ncm.lrc}\n`);
  if (ncm.tlyric) await writeText(path.join(folder, 'translation.zh.lrc'), `${ncm.tlyric}\n`);
  if (ncm.romalrc) await writeText(path.join(folder, 'roma.lrc'), `${ncm.romalrc}\n`);
  const previousMeta = await readJsonIfExists(path.join(folder, 'meta.json'));
  await writeJsonFile(path.join(folder, 'meta.json'), {
    ...previousMeta,
    trackId: id,
    source: {
      kind: 'netease',
      label: '网易云音乐',
      url: `https://music.163.com/#/song?id=${profile.ncmId}`,
      fetchedAt: new Date().toISOString(),
    },
  });
  const translator = ncm.transUser ? `网易云 @${ncm.transUser}` : '网易云';
  const result = await rebuildLyrics(id, ['--translator', translator]);
  return { ...result, title: identity.display.title };
});

route('POST', /^\/track\/([^/]+)\/lyrics\/tapsync$/, async ([id], body) => {
  const context = await loadContext();
  const identity = requireTrack(context, id);
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (lines.length < 2) throw new HttpError(400, '至少要打两行');
  let last = -1;
  for (const line of lines) {
    const start = Number(line?.startMs);
    if (!Number.isFinite(start) || start < 0 || start > identity.tags.durationMs) throw new HttpError(400, '时间超出音频范围');
    if (start <= last) throw new HttpError(400, '时间必须逐行递增');
    if (!String(line?.ja ?? '').trim()) throw new HttpError(400, '有空行');
    last = start;
  }
  const folder = path.join(SOURCE_DIR, id);
  const lrc = lines.map(line => `${stampLrc(line.startMs)}${String(line.ja).trim()}`).join('\n');
  await writeText(path.join(folder, 'original.lrc'), `${lrc}\n`);
  const translated = lines.filter(line => String(line.zh ?? '').trim());
  const translationFile = path.join(folder, 'translation.zh.lrc');
  if (translated.length) {
    await writeText(
      translationFile,
      `${translated.map(line => `${stampLrc(line.startMs)}${String(line.zh).trim()}`).join('\n')}\n`,
    );
  } else if (existsSync(translationFile)) {
    // 旧版本的译文对不上新时间轴，留着只会让合并因覆盖率不足而失败；挪开不删。
    await rename(translationFile, `${translationFile}.bak`);
    touch(`${translationFile}.bak`);
  }
  const previousMeta = await readJsonIfExists(path.join(folder, 'meta.json'));
  await writeJsonFile(path.join(folder, 'meta.json'), {
    ...previousMeta,
    trackId: id,
    source: { kind: 'local', label: '工坊打点', ...(body.sourceUrl ? { url: String(body.sourceUrl) } : {}), fetchedAt: new Date().toISOString() },
  });
  return rebuildLyrics(id);
});

route('POST', /^\/track\/([^/]+)\/lyrics\/rebuild$/, async ([id]) => {
  const context = await loadContext();
  requireTrack(context, id);
  const current = await readCurrentLyrics(id);
  const status = current?.translationStatus === 'reviewed' ? '--reviewed' : '--machine';
  return rebuildLyrics(id, [status, ...(current?.translator ? ['--translator', current.translator] : [])]);
});

route('POST', /^\/track\/([^/]+)\/lyrics\/translation$/, async ([id], body) => {
  const context = await loadContext();
  requireTrack(context, id);
  const current = await readCurrentLyrics(id);
  if (!current) throw new HttpError(400, '还没有歌词');
  const edits = new Map((body.edits ?? []).map(edit => [Number(edit.index), String(edit.zh ?? '').replace(/\s+/g, ' ').trim()]));
  const lines = current.lines.map((line, index) => (edits.has(index) ? { ...line, zh: edits.get(index) } : line));
  const lrc = lines
    .filter(line => String(line.zh ?? '').trim())
    .map(line => `${stampLrc(line.startMs)}${line.zh}`)
    .join('\n');
  await writeText(path.join(SOURCE_DIR, id, 'translation.zh.lrc'), `${lrc}\n`);
  const status = current.translationStatus === 'reviewed' ? '--reviewed' : '--machine';
  return rebuildLyrics(id, [status, ...(current.translator ? ['--translator', current.translator] : [])]);
});

route('POST', /^\/track\/([^/]+)\/lyrics\/reviewed$/, async ([id], body) => {
  const context = await loadContext();
  requireTrack(context, id);
  const current = await readCurrentLyrics(id);
  if (!current) throw new HttpError(400, '还没有歌词');
  const missing = current.lines.filter(line => /[\p{L}\p{N}]/u.test(line.ja) && !String(line.zh ?? '').trim());
  if (missing.length) throw new HttpError(400, `还有 ${missing.length} 行没有译文，补齐后再标已校`);
  const sourceLines = current.lines.map(({ startMs, ja }) => ({ startMs, ja }));
  const reviewed = {
    version: 1,
    trackId: id,
    sourceHash: sourceHashOf(sourceLines),
    translator: String(body.translator ?? current.translator ?? '').trim().slice(0, 80) || undefined,
    // 纯符号行（♪、……）照抄原文，满足「每行都有」
    lines: current.lines.map((line, index) => ({ index: index + 1, zh: String(line.zh ?? '').trim() || line.ja })),
  };
  const tmp = path.join(os.tmpdir(), `oasis-studio-${id}-${Date.now()}.reviewed.json`);
  await writeFile(tmp, JSON.stringify(reviewed), 'utf8');
  const result = await runScript('translate-lyrics.mjs', ['--track', id, '--import-reviewed', tmp]);
  touched.set(`lyrics-src/${id}/translation.reviewed.json`, new Date().toISOString());
  touched.set(`dist-lyrics/${id}.json`, new Date().toISOString());
  return result;
});

route('POST', /^\/track\/([^/]+)\/netease\/refresh$/, async ([id]) => {
  const context = await loadContext();
  const identity = requireTrack(context, id);
  const identityConfig = await readIdentityConfig(CONFIG_FILE);
  const profile = await readProfile(id);
  const { result, facts, proposal } = await importNetease(identity, { identityConfig, refresh: true, profile });
  if (!facts) throw new HttpError(404, result.reason ?? '网易云上没找到');
  await writeProfile({ ...profile, id, ncmId: facts.songId, sources: { ...profile.sources, netease: facts } });
  touch(profilePath(id));
  return { facts, proposal, tried: result.tried };
});

route('POST', /^\/import\/(vocadb|wikipedia|musicbrainz|url)$/, async ([kind], body) => {
  const query = String(body.query ?? '').trim();
  if (!query) throw new HttpError(400, '缺少查询内容');
  if (kind === 'vocadb') return { results: await searchVocadb(query) };
  if (kind === 'wikipedia') return { results: await searchWikipedia(query, body.lang ?? 'ja') };
  if (kind === 'musicbrainz') {
    const hit = await lookupIsrc(query);
    return { results: hit ? [hit] : [] };
  }
  return { results: [await fetchPageText(query)] };
});

// 框选结果入档：lyrics → 打点用的纯文本；credits → sources.web；ref → sources.refs（只给你写 intro 时参考）
route('POST', /^\/track\/([^/]+)\/import\/save$/, async ([id], body) => {
  const context = await loadContext();
  requireTrack(context, id);
  const text = String(body.text ?? '').trim().slice(0, 20_000);
  const url = String(body.url ?? '').trim().slice(0, 500);
  const source = String(body.source ?? 'web').slice(0, 40);
  if (!text && body.field !== 'credits') throw new HttpError(400, '没有选中任何文字');
  const fetchedAt = new Date().toISOString().slice(0, 10);
  if (body.field === 'lyrics') {
    const filename = path.join(SOURCE_DIR, id, 'imported.json');
    await writeJsonFile(filename, { trackId: id, url, source, fetchedAt, text });
    return { saved: rel(filename) };
  }
  const profile = await readProfile(id);
  const sources = { ...profile.sources };
  if (body.field === 'credits') {
    const credits = body.credits ?? {};
    const key = source === 'vocadb' || source === 'musicbrainz' ? source : 'web';
    sources[key] = { ...sources[key], ...(url ? { url } : {}), fetchedAt, credits };
  } else if (body.field === 'ref') {
    const refs = (sources.refs ?? []).filter(item => item.url !== url || item.text !== text);
    refs.push({ url, source, title: String(body.title ?? '').slice(0, 200) || undefined, license: body.license, fetchedAt, text: text.slice(0, 4_000) });
    sources.refs = refs.slice(-12);
  } else {
    throw new HttpError(400, '未知字段');
  }
  const written = await writeProfile({ ...profile, id, sources });
  touch(profilePath(id));
  return { profile: written };
});

route('GET', /^\/session$/, async () => ({
  files: [...touched.entries()].map(([file, at]) => ({ file, at })).sort((a, b) => b.at.localeCompare(a.at)),
}));

// ── 入口 ──────────────────────────────────────────────────────────────────

const readBody = req => new Promise((resolve, reject) => {
  let size = 0;
  const chunks = [];
  req.on('data', chunk => {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) {
      reject(new HttpError(413, '请求过大'));
      req.destroy();
    } else chunks.push(chunk);
  });
  req.on('end', () => {
    if (!chunks.length) return resolve({});
    try {
      resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch {
      reject(new HttpError(400, 'JSON 格式错误'));
    }
  });
  req.on('error', reject);
});

export const handleApi = async (req, res, pathname) => {
  const send = (status, value) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(value));
  };
  try {
    // 跨站请求一律拒绝：工坊会写文件，别让任意网页借你的浏览器 POST 进来。
    if (req.method !== 'GET') {
      const origin = req.headers.origin;
      const host = req.headers.host;
      if (!origin || new URL(origin).host !== host) throw new HttpError(403, '只接受来自工坊页面的请求');
      if (!String(req.headers['content-type'] ?? '').includes('application/json')) throw new HttpError(415, '只接受 JSON');
    }
    for (const { method, pattern, handler } of routes) {
      if (method !== req.method) continue;
      const match = pathname.match(pattern);
      if (!match) continue;
      const body = method === 'POST' ? await readBody(req) : {};
      const params = match.slice(1).map(decodeURIComponent);
      return send(200, await handler(params, body));
    }
    throw new HttpError(404, `没有这个接口：${req.method} ${pathname}`);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    send(status, { error: error instanceof Error ? error.message : String(error) });
  }
};
