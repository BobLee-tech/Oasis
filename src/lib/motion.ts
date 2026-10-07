// 🎚️ 动效档位：同星图的字号档位思路，时长只有固定几档，不再随手写 0.28 / 0.6 / 0.8s。
//   tap  按下反馈、高亮块落位      swap 同一位置的内容交叉淡化
//   move 位置变化（抽屉、卡片）    mood 情绪色（由注册过的 --mood 变量在 CSS 里过渡，见 index.css）
import type { Transition } from 'framer-motion';

const EASE_STANDARD = [0.2, 0, 0, 1] as const;

export const MOTION = {
  tap: { duration: 0.12, ease: EASE_STANDARD },
  swap: { duration: 0.2, ease: EASE_STANDARD },
  move: { duration: 0.32, ease: EASE_STANDARD },
  /** 共享元素（高亮块、下划线）落位：临界附近的弹簧，不回弹过冲。 */
  settle: { type: 'spring', stiffness: 520, damping: 44 },
} satisfies Record<string, Transition>;

export const MOOD_MS = 1_450;
