// 📜 文章卡的封面条：一条有来由的纸（docs/site-next.html「花园 · 封面」）。
//   每个分类一种纸，素材都是 public/ 里已有、出处在 CREDITS 的：
//     随笔 / 成长 ＝ 花笺：克利夫兰 1932.125《花鸟》木刻（尺牍的笺也用它），木刻的白＝墨，直接当拱花的高度图；
//     学习笔记 / 周报 ＝ 帘纹纸加一道道界格：ambientCG Paper004 的法线贴图（尺牍的信封）；
//     项目复盘 ＝ 云纹缎：Met 69815（工坊封面同一张）。
//   逐像素打光：昼是左上的窗（与尺牍同向），悬停时光随指针偏一点；夜里是烛，跟着指针。色仍是文章自己的情绪色。
//   懒：卡片进视口才画，高度图与法线按尺寸算一次缓存；只在悬停、换昼夜、尺寸变时重打光。
//   没有对应纸的分类（自定义分类）返回 null，卡片保留原来的渐变 + 图标。
import React, { useEffect, useRef } from 'react';
import type { PaperKind as Kind } from './paperKind';

const LIGHTS = ((import.meta.env.VITE_LIGHTS_BASE as string | undefined) || '/lights').replace(/\/$/, '');
const SRC: Record<Kind, string> = {
  blossom: `${LIGHTS}/motif/blossom.webp`,
  laid: `${LIGHTS}/tex/laid-n.webp`,
  cloud: '/textures/ling-cloud.webp',
};
const images = new Map<Kind, Promise<HTMLImageElement | null>>();
const imageOf = (k: Kind) => {
  let p = images.get(k);
  if (!p) {
    p = new Promise((res) => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => res(null); im.src = SRC[k]; });
    images.set(k, p);
  }
  return p;
};

interface Prepared { w: number; h: number; dpr: number; n: Float32Array; print: Float32Array; grain: Float32Array }
const prepared = new Map<string, Promise<Prepared | null>>();

/** 高度图 → 法线（帘纹本身就是法线贴图）；同一种纸同一尺寸只算一次 */
const prepare = (kind: Kind, w: number, h: number, dpr: number) => {
  const key = `${kind}:${w}x${h}`;
  let p = prepared.get(key);
  if (p) return p;
  p = imageOf(kind).then((img) => {
    if (!img) return null;
    const off = document.createElement('canvas'); off.width = w; off.height = h;
    const x = off.getContext('2d', { willReadFrequently: true });
    if (!x) return null;
    const N = w * h, n = new Float32Array(N * 3), print = new Float32Array(N), grain = new Float32Array(N);
    for (let i = 0; i < N; i++) grain[i] = (Math.random() - 0.5) * 0.035;
    if (kind === 'laid') {
      x.save(); x.scale(dpr * 0.5, dpr * 0.5); x.fillStyle = x.createPattern(img, 'repeat')!; x.fillRect(0, 0, (w / dpr) * 2, (h / dpr) * 2); x.restore();
      const d = x.getImageData(0, 0, w, h).data, pitch = 34 * dpr;
      for (let i = 0; i < N; i++) {
        const px = i % w, f = ((px + w * 0.62) % pitch) / pitch;
        const ridge = Math.exp(-(((f - 0.5) / 0.012) ** 2));       // 界格：一道窄窄的压线
        const nx = (d[i * 4] / 255 * 2 - 1) * 0.55 + (f < 0.5 ? 1 : -1) * ridge * 0.5, ny = -(d[i * 4 + 1] / 255 * 2 - 1) * 0.55;
        const L = Math.hypot(nx, ny, 1); n[i * 3] = nx / L; n[i * 3 + 1] = ny / L; n[i * 3 + 2] = 1 / L;
        print[i] = ridge * 0.55;
      }
      return { w, h, dpr, n, print, grain };
    }
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    if (kind === 'blossom') {
      // 偏右放，像笺角伸进来的一枝
      const s = (h * 1.9) / img.height; x.drawImage(img, w - img.width * s * 0.92, -h * 0.45, img.width * s, img.height * s);
    } else {
      x.filter = `blur(${dpr * 0.6}px)`; const s = (h * 1.6) / img.height;
      for (let ox = 0; ox < w; ox += img.width * s) x.drawImage(img, ox, -h * 0.2, img.width * s, img.height * s);
      x.filter = 'none';
    }
    const d = x.getImageData(0, 0, w, h).data, hgt = new Float32Array(N);
    let lo = 1, hi = 0;
    for (let i = 0; i < N; i++) { const v = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255; hgt[i] = v; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (kind === 'cloud') for (let i = 0; i < N; i++) hgt[i] = (hgt[i] - lo) / (hi - lo || 1);
    const k = (kind === 'blossom' ? 2.4 : 3.2) / dpr;
    const at = (xx: number, yy: number) => hgt[Math.min(h - 1, Math.max(0, yy)) * w + Math.min(w - 1, Math.max(0, xx))];
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const i = yy * w + xx, nx = -(at(xx + 1, yy) - at(xx - 1, yy)) * k, ny = -(at(xx, yy + 1) - at(xx, yy - 1)) * k, L = Math.hypot(nx, ny, 1);
      n[i * 3] = nx / L; n[i * 3 + 1] = ny / L; n[i * 3 + 2] = 1 / L;
      print[i] = kind === 'cloud' ? hgt[i] * 0.5 : hgt[i];
    }
    return { w, h, dpr, n, print, grain };
  });
  prepared.set(key, p);
  return p;
};

const rgbOf = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [57, 197, 187];
  const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/** 灯：x、y 是指针（已缓动），s 是烛的强弱 0–1（移入点亮、移出熄灭都渐变） */
interface Lamp { x: number; y: number; s: number }

/** 高光处软肩：不再一刀切到 255，亮处留层次 */
const shoulder = (v: number) => (v < 200 ? v : 200 + 55 * (1 - Math.exp((200 - v) / 55)));

/** 逐像素打光：昼＝左上平行光（悬停时随指针偏）；夜＝淡冷的天光，悬停时再叠一支指针处的烛。
 *  烛照的是纸本来的白（夜里暗是因为没光，不是纸变黑），所以光圈里是暖的纸色而不是发灰的褐；
 *  衰减按点光高出纸面的平方反比，中心不削顶、没有圈边，离烛越远色温越低。 */
const light = (ctx: CanvasRenderingContext2D, P: Prepared, kind: Kind, color: string, night: boolean, lamp: Lamp) => {
  const { w, h, n: N, print: pr, grain: gr, dpr } = P, out = ctx.createImageData(w, h), o = out.data;
  const c = rgbOf(color), tint = kind === 'cloud' ? 0.26 : 0.13;
  const tinted = (paper: number[]) => paper.map((v, j) => v * (1 - tint) + c[j] * tint);
  const base = tinted(night ? [42, 46, 58] : [250, 247, 240]), albedo = tinted([250, 247, 240]);
  const ink = c.map((v) => v * 0.62), inkA = kind === 'blossom' ? 0.26 : kind === 'cloud' ? 0.16 : 0.2;
  const s = lamp.s;
  let Ld = [-0.5, -0.56, 0.66];
  if (!night && s > 0) Ld = [-0.5 + (lamp.x / w - 0.5) * 0.7 * s, -0.56 + (lamp.y / h - 0.5) * 0.5 * s, 0.66];
  const ln = Math.hypot(Ld[0], Ld[1], Ld[2]); Ld = Ld.map((v) => v / ln);
  const lc = night ? [0.78, 0.84, 0.96] : [1, 0.985, 0.96];
  const amb = night ? 0.34 * (1 - 0.3 * s) : 0.52, kd = night ? 0.5 : 0.62;
  const candle = night && s > 0.002, cz = 150 * dpr, cz2 = cz * cz, I = 0.44 * s;
  for (let i = 0, y = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    const nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
    const diff = Math.max(0, nx * Ld[0] + ny * Ld[1] + nz * Ld[2]);
    const hz = Ld[2] + 1, hl = Math.hypot(Ld[0], Ld[1], hz), spec = Math.max(0, (nx * Ld[0] + ny * Ld[1] + nz * hz) / hl) ** 40 * 0.1;
    const li = amb + diff * kd + gr[i];
    const a = Math.min(1, pr[i] * inkA * 2.2);
    if (!candle) {
      for (let j = 0; j < 3; j++) o[i * 4 + j] = Math.min(255, (base[j] * (1 - a) + ink[j] * a) * li * lc[j] + spec * 255);
    } else {
      let lx = lamp.x - x, ly = lamp.y - y;
      const d2 = lx * lx + ly * ly + cz2, d = Math.sqrt(d2); lx /= d; ly /= d; const lz = cz / d;
      const fall = (cz2 / d2) ** 1.3;                                    // 正下方 1，向外平滑落下
      const cd = Math.max(0, nx * lx + ny * ly + nz * lz) * 0.85 + 0.15;  // 留一点包裹光，凹处不至于死黑
      const ch = lz + 1, cl = Math.hypot(lx, ly, ch), cs = Math.max(0, (nx * lx + ny * ly + nz * ch) / cl) ** 48 * 0.09;
      const E = I * cd * fall * (1 + gr[i] * 2), sp = cs * fall * s * 255;
      const warm = [1, 0.6 + 0.22 * fall, 0.28 + 0.28 * fall];           // 近处偏金白，远处偏橙
      for (let j = 0; j < 3; j++) {
        const sky = (base[j] * (1 - a) + ink[j] * a) * li * lc[j] + spec * 255 * (1 - s);
        o[i * 4 + j] = shoulder(sky + ((albedo[j] * (1 - a) + ink[j] * a) * E + sp) * warm[j]);
      }
    }
    o[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
};

const isNight = () => document.documentElement.classList.contains('dark');

export const CoverPaper: React.FC<{ kind: Kind; color: string }> = ({ kind, color }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current, card = canvas?.closest('.oasis-post-card') as HTMLElement | null;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let P: Prepared | null = null, visible = false, hover: { x: number; y: number } | null = null, raf = 0, dead = false, last = 0;
    const lamp: Lamp = { x: 0, y: 0, s: 0 };
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    // 烛跟手有一点点迟（像火苗被带着走），点亮约 0.25s、熄灭约 0.4s；减少动态时直接到位
    const step = (now: number) => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60; last = now;
      const ts = hover ? 1 : 0;
      if (hover && lamp.s < 0.01) { lamp.x = hover.x; lamp.y = hover.y; }
      if (still.matches) { if (hover) { lamp.x = hover.x; lamp.y = hover.y; } lamp.s = ts; return false; }
      const kp = 1 - Math.exp(-dt / 0.07), ks = 1 - Math.exp(-dt / (hover ? 0.09 : 0.14));
      if (hover) { lamp.x += (hover.x - lamp.x) * kp; lamp.y += (hover.y - lamp.y) * kp; }
      lamp.s += (ts - lamp.s) * ks;
      if (Math.abs(ts - lamp.s) < 0.004) lamp.s = ts;
      return lamp.s !== ts || (!!hover && Math.hypot(hover.x - lamp.x, hover.y - lamp.y) > 0.5);
    };
    const paint = (now: number) => {
      raf = 0;
      if (dead || !P || !visible) { last = 0; return; }
      const more = step(now), night = isNight();
      light(ctx, P, kind, color, night, lamp);
      // 光圈不止于封面条：卡身上再铺一层同心的暖晕（index.css 的 .oasis-post-card::after）
      if (card) {
        const k = 1 / (P.w / (canvas.offsetWidth || 1));
        card.style.setProperty('--candle-x', `${lamp.x * k}px`);
        card.style.setProperty('--candle-y', `${lamp.y * k}px`);
        card.style.setProperty('--candle', night ? lamp.s.toFixed(3) : '0');
      }
      if (more) raf = requestAnimationFrame(paint); else last = 0;
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const build = () => {
      const r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(2, Math.round(canvas.offsetWidth * dpr)), h = Math.max(2, Math.round(canvas.offsetHeight * dpr));
      if (!r.width) return;
      canvas.width = w; canvas.height = h;
      void prepare(kind, w, h, dpr).then((p) => { if (!dead && p && p.w === canvas.width && p.h === canvas.height) { P = p; schedule(); } });
    };
    const io = new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); if (visible) { if (!P) build(); else schedule(); } }, { rootMargin: '200px' });
    io.observe(canvas);
    const ro = new ResizeObserver(() => { if (visible) build(); }); ro.observe(canvas);
    const mo = new MutationObserver(schedule); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect(), s = canvas.width / (r.width || 1);
      hover = { x: (e.clientX - r.left) * s, y: (e.clientY - r.top) * s }; schedule();
    };
    const onLeave = () => { hover = null; schedule(); };
    card?.addEventListener('pointermove', onMove); card?.addEventListener('pointerleave', onLeave);
    return () => {
      dead = true; cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); mo.disconnect();
      card?.removeEventListener('pointermove', onMove); card?.removeEventListener('pointerleave', onLeave);
    };
  }, [kind, color]);
  return <canvas ref={ref} aria-hidden className="absolute inset-0 w-full h-full" />;
};
