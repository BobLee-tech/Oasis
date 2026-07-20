// 🎵 律动引擎：把「低频能量」变成「轻盈的摇摆」，而不是「逐帧抖动的摆幅」。
//
//   旧版直接拿 spectrum[0] 当摆幅、拿它当频率的一部分，两头都在抖：FFT 低频桶本身逐帧剧烈波动，
//   幅度抖 + 频率抖叠加，±4° 都会显得「用力、机械」。这里把「有多少能量」（包络）和「摆到哪」（振荡器
//   相位）彻底分开算：
//     - 包络：慢起（0.4s）更慢收（1.1s）的 AR 包络，摆幅只吃这个，不吃瞬时值；
//     - 相位：固定频率恒速推进（不随能量抖），只在检测到扎实的鼓点（低频通量突变，阈值调得较高，
//       滤掉真实 FFT 数据本身的逐帧噪声）时才轻轻推一下相位，把它软锁向节拍——是「推」不是「切」，
//       而且触发得足够少，多数时候头部只是那条恒频正弦在自己温柔地摆，不会被频繁的小纠正切碎；
//     - 强拍再叠一个软弹簧冲量（accent）：平时几乎看不出在摆，只有真正的重音才轻轻点一下头，
//       弹簧本身也调软了——是缓缓沉下去又浮起来，不是一冲一弹的抽搐；
//     - 头身相位差（follow-through）：身体比头部滞后 ~180ms、且摆幅减半，动作从「刚体同步」
//       变成「有先后」的链式运动，这是迪士尼十二法则里 overlapping action 的最小实现。
//   本体摆幅刻意压到很小（miku 档 2°），力度交给双马尾的 physics3.json 去放大——轻盈感来自
//   「小本体 + 大末端」，不是把本体摆幅调大；温柔感来自「慢」，不是单纯「更小」。

export interface RhythmProfile {
  /** 本体（头/身）摆幅上限，度 */
  amp: number;
  /** 没检测到稳定节拍时的默认摆动频率，Hz */
  freqDefault: number;
  /** 强拍冲量的增益：越大，卡到点上那一下头越明显 */
  accentGain: number;
}

// miku 档：自己的电子曲，活泼一点；ballad 档：Yorushika/Atarayo 等慢歌，更接近「安静聆听」的姿态。
// 幅度和频率都比第一版又收了一截——温柔感来自「慢」，不是「小」，动得快的小摆动反而更显机械
export const RHYTHM_PROFILES = {
  miku: { amp: 2, freqDefault: 0.4, accentGain: 0.8 },
  ballad: { amp: 1.2, freqDefault: 0.26, accentGain: 0.28 },
} as const satisfies Record<string, RhythmProfile>;

export interface RhythmFrame {
  /** → addParam ParamAngleZ */
  headZ: number;
  /** → addParam ParamBodyAngleZ */
  bodyZ: number;
  /** → addParam ParamAngleX，半频叠加，让摆动轨迹从直线变成弧线（迪士尼 arcs 原则） */
  headX: number;
  /** → addParam ParamAngleY，强拍上的点头冲量 */
  nod: number;
  /** 平滑后的能量包络，0..1，供口型/手臂律动等下游复用，避免重复实现一遍包络平滑 */
  energy: number;
}

// 第一版这四个阈值太敏感——真实 FFT 数据逐帧本就有噪声，稍微一抖就判定成「鼓点」，
// 于是相位天天被小幅度纠正、点头冲量天天被触发，叠加起来就是「一直在被打断」的僵硬感。
// 现在只认真正扎实的重音：阈值抬高、同一拍最小间隔拉长，日常大部分帧里 onset 根本不触发，
// 头部动作因此绝大多数时间只是那条恒频正弦在温柔摆，而不是被无数次小纠正切成一段一段
const ONSET_FLUX_THRESHOLD = 0.22;
const ONSET_ACCENT_THRESHOLD = 0.34;
const ONSET_MIN_GAP_MS = 420; // 同一拍不会被连续触发两次 onset
const MAX_INTERVALS = 8;
const PHASE_LOCK_STRENGTH = 0.05; // 纠正力度也调轻——是「察觉到了节拍」，不是「被拽过去对齐」
const NOD_SPRING_K = 14; // 弹簧调软：一次点头是缓缓沉下去又浮起来，不是一冲一弹的抽搐
const NOD_SPRING_C = 7.5; // 临界阻尼（ζ≈1），不回弹，~1s 内静静归零

const median = (arr: number[]): number => {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export class RhythmEngine {
  private env = 0;
  private prevBass = 0;
  private phase = 0;
  private lastOnsetAt = 0;
  private intervals: number[] = [];
  private nodPos = 0;
  private nodVel = 0;

  update(dtSec: number, bass: number, profile: RhythmProfile): RhythmFrame {
    // ① AR 包络：起也不再快——0.4s 起、1.1s 收，幅度是「缓缓浮上来」而不是「一下子弹出来」，
    // 摆幅只吃这条平滑曲线，逐帧的 FFT 抖动到这一步就已经被滤掉了
    const tau = bass > this.env ? 0.4 : 1.1;
    this.env += (bass - this.env) * (1 - Math.exp(-dtSec / tau));

    // ② onset 检测：低频通量突变即鼓点/重音；命中后软锁相 + 视情况叠一次点头冲量
    const flux = bass - this.prevBass;
    this.prevBass = bass;
    const now = performance.now();
    if (flux > ONSET_FLUX_THRESHOLD && now - this.lastOnsetAt > ONSET_MIN_GAP_MS) {
      const interval = now - this.lastOnsetAt;
      this.lastOnsetAt = now;
      if (interval < 1500) {
        this.intervals.push(interval);
        if (this.intervals.length > MAX_INTERVALS) this.intervals.shift();
      }
      // 把相位误差往最近的半周期边界（摆动端点）推一小步，而不是硬切过去
      const err = ((this.phase + Math.PI / 2) % Math.PI) - Math.PI / 2;
      this.phase -= err * PHASE_LOCK_STRENGTH;
      if (flux > ONSET_ACCENT_THRESHOLD) this.nodVel -= flux * profile.accentGain;
    }

    // ③ 频率恒定推进：有稳定 BPM 估计（60~190 区间内可信）就用它，否则退回档位默认频率——
    // 无论哪种，频率本身都不随瞬时能量抖动
    const bpm = this.intervals.length ? 60000 / median(this.intervals) : 0;
    const freq = bpm >= 60 && bpm <= 190 ? bpm / 60 / 4 : profile.freqDefault;
    this.phase += dtSec * freq * Math.PI * 2;
    if (this.phase > 10000) this.phase %= Math.PI * 2; // 长会话防止相位无界增长，纯卫生性质

    // ④ 强拍点头：临界阻尼弹簧积分，冲量之后自己平滑归零，不会停在半空
    this.nodVel += (-NOD_SPRING_K * this.nodPos - NOD_SPRING_C * this.nodVel) * dtSec;
    this.nodPos += this.nodVel * dtSec;

    const amp = profile.amp * this.env;
    const bodyLag = Math.PI * 2 * freq * 0.18; // 身体滞后头部 180ms，比第一版再拖一点，更松弛
    return {
      headZ: Math.sin(this.phase) * amp,
      bodyZ: Math.sin(this.phase - bodyLag) * amp * 0.5,
      // 这一层弧线本是为了让轨迹不是直线，但幅度太大会跟主摆动打架、显得晃得很杂——调轻到只是
      // 隐约的弧度感，多数时候几乎感觉不到它单独存在，只在回看轨迹时才「哦原来不是直线」
      headX: Math.sin(this.phase * 0.5 + Math.PI / 3) * amp * 0.18,
      nod: this.nodPos * 1.8,
      energy: this.env,
    };
  }
}

export const profileForCategory = (category: string | undefined): RhythmProfile =>
  category === 'Miku' ? RHYTHM_PROFILES.miku : RHYTHM_PROFILES.ballad;
