import React, { forwardRef, memo, useMemo } from 'react';
import { beatsOf } from '../../lib/lyricTiming';
import type { TimedLyricLine } from '../../lib/lyricTiming';

type LyricRowStyle = React.CSSProperties & { '--accent': string };
type LyricBeatStyle = React.CSSProperties & { '--a': number; '--b': number };

interface LyricRowProps {
  line: TimedLyricLine;
  index: number;
  isCurrent: boolean;
  showTranslation: boolean;
  compact: boolean;
  color: string;
  onChoose: (index: number) => void;
}

const round = (value: number) => Math.round(value * 1e4) / 1e4;

/**
 * 一行歌词。
 *
 * `--d`（与焦点的距离）/`--past`/`--p`（已唱进度）全部由 LyricField 每帧
 * 直接写进 DOM，不走 props——否则每次换行都要重渲染整个词场。这里只负责
 * 结构与那些真正会变的内容。
 */
const LyricRowView = forwardRef<HTMLButtonElement, LyricRowProps>(
  ({ line, index, isCurrent, showTranslation, compact, color, onChoose }, ref) => {
    const beats = useMemo(() => beatsOf(line.ja), [line.ja]);

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
        // 词场本身是键盘焦点（上下键浏览），一首歌几十行不该是几十个 Tab 停靠点
        tabIndex={-1}
        data-active={isCurrent}
        data-role={line.role ?? 'lead'}
        data-breath={line.breath}
        data-lyric-index={index}
        onClick={() => onChoose(index)}
        aria-label={`跳转到 ${(line.startMs / 1_000).toFixed(1)} 秒：${line.ja}`}
        className={`lyric-row group relative block outline-none ${alignment} ${
          compact ? 'px-2 py-3' : 'px-3 py-3.5 xl:py-4'
        }`}
        style={{ '--accent': color } as LyricRowStyle}
      >
        <span
          className={`lyric-ja relative inline-block max-w-full font-serif font-medium leading-[1.6] tracking-[0.075em] ${
            compact ? 'text-[1.3rem]' : 'text-[1.42rem] xl:text-[1.68rem]'
          }`}
        >
          {beats.map((beat, beatIndex) => (
            <span
              key={beatIndex}
              className="lyric-beat"
              style={{ '--a': round(beat.from), '--b': round(beat.to) } as LyricBeatStyle}
            >
              {beat.text}
            </span>
          ))}
        </span>

        {showTranslation && (
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

LyricRowView.displayName = 'LyricRow';

export const LyricRow = memo(LyricRowView);
