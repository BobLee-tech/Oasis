// 📖 阅读舱四件套：墨环进度（InkRing）· 文中目录（ReaderToc）· 常驻出口（ReaderExit）· 图片灯箱（Lightbox）
//    共用 Gallery 的沉浸阅读层，气质统一：安静的线、克制的光、一物多用。
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useMotionValueEvent, useReducedMotion, useTransform, useScroll, useSpring, type MotionValue } from 'framer-motion';
import type { TocItem } from '../lib/reading';
import { LIGHTBOX_EVENT } from '../lib/lightbox';
import { colophonOf, HOU_ORDINAL } from '../lib/hou';
import { PROJECTS } from '../data/projects';
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
  onProgressChange?: (progress: number) => void;
}
export const ReaderProgress: React.FC<ReaderProgressProps> = ({ containerRef, color, totalMinutes, onProgressChange }) => {
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
  useMotionValueEvent(progress, 'change', (value) => onProgressChange?.(value));
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
// 🖋️ 文末落款：正文读完，一条渐弱的水波细线 + 一列竖排落款 + 一方园主印，
//    给每篇文章一个统一的收束仪式（峰终体验里，离开前的最后印象）。
//    写法与尺牍邻居信的落款同一套：干支纪年 · 节气 · 七十二候（lib/hou.ts），都按 createdAt 推——
//    落款记的是「写于」那一刻的时节，而非今天。印是园图卷尾那方（克利夫兰 1978.67，CC0），
//    读到文末时落、压、起三拍钤上；同一篇只演第一次，之后静静印在那里（本机记一笔）。
// ══════════════════════════════════════════════════════════════
const SEAL_SRC = `${((import.meta.env.VITE_YUANTU_BASE as string | undefined) || '/yuantu').replace(/\/$/, '')}/seals/s00.webp`;
const SEALED_KEY = 'oasis_sealed_posts';
const readSealed = (): string[] => { try { return JSON.parse(localStorage.getItem(SEALED_KEY) || '[]'); } catch { return []; } };
const markSealed = (id: string) => {
  try { localStorage.setItem(SEALED_KEY, JSON.stringify([...readSealed().filter(x => x !== id), id].slice(-300))); } catch { /* 隐私模式不记，下次再钤一次也无妨 */ }
};

interface ColophonProps { postId: string; createdAt: number; updatedAt: number; color: string }
export const Colophon: React.FC<ColophonProps> = ({ postId, createdAt, updatedAt, color }) => {
  // 🌿 只有真被「照料」过（而非发完顺手改错别字）才多长一列——48h 阈值，与列表页「最近照料」一致
  const tended = updatedAt - createdAt > 48 * 3600 * 1000;
  const c = colophonOf(new Date(createdAt));
  const u = tended ? colophonOf(new Date(updatedAt)) : null;
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // idle：还没读到这里（印先不出）；press：正在钤；done：已经印着
  const [seal, setSeal] = useState<'idle' | 'press' | 'done'>(() => (readSealed().includes(postId) ? 'done' : 'idle'));
  useEffect(() => {
    if (seal !== 'idle' || !ref.current) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some(e => e.isIntersecting)) return;
      io.disconnect(); markSealed(postId); setSeal(reduce ? 'done' : 'press');
    }, { threshold: 0.6 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seal, postId, reduce]);

  const label = `写于${c.year}年${c.term}，${HOU_ORDINAL[c.houIndex]}${c.hou}${u ? `；照料于${u.term}，${HOU_ORDINAL[u.houIndex]}${u.hou}` : ''}`;
  return (
    <div ref={ref} className="mt-16 mb-6 flex flex-col items-center gap-4 select-none" aria-label={label} role="note">
      <svg width="120" height="10" viewBox="0 0 120 10" aria-hidden>
        <path d="M0 5 Q15 0 30 5 T60 5 T90 5 T120 5" fill="none" stroke={color} strokeWidth="1" opacity="0.55" />
      </svg>
      <div className="flex flex-row-reverse items-start gap-4" aria-hidden>
        <div className="flex flex-col items-center gap-3">
          <span className="[writing-mode:vertical-rl] font-zh text-[15px] leading-[1.9] tracking-[0.32em] text-slate-500 dark:text-slate-400">
            {c.year}年{c.term}<span className="text-xs tracking-[0.24em] text-slate-400 dark:text-slate-500">{'\u3000'}{HOU_ORDINAL[c.houIndex]}{'\u3000'}{c.hou}</span>
          </span>
          <div className="relative w-[58px] h-[55px] mt-1">
            {seal !== 'idle' && (
              <motion.img
                src={SEAL_SRC} alt="" draggable={false}
                className="absolute inset-0 w-full h-full mix-blend-multiply dark:mix-blend-screen dark:opacity-80"
                initial={seal === 'press' ? { opacity: 0, scale: 1.35, y: -26, rotate: -9, filter: 'blur(2px)' } : false}
                animate={{ opacity: 0.92, scale: [null, 1.08, 0.97, 1], y: [null, -4, 0, 0], rotate: [null, -4, -2, -2], filter: 'blur(0px)' }}
                transition={{ duration: 1.05, times: [0, 0.42, 0.55, 1], ease: ['easeIn', 'easeOut', 'easeOut'] }}
              />
            )}
            {/* 印泥斑：压下那一瞬闪一下 */}
            {seal === 'press' && (
              <motion.i
                className="absolute -inset-[30%] bg-[url(/textures/inkpad-specks.webp)] bg-center bg-[length:80px] mix-blend-multiply pointer-events-none"
                initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 0.35, 0] }} transition={{ duration: 1.6, times: [0, 0.4, 0.48, 1] }}
              />
            )}
          </div>
        </div>
        {u && (
          <span className="[writing-mode:vertical-rl] font-zh text-[13px] leading-[1.9] tracking-[0.3em] text-slate-400 dark:text-slate-500">
            照料于{u.term}{'\u3000'}{HOU_ORDINAL[u.houIndex]} {u.hou}
          </span>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// 🪵 借景：这篇写过工坊里的哪件作品（关系只记在 data/projects.ts 的 posts 一处），
//    落款下面一行小字指回那一页册页；没有就不出现。
// ══════════════════════════════════════════════════════════════
export const WorkshopNote: React.FC<{ postId: string }> = ({ postId }) => {
  const works = PROJECTS.filter((p) => p.posts?.some((x) => x.id === postId));
  if (!works.length) return null;
  return (
    <div className="-mt-2 mb-8 flex flex-col items-center gap-1.5">
      {works.map((p) => (
        <a
          key={p.id}
          href={`#/atelier/${encodeURIComponent(p.id)}`}
          className="group inline-flex items-center gap-2 font-serif text-xs text-slate-400 dark:text-slate-500 tracking-wide hover:text-slate-600 dark:hover:text-slate-300 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#39C5BB] rounded-sm"
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
          工坊里有这件作品的册页 · <span className="text-slate-500 dark:text-slate-400">{p.title}</span>
          <span className="transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden>⟶</span>
        </a>
      ))}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// 🧭 文末路径：把合集、回响、相关推荐和前后篇收成「一条主路 + 一个抽屉」。
//   正文落款之后先给一个明确选择，其余信息默认收起，避免四组导航同时抢注意力。
// ══════════════════════════════════════════════════════════════
interface FooterPost { id: string; title: string; color: string; date: string }
interface PostFooterProps<T extends FooterPost> {
  current: T;
  seriesPosts: T[];
  backlinks: Backlink<T>[];
  related: T[];
  prev: T | null;
  next: T | null;
  color: string;
  onOpen: (post: T) => void;
}
export function PostFooter<T extends FooterPost>({ current, seriesPosts, backlinks, related, prev, next, color, onOpen }: PostFooterProps<T>) {
  const [expanded, setExpanded] = useState(false);
  const chapterIndex = seriesPosts.findIndex((post) => post.id === current.id);
  const nextChapter = chapterIndex >= 0 ? seriesPosts[chapterIndex + 1] ?? null : null;
  const mainPost = nextChapter ?? related[0] ?? next ?? prev;
  const mainLabel = nextChapter
    ? `下一章 · 第 ${chapterIndex + 2} 篇`
    : related[0]
      ? '沿着这条小径继续'
      : next
        ? '时间线上更新的一篇'
        : '回到更早的一篇';
  const remainingRelated = related.filter((post) => post.id !== mainPost?.id);
  const drawerParts = [
    seriesPosts.length > 1 ? `本合集共 ${seriesPosts.length} 篇` : '',
    backlinks.length ? `${backlinks.length} 篇提到这里` : '',
    remainingRelated.length ? `另有 ${remainingRelated.length} 篇可漫游` : '',
  ].filter(Boolean);
  const hasDrawer = drawerParts.length > 0;

  return (
    <section className="mt-12 border-t border-slate-200/60 dark:border-white/10 pt-12 w-full">
      <div className="flex items-center gap-3 mb-6">
        <span className="h-3 w-px rounded-full" style={{ backgroundColor: color }} aria-hidden />
        <span className="font-mono text-[9px] tracking-[0.28em] uppercase text-slate-400 dark:text-slate-500">Afterword</span>
        <span className="font-serif text-xs text-slate-400 dark:text-slate-500">读完之后</span>
      </div>

      {mainPost && (
        <button
          onClick={() => onOpen(mainPost)}
          className="group w-full text-left rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/45 dark:bg-white/[0.035] px-6 py-5 md:px-7 md:py-6 transition-[transform,border-color,background-color] duration-300 hover:-translate-y-0.5 hover:border-slate-300 dark:hover:border-white/20"
        >
          <span className="block font-serif text-xs text-slate-400 dark:text-slate-500 mb-2">{mainLabel}</span>
          <span className="flex items-center justify-between gap-5">
            <span className="font-serif text-lg text-slate-700 dark:text-slate-100 leading-snug group-hover:text-[#39C5BB] transition-colors">《{mainPost.title}》</span>
            <span className="text-slate-300 dark:text-slate-600 group-hover:text-[#39C5BB] group-hover:translate-x-1 transition-all" aria-hidden>→</span>
          </span>
        </button>
      )}

      {hasDrawer && (
        <div className="mt-6 border-y border-slate-200/50 dark:border-white/[0.08]">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="w-full py-4 flex items-center justify-between gap-4 text-left text-slate-500 dark:text-slate-400 hover:text-[#39C5BB] transition-colors"
            aria-expanded={expanded}
          >
            <span className="font-serif text-sm leading-relaxed">{drawerParts.join(' · ')}</span>
            <span className={`text-xs transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden>⌄</span>
          </button>

          {expanded && (
            <div className="pb-7 flex flex-col gap-7">
              {seriesPosts.length > 1 && (
                <div>
                  <div className="font-mono text-[9px] tracking-[0.28em] uppercase text-slate-400 dark:text-slate-500 mb-3">Series <span className="font-serif normal-case tracking-normal ml-2">合集目录</span></div>
                  <ol className="flex flex-col gap-2.5">
                    {seriesPosts.map((post, index) => (
                      <li key={post.id} className="flex items-baseline gap-3 min-w-0">
                        <span className="font-mono text-[9px] text-slate-300 dark:text-slate-600 shrink-0">{String(index + 1).padStart(2, '0')}</span>
                        {post.id === current.id
                          ? <span className="font-serif text-sm text-slate-500 dark:text-slate-400 truncate">{post.title} <span className="text-[#39C5BB]">· 本篇</span></span>
                          : <button onClick={() => onOpen(post)} className="font-serif text-sm text-slate-600 dark:text-slate-300 truncate hover:text-[#39C5BB] transition-colors">{post.title}</button>}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {backlinks.length > 0 && (
                <div>
                  <div className="font-mono text-[9px] tracking-[0.28em] uppercase text-slate-400 dark:text-slate-500 mb-3">Echoes <span className="font-serif normal-case tracking-normal ml-2">谁曾提到这里</span></div>
                  <div className="flex flex-col gap-4">
                    {backlinks.map(({ post, before, after, rawTitle }) => (
                      <button key={post.id} onClick={() => onOpen(post)} className="group flex gap-3 text-left w-full">
                        <span className="w-px shrink-0 rounded-full opacity-50" style={{ backgroundColor: post.color }} aria-hidden />
                        <span className="min-w-0">
                          <span className="block font-serif text-sm text-slate-600 dark:text-slate-300 group-hover:text-[#39C5BB] transition-colors truncate">{post.title}</span>
                          <span className="block mt-1 font-serif text-xs text-slate-400 dark:text-slate-500 leading-relaxed">{before}<span style={{ color }}>{rawTitle}</span>{after}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {remainingRelated.length > 0 && (
                <div>
                  <div className="font-mono text-[9px] tracking-[0.28em] uppercase text-slate-400 dark:text-slate-500 mb-3">Related <span className="font-serif normal-case tracking-normal ml-2">继续漫游</span></div>
                  <div className="flex flex-col gap-2.5">
                    {remainingRelated.map((post) => (
                      <button key={post.id} onClick={() => onOpen(post)} className="flex items-center gap-3 text-left group">
                        <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: post.color }} />
                        <span className="font-serif text-sm text-slate-600 dark:text-slate-300 group-hover:text-[#39C5BB] transition-colors">{post.title}</span>
                        <span className="ml-auto font-mono text-[9px] text-slate-400 dark:text-slate-600">{post.date}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {(prev || next) && (
        <div className="mt-6 flex items-start justify-between gap-8 font-serif text-xs text-slate-400 dark:text-slate-500">
          {prev ? <button onClick={() => onOpen(prev)} className="text-left hover:text-[#39C5BB] transition-colors">← 更早 · {prev.title}</button> : <span />}
          {next ? <button onClick={() => onOpen(next)} className="text-right hover:text-[#39C5BB] transition-colors">{next.title} · 更新 →</button> : <span />}
        </div>
      )}
    </section>
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

// ══════════════════════════════════════════════════════════════
// 🚪 阅读舱出口：全屏模式始终保留可见退路。桌面右上，移动左上，把右上留给目录。
// ══════════════════════════════════════════════════════════════
const EXIT_HINT_KEY = 'oasis_reader_esc_hinted';

export const ReaderExit: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(EXIT_HINT_KEY)) return;
    const show = window.setTimeout(() => {
      sessionStorage.setItem(EXIT_HINT_KEY, '1');
      setHint(true);
    }, 900);
    const hide = window.setTimeout(() => setHint(false), 4200);
    return () => { window.clearTimeout(show); window.clearTimeout(hide); };
  }, []);

  return (
    <div className="fixed z-[170] top-[max(1.25rem,calc(env(safe-area-inset-top)+0.75rem))] left-5 lg:left-auto lg:right-8">
      <button
        onClick={onClose}
        aria-label="关闭阅读"
        aria-keyshortcuts="Escape"
        className="w-10 h-10 rounded-full grid place-items-center bg-white/60 dark:bg-white/[0.07] backdrop-blur-md border border-white/60 dark:border-white/10 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.4)] text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-white/80 dark:hover:bg-white/[0.12] transition-colors duration-300 outline-none focus-visible:outline-2 focus-visible:outline-[#39C5BB]"
      >
        <svg viewBox="0 0 24 24" className="w-[17px] h-[17px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      <AnimatePresence>
        {hint && (
          <motion.span
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-full mt-2 left-0 lg:left-auto lg:right-0 whitespace-nowrap px-2.5 py-1 rounded-lg pointer-events-none font-mono text-[9px] tracking-[0.18em] uppercase text-slate-500 dark:text-slate-400 bg-white/75 dark:bg-[#0E1424]/85 backdrop-blur-md border border-white/60 dark:border-white/10"
          >
            Esc 也可退出
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
};
