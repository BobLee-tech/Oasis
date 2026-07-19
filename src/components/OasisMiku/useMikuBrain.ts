// 🧠 Miku 的「大脑」：视线跟随、点击/长按/滑动反应、心情浓度的连续过渡，以及按上下文挑台词。
//   刻意避免与模型自带的专业动作片段打架——Tap/Flick/Doze 播放时，这里的表情混合全程让位。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { MikuStageHandle } from './Live2DStage';
import type { AppView } from '../../types/auth';
import type { MusicCategory } from '../../types/music';
import { currentPeriod, isLateNight } from '../../lib/timeContext';
import { termNoteOfDay } from '../../lib/solarTerms';
import {
  MIKU_GREETINGS, MIKU_GREETINGS_FAMILIAR, MIKU_TOUCH_HEAD_LINES, MIKU_LONGPRESS_HEAD_LINES,
  MIKU_TOUCH_BODY_LINES, MIKU_FLICK_LINES, MIKU_SING_LINES, MIKU_SING_LINES_BY_ARTIST,
  MIKU_DOZE_LINES, MIKU_VIEW_LINES, MIKU_UNLOCK_LINES, MIKU_UNLOCK_LINES_DEEP, MIKU_RARE_LINES,
} from '../../data/mikuLines';

type Mood = 'neutral' | 'happy' | 'shy' | 'sleepy';

const MOOD_TARGETS: Record<Mood, { eyeSmile: number; cheek: number; mouthForm: number }> = {
  neutral: { eyeSmile: 0.12, cheek: 0.05, mouthForm: 0.1 },
  happy: { eyeSmile: 0.5, cheek: 0.18, mouthForm: 0.5 },
  shy: { eyeSmile: 0.6, cheek: 0.6, mouthForm: 0.2 },
  sleepy: { eyeSmile: 0.35, cheek: 0.1, mouthForm: -0.1 },
};

// 心情不是开关，是会衰减的浓度：半衰期 45s，此后自然退回「常态」（深夜是 sleepy，其余是 neutral）
const MOOD_HALF_LIFE_MS = 45000;
const BUBBLE_MS = 5200;
const RECENT_LINE_MEMORY = 5;
// 摸头/戳一下都算「按住」，超过这个时长才算长按，而不是快速点按
const LONG_PRESS_MS = 260;
const SWIPE_DIST_PX = 28;

// 最近说过的几句记在这，池子够大时优先挑没说过的，避免连续撞句
const pickFresh = <T,>(arr: readonly T[], recent: T[]): T => {
  const fresh = arr.filter((item) => !recent.includes(item));
  const pool = fresh.length ? fresh : arr;
  return pool[Math.floor(Math.random() * pool.length)];
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
}

export const useMikuBrain = ({
  stageRef, ready, view, isPlaying, trackId, trackCategory, getSpectrum, coarsePointer,
}: UseMikuBrainOptions) => {
  const [bubble, setBubble] = useState<string | null>(null);
  const bubbleTimer = useRef<number | null>(null);
  const recentLinesRef = useRef<string[]>([]);
  const moodRef = useRef<{ mood: Mood; intensity: number }>({ mood: 'neutral', intensity: 0 });
  const valsRef = useRef({ eyeSmile: 0, cheek: 0, mouthForm: 0, mouth: 0, swayEnergy: 0 });
  const swayPhaseRef = useRef(0);
  const lastViewRef = useRef<AppView | null>(null);
  const lastTrackRef = useRef<string | undefined>(undefined);
  const lookTimerRef = useRef(0);
  const dozeTimerRef = useRef(20000 + Math.random() * 20000);
  const pointerRef = useRef({ x: 0, y: 0, movedAt: 0 });
  const pressRef = useRef<{ isHead: boolean; startX: number; startY: number; startT: number } | null>(null);

  const say = useCallback((text: string, ms = BUBBLE_MS) => {
    setBubble(text);
    recentLinesRef.current = [text, ...recentLinesRef.current].slice(0, RECENT_LINE_MEMORY);
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
  }, []);

  const sayFresh = useCallback((pool: readonly string[], ms?: number) => {
    if (!pool.length) return;
    say(pickFresh(pool, recentLinesRef.current), ms);
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

  const isFamiliar = useCallback(() => {
    try {
      return Number(localStorage.getItem('oasis_miku_pats') ?? '0') >= 20;
    } catch {
      return false;
    }
  }, []);

  // 打招呼：模型就绪后先抬头做个出场动作，再按当前时段/节气/熟识度问候一句
  // （延后一拍再开口，而非在 effect 里同步 setState：既避开级联渲染，也让她先把出场动画站稳再说话）
  useEffect(() => {
    if (!ready) return;
    moodRef.current = { mood: isLateNight() ? 'sleepy' : 'neutral', intensity: 1 };
    const t1 = window.setTimeout(() => stageRef.current?.playMotion('FlickUp'), 200);
    const t2 = window.setTimeout(() => {
      if (Math.random() < 0.35) { say(termNoteOfDay()); return; }
      const period = currentPeriod();
      const familiarPool = MIKU_GREETINGS_FAMILIAR[period];
      const useFamiliar = !!familiarPool?.length && isFamiliar() && Math.random() < 0.5;
      sayFresh(useFamiliar ? familiarPool! : MIKU_GREETINGS[period]);
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
    const pool = (trackCategory && MIKU_SING_LINES_BY_ARTIST[trackCategory]) || MIKU_SING_LINES;
    const t = window.setTimeout(() => sayFresh(pool), 300);
    return () => window.clearTimeout(t);
  }, [trackId, trackCategory, isPlaying, ready, triggerMood, sayFresh]);

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

  // 逐帧：视线回落、心情浓度衰减、口型同步、音乐律动、打瞌睡调度；
  // Tap/Flick/Doze 等专业动作片段播放时（isReacting）表情混合全程让位，不打架
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(now - last, 64);
      last = now;
      const stage = stageRef.current;
      if (!stage) return;
      const reacting = stage.isReacting();
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
        moodRef.current = { mood: pressRef.current.isHead ? 'shy' : 'happy', intensity: Math.min(1, held / 1400) };
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

        const mouthFormBase = resting.mouthForm + (active.mouthForm - resting.mouthForm) * blend;
        const mouthFormTarget = isPlaying ? Math.min(0.6, mouthFormBase + (spectrum[2] ?? 0) * 0.4) : mouthFormBase;
        v.mouthForm += (mouthFormTarget - v.mouthForm) * rate;
        stage.setParam('ParamMouthForm', v.mouthForm);

        // 音乐律动：低频驱动的轻微摇摆，交给她的头发物理去接住这份节拍感；不播歌时完全不碰，交还给待机动作自己的呼吸摆动
        if (isPlaying) {
          v.swayEnergy += ((spectrum[0] ?? 0) - v.swayEnergy) * rate;
          swayPhaseRef.current += (dt / 1000) * (1.6 + v.swayEnergy * 1.8);
          const sway = Math.sin(swayPhaseRef.current) * v.swayEnergy * 4;
          stage.setParam('ParamAngleZ', sway);
          stage.setParam('ParamBodyAngleZ', sway * 0.6);
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
            triggerMood('sleepy', 1);
            window.setTimeout(() => sayFresh(MIKU_DOZE_LINES), 250);
          }
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, isPlaying, getSpectrum, stageRef, coarsePointer, sayFresh, triggerMood]);

  const handlePointerDown = useCallback((clientX: number, clientY: number, rect: DOMRect) => {
    pressRef.current = { isHead: (clientY - rect.top) / rect.height < 0.4, startX: clientX, startY: clientY, startT: performance.now() };
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
      triggerMood('happy', 0.8);
      sayFresh(MIKU_FLICK_LINES, 3800);
      return;
    }

    if (held >= LONG_PRESS_MS) {
      // 长按期间的心情浓度已经在逐帧循环里累加过了，松手只需收尾一句话
      sayFresh(press.isHead ? MIKU_LONGPRESS_HEAD_LINES : MIKU_TOUCH_BODY_LINES, 3800);
      return;
    }

    stage.playMotion('Tap', press.isHead ? 0 : 1, 3);
    triggerMood('shy', 1);
    sayFresh(press.isHead ? MIKU_TOUCH_HEAD_LINES : MIKU_TOUCH_BODY_LINES, 3800);

    const next = patCount();
    if (next === 20 || next === 50) {
      window.setTimeout(() => sayFresh(MIKU_UNLOCK_LINES, 6000), 4200);
    } else if (next === 100) {
      window.setTimeout(() => sayFresh(MIKU_UNLOCK_LINES_DEEP, 7000), 4200);
    } else if (next > 5 && Math.random() < 0.015) {
      window.setTimeout(() => sayFresh(MIKU_RARE_LINES, 6000), 4200);
    }
  }, [stageRef, triggerMood, sayFresh, patCount]);

  return { bubble, handlePointerDown, handlePointerUp };
};
