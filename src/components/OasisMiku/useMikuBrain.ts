// 🧠 Miku 的「大脑」：视线、触碰手势、心情浓度的连续过渡，以及按上下文挑台词。
//   刻意避免与模型自带的专业动作片段打架——Tap/Flick/Doze 播放时，这里的表情混合全程让位。
//
//   触碰分两拍：按下那一帧先由冲量层给出身体反应（缩一下、眯眼），手势状态机在 ≤120ms 内判定是
//   点按/长按/抚摸/拽马尾/划过，抚摸与拽在「过程中」逐帧跟手；松手才结算台词与动作片段。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { MikuStageHandle, PoseParam } from './Live2DStage';
import type { ParticleCanvasHandle } from './particles/ParticleCanvas';
import type { EmitContext, EmitKind } from './particles/sim';
import { revealDuration, speakingOpen, utter, type Utterance } from './brain/speech';
import {
  ARC_TURN_MIN, Affect, beatNodAffinity, blendRhythm, faceFor, gazeBiasY, imageryParticle, particleCooldown, particleForFeel,
  rhythmGain, sampleTone, soundLift, timeTarget, toneDistance, toneTarget, type EmotionKind, type Tone,
} from './brain/affect';
import {
  chorusState, getTrackMood, loadTrackMoods, moodNow, segmentAt, type Feels, type ResolvedTrackMood, type SegmentNow,
} from '../../lib/trackMood';
import type { AppView } from '../../types/auth';
import type { MusicCategory } from '../../types/music';
import { isLateNight } from '../../lib/timeContext';
import { currentSeason } from '../../lib/solarTerms';
import { onMikuSignal } from '../../lib/mikuSignal';
import { MotionDirector } from './brain/motionDirector';
import { RhythmEngine, profileForCategory } from './brain/rhythmEngine';
import { BreathEngine } from './brain/breath';
import { BlinkEngine } from './brain/blink';
import { LipSync } from './brain/lipSync';
import { CriticalSpring } from './brain/spring';
import { GazeController, gazeFromPoint } from './brain/gaze';
import { ImpulseLayer, TILT_SIGN } from './brain/impulse';
import { GestureTracker, type GestureState, type TouchZone } from './brain/gesture';
import { PAIN_THRESHOLD, TwintailPull, type TailSide } from './brain/twintail';
import { getActiveLyric, getPlaybackTime, getPlayerSnapshot } from '../../hooks/useSoundscape';
import { useTicker } from '../../lib/ticker';
import { MikuVoice, type VoiceLine } from './brain/voice';
import { CareScheduler, isReturn } from './brain/care';
import { FINISHED_RATIO, SessionListening, type ListeningState, type Resonance } from './brain/resonance';
import { forgetTrackFelt, getTrackFelt, loadTrackFelt } from '../../lib/trackFelt';
import type { MikuEvent } from './brain/dialogue';
import type { FactsInput } from './brain/facts';
import { peekCachedPosts, type BlogPost } from '../../hooks/useGarden';
import { getReadProgress } from '../../lib/reading';
import { getVisitorAlias } from '../../lib/visitor';
import { trackFacts } from '../../lib/trackProfile';
import { PLAYLIST } from '../../hooks/useSoundscape';
import type { MikuReadingPost } from '../../lib/mikuSignal';

/** 气泡染色用：此刻占上风的情绪（情绪模型见 brain/affect）；没有明显情绪时为 neutral。 */
export type Mood = 'neutral' | EmotionKind;
// 命中区域（TouchZone，见 brain/gesture）：头部 / 双马尾 / 躯干（含手臂）/ 裙摆与腿部——优先走 drawable
// 精确命中（见 classifyDrawableHits），只有点在网格缝隙里（命中列表为空）时才退回按容器比例的几何分带兜底

// drawable ID 前缀 → 分区，对应当前模型（miku_sample_t04）实际的 drawable 命名；换一具模型这套前缀对不上
// 也不会报错，只是 classifyDrawableHits 总返回 null，静默退回几何兜底
const HEAD_ID_PREFIXES = ['D_FACE_', 'D_EYE_', 'D_BROW_', 'D_MOUTH_', 'D_NOSE_', 'D_CHEEK_', 'D_HEADSET_', 'D_HAIR_FRONT_', 'D_NECK_'];
const TWINTAIL_ID_PREFIX = 'D_HAIR_BACK';
// 头顶的后发与发饰也叫 D_HAIR_BACK_*（01–06、14、c_*，包围盒都在画布 y 0.03–0.20 的头顶一带），
// 真正垂下来的马尾是 07–13/15–17（屏幕左）与 18–26（屏幕右）。第一版把它们一律当马尾，
// 摸头顶就成了「拽辫子」——这正是「摸摸头没反应」的原因之一。
const HEAD_BACK_HAIR = /^D_HAIR_BACK_(0[1-6]|14|c_)/;
const BODY_ID_PREFIXES = ['D_BODY_', 'D_ARM_'];
const HEM_ID_PREFIX = 'D_LEG_';

// hits 已经是 Live2DStage.hitTestDrawables 按渲染次序「最靠前优先」排好的列表——直接取 hits[0]
// 就是这个像素上视觉最顶层、用户真正「摸到」的那个部件。旧版按 头>马尾>身体>裙摆 的固定优先级
// 扫描整个命中列表，问题是双马尾的轴对齐包围盒能把大半个身体都罩住，于是点手臂/点腿只要落在
// 这个大矩形里就会被马尾抢走判定，出现「摸大腿说摸到辫子」这种错位。改成信「最前面那层」之后，
// 只有真正被头发遮住的地方才会判成摸到头发，符合直觉
const classifyDrawableHits = (hits: string[]): TouchZone | null => {
  const front = hits[0];
  if (!front) return null;
  if (HEAD_ID_PREFIXES.some((p) => front.startsWith(p)) || HEAD_BACK_HAIR.test(front)) return 'head';
  if (front.startsWith(TWINTAIL_ID_PREFIX)) return 'twintail';
  if (BODY_ID_PREFIXES.some((p) => front.startsWith(p))) return 'body';
  if (front.startsWith(HEM_ID_PREFIX)) return 'hem';
  return null;
};

// 脸颊/眼笑/眉毛这类情绪表情，跟 Tap/Flick 的身体动作本是两件正交的事——不该被 motionDirector
// 的整体让位连累。给这些参数的 overrideParam 传这个 floor，即使 Tap 正在播（全局 yieldAlpha→0），
// 表情依然能保持 80% 强度：摸头的瞬间就看得到脸红，不用等 3 秒动作播完才慢半拍浮现
const EMOTION_YIELD_FLOOR = 0.8;
// 气泡停留时长按实际文字长度伸缩，不再是不论长短统一挂一个数字——中文舒适阅读速度约
// 4~6 字/秒，短句挂太久像卡住不走，长句挂不够久还没读完就先消失了
const BUBBLE_BASE_MS = 1600;
const BUBBLE_MS_PER_CHAR = 220;
const BUBBLE_MIN_MS = 3000;
const BUBBLE_MAX_MS = 8000;
// 点按/长按/划过的阈值（260ms、28px 等）统一在 brain/gesture.ts 里
// 头部只占容器高度的前 ~20%（她是全身立绘，不是半身像）；0.62 以下算裙摆与腿
const HEAD_FRAC = 0.2;
const HEM_FRAC = 0.62;
// 连续点按：这个时间窗内命中这么多次，就从「宠溺」切换成「有点不耐烦」
const COMBO_WINDOW_MS = 1500;
const COMBO_THRESHOLD = 3;
// 抚摸按「手走过的路程」累积心情，不按时长——来回摸才算摸，按住不动那是长按
// 以「脸半径」为单位：桌面端脸半径 ~16px，摸满 ≈ 350px 路程（在头上来回十来趟），而不是固定 900px
const STROKE_FULL_R = 22;
const STROKE_HEART_MARKS_R = [8, 18, 30];
// 拽马尾：水平位移达到「脸半径 × 2.5」记为拉满 1
const PULL_UNIT_R = 2.5;
// 冷落这么久之后光标靠近，她会先注意到你
const NOTICE_IDLE_MS = 30000;
const NOTICE_RADIUS_PX = 220;

// 由 overrideParam 绝对接管：唱歌口型、眉眼脸红嘴形，以及手臂。手臂放进这一组是拿实测数据
// 校准过的——用 __miku 调试口子逐帧采样过 Idle 动作片段自己的 ParamArmL/R，发现它本身就会
// 在每个 ~2.4s 循环里荡到接近满量程（-0.84~1），跟有没有放歌、有没有我们的叠加律动完全无关。
// 也就是说「手不必要地往两边翘」根源是 Idle 片段自己的振幅，不是只加一点律动波纹能盖住的——
// 所以手臂不跟头身摆动一样走 addParam 叠加，而是整段 override，由我们自己一套克制得多的
// 呼吸态微动全权接管。
//
// 这些参数每帧都无条件计算+写入，不再像旧版那样在 reacting 窗口里手动 clearParam——
// 「要不要生效」交给 Live2DStage 的 setYield 连续系数去接管（见 motionDirector），
// 这样进/出动作片段两个方向都是平滑过渡，不会再有表情硬切的那一帧

// 标准三次埃尔米特平滑阈值：x 在 [edge0, edge1] 内从 0 平滑升到 1，之外分别钳在 0/1
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// minMs 不再是「唯一决定时长的数字」，而是一条「至少停这么久」的下限——milestone 类台词
// 传入更大的 minMs 来保证分量感，但实际时长仍会按这句话真实有多长继续往上浮动
const bubbleDuration = (text: string, revealMs: number, minMs?: number) => {
  const computed = BUBBLE_BASE_MS + text.length * BUBBLE_MS_PER_CHAR;
  // 逐字出现要占掉一段时间：至少留「出完 + 1.6s」给人读完最后几个字
  return Math.max(revealMs + BUBBLE_BASE_MS, Math.min(BUBBLE_MAX_MS, Math.max(BUBBLE_MIN_MS, minMs ?? 0, computed)));
};

const titleOf = (id: string) => PLAYLIST.find(t => t.id === id)?.title;
// 写作字数里程碑：500 只点头加光点，1000/2000 才出一句（A7）
const WRITE_MARKS = [500, 1000, 2000];
const PATS_KEY = 'oasis_miku_pats';
const PATS_DAY_KEY = 'oasis_miku_pats_day';
const VISITOR_CARE = ['care-sedentary'] as const;

export interface MikuDebugSnapshot {
  m: { v: number; a: number };
  target: { v: number; a: number };
  /** 情绪色调（10 维，0..1） */
  tone: Tone;
  emotion: { kind: EmotionKind; intensity: number } | null;
  arousal01: number;
  owner: boolean;
  trackId?: string;
  mood?: ResolvedTrackMood;
  chorus: 'in' | 'soon' | null;
  /** 此刻在哪一段，以及这一段命中的弧线增量（P3） */
  segment: SegmentNow | null;
  arc: ReturnType<typeof moodNow>['arc'];
  /** 叠上弧线后此刻的情绪向量 */
  feelsNow?: Feels;
  /** 心境点读的词效价 / 身体读的曲效价（都已叠上弧线） */
  faceValence?: number;
  soundValence?: number;
  rhythmGain: number;
  /** 共鸣系数与陪伴（P5）：r、是否陪着、本会话的听歌倾向、连续听完的低落歌 */
  resonance: Resonance;
  lean?: string;
  lowStreak: number;
  /** 站主标的「这首让我怎样」 */
  felt?: Feels;
  zone: string | null;
  /** 上一句话：命中规则、得分、称呼场域与原因 */
  line: VoiceLine['debug'] & { text: string } | null;
}

interface UseMikuBrainOptions {
  stageRef: RefObject<MikuStageHandle | null>;
  particlesRef: RefObject<ParticleCanvasHandle | null>;
  ready: boolean;
  view: AppView;
  isPlaying: boolean;
  trackId: string | undefined;
  trackCategory: MusicCategory | undefined;
  trackTitle?: string;
  trackArtist?: string;
  /** 曲目情绪色：播放中的光点取它 */
  trackColor: string | undefined;
  getSpectrum: (bars: number) => number[];
  getEnergy: () => { low: number; mid: number; high: number; beat: number };
  coarsePointer: boolean;
  /** 尊重 prefers-reduced-motion：画布本身已冻结渲染，这里同步停掉自主动作调度，
   *  不然会出现「人物纹丝不动却突然弹出一句话」的割裂感 */
  reduceMotion: boolean;
  /** 收起时停止调度，和 Live2D ticker 一起归零功耗。 */
  paused: boolean;
  /** 站主在场（effectiveIsAdmin）：性格增益、效价基线都不同（A3）；访客预览时为 false */
  isOwner?: boolean;
}

export const useMikuBrain = ({
  stageRef, particlesRef, ready, view, isPlaying, trackId, trackCategory, trackTitle, trackArtist, trackColor, getSpectrum, getEnergy,
  coarsePointer, reduceMotion, paused, isOwner = false,
}: UseMikuBrainOptions) => {
  const [bubble, setBubble] = useState<string | null>(null);
  // 气泡边框的情绪染色只认「说这句话时她是什么心情」，不逐帧跟随 moodRef——
  // 那样既没必要（气泡本就每隔几秒才换一次内容）也会引入不必要的高频重渲染
  const [bubbleMood, setBubbleMood] = useState<Mood>('neutral');
  // 每说一句换一个 id：同一句话重说也要从头逐字出现
  const [bubbleId, setBubbleId] = useState(0);
  const speechRef = useRef<Utterance | null>(null);
  const bubbleTimer = useRef<number | null>(null);
  // 情感模型：心境 VA（分钟级）+ 情绪（秒级）。初值取「此刻的时间基线」，打开时不会从中性慢慢漂过去
  const [affect] = useState(() => {
    const now = new Date();
    return new Affect(timeTarget(now.getHours() + now.getMinutes() / 60, false));
  });
  // 脸部参数的平滑值（affect 给目标，这里按帧逼近，避免情绪切换时硬跳）
  const valsRef = useRef({ eyeSmile: 0, cheek: 0, mouthForm: 0, browY: 0, browAngle: 0, browForm: 0, eyeOpen: 1 });
  const trackMoodRef = useRef<ResolvedTrackMood | undefined>(undefined);
  const chorusRef = useRef<{ state: 'in' | 'soon' | null; gain: CriticalSpring; prep: CriticalSpring }>({
    state: null, gain: new CriticalSpring(1), prep: new CriticalSpring(0),
  });
  // 段落（P3）：此刻在哪一段、这一段的情绪向量；换段时比较前后两段的色调目标，转得够多就发 arc-turn
  const segmentRef = useRef<{ trackId?: string; seg: SegmentNow | null; feels?: Feels }>({ seg: null });
  const ownerRef = useRef(isOwner);
  // 台词、称呼与记忆（brain/voice）：关系一变就换记忆适配器，访客既不写也读不到站主的记忆
  const [voice] = useState(() => new MikuVoice());
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __mikuVoice?: MikuVoice }).__mikuVoice = voice;
  }, [voice]);
  const readyAtRef = useRef(0);
  useEffect(() => {
    ownerRef.current = isOwner;
    voice.setOwner(isOwner);
  }, [isOwner, voice]);
  const lastLineRef = useRef<MikuDebugSnapshot['line']>(null);
  // 仅开发环境的调试快照（MikuDebugPanel 以 8Hz 读取，不进 React）
  const debugRef = useRef<MikuDebugSnapshot | null>(null);
  const rhythmRef = useRef(new RhythmEngine());
  const breathRef = useRef(new BreathEngine());
  const blinkRef = useRef(new BlinkEngine());
  const lipRef = useRef(new LipSync());
  // 手臂呼吸态微动的独立相位——恒速推进，不随音乐能量变化，安静时也要有这一点点存在感，
  // 不然又变回和 Idle 切换瞬间一样的「一动不动」；刻意不共用 rhythmRef 的内部相位，
  // 手臂本就该是比头身摇摆更轻、更不精确锁拍的一层装饰性涟漪
  const armPhaseRef = useRef(0);
  const lastViewRef = useRef<AppView | null>(null);
  const lastTrackRef = useRef<string | undefined>(undefined);
  const lookTimerRef = useRef(0);
  // 手感底座：视线三级弹簧 / 按下冲量 / 手势状态机 / 拽马尾
  const [gaze] = useState(() => {
    const controller = new GazeController();
    // 大幅转移视线时顺带眨一下（回调在之后的帧里才调用，不是渲染期读 ref）
    controller.onBigShift = () => blinkRef.current.trigger();
    return controller;
  });
  const impulseRef = useRef(new ImpulseLayer());
  const gestureRef = useRef(new GestureTracker());
  const tailRef = useRef(new TwintailPull());
  // 自主张望的目标（触屏、或指针 3s 没动时）
  const autoTargetRef = useRef({ x: 0, y: 0 });
  // 脸部锚点每 250ms 才重读一次布局，触碰时强制刷新——不在每一帧都 getBoundingClientRect
  const anchorRef = useRef<{ value: { x: number; y: number; r: number } | null; at: number }>({ value: null, at: -Infinity });
  // 抚摸跟手：手的速度（px/ms，按事件平滑、按帧衰减）→ 头顺着手的方向歪
  const handVelRef = useRef({ x: 0, y: 0, at: 0 });
  const leanXRef = useRef(new CriticalSpring());
  const leanYRef = useRef(new CriticalSpring());
  const strokeDepthRef = useRef(new CriticalSpring());
  const heartMarkRef = useRef(0);
  const painedRef = useRef(false);
  const noticeRef = useRef(false);
  // 随机初值只在首次挂载时取一次（useState 初始化函数），不在每次渲染里调 Math.random
  const [initialTimers] = useState(() => ({ doze: 20000 + Math.random() * 20000, chatter: 70000 + Math.random() * 50000 }));
  const dozeTimerRef = useRef(initialTimers.doze);
  const idleChatterTimerRef = useRef(initialTimers.chatter);
  // 唱自己的歌时偶尔冒个音符泡泡——只认镇站曲（MusicCategory 'Miku'），不然听 Yorushika/Atarayo 时
  // 满屏飘她自己的音符会显得答非所问
  const noteTimerRef = useRef(2600);
  const beatHighRef = useRef(false);
  const seasonTimerRef = useRef(9000);
  const farLookTimerRef = useRef(25000);
  // 抚摸留下的光尘：手每走 18px 落一粒
  const dustPathRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0, movedAt: 0 });
  const comboRef = useRef<number[]>([]);
  // 动作片段的播放与「专业动作片段正在演出、表情混合/自主发言该让位」的时间窗全部交给
  // motionDirector 管理（含「Loop:true 动作永不播完，需要主动补一次 Idle 才能回归」的修复）
  const directorRef = useRef(new MotionDirector());
  // 阅读舱/编辑器——由 OasisGallery 通过 mikuSignal 通知；台词事实（标题、字数、进度）也从这里取
  const readingRef = useRef<(MikuReadingPost & { openedAt: number }) | null>(null);
  const editingRef = useRef<{ words: number; openedAt: number; mark: number } | null>(null);
  const publishedRef = useRef<{ id?: string; title?: string } | null>(null);
  const prevTrackRef = useRef<string | undefined>(undefined);
  // 听歌记账：当前曲目在播放状态下累计了多久（≥ 30s 记一次 listen，切走时不足 30s 记 skip）；
  // durMs 是曲长、pos 是上一帧的进度——单曲循环时进度从尾巴跳回开头，也算听完一遍
  const listenRef = useRef<{ id?: string; ms: number; logged: boolean; durMs: number; pos: number }>({ ms: 0, logged: false, durMs: 0, pos: 0 });
  // 陪伴（brain/resonance）：本次会话往哪边听、连续听完了几首低落的歌，决定她跟着歌走多少（只为站主记）
  const [listening] = useState(() => new SessionListening());
  const postsRef = useRef<{ at: number; posts: BlogPost[] }>({ at: -Infinity, posts: [] });
  const trackRef = useRef({ trackId, trackTitle, trackArtist, trackCategory, isPlaying, view });
  useEffect(() => {
    trackRef.current = { trackId, trackTitle, trackArtist, trackCategory, isPlaying, view };
  }, [trackId, trackTitle, trackArtist, trackCategory, isPlaying, view]);
  const hiddenAtRef = useRef<number | null>(null);
  // 照顾行为（brain/care）：真实活动计时、深夜两档、久坐、长时间写作；15s 轮询一次，不进逐帧循环
  const [care] = useState(() => new CareScheduler());
  const lastInputRef = useRef(0);

  const say = useCallback((text: string, minMs?: number) => {
    const u = utter(text, performance.now());
    speechRef.current = u;
    setBubble(text);
    setBubbleId((id) => id + 1);
    setBubbleMood(affect.emotion && affect.emotion.intensity > 0.15 ? affect.emotion.kind : 'neutral');
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), bubbleDuration(text, revealDuration(u.timeline), minMs));
  }, [affect]);

  /** 收起时立即收声：不让上一句话转移到挂坠上方继续挂着。 */
  const hush = useCallback(() => {
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = null;
    speechRef.current = null;
    setBubble(null);
    particlesRef.current?.clear();
  }, [particlesRef]);

  const headAnchor = useCallback((force = false) => {
    const cache = anchorRef.current;
    const now = performance.now();
    if (force || now - cache.at > 250) {
      cache.value = stageRef.current?.headAnchor() ?? cache.value;
      cache.at = now;
    }
    return cache.value;
  }, [stageRef]);

  /** 发射粒子。at 是屏幕坐标；不给就从脸部中心发（配方自己会按脸半径偏到头顶/两侧）。 */
  const emit = useCallback((kind: EmitKind, at?: { x: number; y: number } | null, extra?: Partial<EmitContext>) => {
    const head = headAnchor();
    const origin = at ?? head;
    if (!origin) return;
    particlesRef.current?.emit(kind, { x: origin.x, y: origin.y, r: head?.r, ...extra });
  }, [headAnchor, particlesRef]);

  /** 里程碑：模型先定格 60ms（hitstop），再从胸口炸开星屑——停顿让爆发有重量。 */
  const milestone = useCallback((kind: 'burst' | 'petals') => {
    const stage = stageRef.current;
    const head = headAnchor(true);
    if (kind === 'burst') stage?.freeze(60);
    window.setTimeout(() => {
      emit(kind, head && kind === 'burst' ? { x: head.x, y: head.y + head.r * 1.6 } : head);
    }, kind === 'burst' ? 60 : 0);
  }, [emit, headAnchor, stageRef]);

  /** 触发情绪（秒级）。正向情绪顺带把心境往明亮推一点（A3 交互冲量）。 */
  const triggerMood = useCallback((mood: EmotionKind, intensity = 1) => {
    affect.feel(mood, intensity);
  }, [affect]);

  /** 拍头计数：总数（亲密度）与今天的次数。localStorage 不可用时静默降级为 0。 */
  const patCount = useCallback(() => {
    try {
      const next = Number(localStorage.getItem(PATS_KEY) ?? '0') + 1;
      localStorage.setItem(PATS_KEY, String(next));
      const today = new Date().toDateString();
      const day = JSON.parse(localStorage.getItem(PATS_DAY_KEY) ?? 'null') as { date: string; n: number } | null;
      localStorage.setItem(PATS_DAY_KEY, JSON.stringify({ date: today, n: day?.date === today ? day.n + 1 : 1 }));
      return next;
    } catch {
      return 0;
    }
  }, []);

  /** 此刻能观察到的一切（记忆由 voice 按关系补上）。文章缓存 30s 才重读一次。 */
  const collectInput = useCallback((extra: Partial<FactsInput> = {}): Omit<FactsInput, 'owner' | 'memory'> => {
    const now = new Date();
    const t = trackRef.current;
    if (performance.now() - postsRef.current.at > 30_000) postsRef.current = { at: performance.now(), posts: peekCachedPosts() };
    let patsTotal = 0;
    let patsToday = 0;
    try {
      patsTotal = Number(localStorage.getItem(PATS_KEY) ?? '0');
      const day = JSON.parse(localStorage.getItem(PATS_DAY_KEY) ?? 'null') as { date: string; n: number } | null;
      patsToday = day?.date === now.toDateString() ? day.n : 0;
    } catch { /* 隐私模式 */ }
    const reading = readingRef.current;
    return {
      now,
      visitorAlias: getVisitorAlias(),
      view: t.view,
      playing: t.isPlaying,
      track: t.trackId ? { id: t.trackId, title: t.trackTitle ?? '', artist: t.trackArtist ?? '', category: t.trackCategory ?? '' } : undefined,
      trackFacts: t.trackId ? trackFacts(t.trackId, prevTrackRef.current) : undefined,
      mood: getTrackMood(t.trackId),
      chorus: chorusRef.current.state,
      segment: segmentRef.current.seg,
      titleOf,
      reading: reading ? { ...reading, progress: getReadProgress(reading.id) } : null,
      editing: editingRef.current,
      published: publishedRef.current,
      posts: postsRef.current.posts,
      combo: comboRef.current.length,
      patsTotal,
      patsToday,
      affect: { v: affect.m.v, a: affect.m.a, emotion: affect.emotion?.kind ?? null },
      // 站主私密：felt 与听歌倾向只在站主模式下给（facts 那一层还会再拦一道）
      felt: ownerRef.current ? getTrackFelt(t.trackId) : undefined,
      sessionLean: ownerRef.current ? listening.sessionLean : undefined,
      ...extra,
    };
  }, [affect, listening]);

  /**
   * 说一句：事实 → 规则 → 话量 → 称呼（brain/voice）。规则可以顺带指定表情与粒子。
   * 返回是否真的说了（或用表情回应了）。
   */
  const speak = useCallback((event: MikuEvent, extra: Partial<FactsInput> = {}, minMs?: number, force = false) => {
    const line = voice.speak(event, collectInput(extra), { force });
    if (!line) return false;
    if (line.rule.face) affect.feel(line.rule.face, 0.8);
    if (line.rule.particles) {
      if (line.rule.particles === 'burst' || line.rule.particles === 'petals') milestone(line.rule.particles);
      else emit(line.rule.particles);
    }
    if (line.text) say(line.text, minMs);
    if (import.meta.env.DEV) lastLineRef.current = { ...line.debug, text: line.text };
    return true;
  }, [voice, collectInput, affect, milestone, emit, say]);

  // 打招呼：模型就绪后先抬头做个出场动作，再按纪念日/时段/节气/熟识度问候一句
  // （延后一拍再开口，而非在 effect 里同步 setState：既避开级联渲染，也让她先把出场动画站稳再说话）
  useEffect(() => {
    if (!ready) return;
    readyAtRef.current = performance.now();
    if (isLateNight()) affect.feel('sleepy', 0.6);
    // 曲目心境按需加载（独立 chunk）；加载完之前 getTrackMood 返回 undefined，各出口按缺省走
    void loadTrackMoods();
    const t1 = window.setTimeout(() => {
      const stage = stageRef.current;
      if (!reduceMotion && stage) directorRef.current.play(stage, 'FlickUp', undefined, { reactMs: 2200 });
    }, 200);
    // 问候是这次见面的第一句，不受回应冷却约束
    const t2 = window.setTimeout(() => speak('greet', {}, 4500, true), 550);
    // 记得你：问候之后过一会儿，再看要不要提一句上次的事（每个会话最多一句）
    const t3 = window.setTimeout(() => {
      if (!directorRef.current.isReacting()) speak('recall', {}, 5000);
    }, 14000);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // 视图切换：进入星图/灯笼/画廊等场所时轻声搭一句话
  useEffect(() => {
    if (!ready) return;
    if (lastViewRef.current === null) { lastViewRef.current = view; return; }
    if (lastViewRef.current === view) return;
    lastViewRef.current = view;
    const t = window.setTimeout(() => speak('view'), 300);
    return () => window.clearTimeout(t);
  }, [view, ready, speak]);

  // 曲目切换：换歌时哼一句，认得出是谁的歌就用对应台词池，顺带进入哼唱心情
  useEffect(() => {
    if (!ready || !isPlaying || lastTrackRef.current === trackId) return;
    prevTrackRef.current = lastTrackRef.current;
    lastTrackRef.current = trackId;
    // 刚出场时已经在放的歌（背景乐自动起播）不报：第一句留给问候
    if (performance.now() - readyAtRef.current < 4000) return;
    triggerMood('happy', 0.6);
    // 规则按具体度挑：与上一首的关系 > 你写的话 / 镇站曲 > 歌手 > 通用；深夜反复听同一首会多一句照顾
    const t = window.setTimeout(() => {
      speak('track-change');
      window.setTimeout(() => speak('care-loop'), 5200);
    }, 300);
    return () => window.clearTimeout(t);
  }, [trackId, isPlaying, ready, triggerMood, speak]);

  // 写作/阅读感知：OasisGallery 懒加载且不在同一条组件树路径上，靠 mikuSignal 这条极轻量事件总线通气。
  // editingRef/readingRef 无论 ready 与否都照常更新（她没被召唤出来也该记住你在写东西），
  // 但只在 ready 时才真正开口——折叠态零打扰是全站既定的规矩。
  useEffect(() => {
    const stop = onMikuSignal((signal) => {
      if (signal.type === 'editor-open') {
        editingRef.current = { words: 0, openedAt: Date.now(), mark: 0 };
        if (ready) window.setTimeout(() => { if (!directorRef.current.isReacting()) { triggerMood('happy', 0.6); speak('editor-open', {}, 4200); } }, 500);
      } else if (signal.type === 'editor-progress') {
        const editing = editingRef.current;
        if (!editing) return;
        editing.words = signal.words;
        const next = WRITE_MARKS[editing.mark];
        if (next !== undefined && signal.words >= next) {
          editing.mark += 1;
          voice.remember({ kind: 'write', data: { words: next } });
          if (ready) {
            // 写作中不打扰：只点一下头、落一点光；一千字起才出一句
            impulseRef.current.nod(0.9);
            emit('dust', null, { count: 3, valence: affect.m.v });
            if (next >= 1000) speak('write-milestone');
          }
        }
      } else if (signal.type === 'editor-close') {
        editingRef.current = null;
      } else if (signal.type === 'published') {
        publishedRef.current = { id: signal.id, title: signal.title };
        voice.remember({ kind: 'publish', data: { id: signal.id, title: signal.title, trackId: trackRef.current.isPlaying ? trackRef.current.trackId : undefined } });
        if (ready) window.setTimeout(() => {
          const stage = stageRef.current;
          triggerMood('happy', 1);
          affect.nudge(0.2, 0.15);
          if (stage) directorRef.current.play(stage, 'FlickUp', undefined, { reactMs: 2200 });
          milestone('burst');
          speak('published', {}, 6500);
          publishedRef.current = null;
        }, 900);
      } else if (signal.type === 'reading-open') {
        readingRef.current = signal.post ? { ...signal.post, openedAt: Date.now() } : null;
        if (ready && signal.post) window.setTimeout(() => speak('reading-open', {}, 4200), 1200);
      } else if (signal.type === 'reading-close') {
        const reading = readingRef.current;
        if (reading && getReadProgress(reading.id) >= 0.9) {
          voice.remember({ kind: 'read', data: { id: reading.id, title: reading.title } });
        }
        readingRef.current = null;
      }
    });
    return stop;
  }, [ready, speak, triggerMood, stageRef, milestone, affect, voice, emit]);

  // 真实活动：指针、键盘、滚轮、触摸（被动监听，不影响页面）。久坐与「人还在不在」都按它算
  useEffect(() => {
    const mark = () => { lastInputRef.current = Date.now(); };
    mark();
    const opts = { passive: true, capture: true } as const;
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach(e => window.addEventListener(e, mark, opts));
    return () => events.forEach(e => window.removeEventListener(e, mark, opts));
  }, []);

  // 站主的照顾次数从记忆恢复：刷新页面不会把今晚已经说过的「该睡了」再说一遍
  useEffect(() => {
    if (!isOwner) return;
    const since = Date.now() - 36 * 3_600_000;
    care.restore(voice.store.query({ kinds: ['care'], since }).map(e => ({ t: e.t, type: String(e.data?.type ?? '') })));
  }, [isOwner, care, voice]);

  // 照顾调度：页面在前台就计时；只有她展开着、且没在演动作片段时才开口，没说出来就不记账（条件仍满足会再给）
  useEffect(() => {
    let last = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const dt = Math.min(60_000, now - last);
      last = now;
      const editing = editingRef.current;
      const firing = care.tick(dt, {
        now,
        hour: new Date(now).getHours(),
        visible: !document.hidden,
        lastInputAt: lastInputRef.current,
        editingSince: editing?.openedAt ?? null,
        allowed: ownerRef.current ? undefined : VISITOR_CARE,
      });
      if (!firing || !ready || paused || reduceMotion || directorRef.current.isReacting()) return;
      if (speak(firing.kind, { careRepeat: firing.repeat }, 5500)) {
        care.fired(firing.kind, now, editing?.openedAt ?? null);
        voice.remember({ kind: 'care', data: { type: firing.kind }, importance: firing.kind === 'care-late' ? 4 : 2 });
      }
    }, 15_000);
    return () => window.clearInterval(id);
  }, [care, ready, paused, reduceMotion, speak, voice]);

  // 会话记账（只为站主）：开始；结束时存一份快照——下次见面「上次那篇还没读完」「昨晚待到两点」就从这里来。
  // 结束点取 pagehide 与「标签页被藏起来」（手机上 pagehide 不一定来得及），离开 ≥ 30 分钟再回来算新会话。
  useEffect(() => {
    if (!ready || !isOwner) return;
    voice.remember({ kind: 'session-start', data: { view: trackRef.current.view } });
    let hiddenAt: number | null = null;
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      const t = trackRef.current;
      const reading = readingRef.current;
      voice.remember({
        kind: 'session-end',
        data: {
          trackId: t.isPlaying ? t.trackId : undefined,
          trackTitle: t.isPlaying ? t.trackTitle : undefined,
          readingId: reading?.id,
          readingTitle: reading?.title,
          readingProgress: reading ? getReadProgress(reading.id) : undefined,
          // 听歌倾向只在本机记忆里，30 分钟内回来（含刷新）接着算
          listening: listening.snapshot(),
        },
      });
    };
    const onVisibility = () => {
      if (document.hidden) { hiddenAt = Date.now(); end(); return; }
      if (hiddenAt !== null && Date.now() - hiddenAt >= 30 * 60_000) {
        ended = false;
        listening.reset();
        voice.remember({ kind: 'session-start', data: { view: trackRef.current.view } });
      } else {
        ended = false; // 短暂切走：撤销不了已写的结束，但之后的结束仍会再记一次，反思时取最后一个
      }
      hiddenAt = null;
    };
    window.addEventListener('pagehide', end);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', end);
      document.removeEventListener('visibilitychange', onVisibility);
      end();
    };
  }, [ready, isOwner, voice, listening]);

  // 站主模式：拉一次 felt（Supabase，仅园丁可读），并从 30 分钟内的上一次会话快照里接上听歌倾向；
  // 离开站主模式（登出、访客预览）就把 felt 的内存副本清掉。回到前台时过期了（10 分钟）再拉——工坊里刚标的能跟上
  useEffect(() => {
    if (!isOwner) {
      forgetTrackFelt();
      listening.reset();
      return;
    }
    void loadTrackFelt(true);
    const recent = voice.store.query({ kinds: ['session-end'], since: Date.now() - 30 * 60_000 }).at(-1);
    listening.restore(recent?.data?.listening as ListeningState | undefined);
    const onVisibility = () => { if (!document.hidden) void loadTrackFelt(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isOwner, voice, listening]);

  // 离开一阵子后回来：短暂切走标签页看一眼不值得欢迎，离开够久（60s+）才算「回来了」
  useEffect(() => {
    if (!ready) return;
    const onVisibility = () => {
      if (document.hidden) { hiddenAtRef.current = Date.now(); return; }
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      // 「回来了」：离开 ≥ 10 分钟或跨了一天（短暂切走看一眼不值得欢迎）
      if (hiddenAt !== null && isReturn(hiddenAt, Date.now())) {
        const awayMinutes = Math.round((Date.now() - hiddenAt) / 60000);
        window.setTimeout(() => { if (!directorRef.current.isReacting()) { triggerMood('happy', 0.7); speak('return', { awayMinutes }, 4800); } }, 400);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [ready, speak, triggerMood]);

  // 复制文本彩蛋：偶尔接住一句，别对着连续复制刷屏
  useEffect(() => {
    if (!ready) return;
    let lastAt = 0;
    const onCopy = () => {
      const now = performance.now();
      if (now - lastAt < 30000) return;
      lastAt = now;
      window.setTimeout(() => speak('copy', {}, 4200), 200);
    };
    document.addEventListener('copy', onCopy);
    return () => document.removeEventListener('copy', onCopy);
  }, [ready, speak]);

  // 全局视线：桌面端不再局限于她自己的 176×272 容器——只要指针最近动过，
  // 满屏任何地方她都会瞟一眼；触屏设备没有真实悬停，交给下面的自主张望
  useEffect(() => {
    if (!ready || coarsePointer) return;
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      // 冷落了一阵子，光标重新靠近她：先注意到你（抬一下头、微微一笑），再开始跟视线
      if (now - pointerRef.current.movedAt > NOTICE_IDLE_MS) {
        const head = headAnchor(true);
        if (head && Math.hypot(e.clientX - head.x, e.clientY - head.y) < NOTICE_RADIUS_PX) noticeRef.current = true;
      }
      pointerRef.current = { x: e.clientX, y: e.clientY, movedAt: now };
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [ready, coarsePointer, headAnchor]);

  // 逐帧：视线回落、心情浓度衰减、口型同步、音乐律动、打瞌睡/闲聊调度；
  // Tap/Flick/Doze 等专业动作片段播放时，motionDirector 把 Live2DStage 的让位系数淡到 0，
  // 下面这些 override/add 调用会自然失效——不需要每帧手动判断 reacting 再决定写不写
  const animateMiku = useCallback((now: number, dtSec: number) => {
      const dt = dtSec * 1000;
      const stage = stageRef.current;
      if (!stage) return;
      const { reacting } = directorRef.current.update(stage, dtSec);
      // 呼吸是永不让位的生命底噪
      breathRef.current.update(stage, dtSec);
      const rate = 1 - Math.pow(0.001, dtSec); // 与 dt 无关的指数平滑，帧率波动也不抖
      const touch = gestureRef.current.tick(now);
      const head = headAnchor();

      // 视线目标的优先级：正在被触碰的那个点 > 最近 3s 动过的指针 > 自主张望
      let target = autoTargetRef.current;
      if (touch && head) {
        target = gazeFromPoint({ x: touch.x, y: touch.y }, head);
      } else if (!coarsePointer && now - pointerRef.current.movedAt < 3000 && head) {
        target = gazeFromPoint(pointerRef.current, head);
      } else {
        lookTimerRef.current -= dt;
        if (lookTimerRef.current <= 0) {
          lookTimerRef.current = coarsePointer ? 3200 + Math.random() * 3400 : 4000 + Math.random() * 4000;
          autoTargetRef.current = {
            x: (Math.random() - 0.5) * (coarsePointer ? 1.2 : 0.9),
            y: (Math.random() - 0.5) * (coarsePointer ? 0.6 : 0.5),
          };
        }
      }
      const liveEnergy = getEnergy();
      // 情感模型：时间基线 + 正在放的歌（档案心境与实时能量按 0.7/0.3 混合）把心境点慢慢拉过去。
      // 歌的心境随段落走：整首底色 ⊕ 当前段的弧线（trackMood.moodNow）；心境点只吃词的效价，
      // 曲的效价留给下面的律动与粒子（词曲分治，docs/song-emotion-design.md §3.4）
      const mood = isPlaying ? getTrackMood(trackId) : undefined;
      trackMoodRef.current = mood;
      const playMs = getPlaybackTime() * 1000;
      const segment = mood ? segmentAt(mood.segments, playMs) : null;
      const songNow = mood ? moodNow(mood, segment) : null;
      const clock = new Date();
      // 共鸣系数（§3.5）：缺省 0.65；站主深夜连着听完几首低落的歌，她不再跟着沉，而是往温柔那边靠
      const resonance = listening.resonance({ owner: ownerRef.current, lateNight: isLateNight(clock) });
      const affectInput = {
        hour: clock.getHours() + clock.getMinutes() / 60,
        owner: ownerRef.current,
        music: isPlaying ? { valence: songNow?.faceValence ?? 0.1, arousal: songNow?.arousal ?? 0.5, feels: songNow?.feels } : null,
        liveEnergy: Math.min(1, (liveEnergy.low + liveEnergy.mid) / 2),
        resonance,
      };
      affect.step(dtSec, affectInput);
      const soundValence = songNow?.soundValence ?? affect.m.v;
      const arousal = affect.arousal01;
      const tone = affect.tone;
      // 听歌记账（只为站主）：播放态下累计时长，≥ 30s 记一次 listen；换歌时不足 30s 记 skip。
      // 一遍结束（换歌，或单曲循环从尾巴跳回开头）时，把这一遍交给听歌倾向（§3.8）
      const listen = listenRef.current;
      const looped = listen.id === trackId && isPlaying && listen.durMs > 0 && listen.pos > listen.durMs - 4000 && playMs < 4000;
      if (listen.id !== trackId || looped) {
        if (listen.id && listen.ms > 3000) {
          if (!listen.logged) voice.remember({ kind: 'skip', data: { trackId: listen.id } });
          if (ownerRef.current) {
            const passMood = getTrackMood(listen.id);
            // 只认写出来的情绪向量（人标、草稿或专辑）：VA 猜的那一维不代表他在听什么
            const written = passMood && (passMood.provenance.feels === 'manual' || passMood.provenance.feels === 'draft' || passMood.provenance.feels === 'album');
            listening.record({
              feels: written ? passMood.feels : undefined,
              felt: getTrackFelt(listen.id),
              ratio: listen.durMs > 0 ? listen.ms / listen.durMs : listen.logged ? FINISHED_RATIO : 0,
              skipped: !listen.logged,
            });
          }
        }
        listenRef.current = { id: trackId, ms: 0, logged: false, durMs: looped ? listen.durMs : 0, pos: playMs };
      } else if (isPlaying && trackId) {
        listen.pos = playMs;
        const seconds = getPlayerSnapshot().duration;
        if (seconds > 0) listen.durMs = seconds * 1000;
        listen.ms += dt;
        if (!listen.logged && listen.ms >= 30_000) {
          listen.logged = true;
          voice.remember({ kind: 'listen', data: { trackId }, tags: [trackCategory ?? '', mood?.feel ?? ''].filter(Boolean) });
        }
      }
      const lazy = target === autoTargetRef.current;
      // 怀念：自主张望时偶尔往上方远处望一会儿（20–40s 一次、1.5s，概率随怀念的浓度）
      farLookTimerRef.current -= dt;
      if (farLookTimerRef.current <= 0) {
        farLookTimerRef.current = 20000 + Math.random() * 20000;
        if (lazy && !reacting && Math.random() < tone.nostalgic * 1.4) {
          autoTargetRef.current = { x: (Math.random() - 0.5) * 0.6, y: 0.4 + Math.random() * 0.15 };
          lookTimerRef.current = 1500;
        }
      }
      // 低效价时视线基线略向下（只作用于自主张望，看你时不低头）
      const gazeTarget = lazy ? { x: target.x, y: target.y + gazeBiasY(affect.m) } : target;
      // 空灵：微扫视变稀、眨眼变慢；不安：微扫视变密；温柔：眨眼略慢
      const saccadeScale = 1 + tone.transcendence - 0.4 * tone.tense;
      blinkRef.current.waitScale = 1 + 0.6 * tone.transcendence + 0.25 * tone.tender;
      const gazePose = gaze.update(dtSec, { target: gazeTarget, arousal, lazy, calm: !!readingRef.current || !!editingRef.current, saccadeScale });

      if (noticeRef.current) {
        noticeRef.current = false;
        if (!reacting) {
          impulseRef.current.nod(1.8);
          triggerMood('happy', 0.35);
        }
      }
      const impulse = impulseRef.current.update(dtSec);

      // 抚摸跟手：头顺着手移动的方向轻轻歪过去（手速按帧衰减，手停下头就慢慢回正）。
      // 手速按「脸半径」归一后再 tanh 软饱和——桌面端头只有 ~31px 宽，用绝对 px 量纲会时有时无。
      const hv = handVelRef.current;
      const decay = Math.exp(-dtSec / 0.14);
      hv.x *= decay;
      hv.y *= decay;
      const r = head?.r ?? 16;
      const stroking = touch?.kind === 'stroke';
      const onHead = touch?.zone === 'head';
      const leanGain = stroking ? (onHead ? 1 : 0.4) : 0;
      const velUnit = r * 0.025; // 约每帧扫过 0.4 个脸半径算「满速」
      const leanX = leanXRef.current.step(Math.tanh(hv.x / velUnit) * leanGain, 0.18, dtSec);
      const leanY = leanYRef.current.step(Math.tanh(-hv.y / velUnit) * leanGain, 0.18, dtSec);
      const holdHead = !!touch && onHead && (touch.kind === 'hold' || touch.kind === 'stroke');
      // 「被摸的深度」：一摸上去就先有三成（立刻有反应），之后按路程（以脸半径计）慢慢加深
      const depthGoal = !touch ? 0
        : touch.kind === 'stroke' ? (onHead ? Math.max(0.35, Math.min(1, touch.path / (r * STROKE_FULL_R))) : Math.min(0.8, touch.path / (r * STROKE_FULL_R * 1.4)))
        : touch.kind === 'hold' ? Math.min(1, (now - touch.startT) / 1600)
        : 0;
      const depth = strokeDepthRef.current.step(depthGoal, touch ? 0.22 : 0.7, dtSec);

      // 拽马尾：物理之后叠加；头被辫子轻轻带过去一点，用力拽过头才吃痛
      const tail = tailRef.current;
      stage.setPostPhysics(tail.update(dtSec, stage.paramRange));
      const tug = tail.offset;
      if (touch?.kind === 'pull' && tail.stretch > PAIN_THRESHOLD && !painedRef.current) {
        painedRef.current = true;
        impulseRef.current.touch('body', { x: -Math.sign(tug), y: 0.2 }, now, 0.6);
        triggerMood('pained', 0.7);
        affect.nudge(-0.05, 0.05);
      }

      const pose: Partial<Record<PoseParam, number>> = {};
      const addPose = (src: Partial<Record<PoseParam, number>>) => {
        for (const key in src) {
          const id = key as PoseParam;
          pose[id] = (pose[id] ?? 0) + (src[id] ?? 0);
        }
      };
      addPose(gazePose);
      addPose(impulse.pose);
      addPose({
        // 抚摸：头顶顺着手走的方向歪（≤6°）、微微低头迎着手（≤2.5°）；马尾：头被带过去 ≤2.5°
        ParamAngleZ: (leanX * 6 + tug * 2.5) * TILT_SIGN,
        ParamAngleX: leanX * 3 + tug * 1.2,
        // 不甘：下巴微抬（≤2°）
        ParamAngleY: leanY * 3 - (holdHead ? 2.5 * depth : 0) - Math.abs(tug) * 1 + 2 * tone.defiant,
        ParamBodyAngleZ: leanX * 1.2 * TILT_SIGN,
      });
      stage.setPose(pose);

      // 眨眼 × 冲量眯眼 × 被摸时渐渐眯起；以较低 floor 让专门的闭眼演出仍可接管
      const face = faceFor(affect.m, affect.emotion, tone);
      const v = valsRef.current;
      v.eyeOpen += (face.eyeOpen - v.eyeOpen) * rate;
      // 副歌预备：眼睛微微睁大、眉毛轻扬（prep 0..1，副歌前 1.2s 升起，进副歌后 2s 内落回）
      const chorus = chorusRef.current;
      const prep = chorus.prep.x;
      const eye = blinkRef.current.update(dtSec) * impulse.eyeOpen * Math.min(1, v.eyeOpen + 0.08 * prep) * (1 - 0.5 * (holdHead ? depth : 0));
      stage.overrideParam('ParamEyeLOpen', eye, 0.25);
      stage.overrideParam('ParamEyeROpen', eye, 0.25);

      // 情绪：正在被摸/按着时由触碰持续供给浓度——抚摸按路程、长按按时长，越摸越深（feel 同类取较大者）
      if (touch && (touch.kind === 'hold' || touch.kind === 'stroke')) {
        affect.feel(touch.zone === 'head' || touch.zone === 'twintail' ? 'shy' : 'happy', depth);
        if (touch.kind === 'stroke' && onHead) {
          const mark = STROKE_HEART_MARKS_R[heartMarkRef.current];
          if (mark !== undefined && touch.path >= mark * r) {
            heartMarkRef.current += 1;
            emit('hearts', null, { count: 1 });
          }
        }
      }

      const spectrum = isPlaying ? getSpectrum(4) : [];
      const energy = liveEnergy;
      const lip = lipRef.current.update(
        dtSec,
        isPlaying ? getActiveLyric() : null,
        isPlaying ? energy.mid : 0,
        trackCategory === 'Miku',
        speakingOpen(speechRef.current, now),
      );
      stage.overrideParam('ParamMouthOpenY', lip.open);

      // 面部 = VA 四角预设的双线性插值 ⊕ 情绪色调偏移 ⊕ 情绪叠加（affect.faceFor）；这里只负责按帧平滑逼近
      v.eyeSmile += (face.eyeSmile - v.eyeSmile) * rate;
      v.cheek += (face.cheek - v.cheek) * rate;
      stage.overrideParam('ParamEyeLSmile', v.eyeSmile, EMOTION_YIELD_FLOOR);
      stage.overrideParam('ParamEyeRSmile', v.eyeSmile, EMOTION_YIELD_FLOOR);
      stage.overrideParam('ParamCheek', v.cheek, EMOTION_YIELD_FLOOR);

      // 眉毛：脸部辨识度最高的部件，之前完全没接入心情系统，表情只靠眼笑+脸红撑着
      v.browY += (face.browY - v.browY) * rate;
      v.browAngle += (face.browAngle - v.browAngle) * rate;
      v.browForm += (face.browForm - v.browForm) * rate;
      // 冲量的「挑眉」与副歌预备的眉扬叠在心情眉高之上：先跳起来，再回到心情决定的位置
      const browLift = impulse.browLift + 0.2 * prep;
      stage.overrideParam('ParamBrowLY', v.browY + browLift, EMOTION_YIELD_FLOOR);
      stage.overrideParam('ParamBrowRY', v.browY + browLift, EMOTION_YIELD_FLOOR);
      stage.overrideParam('ParamBrowLAngle', v.browAngle, EMOTION_YIELD_FLOOR);
      stage.overrideParam('ParamBrowRAngle', v.browAngle, EMOTION_YIELD_FLOOR);
      stage.overrideParam('ParamBrowLForm', v.browForm, EMOTION_YIELD_FLOOR);
      stage.overrideParam('ParamBrowRForm', v.browForm, EMOTION_YIELD_FLOOR);

      const mouthFormTarget = Math.max(-1, Math.min(1, face.mouthForm + lip.form));
      v.mouthForm += (mouthFormTarget - v.mouthForm) * rate;
      stage.overrideParam('ParamMouthForm', v.mouthForm, EMOTION_YIELD_FLOOR);

      // 音乐律动：包络与振荡器分离的节拍引擎（见 rhythmEngine.ts）——摆幅只吃平滑后的能量包络，
      // 不吃逐帧抖动的原始频谱值；频率恒定推进，检测到鼓点时只是「软推」相位而不是硬切。
      // 叠加（而非取代）在 Idle/Tap 等动作片段自己的曲线之上，交给头发物理去接住这份节拍感
      // 风格按情绪色调的权重混合（档案没加载时退回按歌手分类）；周期锁曲目 bpm；摆幅 = 唤醒度 × 副歌系数（A3/A9.4）
      const bass = isPlaying ? (spectrum[0] ?? 0) : 0;
      // 换段：前后两段的色调目标差得够多（弧线写了这一段多了什么）才算「情绪转了」，交给台词与粒子规则（P4 写规则）。
      // 同一首里才比；换歌、刚开始播放都只记下不发
      const segState = segmentRef.current;
      const segFeels = isPlaying ? songNow?.feels : undefined;
      let arcTurned = false;
      if (segState.trackId === trackId && segment && segState.seg && segment.index !== segState.seg.index && segFeels && segState.feels) {
        arcTurned = toneDistance(toneTarget(segState.feels), toneTarget(segFeels)) > ARC_TURN_MIN;
      }
      segmentRef.current = { trackId: isPlaying ? trackId : undefined, seg: segment, feels: segFeels };
      const arcSpoke = arcTurned && !reacting && speak('arc-turn');
      const nextChorus = isPlaying && mood ? chorusState(mood.sections, playMs) : null;
      if (nextChorus === 'in' && chorus.state !== 'in' && !reacting) {
        // 副歌首拍：一次小绽放（对比越大越盛）+ 轻点一下头；情绪转向那一下已经回应过了，这里就不再开口
        emit('bloom', null, { energy: 0.4 + 0.6 * (mood?.contrast ?? 0.5), color: trackCategory === 'Miku' ? undefined : trackColor });
        impulseRef.current.nod(1.2);
        if (!arcSpoke) speak('chorus');
      }
      chorus.state = nextChorus;
      chorus.prep.step(nextChorus === 'soon' ? 1 : 0, nextChorus === 'soon' ? 0.25 : 0.6, dtSec);
      // 摆幅跟曲的明暗走（词曲分治）：曲亮的歌晃得开一点
      const gainGoal = isPlaying ? rhythmGain(arousal, nextChorus === 'in', mood?.contrast ?? 0.5) * soundLift(soundValence) : 1;
      // 进副歌约 0.3s 放大到位，出副歌 2s 内缓回
      chorus.gain.step(gainGoal, gainGoal > chorus.gain.x ? 0.3 : 0.6, dtSec);
      const style = (mood && blendRhythm(tone)) || profileForCategory(trackCategory);
      const rhythm = rhythmRef.current.update(dtSec, bass, style, { bpm: mood?.bpm, gain: chorus.gain.x });
      stage.addParam('ParamAngleZ', rhythm.headZ);
      stage.addParam('ParamBodyAngleZ', rhythm.bodyZ);
      stage.addParam('ParamAngleX', rhythm.headX);
      // 副歌预备的「吸一口气」：头微微抬起
      stage.addParam('ParamAngleY', rhythm.nod + 2 * prep);

      // 手臂整段接管（overrideParam，不是叠加）：常态是一个很轻的呼吸态微动，幅度只有 ±0.06，
      // 相位恒速推进、不随音乐能量变化——安静时也该有这一点点存在感，而不是又变回一动不动。
      // 唱歌且能量过了软阈值时，再叠一层装饰性的音乐涟漪上去（energy < 0.08 时这层贡献为 0）；
      // 刻意用手臂自己的相位而非节拍引擎的相位——手臂只是轻轻跟着晃，不需要真的卡拍
      armPhaseRef.current += dtSec;
      const armL = Math.sin(armPhaseRef.current * ((Math.PI * 2) / 4.7)) * 0.06;
      const armR = Math.sin(armPhaseRef.current * ((Math.PI * 2) / 5.3) + 0.9) * 0.055;
      const armEnvelope = smoothstep(0.08, 0.35, rhythm.energy);
      stage.overrideParam('ParamArmL', armL + Math.sin(armPhaseRef.current * 2.1) * armEnvelope * 0.15);
      stage.overrideParam('ParamArmR', -(armR + Math.sin(armPhaseRef.current * 1.9 + 0.4) * armEnvelope * 0.15));

      // 播放中的粒子跟拍：只在鼓点「上升沿」发，冷却随唤醒度缩短（安静的歌 2.6s 一颗、燃的歌 1s）。
      // 唱她自己的歌冒音符；别人的歌只飘曲目色的光点，而且更稀——满屏她的音符会显得答非所问。
      noteTimerRef.current -= dt;
      const beatEdge = liveEnergy.beat > 0.6 && !beatHighRef.current;
      beatHighRef.current = liveEnergy.beat > 0.45;
      if (isPlaying && beatEdge) {
        const own = trackCategory === 'Miku';
        // 强拍点头：雀跃 / 奇妙 / 燃占上风的歌里，一次很小的冲量
        if (mood && beatNodAffinity(tone) > 0.4 && liveEnergy.beat > 0.75 && !reacting) impulseRef.current.nod(0.7);
        if (noteTimerRef.current <= 0 && (own || Math.random() < 0.4)) {
          noteTimerRef.current = (particleCooldown(arousal) / soundLift(soundValence)) * 1000 * (0.8 + Math.random() * 0.4);
          // 种类按情绪色调的权重抽：混合情绪的歌，粒子也是混着的
          const feel = mood ? sampleTone(tone, Math.random()) : null;
          const kind = feel ? particleForFeel(feel, own) : own ? 'notes' : 'motes-up';
          // 色温跟曲（词曲分治）：曲调明亮的歌，光点偏暖
          emit(kind, null, { count: 1, energy: arousal, valence: soundValence, color: own ? undefined : trackColor });
        }
      }

      // 季节夜：不放歌的夜里偶尔一点季节的小东西——夏夜萤光、春天樱瓣、冬天雪尘（秋天留白）。
      // 播放中：歌的意象（雨丝、海的气泡、花瓣、月下萤火、雪）优先，没有可画的意象再按歌的季节。
      seasonTimerRef.current -= dt;
      if (seasonTimerRef.current <= 0) {
        const imageryKind = isPlaying ? imageryParticle(mood?.imagery) : null;
        // 意象比季节勤一点：一场雨隔十秒落一丝，看不出是雨
        seasonTimerRef.current = imageryKind ? 4500 + Math.random() * 3500 : 7000 + Math.random() * 6000;
        const hour = clock.getHours();
        const night = hour >= 19 || hour < 5;
        // 播放中跟歌的季节意象走（档案 season）；不放歌时只在夜里、跟着真实节气走
        const season = isPlaying ? mood?.season : night ? currentSeason() : undefined;
        if ((imageryKind || season) && !reacting && !document.hidden) {
          const kind: EmitKind | null = imageryKind
            ?? (season === 'summer' ? (night ? 'firefly' : null) : season === 'spring' ? 'petals' : season === 'winter' ? 'snow' : null);
          if (kind) emit(kind, null, kind === 'rain' || kind === 'bubbles' ? {} : { count: 1 });
        }
      }

      // 打瞌睡：深夜常态里偶尔真的睡过去，或听歌听到入神时安心闭一下眼——由这里主动调度，
      // 不再混进随机待机池，所以不会再出现「不知道为什么突然闭眼很久」的情况
      dozeTimerRef.current -= dt;
      if (dozeTimerRef.current <= 0) {
        dozeTimerRef.current = 40000 + Math.random() * 50000;
        if (!reacting) {
          const shouldDoze = isLateNight() ? Math.random() < 0.55 : (isPlaying && Math.random() < 0.12);
          if (shouldDoze) {
            directorRef.current.play(stage, 'Doze', undefined, { reactMs: 2500 });
            triggerMood('sleepy', 1);
            emit('zzz');
            window.setTimeout(() => speak('doze'), 250);
          }
        }
      }

      // 闲聊：没人理她、也没在放歌的时候，隔一阵子会自己嘟囔一句——不是回应，只是「在场」。
      // 阅读舱开着时换一套安静的「旁白」语气、间隔也拉长，别打断你读东西；编辑器开着则完全噤声
      // （只在 mikuSignal 的 editor-open 那一刻说一句就够了，见上面的信号监听 effect）
      idleChatterTimerRef.current -= dt;
      if (idleChatterTimerRef.current <= 0) {
        // 只是「试着说」：真正的间隔与每小时上限由话量调控决定（站主 90s、访客 150s、阅读 ×2、写作静音）
        idleChatterTimerRef.current = 30000 + Math.random() * 40000;
        if (!reacting && !isPlaying && !document.hidden) speak(readingRef.current ? 'reading-idle' : 'idle', {}, 5000);
      }

      if (import.meta.env.DEV) {
        debugRef.current = {
          m: { ...affect.m }, tone: { ...affect.tone }, target: affect.target(affectInput),
          emotion: affect.emotion ? { ...affect.emotion } : null,
          arousal01: arousal, owner: ownerRef.current, trackId: isPlaying ? trackId : undefined, mood,
          chorus: chorus.state, segment, arc: songNow?.arc ?? null,
          feelsNow: songNow?.feels, faceValence: songNow?.faceValence, soundValence: songNow?.soundValence,
          rhythmGain: chorus.gain.x, zone: touch ? `${touch.kind}·${touch.zone}` : null,
          resonance, lean: listening.sessionLean, lowStreak: listening.lowStreak,
          felt: ownerRef.current ? getTrackFelt(trackId) : undefined,
          line: lastLineRef.current,
        };
      }
  }, [isPlaying, trackId, trackCategory, trackColor, getSpectrum, getEnergy, stageRef, coarsePointer, speak, triggerMood, headAnchor, gaze, emit, affect, voice, listening]);

  // 并入全站唯一 ticker：隐藏页暂停、触屏 30fps、能量采样顺序都由同一处保证。
  useTicker(animateMiku, ready && !reduceMotion && !paused);

  const handlePointerDown = useCallback((clientX: number, clientY: number, rect: DOMRect) => {
    const stage = stageRef.current;
    if (!stage) return;
    // 优先走 drawable 精确命中（真实还原头/辫子/身体/裙摆的实际网格形状，含 X 轴）；
    // 命中列表为空（点在网格缝隙里，或换了套没有这些 drawable 命名的模型）才退回几何分带兜底
    const hits = stage.hitTestDrawables(clientX, clientY);
    const drawableZone = classifyDrawableHits(hits);
    let zone: TouchZone;
    if (drawableZone) {
      zone = drawableZone;
    } else {
      const fracY = (clientY - rect.top) / rect.height;
      const fracX = (clientX - rect.left) / rect.width;
      const inHeadBand = Math.abs(fracX - 0.5) < 0.24;
      zone = fracY >= HEM_FRAC ? 'hem' : fracY < HEAD_FRAC && inHeadBand ? 'head' : 'body';
    }
    const now = performance.now();
    gestureRef.current.down(clientX, clientY, now, zone);
    // 任何按下：触点处一圈初音绿细环——「我碰到你了」最直接的回应
    particlesRef.current?.emit('ripple', { x: clientX, y: clientY });
    dustPathRef.current = 0;
    handVelRef.current = { x: 0, y: 0, at: now };
    heartMarkRef.current = 0;
    painedRef.current = false;

    // 按下这一帧就有反应：往远离触点的方向一缩、眯一下眼——不再等松手后的 Tap 动作片段
    const head = headAnchor(true);
    if (head) {
      impulseRef.current.touch(zone, { x: (clientX - head.x) / head.r, y: (head.y - clientY) / head.r }, now);
    }
    if (zone === 'twintail') {
      // _00 是她的右马尾（屏幕左）。drawable 名（D_HAIR_BACK_07…26）里不带 00/10，按触点在脸的哪一侧判断
      const side: TailSide = head && clientX < head.x ? '00' : '10';
      tailRef.current.start(side);
    }
  }, [stageRef, headAnchor, particlesRef]);

  const handlePointerMove = useCallback((clientX: number, clientY: number) => {
    const now = performance.now();
    const s = gestureRef.current.move(clientX, clientY, now);
    if (!s) return;
    // 手速：按事件间隔归一化后平滑，逐帧循环里再按帧衰减——手停下来，头就慢慢回正
    const hv = handVelRef.current;
    const span = Math.max(8, now - hv.at);
    hv.x += (s.stepX / span - hv.x) * 0.35;
    hv.y += (s.stepY / span - hv.y) * 0.35;
    hv.at = now;
    if (s.kind === 'pull') {
      const head = headAnchor();
      if (head) tailRef.current.drag((clientX - s.startX) / (head.r * PULL_UNIT_R));
    }
    if (s.kind === 'stroke' && s.path - dustPathRef.current >= 18) {
      dustPathRef.current = s.path;
      // 光尘色温跟着心境效价走，摸头时再暖一点
      particlesRef.current?.emit('dust', { x: clientX, y: clientY, valence: affect.m.v + (s.zone === 'head' ? 0.3 : 0) });
    }
  }, [headAnchor, particlesRef, affect]);

  // 触屏上按住她再划走页面，浏览器发的是 pointercancel 而不是 pointerup——
  // 不清掉手势的话，逐帧循环里「触碰接管心情」那段会把她锁死在害羞状态出不来
  const handlePointerCancel = useCallback(() => {
    gestureRef.current.cancel();
    tailRef.current.release();
  }, []);

  // 拍头里程碑（20 / 50 / 100 次）与稀有彩蛋：等 Tap 动作和那一句回应演完再说，所以绕过 4s 回应冷却
  const afterPat = useCallback((next: number) => {
    if (next === 20 || next === 50 || next === 100) {
      voice.remember({ kind: 'milestone', data: { pats: next } });
      window.setTimeout(() => {
        triggerMood(next === 100 ? 'happy' : 'surprised', 1);
        milestone('burst');
        // 拍满百次是最郑重的一档，樱瓣专属留给它——花瓣是「落下来」的郑重，跟「炸开」拉开区分
        if (next === 100) window.setTimeout(() => milestone('petals'), 500);
        speak('milestone', { patsTotal: next }, next === 100 ? 7000 : 6000, true);
      }, 4200);
    } else if (next > 5 && Math.random() < 0.015) {
      window.setTimeout(() => { triggerMood('surprised', 1); speak('rare', {}, 6000, true); }, 4200);
    }
  }, [milestone, triggerMood, speak, voice]);

  const handlePointerUp = useCallback((clientX: number, clientY: number) => {
    const s: GestureState | null = gestureRef.current.up(clientX, clientY, performance.now());
    tailRef.current.release();
    const stage = stageRef.current;
    if (!s || !stage) return;
    const zone = s.zone;

    if (s.kind === 'swipe') {
      directorRef.current.play(stage, 'Flick', s.upward ? 0 : 1, { reactMs: 3200, priority: 3 });
      triggerMood('happy', 0.8);
      speak('swipe', { zone }, 3800);
      return;
    }

    if (s.kind === 'pull') {
      // 松手那一刻马尾自己「啵」地弹回去；拽疼了的话（情绪是 pained）规则会换成抱怨
      speak('pull', { zone }, 3600);
      return;
    }

    if (s.kind === 'stroke') {
      // 抚摸是逐帧跟手的，松手不再补一段 Tap 动作打断它；摸得够久才算一次「摸头」计入亲密度
      if (s.path < 60) return;
      if (zone === 'head') {
        const next = patCount();
        affect.nudge(0.06);
        affect.nudgeTone('tender', 0.1);
        voice.remember({ kind: 'pat', data: { gesture: 'stroke' } });
        speak('stroke', { zone }, 3800);
        afterPat(next);
      } else {
        speak('stroke', { zone }, 3800);
      }
      return;
    }

    if (s.kind === 'hold') {
      // 长按期间的心情浓度已经在逐帧循环里累加过了，松手只需收尾一句话
      speak('hold', { zone }, 3800);
      if (zone === 'head') emit('hearts', null, { count: 3 });
      else if (zone === 'twintail') emit('notes', null, { count: 2 });
      return;
    }

    // tap：连续快速点按，这个时间窗内命中够多次，就从「宠溺」切换成「有点不耐烦」——
    // 判定放在亲密度计数之前：连击本身不算数，也就不会把恰好撞上的里程碑顶掉
    const now = performance.now();
    comboRef.current = [...comboRef.current.filter((t) => now - t < COMBO_WINDOW_MS), now];
    if (comboRef.current.length >= COMBO_THRESHOLD) {
      comboRef.current = [];
      directorRef.current.play(stage, 'Tap', 1, { reactMs: 3100, priority: 3 });
      triggerMood('annoyed', 1);
      affect.nudge(-0.08, 0.05);
      speak('combo', { zone }, 3400, true);
      return;
    }

    directorRef.current.play(stage, 'Tap', zone === 'head' || zone === 'twintail' ? 0 : 1, { reactMs: 3100, priority: 3 });
    triggerMood('shy', 1);
    // 只有拍头算进亲密度（戳身体、碰裙摆不算「摸头」）
    const next = zone === 'head' ? patCount() : 0;
    if (zone === 'head') {
      affect.nudge(0.04);
      affect.nudgeTone('tender', 0.1);
      voice.remember({ kind: 'pat', data: { gesture: 'tap' } });
      emit('hearts', null, { count: 3 });
    } else if (zone === 'twintail') {
      emit('notes', null, { count: 2 });
    }
    // 轻拍约一半出字（规则的 chance），另一半只用表情与粒子回应
    speak('tap', { zone }, 3800);
    if (next) afterPat(next);
  }, [stageRef, emit, triggerMood, speak, patCount, afterPat, affect, voice]);

  /** 悬停命中（节流 80ms）：返回 undefined 表示「这次没测，沿用上次」 */
  const hoverAtRef = useRef(0);
  const hoverZone = useCallback((clientX: number, clientY: number): TouchZone | null | undefined => {
    const now = performance.now();
    if (now - hoverAtRef.current < 80) return undefined;
    hoverAtRef.current = now;
    const hits = stageRef.current?.hitTestDrawables(clientX, clientY);
    return hits ? classifyDrawableHits(hits) : null;
  }, [stageRef]);

  /** 被拎着拖动：按水平速度（px/s）倾斜身体 */
  const carry = useCallback((vx: number) => impulseRef.current.carry(vx), []);
  /** 放下：回正带一点回冲，再轻点一下头 */
  const land = useCallback(() => impulseRef.current.land(), []);

  return { bubble, bubbleId, bubbleMood, hush, hoverZone, debugRef, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, carry, land };
};
