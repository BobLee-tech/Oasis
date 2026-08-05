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
import { useCoarsePointer } from '../hooks/useCoarsePointer';
import { Markdown } from './Markdown';
import { readingMinutes } from '../lib/reading';
import { tagKey } from '../lib/tags';
import { emitMikuSignal } from '../lib/mikuSignal';
import { buildGraph, seeded, VW, VH, type PositionCache } from '../lib/constellation';

interface OasisOrchardProps { isAdmin: boolean; }

const calcReadingTime = (text: string) => `${readingMinutes(text)} min`;

// 🌱 条目类型 → 颜色 / 中文名：与 Garden 博客共用 useCategories 的同一套数据（含自定义分类），
//    在组件内通过 metaOf 取用，星点据此染类型微光环。
// 图谱构建 / 力导布局算法见 ../lib/constellation.ts（可独立测试、支持增量松弛）。

export const OasisOrchard: React.FC<OasisOrchardProps> = ({ isAdmin }) => {
  const reduceMotion = !!useReducedMotion();
  const coarse = useCoarsePointer();
  const { posts: rawPosts, uprootSeed } = useGarden();
  // 🔒 「模拟访客」时把草稿从星图里滤掉，与博客列表一致（真实访客本就拿不到草稿行，见 RLS）
  const posts = useMemo(() => filterVisible(rawPosts, isAdmin), [rawPosts, isAdmin]);
  const { categories, metaOf } = useCategories();
  const typeColor = (t?: string) => metaOf(t || 'thought').color;
  const [activePost, setActivePost] = useState<BlogPost | null>(null);
  React.useEffect(() => {
    emitMikuSignal({ type: activePost ? 'focus-open' : 'focus-close', source: 'orchard-reading' });
    return () => emitMikuSignal({ type: 'focus-close', source: 'orchard-reading' });
  }, [activePost]);
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

  // 🧊 位置缓存：跨渲染持有已收敛坐标（见 lib/constellation.ts）。加一篇新文章时，
  //   已有星星从缓存坐标起步、几乎不动，只有新星自己找空位——「昨天记住的星座位置」不会被打乱。
  //   用 useState 的惰性初值而非 useRef：两者都是「跨渲染稳定、mutate 不触发重渲染」的容器，
  //   但 useState 不是 RefObject，不会被 react-hooks/refs 规则判定为「渲染期读取 ref」。
  //   reflowTick：手动「重排星图」清空缓存后 +1，让下面的 useMemo 强制重新全量收敛。
  const [posCache] = useState<PositionCache>(() => new Map());
  const [reflowTick, setReflowTick] = useState(0);
  const reflow = useCallback(() => { posCache.clear(); setReflowTick(t => t + 1); }, [posCache]);

  const graph = useMemo(
    () => buildGraph(posts, (p) => typeColor(p.type), posCache),
    [posts, categories, posCache, reflowTick]
  );
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
                  {/* 星云核：blur 光晕栅格化很贵，只在聚焦这一颗时才挂上——
                      非聚焦态本就只有 opacity 0.4，多一层 blur 观感增量很小，性能代价却是恒定的 */}
                  <span className="relative flex items-center justify-center" style={{ width: n.r * 2, height: n.r * 2 }}>
                    {focused && !coarse && (
                      <span
                        className="absolute inset-[-60%] rounded-full blur-md transition-opacity duration-500"
                        style={{ background: 'radial-gradient(circle, rgba(148,163,184,0.5) 0%, transparent 70%)', opacity: 0.9 }}
                      />
                    )}
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
              // blur 光晕只给「正被看见」的那几颗——hover 的这颗，或当前聚焦星座里的姐妹星；
              // 其余星靠星核自身的 boxShadow 就有足够的光感，不必再叠一层昂贵的 blur。
              const showGlow = !coarse && (isHovered || (lit.hasFocus && lit.litNodes.has(n.key)));
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
                  {/* 星辉光晕：见上方 showGlow——只在被看见时才存在 */}
                  {showGlow && (
                    <span
                      className="absolute inset-[-70%] rounded-full blur-md pointer-events-none transition-opacity duration-500"
                      style={{ backgroundColor: color, opacity: isHovered ? 0.7 : 0.4 }}
                    />
                  )}
                  {/* 星核：呼吸动画用 CSS keyframes（见 index.css .oasis-star-breathe）而非
                      framer-motion 的 repeat: Infinity——后者是 rAF 驱动的主线程 JS，几百颗星
                      同时跑会把主线程吃满；CSS 动画交给合成器，跟数量无关。
                      hover 时用 animationPlayState 暂停，视觉效果与原先「hover 时定格 scale:1」一致。 */}
                  <span
                    className={`relative w-full h-full rounded-full ${!reduceMotion && !coarse ? 'oasis-star-breathe' : ''}`}
                    style={{
                      background: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${color} 55%, ${color} 100%)`,
                      boxShadow: `0 0 10px ${color}aa`,
                      animationDelay: `${delay}s`,
                      animationDuration: `${5 + delay}s`,
                      animationPlayState: isHovered ? 'paused' : 'running',
                    }}
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
        <div data-miku-avoid className="absolute top-24 left-4 md:top-auto md:bottom-28 md:left-auto md:right-8 z-30 flex flex-col items-center gap-1.5 font-mono text-slate-400 dark:text-slate-500">
          <button onClick={() => setView(v => ({ ...v, scale: Math.min(3.5, v.scale * 1.2) }))} className="w-10 h-10 md:w-8 md:h-8 rounded-full border border-slate-300/50 dark:border-white/10 hover:text-[#39C5BB] hover:border-[#39C5BB]/50 transition-colors">＋</button>
          <button onClick={() => setView(v => ({ ...v, scale: Math.max(0.6, v.scale / 1.2) }))} className="w-10 h-10 md:w-8 md:h-8 rounded-full border border-slate-300/50 dark:border-white/10 hover:text-[#39C5BB] hover:border-[#39C5BB]/50 transition-colors">－</button>
          <AnimatePresence>
            {(view.scale !== 1 || view.x !== 0 || view.y !== 0) && (
              <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                onClick={resetView} title="复位视图"
                className="w-10 h-10 md:w-8 md:h-8 rounded-full border border-slate-300/50 dark:border-white/10 text-[10px] hover:text-[#39C5BB] hover:border-[#39C5BB]/50 transition-colors">↺</motion.button>
            )}
          </AnimatePresence>
          {/* ✦ 重排星图：清空位置缓存、强制全量重新收敛——与「↺ 复位视图」不同，
              那个只重置缩放/平移，这个是真的让星星们重新找位置（用于觉得布局挤在一起时） */}
          <button onClick={reflow} title="重排星图" className="w-10 h-10 md:w-8 md:h-8 rounded-full border border-slate-300/50 dark:border-white/10 text-[13px] hover:text-[#39C5BB] hover:border-[#39C5BB]/50 transition-colors">✦</button>
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
