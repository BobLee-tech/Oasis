import React, { forwardRef } from 'react';
import type { TimedLyricLine } from '../../lib/lyricTiming';

type LyricRowStyle = React.CSSProperties & {
  '--accent': string;
  '--d': number;
  '--p': number;
  '--past': number;
};

interface LyricRowProps {
  line: TimedLyricLine;
  index: number;
  distance: number;
  isCurrent: boolean;
  isPast: boolean;
  showTranslation: boolean;
  compact: boolean;
  color: string;
  onChoose: (index: number) => void;
}

export const LyricRow = forwardRef<HTMLButtonElement, LyricRowProps>(
  (
    {
      line,
      index,
      distance,
      isCurrent,
      isPast,
      showTranslation,
      compact,
      color,
      onChoose,
    },
    ref,
  ) => {
    const alignment =
      line.role === 'backing'
        ? 'ml-auto w-[88%] text-right'
        : line.role === 'duet-right'
          ? 'ml-auto w-[82%] text-right'
          : line.role === 'duet-left'
            ? 'mr-auto w-[82%] text-left'
            : 'w-full text-left';

    return (
      <button
        ref={ref}
        type="button"
        role="listitem"
        data-active={isCurrent}
        data-role={line.role ?? 'lead'}
        onClick={() => onChoose(index)}
        aria-label={`跳转到 ${(line.startMs / 1_000).toFixed(1)} 秒：${line.ja}`}
        className={`lyric-row group relative block outline-none ${alignment} ${
          compact ? 'px-2 py-3.5' : 'px-3 py-4 xl:py-[1.15rem]'
        }`}
        style={
          {
            '--accent': color,
            '--d': distance,
            '--past': isPast ? 1 : 0,
            '--p': isPast ? 1 : 0,
          } as LyricRowStyle
        }
      >
        <span
          className={`lyric-ja relative inline-block max-w-full font-serif font-medium leading-[1.62] tracking-[0.075em] ${
            compact ? 'text-[1.32rem]' : 'text-[1.45rem] xl:text-[1.72rem]'
          }`}
        >
          <span className="lyric-ink-base block text-slate-600 dark:text-slate-300">
            {line.ja}
          </span>
          <span className="lyric-ink-wet absolute inset-0 block" aria-hidden="true">
            {line.ja}
          </span>
        </span>

        {showTranslation && line.zh && (
          <span
            className={`lyric-translation mt-1.5 block font-sans leading-relaxed tracking-[0.04em] text-slate-400 dark:text-slate-500 ${
              compact ? 'text-[11px]' : 'text-[12px] xl:text-[13px]'
            }`}
          >
            {line.zh}
          </span>
        )}
      </button>
    );
  },
);

LyricRow.displayName = 'LyricRow';
