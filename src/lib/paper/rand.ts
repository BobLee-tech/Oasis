// 🎲 种子随机：同一个名字永远画出同一封信、同一块石头。
//   fork() 从此刻的状态另起一支——先画信封、晚些（第一次移近时）再画笺，笺上的每一笔仍与当场画的一模一样。

/** 种子随机；fork() 从此刻的状态另起一支 */
export interface Rand { (): number; fork(): Rand }

export const rnd = (seed: number): Rand => {
  let s = seed >>> 0 || 1;
  return Object.assign(() => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296), { fork: () => rnd(s) });
};

/** 字符串 → 种子 */
export const hash = (str: string) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
