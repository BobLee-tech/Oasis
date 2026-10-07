// VocaDB：Miku 曲的主力补充来源——原文/罗马音歌词（无时间轴）、词曲署名、标签、续作关系。
import { fetchJson } from './http.mjs';
import { swapRomanNumeral } from './netease.mjs';

const API = 'https://vocadb.net/api';

const ROLE_MAP = [
  ['lyricist', /Lyricist/],
  ['composer', /Composer/],
  ['arranger', /Arranger/],
];

/** VocaDB 的 roles 是「Default」时按 categories 推断：Producer 默认兼任词曲编。 */
export const creditsOf = song => {
  const credits = {};
  const add = (role, name) => {
    const list = credits[role] ?? (credits[role] = []);
    if (!list.includes(name)) list.push(name);
  };
  for (const entry of song?.artists ?? []) {
    const name = entry?.artist?.name ?? entry?.name;
    if (!name || entry.isSupport) continue;
    const roles = String(entry.effectiveRoles ?? entry.roles ?? 'Default');
    if (roles === 'Default') {
      if (/Producer/.test(entry.categories ?? '')) ['lyricist', 'composer', 'arranger'].forEach(role => add(role, name));
      if (/Vocalist/.test(entry.categories ?? '')) add('vocal', name);
      continue;
    }
    for (const [role, pattern] of ROLE_MAP) if (pattern.test(roles)) add(role, name);
    if (/Vocalist/.test(roles)) add('vocal', name);
  }
  return credits;
};

export const searchVocadb = async query => {
  const run = async q => {
    const params = new URLSearchParams({
      query: q,
      maxResults: '6',
      fields: 'Artists,Lyrics,Tags',
      lang: 'Japanese',
      nameMatchMode: 'Auto',
      sort: 'RatingScore',
    });
    return (await fetchJson(`${API}/songs?${params}`)).items ?? [];
  };
  // VocaDB 的原曲条目用全角罗马数字（愛言葉Ⅱ），半角搜到的多是同名翻唱：两种写法都搜，合并去重。
  const swapped = swapRomanNumeral(query);
  const seen = new Set();
  let items = [...(swapped ? await run(swapped) : []), ...await run(query)]
    .filter(song => !seen.has(song.id) && seen.add(song.id));
  // 原曲排前面（搜索结果里翻唱常常评分更高）；列表接口不带歌词，前 3 首单独取详情。
  items.sort((a, b) => Number(b.songType === 'Original') - Number(a.songType === 'Original'));
  items = items.slice(0, 4);
  for (const song of items.slice(0, 3)) {
    try {
      song.lyrics = (await fetchJson(`${API}/songs/${song.id}?fields=Lyrics`)).lyrics ?? [];
    } catch {
      song.lyrics = [];
    }
  }
  return items.map(song => ({
    id: song.id,
    url: `https://vocadb.net/S/${song.id}`,
    name: song.name,
    defaultName: song.defaultName,
    songType: song.songType,
    publishDate: song.publishDate?.slice(0, 10),
    lengthSeconds: song.lengthSeconds,
    credits: creditsOf(song),
    tags: (song.tags ?? []).map(tag => tag?.tag?.name).filter(Boolean).slice(0, 12),
    lyrics: (song.lyrics ?? []).map(lyric => ({
      kind: lyric.translationType, // Original / Romanized / Translation
      language: lyric.cultureCodes?.join(',') || lyric.cultureCode || '',
      source: lyric.source,
      url: lyric.url,
      text: lyric.value,
    })),
  }));
};
