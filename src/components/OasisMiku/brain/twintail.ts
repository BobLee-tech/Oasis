// 🎀 拽马尾：温柔的跟手，越拉越吃力，松手后柔和地落回去。
//
//   马尾的 9 段旋转参数（Param_Angle_Rotation_{1..9}_D_HAIR_BACK_{00|10}，量程 ±45）是物理输出——物理
//   之前写会被 physics.evaluate 覆盖，所以结果交给 Live2DStage.setPostPhysics，叠加在物理算完之后。
//   _00 是她的右马尾（屏幕左），_10 是左马尾（屏幕右），出自 physics3.json 的 PhysicsDictionary。
//
//   手感上的三处取舍（第一版太夸张，整条马尾像被甩出去）：
//   · 软饱和：位移经 tanh 压缩——轻拉跟得紧，越往外越拉不动，最多只摆过量程的三分之一左右；
//   · 跟手有一点点延迟（临界阻尼 70ms）：像握着一缕头发，而不是把它钉在指尖上；
//   · 权重偏向中段与发梢：根部基本不动，是「被轻轻牵着」，不是整条甩过去；
//   · 松手回弹阻尼较高：柔和地落回去，只有一次很轻的过冲，不来回荡。
import { CriticalSpring, DampedSpring } from './spring';

export type TailSide = '00' | '10';

const SEGMENTS = 9;
// 根部小、中段到发梢大，总和 1
const WEIGHTS = [0.04, 0.07, 0.1, 0.12, 0.13, 0.14, 0.14, 0.13, 0.13];
// 软饱和后满拉（≈1）时，9 段合计转过的量 = REACH × 量程 ≈ 22°（第一版是 81°）
const REACH = 0.5;
// 屏幕右拉 → 马尾往屏幕右摆。实测（像素质心）：_00 九段各 +8 时左半区质心 0.363 → 0.397，−8 时 → 0.220，
// 即正值 = 往屏幕右摆；_10 −8 时右半区 0.740 → 0.662，方向一致。
export const HAIR_SIGN = 1;
/** 原始拉伸量（未饱和）超过它就「吃痛」——得是明显用力拽才会 */
export const PAIN_THRESHOLD = 1.9;

export const tailParamIds = (side: TailSide) =>
  Array.from({ length: SEGMENTS }, (_, i) => `Param_Angle_Rotation_${i + 1}_D_HAIR_BACK_${side}`);

export class TwintailPull {
  private side: TailSide | null = null;
  private follow = new CriticalSpring();
  private spring = new DampedSpring(1.6, 0.55);
  private holding = false;
  private raw = 0;

  start(side: TailSide) {
    this.side = side;
    this.holding = true;
    this.raw = 0;
    this.follow.reset();
    this.spring.reset();
  }

  /** raw：水平拉伸量，以「脸半径 × 2.5」为 1，右为正（未饱和） */
  drag(raw: number) {
    this.raw = raw;
  }

  release() {
    if (!this.holding) return;
    this.holding = false;
    // 从当前位置放手：保留位移与跟手速度，交给阻尼较高的弹簧柔和地落回去
    this.spring.x = this.follow.x;
    this.spring.v = this.follow.v * 0.5;
  }

  get stretch() {
    return this.holding ? Math.abs(this.raw) : 0;
  }

  /** 当前（含回落中的）偏移量，约 -1..1；供头部被轻轻带过去等联动使用 */
  get offset() {
    if (!this.side) return 0;
    return this.holding ? this.follow.x : this.spring.x;
  }

  update(dt: number, range: (id: string) => [number, number] | null): Record<string, number> {
    if (!this.side) return {};
    let value: number;
    if (this.holding) {
      value = this.follow.step(Math.tanh(this.raw * 0.85), 0.07, dt);
    } else {
      value = this.spring.step(dt);
      if (this.spring.settled) {
        this.side = null;
        return {};
      }
    }
    const out: Record<string, number> = {};
    tailParamIds(this.side).forEach((id, i) => {
      const r = range(id);
      const span = r ? Math.max(Math.abs(r[0]), Math.abs(r[1])) : 45;
      out[id] = value * HAIR_SIGN * WEIGHTS[i] * span * REACH;
    });
    return out;
  }
}
