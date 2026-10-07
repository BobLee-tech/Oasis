// 💥 冲量层：pointerdown 当帧的反应，以及搬运时的惯性。
//
//   以前点她，要等松手后的 Tap 动作片段才有反应，前 100–300ms 她毫无知觉。现在按下那一帧就给，
//   而且按部位给不同的反应——同样是「被碰到」，摸头、拽辫子、戳肚子在真人身上是三种完全不同的身体语言：
//     · pat（头）    ：不躲，轻轻低头迎上手掌，眼睛舒服地眯起，眉毛放松；
//     · tug（马尾）  ：头被辫子带着往那一侧轻轻偏一点，没有惊吓；
//     · flinch（身体）：往远离触点的方向小小一缩，眯眼、挑眉；裙摆处挑眉更明显（有点慌）。
//   幅度都刻意收着：程序化层是「表演的余韵」，不是表演本身——过大就成了弹簧玩偶。
//   同一处连续碰，反应按 0.8^n 递减（习惯化），5s 不碰恢复。
import { CriticalSpring, DampedSpring } from './spring';
import type { PoseParam } from '../Live2DStage';
import type { TouchZone } from './gesture';

const FREQ_HZ = 2.8;
const ZETA = 0.6; // 偏高的阻尼：只留一次很轻的回摆，不来回晃
const HABITUATION = 0.8;
const HABITUATION_WINDOW_MS = 5000;
// AngleZ 的正方向在屏幕上是「头顶往哪边歪」，由模型决定；调用方统一按「正 = 头顶往屏幕右」写，乘上它。
// 实测（像素质心）：AngleZ +30 时头顶区域质心从 0.599 右移到 0.617（画布宽度归一），即本模型正 = 往右。
export const TILT_SIGN = 1;

// 眯眼/挑眉包络（秒）：收紧 → 停留 → 慢慢放开（摸头时停得更久，是「舒服」而不是「吓一跳」）
const envelope = (t: number, attack: number, hold: number, release: number): number => {
  if (t < 0) return 0;
  if (t < attack) return t / attack;
  if (t < attack + hold) return 1;
  const r = (t - attack - hold) / release;
  return r >= 1 ? 0 : 1 - r * r * (3 - 2 * r);
};

interface Style {
  squint: number; // 眯眼深度 0..1
  brow: number; // 眉毛位移（负 = 放松下沉）
  attack: number;
  hold: number;
  release: number;
}

const STYLES: Record<TouchZone, Style> = {
  head: { squint: 0.5, brow: -0.12, attack: 0.12, hold: 0.25, release: 0.5 },
  twintail: { squint: 0.2, brow: 0.12, attack: 0.08, hold: 0.08, release: 0.3 },
  body: { squint: 0.3, brow: 0.22, attack: 0.05, hold: 0.06, release: 0.22 },
  hem: { squint: 0.25, brow: 0.38, attack: 0.05, hold: 0.1, release: 0.3 },
};

export interface ImpulseOutput {
  pose: Partial<Record<PoseParam, number>>;
  /** 乘到眨眼值上：1 = 不影响，0.5 = 眯到一半 */
  eyeOpen: number;
  /** 加到眉毛高度上 */
  browLift: number;
}

export class ImpulseLayer {
  private angleX = new DampedSpring(FREQ_HZ, ZETA);
  private angleY = new DampedSpring(FREQ_HZ, ZETA);
  private tilt = new DampedSpring(FREQ_HZ, ZETA);
  private body = new DampedSpring(FREQ_HZ * 0.7, ZETA);
  private lean = new CriticalSpring();
  private leanTarget = 0;
  private envT = Infinity;
  private envGain = 0;
  private style: Style = STYLES.body;
  private hits: number[] = [];

  /**
   * 被碰一下。dir 是触点相对脸中心的方向（x 向右、y 向上，单位约为「脸半径」）。
   * 返回本次实际强度（已含习惯化）。
   */
  touch(zone: TouchZone, dir: { x: number; y: number }, now: number, strength = 1): number {
    this.hits = this.hits.filter((t) => now - t < HABITUATION_WINDOW_MS);
    const gain = strength * Math.pow(HABITUATION, this.hits.length);
    this.hits.push(now);
    const dx = Math.max(-1.5, Math.min(1.5, dir.x));
    const dy = Math.max(-1.5, Math.min(1.5, dir.y));
    if (zone === 'head') {
      // 迎上手掌：低头一点，往手的那一侧略偏
      this.angleY.kickTo(-3 * gain);
      this.tilt.kickTo(dx * 1.5 * gain * TILT_SIGN);
    } else if (zone === 'twintail') {
      // 辫子被握住：头往那一侧轻轻带过去
      this.tilt.kickTo(Math.sign(dx) * 2 * gain * TILT_SIGN);
      this.angleX.kickTo(Math.sign(dx) * 1.2 * gain);
    } else {
      // 往远离触点的方向小小一缩
      this.angleX.kickTo(-dx * 4 * gain);
      this.angleY.kickTo(-(0.3 + Math.max(0, dy)) * 2.5 * gain);
      this.tilt.kickTo(-dx * 3 * gain * TILT_SIGN);
      this.body.kickTo(-dx * 1.8 * gain * TILT_SIGN);
    }
    this.style = STYLES[zone];
    this.envT = 0;
    this.envGain = Math.min(1, 0.5 + 0.5 * gain);
    return gain;
  }

  /** 小幅点头/抬头（peak > 0 = 抬头）。用于被注意到、落地、强拍。 */
  nod(peakDeg: number) {
    this.angleY.kickTo(peakDeg);
  }

  /** 搬运中：按水平速度（px/s）让身体反向倾斜，像被拎着走时的惯性。 */
  carry(vx: number) {
    this.leanTarget = Math.max(-5, Math.min(5, -vx * 0.006)) * TILT_SIGN;
  }

  /** 放下：倾斜回正时带一点回冲，再轻轻点一下头。 */
  land() {
    this.body.push(-this.lean.x * 5);
    this.leanTarget = 0;
    this.nod(-1.2);
  }

  update(dt: number): ImpulseOutput {
    const ax = this.angleX.step(dt);
    const ay = this.angleY.step(dt);
    const tz = this.tilt.step(dt);
    const bz = this.body.step(dt);
    const lean = this.lean.step(this.leanTarget, 0.18, dt);
    this.envT += dt;
    const { squint, brow, attack, hold, release } = this.style;
    const env = envelope(this.envT, attack, hold, release) * this.envGain;
    return {
      pose: {
        ParamAngleX: ax,
        ParamAngleY: ay,
        ParamAngleZ: tz,
        ParamBodyAngleZ: bz + lean,
      },
      eyeOpen: 1 - squint * env,
      browLift: brow * env,
    };
  }
}
