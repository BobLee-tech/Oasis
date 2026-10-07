// 💗 情感模型（docs/miku-design.md A3，ALMA 式三层）：
//
//   性格（常量）   —— 站主 / 访客两组增益：温暖度、活泼度、话量
//   心境（分钟）   —— VA 平面上的一个点 m：被「时间基线」和「正在放的歌」吸引，交互轻轻推它一下
//   情绪（秒）     —— {kind, intensity}：事件触发，按各自半衰期消退
//
//   四个出口（脸、视线、律动、粒子）都只读这里的输出，所以话、脸、身体是同一种情绪的不同出口。
//   纯逻辑、无 DOM；时间从外面传进来，单测可以用假时钟跑（affect.test.ts）。
import type { Feel } from '../../../lib/trackMood';

export type EmotionKind = 'shy' | 'happy' | 'surprised' | 'annoyed' | 'sleepy' | 'pained';

export interface Personality {
  /** 温暖度：正向冲量的放大系数，也抬高效价基线 */
  warmth: number;
  /** 活泼度：唤醒度的放大系数（律动摆幅、粒子发射率） */
  liveliness: number;
  /** 话量：闲聊间隔的倒数系数（P5 的台词引擎读） */
  talkativeness: number;
}

export const PERSONALITY: Record<'owner' | 'visitor', Personality> = {
  // 对站主：更暖、更放松；对访客：礼貌而克制，活泼但话少一点
  owner: { warmth: 1.2, liveliness: 1, talkativeness: 1 },
  visitor: { warmth: 0.9, liveliness: 1, talkativeness: 0.6 },
};

/** VA 点：v −1..1（低落 ↔ 明亮），a −1..1（困倦 ↔ 激活）。 */
export interface VA { v: number; a: number }

const MOOD_TAU_S = 40;
const EMOTION_HALF_LIFE_S: Record<EmotionKind, number> = {
  shy: 8, happy: 8, surprised: 6, annoyed: 7, sleepy: 10, pained: 6,
};

/** 昼夜基线：A 在凌晨 3 点最低（−0.5）、下午 3 点最高（+0.2）；V 基线 +0.1，站主在场再 +0.1。 */
export const timeTarget = (hour: number, owner: boolean): VA => {
  const mid = -0.15;
  const amp = 0.35;
  return {
    v: 0.1 + (owner ? 0.1 : 0),
    a: mid + amp * Math.cos((2 * Math.PI * (hour - 15)) / 24),
  };
};

export interface AffectInput {
  /** 本地时间（小时，可带小数） */
  hour: number;
  owner: boolean;
  /** 正在播放的歌的心境（arousal 0..1）；不在播放时为 null */
  music: { valence: number; arousal: number } | null;
  /** 实时能量 0..1（低频+中频包络），与曲目 arousal 按 0.3 混合 */
  liveEnergy: number;
}

export class Affect {
  m: VA;
  emotion: { kind: EmotionKind; intensity: number } | null = null;
  personality: Personality = PERSONALITY.visitor;

  constructor(initial: VA = { v: 0.1, a: -0.1 }) {
    this.m = { ...initial };
  }

  target(input: AffectInput): VA {
    const base = timeTarget(input.hour, input.owner);
    if (!input.music) return base;
    const a01 = input.music.arousal * 0.7 + input.liveEnergy * 0.3;
    const music = { v: input.music.valence, a: a01 * 2 - 1 };
    return { v: base.v + (music.v - base.v) * 0.65, a: base.a + (music.a - base.a) * 0.65 };
  }

  step(dt: number, input: AffectInput) {
    this.personality = PERSONALITY[input.owner ? 'owner' : 'visitor'];
    const t = this.target(input);
    const k = 1 - Math.exp(-dt / MOOD_TAU_S);
    this.m.v += (t.v - this.m.v) * k;
    this.m.a += (t.a - this.m.a) * k;
    if (this.emotion) {
      this.emotion.intensity *= Math.pow(0.5, dt / EMOTION_HALF_LIFE_S[this.emotion.kind]);
      if (this.emotion.intensity < 0.02) this.emotion = null;
    }
  }

  /** 交互冲量：推一下心境（正向效价按温暖度放大），然后照常被目标拉回。 */
  nudge(dv: number, da = 0) {
    const w = dv > 0 ? this.personality.warmth : 1;
    this.m.v = clamp(this.m.v + dv * w);
    this.m.a = clamp(this.m.a + da);
  }

  /** 触发情绪：同类叠加取较强者；不同类时新情绪只有足够强才能顶掉旧的（不让一次轻拍打断吃痛）。 */
  feel(kind: EmotionKind, intensity = 1) {
    const cur = this.emotion;
    if (!cur || cur.kind === kind) {
      this.emotion = { kind, intensity: Math.max(intensity, cur?.intensity ?? 0) };
    } else if (intensity >= cur.intensity * 0.6) {
      this.emotion = { kind, intensity };
    }
  }

  /** 唤醒度 0..1（给律动、粒子、微扫视），乘上性格的活泼度 */
  get arousal01() {
    return clamp01(((this.m.a + 1) / 2) * this.personality.liveliness);
  }
}

// ───────────────────────── 出口：脸 ─────────────────────────

export interface Face {
  eyeSmile: number; cheek: number; mouthForm: number;
  browY: number; browAngle: number; browForm: number;
  /** 眼睛开度的缩放（困倦时略垂） */
  eyeOpen: number;
}

// VA 四角预设：中间按双线性插值。四角刻意都不极端——心境是底色，不是表演
const CORNERS: Record<'pp' | 'pn' | 'np' | 'nn', Omit<Face, 'eyeOpen'>> = {
  pp: { eyeSmile: 0.45, cheek: 0.16, mouthForm: 0.5, browY: 0.25, browAngle: 0.15, browForm: 0.3 },   // 明亮 · 激活
  pn: { eyeSmile: 0.38, cheek: 0.12, mouthForm: 0.35, browY: 0.05, browAngle: 0, browForm: 0.1 },     // 明亮 · 安静
  np: { eyeSmile: 0, cheek: 0.04, mouthForm: -0.2, browY: -0.1, browAngle: -0.35, browForm: -0.25 },  // 低落 · 激活（紧绷）
  nn: { eyeSmile: 0.12, cheek: 0.03, mouthForm: -0.12, browY: -0.15, browAngle: 0.25, browForm: -0.15 }, // 低落 · 安静（八字眉）
};

// 情绪叠加的目标脸：按 intensity 从心境底色往这里拉
export const EMOTION_FACE: Record<EmotionKind, Omit<Face, 'eyeOpen'>> = {
  happy: { eyeSmile: 0.55, cheek: 0.2, mouthForm: 0.55, browY: 0.25, browAngle: 0.15, browForm: 0.3 },
  shy: { eyeSmile: 0.6, cheek: 0.65, mouthForm: 0.2, browY: 0.1, browAngle: -0.1, browForm: 0.1 },
  sleepy: { eyeSmile: 0.35, cheek: 0.1, mouthForm: -0.1, browY: -0.2, browAngle: 0, browForm: -0.1 },
  surprised: { eyeSmile: 0.1, cheek: 0.15, mouthForm: 0.35, browY: 0.55, browAngle: 0.3, browForm: 0.4 },
  annoyed: { eyeSmile: 0.05, cheek: 0.25, mouthForm: -0.3, browY: -0.3, browAngle: -0.4, browForm: -0.3 },
  pained: { eyeSmile: 0.3, cheek: 0.2, mouthForm: -0.4, browY: -0.1, browAngle: 0.45, browForm: -0.35 },
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const faceFor = (m: VA, emotion: Affect['emotion']): Face => {
  const s = (clamp(m.v) + 1) / 2; // 0 = 低落，1 = 明亮
  const t = (clamp(m.a) + 1) / 2; // 0 = 安静，1 = 激活
  const out = {} as Face;
  for (const key of Object.keys(CORNERS.pp) as (keyof typeof CORNERS.pp)[]) {
    const top = lerp(CORNERS.np[key], CORNERS.pp[key], s);
    const bottom = lerp(CORNERS.nn[key], CORNERS.pn[key], s);
    let value = lerp(bottom, top, t);
    if (emotion) value = lerp(value, EMOTION_FACE[emotion.kind][key], emotion.intensity);
    out[key] = value;
  }
  // 困倦：唤醒越低眼皮越沉（最多 −15%）；sleepy 情绪再沉一点
  const drowsy = Math.max(0, -m.a) * 0.15 + (emotion?.kind === 'sleepy' ? 0.12 * emotion.intensity : 0);
  out.eyeOpen = 1 - drowsy;
  return out;
};

// ───────────────────────── 出口：视线 ─────────────────────────

/** 低效价时视线基线略向下（最多 −0.15）。 */
export const gazeBiasY = (m: VA) => -0.15 * Math.max(0, -m.v);

// ───────────────────────── 出口：律动 ─────────────────────────

export interface RhythmStyle { amp: number; freqDefault: number; accentGain: number }

// 律动风格由 feel 决定：雀跃/奇妙点头明显，温柔/宁静慢而轻，哀伤/怀念几乎只是随着呼吸晃
export const RHYTHM_BY_FEEL: Record<Feel, RhythmStyle> = {
  joyful: { amp: 2, freqDefault: 0.4, accentGain: 0.8 },
  wonder: { amp: 1.6, freqDefault: 0.34, accentGain: 0.55 },
  tense: { amp: 1.4, freqDefault: 0.38, accentGain: 0.9 },
  tender: { amp: 1.15, freqDefault: 0.26, accentGain: 0.28 },
  peaceful: { amp: 1, freqDefault: 0.22, accentGain: 0.2 },
  nostalgic: { amp: 1, freqDefault: 0.24, accentGain: 0.18 },
  sad: { amp: 0.85, freqDefault: 0.2, accentGain: 0.12 },
};

/** 摆幅增益 = lerp(0.3, 1, A) × 副歌系数（副歌中 1 + 0.4·contrast）。 */
export const rhythmGain = (arousal01: number, inChorus: boolean, contrast: number) =>
  lerp(0.3, 1, clamp01(arousal01)) * (inChorus ? 1 + 0.4 * clamp01(contrast) : 1);

// ───────────────────────── 出口：粒子 ─────────────────────────

export type MusicParticle = 'notes' | 'motes-up' | 'motes-down' | 'sparks';

/** 播放中的粒子种类由 feel 决定（A10）：雀跃音符弹跳、温柔宁静光点上浮、哀伤怀念光尘下沉、紧绷短火花。 */
export const particleForFeel = (feel: Feel, ownSong: boolean): MusicParticle => {
  if (feel === 'joyful' || feel === 'wonder') return ownSong || feel === 'joyful' ? 'notes' : 'motes-up';
  if (feel === 'tense') return 'sparks';
  if (feel === 'sad' || feel === 'nostalgic') return 'motes-down';
  return 'motes-up';
};

/** 发射冷却（秒）：唤醒越高越勤，2.8s → 0.9s。 */
export const particleCooldown = (arousal01: number) => lerp(2.8, 0.9, clamp01(arousal01));

const clamp = (x: number) => Math.max(-1, Math.min(1, x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
