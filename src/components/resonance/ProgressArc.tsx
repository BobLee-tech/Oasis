import React, { useRef } from 'react';
import { getPlaybackTime, getPlayerSnapshot } from '../../hooks/useSoundscape';
import { useTicker } from '../../lib/ticker';

/**
 * ⭕ 歌词近景的进度：唱片退到舞台左缘后只露出右半边，进度就画在这半圈的边上——
 * 12 点到 6 点是整首歌。和进度条一样不进 React：ticker 只在千分位变化时写 stroke-dasharray。
 */
export const ProgressArc: React.FC<{ active: boolean; className?: string }> = ({ active, className }) => {
  const doneRef = useRef<SVGPathElement>(null);
  const lastRef = useRef(-1);

  useTicker(() => {
    const { duration } = getPlayerSnapshot();
    const ratio = duration > 0 ? Math.min(1, Math.max(0, getPlaybackTime() / duration)) : 0;
    const value = Math.round(ratio * 1000);
    if (value === lastRef.current || !doneRef.current) return;
    lastRef.current = value;
    doneRef.current.style.strokeDasharray = `${value} 1000`;
  }, active);

  // 线宽用 viewBox 单位（约 1px / 2px）：不用 vector-effect: non-scaling-stroke，Chrome 下它会让 pathLength 失效
  return (
    <svg viewBox="0 0 100 100" fill="none" overflow="visible" aria-hidden className={className}>
      <path
        d="M50 0 A50 50 0 0 1 50 100"
        stroke="currentColor"
        strokeOpacity={0.3}
        strokeWidth={0.22}
        className="text-slate-400 dark:text-slate-500"
      />
      <path
        ref={doneRef}
        d="M50 0 A50 50 0 0 1 50 100"
        pathLength={1000}
        stroke="var(--mood)"
        strokeWidth={0.55}
        strokeLinecap="round"
        style={{ strokeDasharray: '0 1000', filter: 'drop-shadow(0 0 4px color-mix(in srgb, var(--mood) 60%, transparent))' }}
      />
    </svg>
  );
};
