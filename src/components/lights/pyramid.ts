// 尺牍信多了（超过四封、非手机）的版面：品字形两排。纯函数，只算屏幕像素，letterScene 再把它落到桌面上。
// 演示与各屏数字见 docs/chidu-many.html。
//
// 上排少、下排多，重心落在下排（原来五封是上三下二，倒三角头重脚轻，加上虚席敞开的封舌在右上，重心往右上飘）。
// 上下差奇数封时上排居中、差偶数封时上排右挪半步，都嵌在下排的缝上。整组中轴尽量对着屏幕中线（Dock、读信都在中线上），
// 只在上排会碰到页头的字时往右让，让到刚好不碰；下排在页头底下，可以伸到左边距。
import { hash, rnd } from '../../lib/paper/rand';

/** 信封的尺寸（世界单位）：宽、高、封舌高 */
export interface EnvelopeSize { W: number; H: number; FH: number }
/** 页头的字实际占到哪儿（屏幕像素，相对画布） */
export interface HeadBox { top: number; bottom: number; right: number }
export interface Pyramid {
  /** 信封高、相邻两封的步长、第一排顶、两排连行距的总高、整组的竖中轴（都是屏幕像素） */
  hs: number; step: number; y0: number; bandH: number; cx: number;
  pos: { row: number; sx: number; sy: number }[];
}

const GAP_X = 1.37;      // 宽裕时一封到下一封的步长（信封宽的几倍）
const PEEK_ROOM = 0.42;  // 第一排上方要留的空：移近时封舌翻开、笺抽出约 0.4 个信封高
const JIT = 1.2;         // 每封随手的错位倍数
const DOCK = 120;        // 底下给 Dock 留的
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** 行距（信封高的几成）：容得下一只敞开的封舌，再疏一点 */
export const rowGap = (E: EnvelopeSize) => (E.FH / E.H) * 0.95 + 0.09;

const pinAt = (E: EnvelopeSize, hs: number, r: number, nt: number, names: string[], w: number, h: number, head: HeadBox): Pyramid | null => {
  const n = names.length, nb = n - nt, even = (nb - nt) % 2 === 0, ws = (hs * E.W) / E.H, step = ws * r;
  const gut = Math.max(40, w * 0.06), bottom = h - DOCK, pad = 10 * JIT;
  if (ws + (nb - 1) * step > w - 2 * gut + 0.5) return null;
  const offT = even ? step / 2 : 0, wT = ws + (nt - 1) * step, wB = ws + (nb - 1) * step, gy = hs * rowGap(E), bandH = 2 * hs + gy;
  const roof = Math.max(PEEK_ROOM * hs + 24, head.top), clear = head.right + 48, under = head.bottom + 28;
  const tryAt = (cx: number, top: number) => {
    if (cx + Math.min(offT - wT / 2, -wB / 2) - pad < gut || cx + Math.max(offT + wT / 2, wB / 2) + pad > w - gut) return null;
    if (bottom - top < bandH) return null;
    const y0 = top + (bottom - top - bandH) / 2;
    if (cx - wB / 2 - pad < clear && y0 + hs + gy < under) return null;   // 下排伸到页头底下时，它的顶也得让开页头
    return { cx, y0 };
  };
  let cx = w / 2;
  if (cx + offT - wT / 2 - pad < clear) cx = clear + wT / 2 - offT + pad;
  const at = tryAt(cx, roof) ?? tryAt(w / 2, Math.max(roof, under));   // 让不开就整组退到页头底下、居中
  if (!at) return null;
  return {
    hs, step, y0: at.y0, bandH, cx: at.cx,
    pos: names.map((nm, i) => {
      const row = i < nt ? 0 : 1, col = row ? i - nt : i, rw = row ? wB : wT, rr = rnd(hash(nm) + 5);
      return { row,
        sx: at.cx + (row ? 0 : offT) - rw / 2 + ws / 2 + col * step + (rr() - 0.5) * 14 * JIT,
        sy: at.y0 + row * (hs + gy) + hs / 2 + (rr() - 0.5) * 16 * JIT };
    }),
  };
};

/**
 * 信封从一排时的大小往下试；每一档先按 GAP_X 摆，摆不下就把步长收一点（七封以内只收到挨着，再多才互压、至多压两成）。
 * 上排几封不定死：从「下排多一两封」试到「下排至多是上排两倍」，信封一样大（差不过 3%）时挑重心离中线近的。
 * 怎么都摆不下（屏太小、或十几封）返回 null，调用方退回老的两行错落。
 */
export const pyramid = (E: EnvelopeSize, names: string[], w: number, h: number, head: HeadBox): Pyramid | null => {
  const n = names.length, cap = clamp(h * 0.4, 240, 380), rMin = n <= 7 ? 1.04 : 0.8;
  let best: Pyramid | null = null;
  for (let nt = Math.floor((n - 1) / 2); nt >= Math.max(1, Math.ceil(n / 3)); nt--) {
    let P: Pyramid | null = null;
    for (let hs = cap; hs >= 120 && !P; hs -= 2) {
      for (let r = GAP_X; r >= rMin - 1e-6 && !P; r -= 0.04) P = pinAt(E, hs, r, nt, names, w, h, head);
    }
    if (P && (!best || P.hs > best.hs * 1.03 || (P.hs > best.hs * 0.97 && Math.abs(P.cx - w / 2) < Math.abs(best.cx - w / 2)))) best = P;
  }
  return best;
};
