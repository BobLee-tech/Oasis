import React, { forwardRef } from 'react';

type InterludeStyle = React.CSSProperties & {
  '--g': number;
  '--e': number;
  '--accent': string;
};

/**
 * 间奏：一圈从 0 扫到 360° 的细弧。
 *
 * 旧的三颗点只说明「有间奏」，不说明「还有多久」——而 interludeAt() 本来就
 * 算出了 progress。用 pathLength="1" 把周长归一化，dashoffset 直接吃 --g，
 * 于是等待本身成了可读的信息。中心一点随鼓点轻搏。
 */
export const Interlude = forwardRef<HTMLDivElement, { visible: boolean; color: string }>(
  ({ visible, color }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      className={`lyric-interlude absolute left-1/2 top-[42%] z-20 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-500 ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      style={{ '--g': 0, '--e': 0, '--accent': color } as InterludeStyle}
    >
      <svg viewBox="0 0 44 44" className="block h-11 w-11 -rotate-90 overflow-visible">
        <circle
          cx="22"
          cy="22"
          r="19"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          className="text-slate-300/50 dark:text-white/10"
        />
        <circle
          className="lyric-interlude-arc"
          cx="22"
          cy="22"
          r="19"
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
          pathLength="1"
        />
      </svg>
      <span className="lyric-interlude-core" />
    </div>
  ),
);

Interlude.displayName = 'Interlude';
