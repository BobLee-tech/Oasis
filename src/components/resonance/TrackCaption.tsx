import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Track } from '../../types/music';
import { MOTION } from '../../lib/motion';
import { useTrackProfile } from '../../lib/trackProfile';

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
  /** 桌面选碟台：左对齐（右栏一条轴），署名行带专辑与年份；手机唱片页居中，只要歌名与艺人。 */
  desk?: boolean;
  /** 歌名本身可点，翻开内页；参数是涟漪的原点。不传就不可点。内页的主入口是下方的内页条 */
  onOpenNotes?: (origin: HTMLElement) => void;
}

/**
 * 🏷️ 曲目铭牌：外框高度固定（按最大字号两行预留），新旧曲目在同一个框里叠放交叉淡化。
 * 歌名长短、行数变化都不会改变外框尺寸，下方的内页条和碟箱因此一动不动（规矩 2）。
 * 桌面版内容贴底：歌名一行时空白留在上方，署名行始终紧挨着内页条。
 */
export const TrackCaption: React.FC<TrackCaptionProps> = ({ track, isPlaying, desk = false, onOpenNotes }) => {
  const profile = useTrackProfile(track.id);
  const byline = desk ? [profile?.album, profile?.year ? String(profile.year) : ''].filter((item): item is string => Boolean(item)) : [];

  return (
    <div className={`relative w-full ${desk ? 'h-[8.5rem] [@media(min-height:900px)]:h-[10.25rem]' : 'h-[6.75rem] sm:h-[8rem]'}`}>
      <AnimatePresence initial={false}>
        <motion.div
          key={track.id}
          className={`absolute inset-0 flex flex-col ${desk ? 'items-start justify-end text-left' : 'items-center justify-center text-center'}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={MOTION.swap}
        >
          <h2
            title={track.title}
            lang="ja"
            className={`${desk ? deskTitleSizeClass(titleVisualWidth(track.title)) : titleSizeClass(titleVisualWidth(track.title))} font-serif text-slate-800 dark:text-slate-50 tracking-wide leading-[1.12] w-full text-balance line-clamp-2`}
          >
            {onOpenNotes ? (
              <button
                type="button"
                onClick={event => onOpenNotes(event.currentTarget)}
                aria-label={`${track.title}，翻开内页`}
                className={`rounded-xl outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--mood)_8%,transparent)] focus-visible:ring-2 focus-visible:ring-[color:var(--mood)] ${desk ? '-ml-2 px-2 text-left' : 'px-2'}`}
              >
                {track.title}
              </button>
            ) : track.title}
          </h2>

          <div className={`flex items-center ${desk ? 'mt-3 gap-2.5' : 'justify-center gap-2.5 mt-3'}`}>
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0 transition-opacity duration-300"
              style={{ backgroundColor: 'var(--mood)', opacity: isPlaying ? 0.9 : 0.4 }}
            />
            <p className={`font-mono uppercase text-slate-500 dark:text-slate-400 ${desk ? 'text-[11px] tracking-[0.3em]' : 'text-[10px] tracking-[0.36em]'}`}>
              {track.artist}
            </p>
            {byline.map(item => (
              <p key={item} lang="ja" className="flex items-center gap-2.5 text-[12px] tracking-[0.1em] text-slate-500 dark:text-slate-400">
                <span aria-hidden className="text-slate-300 dark:text-slate-600">·</span>
                <span className={/^\d+$/.test(item) ? 'font-mono text-[11px] tabular-nums' : 'font-[family-name:var(--font-zh)]'}>{item}</span>
              </p>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
