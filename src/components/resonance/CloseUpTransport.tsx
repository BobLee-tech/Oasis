import React, { useRef } from 'react';
import { getPlaybackTime, playNext, playPrev, togglePlay, usePlayer } from '../../hooks/useSoundscape';
import { useTicker } from '../../lib/ticker';
import { VolumePopover } from './VolumePopover';

const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
};

/**
 * 🎛 歌词近景的走带：缩成一行，落在唱片下沿与歌词底之间的空带里（docs/music-stage-redesign-demo.html）。
 * 显隐由父级决定（闲置隐去、暂停常显）；隐去时 inert，不留可聚焦的隐形按钮。
 */
export const CloseUpTransport: React.FC<{ visible: boolean; active: boolean }> = ({ visible, active }) => {
  const isPlaying = usePlayer(s => s.isPlaying);
  const duration = usePlayer(s => s.duration);
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const lastRef = useRef(-1);

  useTicker(() => {
    const second = Math.floor(getPlaybackTime());
    if (second === lastRef.current || !elapsedRef.current) return;
    lastRef.current = second;
    elapsedRef.current.textContent = formatTime(second);
  }, active);

  const key = 'flex h-9 w-9 items-center justify-center rounded-full text-slate-500 outline-none transition-colors hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-[color:var(--mood)] dark:text-slate-400 dark:hover:text-slate-100';

  return (
    <div
      inert={!visible}
      aria-hidden={!visible}
      className={`flex items-center gap-1 rounded-full border border-white/60 bg-white/45 py-1 pl-1.5 pr-2 shadow-[0_10px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl transition-opacity duration-300 ease-[cubic-bezier(0.2,0,0,1)] dark:border-white/10 dark:bg-white/[0.04] ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      <button type="button" onClick={playPrev} aria-label="上一首" className={key}>
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><polygon points="19 20 9 12 19 4 19 20" /><rect x="5" y="4" width="2" height="16" rx="1" /></svg>
      </button>
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? '暂停' : '播放'}
        className="mx-0.5 flex h-10 w-10 items-center justify-center rounded-full text-white outline-none transition-transform duration-200 hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-white/70"
        style={{ backgroundColor: 'var(--mood)', boxShadow: '0 6px 18px color-mix(in srgb, var(--mood) 30%, transparent)' }}
      >
        {isPlaying
          ? <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
          : <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-4 w-4"><polygon points="5 3 19 12 5 21 5 3" /></svg>}
      </button>
      <button type="button" onClick={playNext} aria-label="下一首" className={key}>
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><polygon points="5 4 15 12 5 20 5 4" /><rect x="17" y="4" width="2" height="16" rx="1" /></svg>
      </button>
      <span className="mx-2 select-none whitespace-nowrap font-mono text-[10px] tabular-nums tracking-[0.06em] text-slate-500 dark:text-slate-400">
        <span ref={elapsedRef}>0:00</span>
        <span className="text-slate-400 dark:text-slate-600"> / {formatTime(duration)}</span>
      </span>
      <VolumePopover placement="right" buttonClassName="h-9 w-9" />
    </div>
  );
};
