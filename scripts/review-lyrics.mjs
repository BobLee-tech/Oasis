#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parsePlaylist } from './lib/track-identity.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const trackId = process.argv[process.argv.indexOf('--track') + 1] ?? '';
if (!trackId || process.argv.indexOf('--track') < 0) {
  console.error('用法：npm run lyric:review -- --track <id>');
  process.exit(1);
}

const source = await readFile(path.join(PROJECT_ROOT, 'src/hooks/useSoundscape.ts'), 'utf8');
const track = parsePlaylist(source).find(candidate => candidate.id === trackId);
if (!track) throw new Error(`曲库里找不到 ${trackId}`);

const machineFile = path.join(PROJECT_ROOT, 'lyrics-src', trackId, 'translation.machine.json');
const documentFile = path.join(PROJECT_ROOT, 'dist-lyrics', `${trackId}.json`);
if (!existsSync(machineFile) || !existsSync(documentFile)) {
  throw new Error('请先生成原文与机器译文');
}
const machine = JSON.parse(await readFile(machineFile, 'utf8'));
const document = JSON.parse(await readFile(documentFile, 'utf8'));
const lines = document.lines.map((line, index) => ({
  index: index + 1,
  startMs: line.startMs,
  ja: line.ja,
  zh: machine.lines[index]?.zh ?? '',
  ambiguity: machine.lines[index]?.ambiguity ?? '',
  criticReason: machine.lines[index]?.criticReason ?? '',
}));
const data = JSON.stringify({
  trackId,
  title: track.title,
  artist: track.artist,
  audioUrl: track.url,
  sourceHash: machine.sourceHash,
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
body{max-width:1080px;margin:auto;padding:32px 20px 80px}header{position:sticky;top:0;z-index:2;padding:16px 0;background:color-mix(in srgb,Canvas 90%,transparent);backdrop-filter:blur(16px)}
h1{margin:0;font-size:26px}small{color:#94a3b8}audio{width:100%;margin-top:14px}.row{display:grid;grid-template-columns:76px 1fr 1fr;gap:16px;padding:18px 0;border-bottom:1px solid #94a3b833}.row:focus-within{background:#39c5bb0d}
.time{font:11px ui-monospace;color:#94a3b8;padding-top:10px}.ja{font-size:19px;line-height:1.8;padding-top:4px}.note{font-size:11px;color:#f59e0b;margin-top:6px}
textarea{box-sizing:border-box;width:100%;min-height:74px;resize:vertical;border:1px solid #94a3b844;border-radius:10px;padding:11px 12px;font:16px/1.75 serif;background:transparent;color:inherit}
button{border:0;border-radius:999px;padding:10px 16px;background:#39c5bb;color:#062b29;font-weight:700;cursor:pointer}
@media(max-width:720px){.row{grid-template-columns:56px 1fr}.translation{grid-column:2}.ja{font-size:17px}}
</style>
</head>
<body>
<header><h1 id="title"></h1><small>点击时间试听该行；完成后下载审校结果，再导回歌词管线。</small><audio id="audio" controls></audio> <button id="download">下载审校结果</button></header>
<main id="rows"></main>
<script>
const data=${data};const audio=document.querySelector('#audio');audio.src=data.audioUrl;
document.querySelector('#title').textContent=data.title+' · '+data.artist;
const clock=ms=>Math.floor(ms/60000)+':'+String(Math.floor(ms%60000/1000)).padStart(2,'0');
const rows=document.querySelector('#rows');
for(const line of data.lines){const row=document.createElement('section');row.className='row';
const time=document.createElement('button');time.className='time';time.textContent=clock(line.startMs);time.onclick=()=>{audio.currentTime=line.startMs/1000;audio.play()};
const ja=document.createElement('div');ja.className='ja';ja.lang='ja';ja.textContent=line.ja;
if(line.ambiguity||line.criticReason){const note=document.createElement('div');note.className='note';note.textContent=[line.ambiguity,line.criticReason].filter(Boolean).join(' · ');ja.append(note)}
const wrap=document.createElement('div');wrap.className='translation';const input=document.createElement('textarea');input.lang='zh-Hans';input.value=line.zh;input.dataset.index=line.index;wrap.append(input);
row.append(time,ja,wrap);rows.append(row)}
document.querySelector('#download').onclick=()=>{const lines=[...document.querySelectorAll('textarea')].map((el,index)=>({index:index+1,zh:el.value.trim()}));const output={version:1,trackId:data.trackId,sourceHash:data.sourceHash,lines};const blob=new Blob([JSON.stringify(output,null,2)+'\\n'],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=data.trackId+'.reviewed.json';link.click();URL.revokeObjectURL(link.href)};
</script>
</body></html>`;

const output = path.join(PROJECT_ROOT, 'public/__lyrics-review', `${trackId}.html`);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, html, 'utf8');
console.log(`/__lyrics-review/${trackId}.html`);
