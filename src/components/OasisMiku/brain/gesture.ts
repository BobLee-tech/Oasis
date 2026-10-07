// ✋ 手势状态机：按下后 ~90ms 内判定这是哪一种触碰，并在「过程中」持续给出读数，
//   而不是像以前那样等松手才知道发生了什么。纯逻辑、无 DOM，方便单测。
//
//   关键区分：抚摸看「路程」（手走过多少），划过看「位移 + 平均速度」（往一个方向又远又快）。
//   第一版用瞬时速度 > 0.6px/ms 判「甩」，结果鼠标摸头稍快一点就被当成划过的候选；而桌面端的头只有
//   ~31px 宽，来回摸时离起点永远不到 28px，于是一直卡在 pending——过程中毫无反应。
//
//   down ─▶ pending（冲量已经在按下那一帧发出去了）
//     ├ 位移 > SWIPE_PX 且 位移/耗时 > SWIPE_SPEED ─▶ swipe（头部阈值更高，宁可当抚摸）
//     ├ 已过 90ms 且路程 > 6px · 马尾 ─────────────▶ pull（拽）
//     ├ 已过 90ms 且路程 > 6px · 其他部位 ──────────▶ stroke（抚摸）
//     ├ 不动且 ≥ 260ms ──────────────────────────────▶ hold（长按；之后再动会转成 stroke/pull）
//     └ 松手时仍 pending ────────────────────────────▶ tap（或已满 260ms 的 hold）

export type TouchZone = 'head' | 'twintail' | 'body' | 'hem';
export type GestureKind = 'pending' | 'tap' | 'hold' | 'stroke' | 'pull' | 'swipe';

export const MOVE_PX = 6;
export const DECIDE_MS = 90;
export const HOLD_MS = 260;
// 抚摸开始后的这段时间内，若变成又远又快的直线，仍可改判为划过
const SWIPE_WINDOW_MS = 320;
const SWIPE_PX: Record<TouchZone, number> = { head: 48, twintail: 40, body: 32, hem: 32 };
const SWIPE_SPEED: Record<TouchZone, number> = { head: 0.5, twintail: 0.45, body: 0.35, hem: 0.35 };
const SPEED_WINDOW_MS = 80;

export interface GestureState {
  kind: GestureKind;
  zone: TouchZone;
  startX: number;
  startY: number;
  startT: number;
  x: number;
  y: number;
  /** 本次 move 相对上一次的位移 */
  stepX: number;
  stepY: number;
  /** 自按下以来手指走过的路程（抚摸的「量」按它算，来回摸才算摸） */
  path: number;
  /** 最近 80ms 的速度，px/ms */
  speed: number;
  /** 方向：up = 向上划，供 Flick 动作选片段 */
  upward: boolean;
}

const isSwipe = (s: GestureState, t: number) => {
  const dist = Math.hypot(s.x - s.startX, s.y - s.startY);
  const elapsed = Math.max(1, t - s.startT);
  return dist > SWIPE_PX[s.zone] && dist / elapsed > SWIPE_SPEED[s.zone];
};

export class GestureTracker {
  private s: GestureState | null = null;
  private samples: { x: number; y: number; t: number }[] = [];

  get state(): Readonly<GestureState> | null {
    return this.s;
  }

  down(x: number, y: number, t: number, zone: TouchZone): GestureState {
    this.s = {
      kind: 'pending', zone, startX: x, startY: y, startT: t, x, y,
      stepX: 0, stepY: 0, path: 0, speed: 0, upward: false,
    };
    this.samples = [{ x, y, t }];
    return this.s;
  }

  private moving(s: GestureState): GestureKind {
    return s.zone === 'twintail' ? 'pull' : 'stroke';
  }

  move(x: number, y: number, t: number): GestureState | null {
    const s = this.s;
    if (!s) return null;
    s.stepX = x - s.x;
    s.stepY = y - s.y;
    s.path += Math.hypot(s.stepX, s.stepY);
    s.x = x;
    s.y = y;
    this.samples.push({ x, y, t });
    while (this.samples.length > 2 && t - this.samples[0].t > SPEED_WINDOW_MS) this.samples.shift();
    const first = this.samples[0];
    s.speed = Math.hypot(x - first.x, y - first.y) / Math.max(1, t - first.t);
    s.upward = y < s.startY;

    const elapsed = t - s.startT;
    if ((s.kind === 'pending' || s.kind === 'stroke' || s.kind === 'pull') && elapsed < SWIPE_WINDOW_MS && isSwipe(s, t)) {
      s.kind = 'swipe';
    } else if (s.kind === 'pending' && elapsed >= DECIDE_MS && s.path > MOVE_PX) {
      s.kind = this.moving(s);
    } else if (s.kind === 'hold' && Math.hypot(x - s.startX, y - s.startY) > MOVE_PX) {
      s.kind = this.moving(s);
    }
    return s;
  }

  /** 每帧调用：不动也能按时间推进（已经在动的转抚摸，没动的转长按）。 */
  tick(t: number): GestureState | null {
    const s = this.s;
    if (!s || s.kind !== 'pending') return s;
    const elapsed = t - s.startT;
    if (elapsed >= DECIDE_MS && s.path > MOVE_PX) s.kind = this.moving(s);
    else if (elapsed >= HOLD_MS) s.kind = 'hold';
    return s;
  }

  up(x: number, y: number, t: number): GestureState | null {
    const s = this.s;
    if (!s) return null;
    this.move(x, y, t);
    if (s.kind === 'pending') {
      if (isSwipe(s, t)) s.kind = 'swipe';
      else s.kind = t - s.startT >= HOLD_MS ? 'hold' : 'tap';
    }
    this.s = null;
    this.samples = [];
    return s;
  }

  cancel() {
    this.s = null;
    this.samples = [];
  }
}
