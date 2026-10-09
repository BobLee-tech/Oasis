// 💗 情感模型（docs/miku-design.md A3，ALMA 式三层）：
//
//   性格（常量）   —— 站主 / 访客两组增益：温暖度、活泼度、话量
//   心境（分钟）   —— VA 平面上的一个点 m：被「时间基线」和「正在放的歌」吸引，交互轻轻推它一下
//   情绪（秒）     —— {kind, intensity}：事件触发，按各自半衰期消退
//
//   情绪色调（分钟，比心境快）—— 10 维向量 E（docs/song-emotion-design.md §3.1）：被正在放的歌的 feels 吸引，
//                     不放歌时回到性格基线；它给脸加细微偏移、给律动与粒子按权重混合
//
//   四个出口（脸、视线、律动、粒子）都只读这里的输出，所以话、脸、身体是同一种情绪的不同出口。
//   纯逻辑、无 DOM；时间从外面传进来，单测可以用假时钟跑（affect.test.ts）。
import { FEELS, type Feel, type Feels, type Imagery } from '../../../lib/trackMood';
import { COMFORT_TENDER } from './resonance';

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
// 情绪色调比心境底色快：换歌后先变的是「什么样的」，再是「多亮多燃」
const TONE_TAU_S = 25;
/** 听歌时目标里歌占多少的缺省值；实际值是共鸣系数 r（brain/resonance.ts），深夜陪着时降到 0.35 */
export const MUSIC_RESONANCE = 0.65;
/** 她自己的底色：不放歌时回到这里 */
export const TONE_BASELINE: Partial<Record<Feel, number>> = { tender: 0.2, peaceful: 0.15 };

export type Tone = Record<Feel, number>;
const zeroTone = (): Tone => Object.fromEntries(FEELS.map(feel => [feel, 0])) as Tone;

/**
 * 情绪色调的目标：播放中 = 基线 ×(1−r) + 歌的强度/3 × r；不放歌 = 基线。
 * tenderFloor：陪着的时候（§3.5）温柔不低于它——她不跟你一起沉到底，而是往温柔那边靠。
 */
export const toneTarget = (feels: Feels | null | undefined, r = MUSIC_RESONANCE, tenderFloor = 0): Tone => {
  const out = zeroTone();
  for (const feel of FEELS) {
    const base = TONE_BASELINE[feel] ?? 0;
    out[feel] = feels ? base * (1 - r) + ((feels[feel] ?? 0) / 3) * r : base;
  }
  out.tender = Math.max(out.tender, tenderFloor);
  return out;
};

/** 两个色调相差多少（欧氏距离）：段落切换时 > ARC_TURN_MIN 才算「情绪转了」（§3.2 的 arc-turn）。 */
export const toneDistance = (a: Tone, b: Tone) => Math.sqrt(FEELS.reduce((sum, feel) => sum + (a[feel] - b[feel]) ** 2, 0));
export const ARC_TURN_MIN = 0.4;

/** 归一化权重（和为 1）；全零时返回 null。 */
export const toneWeights = (tone: Tone): Tone | null => {
  const total = FEELS.reduce((sum, feel) => sum + tone[feel], 0);
  if (total < 1e-6) return null;
  const out = zeroTone();
  for (const feel of FEELS) out[feel] = tone[feel] / total;
  return out;
};
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
  /**
   * 正在播放的歌此刻的心境（已叠上当前段的弧线，见 trackMood.moodNow）；不在播放时为 null。
   * valence 是词的效价——心境点管脸、视线与台词（§3.4），曲的效价不进这里，由身体的出口直接读。
   * arousal 0..1，feels 为 0–3 强度。
   */
  music: { valence: number; arousal: number; feels?: Feels } | null;
  /** 实时能量 0..1（低频+中频包络），与曲目 arousal 按 0.3 混合 */
  liveEnergy: number;
  /** 共鸣系数（brain/resonance.ts）：不给 = 缺省 0.65、不陪着 */
  resonance?: { r: number; comfort: boolean };
}

export class Affect {
  m: VA;
  /** 情绪色调：10 维，各 0..1 */
  tone: Tone = toneTarget(null);
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
    const r = input.resonance?.r ?? MUSIC_RESONANCE;
    return { v: base.v + (music.v - base.v) * r, a: base.a + (music.a - base.a) * r };
  }

  step(dt: number, input: AffectInput) {
    this.personality = PERSONALITY[input.owner ? 'owner' : 'visitor'];
    const t = this.target(input);
    const k = 1 - Math.exp(-dt / MOOD_TAU_S);
    this.m.v += (t.v - this.m.v) * k;
    this.m.a += (t.a - this.m.a) * k;
    const goal = toneTarget(input.music?.feels ?? null, input.resonance?.r, input.resonance?.comfort ? COMFORT_TENDER : 0);
    const kt = 1 - Math.exp(-dt / TONE_TAU_S);
    for (const feel of FEELS) this.tone[feel] += (goal[feel] - this.tone[feel]) * kt;
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

  /** 往某一维推一下（被摸头 → 温柔），之后照常被目标拉回。 */
  nudgeTone(feel: Feel, amount: number) {
    this.tone[feel] = clamp01(this.tone[feel] + amount);
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

// 情绪色调的面部偏移（§3.3）：每维满强度时的偏移，单项 ≤ 0.15；叠加后每个参数再夹到 ±0.25。
// 不做专门的「切ない脸」——哀伤的八字眉 + 温柔的眼笑同时叠上去，它自己就出来了。
export const TONE_FACE: Partial<Record<Feel, Partial<Face>>> = {
  tender: { eyeSmile: 0.1, cheek: 0.05 },
  nostalgic: { browAngle: 0.1 },
  sad: { mouthForm: -0.1, browAngle: 0.15 },
  power: { browY: 0.1, mouthForm: 0.1 },
  transcendence: { eyeOpen: -0.1 },
  defiant: { browAngle: -0.15, eyeSmile: -0.1 },
  tense: { browForm: -0.1 },
  wonder: { browY: 0.12, eyeOpen: 0.05 },
};
const TONE_FACE_LIMIT = 0.25;

export const toneFaceOffset = (tone: Tone | undefined): Partial<Face> => {
  const out: Partial<Face> = {};
  if (!tone) return out;
  for (const feel of FEELS) {
    const offset = TONE_FACE[feel];
    if (!offset) continue;
    for (const key of Object.keys(offset) as (keyof Face)[]) out[key] = (out[key] ?? 0) + offset[key]! * tone[feel];
  }
  for (const key of Object.keys(out) as (keyof Face)[]) out[key] = Math.max(-TONE_FACE_LIMIT, Math.min(TONE_FACE_LIMIT, out[key]!));
  return out;
};

export const faceFor = (m: VA, emotion: Affect['emotion'], tone?: Tone): Face => {
  const offset = toneFaceOffset(tone);
  const s = (clamp(m.v) + 1) / 2; // 0 = 低落，1 = 明亮
  const t = (clamp(m.a) + 1) / 2; // 0 = 安静，1 = 激活
  const out = {} as Face;
  for (const key of Object.keys(CORNERS.pp) as (keyof typeof CORNERS.pp)[]) {
    const top = lerp(CORNERS.np[key], CORNERS.pp[key], s);
    const bottom = lerp(CORNERS.nn[key], CORNERS.pn[key], s);
    let value = lerp(bottom, top, t) + (offset[key] ?? 0);
    if (emotion) value = lerp(value, EMOTION_FACE[emotion.kind][key], emotion.intensity);
    out[key] = value;
  }
  // 困倦：唤醒越低眼皮越沉（最多 −15%）；sleepy 情绪再沉一点
  const drowsy = Math.max(0, -m.a) * 0.15 + (emotion?.kind === 'sleepy' ? 0.12 * emotion.intensity : 0);
  out.eyeOpen = Math.min(1.05, 1 - drowsy + (offset.eyeOpen ?? 0));
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
  // 新三维（docs/song-emotion-design.md §3.6）：燃重拍、空灵几乎不动、不甘有劲但不雀跃
  power: { amp: 1.9, freqDefault: 0.38, accentGain: 0.95 },
  transcendence: { amp: 1, freqDefault: 0.2, accentGain: 0.1 },
  defiant: { amp: 1.5, freqDefault: 0.36, accentGain: 0.85 },
};

/** 律动风格按情绪色调的权重混合（§3.6）；色调全零时为 null（调用方退回按歌手分类）。 */
export const blendRhythm = (tone: Tone): RhythmStyle | null => {
  const w = toneWeights(tone);
  if (!w) return null;
  const out: RhythmStyle = { amp: 0, freqDefault: 0, accentGain: 0 };
  for (const feel of FEELS) {
    const style = RHYTHM_BY_FEEL[feel];
    out.amp += style.amp * w[feel];
    out.freqDefault += style.freqDefault * w[feel];
    out.accentGain += style.accentGain * w[feel];
  }
  return out;
};

/** 强拍点头的倾向：雀跃、奇妙、燃三维的权重和（0..1）。 */
export const beatNodAffinity = (tone: Tone) => {
  const w = toneWeights(tone);
  return w ? w.joyful + w.wonder + w.power : 0;
};

/** 按权重抽一维（rand ∈ [0,1)）：一首「怀念 3 + 温柔 2」的歌，下沉光尘里会夹着上浮光点。 */
export const sampleTone = (tone: Tone, rand: number): Feel | null => {
  const w = toneWeights(tone);
  if (!w) return null;
  let acc = 0;
  for (const feel of FEELS) {
    acc += w[feel];
    if (rand < acc) return feel;
  }
  return FEELS[FEELS.length - 1];
};

/** 摆幅增益 = lerp(0.3, 1, A) × 副歌系数（副歌中 1 + 0.4·contrast）。 */
export const rhythmGain = (arousal01: number, inChorus: boolean, contrast: number) =>
  lerp(0.3, 1, clamp01(arousal01)) * (inChorus ? 1 + 0.4 * clamp01(contrast) : 1);

// ───────────────────────── 出口：粒子 ─────────────────────────

export type MusicParticle = 'notes' | 'motes-up' | 'motes-down' | 'sparks';

/** 播放中的粒子种类由 feel 决定（A10）：雀跃音符弹跳、温柔宁静光点上浮、哀伤怀念光尘下沉、紧绷短火花。 */
export const particleForFeel = (feel: Feel, ownSong: boolean): MusicParticle => {
  if (feel === 'joyful' || feel === 'wonder') return ownSong || feel === 'joyful' ? 'notes' : 'motes-up';
  if (feel === 'power') return 'notes';
  if (feel === 'tense' || feel === 'defiant') return 'sparks';
  if (feel === 'sad' || feel === 'nostalgic') return 'motes-down';
  return 'motes-up';
};

// ───────────────────────── 词曲分治（§3.4）─────────────────────────
// 身体跟曲，脸和嘴跟词：心境点 m 由词的效价拉动（脸、视线、台词）；律动幅度、粒子发射率与色温读曲的效价。
// 于是 踊ろうぜ 上她会跟着晃，眉头却是皱的。

/** 曲的明暗对身体的增益：曲越亮晃得越开、粒子越勤（0.85..1.15，中性 = 1）。 */
export const soundLift = (soundValence: number) => 1 + 0.15 * clamp(soundValence);

// ───────────────────────── 意象粒子（§3.6）─────────────────────────

export type ImageryParticle = 'rain' | 'bubbles' | 'petals' | 'firefly' | 'snow';

/** 歌的意象 → 粒子；覆盖季节粒子。letter 没有粒子（只给台词），返回 null 时退回季节。 */
export const imageryParticle = (imagery: readonly Imagery[] | undefined): ImageryParticle | null => {
  for (const item of imagery ?? []) {
    if (item === 'rain') return 'rain';
    if (item === 'sea') return 'bubbles';
    if (item === 'flower') return 'petals';
    if (item === 'moon') return 'firefly';
    if (item === 'snow') return 'snow';
  }
  return null;
};

/** 发射冷却（秒）：唤醒越高越勤，2.8s → 0.9s。 */
export const particleCooldown = (arousal01: number) => lerp(2.8, 0.9, clamp01(arousal01));

const clamp = (x: number) => Math.max(-1, Math.min(1, x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
