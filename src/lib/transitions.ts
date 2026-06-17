// src/lib/transitions.ts
// 🌊 界面切换转场：只动 opacity + 极轻 scale（合成器层，永不触发整屏重绘），
// 因此丝滑无抖动；交叉溶解全程重叠，任意时刻屏幕都有内容，结构上杜绝闪白。
import type { Variants } from 'framer-motion';

// 转场落点：被点击的 Dock 图标中心坐标，水光从这里晕开。
export type RippleOrigin = { x: number; y: number };

// 减速缓动：起步利落、收尾绵长，营造从容落定的高级感。
const EASE: [number, number, number, number] = [0.33, 0, 0.2, 1];

// 视图交叉溶解：纯 opacity，绝不在层级上做任何 transform（scale/translate）。
// 任何作用于整层的缩放都会让其中的文字被非整数倍率渲染、到位时归位 → 产生「较小位移」抖动。
// 去掉 scale 后，文字全程零位移，转场的视觉趣味交给落点的水波承担。
export const layerVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.6, ease: EASE } },
  exit: { opacity: 0, transition: { duration: 0.5, ease: EASE } },
};

// 降级：尊重 prefers-reduced-motion，退回不含缩放的快速淡入淡出。
export const reducedLayerVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

// 水波荡开缓动：起步轻快、尾段绵长渐缓，模拟水面涟漪向外舒展、缓缓平息的减速感。
export const BLOOM_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
