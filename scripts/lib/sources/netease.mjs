// 网易云：曲目资料的主来源（docs/music-design.md A4.2 / P2）。
//
// 在 lib/netease-lyrics.mjs 的基础上补齐：
//   - 检索归一化 + 多查询词：「Complete ver.」后缀、(Original Mix)、feat. 拆分、罗马数字半/全角
//   - 多候选回退：时长 ±5s 通过门槛的前 3 个候选依次尝试，直到拿到有词的版本
//   - 成对歌词：lrc + tlyric + romalrc 来自同一份转写、同一条时间轴，不再移植对齐
//   - 歌词头署名 → credits；lyricUser / transUser → 贡献者昵称
//   - 详情：译名 tns、专辑、曲序、碟号、发行日；音乐百科：影视出处、BPM、推荐标签（只作参考）
//
// 只在本机导入时调用；原始响应全部缓存到 lyrics-src/<id>/ncm/（gitignore），
// 之后重建不联网。接口非官方，任何一步失败都只影响这一首。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { acceptableNeteaseCandidate, rankNeteaseCandidates } from '../netease-lyrics.mjs';
import { creditsFromLines, isTitleLine, parseCreditLine } from '../lyrics-gate.mjs';
import { parseLrc } from '../lrc-parse.mjs';
import { extractInlineRuby } from '../kana.mjs';

const BASE = 'https://music.163.com';
const HEADERS = {
  Referer: 'https://music.163.com/',
  'User-Agent': 'Mozilla/5.0 (compatible; Oasis personal music garden/1.0; metadata import)',
};
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const PAUSE_MS = 350;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

let lastRequestAt = 0;
const requestJson = async (pathname, params, { retries = 3 } = {}) => {
  const url = `${BASE}${pathname}?${new URLSearchParams(params)}`;
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    // 礼貌间隔：一首歌最多五六个请求，串行跑完整个曲库也就一两分钟。
    const since = Date.now() - lastRequestAt;
    if (since < PAUSE_MS) await wait(PAUSE_MS - since);
    lastRequestAt = Date.now();
    try {
      const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`网易云 HTTP ${response.status}`);
        await wait(800 * 2 ** attempt);
        continue;
      }
      if (!response.ok) throw new Error(`网易云 HTTP ${response.status}`);
      const body = await response.text();
      if (body.length > MAX_RESPONSE_BYTES) throw new Error('网易云响应过大');
      return JSON.parse(body);
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) await wait(500 * 2 ** attempt);
    }
  }
  throw lastError ?? new Error('网易云请求失败');
};

// ── 检索归一化 ────────────────────────────────────────────────────────────

const ROMAN_FULL = { I: 'Ⅰ', II: 'Ⅱ', III: 'Ⅲ', IV: 'Ⅳ', V: 'Ⅴ', VI: 'Ⅵ', VII: 'Ⅶ', VIII: 'Ⅷ', IX: 'Ⅸ', X: 'Ⅹ' };
const ROMAN_HALF = Object.fromEntries(Object.entries(ROMAN_FULL).map(([half, full]) => [full, half]));

/** 去掉检索时只会添乱的后缀：Complete ver. / (Original Mix) / (Re:Dialed) / -Remaster- 等。 */
export const stripTitleSuffix = title => String(title ?? '')
  .replace(/\s*[(（[［【][^)）\]］】]*(?:mix|ver\.?|version|edit|remaster(?:ed)?|re:?\s*dialed|re-?recording|inst\.?|instrumental|off vocal)[^)）\]］】]*[)）\]］】]\s*$/i, '')
  .replace(/\s+(?:complete|full|short|tv|album|single|original)\s*(?:ver\.?|version|size|edit)\s*$/i, '')
  .replace(/\s*-[^-]*(?:ver\.?|version|mix)[^-]*-\s*$/i, '')
  .trim();

/** 末尾罗马数字在半角 II 与全角 Ⅱ 之间互换（VocaDB / 网易云各认一种）。 */
export const swapRomanNumeral = title => {
  const value = String(title ?? '');
  const half = value.match(/^(.*?)(?<![A-Za-z])(X|IX|VIII|VII|VI|V|IV|III|II|I)$/);
  if (half && /[^\x00-\x7f]/.test(half[1])) return `${half[1]}${ROMAN_FULL[half[2]]}`;
  const full = value.match(/^(.*?)([Ⅰ-Ⅹ])$/);
  if (full) return `${full[1]}${ROMAN_HALF[full[2]]}`;
  return '';
};

/** 「DECO*27 feat. 初音ミク」「Aura Qualic, Trinity Note feat. …」拆成单个艺人；标签噪音（发行商）去掉。 */
const LABEL_NOISE = /^(?:sony music|various(?: artists)?|v\.?a\.?|karent)$/i;
export const splitArtists = artists => {
  const names = new Set();
  for (const raw of artists ?? []) {
    for (const part of String(raw).split(/\s*(?:\bfeat\.?|\bft\.?|\bfeaturing\b|[,，、&]|\/)\s*/i)) {
      const name = part.replace(/\s*\([^)]*\)\s*$/, '').trim();
      if (name && !LABEL_NOISE.test(name)) names.add(name);
    }
  }
  return [...names];
};

/** 依次尝试的检索词，去重后最多 4 个。 */
export const searchQueriesFor = identity => {
  const title = identity.lookup.title;
  const stripped = stripTitleSuffix(title);
  const artists = splitArtists(identity.lookup.artists);
  const queries = [
    title,
    stripped,
    swapRomanNumeral(stripped),
    artists[0] ? `${stripped} ${artists[0]}` : '',
  ];
  return [...new Set(queries.map(value => value.trim()).filter(Boolean))].slice(0, 4);
};

// ── 接口 ──────────────────────────────────────────────────────────────────

export const searchSongs = async query => {
  const value = await requestJson('/api/search/get', { s: query, type: '1', limit: '20', offset: '0' });
  const songs = value?.result?.songs;
  if (!Array.isArray(songs)) return [];
  return songs.map(song => ({
    id: song.id,
    name: String(song.name ?? ''),
    artistNames: Array.isArray(song.artists) ? song.artists.map(artist => String(artist?.name ?? '')) : [],
    albumName: String(song.album?.name ?? ''),
    durationMs: Number(song.duration ?? 0) || null,
  }));
};

export const fetchLyricRaw = songId =>
  requestJson('/api/song/lyric', { id: String(songId), lv: '-1', tv: '-1', rv: '-1' });

export const fetchDetailRaw = songId =>
  requestJson('/api/v3/song/detail', { c: JSON.stringify([{ id: Number(songId) }]) });

export const fetchWikiRaw = songId =>
  requestJson('/api/song/play/about/block/page', { songId: String(songId) });

// ── 解析（纯函数，测试与工坊共用）─────────────────────────────────────────

/** 歌词接口 → 成对歌词。nolyric / uncollected / 纯音乐提示都算「没有词」。 */
export const parseLyricResponse = raw => {
  const lrc = String(raw?.lrc?.lyric ?? '').trim();
  const tlyric = String(raw?.tlyric?.lyric ?? '').trim();
  const romalrc = String(raw?.romalrc?.lyric ?? '').trim();
  const parsed = lrc ? parseLrc(lrc).lines : [];
  const instrumentalHint = parsed.length <= 2 && parsed.some(line => /纯音乐|請欣賞|请欣赏|instrumental/i.test(line.ja));
  const hasLyrics = Boolean(!raw?.nolyric && !raw?.uncollected && parsed.length >= 4 && !instrumentalHint);
  return {
    hasLyrics,
    lrc,
    tlyric,
    romalrc,
    credits: creditsFromLines(parsed),
    lyricUser: String(raw?.lyricUser?.nickname ?? '') || undefined,
    transUser: String(raw?.transUser?.nickname ?? '') || undefined,
  };
};

/**
 * 原文、译文、罗马音按同一时间戳成对。三者来自同一份转写，时间戳逐字相同；
 * 个别条目差几毫秒（四舍五入），容差 60ms。歌词头署名行与标题行去掉。
 */
export const pairLyrics = ({ lrc, tlyric, romalrc }, title = '') => {
  const original = parseLrc(lrc).lines.filter(line => !parseCreditLine(line.ja) && !isTitleLine(line.ja, title));
  const index = text => {
    const lines = text ? parseLrc(text).lines : [];
    return startMs => {
      let best = null;
      for (const line of lines) {
        const delta = Math.abs(line.startMs - startMs);
        if (delta <= 60 && (!best || delta < best.delta)) best = { delta, text: line.ja };
      }
      return best?.text ?? '';
    };
  };
  const zhAt = index(tlyric);
  const romaAt = index(romalrc);
  return original.map(line => {
    const zh = zhAt(line.startMs).trim();
    const roma = romaAt(line.startMs).trim();
    // 「空（そら）」这类行内注音：正文去掉括号，读音另存
    const { text, ruby } = extractInlineRuby(line.ja);
    return {
      startMs: line.startMs,
      endMs: line.endMs,
      ja: text,
      ...(zh && zh !== '//' ? { zh } : {}),
      ...(roma ? { roma } : {}),
      ...(ruby.length ? { kana: ruby } : {}),
    };
  });
};

/** v3 详情 → 事实字段。 */
export const parseDetailResponse = raw => {
  const song = raw?.songs?.[0];
  if (!song) return null;
  const released = Number(song.publishTime ?? 0);
  // tns/alia 有时填的不是译名而是「电影《…》主题曲」这类出处说明，分开放。
  // 「若能就说出喜欢你 (电影《交换谎言日记》主题曲)」这种合写的，拆成译名 + 出处。
  const names = [...(song.tns ?? []), ...(song.alia ?? [])].map(String).filter(Boolean).flatMap(name => {
    const combined = name.match(/^(.+?)\s*[(（]([^()（）]*《[^()（）]*)[)）]$/);
    return combined ? [combined[1].trim(), combined[2].trim()] : [name];
  });
  const isTieIn = name => /《|》|主题曲|主題歌|插曲|片头|片尾|广告|CM曲|タイアップ|\b(?:OP|ED)\b/i.test(name);
  const titleAlt = names.find(name => !isTieIn(name));
  const tieInHint = names.find(isTieIn);
  return {
    name: String(song.name ?? ''),
    ...(titleAlt ? { titleAlt } : {}),
    ...(tieInHint ? { tieInHint } : {}),
    artists: (song.ar ?? []).map(artist => String(artist?.name ?? '')).filter(Boolean),
    album: String(song.al?.name ?? '') || undefined,
    trackNo: Number(song.no) || undefined,
    disc: Number(song.cd) || undefined,
    released: released > 0 ? new Date(released + 8 * 3_600_000).toISOString().slice(0, 10) : undefined,
    durationMs: Number(song.dt) || undefined,
  };
};

/** 音乐百科 → { tieIn?, bpm?, styles?, tags? }。tags（众包情绪标签）只给工坊当参考。 */
export const parseWikiResponse = raw => {
  const result = {};
  for (const block of raw?.data?.blocks ?? []) {
    if (block?.code !== 'SONG_PLAY_ABOUT_SONG_BASIC') continue;
    for (const creative of block.creatives ?? []) {
      const label = creative?.uiElement?.mainTitle?.title;
      const resources = (creative.resources ?? [])
        .map(resource => resource?.uiElement?.mainTitle?.title)
        .filter(Boolean)
        .map(String);
      const texts = (creative?.uiElement?.textLinks ?? []).map(link => String(link?.text ?? '')).filter(Boolean);
      if (label === '影视节目' && resources.length) result.tieIn = resources.join('；');
      else if (label === 'BPM' && Number(texts[0]) > 0) result.bpm = Number(texts[0]);
      else if (label === '曲风' && resources.length) result.styles = resources;
      else if (label === '推荐标签' && resources.length) result.tags = resources;
      else if (label === '语种' && texts.length) result.language = texts[0];
    }
  }
  return result;
};

// ── 带缓存的整曲解析 ──────────────────────────────────────────────────────

const cacheRead = async filename => (existsSync(filename) ? JSON.parse(await readFile(filename, 'utf8')) : null);
const cacheWrite = async (filename, value) => {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const cached = async (filename, refresh, load) => {
  if (!refresh) {
    const hit = await cacheRead(filename);
    if (hit) return hit;
  }
  const value = await load();
  await cacheWrite(filename, value);
  return value;
};

/**
 * 找到这首歌在网易云上的 id 并拉齐资料。
 * @param identity     tracks.identity.json 里的一项
 * @param options      { cacheDir, identityConfig, refresh, wantLyrics }
 * @returns {{ songId, match, lyric?, detail?, wiki?, tried: [] } | { songId: null, tried, reason }}
 */
export const resolveNetease = async (identity, { cacheDir, identityConfig, refresh = false, wantLyrics = true }) => {
  const override = Number(identityConfig.tracks?.[identity.id]?.neteaseId);
  const tried = [];
  let songId = Number.isInteger(override) && override > 0 ? override : null;
  let match = songId ? { manual: true } : null;
  let lyricRaw = null;

  if (!songId) {
    const queries = searchQueriesFor(identity);
    const searchFile = path.join(cacheDir, 'search.json');
    const previous = refresh ? null : await cacheRead(searchFile);
    // 检索词变了（归一化规则或 searchTitle 改过）就重搜，别用旧词的结果。
    const stale = !previous || JSON.stringify(previous.queries) !== JSON.stringify(queries);
    const search = stale
      ? await cached(searchFile, true, async () => {
        const results = {};
        for (const query of queries) results[query] = await searchSongs(query);
        return { queries, results };
      })
      : previous;
    const pool = new Map();
    for (const list of Object.values(search.results)) for (const song of list) pool.set(song.id, song);
    const expanded = {
      ...identity,
      lookup: {
        ...identity.lookup,
        title: stripTitleSuffix(identity.lookup.title) || identity.lookup.title,
        // Miku 分区的合集版在网易云上常常只署「初音ミク」，不写 P 主。
        artists: [
          ...identity.lookup.artists,
          ...splitArtists(identity.lookup.artists),
          ...(identity.category === 'Miku' ? ['初音ミク'] : []),
        ],
      },
    };
    const ranked = rankNeteaseCandidates([...pool.values()], expanded, identityConfig)
      .filter(acceptableNeteaseCandidate)
      .slice(0, 3);
    if (!ranked.length) return { songId: null, tried, reason: '没有通过门槛的候选（标题/艺人/时长 ±5s）' };

    // 多候选回退：同名曲的不同 id，有的「暂无歌词」，有的完整。
    for (const candidate of ranked) {
      const entry = {
        id: candidate.candidate.id,
        name: candidate.candidate.name,
        album: candidate.candidate.albumName,
        score: Number(candidate.score.toFixed(3)),
        durationDelta: candidate.durationDelta === null ? null : Number(candidate.durationDelta.toFixed(2)),
      };
      tried.push(entry);
      if (!wantLyrics) {
        songId = entry.id;
        match = entry;
        break;
      }
      const raw = await cached(path.join(cacheDir, `lyric.${entry.id}.json`), refresh, () => fetchLyricRaw(entry.id));
      entry.hasLyrics = parseLyricResponse(raw).hasLyrics;
      if (entry.hasLyrics || !songId) {
        songId = entry.id;
        match = entry;
        lyricRaw = raw;
      }
      if (entry.hasLyrics) break;
    }
  }

  if (wantLyrics && !lyricRaw) {
    lyricRaw = await cached(path.join(cacheDir, `lyric.${songId}.json`), refresh, () => fetchLyricRaw(songId));
  }
  const detailRaw = await cached(path.join(cacheDir, `detail.${songId}.json`), refresh, () => fetchDetailRaw(songId));
  let wikiRaw = null;
  try {
    wikiRaw = await cached(path.join(cacheDir, `wiki.${songId}.json`), refresh, () => fetchWikiRaw(songId));
  } catch {
    // 百科接口最不稳定，拿不到只是少一个 tieIn。
  }
  return {
    songId,
    match,
    tried,
    lyric: lyricRaw ? parseLyricResponse(lyricRaw) : undefined,
    detail: parseDetailResponse(detailRaw) ?? undefined,
    wiki: wikiRaw ? parseWikiResponse(wikiRaw) : undefined,
  };
};
