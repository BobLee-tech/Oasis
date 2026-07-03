// 🕰️ 时间上下文：让整座绿洲共享同一份「现在是什么时候」的感知。
//   日夜界线随季节浮动（夏天天黑得晚、冬天天黑得早），时段划分供问候语与深夜提醒使用。

import { currentSeason, type Season } from './solarTerms';

export type DayPeriod = 'dawn' | 'morning' | 'afternoon' | 'dusk' | 'night' | 'lateNight';

// 各季节的近似日出 / 日落（本地时间，单位：分钟数）
const SUN_TABLE: Record<Season, { sunrise: number; sunset: number }> = {
  spring: { sunrise: 6 * 60, sunset: 18 * 60 + 30 },
  summer: { sunrise: 5 * 60 + 30, sunset: 19 * 60 + 30 },
  autumn: { sunrise: 6 * 60, sunset: 18 * 60 },
  winter: { sunrise: 7 * 60, sunset: 17 * 60 + 30 },
};

const minutesOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes();

// 白昼与否：驱动 auto 主题的日夜切换
export const isDaytime = (date: Date = new Date()): boolean => {
  const { sunrise, sunset } = SUN_TABLE[currentSeason(date)];
  const m = minutesOfDay(date);
  return m >= sunrise && m < sunset;
};

// 当前时段：深夜 23:00–4:59，其余按常识划分
export const currentPeriod = (date: Date = new Date()): DayPeriod => {
  const h = date.getHours();
  if (h >= 23 || h < 5) return 'lateNight';
  if (h < 8) return 'dawn';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 19) return 'dusk';
  return 'night';
};

// 夜深了：深夜提醒与夜间问候共用的判断
export const isLateNight = (date: Date = new Date()): boolean =>
  currentPeriod(date) === 'lateNight';
