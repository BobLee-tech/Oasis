// 🌗 自动日夜：AUTO 时跟随本地时间（日出日落随季节浮动），也可手动锁定 LIGHT / DARK。
//   选择持久在 localStorage；AUTO 模式下每分钟检查一次，跨过日夜界线时随 1500ms 过渡缓缓换天色。

import { useState, useEffect, useCallback } from 'react';
import { isDaytime } from '../lib/timeContext';

export type ThemeMode = 'auto' | 'light' | 'dark';

const STORE_KEY = 'oasis_theme_mode';

const loadMode = (): ThemeMode => {
  const v = localStorage.getItem(STORE_KEY);
  return v === 'light' || v === 'dark' ? v : 'auto';
};

export const useAutoTheme = () => {
  const [mode, setMode] = useState<ThemeMode>(loadMode);
  const [autoDark, setAutoDark] = useState(() => !isDaytime());

  // AUTO：每分钟看一眼天色
  useEffect(() => {
    if (mode !== 'auto') return;
    const tick = () => setAutoDark(!isDaytime());
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, [mode]);

  // 三态循环：AUTO → LIGHT → DARK → AUTO
  const cycleMode = useCallback(() => {
    setMode(prev => {
      const next: ThemeMode = prev === 'auto' ? 'light' : prev === 'light' ? 'dark' : 'auto';
      localStorage.setItem(STORE_KEY, next);
      return next;
    });
  }, []);

  const isDark = mode === 'auto' ? autoDark : mode === 'dark';
  return { mode, isDark, cycleMode };
};
