// 🫂 陪伴（docs/song-emotion-design.md §3.5 / §3.8）：她跟着歌走多少（共鸣系数 r），以及本次会话你在往哪边听（听歌倾向）。
//
//   r = 0.65                                          ——缺省，同 P2 的 MUSIC_RESONANCE
//   站主、深夜，本会话连续 ≥3 首低落的歌听完          ：r → 0.35，情绪色调的温柔抬到 ≥ 0.5（陪着，而不是一起沉下去）
//   站主跳过一首低落的歌                              ：本会话 r −0.1（他不想沉下去），最低 0.35
//   访客                                              ：r 固定 0.65
//
//   「低落」= 哀伤或不甘 ≥ 2。站主在工坊里标过「它让我怎样」（felt）的歌按 felt 算——悲伤的歌常让人平静（Gabrielsson），
//   他说这首听了会安静下来，那它就不算把他往下拽。
//
//   听歌倾向 L = EMA(本首 feels / 3 × 听完比例)，跳过的歌按 −0.5 计入；L 最大的一维 ≥ 0.5 才算有倾向。
//   只给共鸣系数与少量 care 规则用，**不念出来**；随会话结束存进本机记忆（session-end），30 分钟内回来接着算，不上云。
//
//   纯逻辑、无 DOM；只为站主记（访客的 SessionListening 永远是空的）。
import { FEELS, type Feel, type Feels } from '../../../lib/trackMood';

export const RESONANCE_DEFAULT = 0.65;
export const RESONANCE_COMFORT = 0.35;
export const SKIP_PENALTY = 0.1;
/** 连续听完这么多首低落的歌（深夜），她就从「跟着」换成「陪着」 */
export const COMFORT_STREAK = 3;
/** 陪着时情绪色调里温柔的下限 */
export const COMFORT_TENDER = 0.5;
/** 听到这个比例算「听完」 */
export const FINISHED_RATIO = 0.8;
export const LEAN_ALPHA = 0.4;
export const LEAN_MIN = 0.5;
const SKIP_WEIGHT = -0.5;

/** 一首歌这次听了多少。feels 只收写出来的（人标或专辑）；felt 是站主标的「它让我怎样」。 */
export interface TrackPass {
  feels?: Feels;
  felt?: Feels;
  /** 0..1：在播放态下累计的时长 ÷ 曲长 */
  ratio: number;
  /** 不足 30s 就切走了 */
  skipped: boolean;
}

export const isLow = (feels: Feels | undefined) => (feels?.sad ?? 0) >= 2 || (feels?.defiant ?? 0) >= 2;

export interface ListeningState {
  lean: Partial<Record<Feel, number>>;
  lowStreak: number;
  skipPenalty: number;
}

export class SessionListening {
  lean: Record<Feel, number> = Object.fromEntries(FEELS.map(feel => [feel, 0])) as Record<Feel, number>;
  /** 连续听完的低落歌 */
  lowStreak = 0;
  /** 本会话因为跳过低落的歌累计扣掉的 r */
  skipPenalty = 0;

  record(pass: TrackPass) {
    // 他自己说过这首让他怎样，就按他说的算；否则按歌表达的
    const feels = pass.felt ?? pass.feels;
    const low = isLow(feels);
    const finished = !pass.skipped && pass.ratio >= FINISHED_RATIO;
    if (pass.skipped && low) this.skipPenalty = Math.min(RESONANCE_DEFAULT - RESONANCE_COMFORT, this.skipPenalty + SKIP_PENALTY);
    this.lowStreak = finished && low ? this.lowStreak + 1 : finished || pass.skipped ? 0 : this.lowStreak;
    // 没写情绪的歌不进倾向：VA 猜的那一维不代表他在听什么
    if (!feels) return;
    const weight = pass.skipped ? SKIP_WEIGHT : Math.max(0, Math.min(1, pass.ratio));
    for (const feel of FEELS) {
      const x = ((feels[feel] ?? 0) / 3) * weight;
      this.lean[feel] += (x - this.lean[feel]) * LEAN_ALPHA;
    }
  }

  /** 本会话的听歌倾向：最大的一维 ≥ 0.5 才给 */
  get sessionLean(): Feel | undefined {
    let best: Feel | undefined;
    for (const feel of FEELS) if (this.lean[feel] >= LEAN_MIN && (!best || this.lean[feel] > this.lean[best])) best = feel;
    return best;
  }

  resonance(ctx: { owner: boolean; lateNight: boolean }): Resonance {
    if (!ctx.owner) return { r: RESONANCE_DEFAULT, comfort: false };
    const comfort = ctx.lateNight && this.lowStreak >= COMFORT_STREAK;
    const r = comfort ? RESONANCE_COMFORT : Math.max(RESONANCE_COMFORT, RESONANCE_DEFAULT - this.skipPenalty);
    return { r, comfort };
  }

  snapshot(): ListeningState {
    const lean: ListeningState['lean'] = {};
    for (const feel of FEELS) if (Math.abs(this.lean[feel]) >= 0.01) lean[feel] = Math.round(this.lean[feel] * 100) / 100;
    return { lean, lowStreak: this.lowStreak, skipPenalty: Math.round(this.skipPenalty * 100) / 100 };
  }

  restore(state: Partial<ListeningState> | null | undefined) {
    if (!state) return;
    for (const feel of FEELS) {
      const value = state.lean?.[feel];
      this.lean[feel] = typeof value === 'number' && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    }
    this.lowStreak = Number.isInteger(state.lowStreak) && state.lowStreak! > 0 ? state.lowStreak! : 0;
    this.skipPenalty = typeof state.skipPenalty === 'number' ? Math.max(0, Math.min(RESONANCE_DEFAULT - RESONANCE_COMFORT, state.skipPenalty)) : 0;
  }

  reset() {
    this.restore({});
  }
}

export interface Resonance {
  /** 0..1：心境与情绪色调的目标里，歌占多少 */
  r: number;
  /** 陪着：温柔抬到 ≥ COMFORT_TENDER */
  comfort: boolean;
}
