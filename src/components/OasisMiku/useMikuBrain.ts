// 🧠 Miku 的「大脑」：视线跟随、点击/长按/滑动反应、心情浓度的连续过渡，以及按上下文挑台词。
//   刻意避免与模型自带的专业动作片段打架——Tap/Flick/Doze 播放时，这里的表情混合全程让位。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { MikuStageHandle } from './Live2DStage';
import type { AppView } from '../../types/auth';
import type { MusicCategory } from '../../types/music';
import { currentPeriod, isLateNight } from '../../lib/timeContext';
import { termNoteOfDay } from '../../lib/solarTerms';
import { onMikuSignal } from '../../lib/mikuSignal';
import {
  MIKU_GREETINGS, MIKU_GREETINGS_FAMILIAR, MIKU_GREETINGS_CLOSE, MIKU_GREETINGS_DEEP,
  MIKU_TOUCH_HEAD_LINES, MIKU_TOUCH_HEAD_LINES_CLOSE, MIKU_TOUCH_HEAD_LINES_DEEP, MIKU_LONGPRESS_HEAD_LINES,
  MIKU_TOUCH_BODY_LINES, MIKU_TOUCH_HEM_LINES, MIKU_TWINTAIL_LINES, MIKU_FLICK_LINES, MIKU_COMBO_LINES,
  MIKU_SING_LINES, MIKU_SING_LINES_BY_ARTIST, MIKU_SING_LINES_BY_TRACK,
  MIKU_DOZE_LINES, MIKU_MUSING_LINES, MIKU_READING_LINES, MIKU_VIEW_LINES,
  MIKU_UNLOCK_LINES, MIKU_UNLOCK_LINES_DEEP, MIKU_RARE_LINES, mikuDateLine,
  MIKU_WELCOME_BACK_LINES, MIKU_COPY_LINES, MIKU_WRITING_LINES, MIKU_PUBLISH_LINES, MIKU_SEDENTARY_LINES,
} from '../../data/mikuLines';

type Mood = 'neutral' | 'happy' | 'shy' | 'sleepy' | 'surprised' | 'annoyed';
// 命中区域：头部 / 双马尾 / 躯干（含手臂）/ 裙摆与腿部——优先走 drawable 精确命中（见 classifyDrawableHits），
// 只有点在网格缝隙里（命中列表为空）时才退回下面这套按容器比例校准的几何分带兜底
type TouchZone = 'head' | 'twintail' | 'body' | 'hem';

// drawable ID 前缀 → 分区，对应当前模型（miku_sample_t04）实际的 drawable 命名；换一具模型这套前缀对不上
// 也不会报错，只是 classifyDrawableHits 总返回 null，静默退回几何兜底
const HEAD_ID_PREFIXES = ['D_FACE_', 'D_EYE_', 'D_BROW_', 'D_MOUTH_', 'D_NOSE_', 'D_CHEEK_', 'D_HEADSET_', 'D_HAIR_FRONT_', 'D_NECK_'];
const TWINTAIL_ID_PREFIX = 'D_HAIR_BACK';
const BODY_ID_PREFIXES = ['D_BODY_', 'D_ARM_'];
const HEM_ID_PREFIX = 'D_LEG_';

// 按 头 > 双马尾 > 躯干 > 裙摆 的优先级取第一个命中的桶——发丝经常飘到躯干/裙摆的包围盒里，
// 但只要同时命中了头部相关网格，体验上仍应算「摸到头/摸到辫子」而不是身体
const classifyDrawableHits = (hits: string[]): TouchZone | null => {
  if (hits.some((id) => HEAD_ID_PREFIXES.some((p) => id.startsWith(p)))) return 'head';
  if (hits.some((id) => id.startsWith(TWINTAIL_ID_PREFIX))) return 'twintail';
  if (hits.some((id) => BODY_ID_PREFIXES.some((p) => id.startsWith(p)))) return 'body';
  if (hits.some((id) => id.startsWith(HEM_ID_PREFIX))) return 'hem';
  return null;
};

const MOOD_TARGETS: Record<Mood, { eyeSmile: number; cheek: number; mouthForm: number; browY: number; browAngle: number; browForm: number }> = {
  neutral:   { eyeSmile: 0.12, cheek: 0.05, mouthForm: 0.1,  browY: 0,    browAngle: 0,     browForm: 0 },
  happy:     { eyeSmile: 0.5,  cheek: 0.18, mouthForm: 0.5,  browY: 0.25, browAngle: 0.15,  browForm: 0.3 },
  shy:       { eyeSmile: 0.6,  cheek: 0.6,  mouthForm: 0.2,  browY: 0.1,  browAngle: -0.1,  browForm: 0.1 },
  sleepy:    { eyeSmile: 0.35, cheek: 0.1,  mouthForm: -0.1, browY: -0.2, browAngle: 0,     browForm: -0.1 },
  surprised: { eyeSmile: 0.15, cheek: 0.15, mouthForm: 0.35, browY: 0.5,  browAngle: 0.3,   browForm: 0.4 },
  annoyed:   { eyeSmile: 0.05, cheek: 0.2,  mouthForm: -0.3, browY: -0.3, browAngle: -0.4,  browForm: -0.3 },
};

// 心情不是开关，是会衰减的浓度：半衰期 45s，此后自然退回「常态」（深夜是 sleepy，其余是 neutral）
const MOOD_HALF_LIFE_MS = 45000;
const BUBBLE_MS = 5200;
const RECENT_LINE_MEMORY = 5;
// 摸头/戳一下都算「按住」，超过这个时长才算长按，而不是快速点按
const LONG_PRESS_MS = 260;
const SWIPE_DIST_PX = 28;
// 头部只占容器高度的前 ~20%（她是全身立绘，不是半身像）；0.62 以下算裙摆与腿
const HEAD_FRAC = 0.2;
const HEM_FRAC = 0.62;
// 连续点按：这个时间窗内命中这么多次，就从「宠溺」切换成「有点不耐烦」
const COMBO_WINDOW_MS = 1500;
const COMBO_THRESHOLD = 3;

// 最近说过的几句记在这，池子够大时优先挑没说过的，避免连续撞句
const pickFresh = <T,>(arr: readonly T[], recent: T[]): T => {
  const fresh = arr.filter((item) => !recent.includes(item));
  const pool = fresh.length ? fresh : arr;
  return pool[Math.floor(Math.random() * pool.length)];
};

// 亲密度分层取词：pools[0] 是默认档，pools[1..3] 对应 20/50/100 次拍过的解锁池。
// 档位越高命中概率越大，但不是硬切换——即使拍满 100 次也不是每次都触发最深那句，
// 留一点「其实还是老样子」的松弛感，也避免同一句被说腻。命中的档位为空池时顺延往下找。
const pickTiered = (tier: number, pools: (readonly string[] | undefined)[], recent: string[]): string | null => {
  for (let t = Math.min(tier, pools.length - 1); t >= 1; t--) {
    const p = pools[t];
    if (p?.length && Math.random() < 0.3 + t * 0.1) return pickFresh(p, recent);
  }
  const base = pools[0];
  return base?.length ? pickFresh(base, recent) : null;
};

interface UseMikuBrainOptions {
  stageRef: RefObject<MikuStageHandle | null>;
  ready: boolean;
  view: AppView;
  isPlaying: boolean;
  trackId: string | undefined;
  trackCategory: MusicCategory | undefined;
  getSpectrum: (bars: number) => number[];
  coarsePointer: boolean;
  /** 尊重 prefers-reduced-motion：画布本身已冻结渲染，这里同步停掉自主动作调度，
   *  不然会出现「人物纹丝不动却突然弹出一句话」的割裂感 */
  reduceMotion: boolean;
}

export const useMikuBrain = ({
  stageRef, ready, view, isPlaying, trackId, trackCategory, getSpectrum, coarsePointer, reduceMotion,
}: UseMikuBrainOptions) => {
  const [bubble, setBubble] = useState<string | null>(null);
  const bubbleTimer = useRef<number | null>(null);
  const recentLinesRef = useRef<string[]>([]);
  const moodRef = useRef<{ mood: Mood; intensity: number }>({ mood: 'neutral', intensity: 0 });
  const valsRef = useRef({ eyeSmile: 0, cheek: 0, mouthForm: 0, mouth: 0, browY: 0, browAngle: 0, browForm: 0, swayEnergy: 0 });
  const swayPhaseRef = useRef(0);
  const lastViewRef = useRef<AppView | null>(null);
  const lastTrackRef = useRef<string | undefined>(undefined);
  const lookTimerRef = useRef(0);
  const dozeTimerRef = useRef(20000 + Math.random() * 20000);
  const idleChatterTimerRef = useRef(70000 + Math.random() * 50000);
  const pointerRef = useRef({ x: 0, y: 0, movedAt: 0 });
  const pressRef = useRef<{ zone: TouchZone; startX: number; startY: number; startT: number } | null>(null);
  const comboRef = useRef<number[]>([]);
  // 模型自带的每段动作片段（Idle/Tap/Flick/Doze/FlickUp）在 model3.json 里都标了 Loop:true，
  // 播放后会一直循环、永远不触发「播完」，Cubism 自己的 currentPriority 因此不会自然回落——
  // 不能拿它判断「专业动作片段是否正在演出」，只能自己按时间窗记：每次显式播放一段动作，
  // 记下「大约还要演多久」，窗口内表情混合/自主发言让位，窗口一过就当它已经进入循环底噪、收回控制权
  const reactingUntilRef = useRef(0);
  // 阅读舱/编辑器开着与否——由 OasisGallery 通过 mikuSignal 通知，闲聊调度据此换池/静音
  const readingRef = useRef(false);
  const editingRef = useRef(false);
  const hiddenAtRef = useRef<number | null>(null);
  const sedentaryMsRef = useRef(0);
  const sedentaryFiredRef = useRef(false);

  const say = useCallback((text: string, ms = BUBBLE_MS) => {
    setBubble(text);
    recentLinesRef.current = [text, ...recentLinesRef.current].slice(0, RECENT_LINE_MEMORY);
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
  }, []);

  // 每次显式播放一段专业动作片段时调用，标记「未来这段时间算作正在演出」
  const markReacting = useCallback((ms: number) => { reactingUntilRef.current = performance.now() + ms; }, []);
  const isCurrentlyReacting = useCallback(() => performance.now() < reactingUntilRef.current, []);

  const sayFresh = useCallback((pool: readonly string[], ms?: number) => {
    if (!pool.length) return;
    say(pickFresh(pool, recentLinesRef.current), ms);
  }, [say]);

  const sayTiered = useCallback((tier: number, pools: (readonly string[] | undefined)[], ms?: number) => {
    const line = pickTiered(tier, pools, recentLinesRef.current);
    if (line) say(line, ms);
  }, [say]);

  const triggerMood = useCallback((mood: Mood, intensity = 1) => {
    moodRef.current = { mood, intensity };
  }, []);

  const patCount = useCallback(() => {
    try {
      const next = Number(localStorage.getItem('oasis_miku_pats') ?? '0') + 1;
      localStorage.setItem('oasis_miku_pats', String(next));
      return next;
    } catch {
      return 0; // 隐私模式等场景 localStorage 不可用，亲密度不是刚需，静默降级
    }
  }, []);

  // 亲密度档位：0（默认）/ 1（20+）/ 2（50+）/ 3（100+），对应 pickTiered 的 pools 下标
  const patTier = useCallback((): 0 | 1 | 2 | 3 => {
    try {
      const pats = Number(localStorage.getItem('oasis_miku_pats') ?? '0');
      return pats >= 100 ? 3 : pats >= 50 ? 2 : pats >= 20 ? 1 : 0;
    } catch {
      return 0;
    }
  }, []);

  // 打招呼：模型就绪后先抬头做个出场动作，再按纪念日/时段/节气/熟识度问候一句
  // （延后一拍再开口，而非在 effect 里同步 setState：既避开级联渲染，也让她先把出场动画站稳再说话）
  useEffect(() => {
    if (!ready) return;
    moodRef.current = { mood: isLateNight() ? 'sleepy' : 'neutral', intensity: 1 };
    const t1 = window.setTimeout(() => { if (!reduceMotion) { stageRef.current?.playMotion('FlickUp'); markReacting(2200); } }, 200);
    const t2 = window.setTimeout(() => {
      const dateLine = mikuDateLine();
      if (dateLine && Math.random() < 0.7) {
        triggerMood('happy', 1);
        say(dateLine, 6500);
        return;
      }
      if (Math.random() < 0.35) { say(termNoteOfDay()); return; }
      const period = currentPeriod();
      sayTiered(patTier(), [MIKU_GREETINGS[period], MIKU_GREETINGS_FAMILIAR[period], MIKU_GREETINGS_CLOSE[period], MIKU_GREETINGS_DEEP[period]]);
    }, 550);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // 视图切换：进入星图/灯笼/画廊等场所时轻声搭一句话
  useEffect(() => {
    if (!ready) return;
    if (lastViewRef.current === null) { lastViewRef.current = view; return; }
    if (lastViewRef.current === view) return;
    lastViewRef.current = view;
    const lines = MIKU_VIEW_LINES[view];
    if (!lines || Math.random() >= 0.6) return;
    const t = window.setTimeout(() => sayFresh(lines), 300);
    return () => window.clearTimeout(t);
  }, [view, ready, sayFresh]);

  // 曲目切换：换歌时哼一句，认得出是谁的歌就用对应台词池，顺带进入哼唱心情
  useEffect(() => {
    if (!ready || !isPlaying || lastTrackRef.current === trackId) return;
    lastTrackRef.current = trackId;
    triggerMood('happy', 1);
    // 认出「就是这首」比认出「谁的歌」更有陪伴感，镇站曲优先，其次按歌手分类，最后通用兜底
    const pool = (trackId && MIKU_SING_LINES_BY_TRACK[trackId]) || (trackCategory && MIKU_SING_LINES_BY_ARTIST[trackCategory]) || MIKU_SING_LINES;
    const t = window.setTimeout(() => sayFresh(pool), 300);
    return () => window.clearTimeout(t);
  }, [trackId, trackCategory, isPlaying, ready, triggerMood, sayFresh]);

  // 写作/阅读感知：OasisGallery 懒加载且不在同一条组件树路径上，靠 mikuSignal 这条极轻量事件总线通气。
  // editingRef/readingRef 无论 ready 与否都照常更新（她没被召唤出来也该记住你在写东西），
  // 但只在 ready 时才真正开口——折叠态零打扰是全站既定的规矩。
  useEffect(() => {
    const stop = onMikuSignal((signal) => {
      if (signal.type === 'editor-open') {
        editingRef.current = true;
        if (ready) window.setTimeout(() => { if (!isCurrentlyReacting()) { triggerMood('happy', 0.6); sayFresh(MIKU_WRITING_LINES, 4200); } }, 500);
      } else if (signal.type === 'editor-close') {
        editingRef.current = false;
      } else if (signal.type === 'published') {
        if (ready) window.setTimeout(() => { triggerMood('happy', 1); stageRef.current?.playMotion('FlickUp'); markReacting(2200); sayFresh(MIKU_PUBLISH_LINES, 6500); }, 900);
      } else if (signal.type === 'reading-open') {
        readingRef.current = true;
      } else if (signal.type === 'reading-close') {
        readingRef.current = false;
      }
    });
    return stop;
  }, [ready, sayFresh, triggerMood, stageRef, markReacting, isCurrentlyReacting]);

  // 离开一阵子后回来：短暂切走标签页看一眼不值得欢迎，离开够久（60s+）才算「回来了」
  useEffect(() => {
    if (!ready) return;
    const onVisibility = () => {
      if (document.hidden) { hiddenAtRef.current = performance.now(); return; }
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (hiddenAt !== null && performance.now() - hiddenAt > 60000) {
        window.setTimeout(() => { if (!isCurrentlyReacting()) { triggerMood('happy', 0.7); sayFresh(MIKU_WELCOME_BACK_LINES, 4800); } }, 400);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [ready, sayFresh, triggerMood, isCurrentlyReacting]);

  // 复制文本彩蛋：偶尔接住一句，别对着连续复制刷屏
  useEffect(() => {
    if (!ready) return;
    let lastAt = 0;
    const onCopy = () => {
      const now = performance.now();
      if (now - lastAt < 30000) return;
      lastAt = now;
      if (Math.random() < 0.5) window.setTimeout(() => sayFresh(MIKU_COPY_LINES, 4200), 200);
    };
    document.addEventListener('copy', onCopy);
    return () => document.removeEventListener('copy', onCopy);
  }, [ready, sayFresh]);

  // 全局视线：桌面端不再局限于她自己的 176×272 容器——只要指针最近动过，
  // 满屏任何地方她都会瞟一眼；触屏设备没有真实悬停，交给下面的自主张望
  useEffect(() => {
    if (!ready || coarsePointer) return;
    const onMove = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY, movedAt: performance.now() };
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [ready, coarsePointer]);

  // 逐帧：视线回落、心情浓度衰减、口型同步、音乐律动、打瞌睡/闲聊调度；
  // Tap/Flick/Doze 等专业动作片段播放时（isCurrentlyReacting）表情混合全程让位，不打架
  useEffect(() => {
    if (!ready || reduceMotion) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(now - last, 64);
      last = now;
      const stage = stageRef.current;
      if (!stage) return;
      const reacting = isCurrentlyReacting();
      const rate = 1 - Math.pow(0.001, dt / 1000); // 与 dt 无关的指数平滑，帧率波动也不抖

      // 视线：真实指针最近 3s 内动过就跟随；否则（或触屏）交给自主张望，别死盯着一个点
      if (!coarsePointer && now - pointerRef.current.movedAt < 3000) {
        stage.focus(pointerRef.current.x, pointerRef.current.y);
      } else {
        lookTimerRef.current -= dt;
        if (lookTimerRef.current <= 0) {
          lookTimerRef.current = coarsePointer ? 3200 + Math.random() * 3400 : 4000 + Math.random() * 4000;
          stage.focusNormalized((Math.random() - 0.5) * (coarsePointer ? 1.2 : 0.9), (Math.random() - 0.5) * (coarsePointer ? 0.6 : 0.5));
        }
      }

      // 心情：先按半衰期衰减；如果正被按着（长按摸头/摸身体），停留时长直接接管浓度——越摸越深
      moodRef.current.intensity *= Math.pow(0.5, dt / MOOD_HALF_LIFE_MS);
      if (pressRef.current) {
        const held = now - pressRef.current.startT;
        const zone = pressRef.current.zone;
        moodRef.current = { mood: zone === 'head' || zone === 'twintail' ? 'shy' : 'happy', intensity: Math.min(1, held / 1400) };
      }
      const resting = MOOD_TARGETS[isLateNight() ? 'sleepy' : 'neutral'];
      const active = MOOD_TARGETS[moodRef.current.mood];
      const blend = moodRef.current.intensity;

      const spectrum = isPlaying ? getSpectrum(4) : [];
      const targetMouth = spectrum.length ? Math.min(1, (spectrum[0] + spectrum[1]) * 0.7) : 0;
      const v = valsRef.current;
      v.mouth += (targetMouth - v.mouth) * rate;
      if (!reacting) stage.setParam('ParamMouthOpenY', v.mouth);

      if (!reacting) {
        v.eyeSmile += (resting.eyeSmile + (active.eyeSmile - resting.eyeSmile) * blend - v.eyeSmile) * rate;
        v.cheek += (resting.cheek + (active.cheek - resting.cheek) * blend - v.cheek) * rate;
        stage.setParam('ParamEyeLSmile', v.eyeSmile);
        stage.setParam('ParamEyeRSmile', v.eyeSmile);
        stage.setParam('ParamCheek', v.cheek);

        // 眉毛：脸部辨识度最高的部件，之前完全没接入心情系统，表情只靠眼笑+脸红撑着
        v.browY += (resting.browY + (active.browY - resting.browY) * blend - v.browY) * rate;
        v.browAngle += (resting.browAngle + (active.browAngle - resting.browAngle) * blend - v.browAngle) * rate;
        v.browForm += (resting.browForm + (active.browForm - resting.browForm) * blend - v.browForm) * rate;
        stage.setParam('ParamBrowLY', v.browY);
        stage.setParam('ParamBrowRY', v.browY);
        stage.setParam('ParamBrowLAngle', v.browAngle);
        stage.setParam('ParamBrowRAngle', v.browAngle);
        stage.setParam('ParamBrowLForm', v.browForm);
        stage.setParam('ParamBrowRForm', v.browForm);

        const mouthFormBase = resting.mouthForm + (active.mouthForm - resting.mouthForm) * blend;
        const mouthFormTarget = isPlaying ? Math.min(0.6, mouthFormBase + (spectrum[2] ?? 0) * 0.4) : mouthFormBase;
        v.mouthForm += (mouthFormTarget - v.mouthForm) * rate;
        stage.setParam('ParamMouthForm', v.mouthForm);

        // 音乐律动：低频驱动的轻微摇摆，交给她的头发物理去接住这份节拍感；
        // 手臂也跟着一起打拍子——但叠加在 Idle/Tap 等动作片段自己的曲线之上，而不是整个盖掉，
        // 不然听歌时间越长，手反而越呆（那些片段本身的手臂曲线幅度并不小）
        if (isPlaying) {
          v.swayEnergy += ((spectrum[0] ?? 0) - v.swayEnergy) * rate;
          swayPhaseRef.current += (dt / 1000) * (1.6 + v.swayEnergy * 1.8);
          const sway = Math.sin(swayPhaseRef.current) * v.swayEnergy * 4;
          stage.setParam('ParamAngleZ', sway);
          stage.setParam('ParamBodyAngleZ', sway * 0.6);
          const armSway = Math.sin(swayPhaseRef.current * 0.6 + Math.PI / 4) * v.swayEnergy * 0.2;
          const armBaseL = stage.getParam('ParamArmL');
          const armBaseR = stage.getParam('ParamArmR');
          stage.setParam('ParamArmL', Math.max(-1, Math.min(1, armBaseL + armSway)));
          stage.setParam('ParamArmR', Math.max(-1, Math.min(1, armBaseR - armSway)));
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
            stage.playMotion('Doze');
            markReacting(2500);
            triggerMood('sleepy', 1);
            window.setTimeout(() => sayFresh(MIKU_DOZE_LINES), 250);
          }
        }
      }

      // 闲聊：没人理她、也没在放歌的时候，隔一阵子会自己嘟囔一句——不是回应，只是「在场」。
      // 阅读舱开着时换一套安静的「旁白」语气、间隔也拉长，别打断你读东西；编辑器开着则完全噤声
      // （只在 mikuSignal 的 editor-open 那一刻说一句就够了，见上面的信号监听 effect）
      idleChatterTimerRef.current -= dt;
      if (idleChatterTimerRef.current <= 0) {
        idleChatterTimerRef.current = readingRef.current ? 110000 + Math.random() * 60000 : 70000 + Math.random() * 50000;
        if (!reacting && !isPlaying && !document.hidden && !editingRef.current) {
          sayFresh(readingRef.current ? MIKU_READING_LINES : MIKU_MUSING_LINES, 5000);
        }
      }

      // 久坐提醒：只统计「她展开着、且页面在前台」的时长，一次会话只提醒一次，不做成每 40 分钟就叨叨的闹钟
      if (!document.hidden && !sedentaryFiredRef.current) {
        sedentaryMsRef.current += dt;
        if (sedentaryMsRef.current >= 40 * 60 * 1000) {
          sedentaryFiredRef.current = true;
          if (!reacting) { triggerMood('happy', 0.6); sayFresh(MIKU_SEDENTARY_LINES, 5500); }
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, reduceMotion, isPlaying, getSpectrum, stageRef, coarsePointer, sayFresh, triggerMood, markReacting, isCurrentlyReacting]);

  const handlePointerDown = useCallback((clientX: number, clientY: number, rect: DOMRect) => {
    // 优先走 drawable 精确命中（真实还原头/辫子/身体/裙摆的实际网格形状，含 X 轴）；
    // 命中列表为空（点在网格缝隙里，或换了套没有这些 drawable 命名的模型）才退回几何分带兜底
    const drawableZone = classifyDrawableHits(stageRef.current?.hitTestDrawables(clientX, clientY) ?? []);
    let zone: TouchZone;
    if (drawableZone) {
      zone = drawableZone;
    } else {
      const fracY = (clientY - rect.top) / rect.height;
      const fracX = (clientX - rect.left) / rect.width;
      const inHeadBand = Math.abs(fracX - 0.5) < 0.24;
      zone = fracY >= HEM_FRAC ? 'hem' : fracY < HEAD_FRAC && inHeadBand ? 'head' : 'body';
    }
    pressRef.current = { zone, startX: clientX, startY: clientY, startT: performance.now() };
  }, [stageRef]);

  // 触屏上按住她再划走页面，浏览器发的是 pointercancel 而不是 pointerup——
  // 不清空 pressRef 的话，逐帧循环里「长按接管心情」那段会把她锁死在害羞状态出不来
  const handlePointerCancel = useCallback(() => {
    pressRef.current = null;
  }, []);

  const handlePointerUp = useCallback((clientX: number, clientY: number) => {
    const press = pressRef.current;
    pressRef.current = null;
    const stage = stageRef.current;
    if (!press || !stage) return;

    const dist = Math.hypot(clientX - press.startX, clientY - press.startY);
    const held = performance.now() - press.startT;

    if (dist > SWIPE_DIST_PX) {
      stage.playMotion('Flick', clientY < press.startY ? 0 : 1, 3);
      markReacting(3200);
      triggerMood('happy', 0.8);
      sayFresh(MIKU_FLICK_LINES, 3800);
      return;
    }

    if (held >= LONG_PRESS_MS) {
      // 长按期间的心情浓度已经在逐帧循环里累加过了，松手只需收尾一句话
      const pool = press.zone === 'head' ? MIKU_LONGPRESS_HEAD_LINES
        : press.zone === 'twintail' ? MIKU_TWINTAIL_LINES
        : press.zone === 'hem' ? MIKU_TOUCH_HEM_LINES : MIKU_TOUCH_BODY_LINES;
      sayFresh(pool, 3800);
      return;
    }

    // 连续快速点按：这个时间窗内命中够多次，就从「宠溺」切换成「有点不耐烦」——
    // 判定放在亲密度计数之前：连击本身不算数，也就不会把恰好撞上的里程碑顶掉
    const now = performance.now();
    comboRef.current = [...comboRef.current.filter((t) => now - t < COMBO_WINDOW_MS), now];
    if (comboRef.current.length >= COMBO_THRESHOLD) {
      comboRef.current = [];
      stage.playMotion('Tap', 1, 3);
      markReacting(3100);
      triggerMood('annoyed', 1);
      sayFresh(MIKU_COMBO_LINES, 3400);
      return;
    }

    const next = patCount();
    stage.playMotion('Tap', press.zone === 'head' || press.zone === 'twintail' ? 0 : 1, 3);
    markReacting(3100);
    triggerMood('shy', 1);
    if (press.zone === 'head') {
      // 摸头是高频动作，亲密度分层在这里最容易被感知到——20/50/100 次解锁更贴近的语气
      sayTiered(patTier(), [MIKU_TOUCH_HEAD_LINES, MIKU_TOUCH_HEAD_LINES, MIKU_TOUCH_HEAD_LINES_CLOSE, MIKU_TOUCH_HEAD_LINES_DEEP], 3800);
    } else {
      const pool = press.zone === 'twintail' ? MIKU_TWINTAIL_LINES : press.zone === 'hem' ? MIKU_TOUCH_HEM_LINES : MIKU_TOUCH_BODY_LINES;
      sayFresh(pool, 3800);
    }

    if (next === 20 || next === 50) {
      window.setTimeout(() => { triggerMood('surprised', 1); sayFresh(MIKU_UNLOCK_LINES, 6000); }, 4200);
    } else if (next === 100) {
      window.setTimeout(() => { triggerMood('happy', 1); sayFresh(MIKU_UNLOCK_LINES_DEEP, 7000); }, 4200);
    } else if (next > 5 && Math.random() < 0.015) {
      window.setTimeout(() => { triggerMood('surprised', 1); sayFresh(MIKU_RARE_LINES, 6000); }, 4200);
    }
  }, [stageRef, triggerMood, sayFresh, sayTiered, patTier, patCount, markReacting]);

  return { bubble, handlePointerDown, handlePointerUp, handlePointerCancel };
};
