// 网易云歌词检索与拉取：只在本地导入阶段调用，产物经过对齐与人工复核后才进入
// 发布管线。接口非官方，可能随时变化或限流；因此始终允许 `neteaseId` 手动覆盖
// 跳过搜索匹配（见 lyrics-config/overrides.json 的 tracks.<id>.neteaseId）。
import { artistVariants, normalizeIdentity } from './track-identity.mjs';
import { overlap } from './lyrics-match.mjs';

const SEARCH_URL = 'https://music.163.com/api/search/get';
const LYRIC_URL = 'https://music.163.com/api/song/lyric';
const HEADERS = {
  Referer: 'https://music.163.com/',
  'User-Agent': 'Mozilla/5.0 (compatible; Oasis personal music garden/1.0; lyrics import)',
};
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const requestJson = async (url, params, { retries = 3 } = {}) => {
  const query = new URLSearchParams(params);
  let response;
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      response = await fetch(`${url}?${query}`, {
        headers: HEADERS,
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status !== 429 && response.status < 500) break;
      const retryAfter = Number(response.headers.get('retry-after') ?? 0);
      await wait(Math.min(8_000, Math.max(500 * 2 ** attempt, retryAfter * 1_000)));
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) await wait(500 * 2 ** attempt);
    }
  }
  if (!response) throw lastError ?? new Error('网易云请求失败');
  if (!response.ok) throw new Error(`网易云 HTTP ${response.status}`);
  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES) throw new Error('网易云响应过大');
  return JSON.parse(body);
};

/** 搜索候选曲目；只给曲名，艺人/时长交给排序与硬门槛。 */
export const searchNetease = async identity => {
  const value = await requestJson(SEARCH_URL, {
    s: identity.lookup.title,
    type: '1',
    limit: '15',
    offset: '0',
  });
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

/** 拉取指定 id 的同步歌词与官方翻译；无翻译时 tlyric 为空串。 */
export const fetchNeteaseLyric = async songId => {
  const value = await requestJson(LYRIC_URL, { id: String(songId), lv: '-1', tv: '-1' });
  if (value?.code !== 200) throw new Error(`网易云歌词接口返回 ${value?.code}`);
  const lrc = String(value?.lrc?.lyric ?? '').trim();
  const tlyric = String(value?.tlyric?.lyric ?? '').trim();
  if (!lrc) throw new Error('网易云该曲目没有同步歌词');
  return { lrc, tlyric };
};

const artistScoreOf = (candidateNames, expectedArtists) =>
  Math.max(0, 0, ...candidateNames.flatMap(name => expectedArtists.map(artist => overlap(artist, name))));

export const rankNeteaseCandidates = (candidates, identity, identityConfig) => {
  const expectedArtists = artistVariants(identity.lookup.artists, identityConfig.artistAliases);
  const durationSeconds = identity.tags.durationMs / 1_000;
  return candidates
    .map(candidate => {
      const titleScore = overlap(identity.lookup.title, candidate.name);
      const artistScore = artistScoreOf(candidate.artistNames, expectedArtists);
      const albumScore = identity.lookup.album && candidate.albumName
        ? overlap(identity.lookup.album, candidate.albumName)
        : 0.5;
      const candidateDuration = candidate.durationMs ? candidate.durationMs / 1_000 : null;
      const durationDelta = durationSeconds && candidateDuration
        ? Math.abs(durationSeconds - candidateDuration)
        : null;
      // 网易搜索结果里翻唱/伴奏/live 远比 LRCLIB 常见，时长容差收紧到 ±10s 才计分。
      const durationScore = durationDelta === null ? 0.5 : Math.max(0, 1 - durationDelta / 10);
      return {
        candidate,
        score: titleScore * 0.55 + artistScore * 0.28 + durationScore * 0.12 + albumScore * 0.05,
        titleScore,
        artistScore,
        albumScore,
        durationDelta,
      };
    })
    .sort((left, right) => right.score - left.score);
};

export const acceptableNeteaseCandidate = candidate =>
  Boolean(
    candidate &&
    candidate.titleScore >= 0.86 &&
    candidate.artistScore >= 0.6 &&
    candidate.score >= 0.92 &&
    (candidate.durationDelta === null || candidate.durationDelta <= 5),
  );

/** 手动覆盖优先：identityConfig.tracks[id].neteaseId 存在时跳过搜索排序，直接拉取。 */
export const resolveNeteaseOverrideId = (trackId, identityConfig) => {
  const raw = identityConfig.tracks?.[trackId]?.neteaseId;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export const normalizeForMatch = normalizeIdentity;
