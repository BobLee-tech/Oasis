#!/usr/bin/env node
//
// 🚧 歌词五道闸：全曲库体检报告（docs/music-design.md A4.1）
//
// 用法：
//   npm run lyric:gate                     全曲库一览：每首过了哪几道闸、卡在哪里
//   npm run lyric:gate -- --track y_23_08  单曲详情（列出出问题的行号）
//   npm run lyric:gate -- --only blocked   只看前四道有没过的
//   npm run lyric:gate -- --json           机器可读（工坊复用）
//
// 只读：读 tracks.identity.json（时长、纯器乐）、dist-lyrics/（已生成的歌词）、
// music-data/tracks/<id>.json 里的 lyrics.outroMs（纯器乐尾奏豁免）。不联网、不写文件。
//
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { BLOCKING_GATES, GATE_LABELS, GATES, checkLyrics } from './lib/lyrics-gate.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const IDENTITY_FILE = path.join(PROJECT_ROOT, 'lyrics-config/tracks.identity.json');
const LYRICS_DIR = path.join(PROJECT_ROOT, 'dist-lyrics');
const PROFILE_DIR = path.join(PROJECT_ROOT, 'music-data/tracks');

const readJson = async filename => JSON.parse(await readFile(filename, 'utf8'));

const parseArgs = argv => {
  const options = { tracks: [], only: '', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--track') options.tracks.push(argv[++i] ?? '');
    else if (arg === '--only') options.only = argv[++i] ?? '';
    else if (arg === '--json') options.json = true;
    else throw new Error(`未知参数：${arg}`);
  }
  if (options.only && !['blocked', 'missing', ...GATES].includes(options.only)) {
    throw new Error(`--only 只接受 blocked / missing / ${GATES.join(' / ')}`);
  }
  return options;
};

/** 全曲库体检；工坊中间件也调用这个函数。 */
export const auditLibrary = async () => {
  const identity = await readJson(IDENTITY_FILE);
  const manifestFile = path.join(LYRICS_DIR, 'manifest.json');
  const manifest = existsSync(manifestFile) ? await readJson(manifestFile) : { tracks: {} };
  const rows = [];
  for (const track of Object.values(identity.tracks)) {
    const base = { id: track.id, title: track.display.title, artist: track.display.artist };
    if (track.kind === 'instrumental') {
      rows.push({ ...base, kind: 'instrumental' });
      continue;
    }
    const entry = manifest.tracks[track.id];
    const key = entry?.key;
    if (!key || !existsSync(path.join(LYRICS_DIR, key))) {
      rows.push({ ...base, kind: 'missing' });
      continue;
    }
    const document = await readJson(path.join(LYRICS_DIR, key));
    const profileFile = path.join(PROFILE_DIR, `${track.id}.json`);
    const profile = existsSync(profileFile) ? await readJson(profileFile) : {};
    const result = checkLyrics(document, {
      durationMs: track.tags.durationMs,
      outroMs: profile?.lyrics?.outroMs ?? 0,
    });
    rows.push({
      ...base,
      kind: 'lyrics',
      source: document.source?.kind ?? 'unknown',
      translationStatus: document.translationStatus,
      lineCount: document.lines.length,
      ...result,
    });
  }
  return rows;
};

const mark = pass => (pass ? '✓' : '✗');
const pad = (value, width) => {
  const text = String(value);
  const visual = [...text].reduce((sum, char) => sum + (/[⺀-￯]/.test(char) ? 2 : 1), 0);
  return text + ' '.repeat(Math.max(0, width - visual));
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  let rows = await auditLibrary();
  if (options.tracks.length) {
    const unknown = options.tracks.filter(id => !rows.some(row => row.id === id));
    if (unknown.length) throw new Error(`曲库里找不到：${unknown.join(', ')}`);
    rows = rows.filter(row => options.tracks.includes(row.id));
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }

  const vocal = rows.filter(row => row.kind !== 'instrumental');
  const lyrics = rows.filter(row => row.kind === 'lyrics');
  let shown = rows;
  if (options.only === 'blocked') shown = lyrics.filter(row => row.blocked.length);
  else if (options.only === 'missing') shown = rows.filter(row => row.kind === 'missing');
  else if (GATES.includes(options.only)) shown = lyrics.filter(row => !row.gates[options.only].pass);

  const header = `${pad('id', 9)}${pad('曲名', 30)}${GATES.map(gate => pad(GATE_LABELS[gate], 6)).join('')}问题`;
  console.log(header);
  console.log('─'.repeat(96));
  for (const row of shown) {
    const name = pad(row.title.length > 13 ? `${row.title.slice(0, 12)}…` : row.title, 30);
    if (row.kind === 'instrumental') {
      if (!options.only) console.log(`${pad(row.id, 9)}${name}${pad('纯音乐', 30)}`);
      continue;
    }
    if (row.kind === 'missing') {
      console.log(`${pad(row.id, 9)}${name}${pad('— 没有歌词 —', 30)}`);
      continue;
    }
    const marks = GATES.map(gate => pad(mark(row.gates[gate].pass), 6)).join('');
    const issues = [...BLOCKING_GATES, 'listened']
      .filter(gate => !row.gates[gate].pass && gate !== 'reading' && gate !== 'listened')
      .map(gate => `${GATE_LABELS[gate]}：${row.gates[gate].detail}`)
      .join('  ');
    console.log(`${pad(row.id, 9)}${name}${marks}${issues}`);
    if (options.tracks.length) {
      for (const gate of GATES) {
        const value = row.gates[gate];
        console.log(`   ${mark(value.pass)} ${GATE_LABELS[gate]}  ${value.detail}`);
        if (value.lines?.length) console.log(`       行号：${value.lines.slice(0, 40).join(', ')}${value.lines.length > 40 ? ' …' : ''}`);
      }
      if (Object.keys(row.credits).length) console.log(`   署名：${JSON.stringify(row.credits)}`);
    }
  }

  const count = gate => lyrics.filter(row => row.gates[gate].pass).length;
  console.log('─'.repeat(96));
  console.log(
    `曲库 ${rows.length} 首：纯音乐 ${rows.length - vocal.length} · 人声 ${vocal.length}` +
    `（有歌词 ${lyrics.length} · 没有歌词 ${vocal.length - lyrics.length}）`,
  );
  console.log(`各闸通过（/${lyrics.length}）：${GATES.map(gate => `${GATE_LABELS[gate]} ${count(gate)}`).join(' · ')}`);
  console.log(`前四道全过：${lyrics.filter(row => !row.blocked.length).length}；` +
    `只差读音：${lyrics.filter(row => row.blocked.length === 1 && row.blocked[0] === 'reading').length}`);
  console.log('读音缺口与读音冲突在工坊（/__studio）「歌词」页签处理；试听闸 = 站主听完并标 reviewed，不阻止发布。');
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(`\n❌ ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
