import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const clean = value => String(value ?? '').replace(/\0/g, '').trim();

const unquote = value => value.replace(/\\'/g, "'").replace(/\\\\/g, '\\');

const field = (line, key) => {
  const match = line.match(new RegExp(`${key}: '((?:\\\\'|[^'])*)'`));
  return match ? unquote(match[1]) : '';
};

export const parsePlaylist = source => source
  .split('\n')
  .filter(line => line.includes("{ id: '") && line.includes("url: '/audio/"))
  .map(line => ({
    id: field(line, 'id'),
    title: field(line, 'title'),
    artist: field(line, 'artist'),
    category: field(line, 'category'),
    url: field(line, 'url'),
  }))
  .filter(track => track.id && track.title && track.url);

const capture = (cmd, args) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args);
  let out = '';
  let err = '';
  child.stdout.on('data', chunk => { out += chunk; });
  child.stderr.on('data', chunk => { err += chunk; });
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolve(out) : reject(new Error(err.trim() || `${cmd} 退出码 ${code}`)));
});

const tag = (tags, ...keys) => {
  for (const key of keys) {
    const match = Object.entries(tags).find(([candidate]) => candidate.toLowerCase() === key.toLowerCase());
    if (match && clean(match[1])) return clean(match[1]);
  }
  return '';
};

export const readIdentityConfig = async filename => {
  if (!existsSync(filename)) return { tracks: {}, artistAliases: {} };
  const value = JSON.parse(await readFile(filename, 'utf8'));
  return {
    tracks: value?.tracks && typeof value.tracks === 'object' ? value.tracks : {},
    artistAliases: value?.artistAliases && typeof value.artistAliases === 'object'
      ? value.artistAliases
      : {},
  };
};

export const probeTrackIdentity = async (projectRoot, track, config = { tracks: {} }) => {
  const override = config.tracks?.[track.id] ?? {};
  const local = path.join(projectRoot, 'public', decodeURIComponent(track.url).replace(/^\//, ''));
  let format = {};
  let probeError = '';
  try {
    const raw = await capture('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      local,
    ]);
    format = JSON.parse(raw)?.format ?? {};
  } catch (error) {
    probeError = error instanceof Error ? error.message : String(error);
  }
  const tags = format.tags ?? {};
  const taggedTitle = tag(tags, 'title', '©nam');
  const taggedArtist = tag(tags, 'artist', '©art');
  const albumArtist = tag(tags, 'album_artist', 'albumartist');
  const album = tag(tags, 'album', '©alb');
  const durationMs = Math.max(0, Math.round(Number(format.duration ?? 0) * 1_000));
  const artists = [
    ...(Array.isArray(override.searchArtists) ? override.searchArtists : []),
    taggedArtist,
    albumArtist,
    track.artist,
  ].map(clean).filter(Boolean);

  return {
    id: track.id,
    display: { title: track.title, artist: track.artist },
    category: track.category,
    url: track.url,
    tags: {
      title: taggedTitle || undefined,
      artist: taggedArtist || undefined,
      albumArtist: albumArtist || undefined,
      album: album || undefined,
      trackNumber: tag(tags, 'track', 'tracknumber') || undefined,
      discNumber: tag(tags, 'disc', 'discnumber') || undefined,
      isrc: tag(tags, 'isrc') || undefined,
      durationMs,
    },
    lookup: {
      title: clean(override.searchTitle || taggedTitle || track.title),
      artists: [...new Set(artists)],
      album: clean(override.searchAlbum || album) || undefined,
    },
    kind: override.kind === 'instrumental' ? 'instrumental' : 'vocal',
    sameLyricsAs: clean(override.sameLyricsAs) || undefined,
    audit: {
      audioPresent: existsSync(local),
      probeError: probeError || undefined,
    },
  };
};

export const buildTrackIdentities = async (projectRoot, playlist, config) => {
  const identities = [];
  for (const track of playlist) {
    identities.push(await probeTrackIdentity(projectRoot, track, config));
  }
  return identities;
};

export const normalizeIdentity = value => clean(value)
  .normalize('NFKC')
  .toLocaleLowerCase('ja')
  .replace(/\b(?:feat|featuring|ft|ver|version|complete|original|mix|re-recording)\b/gi, '')
  .replace(/[^\p{L}\p{N}]+/gu, '');

export const artistVariants = (artists, aliases = {}) => {
  const values = new Set(artists.map(clean).filter(Boolean));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, alternatives] of Object.entries(aliases)) {
      const family = [name, ...(Array.isArray(alternatives) ? alternatives : [])].map(clean).filter(Boolean);
      if (!family.some(candidate => values.has(candidate))) continue;
      for (const candidate of family) {
        if (!values.has(candidate)) {
          values.add(candidate);
          changed = true;
        }
      }
    }
  }
  return [...values];
};
