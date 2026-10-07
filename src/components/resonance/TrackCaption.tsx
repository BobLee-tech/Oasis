import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Track } from '../../types/music';
import { MOTION } from '../../lib/motion';

// 📏 长标题分档：曲库里日文标题混着半角符号（如 outro ~タイムリミット -Endless-~），
//   固定字号一律用 md:text-6xl 时三行起步。按「视觉宽度」而非字符数分档——
//   假名/汉字按 1.7 倍宽度估，比单纯数字符数更准，纯 CSS clamp 对中日文混排调不准。
const CJK_WIDE_RE = /[\u3000-\u9FFF\uFF00-\uFFEF]/; // CJK 表意文字/假名 + 全角符号，用 \u 转义避开字面全角字符被 lint 当不可见字符误用
const titleVisualWidth = (s: string) => {
  let w = 0;
  for (const ch of s) w += CJK_WIDE_RE.test(ch) ? 1.7 : 1;
  return w;
};
// 手机唱片页：随屏宽分三档。
const titleSizeClass = (w: number) => {
  if (w <= 14) return 'text-[2rem] sm:text-[2.6rem]';
  if (w <= 24) return 'text-[1.75rem] sm:text-[2.25rem]';
  if (w <= 38) return 'text-[1.5rem] sm:text-[1.9rem]';
  return 'text-[1.3rem] sm:text-[1.6rem]';
};
// 桌面选碟台：外框按「两行」定高，所以字号随屏高分档——高屏（≥900px）才用最大一档，
// 普通笔记本高度下降一档，给下面的碟箱留出至少五六行。
// 注意：Tailwind 只生成源码里完整出现的类名，所以高屏变体逐个写全，不用模板拼接。
const deskTitleSizeClass = (w: number) => {
  if (w <= 14) return 'text-5xl [@media(min-height:900px)]:text-6xl';
  if (w <= 24) return 'text-4xl [@media(min-height:900px)]:text-5xl';
  if (w <= 38) return 'text-3xl [@media(min-height:900px)]:text-4xl';
  return 'text-2xl [@media(min-height:900px)]:text-3xl';
};

interface TrackCaptionProps {
  track: Track;
  isPlaying: boolean;
  /** 桌面选碟台带摘句、留更高的固定高度；手机唱片页只要歌名与艺人。 */
  withExcerpt?: boolean;
  /** 艺人那一行末尾的「内页」入口（曲目卡）；不传就不显示 */
  onOpenNotes?: () => void;
}

/**
 * 🏷️ 曲目铭牌：外框高度固定（按最大字号两行预留），新旧曲目在同一个框里叠放交叉淡化。
 * 歌名长短、行数变化都不会改变外框尺寸，下方的切换条和碟箱因此一动不动（规矩 2）。
 */
export const TrackCaption: React.FC<TrackCaptionProps> = ({ track, isPlaying, withExcerpt = false, onOpenNotes }) => (
  <div className={`relative w-full ${withExcerpt ? 'h-[12rem] [@media(min-height:900px)]:h-[15rem]' : 'h-[6.75rem] sm:h-[8rem]'}`}>
    <AnimatePresence initial={false}>
      <motion.div
        key={track.id}
        className="absolute inset-0 flex flex-col items-center justify-center text-center"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={MOTION.swap}
      >
        <h2
          title={track.title}
          className={`${withExcerpt ? deskTitleSizeClass(titleVisualWidth(track.title)) : titleSizeClass(titleVisualWidth(track.title))} font-serif text-slate-800 dark:text-slate-50 tracking-wide leading-[1.12] w-full text-balance line-clamp-2`}
        >
          {track.title}
        </h2>

        <div className={`flex items-center justify-center ${withExcerpt ? 'gap-3 mt-4 [@media(min-height:900px)]:mt-5' : 'gap-2.5 mt-3'}`}>
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0 transition-opacity duration-300"
            style={{ backgroundColor: 'var(--mood)', opacity: isPlaying ? 0.9 : 0.4 }}
          />
          <p className={`font-mono uppercase text-slate-500 dark:text-slate-400 ${withExcerpt ? 'text-[11px] md:text-xs tracking-[0.4em]' : 'text-[10px] tracking-[0.36em]'}`}>
            {track.artist}
          </p>
          {onOpenNotes && (
            <button
              type="button"
              onClick={onOpenNotes}
              aria-label={`打开「${track.title}」的内页`}
              className="group/notes -my-2 flex items-center gap-1 rounded-full px-2 py-2 font-mono text-[9px] tracking-[0.28em] text-slate-400 outline-none transition-colors hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-[color:var(--mood)] dark:text-slate-500 dark:hover:text-slate-200"
            >
              <span aria-hidden className="h-2.5 w-px bg-slate-300 dark:bg-white/15" />
              <span className="pl-1.5">内页</span>
              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 transition-transform duration-200 group-hover/notes:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                <path d="M4.5 2.5L8 6l-3.5 3.5" />
              </svg>
            </button>
          )}
        </div>

        {withExcerpt && track.excerpt && (
          <p
            className={`mt-4 [@media(min-height:900px)]:mt-6 max-w-[420px] font-serif italic text-slate-600 dark:text-slate-300 tracking-wider text-base [@media(min-height:900px)]:text-lg leading-loose line-clamp-1 transition-opacity duration-700`}
            style={{ opacity: isPlaying ? 1 : 0.55 }}
          >
            <span className="mr-0.5 text-xl align-[-0.15em] opacity-60" style={{ color: 'var(--mood)' }}>“</span>
            {track.excerpt}
            <span className="ml-0.5 text-xl align-[-0.15em] opacity-60" style={{ color: 'var(--mood)' }}>”</span>
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  </div>
);
