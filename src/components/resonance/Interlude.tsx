import React, { forwardRef } from 'react';

type InterludeStyle = React.CSSProperties & {
  '--g': number;
  '--e': number;
  '--accent': string;
};

export const Interlude = forwardRef<HTMLDivElement, { visible: boolean; color: string }>(
  ({ visible, color }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      className={`lyric-interlude absolute left-1/2 top-[42%] z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 transition-opacity duration-500 ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      style={{ '--g': 0, '--e': 0, '--accent': color } as InterludeStyle}
    >
      {[0, 1, 2].map(index => (
        <span key={index} className="lyric-drop block h-2 w-2 rounded-full border" />
      ))}
    </div>
  ),
);

Interlude.displayName = 'Interlude';
