import React, { useEffect, useId, useMemo, useRef } from 'react';
import { getPlaybackTime, seek, usePlayer } from '../../hooks/useSoundscape';
import { useTicker } from '../../lib/ticker';
import { useTrackPeaks } from '../../lib/trackPeaks';

const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

/** 声波的视图高度（viewBox 单位）：条形最低 3、最高 30，中线对齐 */
const WAVE_H = 32;
const BAR_MIN = 3;
const BAR_SPAN = 27;

/**
 * ⏱️ 进度条：时间每帧都在变，所以不进 React。
 * ticker 读精确时钟，只在数值真的变化时写 DOM；拖动期间不回写滑块，松手后再交还给时钟。
 * 有声波峰值（scripts/lib/peaks-core.mjs，按需加载）时画成声波：已播的部分染情绪色，
 * 由 clipPath 的宽度推进；没有峰值（加载前、新歌还没分析）时是一条细线，填充用 scaleX。
 * 两种样子外框同高，峰值晚到时下方的传送键不跳（规矩 2）。
 */
export const PlaybackBar: React.FC<{ active: boolean; compact?: boolean }> = ({ active, compact = false }) => {
  const duration = usePlayer(s => s.duration);
  const trackId = usePlayer(s => s.track.id);
  const peaks = useTrackPeaks(trackId);
  const clipId = useId();
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const playedRef = useRef<SVGRectElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const draggingRef = useRef(false);
  const lastRef = useRef({ ratio: -1, second: -1 });

  // 换曲或峰值到达时，画法换了一套元素：下一帧无论进度变没变都重画一次
  useEffect(() => { lastRef.current.ratio = -1; }, [peaks]);

  const bars = useMemo(() => peaks?.map((value, i) => {
    const height = BAR_MIN + value * BAR_SPAN;
    return <rect key={i} x={i + 0.2} y={(WAVE_H - height) / 2} width={0.6} height={height} />;
  }), [peaks]);

  const paint = (time: number) => {
    const ratio = duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0;
    const second = Math.floor(time);
    const last = lastRef.current;
    if (Math.abs(ratio - last.ratio) > 0.0005) {
      last.ratio = ratio;
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${ratio})`;
      if (thumbRef.current) thumbRef.current.style.left = `${ratio * 100}%`;
      if (playedRef.current && peaks) playedRef.current.setAttribute('width', (ratio * peaks.length).toFixed(2));
    }
    if (second !== last.second) {
      last.second = second;
      if (elapsedRef.current) elapsedRef.current.textContent = formatTime(time);
      if (inputRef.current && !draggingRef.current) inputRef.current.value = String(time);
    }
  };

  useTicker(() => {
    if (!draggingRef.current) paint(getPlaybackTime());
  }, active);

  const onInput = (event: React.FormEvent<HTMLInputElement>) => {
    const value = Number(event.currentTarget.value);
    seek(value);
    paint(value);
  };

  const timeClass = 'font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400 w-9';

  return (
    <div className={`flex items-center ${compact ? 'gap-3' : 'gap-4 px-2'}`}>
      <span ref={elapsedRef} className={`${timeClass} text-right`}>0:00</span>
      <div className="group/seek relative flex h-8 flex-1 items-center">
        {bars ? (
          <svg
            viewBox={`0 0 ${bars.length} ${WAVE_H}`}
            preserveAspectRatio="none"
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            <defs>
              <clipPath id={clipId}>
                <rect ref={playedRef} x={0} y={0} width={0} height={WAVE_H} />
              </clipPath>
            </defs>
            <g className="fill-slate-300/75 transition-[fill] duration-200 group-hover/seek:fill-slate-400/60 dark:fill-white/[0.13] dark:group-hover/seek:fill-white/[0.2]">{bars}</g>
            <g clipPath={`url(#${clipId})`} style={{ fill: 'var(--mood)' }}>{bars}</g>
          </svg>
        ) : (
          <>
            <div className={`absolute inset-x-0 rounded-full bg-slate-300/50 dark:bg-white/10 overflow-hidden ${compact ? 'h-[4px]' : 'h-[4px] md:h-[3px] group-hover/seek:scale-y-[1.6] transition-transform duration-200'}`}>
              <div
                ref={fillRef}
                className="h-full w-full rounded-full origin-left"
                style={{ transform: 'scaleX(0)', backgroundColor: 'var(--mood)', boxShadow: '0 0 10px color-mix(in srgb, var(--mood) 56%, transparent)' }}
              />
            </div>
            <div
              ref={thumbRef}
              className={`absolute w-3 h-3 rounded-full bg-white dark:bg-slate-100 shadow-md -translate-x-1/2 pointer-events-none ring-2 ${compact ? '' : 'opacity-100 md:opacity-0 group-hover/seek:opacity-100 transition-opacity'}`}
              style={{ left: '0%', ['--tw-ring-color' as string]: 'var(--mood)' }}
            />
          </>
        )}
        <input
          ref={inputRef}
          type="range" min={0} max={duration || 0} step={0.1} defaultValue={0}
          onInput={onInput}
          onPointerDown={() => { draggingRef.current = true; }}
          onPointerUp={() => { draggingRef.current = false; }}
          onPointerCancel={() => { draggingRef.current = false; }}
          aria-label="播放进度"
          className="absolute inset-x-0 h-8 w-full cursor-pointer appearance-none bg-transparent opacity-0"
        />
      </div>
      <span className={timeClass}>{formatTime(duration)}</span>
    </div>
  );
};
