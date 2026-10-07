// 🌀 两种弹簧，Miku 所有程序化动作的共同底座。
//
//   CriticalSpring —— 临界阻尼，按「半衰期」参数化：经过 halfLife 秒，离目标的距离缩一半。
//     用解析解积分（不是欧拉步进），所以 30fps 的触屏和 120fps 的高刷屏走出完全相同的曲线，
//     dt 抖动也不会让它发散。视线「眼 40ms / 头 200ms / 身体 500ms」三级跟随就是三根它。
//
//   DampedSpring —— 欠阻尼，按「频率 + 阻尼比 ζ」参数化，用来做被戳时的冲量与余晃（follow-through）。
//     同样用解析解：x(t) = e^(−ζωt)·[x0·cos(ωd·t) + (v0 + ζω·x0)/ωd · sin(ωd·t)]。
//     （试过 1/120s 子步的半隐式欧拉，ζω·h≈0.08 时数值阻尼会把峰值吃掉 14%，戳下去软绵绵的。）

const LN2_X4 = 4 * Math.LN2;

export class CriticalSpring {
  x: number;
  v = 0;

  constructor(initial = 0) {
    this.x = initial;
  }

  /** 朝 goal 推进 dt 秒；halfLife 越小越跟手。返回新位置。 */
  step(goal: number, halfLife: number, dt: number): number {
    // 临界阻尼的精确解：x(t) = g + (j0 + j1·t)·e^(−y·t)，y = 2·ln2 / halfLife
    const y = LN2_X4 / (halfLife + 1e-5) / 2;
    const j0 = this.x - goal;
    const j1 = this.v + j0 * y;
    const e = Math.exp(-y * dt);
    this.x = e * (j0 + j1 * dt) + goal;
    this.v = e * (this.v - j1 * y * dt);
    return this.x;
  }

  reset(value = 0) {
    this.x = value;
    this.v = 0;
  }
}

export class DampedSpring {
  x = 0;
  v = 0;
  private readonly omega: number;
  private readonly zeta: number;
  private readonly omegaD: number;
  /** 从静止处给速度 v0 时，第一个峰值约为 v0 · peakGain。kickTo 用它把「想要的峰值」换算成初速度。 */
  private readonly peakGain: number;

  constructor(frequencyHz: number, zeta: number) {
    this.omega = 2 * Math.PI * frequencyHz;
    this.zeta = Math.min(0.999, zeta);
    this.omegaD = this.omega * Math.sqrt(1 - this.zeta * this.zeta);
    const tPeak = Math.atan2(this.omegaD, this.zeta * this.omega) / this.omegaD;
    this.peakGain = Math.exp(-this.zeta * this.omega * tPeak) * Math.sin(this.omegaD * tPeak) / this.omegaD;
  }

  /** 叠加一次冲量，使（从静止开始的）第一个峰值约为 peak。连续踢会自然叠加。 */
  kickTo(peak: number) {
    this.v += peak / this.peakGain;
  }

  /** 直接给速度（拖拽惯性等已知速度的场合）。 */
  push(velocity: number) {
    this.v += velocity;
  }

  step(dt: number, goal = 0): number {
    const t = Math.min(dt, 0.1); // 切后台回来的超长帧截断：解析解本身不会发散，截断只是别让余晃一帧跳过
    const x0 = this.x - goal;
    const v0 = this.v;
    const zw = this.zeta * this.omega;
    const e = Math.exp(-zw * t);
    const c = Math.cos(this.omegaD * t);
    const s = Math.sin(this.omegaD * t);
    this.x = goal + e * (x0 * c + ((v0 + zw * x0) / this.omegaD) * s);
    this.v = e * (v0 * c - ((this.omega * this.omega * x0 + zw * v0) / this.omegaD) * s);
    return this.x;
  }

  get settled(): boolean {
    return Math.abs(this.x) < 1e-3 && Math.abs(this.v) < 1e-3;
  }

  reset() {
    this.x = 0;
    this.v = 0;
  }
}
