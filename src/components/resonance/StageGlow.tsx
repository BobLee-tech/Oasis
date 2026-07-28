import React, { useEffect, useRef } from 'react';
import { getEnergy } from '../../hooks/useSoundscape';
import { useTicker } from '../../lib/ticker';

/**
 * 🕯️ 共享光场：以唱机为锚点、一直漫到词场底下的一片情绪色。
 *
 * 唱片与歌词原本是共享一块屏幕的两个物件；让同一束光同时落在它们身上，
 * 「声源 → 水面 → 词句」才是一个空间里的一件事。
 *
 * 用径向渐变而非 blur 滤镜：渐变本身就够软，省掉一整层大面积光栅化，
 * 每帧只改 opacity/transform。
 */
export const StageGlow: React.FC<{ color: string; isPlaying: boolean; active?: boolean }> = ({
  color,
  isPlaying,
  active = true,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const levelRef = useRef(0);
  const playingRef = useRef(isPlaying);

  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);

  useTicker((_now, dt) => {
    const element = ref.current;
    if (!element) return;
    const energy = getEnergy();
    const target = playingRef.current ? energy.low * 0.68 + energy.mid * 0.32 : 0;
    // 快亮慢暗：鼓点跟得上，余韵散得开
    levelRef.current +=
      (target - levelRef.current) * (1 - Math.exp(-dt / (target > levelRef.current ? 0.09 : 0.5)));
    const level = levelRef.current;
    element.style.opacity = String(0.045 + level * 0.34);
    element.style.transform = `scale(${1 + level * 0.08})`;
  }, active);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute -inset-x-[8%] -inset-y-[14%] z-0"
      style={{
        opacity: 0.045,
        background: `radial-gradient(46% 56% at 30% 46%, ${color}, transparent 72%)`,
        transition: 'background 1600ms ease',
      }}
    />
  );
};
