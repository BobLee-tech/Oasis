// 📖 阅读舱三件套：墨环进度（InkRing）· 文中目录（ReaderToc）· 图片灯箱（Lightbox）
//    共用 Gallery 的沉浸阅读层，气质统一：安静的线、克制的光、一物多用。
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useMotionValueEvent, useTransform, useScroll, useSpring, type MotionValue } from 'framer-motion';
import type { TocItem } from '../lib/reading';
import { LIGHTBOX_EVENT } from './Markdown';
import { currentSolarTerm } from '../lib/solarTerms';
import type { Backlink } from '../lib/wikilinks';

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
  // ⚠️ useScroll 在容器刚挂载、尚未滚动时可能给出虚假的 1（0/0 兜底），
  //    会让墨环一进来就误判读完。这里借它的更新时机，进度改由真实 scrollTop 计算。
  const safeProgress = useTransform(scrollYProgress, () => {
    const el = containerRef.current;
    if (!el) return 0;
    const max = el.scrollHeight - el.clientHeight;
    return max > 1 ? Math.min(1, el.scrollTop / max) : 0;
  });
  const progress = useSpring(safeProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });
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
  const [done, setDone] = useState(false);
  const [rippleKey, setRippleKey] = useState(0);
  const dashoffset = useTransform(progress, (p) => C * (1 - Math.min(1, Math.max(0, p))));

  // 只在真正翻动时更新文字状态，滚动本身不触发整环重渲染
  // ✅ 读完态是「墨已注满」——一旦抵达就落锁，回翻重读也不褪回倒计时
  useMotionValueEvent(progress, 'change', (v) => {
    setPct(v);
    if (v > 0.985) {
      setDone((was) => {
        if (!was) setRippleKey((k) => k + 1); // 读完一瞬荡一圈水波作贺
        return true;
      });
    }
  });

  const visible = pct > 0.02 || done;
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
            {done ? (
              // 读完落锁：环保持完满，不再随回翻退墨
              <motion.circle
                cx="22" cy="22" r={R} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"
                strokeDasharray={C} initial={false} animate={{ strokeDashoffset: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                style={{ filter: `drop-shadow(0 0 3px ${color}80)` }}
              />
            ) : (
              <motion.circle
                cx="22" cy="22" r={R} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"
                strokeDasharray={C} style={{ strokeDashoffset: dashoffset, filter: `drop-shadow(0 0 3px ${color}80)` }}
              />
            )}
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
// 📑 文中目录：桌面端左侧一列细线刻度（枯山水耙痕）——常态只露出当前
//    章节的标题，其余隐去；hover 整列才依次浮现。移动/平板没有 hover，
//    换成右上角小圆钮唤出底部抽屉，作为可点的入口。
//    长文时耙痕本身可能超出视口高度：内部改为可滚动 + 上下淡出遮罩，
//    并在章节切换时把「目录自己」轻推到露出当前项——只挪目录，不挪文章。
// ══════════════════════════════════════════════════════════════
interface ReaderTocProps {
  items: TocItem[];
  color: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export const ReaderToc: React.FC<ReaderTocProps> = ({ items, color, containerRef }) => {
  const [activeId, setActiveId] = useState<string>('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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

  // 📍 长文目录自跟随：当前章节切换时若其刻度已滑出目录轨道自身的可视区，
  //    把轨道内部轻推到刚好露出它——只滚目录这一条窄轨，不牵动文章滚动。
  useEffect(() => {
    const rail = railRef.current;
    const el = itemRefs.current[activeId];
    if (!rail || !el) return;
    const railRect = rail.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (elRect.top < railRect.top || elRect.bottom > railRect.bottom) {
      const delta = (elRect.top - railRect.top) - rail.clientHeight / 2 + el.clientHeight / 2;
      rail.scrollTop += delta;
    }
  }, [activeId]);

  if (items.length < 2) return null;

  const go = (id: string) => {
    const el = containerRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setSheetOpen(false);
  };

  return (
    <>
      {/* 🖥️ 桌面：左侧悬浮耙痕，内部可滚动 + 上下淡出遮罩，长目录不再溢出视口 */}
      <div className="hidden lg:flex fixed left-7 top-1/2 -translate-y-1/2 z-[150] flex-col group/toc">
        <div
          ref={railRef}
          className="flex flex-col gap-3.5 max-h-[64vh] overflow-y-auto no-scrollbar py-2"
          style={{
            WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 8%, black 92%, transparent)',
            maskImage: 'linear-gradient(to bottom, transparent, black 8%, black 92%, transparent)',
          }}
        >
          {items.map((it) => {
            const active = activeId === it.id;
            return (
              <button
                key={it.id}
                ref={(el) => { itemRefs.current[it.id] = el; }}
                onClick={() => go(it.id)}
                className="flex items-center gap-3 outline-none text-left shrink-0"
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
                {/* 标题文字：当前章节常驻可见（定位感不丢），其余隐去待 hover 整列时浮现 */}
                <span
                  className={`font-mono text-[10px] tracking-wide whitespace-nowrap max-w-[190px] truncate transition-all duration-300 ${
                    active ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-1 group-hover/toc:opacity-100 group-hover/toc:translate-x-0'
                  }`}
                  style={{ color: active ? color : undefined }}
                >
                  <span className={active ? '' : 'text-slate-400 dark:text-slate-500'}>{it.text}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 📱 移动/平板：右上角小圆钮唤出底部抽屉——没有 hover，需要一个可点的入口 */}
      <button
        onClick={() => setSheetOpen(true)}
        className="lg:hidden fixed top-5 right-5 z-[150] w-9 h-9 rounded-full grid place-items-center bg-white/55 dark:bg-white/[0.06] backdrop-blur-md border border-white/60 dark:border-white/10 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.4)]"
        aria-label="目录"
      >
        <span className="flex flex-col gap-[3px] items-end">
          <span className="block h-px w-4 rounded-full" style={{ backgroundColor: color, opacity: 0.9 }} />
          <span className="block h-px w-3 rounded-full" style={{ backgroundColor: color, opacity: 0.6 }} />
          <span className="block h-px w-4 rounded-full" style={{ backgroundColor: color, opacity: 0.9 }} />
        </span>
      </button>

      <AnimatePresence>
        {sheetOpen && (
          <motion.div
            className="lg:hidden fixed inset-0 z-[300] bg-black/30 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={() => setSheetOpen(false)}
          >
            <motion.div
              className="absolute bottom-0 left-0 right-0 max-h-[70vh] overflow-y-auto no-scrollbar rounded-t-3xl bg-[#FAF8F3] dark:bg-[#0A0F1D] border-t border-slate-200/60 dark:border-white/10 px-6 pt-3 pb-[max(2rem,env(safe-area-inset-bottom))]"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-white/15 mx-auto mb-5 mt-1" />
              <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-slate-400 dark:text-slate-500 mb-4">目录 · Contents</div>
              <div className="flex flex-col gap-1 mb-2">
                {items.map((it) => {
                  const active = activeId === it.id;
                  return (
                    <button
                      key={it.id}
                      onClick={() => go(it.id)}
                      className="flex items-center gap-3 py-2.5 text-left w-full"
                      style={{ paddingLeft: it.level === 3 ? 20 : 0 }}
                    >
                      <span className="block w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: active ? color : 'rgb(148 163 184)', opacity: active ? 1 : 0.4 }} />
                      <span className={`font-serif text-sm leading-snug truncate ${active ? '' : 'text-slate-500 dark:text-slate-400'}`} style={{ color: active ? color : undefined }}>
                        {it.text}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// ══════════════════════════════════════════════════════════════
// 🖋️ 文末落款：正文读完，一条渐弱的水波细线 + 写作日期与当时的节气，
//    给每篇文章一个统一的收束仪式（峰终体验里，离开前的最后印象）。
//    节气按 createdAt 换算，而非「今天」——落款记的是「写于」那一刻的时节。
// ══════════════════════════════════════════════════════════════
interface ColophonProps { date: string; createdAt: number; color: string }
export const Colophon: React.FC<ColophonProps> = ({ date, createdAt, color }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }}
    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    className="mt-16 mb-6 flex flex-col items-center gap-3 select-none"
  >
    <svg width="120" height="10" viewBox="0 0 120 10" aria-hidden>
      <path d="M0 5 Q15 0 30 5 T60 5 T90 5 T120 5" fill="none" stroke={color} strokeWidth="1" opacity="0.55" />
    </svg>
    <span className="font-serif italic text-xs text-slate-400 dark:text-slate-500 tracking-wide">
      写于 {date} · {currentSolarTerm(new Date(createdAt)).name}
    </span>
  </motion.div>
);

// ══════════════════════════════════════════════════════════════
// ⟲ 回响：读完一篇，看见「谁曾提到过这里」——反向链接比正向双链更能
//   勾住读者继续漫游，语境摘句让它不只是一份标题清单，而是「对方当时在说什么」。
//   左侧竖线取来源文章自己的颜色（这是谁的声音），引用文字取当前文章的颜色（在说谁）。
// ══════════════════════════════════════════════════════════════
interface EchoPost { id: string; title: string; color: string }
interface EchoesProps<T extends EchoPost> {
  backlinks: Backlink<T>[];
  currentColor: string;
  onOpen: (post: T) => void;
}
export function Echoes<T extends EchoPost>({ backlinks, currentColor, onOpen }: EchoesProps<T>) {
  if (backlinks.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      className="mt-6 mb-10 w-full"
    >
      <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-slate-400 dark:text-slate-500 mb-5">
        ⟲ Echoes · {backlinks.length} 篇文章提到这里
      </div>
      <div className="flex flex-col gap-5">
        {backlinks.map(({ post, before, after, rawTitle }) => (
          <button key={post.id} onClick={() => onOpen(post)} className="group flex gap-4 text-left w-full">
            <span
              className="w-[2px] shrink-0 rounded-full opacity-40 group-hover:opacity-80 transition-opacity"
              style={{ backgroundColor: post.color }}
              aria-hidden
            />
            <span className="flex flex-col gap-1.5 min-w-0">
              <span className="font-serif text-sm text-slate-700 dark:text-slate-200 group-hover:text-[#39C5BB] transition-colors truncate">
                {post.title}
              </span>
              <span className="font-serif text-xs italic text-slate-400 dark:text-slate-500 leading-relaxed">
                {before}
                <span className="not-italic opacity-90" style={{ color: currentColor }}>{rawTitle}</span>
                {after}
              </span>
            </span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════
// 🍃 继续漫游：按「双链互引 > 标签重合 > 同类型」打分推荐的相关文章，
//   是读完之后的一条路牌——刻意用幽灵卡（无底色）而非列表页的实心卡，
//   视觉上区分「藏品陈列」与「继续走下去的小径」。
// ══════════════════════════════════════════════════════════════
interface RelatedPost { id: string; title: string; date: string; color: string }
interface RelatedProps<T extends RelatedPost> {
  posts: T[];
  onOpen: (post: T) => void;
}
export function Related<T extends RelatedPost>({ posts, onOpen }: RelatedProps<T>) {
  if (posts.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      className="mb-10 w-full"
    >
      <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-slate-400 dark:text-slate-500 mb-5">
        🍃 继续漫游 · Related
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {posts.map((p) => (
          <button
            key={p.id}
            onClick={() => onOpen(p)}
            className="group flex flex-col gap-2 text-left rounded-xl border border-slate-200/40 dark:border-white/5 px-4 py-3.5 hover:bg-white/40 dark:hover:bg-white/[0.03] hover:border-slate-200/70 dark:hover:border-white/10 transition-colors"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} aria-hidden />
              <span className="font-serif text-sm text-slate-700 dark:text-slate-200 group-hover:text-[#39C5BB] transition-colors truncate">{p.title}</span>
            </span>
            <span className="font-mono text-[9px] tracking-wide text-slate-400 dark:text-slate-500 pl-3.5">{p.date}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

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

  // 🌀 portal 到 body：灯箱常从文章正文内触发，若不跳出视图层的 stacking context，
  // 会被 App 顶层 HUD（时钟/日夜按钮）叠在暗色蒙层之上，移动端尤其明显。
  return createPortal(
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
    </AnimatePresence>,
    document.body
  );
};
