import React, { useEffect, useRef } from 'react';
import { getSpectrum } from '../../hooks/useSoundscape';
import { useTicker } from '../../lib/ticker';

interface StageMeterProps {
  color: string;
  isPlaying: boolean;
  bars?: number;
  active?: boolean;
  compact?: boolean;
}

/** 同一能量缓存上的轻量 VU；无论页面放几组仪表，每帧都只读取一次真实频谱。 */
export const StageMeter: React.FC<StageMeterProps> = ({
  color,
  isPlaying,
  bars = 44,
  active = true,
  compact = false,
}) => {
  const barsRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(isPlaying);

  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);

  useTicker(() => {
    const container = barsRef.current;
    if (!container) return;
    const half = Math.ceil(bars / 2);
    const center = (bars - 1) / 2;
    const spectrum = getSpectrum(half);
    const children = container.children;
    for (let index = 0; index < children.length; index += 1) {
      const band = Math.round(Math.abs(index - center));
      const level = Math.pow(spectrum[Math.min(half - 1, band)] ?? 0, 0.72);
      const element = children[index] as HTMLElement;
      element.style.height = `${4 + level * 92}%`;
      element.style.opacity = `${playingRef.current ? 0.2 + level * 0.76 : 0.14}`;
      element.style.boxShadow = level > 0.6 ? `0 0 ${4 + level * 7}px ${color}` : 'none';
    }
  }, active);

  return (
    <div className={`relative flex w-full items-center justify-center ${compact ? 'h-7' : 'h-16'}`}>
      <span
        className="pointer-events-none absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-current to-transparent opacity-10"
        style={{ color }}
      />
      <div ref={barsRef} className="flex h-full w-full items-center justify-center gap-[2px]">
        {Array.from({ length: bars }, (_, index) => (
          <span
            key={index}
            className="w-[2px] shrink-0 rounded-full"
            style={{
              height: '4%',
              backgroundColor: color,
              opacity: 0.14,
              transition:
                'height 90ms cubic-bezier(0.22,0.61,0.36,1), opacity 180ms linear, box-shadow 180ms linear',
            }}
          />
        ))}
      </div>
    </div>
  );
};
