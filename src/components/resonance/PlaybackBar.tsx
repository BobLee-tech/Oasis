import React, { useRef } from 'react';
import { getPlaybackTime, seek, usePlayer } from '../../hooks/useSoundscape';
import { useTicker } from '../../lib/ticker';

const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

/**
 * ⏱️ 进度条：时间每帧都在变，所以不进 React。
 * ticker 读精确时钟，只在数值真的变化时写 DOM（填充用 scaleX，不改宽度）；
 * 拖动期间不回写滑块，松手后再交还给时钟。
 */
export const PlaybackBar: React.FC<{ active: boolean; compact?: boolean }> = ({ active, compact = false }) => {
  const duration = usePlayer(s => s.duration);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const draggingRef = useRef(false);
  const lastRef = useRef({ ratio: -1, second: -1 });

  const paint = (time: number) => {
    const ratio = duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0;
    const second = Math.floor(time);
    const last = lastRef.current;
    if (Math.abs(ratio - last.ratio) > 0.0005) {
      last.ratio = ratio;
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${ratio})`;
      if (thumbRef.current) thumbRef.current.style.left = `${ratio * 100}%`;
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
      <div className={`relative flex-1 flex items-center ${compact ? 'h-6' : 'group/seek h-6 md:h-4'}`}>
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
        <input
          ref={inputRef}
          type="range" min={0} max={duration || 0} step={0.1} defaultValue={0}
          onInput={onInput}
          onPointerDown={() => { draggingRef.current = true; }}
          onPointerUp={() => { draggingRef.current = false; }}
          onPointerCancel={() => { draggingRef.current = false; }}
          aria-label="播放进度"
          className={`absolute inset-x-0 w-full appearance-none bg-transparent cursor-pointer opacity-0 ${compact ? 'h-6' : 'h-6 md:h-4'}`}
        />
      </div>
      <span className={timeClass}>{formatTime(duration)}</span>
    </div>
  );
};
