// 🧻 纸的工具箱（画布这一半）：尺牍与园图两个 three.js 引擎共用。只被懒加载的场所引用，three 不进首屏。
import * as THREE from 'three';

export const mk = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
export const ctx2d = (c: HTMLCanvasElement, read = false) => c.getContext('2d', read ? { willReadFrequently: true } : undefined)!;
/** 读一张图，并在后台解码好再交出：不然第一次 drawImage / 传进显卡时才在主线程同步解码，正好卡在进场那几帧 */
export const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const im = new Image(); im.decoding = 'async';
  im.onload = () => { im.decode().catch(() => undefined).then(() => res(im)); };
  im.onerror = () => rej(new Error(src)); im.src = src;
});
/** 等 p，最多等 ms（到点就当它好了：字没到齐也先画，宁可退回系统字） */
export const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))]);

export interface PaperOpts { alpha?: number; scale?: number; fleck?: number; edge?: number }
/** 一张纸：底色 × 纸纹（multiply）× 纸屑；四边做旧。paper / fleck 是平铺的灰度纹（园图的引首纸、ambientCG 纸屑） */
export const paperFill = (
  x: CanvasRenderingContext2D, w: number, h: number, baseCol: string,
  tex: { paper: CanvasImageSource; fleck?: CanvasImageSource }, p: PaperOpts = {},
) => {
  const { alpha = 0.6, scale = 1, fleck = 0, edge = 0.1 } = p;
  x.fillStyle = baseCol; x.fillRect(0, 0, w, h);
  x.save(); x.globalCompositeOperation = 'multiply';
  const pat = x.createPattern(tex.paper, 'repeat')!; pat.setTransform(new DOMMatrix().scale(scale)); x.globalAlpha = alpha; x.fillStyle = pat; x.fillRect(0, 0, w, h);
  if (fleck && tex.fleck) { const q = x.createPattern(tex.fleck, 'repeat')!; q.setTransform(new DOMMatrix().scale(scale * 0.7)); x.globalAlpha = fleck; x.fillStyle = q; x.fillRect(0, 0, w, h); }
  if (edge) {
    x.globalAlpha = 1;
    const m = Math.min(w, h) * 0.09;
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, 0, m, 0, 0, w, m], [0, h, 0, h - m, 0, h - m, w, m], [0, 0, m, 0, 0, 0, m, h], [w, 0, w - m, 0, w - m, 0, m, h]]) {
      const g = x.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, `rgba(120,90,50,${edge})`); g.addColorStop(1, 'rgba(120,90,50,0)'); x.fillStyle = g; x.fillRect(rx, ry, rw, rh);
    }
  }
  x.restore();
};

/** 木刻墨版（灰度：白＝墨）→ 有颜色、有透明度的印样（花笺淡印）。颜色按 three 的工作色彩空间取，与原先一致 */
export const printOf = (img: HTMLImageElement, color: string) => {
  const c = mk(img.width, img.height), x = ctx2d(c, true);
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), p = d.data, col = new THREE.Color(color);
  const r = col.r * 255, g = col.g * 255, b = col.b * 255;
  for (let i = 0; i < p.length; i += 4) { const a = p[i]; p[i] = r; p[i + 1] = g; p[i + 2] = b; p[i + 3] = a; }
  x.putImageData(d, 0, 0);
  return c;
};
