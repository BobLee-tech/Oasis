// 全站梳理 · 演示台：路由、光、左栏、右栏。
//   标本各自 mount(host, ctx) → { setMode, setNight, destroy }，画布自建自拆（与现网引擎同一种做法）。
//   ctx.pointer 是舞台坐标里的指针：夜里它就是烛。
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/400-italic.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/klee-one/400.css';
import '@fontsource/im-fell-english-sc/400.css';
import 'lxgw-wenkai-screen-webfont/lxgwwenkaiscreen.css';
import '@free-fonts/zhuque-fangsong/zhuque-fangsong.css';
import { MODULES, FULL } from './notes.js';

const LOAD = {
  petals: () => import('./petals.js'),
  covers: () => import('./covers.js'),
  colophon: () => import('./colophon.js'),
  vinyl: () => import('./vinyl.js'),
  sand: () => import('./sand.js'),
};

const $ = (s) => document.querySelector(s);
const rail = $('#rail'), notes = $('#notes'), spec = $('#spec'), bar = $('#specbar'), stage = $('#stage');
const lightTag = $('#lighttag'), perf = $('#perf');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── 状态：#模块&v=live|next&t=day|night ── */
const parse = () => {
  const [id, ...kv] = location.hash.slice(1).split('&');
  const q = Object.fromEntries(kv.map((s) => s.split('=')));
  const h = new Date().getHours();
  return {
    id: MODULES.some((m) => m.id === id) ? id : 'overview',
    v: q.v === 'live' ? 'live' : 'next',
    night: q.t ? q.t === 'night' : (h >= 19 || h < 6),
  };
};
let state = parse();
const write = () => {
  const h = `#${state.id}&v=${state.v}&t=${state.night ? 'night' : 'day'}`;
  if (location.hash !== h) history.replaceState(null, '', h);
};

/* ── 指针（烛） ── */
const pointer = { x: 0, y: 0, inside: false };
stage.addEventListener('pointermove', (e) => { const r = stage.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.inside = true; });
stage.addEventListener('pointerleave', () => { pointer.inside = false; });

/* ── 左栏 ── */
const groups = [['', ['overview']], ['外壳与入口', ['petals', 'welcome']], ['文章', ['covers', 'colophon']], ['场所', ['vinyl', 'sand', 'atelier', 'letters', 'yuantu']], ['底座', ['base']]];
rail.innerHTML = groups.map(([g, ids]) => (g ? `<div class="grp">${g}</div>` : '') + ids.map((id) => {
  const m = MODULES.find((x) => x.id === id);
  return `<button class="mod" data-id="${m.id}"><span class="nm">${m.name}</span><span class="tag ${m.p.toLowerCase()}">${m.pLabel ?? m.p}</span><span class="hk">${m.hook}</span></button>`;
}).join('')).join('') + `<div class="keys"><kbd>[</kbd> <kbd>]</kbd> 换一处　<kbd>V</kbd> 现网/提案　<kbd>T</kbd> 昼/夜</div>`;
rail.addEventListener('click', (e) => { const b = e.target.closest('.mod'); if (b) go(b.dataset.id); });

/* ── 顶栏 ── */
const segV = $('#segV'), segT = $('#segT');
segV.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setV(b.dataset.v); });
segT.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setNight(b.dataset.t === 'night'); });
const syncTop = () => {
  segV.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === state.v)));
  segT.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.t === 'night') === state.night)));
  document.body.classList.toggle('night', state.night);
  const m = MODULES.find((x) => x.id === state.id);
  segV.style.visibility = m.spec ? 'visible' : 'hidden';
  lightTag.innerHTML = m.spec
    ? `<span class="vtag ${state.v}">${state.v === 'live' ? '现网' : '提案'}</span>${m.light === false ? '' : `<span>光 · <b>${state.night ? (m.nightLight ?? '烛随指针') : (m.dayLight ?? '窗在左上（与尺牍同向）')}</b></span>`}`
    : '';
};

/* ── 梳理全文 ── */
const full = $('#full');
$('#fullSheet').innerHTML = `<button class="x" id="closeFull">合上</button>${FULL}`;
$('#openFull').addEventListener('click', () => { full.hidden = false; $('#closeFull').focus(); });
full.addEventListener('click', (e) => { if (e.target === full || e.target.id === 'closeFull') full.hidden = true; });
full.addEventListener('click', (e) => { const a = e.target.closest('[data-go]'); if (a) { e.preventDefault(); full.hidden = true; go(a.dataset.go); } });

/* ── 换模块 ── */
let cur = null, token = 0;
const ctx = {
  stage, bar, pointer, reduce,
  get night() { return state.night; },
  get v() { return state.v; },
  perf(text) { perf.textContent = text; },
};
async function go(id) {
  state.id = id; write();
  const my = ++token;
  try { cur?.destroy(); } catch (e) { console.warn(e); }
  cur = null; spec.replaceChildren(); bar.replaceChildren(); bar.style.cssText = ''; perf.textContent = '';
  rail.querySelectorAll('.mod').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === id)));
  rail.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const m = MODULES.find((x) => x.id === id);
  notes.innerHTML = m.notes; notes.scrollTop = 0;
  notes.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); go(a.dataset.go); }));
  syncTop();
  if (id === 'overview') { cur = overview(spec); return; }
  if (!m.spec) { cur = placard(spec, m); return; }
  const mod = await LOAD[m.spec]();
  if (my !== token) return;
  cur = await mod.mount(spec, ctx);
  if (my !== token) { cur?.destroy(); cur = null; }
}
function setV(v) { state.v = v; write(); syncTop(); cur?.setMode?.(v); }
function setNight(n) { state.night = n; write(); syncTop(); cur?.setNight?.(n); }

addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape' && !full.hidden) { full.hidden = true; return; }
  const ids = groups.flatMap(([, x]) => x), i = ids.indexOf(state.id);
  if (e.key === ']') go(ids[(i + 1) % ids.length]);
  else if (e.key === '[') go(ids[(i - 1 + ids.length) % ids.length]);
  else if (e.key === 'v' || e.key === 'V') { if (MODULES.find((m) => m.id === state.id).spec) setV(state.v === 'live' ? 'next' : 'live'); }
  else if (e.key === 't' || e.key === 'T') setNight(!state.night);
});
addEventListener('hashchange', () => {
  const s = parse();
  if (s.id !== state.id) { state = s; go(s.id); return; }
  if (s.v !== state.v) setV(s.v);
  if (s.night !== state.night) setNight(s.night);
});

/* ── 总览：一张卡一处 ── */
function overview(host) {
  const box = document.createElement('div'); box.className = 'ov';
  const cards = MODULES.filter((m) => m.id !== 'overview').map((m) => `
    <button class="card" data-go="${m.id}">
      <div class="row"><span class="nm">${m.name}</span><span class="tag ${m.p.toLowerCase()}">${m.pLabel ?? m.p}</span></div>
      <div class="say">${m.say}</div>
      <div class="dots">${['质', '光', '动', '省'].map((k, i) => `<span>${k}<i style="--v:${(m.score?.[i] ?? 0) * 25}%"></i></span>`).join('')}</div>
      <div class="keep">${m.keep}</div>
    </button>`).join('');
  box.innerHTML = `<div class="head"><span class="k">Overview · 十处</span><p>${MODULES[0].say}</p></div><div class="grid">${cards}</div>
    <p class="legend">四根细条是现网的自评（满格 = 已到尺牍的水准）：<b>质</b>＝材料有没有来由，<b>光</b>＝明暗是不是从一个光源来，<b>动</b>＝动得有没有来由，<b>省</b>＝闲着时画不画、显存与流量。P0 看不见、纯更好；P1 看得见、不换相；P2 要你拍板；P3 以后。</p>`;
  box.addEventListener('click', (e) => { const c = e.target.closest('[data-go]'); if (c) go(c.dataset.go); });
  host.append(box);
  return { destroy() {} };
}

/* ── 说明牌：现网截图 + 标注 ── */
function placard(host, m) {
  const p = document.createElement('div'); p.className = 'placard';
  p.innerHTML = m.shot
    ? `<figure><div class="pins"><img src="${m.shot}" alt="${m.name} 现网截图">${(m.pins ?? []).map(([x, y], i) => `<span class="pin" style="left:${x}%;top:${y}%">${i + 1}</span>`).join('')}</div><figcaption>${m.caption ?? ''}</figcaption></figure>`
    : m.stageHtml;
  host.append(p);
  return { destroy() {} };
}

go(state.id);
