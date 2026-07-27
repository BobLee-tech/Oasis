// src/components/OasisOrchard.tsx
// ✦ 知识星座 The Constellation of Thought
// 定位：数字花园的灵魂不是「文章列表」，而是「思想之间的连接」。
//   这里把博客重构成一张知识图谱——
//     · 中心是「你」；
//     · 每个标签是一团星云核心（topic hub）；
//     · 每一篇文章是一颗会发光的星，由它的标签牵引、悬在所属星团里。
//   共享标签的文章彼此邻近，于是「哪些思考彼此关联、哪个主题最核心」一眼可见。
//   悬停一颗星 → 点亮它所在的整个星座；点一个主题 → 聚焦该星团；点一颗星 → 阅读全文。
// 数据与 Garden 博客同源（useGarden / localStorage），同步全部过往。
import React, { useMemo, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useGarden, filterVisible, type BlogPost } from '../hooks/useGarden';
import { useCategories } from '../hooks/useCategories';
import { Markdown } from './Markdown';
import { readingMinutes } from '../lib/reading';
import { extractWikiLinks, buildTitleIndex } from '../lib/wikilinks';
import { tagKey, buildTagCanonicalMap } from '../lib/tags';

interface OasisOrchardProps { isAdmin: boolean; }

const VW = 1000;
const VH = 760;
const CENTER = { x: 500, y: 372 };
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// 确定性哈希：保证布局与浮动相位每次一致，不会每帧乱跳
const seeded = (str: string) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  const x = Math.sin(h) * 10000;
  return x - Math.floor(x);
};

const calcReadingTime = (text: string) => `${readingMinutes(text)} min`;

// 🌱 条目类型 → 颜色 / 中文名：与 Garden 博客共用 useCategories 的同一套数据（含自定义分类），
//    在组件内通过 metaOf 取用，星点据此染类型微光环。

type NodeKind = 'core' | 'tag' | 'post';
interface GNode {
  key: string;
  kind: NodeKind;
  x: number; y: number;
  r: number;
  post?: BlogPost;
  tag?: string;
  count?: number;
  color?: string;
}
interface GLink { a: GNode; b: GNode; color: string; core: boolean; wikilink?: boolean; }

// 双链引用的两篇文章各自的情绪色取中，作为连线颜色——「这条连线属于两颗星」
const blendColor = (a: string, b: string): string => {
  const pa = parseInt(a.replace('#', ''), 16), pb = parseInt(b.replace('#', ''), 16);
  const mix = (shift: number) => Math.round((((pa >> shift) & 255) + ((pb >> shift) & 255)) / 2);
  return `#${[mix(16), mix(8), mix(0)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

// 🌌 构建知识图谱并用轻量力导布局松弛开，得到舒朗、不重叠的星座坐标
//   typeColorOf：星核/连线颜色统一取「文章类型色」，与情绪色 post.color 脱钩——
//   颜色作为唯一编码通道只表达一件事（类型），不然一颗绿星拖着粉线、右上角图例却对不上。
const buildGraph = (posts: BlogPost[], typeColorOf: (post: BlogPost) => string) => {
  // 标签 → 文章：按归一化 key 分组（大小写/全半角/首尾空白差异不再各自长出一团星云），
  //   展示名取该组里出现次数最多的原始写法（见 lib/tags.ts）。
  const canonicalOf = buildTagCanonicalMap(posts.flatMap(p => p.tags));
  const tagMap = new Map<string, BlogPost[]>(); // key: tagKey() 归一化后的标签
  posts.forEach(p => p.tags.forEach(raw => {
    const k = tagKey(raw);
    const arr = tagMap.get(k) ?? tagMap.set(k, []).get(k)!;
    if (!arr.some(x => x.id === p.id)) arr.push(p); // 同篇文章把同义标签写了两遍也只算一次
  }));
  const tagKeys = [...tagMap.keys()];

  const nodes: GNode[] = [];
  const core: GNode = { key: '__core', kind: 'core', x: CENTER.x, y: CENTER.y, r: 26 };
  nodes.push(core);

  // 标签核心：先用黄金角螺旋撒出初值，再交给力导松弛
  const tagNodes = new Map<string, GNode>(); // key: tagKey()
  tagKeys.forEach((k, i) => {
    const ang = i * GOLDEN;
    const rad = 150 + i * 6;
    const n: GNode = {
      key: 'tag:' + k, kind: 'tag', tag: canonicalOf.get(k) ?? k, count: tagMap.get(k)!.length,
      x: CENTER.x + Math.cos(ang) * rad, y: CENTER.y + Math.sin(ang) * rad,
      r: 5 + Math.sqrt(tagMap.get(k)!.length) * 3.4,
    };
    tagNodes.set(k, n); nodes.push(n);
  });

  // 文章星：初值撒在更外圈
  const postNodes = new Map<string, GNode>();
  posts.forEach((p, i) => {
    const ang = i * GOLDEN + 0.6;
    const rad = 230 + seeded(p.id) * 90;
    const n: GNode = {
      key: 'post:' + p.id, kind: 'post', post: p, color: typeColorOf(p),
      x: CENTER.x + Math.cos(ang) * rad, y: CENTER.y + Math.sin(ang) * rad,
      r: 6.5 + Math.min(4.5, p.content.length / 1100),
    };
    postNodes.set(p.id, n); nodes.push(n);
  });

  // 连边：核心 → 标签；标签 → 文章（无标签文章直接连核心，避免孤岛）
  //   连线染「文章类型色」而非情绪色 post.color——与星核、图例保持同一套颜色语义。
  const links: GLink[] = [];
  tagKeys.forEach(k => links.push({ a: core, b: tagNodes.get(k)!, color: '#94a3b8', core: true }));
  posts.forEach(p => {
    const pn = postNodes.get(p.id)!;
    const color = typeColorOf(p);
    const ptKeys = [...new Set(p.tags.map(tagKey))].filter(k => tagNodes.has(k));
    if (ptKeys.length === 0) links.push({ a: core, b: pn, color, core: true });
    else ptKeys.forEach(k => links.push({ a: tagNodes.get(k)!, b: pn, color, core: false }));
  });

  // 🔗 双链 [[标题]]：正文里写下的直接引用，额外画一条引力线，把两颗星彼此拉近——
  //   标签连线呈现「同一主题」，双链连线呈现「作者亲手写下的思想联结」，是两种不同的邻近关系。
  const titleIndex = buildTitleIndex(posts);
  const wikiSeen = new Set<string>();
  posts.forEach(p => {
    const pn = postNodes.get(p.id)!;
    extractWikiLinks(p.content).forEach(title => {
      const target = titleIndex.get(title.trim().toLowerCase());
      if (!target || target.id === p.id) return; // 未命中的标题（虚线种子）不参与布局，只在正文里呈现
      const pairKey = [p.id, target.id].sort().join('|');
      if (wikiSeen.has(pairKey)) return;
      wikiSeen.add(pairKey);
      const tn = postNodes.get(target.id);
      if (tn) links.push({ a: pn, b: tn, color: blendColor(typeColorOf(p), typeColorOf(target)), core: false, wikilink: true });
    });
  });

  // —— 力导松弛：斥力分散 + 弹簧拉近相连节点 + 轻微向心 ——
  //    斥力用空间哈希网格只比较邻近节点，复杂度从 O(n²) 降到近似 O(n)，
  //    迭代次数随规模自适应，几百颗星也能瞬时算完、不阻塞首屏。
  const ITER = nodes.length > 160 ? 140 : nodes.length > 70 ? 220 : 320;
  const CELL = 70; // 网格边长 ≈ 最大节点间距阈值
  for (let it = 0; it < ITER; it++) {
    // 重建空间哈希：key = "col,row" → 该格内的节点
    const grid = new Map<string, GNode[]>();
    for (const n of nodes) {
      const key = `${Math.floor(n.x / CELL)},${Math.floor(n.y / CELL)}`;
      (grid.get(key) ?? grid.set(key, []).get(key)!).push(n);
    }
    for (const A of nodes) {
      const col = Math.floor(A.x / CELL), row = Math.floor(A.y / CELL);
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
        const bucket = grid.get(`${col + dc},${row + dr}`);
        if (!bucket) continue;
        for (const B of bucket) {
          if (A === B) continue;
          let dx = B.x - A.x, dy = B.y - A.y;
          const d = Math.hypot(dx, dy) || 0.01;
          const min = A.r + B.r + (A.kind === 'post' && B.kind === 'post' ? 30 : 40);
          if (d < min) {
            const push = ((min - d) / d) * 0.25; // 0.25 因每对会被双向各处理一次
            dx *= push; dy *= push;
            if (A.kind !== 'core') { A.x -= dx; A.y -= dy; }
            if (B.kind !== 'core') { B.x += dx; B.y += dy; }
          }
        }
      }
    }
    for (const l of links) {
      const L = l.core ? 170 : l.wikilink ? 66 : 84;
      let dx = l.b.x - l.a.x, dy = l.b.y - l.a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const k = ((d - L) / d) * 0.06;
      dx *= k; dy *= k;
      if (l.a.kind !== 'core') { l.a.x += dx; l.a.y += dy; }
      if (l.b.kind !== 'core') { l.b.x -= dx; l.b.y -= dy; }
    }
    for (const n of nodes) {
      if (n.kind === 'core') continue;
      n.x += (CENTER.x - n.x) * 0.004;
      n.y += (CENTER.y - n.y) * 0.004;
    }
  }
  const pad = 64;
  nodes.forEach(n => {
    n.x = Math.max(pad, Math.min(VW - pad, n.x));
    n.y = Math.max(pad, Math.min(VH - pad, n.y));
  });

  return { nodes, links, tagNodes, postNodes, tagMap, core };
};

export const OasisOrchard: React.FC<OasisOrchardProps> = ({ isAdmin }) => {
  const reduceMotion = !!useReducedMotion();
  const { posts: rawPosts, uprootSeed } = useGarden();
  // 🔒 「模拟访客」时把草稿从星图里滤掉，与博客列表一致（真实访客本就拿不到草稿行，见 RLS）
  const posts = useMemo(() => filterVisible(rawPosts, isAdmin), [rawPosts, isAdmin]);
  const { categories, metaOf } = useCategories();
  const typeColor = (t?: string) => metaOf(t || 'thought').color;
  const [activePost, setActivePost] = useState<BlogPost | null>(null);
  const [hoverPostId, setHoverPostId] = useState<string | null>(null);
  const [hoverTag, setHoverTag] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null); // 点击主题锚定聚焦

  // 🔭 缩放 / 平移：滚轮缩放、拖拽平移，大体量时可凑近某片星域细看
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setView(v => {
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const scale = Math.min(3.5, Math.max(0.6, v.scale * factor));
      return { ...v, scale };
    });
  }, []);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // 仅在空白处（非星点/主题按钮）按下才进入平移
    if ((e.target as HTMLElement).closest('button')) return;
    dragRef.current = { x: e.clientX, y: e.clientY, ox: view.x, oy: view.y };
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [view.x, view.y]);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setView(v => ({ ...v, x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }));
  }, []);
  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
  }, []);
  const resetView = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), []);

  const graph = useMemo(() => buildGraph(posts, (p) => typeColor(p.type)), [posts, categories]);
  // 原始标签写法 → 星图里的 canonical 展示名（同 tagKey 归一化组内出现最多的写法）
  const canonicalTagOf = (raw: string) => graph.tagNodes.get(tagKey(raw))?.tag ?? raw;
  const focusTag = activeTag ?? hoverTag;

  // 当前点亮的节点与连边集合：悬停星点亮其所属星座，聚焦主题点亮其星团
  const lit = useMemo(() => {
    const litNodes = new Set<string>();
    const litLinks = new Set<number>();
    const hasFocus = !!(hoverPostId || focusTag);
    if (!hasFocus) return { litNodes, litLinks, hasFocus };

    if (hoverPostId) {
      const p = posts.find(x => x.id === hoverPostId);
      const pn = graph.postNodes.get(hoverPostId);
      if (pn) litNodes.add(pn.key);
      if (p) {
        const tagKeySet = new Set(p.tags.map(tagKey));
        graph.links.forEach((l, idx) => {
          // 双链是唯一一种「文章连文章」的边，悬停任意一端都要点亮（其余边里 post 只会出现在 b 侧）
          if (l.b.key === pn?.key || (l.wikilink && l.a.key === pn?.key)) {
            litLinks.add(idx); litNodes.add(l.a.key); litNodes.add(l.b.key);
          }
        });
        // 点亮同一星座（共享标签）的姐妹星
        p.tags.forEach(t => {
          const k = tagKey(t);
          const tn = graph.tagNodes.get(k);
          if (tn) { litNodes.add(tn.key); (graph.tagMap.get(k) || []).forEach(sp => litNodes.add('post:' + sp.id)); }
        });
        // 顺带点亮核心→这些标签的脉络
        graph.links.forEach((l, idx) => {
          if (l.core && l.b.kind === 'tag' && l.b.tag && tagKeySet.has(tagKey(l.b.tag))) litLinks.add(idx);
        });
      }
    } else if (focusTag) {
      const tn = graph.tagNodes.get(tagKey(focusTag));
      if (tn) litNodes.add(tn.key);
      litNodes.add('__core');
      graph.links.forEach((l, idx) => {
        if (l.a.key === tn?.key || l.b.key === tn?.key) { litLinks.add(idx); litNodes.add(l.a.key); litNodes.add(l.b.key); }
      });
    }
    return { litNodes, litLinks, hasFocus };
  }, [hoverPostId, focusTag, posts, graph]);

  const handleDelete = (id: string) => { uprootSeed(id); setActivePost(null); };

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <motion.div
      className="absolute inset-0 w-full h-full overflow-hidden flex flex-col items-center justify-center z-10"
    >
      {/* 顶部标题 */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 pointer-events-none text-center px-6">
        <span className="font-mono text-[10px] tracking-[0.5em] uppercase text-slate-400/60 dark:text-slate-500">
          The Constellation of Thought
        </span>
        <span className="font-serif italic text-[12px] text-slate-400/70 dark:text-slate-500">
          {posts.length} {posts.length === 1 ? 'star' : 'stars'} · {graph.tagMap.size} {graph.tagMap.size === 1 ? 'topic' : 'topics'} —— 悬停一颗星，点亮它的星座
        </span>
      </div>

      {/* 🌌 星图画布（等比）：滚轮缩放、空白处拖拽平移 */}
      <div
        ref={stageRef}
        className="relative w-full max-w-[1180px] h-[62vh] md:h-auto md:aspect-[1000/760] mx-auto touch-none select-none"
        style={{ cursor: isDragging ? 'grabbing' : posts.length ? 'grab' : 'default' }}
        onWheel={posts.length ? onWheel : undefined}
        onPointerDown={posts.length ? onPointerDown : undefined}
        onPointerMove={posts.length ? onPointerMove : undefined}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* 背景的弥散星云气，随聚焦呼吸 */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[64%] h-[64%] rounded-full blur-[130px] bg-[#39C5BB]/8 dark:bg-[#6EE7B7]/[0.06] pointer-events-none" />

        {posts.length === 0 ? (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 text-center px-8">
            <span className="font-serif italic text-slate-400 dark:text-slate-400 text-lg">The sky is still dark.</span>
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-slate-400/60 dark:text-slate-600">Plant a thought in the Garden to light the first star</span>
          </div>
        ) : (
          <div
            className="absolute inset-0"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: 'center center', transition: isDragging ? 'none' : 'transform 0.18s ease-out' }}
          >
            {/* 连接脉络：SVG 细丝，相连即关联 */}
            <svg
              viewBox={`0 0 ${VW} ${VH}`}
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full pointer-events-none"
              fill="none"
            >
              {graph.links.map((l, idx) => {
                const on = lit.litLinks.has(idx);
                const dim = lit.hasFocus && !on;
                // 轻微弧线，比直线更柔和
                const mx = (l.a.x + l.b.x) / 2;
                const my = (l.a.y + l.b.y) / 2;
                const nx = -(l.b.y - l.a.y), ny = l.b.x - l.a.x;
                const nlen = Math.hypot(nx, ny) || 1;
                const bow = 12;
                const cx = mx + (nx / nlen) * bow;
                const cy = my + (ny / nlen) * bow;
                return (
                  <path
                    key={idx}
                    d={`M${l.a.x} ${l.a.y} Q ${cx} ${cy} ${l.b.x} ${l.b.y}`}
                    stroke={on ? l.color : 'currentColor'}
                    className={on ? '' : 'text-slate-400 dark:text-white/40'}
                    strokeWidth={on ? 1.6 : 1}
                    strokeDasharray={l.wikilink ? '3 4' : undefined}
                    strokeLinecap="round"
                    style={{
                      opacity: on ? 0.6 : dim ? 0.04 : l.wikilink ? 0.2 : 0.12,
                      filter: on ? `drop-shadow(0 0 4px ${l.color})` : 'none',
                      transition: 'opacity 0.45s ease, stroke-width 0.45s ease',
                    }}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>

            {/* ✦ 核心：你 */}
            {(() => {
              const c = graph.core;
              const dim = lit.hasFocus && !lit.litNodes.has('__core');
              return (
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-500"
                  style={{ left: pct(c.x, VW), top: pct(c.y, VH), opacity: dim ? 0.3 : 1 }}
                >
                  <motion.div
                    className="relative rounded-full overflow-hidden border border-white/70 dark:border-white/15 shadow-lg"
                    style={{ width: c.r * 2, height: c.r * 2 }}
                    animate={{ boxShadow: ['0 0 18px rgba(57,197,187,0.35)', '0 0 30px rgba(57,197,187,0.6)', '0 0 18px rgba(57,197,187,0.35)'] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <img src="/avatar.jpg" alt="You" className="w-full h-full object-cover opacity-90" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    <span className="absolute inset-0 bg-[#39C5BB]/20 mix-blend-overlay" />
                  </motion.div>
                </div>
              );
            })()}

            {/* ☁️ 标签核心（主题星云） */}
            {[...graph.tagNodes.values()].map(n => {
              const focused = focusTag === n.tag;
              const dim = lit.hasFocus && !lit.litNodes.has(n.key);
              return (
                <button
                  key={n.key}
                  onClick={() => setActiveTag(prev => (prev === n.tag ? null : n.tag!))}
                  onMouseEnter={() => setHoverTag(n.tag!)}
                  onMouseLeave={() => setHoverTag(null)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center outline-none group transition-opacity duration-500"
                  style={{ left: pct(n.x, VW), top: pct(n.y, VH), opacity: dim ? 0.28 : 1, zIndex: 20 }}
                >
                  {/* 星云核 */}
                  <span className="relative flex items-center justify-center" style={{ width: n.r * 2, height: n.r * 2 }}>
                    <span
                      className="absolute inset-[-60%] rounded-full blur-md transition-opacity duration-500"
                      style={{ background: 'radial-gradient(circle, rgba(148,163,184,0.5) 0%, transparent 70%)', opacity: focused ? 0.9 : 0.4 }}
                    />
                    <span
                      className="relative w-full h-full rounded-full border transition-all duration-300"
                      style={{
                        borderColor: focused ? '#cbd5e1' : 'rgba(148,163,184,0.6)',
                        background: focused ? 'rgba(203,213,225,0.9)' : 'rgba(148,163,184,0.35)',
                        boxShadow: focused ? '0 0 14px rgba(203,213,225,0.7)' : 'none',
                      }}
                    />
                  </span>
                  {/* 主题名 + 数量 */}
                  <span
                    className="mt-1.5 font-mono text-[9px] tracking-[0.18em] uppercase whitespace-nowrap transition-colors duration-300"
                    style={{ fontWeight: focused ? 600 : 400 }}
                  >
                    <span className={focused ? 'text-slate-700 dark:text-slate-100' : 'text-slate-400/80 dark:text-slate-500'}>#{n.tag}</span>
                    <span className="ml-1 opacity-50">{n.count}</span>
                  </span>
                </button>
              );
            })}

            {/* ⭐ 文章星 */}
            {[...graph.postNodes.values()].map(n => {
              const post = n.post!;
              const isHovered = hoverPostId === post.id;
              const dim = lit.hasFocus && !lit.litNodes.has(n.key);
              // 星核染「类型色」：随笔/周报/笔记/成长/项目各有其光，一眼可辨知识构成
              const color = typeColor(post.type);
              const delay = seeded(post.id + 'd') * 4;
              return (
                <motion.button
                  key={n.key}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center outline-none group"
                  style={{ left: pct(n.x, VW), top: pct(n.y, VH), width: n.r * 2, height: n.r * 2, zIndex: isHovered ? 40 : 25 }}
                  onClick={() => setActivePost(post)}
                  onHoverStart={() => setHoverPostId(post.id)}
                  onHoverEnd={() => setHoverPostId(null)}
                  onFocus={() => setHoverPostId(post.id)}
                  onBlur={() => setHoverPostId(null)}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: dim ? 0.8 : 1, opacity: dim ? 0.16 : 1 }}
                  transition={{
                    scale: { type: 'spring', stiffness: 200, damping: 16, delay: delay * 0.05 },
                    opacity: { duration: 0.5 },
                  }}
                  whileHover={{ scale: 1.5 }}
                  whileTap={{ scale: 0.9 }}
                  aria-label={post.title}
                >
                  {/* 星辉光晕 */}
                  <span
                    className="absolute inset-[-70%] rounded-full blur-md pointer-events-none transition-opacity duration-500"
                    style={{ backgroundColor: color, opacity: isHovered ? 0.7 : 0.3 }}
                  />
                  {/* 星核 */}
                  <motion.span
                    className="relative w-full h-full rounded-full"
                    style={{
                      background: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${color} 55%, ${color} 100%)`,
                      boxShadow: `0 0 10px ${color}aa`,
                    }}
                    animate={reduceMotion || isHovered ? { scale: 1 } : { scale: [0.96, 1.06, 0.96] }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 5 + delay, repeat: Infinity, ease: 'easeInOut', delay }}
                  />
                  {/* 悬停信息卡 */}
                  <AnimatePresence>
                    {isHovered && (
                      <motion.span
                        initial={{ opacity: 0, y: 6, scale: 0.92 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.92 }}
                        transition={{ duration: 0.25 }}
                        className="absolute bottom-[150%] left-1/2 -translate-x-1/2 z-50 px-3.5 py-2 rounded-xl whitespace-nowrap pointer-events-none backdrop-blur-xl bg-white/75 dark:bg-[#0E1424]/85 border border-white/60 dark:border-white/10 shadow-lg"
                        style={{ boxShadow: `0 12px 30px -10px ${color}80` }}
                      >
                        <span className="block font-serif text-[13px] text-slate-800 dark:text-slate-100 leading-tight max-w-[220px] truncate">{post.title}</span>
                        <span className="block font-mono text-[8px] tracking-[0.25em] uppercase mt-0.5" style={{ color }}>{post.date} · {post.tags.join(' / ')}</span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}

          </div>
        )}
      </div>

      {/* 底部提示 / 取消聚焦 */}
      {posts.length > 0 && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-30 flex items-center gap-4 px-6 font-mono text-[9px] tracking-[0.2em] uppercase text-slate-400/70 dark:text-slate-500">
          <AnimatePresence>
            {activeTag && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                onClick={() => setActiveTag(null)}
                className="px-3.5 py-2 rounded-full border border-slate-300/50 dark:border-white/10 text-slate-500 dark:text-slate-300 hover:text-[#39C5BB] hover:border-[#39C5BB]/50 transition-colors"
              >
                ↺ #{activeTag} · clear focus
              </motion.button>
            )}
          </AnimatePresence>
          {!activeTag && (
            <span className="select-none">
              <span className="hidden md:inline">click a topic · scroll to zoom · drag to pan</span>
              <span className="md:hidden">tap a star · drag to pan</span>
            </span>
          )}
        </div>
      )}

      {/* 🎨 类型图例：星色与知识类型的对应，帮助一眼读懂这片天空的构成 */}
      {posts.length > 0 && (
        <div className="absolute top-24 right-8 z-30 hidden md:flex flex-col gap-1.5 pointer-events-none">
          {categories.map(m => {
            const count = posts.filter(p => p.type === m.id).length;
            if (!count) return null;
            return (
              <div key={m.id} className="flex items-center gap-2 font-mono text-[9px] tracking-[0.15em] uppercase text-slate-400/80 dark:text-slate-500">
                <span className="w-2 h-2 rounded-full" style={{ background: m.color, boxShadow: `0 0 6px ${m.color}` }} />
                <span>{m.zh}</span><span className="opacity-50">{count}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* 🔭 缩放控制：放大 / 缩小 / 复位 */}
      {posts.length > 0 && (
        <div className="absolute bottom-28 right-4 md:right-8 z-30 flex flex-col items-center gap-1.5 font-mono text-slate-400 dark:text-slate-500">
          <button onClick={() => setView(v => ({ ...v, scale: Math.min(3.5, v.scale * 1.2) }))} className="w-10 h-10 md:w-8 md:h-8 rounded-full border border-slate-300/50 dark:border-white/10 hover:text-[#39C5BB] hover:border-[#39C5BB]/50 transition-colors">＋</button>
          <button onClick={() => setView(v => ({ ...v, scale: Math.max(0.6, v.scale / 1.2) }))} className="w-10 h-10 md:w-8 md:h-8 rounded-full border border-slate-300/50 dark:border-white/10 hover:text-[#39C5BB] hover:border-[#39C5BB]/50 transition-colors">－</button>
          <AnimatePresence>
            {(view.scale !== 1 || view.x !== 0 || view.y !== 0) && (
              <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                onClick={resetView} title="复位视图"
                className="w-10 h-10 md:w-8 md:h-8 rounded-full border border-slate-300/50 dark:border-white/10 text-[10px] hover:text-[#39C5BB] hover:border-[#39C5BB]/50 transition-colors">↺</motion.button>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* 📖 星点展开：全文阅读 */}
      <AnimatePresence>
        {activePost && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-10">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-md"
              onClick={() => setActivePost(null)}
            />
            <motion.article
              initial={{ opacity: 0, scale: 0.96, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 24 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-3xl max-h-[88vh] overflow-hidden flex flex-col rounded-[2rem] bg-[#FBFCFE] dark:bg-[#0C1222] border border-white/70 dark:border-white/10 shadow-[0_40px_120px_rgba(0,0,0,0.3)]"
            >
              <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full blur-[100px] opacity-30 dark:opacity-20 pointer-events-none" style={{ backgroundColor: typeColor(activePost.type) }} />

              <header className="relative px-6 md:px-14 pt-10 md:pt-12 pb-6 shrink-0">
                <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.25em] uppercase text-slate-400 dark:text-slate-500 mb-6">
                  <span className="flex items-center gap-3">
                    <span style={{ color: typeColor(activePost.type) }}>{activePost.date}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                    <span className="opacity-70">{calcReadingTime(activePost.content)}</span>
                  </span>
                  <span className="flex items-center gap-4">
                    {isAdmin && (
                      <button onClick={() => handleDelete(activePost.id)} className="hover:text-red-400 transition-colors">Uproot</button>
                    )}
                    <button onClick={() => setActivePost(null)} className="hover:text-[#39C5BB] transition-colors">Close ✕</button>
                  </span>
                </div>
                <h1 className="font-serif text-3xl md:text-5xl text-slate-800 dark:text-slate-100 leading-[1.25]">{activePost.title}</h1>
                {activePost.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-x-5 gap-y-2 mt-5">
                    {activePost.tags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => { setActivePost(null); setActiveTag(canonicalTagOf(tag)); }}
                        className="font-mono text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase border-b border-slate-300 dark:border-white/10 pb-0.5 hover:text-[#39C5BB] hover:border-[#39C5BB]/50 transition-colors"
                      >#{tag}</button>
                    ))}
                  </div>
                )}
              </header>

              <div className="relative flex-1 overflow-y-auto px-6 md:px-14 pb-14 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <Markdown>{activePost.content}</Markdown>
              </div>
            </motion.article>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
