// 标本 · 花园列表的封面条。
//   现网：OasisGallery.tsx:1446–1450——情绪色 16%→4% 渐变 + 13% 透明度的分类图标水印。
//   提案：每类一种纸（随笔＝花笺木刻、学习笔记＝帘纹加界格、项目复盘＝云纹缎），素材全是 public/ 里已有的；
//         高度图求法线，逐像素打光：昼＝左上的窗（悬停时随指针偏一点），夜＝烛随指针。色仍是文章的情绪色。
//   栅格：某月只有一篇时占满两列（现网右列整列空着）。
import { supabase } from '/src/lib/supabase.ts';
import { readingMinutes } from '/src/lib/reading.ts';

const CAT = {
  thought: { label: 'Thoughts', zh: '随笔', icon: 'pen', paper: 'blossom' },
  note: { label: 'Notes', zh: '学习笔记', icon: 'book', paper: 'laid' },
  project: { label: 'Projects', zh: '项目复盘', icon: 'tool', paper: 'cloud' },
};
const ICON = {
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/>',
};
const svg = (k, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
const FALLBACK = [
  { id: 'a', title: '建筑杂谈', type: 'thought', color: '#39C5BB', date: 'Oct 5, 2026', minutes: 2, excerpt: '说起建筑，最初是在玩我的世界\n看到自己搭建的单一的火柴盒，与美感相去甚远，便对建筑的艺术充满了好奇。', tags: ['draft'] },
  { id: 'b', title: '给我一颗可以反悔的心', type: 'note', color: '#60A5FA', date: 'Sep 2026', minutes: 13, excerpt: 'COMP3121 第一章。', tags: ['comp3121'] },
  { id: 'c', title: '来日方长', type: 'project', color: '#A78BFA', date: 'Jul 2026', minutes: 9, excerpt: 'Hackathon 一章。', tags: ['hackathon'] },
];
const esc = (t) => String(t ?? '').replace(/[<>&"]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[m]));
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

async function loadPosts() {
  try {
    const { data, error } = await supabase.from('garden_posts').select('id,title,type,color,date,excerpt,tags,content,status,created_at');
    if (error || !data?.length) throw error;
    const pub = data.filter((r) => r.status !== 'draft').sort((a, b) => Number(b.created_at) - Number(a.created_at));
    const pick = ['thought', 'note', 'project'].map((t) => pub.find((r) => r.type === t)).filter(Boolean);
    if (pick.length < 3) throw new Error('few');
    return pick.map((r) => ({ id: r.id, title: r.title, type: r.type, color: r.color || '#39C5BB', date: r.date,
      minutes: readingMinutes(r.content || ''), excerpt: r.excerpt || String(r.content || '').slice(0, 90), tags: r.tags || [], real: true }));
  } catch { return FALLBACK; }
}
const loadImg = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });

export async function mount(host, ctx) {
  const [posts, blossom, laid, cloud] = await Promise.all([loadPosts(), loadImg('/lights/motif/blossom.webp'), loadImg('/lights/tex/laid-n.webp'), loadImg('/textures/ling-cloud.webp')]);
  const IMG = { blossom, laid, cloud };
  host.innerHTML = `
  <style>
    .cv { position:absolute; inset:0; overflow:auto; padding:56px 32px 110px; }
    .cv-col { max-width:832px; margin:0 auto; }
    .cv-grp { display:flex; align-items:center; gap:16px; margin:0 0 22px; font:10px/1 var(--mono); letter-spacing:.35em; text-transform:uppercase; color:var(--ink3); }
    .cv-grp::after { content:""; flex:1; height:1px; background:linear-gradient(to right, var(--line2), transparent); }
    .cv-grid { display:grid; grid-template-columns:1fr 1fr; gap:32px; align-items:start; margin-bottom:48px; }
    .cv-card { position:relative; border-radius:24px; overflow:hidden; border:1px solid rgba(15,23,42,.06); background:rgba(255,255,255,.82);
      box-shadow:0 1px 2px rgba(30,41,59,.04), 0 10px 28px -14px rgba(30,41,59,.12); transition:transform .45s var(--e-out), box-shadow .45s var(--e-out); }
    .cv-card:hover { transform:translateY(-6px) scale(1.02); box-shadow:0 20px 40px rgba(0,0,0,.05), 0 0 30px color-mix(in srgb, var(--c) 9%, transparent); }
    body.night .cv-card { background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.1); box-shadow:none; }
    .cv-card.wide { grid-column:1 / -1; }
    .cv-cover { position:relative; height:112px; overflow:hidden; }
    .cv-card.wide .cv-cover { height:132px; }
    .cv-cover .g { position:absolute; inset:0; background:linear-gradient(135deg, color-mix(in srgb, var(--c) 16%, transparent), color-mix(in srgb, var(--c) 4%, transparent) 55%, transparent); }
    .cv-cover .wm { position:absolute; right:-12px; bottom:-24px; width:112px; height:112px; color:var(--c); opacity:.13; }
    body.night .cv-cover .wm { opacity:.16; }
    .cv-cover canvas { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .cv-badge { position:absolute; top:16px; left:24px; display:flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; background:rgba(255,255,255,.7); border:1px solid rgba(255,255,255,.6);
      backdrop-filter:blur(4px); color:color-mix(in srgb, var(--k) 70%, #1E293B); font:8px/1 var(--mono); letter-spacing:.2em; text-transform:uppercase; }
    body.night .cv-badge { background:rgba(0,0,0,.5); border-color:rgba(255,255,255,.1); color:var(--k); }
    .cv-badge svg { width:12px; height:12px; }
    .cv-tags { position:absolute; bottom:16px; left:24px; display:flex; gap:8px; }
    .cv-tags span { font:9px/1 var(--mono); letter-spacing:.12em; text-transform:uppercase; color:#64748B; background:rgba(255,255,255,.6); padding:4px 8px; border-radius:4px; border:1px solid rgba(255,255,255,.5); }
    body.night .cv-tags span { background:rgba(0,0,0,.6); color:#CBD5E1; border-color:rgba(255,255,255,.1); }
    .cv-body { padding:28px 32px 30px; }
    .cv-meta { font:10px/1 var(--mono); letter-spacing:.2em; text-transform:uppercase; color:var(--ink3); margin-bottom:16px; }
    .cv-body h4 { margin:0 0 14px; font:500 23px/1.4 var(--zh); color:var(--ink); }
    .cv-body p { margin:0; font-size:14px; line-height:1.75; color:var(--ink2); display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; white-space:pre-line; }
    .cv-note { margin:-30px 0 40px; font-size:12px; color:var(--ink3); }
    @media (max-width: 760px) { .cv-grid { grid-template-columns:1fr; } .cv { padding:48px 16px 110px; } }
  </style>
  <div class="cv"><div class="cv-col">
    <div class="cv-grp">某月只有一篇 · 1</div><div class="cv-grid g1"></div><p class="cv-note n1"></p>
    <div class="cv-grp">某月两篇 · 2</div><div class="cv-grid g2"></div>
  </div></div>`;
  const g1 = host.querySelector('.g1'), g2 = host.querySelector('.g2'), n1 = host.querySelector('.n1');
  let mode = ctx.v, night = ctx.night, cards = [];
  const KC = { thought: '#39C5BB', note: '#60A5FA', project: '#A78BFA' };

  const cardHtml = (p) => { const c = CAT[p.type] ?? CAT.thought; return `
    <article class="cv-card" style="--c:${p.color};--k:${KC[p.type] ?? '#39C5BB'}">
      <div class="cv-cover"><div class="g"></div>${svg(c.icon, 'wm')}<canvas></canvas>
        <div class="cv-badge">${svg(c.icon)}<span>${c.label}</span></div>
        <div class="cv-tags">${(p.tags || []).slice(0, 3).map((t) => `<span>${esc(t)}</span>`).join('')}</div></div>
      <div class="cv-body"><div class="cv-meta">${esc(p.date)} · ${p.minutes} min read</div><h4>${esc(p.title)}</h4><p>${esc(p.excerpt)}</p></div>
    </article>`; };
  g1.innerHTML = cardHtml(posts[0]); g2.innerHTML = cardHtml(posts[1]) + cardHtml(posts[2]);

  /* ── 每张卡：高度图 → 法线（只算一次），光变时逐像素重打 ── */
  const prep = (el, p) => {
    const cover = el.querySelector('.cv-cover'), canvas = cover.querySelector('canvas');
    const card = { el, p, cover, canvas, n: null, alb: null, w: 0, h: 0, hover: null };
    card.build = () => {
      const r = cover.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
      card.w = w; card.h = h; canvas.width = w; canvas.height = h;
      const kind = (CAT[p.type] ?? CAT.thought).paper, img = IMG[kind];
      const off = document.createElement('canvas'); off.width = w; off.height = h;
      const x = off.getContext('2d', { willReadFrequently: true });
      const hgt = new Float32Array(w * h), print = new Float32Array(w * h);
      if (img && kind === 'laid') {
        // 帘纹是法线贴图：直接取 RG 当法线；再加界格（八行笺的竖格）当压线
        const pat = x.createPattern(img, 'repeat'); x.save(); x.scale(dpr * .5, dpr * .5); x.fillStyle = pat; x.fillRect(0, 0, w / dpr * 2, h / dpr * 2); x.restore();
        const d = x.getImageData(0, 0, w, h).data;
        card.n = new Float32Array(w * h * 3);
        const pitch = 34 * dpr;
        for (let i = 0; i < w * h; i++) {
          const px = i % w;
          let nx = (d[i * 4] / 255 * 2 - 1) * .55, ny = -(d[i * 4 + 1] / 255 * 2 - 1) * .55;
          const f = ((px + w * .62) % pitch) / pitch;                   // 界格：一道窄窄的压线
          const ridge = Math.exp(-Math.pow((f - .5) / .012, 2));
          nx += (f < .5 ? 1 : -1) * ridge * .5; print[i] = ridge * .55;
          const nz = 1; const L = Math.hypot(nx, ny, nz); card.n.set([nx / L, ny / L, nz / L], i * 3);
        }
      } else {
        x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
        if (img) {
          if (kind === 'blossom') {                                       // 木刻：白＝墨；偏右放，像笺角的一枝
            const s = h * 1.9 / img.height; x.drawImage(img, w - img.width * s * .92, -h * .45, img.width * s, img.height * s);
          } else {                                                        // 云纹缎：取明度、略模糊当高度
            x.filter = `blur(${dpr * .6}px)`; const s = h * 1.6 / img.height; for (let ox = 0; ox < w; ox += img.width * s) x.drawImage(img, ox, -h * .2, img.width * s, img.height * s); x.filter = 'none';
          }
        }
        const d = x.getImageData(0, 0, w, h).data;
        for (let i = 0; i < w * h; i++) { const v = (d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11) / 255; hgt[i] = v; print[i] = v; }
        if (kind === 'cloud') { let lo = 1, hi = 0; for (const v of hgt) { lo = Math.min(lo, v); hi = Math.max(hi, v); } for (let i = 0; i < hgt.length; i++) { hgt[i] = (hgt[i] - lo) / (hi - lo || 1); print[i] = hgt[i] * .5; } }
        card.n = new Float32Array(w * h * 3);
        const k = (kind === 'blossom' ? 2.4 : 3.2) / dpr;
        for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
          const i = y * w + xx, a = (xx2, yy2) => hgt[Math.min(h - 1, Math.max(0, yy2)) * w + Math.min(w - 1, Math.max(0, xx2))];
          const nx = -(a(xx + 1, y) - a(xx - 1, y)) * k, ny = -(a(xx, y + 1) - a(xx, y - 1)) * k, L = Math.hypot(nx, ny, 1);
          card.n.set([nx / L, ny / L, 1 / L], i * 3);
        }
      }
      card.print = print; card.kind = kind;
      // 纸面细纹：一点点颗粒，免得像塑料
      card.grain = new Float32Array(w * h); for (let i = 0; i < w * h; i++) card.grain[i] = (Math.random() - .5) * .035;
      card.light();
    };
    card.light = () => {
      if (mode !== 'next' || !card.n) return;
      const { w, h } = card, out = new ImageData(w, h), o = out.data, N = card.n, pr = card.print, gr = card.grain;
      const [cr, cg, cb] = rgbOf(p.color);
      const paper = night ? [42, 46, 58] : [250, 247, 240];
      const tint = card.kind === 'cloud' ? .26 : .13;
      const base = paper.map((v, j) => v * (1 - tint) + [cr, cg, cb][j] * tint);
      const ink = [cr * .62, cg * .62, cb * .62], inkA = card.kind === 'blossom' ? .26 : card.kind === 'cloud' ? .16 : .2;
      // 光：昼＝左上平行光，悬停时随指针偏；夜＝点光（烛）在指针处、高出纸面
      const hv = card.hover, dpr = w / card.cover.clientWidth;
      let Ld = [-.5, -.56, .66];
      if (!night && hv) { Ld = [-.5 + (hv.x / w - .5) * .7, -.56 + (hv.y / h - .5) * .5, .66]; }
      const ln = Math.hypot(...Ld); Ld = Ld.map((v) => v / ln);
      const cx = hv ? hv.x : -w * .15, cy = hv ? hv.y : -h * .6, cz = 150 * dpr;
      const lc = night ? [1, .78, .52] : [1, .985, .96];
      for (let i = 0, y = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
        let lx = Ld[0], ly = Ld[1], lz = Ld[2], fall = 1;
        if (night) { lx = cx - x; ly = cy - y; lz = cz; const d = Math.hypot(lx, ly, lz); lx /= d; ly /= d; lz /= d; fall = Math.min(1.25, (cz * 1.9) / d) ** 2; }
        const nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
        const diff = Math.max(0, nx * lx + ny * ly + nz * lz);
        const hz = lz + 1, hl = Math.hypot(lx, ly, hz), spec = Math.max(0, (nx * lx + ny * ly + nz * hz) / hl) ** 40 * .1;
        const amb = night ? .2 : .52, li = (amb + diff * (night ? 1.05 : .62)) * fall + gr[i];
        const a = Math.min(1, pr[i] * inkA * 2.2);
        for (let j = 0; j < 3; j++) o[i * 4 + j] = Math.min(255, ((base[j] * (1 - a) + ink[j] * a) * li * lc[j]) + spec * 255 * fall);
        o[i * 4 + 3] = 255;
      }
      card.canvas.getContext('2d').putImageData(out, 0, 0);
    };
    let raf = 0;
    el.addEventListener('pointermove', (e) => {
      const r = cover.getBoundingClientRect(), s = card.w / r.width;
      card.hover = { x: (e.clientX - r.left) * s, y: (e.clientY - r.top) * s };
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; const t0 = performance.now(); card.light(); ctx.perf(`逐像素打光 ${card.w}×${card.h}\n${(performance.now() - t0).toFixed(1)} ms / 次（悬停与换昼夜时才算）`); });
    });
    el.addEventListener('pointerleave', () => { card.hover = null; requestAnimationFrame(() => card.light()); });
    return card;
  };

  const applyMode = () => {
    const wide = mode === 'next';
    g1.firstElementChild.classList.toggle('wide', wide);
    n1.textContent = wide ? '提案：只有一篇时占满两列，封面条拉长到 132 px。' : '现网：1280 px 以上两列，这一月只有一篇，右列空着。';
    for (const c of cards) {
      c.canvas.style.display = wide ? '' : 'none';
      c.cover.querySelector('.g').style.display = wide ? 'none' : '';
      c.cover.querySelector('.wm').style.display = wide ? 'none' : '';
    }
    requestAnimationFrame(() => { for (const c of cards) c.build(); });
  };
  cards = [...host.querySelectorAll('.cv-card')].map((el, i) => prep(el, posts[i]));
  ctx.bar.innerHTML = `<span style="font-size:12px;color:var(--ink3)">${posts[0].real ? '三篇真文章（Supabase）' : '示例文章'}　·　悬停封面看光</span>`;
  ctx.perf('素材：lights/motif/blossom · lights/tex/laid-n · textures/ling-cloud\n零下载');
  applyMode();
  const ro = new ResizeObserver(() => { if (mode === 'next') for (const c of cards) c.build(); }); ro.observe(host);
  return {
    setMode(v) { mode = v; applyMode(); },
    setNight(n) { night = n; for (const c of cards) c.light(); },
    destroy() { ro.disconnect(); },
  };
}
