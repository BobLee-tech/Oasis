// 📖 阅读舱三件套：墨环进度（InkRing）· 文中目录（ReaderToc）· 图片灯箱（Lightbox）
//    共用 Gallery 的沉浸阅读层，气质统一：安静的线、克制的光、一物多用。
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValueEvent, useTransform, useScroll, useSpring, type MotionValue } from 'framer-motion';
import type { TocItem } from '../lib/reading';
import { LIGHTBOX_EVENT } from './Markdown';

// ══════════════════════════════════════════════════════════════
// 📏 阅读进度：顶部情绪丝线 + 右下墨环，共用同一条 scroll 弹簧。
//    ⚠️ 关键：useScroll 必须在「滚动容器已挂载」时初始化——本组件只随阅读舱一同挂载，
//    彼时 containerRef.current 已是真实 DOM，故能可靠追踪（放在父层顶部则容器尚为 null）。
// ══════════════════════════════════════════════════════════════
interface ReaderProgressProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  color: string;
  totalMinutes: number;
}
export const ReaderProgress: React.FC<ReaderProgressProps> = ({ containerRef, color, totalMinutes }) => {
  const { scrollYProgress } = useScroll({ container: containerRef });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });
  const backToTop = () => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  return (
    <>
      {/* 顶部阅读进度细丝，染当前文章情绪色 */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-[2px] z-[160] origin-left"
        style={{ scaleX: progress, backgroundColor: color, boxShadow: `0 0 10px ${color}` }}
      />
      <InkRing progress={progress} color={color} totalMinutes={totalMinutes} onBackToTop={backToTop} />
    </>
  );
};

// ══════════════════════════════════════════════════════════════
// 🪷 墨环：右下一枚细环随滚动缓缓「注满」，环心显示剩余分钟；
//    读完化为对勾，点击则荡开一圈水波并平滑回到顶部。滚过一屏才淡入，不打扰短文。
// ══════════════════════════════════════════════════════════════
const R = 18;
const C = 2 * Math.PI * R;

interface InkRingProps {
  progress: MotionValue<number>;   // 0..1，来自 useScroll + useSpring
  color: string;
  totalMinutes: number;
  onBackToTop: () => void;
}

export const InkRing: React.FC<InkRingProps> = ({ progress, color, totalMinutes, onBackToTop }) => {
  const [pct, setPct] = useState(0);
  const [rippleKey, setRippleKey] = useState(0);
  const dashoffset = useTransform(progress, (p) => C * (1 - Math.min(1, Math.max(0, p))));

  // 只在真正翻动时更新文字状态，滚动本身不触发整环重渲染
  useMotionValueEvent(progress, 'change', (v) => setPct(v));

  const visible = pct > 0.02;
  const done = pct > 0.985;
  const remaining = Math.max(0, Math.ceil(totalMinutes * (1 - pct)));

  const handleClick = () => {
    setRippleKey((k) => k + 1);
    onBackToTop();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          key="ink-ring"
          onClick={handleClick}
          initial={{ opacity: 0, scale: 0.8, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 8 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-8 right-8 z-[150] w-11 h-11 rounded-full grid place-items-center outline-none group"
          aria-label={done ? '已读完 · 回到顶部' : `剩余约 ${remaining} 分钟 · 回到顶部`}
          title={done ? '已读完 · 回到顶部' : `剩余约 ${remaining} 分钟`}
        >
          {/* 点击时荡开的水波 */}
          <AnimatePresence>
            <motion.span
              key={rippleKey}
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{ border: `1.5px solid ${color}` }}
              initial={{ scale: 1, opacity: 0.5 }}
              animate={{ scale: 2.2, opacity: 0 }}
              transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
            />
          </AnimatePresence>

          {/* 玻璃底托 */}
          <span className="absolute inset-0 rounded-full bg-white/55 dark:bg-white/[0.06] backdrop-blur-md border border-white/60 dark:border-white/10 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.4)] transition-colors duration-700 group-hover:bg-white/70 dark:group-hover:bg-white/[0.1]" />

          <svg viewBox="0 0 44 44" className="relative w-11 h-11 -rotate-90">
            {/* 轨底 */}
            <circle cx="22" cy="22" r={R} fill="none" stroke="currentColor" className="text-slate-300/50 dark:text-white/10" strokeWidth="2" />
            {/* 进度环：染文章情绪色，随滚动注满 */}
            <motion.circle
              cx="22" cy="22" r={R} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"
              strokeDasharray={C} style={{ strokeDashoffset: dashoffset, filter: `drop-shadow(0 0 3px ${color}80)` }}
            />
          </svg>

          {/* 环心：剩余分钟 → 读完变对勾 */}
          <span className="absolute inset-0 grid place-items-center font-mono text-[10px] tracking-tight" style={{ color }}>
            {done ? (
              <motion.svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5 }}>
                <motion.path d="M20 6L9 17l-5-5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, ease: 'easeOut' }} />
              </motion.svg>
            ) : (
              <span className="leading-none">{remaining}<span className="opacity-60 text-[8px]">′</span></span>
            )}
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
};

// ══════════════════════════════════════════════════════════════
// 📑 文中目录：左侧一列细线刻度，像枯山水的耙痕；hover 横向展开标题，
//    当前章节染情绪色。仅桌面显示，移动端隐去不挤空间。
// ══════════════════════════════════════════════════════════════
interface ReaderTocProps {
  items: TocItem[];
  color: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export const ReaderToc: React.FC<ReaderTocProps> = ({ items, color, containerRef }) => {
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    const container = containerRef.current;
    if (!container || items.length === 0) return;
    const els = items
      .map((it) => container.querySelector<HTMLElement>(`#${CSS.escape(it.id)}`))
      .filter((el): el is HTMLElement => !!el);
    if (els.length === 0) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        // 取文档序中最靠前的一个可见标题作为当前章节
        const firstVisible = items.find((it) => visible.has(it.id));
        if (firstVisible) setActiveId(firstVisible.id);
      },
      { root: container, rootMargin: '-12% 0px -70% 0px', threshold: 0 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items, containerRef]);

  if (items.length < 2) return null;

  const go = (id: string) => {
    const el = containerRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="hidden lg:flex fixed left-7 top-1/2 -translate-y-1/2 z-[150] flex-col gap-3.5 group/toc">
      {items.map((it) => {
        const active = activeId === it.id;
        return (
          <button
            key={it.id}
            onClick={() => go(it.id)}
            className="flex items-center gap-3 outline-none text-left"
            aria-label={it.text}
          >
            {/* 耙痕：h2 长、h3 短且缩进；当前章染色变宽 */}
            <span
              className="block h-px rounded-full transition-all duration-500"
              style={{
                width: active ? (it.level === 2 ? 28 : 18) : it.level === 2 ? 18 : 11,
                marginLeft: it.level === 3 ? 10 : 0,
                backgroundColor: active ? color : 'currentColor',
                opacity: active ? 1 : 0.28,
                color: 'rgb(148 163 184)',
              }}
            />
            {/* 标题文字：常态隐去，hover 整列时轻轻浮现 */}
            <span
              className="font-mono text-[10px] tracking-wide whitespace-nowrap max-w-[190px] truncate opacity-0 -translate-x-1 group-hover/toc:opacity-100 group-hover/toc:translate-x-0 transition-all duration-300"
              style={{ color: active ? color : undefined }}
            >
              <span className={active ? '' : 'text-slate-400 dark:text-slate-500'}>{it.text}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// 🖼️ 图片灯箱：监听 Markdown 派发的事件，全屏黑玻璃 + 放大呈现，ESC/点击关闭。
// ══════════════════════════════════════════════════════════════
export const Lightbox: React.FC = () => {
  const [img, setImg] = useState<{ src: string; alt?: string } | null>(null);
  const lastActive = useRef<Element | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { src: string; alt?: string };
      lastActive.current = document.activeElement;
      setImg(detail);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setImg(null); };
    window.addEventListener(LIGHTBOX_EVENT, onOpen);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener(LIGHTBOX_EVENT, onOpen); window.removeEventListener('keydown', onKey); };
  }, []);

  return (
    <AnimatePresence>
      {img && (
        <motion.div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/80 backdrop-blur-md cursor-zoom-out p-8"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          onClick={() => setImg(null)}
        >
          <motion.img
            src={img.src} alt={img.alt ?? ''}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          />
          {img.alt && (
            <span className="absolute bottom-8 left-1/2 -translate-x-1/2 font-serif italic text-sm text-white/70">{img.alt}</span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
