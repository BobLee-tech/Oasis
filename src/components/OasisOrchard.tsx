// ✦ 星野 —— 花园的夜间俯瞰。
//
// 它回答的问题和博客列表不一样：列表回答「最近写了什么」（时间轴），
// 星野回答「这里长着什么、彼此如何连接、从哪进去」（地形图）。三层动线，一步一景：
//   L0 一望  这是什么地方 —— 一张有刻边的版：具名星座 + 一等星 + 款识 + 图例 + 闲章
//   L1 认星  这串是什么   —— 悬停亮整条链、浮出成员名；点击开星卡
//   L2 细读  读全文       —— 跳博客阅读舱 #/garden/<id>，星野只做入口
//
// 改这个文件之前请先读五条规矩（完整方案在 docs/redesign-2026-08/04-sky-ye.md）：
//   1) 刻度。字号、墨度、线宽、圆角都只有固定档位，令牌全在 index.css 的 .oasis-sky 里。
//      新增数字之前先问能不能复用已有档位。
//   2) 昼夜是同一张天，只换光与墨。几何、构图、注记两态完全共用；
//      夜里是发光的星野，白天是墨分五色的刻本。不要为某一态单独加形状。
//   3) 相机的平移缩放永远不进 React。viewRef + 直接写 style.transform + CSS 变量
//      --sky-scale，注记的反向缩放交给 calc() 让浏览器算。
//   4) 命中区由数据层保证互不相交（constellation.ts 的 hitR），这里只做「最近邻拾取」。
//   5) 版面是默认也是唯一的底图。时间尺、待照料都是默认关闭的图层，不是底图的一部分。
//
//   ⚠️ 两个反复踩过的坑：
//      · color-mix() 写在 SVG 的表现属性里不解析，fill 会静默变纯黑——只能走 CSS。
//      · 字号锁屏幕、间距写 viewBox 单位 = 相机缩小时行距只剩几成。凡是与恒定屏幕尺寸的
//        字有关的间距，都要乘 1/ctm.a（下面的 k）。注记避让必须在 fit() 之后用 getBBox() 量。
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useGarden, filterVisible, type BlogPost } from '../hooks/useGarden';
import { useCategories } from '../hooks/useCategories';
import { readingMinutes } from '../lib/reading';
import { currentSolarTerm } from '../lib/solarTerms';
import { formatHash } from '../lib/route';
import {
  buildGraph, plateBounds, seeded, solarYearPosition, type GNode,
} from '../lib/constellation';

interface OasisOrchardProps {
  isAdmin: boolean;
  itemId?: string;
  onNavigate?: (itemId?: string) => void;
  onCreatePost?: (title: string) => void;
}

const VW = 1000, VH = 700;
const HINT_KEY = 'oasis_sky_hint_seen';
const DAY = 86_400_000;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// 分类 → 色相令牌。三档，对齐 gallery 的分类 chip。
const TINT: Record<string, string> = {
  note: 'var(--sky-cat-note)', project: 'var(--sky-cat-proj)', thought: 'var(--sky-cat-essay)',
};
const tintOf = (post: BlogPost) => TINT[post.type || 'thought'] ?? 'var(--sky-cat-essay)';
const magOf = (node: GNode) => clamp(Math.round(node.magnitude ?? 1), 1, 5);

// 四角尖芒。内半径 .15——再大成菱形，再小成十字线。
const SPARK = 'M0,-1C.06,-.34 .34,-.06 1,0C.34,.06 .06,.34 0,1C-.06,.34 -.34,.06 -1,0C-.34,-.06 -.06,-.34 0,-1Z';
const RPX = [2.4, 2.9, 3.6, 4.6, 6.4];

const growthLabel: Record<BlogPost['growth'], string> = {
  seedling: '种子', growing: '生长中', evergreen: '常青',
};
const tendedLabel = (updatedAt: number, now: number) => {
  const days = Math.max(0, Math.floor((now - updatedAt) / DAY));
  if (days === 0) return '今日照料';
  if (days < 30) return `${days} 天前照料`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前照料`;
  return `${Math.floor(days / 365)} 年前照料`;
};
const CN = '零一二三四五六七八九十'.split('');
const cnNum = (n: number): string =>
  n <= 10 ? CN[n]
    : n < 20 ? `十${n % 10 ? CN[n % 10] : ''}`
      : n < 100 ? `${CN[Math.floor(n / 10)]}十${n % 10 ? CN[n % 10] : ''}`
        : String(n);

const excerptOf = (post: BlogPost) => {
  if (post.excerpt?.trim()) return post.excerpt.trim();
  return post.content
    .replace(/```[\s\S]*?```/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/[#>*_`~-]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, 84);
};

// —— 媒体查询：窄屏不做星野，整块撤掉 ——
const subscribeNarrow = (notify: () => void) => {
  const q = window.matchMedia('(max-width: 767px)');
  q.addEventListener('change', notify);
  return () => q.removeEventListener('change', notify);
};
const isNarrow = () => window.matchMedia('(max-width: 767px)').matches;
const narrowServerSnapshot = () => false;

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box, pad = 6) =>
  a.x < b.x + b.width + pad && b.x < a.x + a.width + pad
  && a.y < b.y + b.height + pad && b.y < a.y + a.height + pad;

// 八方位择位的候选，优先级照制图学的老规矩：右上 → 左上 → 右下 → 左下 → 上 → 下 → 右 → 左
const CAND: [number, number, 'start' | 'end' | 'middle'][] = [
  [1, -0.72, 'start'], [-1, -0.72, 'end'], [1, 1.05, 'start'], [-1, 1.05, 'end'],
  [0, -1.15, 'middle'], [0, 1.5, 'middle'], [1, 0.28, 'start'], [-1, 0.28, 'end'],
];

const PRINCIPAL = ['立春', '春分', '立夏', '夏至', '立秋', '秋分', '立冬', '冬至'];

export const OasisOrchard: React.FC<OasisOrchardProps> = ({ isAdmin, itemId, onNavigate, onCreatePost }) => {
  const reduceMotion = !!useReducedMotion();
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, narrowServerSnapshot);
  const { posts: rawPosts } = useGarden();
  const posts = useMemo(() => filterVisible(rawPosts, isAdmin), [rawPosts, isAdmin]);
  const { metaOf } = useCategories();
  const typeColor = useCallback((p: BlogPost) => metaOf(p.type || 'thought').color, [metaOf]);
  const graph = useMemo(() => buildGraph(posts, typeColor), [posts, typeColor]);
  const [now] = useState(() => Date.now());

  const [localId, setLocalId] = useState<string | null>(itemId ?? null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [ruler, setRuler] = useState(false);
  const [care, setCare] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [zoomTier, setZoomTier] = useState(0);          // 0 全图 / 1 凑近 / 2 很近
  const [hintOn, setHintOn] = useState(() => {
    try { return !localStorage.getItem(HINT_KEY); } catch { return true; }
  });

  // 路由 → 选中态。用渲染期调整而不是 effect：effect 里 setState 会多跑一轮渲染，
  // 而这只是「外部值变了，把派生状态跟上」，React 官方推荐就地调整。
  const [seenItemId, setSeenItemId] = useState(itemId);
  if (itemId !== seenItemId) { setSeenItemId(itemId); setLocalId(itemId ?? null); }

  const svgRef = useRef<SVGSVGElement | null>(null);
  const camRef = useRef<SVGGElement | null>(null);
  const labelRefs = useRef(new Map<string, SVGTextElement>());
  const figRefs = useRef(new Map<string, { name: SVGTextElement; sub: SVGTextElement }>());
  const viewRef = useRef({ k: 1, x: 0, y: 0 });
  const fitKRef = useRef(1);

  // ══ 版心 ═══════════════════════════════════════════════════════════
  const stars = useMemo(() => [...graph.postNodes.values()], [graph]);
  const plate = useMemo(() => plateBounds(stars), [stars]);

  // ══ 星座：合集就是星座，连线就是合集次序 ═════════════════════════════
  const figures = useMemo(() => graph.series
    .filter(s => s.posts.length > 1)
    .map(s => {
      const nodes = s.posts.map(p => graph.postNodes.get(p.id)!).filter(Boolean);
      const cx = nodes.reduce((a, n) => a + n.x, 0) / nodes.length;
      const maxY = Math.max(...nodes.map(n => n.y));
      return { name: s.name, nodes, cx, maxY, ids: new Set(nodes.map(n => n.post!.id)) };
    })
    .sort((a, b) => b.nodes.length - a.nodes.length), [graph]);

  const figureOf = useCallback((id: string | null) =>
    id ? figures.find(f => f.ids.has(id))?.name ?? null : null, [figures]);

  // ══ 落名的资格（不是配额）：① 全图最亮 ② 某分类的独苗 ══════════════
  const keepNames = useMemo(() => {
    const keep = new Set<string>();
    if (!stars.length) return keep;
    const tally = new Map<string, GNode[]>();
    stars.forEach(n => {
      const k = n.post!.type || 'thought';
      tally.set(k, [...(tally.get(k) ?? []), n]);
    });
    tally.forEach(group => { if (group.length === 1) keep.add(group[0].post!.id); });
    keep.add([...stars].sort((a, b) => magOf(b) - magOf(a))[0].post!.id);
    return keep;
  }, [stars]);

  // ══ 星尘与银河：材质，不是数据 ═══════════════════════════════════════
  // 恒不参与拾取、没有名字、没有连线、尺寸只有数据星的三分之一，
  // 所以不会被误读成文章。少了它，六十篇就是六十个点，永远不会像一片天。
  const dust = useMemo(() => {
    const B = plate, A = -0.46, ca = Math.cos(A), sa = Math.sin(A);
    const cx = B.x + B.width / 2, cy = B.y + B.height / 2;
    const total = Math.round((B.width * B.height) / 1100);
    const tints = ['#DCE8F5', '#F4F1EA', '#F6E3CE'];
    const out: { x: number; y: number; o: number; r: number; c: string }[] = [];
    for (let i = 0; i < total; i++) {
      const x = B.x + seeded(`dx${i}`) * B.width, y = B.y + seeded(`dy${i}`) * B.height;
      const d = Math.abs(-((x - cx) / B.width) * sa + ((y - cy) / B.height) * ca);
      const band = Math.exp(-(d * d) / 0.052);
      if (seeded(`dk${i}`) > 0.06 + band * 0.8) continue;          // 带外抽稀 → 天有疏有密
      // 让路：重要的东西要站在干净的地方
      if (stars.some(q => Math.abs(q.x - x) < 26 && Math.abs(q.y - y) < 26)) continue;
      out.push({
        x, y,
        // 幂律：绝大多数几乎不存在，少数看得清。平均分布是噪点，幂律才是星空。
        o: (0.035 + Math.pow(seeded(`do${i}`), 3.4) * 0.72) * (0.34 + band * 0.95),
        r: 0.34 + Math.pow(seeded(`dr${i}`), 3) * 0.61,
        c: tints[Math.floor(seeded(`dt${i}`) * 3)],
      });
    }
    return out;
  }, [plate, stars]);

  // ══ 相机：全程直写 transform，一次 setState 都没有 ═══════════════════
  const write = useCallback(() => {
    const cam = camRef.current, svg = svgRef.current;
    if (!cam || !svg) return;
    const v = viewRef.current;
    cam.setAttribute('transform', `translate(${v.x} ${v.y}) scale(${v.k})`);
    const m = cam.getScreenCTM();
    svg.style.setProperty('--sky-scale', String(m ? m.a : 1));
    const deep = v.k > fitKRef.current * 1.5;
    const tb = svg.querySelector<SVGGElement>('[data-sky-cartouche]');
    if (tb) tb.style.opacity = deep ? '0' : '1';
  }, []);

  // 取景要给 app 自己的 chrome 让位：顶上是搜索/主题，底下是 Dock。
  // 版心顶到屏幕边的话，款识会被搜索框压住、星座名会藏到 Dock 后面。
  const SAFE = { top: 62, bottom: 118, side: 34 };
  const fit = useCallback(() => {
    const bw = VW - SAFE.side * 2, bh = VH - SAFE.top - SAFE.bottom;
    const k = Math.min(bw / plate.width, bh / plate.height);
    fitKRef.current = k;
    viewRef.current = {
      k,
      x: SAFE.side + (bw - plate.width * k) / 2 - plate.x * k,
      y: SAFE.top + (bh - plate.height * k) / 2 - plate.y * k,
    };
    write();
  // SAFE 是模块级常量语义的字面量，不进依赖
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plate, write]);

  // 版心变了（写了新文章）就回到全图，层级跟着回零——同样走渲染期调整。
  const [seenPlate, setSeenPlate] = useState(plate);
  if (plate !== seenPlate) { setSeenPlate(plate); setZoomTier(0); }
  useEffect(() => {
    const on = () => write();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [write]);

  const toLocal = useCallback((cx: number, cy: number) => {
    const svg = svgRef.current, cam = camRef.current;
    if (!svg || !cam) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = cx; pt.y = cy;
    const m = cam.getScreenCTM();
    return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
  }, []);

  // ══ 注记落位：必须在 fit() 之后量，此时倍率才定得下来 ═══════════════
  const placeLabels = useCallback(() => {
    const cam = camRef.current;
    if (!cam || !stars.length) return;
    const m = cam.getScreenCTM();
    const k = 1 / (m ? m.a : 1);                       // 屏幕 px → viewBox 单位
    const B = plate;
    const inner = { x: B.x + 26, y: B.y + 26, width: B.width - 52, height: B.height - 52 };
    const inside = (b: Box) => b.x > inner.x && b.y > inner.y
      && b.x + b.width < inner.x + inner.width && b.y + b.height < inner.y + inner.height;

    const discs: Box[] = stars.map(q => {
      const r = (RPX[magOf(q) - 1] + 4) * k;
      return { x: q.x - r, y: q.y - r, width: r * 2, height: r * 2 };
    });
    const cartouche = cam.querySelector<SVGGElement>('[data-sky-cartouche] rect');
    const taken: Box[] = cartouche ? [cartouche.getBBox()] : [];

    // 量一次拿宽高，之后所有候选位靠算——每个候选都 getBBox 会触发上千次强制重排
    const metrics = (t: SVGTextElement, x: number, y: number) => {
      t.setAttribute('x', String(x)); t.setAttribute('y', String(y));
      t.setAttribute('text-anchor', 'middle');
      const b = t.getBBox();
      return { w: b.width, h: b.height, dy: b.y - y };
    };
    const boxAt = (mm: { w: number; h: number; dy: number }, x: number, y: number, anc: string): Box => ({
      x: anc === 'start' ? x : anc === 'end' ? x - mm.w : x - mm.w / 2,
      y: y + mm.dy, width: mm.w, height: mm.h,
    });

    const seat = (node: GNode, avoid: Box[]) => {
      const t = labelRefs.current.get(node.post!.id);
      if (!t) return;
      const gap = (RPX[magOf(node) - 1] + 7) * k;
      const mm = metrics(t, node.x, node.y);
      // 压住的面积，用来在「全都不干净」时挑一个最不坏的
      const cost = (b: Box) => {
        let sum = inside(b) ? 0 : 1e6;
        for (const o of [...discs, ...avoid]) {
          const w = Math.min(b.x + b.width, o.x + o.width) - Math.max(b.x, o.x);
          const h = Math.min(b.y + b.height, o.y + o.height) - Math.max(b.y, o.y);
          if (w > 0 && h > 0) sum += w * h;
        }
        return sum;
      };
      let best: { x: number; y: number; anc: string; b: Box } | null = null, bestCost = Infinity;
      for (const [ux, uy, anc] of CAND) {
        const x = node.x + ux * gap;
        const y = node.y + uy * gap * 1.5 + (uy > 0 ? mm.h * 0.55 : 0);
        const b = boxAt(mm, x, y, anc);
        const clean = inside(b)
          && !discs.some(d => overlaps(d, b, 2)) && !avoid.some(o => overlaps(o, b));
        if (clean) {
          t.setAttribute('x', x.toFixed(1)); t.setAttribute('y', y.toFixed(1));
          t.setAttribute('text-anchor', anc);
          avoid.push(b);
          return;
        }
        const c = cost(b);
        if (c < bestCost) { bestCost = c; best = { x, y, anc, b }; }
      }
      // 八个位置全被占：挑压得最少的那个。宁可挨着，也不飞出去拉 150px 引线——
      // 那正是旧版「几行黑色诗句浮在白纸上」的由来。
      if (best) {
        t.setAttribute('x', best.x.toFixed(1)); t.setAttribute('y', best.y.toFixed(1));
        t.setAttribute('text-anchor', best.anc);
        avoid.push(best.b);
      }
    };

    // 第一轮：能同时出现在 L0 的那些（常驻星名），全局互不重叠
    [...stars].filter(n => keepNames.has(n.post!.id)).sort((a, b) => magOf(b) - magOf(a))
      .forEach(n => seat(n, taken));

    // 星座名：在自己那一群下方往下找空位；二十步找不到就收起来，宁可少写也不叠字
    const GAP = 26 * k, SUB = 17 * k, STEP = 19 * k;
    figures.forEach(f => {
      const refs = figRefs.current.get(f.name);
      if (!refs) return;
      const y0 = f.maxY + GAP;
      const m1 = metrics(refs.name, f.cx, y0), m2 = metrics(refs.sub, f.cx, y0 + SUB);
      // 先往下让（名字压在图形下方是老规矩），下面顶到版心边就翻到上方去找。
      // 只往一个方向让的话，贴着版心底边的星座会因为「让不出空位」整块消失，
      // 而它往往正是全图最大的那一串——地图会因此丢掉自己的索引。
      const minY = Math.min(...f.nodes.map(n => n.y));
      const cands = [
        ...Array.from({ length: 20 }, (_, i) => y0 + i * STEP),
        ...Array.from({ length: 20 }, (_, i) => minY - GAP - SUB - i * STEP),
      ];
      let ly = y0, found = false;
      for (const cy of cands) {
        const b1 = boxAt(m1, f.cx, cy, 'middle'), b2 = boxAt(m2, f.cx, cy + SUB, 'middle');
        const bad = !inside(b1) || !inside(b2)
          || discs.some(d => overlaps(d, b1, 2) || overlaps(d, b2, 2))
          || taken.some(o => overlaps(o, b1) || overlaps(o, b2));
        if (!bad) { taken.push(b1, b2); found = true; ly = cy; break; }
      }
      const fy = found ? ly : y0;          // 让不出空位就退回基准位，别停在跑飞的地方
      refs.name.setAttribute('x', f.cx.toFixed(1)); refs.name.setAttribute('y', fy.toFixed(1));
      refs.sub.setAttribute('x', f.cx.toFixed(1)); refs.sub.setAttribute('y', (fy + SUB).toFixed(1));
      // 让不出空位就整块收起来。这一步直接写 DOM：它是「量完之后的结论」，
      // 不是 React 状态——放进 state 会为了一次排版多跑一轮渲染。
      const box = refs.name.parentElement as SVGGElement | null;
      if (box) box.dataset.fit = found ? '1' : '0';
    });

    // 第二轮：各合集成员。同一时刻只有一个合集是亮的，所以只跟第一轮和同集兄弟避让。
    figures.forEach(f => {
      const local = taken.slice();
      [...f.nodes].sort((a, b) => magOf(b) - magOf(a))
        .forEach(n => { if (!keepNames.has(n.post!.id)) seat(n, local); });
    });
    stars.forEach(n => {
      if (!keepNames.has(n.post!.id) && !n.post!.series?.trim()) seat(n, taken);
    });
  }, [stars, figures, keepNames, plate]);


  // ⚠️ 顺序不能反：注记是恒定屏幕尺寸的，只有 fit() 把倍率定下来，
  //    getBBox() 量出来的才是它在图上真实占多宽。
  //    先摆后 fit 的话，所有净空都按错误倍率算，名字会一路让到版心外。
  useEffect(() => { fit(); placeLabels(); }, [fit, placeLabels]);

  // ══ 拾取：最近邻，命中区互不相交，不靠 z 序碰运气 ═══════════════════
  const nearest = useCallback((cx: number, cy: number): GNode | null => {
    const p = toLocal(cx, cy);
    let best: GNode | null = null, bd = Infinity;
    for (const q of stars) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd) { bd = d; best = q; }
    }
    if (!best) return null;
    return bd <= Math.max(best.hitR, 26 / viewRef.current.k) ? best : null;
  }, [stars, toLocal]);

  const dragRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const movedRef = useRef(0);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('[data-sky-ui]')) return;
    const v = viewRef.current;
    dragRef.current = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y };
    movedRef.current = 0;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      movedRef.current = Math.max(movedRef.current, Math.abs(dx) + Math.abs(dy));
      const cam = camRef.current;
      const scale = (cam?.getScreenCTM()?.a ?? 1) / viewRef.current.k;
      viewRef.current.x = d.vx + dx / scale;
      viewRef.current.y = d.vy + dy / scale;
      write();
      return;
    }
    const hit = nearest(e.clientX, e.clientY);
    const id = hit?.post?.id ?? null;
    if (id !== hoverId) setHoverId(id);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const wasDrag = dragRef.current;
    dragRef.current = null;
    if (!wasDrag || movedRef.current >= 5) return;
    const hit = nearest(e.clientX, e.clientY);
    open(hit?.post ?? null);
  };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const p = toLocal(e.clientX, e.clientY);
    const v = viewRef.current;
    const k2 = clamp(v.k * Math.exp(-e.deltaY * 0.0016), fitKRef.current * 0.8, fitKRef.current * 9);
    v.x += p.x * (v.k - k2); v.y += p.y * (v.k - k2); v.k = k2;
    write();
    const z = k2 / fitKRef.current;
    setZoomTier(z > 2.6 ? 2 : z > 1.5 ? 1 : 0);
  };

  const open = useCallback((post: BlogPost | null) => {
    setLocalId(post?.id ?? null);
    onNavigate?.(post?.id);
    if (hintOn) {
      setHintOn(false);
      try { localStorage.setItem(HINT_KEY, '1'); } catch { /* 隐私模式 */ }
    }
  }, [onNavigate, hintOn]);

  const selected = localId ? graph.postNodes.get(localId)?.post ?? null : null;
  const focusId = localId ?? hoverId;
  const litFig = figureOf(focusId);

  // ══ 极限星等：一屏站得下多少颗星有物理上限，全天图只画到某一等 ═══════
  const limit = zoomTier >= 2 ? 1
    : zoomTier === 1 ? Math.max(1, (stars.length > 100 ? 3 : stars.length > 40 ? 2 : 1) - 1)
      : stars.length > 100 ? 3 : stars.length > 40 ? 2 : 1;
  const figBudget = 5 * (zoomTier >= 1 ? 2 : 1) * (zoomTier >= 2 ? 3 : 1);

  const labelOn = (n: GNode) => {
    const id = n.post!.id;
    if (focusId) return id === focusId || (!!litFig && figureOf(id) === litFig);
    return keepNames.has(id) || (zoomTier >= 1 && magOf(n) >= 5) || (zoomTier >= 2 && magOf(n) >= 4);
  };

  // ══ 时间尺：年轮不删，降成版心底部的一把直尺 ═════════════════════════
  const rulerGeo = useMemo(() => {
    const B = plate;
    const x0 = B.x + 48, x1 = B.x + B.width - 48, y1 = B.y + B.height - 44;
    const years = [...new Set(posts.map(p => new Date(p.createdAt).getFullYear()))].sort();
    const rx = (ts: number) => x0 + (x1 - x0) * solarYearPosition(ts).fraction;
    const ry = (y: number) => y1 - (years.length - 1 - years.indexOf(y)) * 17;
    return { x0, x1, y1, years, rx, ry };
  }, [plate, posts]);

  const term = useMemo(() => currentSolarTerm(new Date(now)).name, [now]);
  const loose = stars.length - figures.reduce((a, f) => a + f.nodes.length, 0);

  if (narrow) {
    // 窄屏不做星野：竖屏上这张横版版心只会缩成一条带，字反而压过图。
    // 与其做一块永远不够好的手机版，不如不做。
    return (
      <section className="oasis-sky absolute inset-0 z-10 flex items-center justify-center px-10 text-center"
        aria-label="知识星图">
        <div className="pointer-events-none absolute inset-5 border-[.5px] border-current opacity-[.16]" />
        <div className="flex flex-col items-center gap-4">
          <div className="font-serif text-2xl tracking-[.42em] indent-[.42em]">星野</div>
          <p className="max-w-[24em] font-mono text-[10px] leading-[2.2] tracking-[.2em] opacity-60">
            这张星图是给宽屏的。<br />请到电脑上展开,或回花园按时间读。
          </p>
          <a href={formatHash('garden')} data-sky-ui
            className="rounded-[2px] border-[.5px] border-current px-3 py-2 font-mono text-[10px] tracking-[.16em] opacity-70 transition-opacity hover:opacity-100">
            ← 回花园
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="oasis-sky absolute inset-0 z-10 overflow-hidden [-webkit-tap-highlight-color:transparent]"
      aria-label="知识星图">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="xMidYMid meet"
        className="oasis-sky-canvas absolute inset-0 h-full w-full touch-none select-none"
        style={{ cursor: hoverId ? 'pointer' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { dragRef.current = null; setHoverId(null); }}
        onWheel={onWheel}
      >
        <defs>
          <radialGradient id="sky-halo-wide">
            <stop offset="0" stopColor="currentColor" stopOpacity=".46" />
            <stop offset="38%" stopColor="currentColor" stopOpacity=".14" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sky-halo-core">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity=".62" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sky-milkyway">
            <stop offset="0" stopColor="#9FC6E8" stopOpacity=".16" />
            <stop offset="55%" stopColor="#9FC6E8" stopOpacity=".05" />
            <stop offset="1" stopColor="#9FC6E8" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g ref={camRef}>
          {/* 版心：空白由边界定义，不由格子丈量 */}
          <rect x={plate.x} y={plate.y} width={plate.width} height={plate.height}
            className="oasis-sky-hair" strokeOpacity="var(--sky-plate)" />
          <rect x={plate.x + 8} y={plate.y + 8} width={plate.width - 16} height={plate.height - 16}
            className="oasis-sky-hair oasis-sky-innerrule" strokeOpacity="var(--sky-o1)" />
          {[[plate.x + 22, plate.y + 22, 1, 1], [plate.x + plate.width - 22, plate.y + 22, -1, 1],
          [plate.x + 22, plate.y + plate.height - 22, 1, -1],
          [plate.x + plate.width - 22, plate.y + plate.height - 22, -1, -1]].map(([x, y, sx, sy], i) => (
            <path key={`corner${i}`} className="oasis-sky-hair" strokeOpacity="var(--sky-o2)"
              d={`M${x + sx * 18} ${y} L${x} ${y} L${x} ${y + sy * 18}`} />
          ))}

          {/* 银河与星尘：材质，不是数据 */}
          <ellipse cx={0} cy={0} rx={plate.width * 0.55} ry={plate.height * 0.095}
            fill="url(#sky-milkyway)" className="oasis-sky-galaxy"
            transform={`translate(${plate.x + plate.width / 2},${plate.y + plate.height / 2}) rotate(-26.4)`} />
          <g className="oasis-sky-dustlayer" aria-hidden>
            {dust.map((d, i) => (
              <circle key={`d${i}`} cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} className="oasis-sky-dust"
                style={{
                  ['--dt' as string]: d.c,
                  ['--do' as string]: d.o.toFixed(3),
                  r: `calc(${d.r.toFixed(2)}px / var(--sky-scale))`,
                }} />
            ))}
          </g>

          {/* 图层：时间尺。年轮没删，只是不当底图了。 */}
          <g className="oasis-sky-ruler" data-on={ruler ? '1' : '0'} aria-hidden>
            {rulerGeo.years.map(y => (
              <g key={y}>
                <path className="oasis-sky-hair" strokeOpacity="var(--sky-o2)"
                  d={`M${rulerGeo.x0} ${rulerGeo.ry(y)} H${rulerGeo.x1}`} />
                {Array.from({ length: 24 }, (_, i) => {
                  const x = rulerGeo.x0 + (i * (rulerGeo.x1 - rulerGeo.x0)) / 24;
                  return (
                    <path key={i} className="oasis-sky-hair" strokeOpacity="var(--sky-o2)"
                      d={`M${x.toFixed(1)} ${rulerGeo.ry(y)} v${-(i % 3 ? 3 : 6)}`} />
                  );
                })}
                <text className="oasis-sky-tick" x={rulerGeo.x0 - 12} y={rulerGeo.ry(y) + 3}
                  textAnchor="end" fillOpacity="var(--sky-o3)">{y}</text>
              </g>
            ))}
            {PRINCIPAL.map((n, i) => (
              <text key={n} className="oasis-sky-tick" textAnchor="middle" fillOpacity="var(--sky-o3)"
                x={rulerGeo.x0 + (i * (rulerGeo.x1 - rulerGeo.x0)) / 8} y={rulerGeo.y1 + 18}>{n}</text>
            ))}
            {/* 每颗星垂一根线到它真实的节气上：信誉没丢，只是换了地方兑现。
                星多于 40 时只给有名字的画，否则一片毛。 */}
            {stars.filter(n => stars.length <= 40 || keepNames.has(n.post!.id)).map(n => (
              <path key={`drop${n.key}`} className="oasis-sky-drop"
                d={`M${n.x.toFixed(1)} ${(n.y + 8).toFixed(1)} L${rulerGeo.rx(n.post!.createdAt).toFixed(1)} ${(rulerGeo.ry(new Date(n.post!.createdAt).getFullYear()) - 4).toFixed(1)}`} />
            ))}
          </g>

          {/* 合集链：连线就是合集次序，图形是数据长出来的 */}
          <g className="oasis-sky-chains" data-near={zoomTier >= 1 ? '1' : '0'}>
            {figures.map(f => (
              <path key={`chain:${f.name}`} className="oasis-sky-chain"
                data-lit={litFig === f.name ? '1' : '0'}
                d={'M' + f.nodes.map(n => `${n.x.toFixed(1)} ${n.y.toFixed(1)}`).join(' L')} />
            ))}
          </g>

          {/* 星：核 / 内晕 / 外晕 / 芒 —— 四层，不是一个圆 */}
          <g>
            {stars.map(n => {
              const m = magOf(n), R = RPX[m - 1], post = n.post!;
              const dim = !!focusId && post.id !== focusId && figureOf(post.id) !== litFig;
              const far = m < limit && post.id !== focusId && figureOf(post.id) !== litFig;
              const tending = post.growth === 'seedling' || now - post.updatedAt > 30 * DAY;
              return (
                <g key={n.key} data-id={post.id}
                  className="oasis-sky-star-g" data-dim={dim ? '1' : '0'} data-far={far ? '1' : '0'}
                  style={{ ['--tint' as string]: tintOf(post) }}
                  role="button" tabIndex={0}
                  aria-label={`${post.title}，${metaOf(post.type).zh}，${growthLabel[post.growth]}，${tendedLabel(post.updatedAt, now)}`}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(post); } }}
                >
                  <circle cx={n.x} cy={n.y} className="oasis-sky-halo" fill="url(#sky-halo-wide)"
                    style={{ ['--ho' as string]: `var(--sky-ho${m})`, ['--bo' as string]: `var(--sky-bo${m})`,
                      r: `calc(${(R * 4.6).toFixed(2)}px / var(--sky-scale))`,
                      ['--br' as string]: `${(R * 2.9).toFixed(2)}px` }} />
                  <circle cx={n.x} cy={n.y} className="oasis-sky-glow" fill="url(#sky-halo-core)"
                    style={{ ['--ho' as string]: m >= 3 ? '.5' : '0',
                      r: `calc(${(R * 2.1).toFixed(2)}px / var(--sky-scale))` }} />
                  {care && tending && (
                    <circle cx={n.x} cy={n.y} className="oasis-sky-care"
                      style={{ r: `calc(${(R + 5.5).toFixed(2)}px / var(--sky-scale))` }} />
                  )}
                  <circle cx={n.x} cy={n.y} r={R} className="oasis-sky-star"
                    style={{ ['--mixp' as string]: `var(--sky-mix${m})`, ['--dk' as string]: `var(--sky-dk${m})`,
                      r: `var(--sky-r${m})` }} />
                  {m >= 5 && (
                    <g transform={`translate(${n.x} ${n.y})`} aria-hidden>
                      {/* ⚠️ 缩放走 CSS（要锁屏幕尺寸），而 CSS transform 会覆盖 SVG 的
                          transform 属性——所以平移必须留在父组上，两者不能写在同一个元素。 */}
                      <g className="oasis-sky-spark" style={{ ['--kk' as string]: (R * 1.32).toFixed(2) }}>
                        <path className="oasis-sky-blade" d={SPARK} />
                        <path className="oasis-sky-wire" d="M-2.3,0 H2.3 M0,-2.3 V2.3" />
                      </g>
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          {/* 注记。位置由 placeLabels() 在 fit() 之后量着摆。 */}
          <g aria-hidden>
            {stars.map(n => (
              <text key={`lbl:${n.key}`} className="oasis-sky-name" data-on={labelOn(n) ? '1' : '0'}
                x={n.x} y={n.y} textAnchor="middle"
                ref={el => { if (el) labelRefs.current.set(n.post!.id, el); else labelRefs.current.delete(n.post!.id); }}>
                {n.post!.title}
              </text>
            ))}
            {figures.map((f, i) => (
              <g key={`fig:${f.name}`} className="oasis-sky-figlabel"
                data-on={i < figBudget || litFig === f.name ? '1' : '0'} data-fit="1">
                <text className="oasis-sky-figure" textAnchor="middle"
                  fillOpacity={litFig === f.name ? 'var(--sky-o5)' : 'var(--sky-o4)'}
                  x={f.cx} y={f.maxY + 26}
                  ref={el => {
                    const cur = figRefs.current.get(f.name);
                    if (el) figRefs.current.set(f.name, { name: el, sub: cur?.sub as SVGTextElement });
                  }}>{f.name}</text>
                <text className="oasis-sky-tick" textAnchor="middle" fillOpacity="var(--sky-o3)"
                  x={f.cx} y={f.maxY + 44}
                  ref={el => {
                    const cur = figRefs.current.get(f.name);
                    if (el) figRefs.current.set(f.name, { name: cur?.name as SVGTextElement, sub: el });
                  }}>{cnNum(f.nodes.length)}星一串</text>
              </g>
            ))}
          </g>

          {/* 款识与图例：刻本上款识占的是一块「留出来的空」。
              图例用的是和图上完全同一支笔，所以它不会说谎。 */}
          <g data-sky-cartouche transform={`translate(${plate.x + 44} ${plate.y + 54})`}>
            <g className="oasis-sky-fixed">
              <rect x={-18} y={-30} width={224} height={190} className="oasis-sky-cartouche-frame" />
              <text className="oasis-sky-cz" x={0} y={0} fillOpacity="var(--sky-o5)">星野</text>
              <text className="oasis-sky-cm" x={2} y={24} fillOpacity="var(--sky-o4)">{`${term} · 花园第 ${cnNum(Math.max(1, Math.round((now - Math.min(...posts.map(p => p.createdAt), now)) / DAY)))} 日`}</text>
              <text className="oasis-sky-ck" x={2} y={42} fillOpacity="var(--sky-o3)">
                {`${cnNum(stars.length)} 星 · ${cnNum(figures.length)} 集 · ${cnNum(loose)} 散`}
              </text>
              <path className="oasis-sky-hair" d="M0 58 H208" strokeOpacity="var(--sky-o1)" />
              {[1, 2, 3, 4, 5].map((m, i) => (
                <g key={`lg${m}`} style={{ ['--tint' as string]: 'var(--sky-cat-note)' }}>
                  <circle cx={8 + i * 17} cy={78} r={RPX[m - 1]} className="oasis-sky-star oasis-sky-fixedstar"
                    style={{ ['--mixp' as string]: `var(--sky-mix${m})`, ['--dk' as string]: `var(--sky-dk${m})` }} />
                </g>
              ))}
              <text className="oasis-sky-ck" x={104} y={81} fillOpacity="var(--sky-o3)">星等 · 依篇幅</text>
              <path className="oasis-sky-chain oasis-sky-fixedchain" d="M4 100 L20 94 L36 102 L52 96" />
              <text className="oasis-sky-ck" x={104} y={101} fillOpacity="var(--sky-o3)">连线 · 合集次序</text>
              {(['note', 'project', 'thought'] as const).map((c, i) => (
                <g key={c} style={{ ['--tint' as string]: TINT[c] }}>
                  <circle cx={8} cy={120 + i * 15} r={RPX[2]} className="oasis-sky-star oasis-sky-fixedstar"
                    style={{ ['--mixp' as string]: 'var(--sky-mix3)', ['--dk' as string]: 'var(--sky-dk3)' }} />
                  <text className="oasis-sky-ck" x={22} y={123 + i * 15} fillOpacity="var(--sky-o3)">
                    {metaOf(c).zh}
                  </text>
                </g>
              ))}
            </g>
          </g>

          {/* 闲章：落在款识的对角，永远躲开右下角——那儿是抽屉的地盘 */}
          <g transform={`translate(${plate.x + 60} ${plate.y + plate.height - 104})`} aria-hidden>
            <rect width={36} height={36} rx={1} className="oasis-sky-sealbox" />
            <text x={18} y={25} textAnchor="middle" fontSize={17} className="oasis-sky-sealchar">洲</text>
          </g>
        </g>
      </svg>

      {/* ══ 版面之外的 chrome ══════════════════════════════════════════ */}
      <div data-sky-ui className="pointer-events-auto absolute bottom-28 right-6 z-20 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <button onClick={() => setRuler(v => !v)} aria-pressed={ruler} className="oasis-sky-btn">◎ 时间尺</button>
          <button onClick={() => setCare(v => !v)} aria-pressed={care} className="oasis-sky-btn">◎ 待照料</button>
        </div>
        <div className="flex gap-2">
          {isAdmin && graph.signals.length > 0 && (
            <button onClick={() => setNotesOpen(v => !v)} aria-pressed={notesOpen} className="oasis-sky-btn">
              观测手记 {graph.signals.length}
            </button>
          )}
          <button onClick={() => { open(null); fit(); setZoomTier(0); }} className="oasis-sky-btn">全图</button>
        </div>
      </div>

      {hintOn && (
        <p className="pointer-events-none absolute bottom-28 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap font-mono text-[9.5px] uppercase tracking-[.2em] opacity-40">
          拖动平移 · 滚轮缩放 · 悬停认星 · 点击开卡
        </p>
      )}

      {isAdmin && notesOpen && graph.signals.length > 0 && (
        <div data-sky-ui className="absolute left-6 bottom-28 z-20 max-h-[46vh] w-[300px] overflow-y-auto rounded-[2px] border-[.5px] border-current/20 bg-[color-mix(in_srgb,var(--sky-lo)_88%,transparent)] p-4 backdrop-blur-lg">
          <p className="mb-3 font-mono text-[9.5px] uppercase tracking-[.22em] opacity-60">观测手记</p>
          <ul className="space-y-3">
            {graph.signals.slice(0, 12).map(s => (
              <li key={s.id}>
                <button data-sky-ui className="text-left"
                  onClick={() => {
                    if (s.kind === 'pending' && s.pendingTitle) { onCreatePost?.(s.pendingTitle); return; }
                    const first = s.postIds[0];
                    if (first) open(graph.postNodes.get(first)?.post ?? null);
                  }}>
                  <span className="block font-serif text-[13px] leading-relaxed">{s.title}</span>
                  <span className="block text-[11px] leading-relaxed opacity-60">{s.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <motion.aside
            key={selected.id}
            data-sky-ui
            initial={reduceMotion ? false : { opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 14 }}
            transition={{ duration: 0.32, ease: [0.2, 0.7, 0.3, 1] }}
            className="absolute right-6 top-1/2 z-30 w-[336px] max-w-[calc(100vw-40px)] -translate-y-1/2 rounded-[2px] border-[.5px] border-current/20 bg-[color-mix(in_srgb,var(--sky-lo)_88%,transparent)] p-6 backdrop-blur-lg"
            aria-label="星卡"
          >
            {(() => {
              const fig = figures.find(f => f.ids.has(selected.id));
              const idx = fig ? fig.nodes.findIndex(n => n.post!.id === selected.id) : -1;
              return (
                <>
                  <p className="mb-2 font-mono text-[9.5px] uppercase tracking-[.22em] text-[var(--sky-accent-text)]">
                    {fig ? `${fig.name} · 第 ${cnNum(idx + 1)} 章` : metaOf(selected.type).zh}
                  </p>
                  <h2 className="mb-3 font-serif text-[21px] font-normal leading-[1.5] tracking-[.04em]">
                    {selected.title}
                  </h2>
                  <p className="mb-4 font-mono text-[9.5px] leading-[1.9] tracking-[.14em] opacity-60">
                    {new Date(selected.createdAt).toLocaleDateString('zh-CN')} · {readingMinutes(selected.content)} 分钟
                    {' · '}{growthLabel[selected.growth]} · {tendedLabel(selected.updatedAt, now)}
                  </p>
                  {excerptOf(selected) && (
                    <p className="mb-5 whitespace-pre-line text-[13.5px] leading-[1.95] opacity-60">
                      {excerptOf(selected)}
                    </p>
                  )}
                  <a href={formatHash('garden', selected.id)} data-sky-ui
                    className="block w-full rounded-[2px] border-[.5px] border-current/25 px-3 py-2.5 font-mono text-[10px] uppercase tracking-[.16em] opacity-70 transition-opacity hover:opacity-100">
                    进阅读舱 →
                  </a>
                  {fig && fig.nodes.length > 1 && (
                    <div className="mt-3 flex justify-between gap-2 font-mono text-[9px] tracking-[.12em] opacity-40">
                      <button data-sky-ui disabled={idx <= 0}
                        onClick={() => open(fig.nodes[idx - 1]?.post ?? null)}>
                        {idx > 0 ? `← ${fig.nodes[idx - 1].post!.title}` : ''}
                      </button>
                      <button data-sky-ui disabled={idx >= fig.nodes.length - 1}
                        onClick={() => open(fig.nodes[idx + 1]?.post ?? null)}>
                        {idx < fig.nodes.length - 1 ? `${fig.nodes[idx + 1].post!.title} →` : ''}
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </motion.aside>
        )}
      </AnimatePresence>
    </section>
  );
};
