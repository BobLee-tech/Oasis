// 🌊 涟漪揭页的几何与节奏（docs/music-ripple-notes-demo.html）。纯函数，RippleReveal 与测试共用。
//
// 隐喻：内页一直在水下，唱片是投进水里的石子。波前 r(t) 从原点荡开，内页以圆形裁切跟在
// 波峰下方；每块内容在波前越过它之后才浮出。收回是时间倒放——会聚波向原点收拢，最后溅一小圈。

export const RIPPLE = {
  openMs: 980,
  closeMs: 720,
  splashMs: 380,
  /** 主波列波长（px）；溅落用更短的波 */
  lambda: 46,
  splashLambda: 22,
  /** 内页裁切边缘落后波峰的距离：硬边藏在波峰的高光底下 */
  clipLag: 10,
  /** 波前越过一块内容后，它在这段距离里浮出 */
  contentWindow: 170,
  /** 浮出时沿离心方向漂移的距离 */
  contentDrift: 16,
  /** 旧内容在波前到达前被推开的距离与影响宽度 */
  push: 7,
  pushWidth: 80,
} as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** 展开：起手快、抵达远角时慢下来（落水的初速大，能量随半径摊薄） */
export const easeOpen = (u: number) => 1 - Math.pow(1 - clamp01(u), 2.6);

/** 收回：先慢后快再慢，会聚 */
export const easeClose = (u: number) => {
  const t = clamp01(u);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/** 波要走多远才铺满整个容器：原点到最远角的距离，再多走一个波列 */
export const reachOf = (x: number, y: number, width: number, height: number) =>
  Math.max(Math.hypot(x, y), Math.hypot(width - x, y), Math.hypot(x, height - y), Math.hypot(width - x, height - y)) +
  RIPPLE.lambda * 1.75;

/** 一块距原点 d 的内容，在波前半径 r 时的浮出程度（0 沉 → 1 落定） */
export const revealOf = (r: number, d: number) =>
  smoothstep(clamp01((r - d - RIPPLE.clipLag) / RIPPLE.contentWindow));

/** 旧内容被波前推开的程度：波前到达前后的一个高斯峰 */
export const pushOf = (r: number, d: number) => Math.exp(-(((r - d + 30) / RIPPLE.pushWidth) ** 2));

/** 主波振幅：二维扩散按 1/√r 衰减；展开的尾段淡出，收回的起步淡入、末段淡出 */
export const waveAmplitude = (r: number, u: number, opening: boolean) => {
  const envelope = opening
    ? 1 - smoothstep(clamp01((u - 0.72) / 0.28))
    : smoothstep(clamp01(u / 0.12)) * (1 - smoothstep(clamp01((u - 0.9) / 0.1)));
  return 1.15 * Math.sqrt(160 / (160 + Math.max(0, r))) * envelope;
};

export interface RippleMotion {
  /** 0 合上 → 1 铺满 */
  p: number;
  from: number;
  to: number;
  startedAt: number;
  durationMs: number;
}

/**
 * 从当前进度出发朝目标走：中途再点会原路折返而不是重来（规矩 4：不跳帧）。
 * 走的距离越短，用时越短，但至少四分之一程的时长，免得折返时“啪”地一下。
 */
export const retarget = (motion: RippleMotion, open: boolean, now: number): RippleMotion => {
  const to = open ? 1 : 0;
  const base = open ? RIPPLE.openMs : RIPPLE.closeMs;
  return { p: motion.p, from: motion.p, to, startedAt: now, durationMs: base * Math.max(0.25, Math.abs(to - motion.p)) };
};

/** 推进一帧，返回新进度、本段的归一化时间 u 与是否走完 */
export const advance = (motion: RippleMotion, now: number) => {
  const u = clamp01((now - motion.startedAt) / motion.durationMs);
  const eased = motion.to > motion.from ? easeOpen(u) : easeClose(u);
  const p = motion.from + (motion.to - motion.from) * eased;
  return { p, u, done: u >= 1 };
};
