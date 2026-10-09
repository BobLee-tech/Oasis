// 情绪花与情绪板共用的小工具（单独成文件：组件文件只导出组件，热更新才不掉状态）。
import { FEEL_LABELS, MAX_INTENSITY, normalizeFeels } from '../../../scripts/lib/mood-core.mjs';
import type { Feel, Feels } from './api';

/** 花瓣顺序（顺时针，从正上方起）：相邻的维在感受上相近。键盘 1–9、0 依次对应。 */
export const FLOWER_ORDER: Feel[] = ['peaceful', 'tender', 'nostalgic', 'sad', 'tense', 'defiant', 'power', 'joyful', 'wonder', 'transcendence'];
export const FLOWER_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export const FEEL_COLORS: Record<Feel, string> = {
  peaceful: '#7FB8D9',
  tender: '#F4A7B9',
  nostalgic: '#D9A86C',
  sad: '#6F86B8',
  tense: '#7C8C99',
  defiant: '#C8564F',
  power: '#F08A3C',
  joyful: '#F2C94C',
  wonder: '#39C5BB',
  transcendence: '#B7A6E0',
};

/** 某一维 +delta；+1 到顶后回 0，−1 到 0 停住。返回洗过的向量（全空为 undefined）。 */
export const bumpFeel = (feels: Feels | undefined, feel: Feel, delta: 1 | -1): Feels | undefined => {
  const current = feels?.[feel] ?? 0;
  const next = delta > 0 ? (current >= MAX_INTENSITY ? 0 : current + 1) : Math.max(0, current - 1);
  return normalizeFeels({ ...feels, [feel]: next });
};

// 线性 RGB 里按强度加权平均：sRGB 直接平均会发灰
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
export const mixFeelColor = (feels: Feels | undefined) => {
  const entries = Object.entries(feels ?? {}) as [Feel, number][];
  const total = entries.reduce((sum, [, level]) => sum + level, 0);
  if (!total) return undefined;
  const rgb = [0, 0, 0];
  for (const [feel, level] of entries) {
    const hex = FEEL_COLORS[feel];
    for (let i = 0; i < 3; i += 1) rgb[i] += toLinear(parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255) * (level / total);
  }
  return `#${rgb.map(c => Math.round(toSrgb(c) * 255).toString(16).padStart(2, '0')).join('')}`;
};

export const feelsText = (feels: Feels | undefined) =>
  FLOWER_ORDER.filter(feel => feels?.[feel]).map(feel => `${FEEL_LABELS[feel]} ${feels![feel]}`).join(' · ');

export const valenceWord = (value: number) =>
  value <= -0.6 ? '很低落' : value <= -0.2 ? '偏低落' : value < 0.2 ? '中性' : value < 0.6 ? '偏明亮' : '很明亮';
