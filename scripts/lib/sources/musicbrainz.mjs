// MusicBrainz（按 ISRC）：网易云与 VocaDB 都没有署名时的兜底。
// 词曲署名挂在「作品 work」上：recording → work-rels → work → artist-rels。
import { fetchJson } from './http.mjs';

const API = 'https://musicbrainz.org/ws/2';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export const lookupIsrc = async isrc => {
  const code = String(isrc ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (code.length !== 12) throw new Error('ISRC 应为 12 位');
  const found = await fetchJson(`${API}/isrc/${code}?fmt=json&inc=artist-credits`);
  const recording = found?.recordings?.[0];
  if (!recording) return null;
  await wait(1_100); // MusicBrainz 要求每秒不超过一次
  const detail = await fetchJson(`${API}/recording/${recording.id}?fmt=json&inc=work-rels+artist-credits`);
  const work = detail?.relations?.find(rel => rel['target-type'] === 'work')?.work;
  const credits = {};
  if (work) {
    await wait(1_100);
    const workDetail = await fetchJson(`${API}/work/${work.id}?fmt=json&inc=artist-rels`);
    for (const rel of workDetail?.relations ?? []) {
      const role = { lyricist: 'lyricist', composer: 'composer', writer: 'composer' }[rel.type];
      const name = rel.artist?.name;
      if (!role || !name) continue;
      const list = credits[role] ?? (credits[role] = []);
      if (!list.includes(name)) list.push(name);
    }
  }
  return {
    url: `https://musicbrainz.org/recording/${recording.id}`,
    title: recording.title,
    released: recording['first-release-date'],
    artist: (recording['artist-credit'] ?? []).map(credit => credit.name).join(''),
    credits,
  };
};
