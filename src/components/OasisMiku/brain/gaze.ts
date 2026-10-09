// 👀 视线：眼先到、头跟上、身体最慢，外加注视时的微扫视。
//
//   库自带的 updateFocus 把同一个 focus 值同时乘给眼球（×1）、头（×30）、身体（×10），三者同一条曲线
//   同时到位，像转台。真人是三级跟随：眼睛 ~40ms 就跳到目标，头 ~200ms 才转过去、并把眼球「接回」
//   中间，身体最后跟。这里用三根半衰期不同的临界阻尼弹簧复现它。
//
//   微扫视（microsaccade）：注视时眼球每隔 0.5–2.5s 会小跳一下。静止不动的眼睛看起来是「死」的——
//   这是 Lee, Badler & Badler《Eyes Alive》(SIGGRAPH 2002) 的核心结论。间隔随唤醒度缩短，阅读时拉长。
import { CriticalSpring } from './spring';
import type { PoseParam } from '../Live2DStage';

const EYE_HALF_LIFE = 0.04;
const HEAD_HALF_LIFE = 0.2;
const BODY_HALF_LIFE = 0.5;
// 自主张望（没人理她时随便看看）是「慢悠悠地转过去」，不是被指针牵着走：三级弹簧整体放慢
const LAZY_FACTOR = 2.4;
// 头与身体的转动幅度（度/满偏）。库原版是 30/10——头转得太满，眼睛几乎不用动，看起来像转台；
// 收到 22/7，剩下的偏转由眼球承担，真人看东西本来就是「眼睛先、头只转一部分」
export const HEAD_DEG = 22;
export const BODY_DEG = 7;
// 眼领先量：头还没转过来时，眼球额外多转一点去「够」目标；头到位后自然回到 1:1
const EYE_LEAD = 0.6;
const BIG_SHIFT = 0.4;
const BLINK_ON_SHIFT_P = 0.4;

export interface GazeInput {
  /** 目标方向，[-1,1]²；x 向右为正，y 向上为正。 */
  target: { x: number; y: number };
  /** 0..1，越高微扫视越频繁 */
  arousal: number;
  /** 阅读/专注时微扫视间隔拉长 */
  calm?: boolean;
  /** 自主张望：三级弹簧整体放慢 */
  lazy?: boolean;
  /** 微扫视间隔缩放：>1 更稀（空灵），<1 更密（不安）；缺省 1 */
  saccadeScale?: number;
}

export class GazeController {
  private eyeX = new CriticalSpring();
  private eyeY = new CriticalSpring();
  private headX = new CriticalSpring();
  private headY = new CriticalSpring();
  private bodyX = new CriticalSpring();
  private saccade = { x: 0, y: 0 };
  private saccadeTimer = 1;
  private lastTarget = { x: 0, y: 0 };
  /** 大幅转移视线时回调（供眨眼引擎顺带眨一下） */
  onBigShift: (() => void) | null = null;

  update(dt: number, input: GazeInput): Partial<Record<PoseParam, number>> {
    const { target, arousal } = input;
    const tx = clamp(target.x);
    const ty = clamp(target.y);

    const shift = Math.hypot(tx - this.lastTarget.x, ty - this.lastTarget.y);
    if (shift > BIG_SHIFT && Math.random() < BLINK_ON_SHIFT_P) this.onBigShift?.();
    // 目标大跳时清掉旧的微扫视偏移，新注视点重新开始
    if (shift > 0.15) { this.saccade.x = 0; this.saccade.y = 0; }
    this.lastTarget = { x: tx, y: ty };

    this.saccadeTimer -= dt;
    if (this.saccadeTimer <= 0) {
      const base = (input.calm ? 3.2 : 2.5 - 1.6 * clamp01(arousal)) * (input.saccadeScale ?? 1);
      this.saccadeTimer = base * (0.35 + Math.random() * 0.9);
      const amp = 0.03 + Math.random() * 0.05;
      const angle = Math.random() * Math.PI * 2;
      this.saccade = { x: Math.cos(angle) * amp, y: Math.sin(angle) * amp * 0.6 };
    }

    const k = input.lazy ? LAZY_FACTOR : 1;
    const ex = this.eyeX.step(tx + this.saccade.x, EYE_HALF_LIFE * k, dt);
    const ey = this.eyeY.step(ty + this.saccade.y, EYE_HALF_LIFE * k, dt);
    const hx = this.headX.step(tx, HEAD_HALF_LIFE * k, dt);
    const hy = this.headY.step(ty, HEAD_HALF_LIFE * k, dt);
    const bx = this.bodyX.step(tx, BODY_HALF_LIFE * k, dt);

    // AngleZ 沿用库的 x·y 耦合（看右上方时头会顺势微歪），三者各走各的弹簧
    return {
      ParamEyeBallX: clamp(ex + (ex - hx) * EYE_LEAD),
      ParamEyeBallY: clamp(ey + (ey - hy) * EYE_LEAD),
      ParamAngleX: hx * HEAD_DEG,
      ParamAngleY: hy * HEAD_DEG,
      ParamAngleZ: hx * hy * -HEAD_DEG,
      ParamBodyAngleX: bx * BODY_DEG,
    };
  }
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 屏幕坐标 → 以脸为中心的视线方向。距离越远越接近满偏，贴着脸时只是轻轻一瞥，
 *  而不是库原版那样「只取方向、幅度恒为 1」——指针在她鼻尖旁边晃，她也会把头转到底。 */
export const gazeFromPoint = (
  point: { x: number; y: number },
  head: { x: number; y: number; r: number },
): { x: number; y: number } => {
  const dx = point.x - head.x;
  const dy = head.y - point.y; // 屏幕 y 向下，视线 y 向上
  const d = Math.hypot(dx, dy);
  if (d < 1e-3) return { x: 0, y: 0 };
  const reach = head.r * 3.5;
  const magnitude = d / (d + reach);
  return { x: (dx / d) * magnitude * 1.6, y: (dy / d) * magnitude * 1.6 };
};
