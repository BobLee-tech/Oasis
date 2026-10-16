import { useEffect, useState } from 'react';

const WAKE_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * 😴 闲置检测：enabled 时，任何指针、键盘、滚轮、触摸都让人「醒着」，静默 ms 后转为闲置。
 * 不 enabled 时恒为醒着——调用方据此只在需要的状态里（如歌词近景、正在播放）隐去控件。
 */
export const useIdle = (enabled: boolean, ms = 2_500) => {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let timer = window.setTimeout(() => setIdle(true), ms);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), ms);
    };
    WAKE_EVENTS.forEach(type => window.addEventListener(type, wake, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      WAKE_EVENTS.forEach(type => window.removeEventListener(type, wake));
      setIdle(false);
    };
  }, [enabled, ms]);
  return enabled && idle;
};
