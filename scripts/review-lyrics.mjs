#!/usr/bin/env node
//
// 🪞 歌词校对页：日文原文 + 可编辑译文，逐行试听逐行改。
//    译文默认值取当前已发布内容（本地/LRCLIB/网易云导入的都算，谁在
//    dist-lyrics 里谁就是默认值），没有算法替你判断该信谁——你把每行读一遍，
//    改得不对的地方直接改。下载的 JSON 经
//    `npm run lyric:translate -- --track <id> --import-reviewed <file>`
//    导回，那一步才是真正把 translationStatus 升级为 reviewed 的人工闸门。
//
// 用法：
//   npm run lyric:review -- --track m_06
//
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parsePlaylist } from './lib/track-identity.mjs';
import { sourceHashOf } from './lib/lrc-parse.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const trackId = process.argv[process.argv.indexOf('--track') + 1] ?? '';
if (!trackId || process.argv.indexOf('--track') < 0) {
  console.error('用法：npm run lyric:review -- --track <id>');
  process.exit(1);
}

const readJsonIfExists = async filename => {
  if (!existsSync(filename)) return null;
  try {
    return JSON.parse(await readFile(filename, 'utf8'));
  } catch {
    return null;
  }
};

const source = await readFile(path.join(PROJECT_ROOT, 'src/hooks/useSoundscape.ts'), 'utf8');
const track = parsePlaylist(source).find(candidate => candidate.id === trackId);
if (!track) throw new Error(`曲库里找不到 ${trackId}`);

const sourceFolder = path.join(PROJECT_ROOT, 'lyrics-src', trackId);
const documentFile = path.join(PROJECT_ROOT, 'dist-lyrics', `${trackId}.json`);
if (!existsSync(documentFile)) throw new Error('请先跑 npm run lyric -- --track <id> --fetch 生成原文');

const document = JSON.parse(await readFile(documentFile, 'utf8'));
const machine = await readJsonIfExists(path.join(sourceFolder, 'translation.machine.json'));
const reviewed = await readJsonIfExists(path.join(sourceFolder, 'translation.reviewed.json'));

const sourceLines = document.lines.map(({ startMs, ja }) => ({ startMs, ja }));
const sourceHash = sourceHashOf(sourceLines);

const lines = document.lines.map((line, index) => ({
  index: index + 1,
  startMs: line.startMs,
  ja: line.ja,
  // 已发布内容优先（不管来自本地/LRCLIB/网易云导入）；machine.json 只在还没重新
  // 发布过、只跑过 lyric:translate 时才有意义。
  zh: line.zh ?? machine?.lines[index]?.zh ?? reviewed?.lines[index]?.zh ?? '',
  ambiguity: machine?.lines[index]?.ambiguity ?? '',
  criticReason: machine?.lines[index]?.criticReason ?? '',
}));

const data = JSON.stringify({
  trackId,
  title: track.title,
  artist: track.artist,
  audioUrl: track.url,
  sourceHash,
  translator: document.translator ?? reviewed?.translator ?? '',
  source: document.source?.label ?? '',
  lines,
}).replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${track.title} · 歌词校对</title>
<style>
:root{color-scheme:light dark;font-family:ui-sans-serif,system-ui,sans-serif;background:#faf8f3;color:#334155}
@media(prefers-color-scheme:dark){:root{background:#0a0f1d;color:#cbd5e1}}
body{max-width:1080px;margin:auto;padding:32px 20px 80px}
header{position:sticky;top:0;z-index:2;padding:16px 0;background:color-mix(in srgb,Canvas 90%,transparent);backdrop-filter:blur(16px)}
h1{margin:0;font-size:26px}small{color:#94a3b8}
audio{width:100%;margin-top:14px}
.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:12px}
.toolbar input[type=text]{flex:1;min-width:180px;border:1px solid #94a3b844;border-radius:8px;padding:8px 10px;background:transparent;color:inherit;font:14px/1.4 inherit}
button{border:0;border-radius:999px;padding:10px 16px;background:#39c5bb;color:#062b29;font-weight:700;cursor:pointer}
.row{display:grid;grid-template-columns:76px 1fr 1fr;gap:16px;padding:18px 0;border-bottom:1px solid #94a3b833}
.row:focus-within{background:#39c5bb0d}
.time{font:11px ui-monospace;color:#94a3b8;padding-top:10px;background:none;border:0;cursor:pointer;text-align:left}
.ja{font-size:19px;line-height:1.8;padding-top:4px}
.note{font-size:11px;color:#f59e0b;margin-top:6px}
textarea{box-sizing:border-box;width:100%;min-height:74px;resize:vertical;border:1px solid #94a3b844;border-radius:10px;padding:11px 12px;font:16px/1.75 serif;background:transparent;color:inherit}
@media(max-width:720px){.row{grid-template-columns:56px 1fr}.translation{grid-column:2}.ja{font-size:17px}}
</style>
</head>
<body>
<header>
  <h1 id="title"></h1>
  <small>点击时间试听该行；改完下载审校结果，再导回歌词管线。</small>
  <audio id="audio" controls></audio>
  <div class="toolbar">
    <input id="translator" type="text" placeholder="译者署名（如：你的名字 / 网易云+校对）">
    <button id="download" type="button">下载审校结果</button>
  </div>
</header>
<main id="rows"></main>
<script>
const data = ${data};
const audio = document.querySelector('#audio');
audio.src = data.audioUrl;
document.querySelector('#title').textContent = data.title + ' · ' + data.artist;
document.querySelector('#translator').value = data.translator || '';
const clock = ms => Math.floor(ms / 60000) + ':' + String(Math.floor(ms % 60000 / 1000)).padStart(2, '0');
const rows = document.querySelector('#rows');
for (const line of data.lines) {
  const row = document.createElement('section');
  row.className = 'row';
  const time = document.createElement('button');
  time.className = 'time';
  time.textContent = clock(line.startMs);
  time.onclick = () => { audio.currentTime = line.startMs / 1000; audio.play(); };
  const ja = document.createElement('div');
  ja.className = 'ja';
  ja.lang = 'ja';
  ja.textContent = line.ja;
  if (line.ambiguity || line.criticReason) {
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = [line.ambiguity, line.criticReason].filter(Boolean).join(' · ');
    ja.append(note);
  }
  const wrap = document.createElement('div');
  wrap.className = 'translation';
  const input = document.createElement('textarea');
  input.lang = 'zh-Hans';
  input.value = line.zh;
  input.dataset.index = line.index;
  wrap.append(input);
  row.append(time, ja, wrap);
  rows.append(row);
}
document.querySelector('#download').onclick = () => {
  const lines = [...document.querySelectorAll('textarea')].map((el, index) => ({
    index: index + 1,
    zh: el.value.trim(),
  }));
  const translator = document.querySelector('#translator').value.trim();
  const output = {
    version: 1,
    trackId: data.trackId,
    sourceHash: data.sourceHash,
    ...(translator ? { translator } : {}),
    lines,
  };
  const blob = new Blob([JSON.stringify(output, null, 2) + '\\n'], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = data.trackId + '.reviewed.json';
  link.click();
  URL.revokeObjectURL(link.href);
};
</script>
</body></html>`;

const output = path.join(PROJECT_ROOT, 'public/__lyrics-review', `${trackId}.html`);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, html, 'utf8');
console.log(`/__lyrics-review/${trackId}.html`);
if (!lines.some(line => line.zh)) {
  console.log('提示：这首曲目目前没有任何中文默认译文，编辑框会是空的。');
}
