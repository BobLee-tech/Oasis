// 🧠 Miku 的「大脑」：视线跟随、点击反应、心情表情的柔和过渡，以及按上下文挑台词。
//   刻意避免与模型自带的专业动作片段打架——Tap/Flick 播放时，这里的表情混合全程让位。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { MikuStageHandle } from './Live2DStage';
import type { AppView } from '../../types/auth';
import { currentPeriod, isLateNight } from '../../lib/timeContext';
import { termNoteOfDay } from '../../lib/solarTerms';
import {
  MIKU_GREETINGS, MIKU_TOUCH_HEAD_LINES, MIKU_TOUCH_BODY_LINES,
  MIKU_SING_LINES, MIKU_VIEW_LINES, MIKU_UNLOCK_LINES,
} from '../../data/mikuLines';

type Mood = 'neutral' | 'happy' | 'shy' | 'sleepy';

const MOOD_TARGETS: Record<Mood, { eyeSmile: number; cheek: number; mouthForm: number }> = {
  neutral: { eyeSmile: 0.12, cheek: 0.05, mouthForm: 0.1 },
  happy: { eyeSmile: 0.5, cheek: 0.18, mouthForm: 0.5 },
  shy: { eyeSmile: 0.6, cheek: 0.6, mouthForm: 0.2 },
  sleepy: { eyeSmile: 0.35, cheek: 0.1, mouthForm: -0.1 },
};

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const BUBBLE_MS = 5200;

interface UseMikuBrainOptions {
  stageRef: RefObject<MikuStageHandle | null>;
  ready: boolean;
  view: AppView;
  isPlaying: boolean;
  trackId: string | undefined;
  getSpectrum: (bars: number) => number[];
  coarsePointer: boolean;
}

export const useMikuBrain = ({ stageRef, ready, view, isPlaying, trackId, getSpectrum, coarsePointer }: UseMikuBrainOptions) => {
  const [bubble, setBubble] = useState<string | null>(null);
  const bubbleTimer = useRef<number | null>(null);
  const moodRef = useRef<Mood>('neutral');
  const valsRef = useRef({ eyeSmile: 0, cheek: 0, mouthForm: 0, mouth: 0 });
  const lastViewRef = useRef<AppView | null>(null);
  const lastTrackRef = useRef<string | undefined>(undefined);
  const lookTimerRef = useRef(0);

  const say = useCallback((text: string, ms = BUBBLE_MS) => {
    setBubble(text);
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
  }, []);

  const setMood = useCallback((mood: Mood, revertAfterMs?: number) => {
    moodRef.current = mood;
    if (revertAfterMs) {
      window.setTimeout(() => { moodRef.current = isLateNight() ? 'sleepy' : 'neutral'; }, revertAfterMs);
    }
  }, []);

  // 打招呼：模型就绪后按当前时段问候一句，偶尔换成节气语录
  // （延后一拍再开口，而非在 effect 里同步 setState：既避开级联渲染，也让她先把出场动画站稳再说话）
  useEffect(() => {
    if (!ready) return;
    moodRef.current = isLateNight() ? 'sleepy' : 'neutral';
    const t = window.setTimeout(() => {
      say(Math.random() < 0.35 ? termNoteOfDay() : pick(MIKU_GREETINGS[currentPeriod()]));
    }, 500);
    return () => window.clearTimeout(t);
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
    const t = window.setTimeout(() => say(pick(lines)), 300);
    return () => window.clearTimeout(t);
  }, [view, ready, say]);

  // 曲目切换：换歌时哼一句，顺带进入哼唱心情
  useEffect(() => {
    if (!ready || !isPlaying || lastTrackRef.current === trackId) return;
    lastTrackRef.current = trackId;
    setMood('happy');
    const t = window.setTimeout(() => say(pick(MIKU_SING_LINES)), 300);
    return () => window.clearTimeout(t);
  }, [trackId, isPlaying, ready, setMood, say]);

  // 逐帧：口型同步 + 表情柔和过渡；Tap 等专业动作片段播放时全程让位，不打架
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

      // 触屏没有真实鼠标悬停，让她偶尔自己看看别处，别死盯着一个点
      if (coarsePointer) {
        lookTimerRef.current -= dt;
        if (lookTimerRef.current <= 0) {
          lookTimerRef.current = 3200 + Math.random() * 3400;
          stage.focusNormalized((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.6);
        }
      }

      const reacting = stage.isReacting();
      const rate = 1 - Math.pow(0.001, dt / 1000); // 与 dt 无关的指数平滑，帧率波动也不抖

      const spectrum = isPlaying ? getSpectrum(4) : [];
      const targetMouth = spectrum.length ? Math.min(1, (spectrum[0] + spectrum[1]) * 0.7) : 0;
      const v = valsRef.current;
      v.mouth += (targetMouth - v.mouth) * rate;
      if (!reacting) stage.setParam('ParamMouthOpenY', v.mouth);

      if (!reacting) {
        const target = MOOD_TARGETS[moodRef.current];
        v.eyeSmile += (target.eyeSmile - v.eyeSmile) * rate;
        v.cheek += (target.cheek - v.cheek) * rate;
        stage.setParam('ParamEyeLSmile', v.eyeSmile);
        stage.setParam('ParamEyeRSmile', v.eyeSmile);
        stage.setParam('ParamCheek', v.cheek);
        // 哼唱时嘴型交给频谱驱动的张合，不与「心情嘴型」打架
        if (!isPlaying) {
          v.mouthForm += (target.mouthForm - v.mouthForm) * rate;
          stage.setParam('ParamMouthForm', v.mouthForm);
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, isPlaying, getSpectrum, stageRef, coarsePointer]);

  const handlePointerMove = useCallback((clientX: number, clientY: number) => {
    if (coarsePointer) return;
    stageRef.current?.focus(clientX, clientY);
  }, [stageRef, coarsePointer]);

  const handleClick = useCallback((clientY: number, rect: DOMRect) => {
    const stage = stageRef.current;
    if (!stage) return;
    const isHead = (clientY - rect.top) / rect.height < 0.4;
    stage.playMotion('Tap', isHead ? 0 : 1);
    setMood('shy', 3800);
    say(pick(isHead ? MIKU_TOUCH_HEAD_LINES : MIKU_TOUCH_BODY_LINES), 3800);

    try {
      const next = Number(localStorage.getItem('oasis_miku_pats') ?? '0') + 1;
      localStorage.setItem('oasis_miku_pats', String(next));
      if (next === 20 || next === 50) {
        window.setTimeout(() => say(pick(MIKU_UNLOCK_LINES), 6000), 4200);
      }
    } catch {
      // 隐私模式等场景 localStorage 不可用，彩蛋不是刚需，静默跳过
    }
  }, [stageRef, setMood, say]);

  return { bubble, handlePointerMove, handleClick };
};
