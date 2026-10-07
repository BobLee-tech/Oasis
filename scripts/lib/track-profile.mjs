// 曲目档案来源文件 music-data/tracks/<id>.json 的读写（docs/music-design.md A3）。
//
// 一个文件里两层：
//   顶层   —— 你写的（titleAlt / intro / note… / relations / mood / lyrics.outroMs），优先级最高
//   sources —— 导入的事实层（netease / vocadb / musicbrainz / web），只由脚本或工坊的「导入」写
// music:build 按「人标 > 导入 > 自动 > 专辑默认 > 缺省」合并，并给每个字段记出处。
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
export const PROFILE_DIR = path.join(PROJECT_ROOT, 'music-data/tracks');
export const ALBUM_DIR = path.join(PROJECT_ROOT, 'music-data/albums');

/** 写盘时的键顺序：人写的在上，导入的在下，git diff 读起来顺。 */
const KEY_ORDER = [
  'id', 'ncmId', 'titleAlt', 'album', 'trackNo', 'released', 'credits', 'tieIn',
  'intro', 'note', 'noteVisitor', 'notePrivate', 'relations', 'mood', 'lyrics', 'sources',
];

const ordered = value => {
  const keys = Object.keys(value).sort((a, b) => {
    const ia = KEY_ORDER.indexOf(a);
    const ib = KEY_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  return Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
};

const prune = value => {
  if (Array.isArray(value)) return value.map(prune);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null && item !== '')
      .map(([key, item]) => [key, prune(item)]),
  );
};

export const profilePath = id => path.join(PROFILE_DIR, `${id}.json`);

export const readProfile = async id => {
  const filename = profilePath(id);
  if (!existsSync(filename)) return { id };
  return JSON.parse(await readFile(filename, 'utf8'));
};

export const writeProfile = async profile => {
  if (!/^[a-z0-9_]+$/i.test(profile.id ?? '')) throw new Error(`非法曲目 id：${profile.id}`);
  await mkdir(PROFILE_DIR, { recursive: true });
  const value = ordered(prune(profile));
  await writeFile(profilePath(profile.id), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return value;
};

export const listProfiles = async () => {
  if (!existsSync(PROFILE_DIR)) return [];
  const files = (await readdir(PROFILE_DIR)).filter(name => name.endsWith('.json'));
  return Promise.all(files.map(async name => JSON.parse(await readFile(path.join(PROFILE_DIR, name), 'utf8'))));
};

export const listAlbums = async () => {
  if (!existsSync(ALBUM_DIR)) return [];
  const files = (await readdir(ALBUM_DIR)).filter(name => name.endsWith('.json')).sort();
  return Promise.all(files.map(async name => JSON.parse(await readFile(path.join(ALBUM_DIR, name), 'utf8'))));
};

export const writeAlbum = async album => {
  if (!/^[a-z0-9-]+$/.test(album.slug ?? '')) throw new Error(`非法专辑 slug：${album.slug}`);
  await mkdir(ALBUM_DIR, { recursive: true });
  const value = prune(album);
  await writeFile(path.join(ALBUM_DIR, `${album.slug}.json`), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return value;
};

export const readAlbum = async slug => {
  const filename = path.join(ALBUM_DIR, `${slug}.json`);
  return existsSync(filename) ? JSON.parse(await readFile(filename, 'utf8')) : null;
};
