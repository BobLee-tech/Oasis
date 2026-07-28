import { useEffect, useRef } from 'react';
import { sampleEnergy } from '../hooks/useSoundscape';

export type TickFn = (now: number, dt: number) => void;

const subscribers = new Set<TickFn>();
let animationFrame = 0;
let previousTime = 0;
let frame = 0;
let coarsePointer: boolean | null = null;

const isCoarsePointer = () => {
  if (coarsePointer === null) {
    coarsePointer =
      typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  }
  return coarsePointer;
};

const loop = (now: number) => {
  animationFrame = window.requestAnimationFrame(loop);

  if (document.visibilityState !== 'visible') {
    previousTime = now;
    return;
  }

  if (isCoarsePointer() && (frame++ & 1) === 1) return;

  const dt = previousTime === 0 ? 0 : Math.min(0.05, (now - previousTime) / 1_000);
  previousTime = now;
  sampleEnergy(dt);
  subscribers.forEach(callback => callback(now, dt));
};

const start = () => {
  if (animationFrame || typeof window === 'undefined') return;
  previousTime = 0;
  frame = 0;
  animationFrame = window.requestAnimationFrame(loop);
};

const stop = () => {
  if (!animationFrame) return;
  window.cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  previousTime = 0;
};

export const subscribeTicker = (callback: TickFn) => {
  subscribers.add(callback);
  start();
  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0) stop();
  };
};

/** 所有常驻视觉共用的一条 rAF；回调保存在 ref 中，组件重渲染不会重新订阅。 */
export const useTicker = (callback: TickFn, enabled = true) => {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeTicker((now, dt) => callbackRef.current(now, dt));
  }, [enabled]);
};
