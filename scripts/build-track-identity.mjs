#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildTrackIdentities,
  parsePlaylist,
  readIdentityConfig,
} from './lib/track-identity.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PLAYLIST_FILE = path.join(PROJECT_ROOT, 'src/hooks/useSoundscape.ts');
const CONFIG_FILE = path.join(PROJECT_ROOT, 'lyrics-config/overrides.json');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'lyrics-config/tracks.identity.json');

const playlist = parsePlaylist(await readFile(PLAYLIST_FILE, 'utf8'));
const config = await readIdentityConfig(CONFIG_FILE);
const tracks = await buildTrackIdentities(PROJECT_ROOT, playlist, config);
const document = {
  version: 1,
  generatedAt: new Date().toISOString(),
  tracks: Object.fromEntries(tracks.map(track => [track.id, track])),
};

await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
await writeFile(OUTPUT_FILE, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

const missing = tracks.filter(track =>
  !track.audit.audioPresent ||
  track.audit.probeError ||
  !track.lookup.title ||
  !track.lookup.artists.length ||
  !track.tags.durationMs);
const instrumentals = tracks.filter(track => track.kind === 'instrumental');

console.log(`身份清单：${tracks.length} 首 · 纯器乐 ${instrumentals.length} · 待检查 ${missing.length}`);
for (const track of missing) {
  console.log(`待检查：${track.id} ${track.display.title} · ${track.audit.probeError ?? '标签不完整'}`);
}
console.log(path.relative(PROJECT_ROOT, OUTPUT_FILE));
