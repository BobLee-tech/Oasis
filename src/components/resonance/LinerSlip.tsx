import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MOTION } from '../../lib/motion';
import { useTrackProfile } from '../../lib/trackProfile';
import type { Track } from '../../types/music';

interface LinerSlipProps {
  track: Track;
  /** 参数是涟漪的原点 */
  onOpen: (origin: HTMLElement) => void;
  /** 联动高亮：悬停贴纸时内页条抬起 */
  lifted?: boolean;
  /** 首访提示期间描一道情绪色边 */
  hinting?: boolean;
  onHover?: (hovering: boolean) => void;
  /** 手机：只留一行 */
  compact?: boolean;
}

/**
 * 🧾 内页条：歌名下面的一张纸条，把内页里的一两条事实提前放在入口上（信息气味）——
 * 曲序 · 出处（没有出处写作曲者，避免与署名行的专辑 · 年份重复）、摘句，以及“翻开”。外框定高，换曲时内容在框里交叉淡化（规矩 2）。
 */
export const LinerSlip: React.FC<LinerSlipProps> = ({ track, onOpen, lifted = false, hinting = false, onHover, compact = false }) => {
  const profile = useTrackProfile(track.id);
  const trackNo = profile?.trackNo ? `No.${String(profile.trackNo).padStart(2, '0')}` : '';
  // 署名行已经写了专辑与年份，这里不重复：出处 > 作曲 > 作词 > （都没有才）专辑 · 年份
  const composer = profile?.credits?.composer?.join(' / ');
  const lyricist = profile?.credits?.lyricist?.join(' / ');
  const source = profile?.tieIn
    ?? (composer ? `作曲 ${composer}` : lyricist ? `作词 ${lyricist}` : [profile?.album, profile?.year].filter(Boolean).join(' · '));
  const fact = [trackNo, source].filter(Boolean).join(' · ');
  const quote = track.excerpt?.replace(/^-+\s*|\s*-+$/g, '').trim();
  const raised = lifted || hinting;

  return (
    <button
      type="button"
      onClick={event => onOpen(event.currentTarget)}
      onPointerEnter={() => onHover?.(true)}
      onPointerLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
      aria-label={`翻开「${track.title}」的内页${fact ? `：${fact}` : ''}`}
      className={`group/slip relative block w-full overflow-hidden rounded-[4px_16px_16px_16px] border bg-[#FFFDF8]/80 text-left outline-none transition-[transform,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:-translate-y-0.5 hover:border-[color:color-mix(in_srgb,var(--mood)_45%,transparent)] hover:shadow-[0_10px_26px_rgba(15,23,42,0.12)] focus-visible:ring-2 focus-visible:ring-[color:var(--mood)] dark:bg-white/[0.035] ${
        compact ? 'h-11' : 'h-[5.5rem]'
      } ${raised
        ? '-translate-y-0.5 border-[color:color-mix(in_srgb,var(--mood)_45%,transparent)] shadow-[0_10px_26px_rgba(15,23,42,0.12)]'
        : 'border-slate-200/70 dark:border-white/[0.08]'}`}
    >
      <span aria-hidden className="absolute bottom-3 left-0 top-3 w-[2px] rounded-full opacity-75" style={{ backgroundColor: 'var(--mood)' }} />
      <AnimatePresence initial={false}>
        <motion.span
          key={track.id}
          className={`absolute inset-0 flex items-center gap-4 ${compact ? 'pl-4 pr-3' : 'pl-5 pr-4'}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={MOTION.swap}
        >
          {compact ? (
            <span className="flex min-w-0 flex-1 items-baseline gap-2.5">
              <span className="shrink-0 font-[family-name:var(--font-zh)] text-[13px] font-semibold tracking-[0.2em] text-slate-700 dark:text-slate-200">内页</span>
              <span className="truncate font-[family-name:var(--font-zh)] text-[12px] text-slate-500 dark:text-slate-400">{fact || quote}</span>
            </span>
          ) : (
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-baseline gap-2.5">
                <span className="font-[family-name:var(--font-zh)] text-[13px] font-semibold tracking-[0.2em] text-slate-700 dark:text-slate-200">内页</span>
                <span className="font-mono text-[10px] tracking-[0.28em] text-slate-400 dark:text-slate-500">LINER NOTES</span>
              </span>
              {fact && <span lang="ja" className="truncate font-[family-name:var(--font-zh)] text-[12.5px] text-slate-500 dark:text-slate-400">{fact}</span>}
              {quote && <span lang="ja" className="truncate font-[family-name:var(--font-ja)] text-[14px] tracking-[0.08em] text-slate-700 dark:text-slate-200">「{quote}」</span>}
            </span>
          )}
          <span className="flex shrink-0 items-center gap-1 font-[family-name:var(--font-zh)] text-[12.5px] text-slate-500 transition-colors group-hover/slip:text-slate-800 dark:text-slate-400 dark:group-hover/slip:text-slate-100">
            {!compact && '翻开'}
            <svg viewBox="0 0 12 12" className={`h-3 w-3 transition-transform duration-200 group-hover/slip:translate-x-0.5 ${raised ? 'translate-x-0.5' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
              <path d="M4.5 2.5L8 6l-3.5 3.5" />
            </svg>
          </span>
        </motion.span>
      </AnimatePresence>
    </button>
  );
};
