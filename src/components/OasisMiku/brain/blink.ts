// 👁 眨眼间隔用对数正态分布：中位数 3.4s、保留长尾，并以 12% 概率连眨两次。
// 完美周期是人物显得机械的主要信号；快闭慢开则保留真人眼睑的速度不对称。
const CLOSING_S = 0.09;
const CLOSED_S = 0.045;
const OPENING_S = 0.16;
const MEDIAN_S = 3.4;
const SIGMA = 0.55;
const DOUBLE_BLINK_P = 0.12;

export class BlinkEngine {
  private wait = 1.2;
  private phase: 'idle' | 'closing' | 'closed' | 'opening' = 'idle';
  private t = 0;
  private queued = 0;

  private nextWait(): number {
    const u = Math.max(1e-6, Math.random());
    const v = Math.random();
    const gaussian = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return MEDIAN_S * Math.exp(gaussian * SIGMA);
  }

  /** 立刻眨一次（大幅转移视线时人常顺带眨眼）；正在眨就不打断。 */
  trigger() {
    if (this.phase !== 'idle') return;
    this.wait = 0;
  }

  update(dtSec: number): number {
    this.t += dtSec;
    switch (this.phase) {
      case 'idle':
        if (this.t >= this.wait) {
          this.phase = 'closing';
          this.t = 0;
          if (this.queued === 0 && Math.random() < DOUBLE_BLINK_P) this.queued = 1;
        }
        return 1;
      case 'closing':
        if (this.t >= CLOSING_S) { this.phase = 'closed'; this.t = 0; return 0; }
        return 1 - this.t / CLOSING_S;
      case 'closed':
        if (this.t >= CLOSED_S) { this.phase = 'opening'; this.t = 0; }
        return 0;
      case 'opening':
        if (this.t >= OPENING_S) {
          this.phase = 'idle';
          this.t = 0;
          if (this.queued > 0) { this.queued -= 1; this.wait = 0.14; }
          else this.wait = this.nextWait();
          return 1;
        }
        return this.t / OPENING_S;
    }
  }
}
