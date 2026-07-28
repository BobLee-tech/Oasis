// 🎐 OasisMiku：折叠入口固定停靠在 Dock 旁；只有展开后的她能在安全区域内移动并吸边。
// 模型与 Pixi 运行时仍然只在展开时懒加载，折叠态保持零 WebGL 开销。
import { useCallback, useEffect, useRef, useState } from 'react';
import { animate, AnimatePresence, motion, useDragControls, useMotionValue, useReducedMotion } from 'framer-motion';
import { Live2DStage, type MikuStageHandle } from './Live2DStage';
import { MikuParticles, type MikuParticlesHandle } from './MikuParticles';
import { useMikuBrain, type Mood } from './useMikuBrain';
import { useSoundscape, getSpectrum } from '../../hooks/useSoundscape';
import { useCoarsePointer } from '../../hooks/useCoarsePointer';
import { onMikuSignal } from '../../lib/mikuSignal';
import type { AppView } from '../../types/auth';

const MOOD_BUBBLE_BORDER: Partial<Record<Mood, string>> = {
  happy: 'border-[#39C5BB]/35 dark:border-[#39C5BB]/25',
  surprised: 'border-[#39C5BB]/35 dark:border-[#39C5BB]/25',
  shy: 'border-[#FFB7C5]/50 dark:border-[#FFB7C5]/30',
};
const DEFAULT_BUBBLE_BORDER = 'border-slate-300/45 dark:border-white/10';
const MODEL_URL = '/live2d/miku/miku_sample_t04.model3.json';
const BERTH_KEY = 'oasis_miku_berth_v2';
const LEGACY_SIDE_KEY = 'oasis_miku_docked_side_v1';

type DockSide = 'left' | 'right';
type DockLevel = 'middle' | 'lower';
type DockBerth = `${DockSide}-${DockLevel}`;
type DragBounds = { left: number; right: number; top: number; bottom: number };
type BerthTarget = { x: number; y: number; left: number; top: number };
type StageProfile = { width: number; height: number; modelHeightRatio: number; mobileBerths: boolean };

const sideOf = (berth: DockBerth): DockSide => berth.startsWith('left') ? 'left' : 'right';
const levelOf = (berth: DockBerth): DockLevel => berth.endsWith('middle') ? 'middle' : 'lower';
const isBerth = (value: string | null): value is DockBerth =>
  value === 'left-middle' || value === 'right-middle' || value === 'left-lower' || value === 'right-lower';

const profileFor = (viewportWidth: number): StageProfile => {
  if (viewportWidth < 360) return { width: 100, height: 152, modelHeightRatio: 1.48, mobileBerths: true };
  if (viewportWidth < 480) return { width: 112, height: 168, modelHeightRatio: 1.46, mobileBerths: true };
  if (viewportWidth < 768) return { width: 132, height: 208, modelHeightRatio: 1.14, mobileBerths: true };
  return { width: 152, height: 236, modelHeightRatio: 1, mobileBerths: false };
};

const initialBerth = (): DockBerth => {
  const stored = sessionStorage.getItem(BERTH_KEY);
  if (isBerth(stored)) return stored;
  return sessionStorage.getItem(LEGACY_SIDE_KEY) === 'left' ? 'left-lower' : 'right-lower';
};

const intersectionArea = (a: DOMRect, b: { left: number; top: number; width: number; height: number }) => {
  const width = Math.max(0, Math.min(a.right, b.left + b.width) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.top + b.height) - Math.max(a.top, b.top));
  return width * height;
};

// 「双马尾声纹」：先靠轮廓识别，再把表情与性格交给展开后的 Live2D。
// 三个主要形状、24 网格、统一 1.6px 描边，在 21px 下仍能读出双马尾而不是通用头像。
const PendantIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="w-[22px] h-[22px]"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path
      className="miku-tail miku-tail-left"
      d="M8.8 8.2C6 8.8 4.3 11.4 4.1 14.4c-.1 2 .5 3.9 1.7 5.5.4-3.2 1.5-6.1 3.4-8.4"
    />
    <path
      className="miku-tail miku-tail-right"
      d="M15.2 8.2c2.8.6 4.5 3.2 4.7 6.2.1 2-.5 3.9-1.7 5.5-.4-3.2-1.5-6.1-3.4-8.4"
    />
    <path d="M8.7 7.8c.7-2.2 5.9-2.2 6.6 0l.9 4.1c.4 2.3-1.5 4.3-4.2 4.3s-4.6-2-4.2-4.3l.9-4.1Z" />
    <path d="M8.4 10.1c2.4-.3 4.8-1.2 7-2.7" opacity=".72" />
    <circle cx="7.6" cy="8.9" r=".85" fill="currentColor" stroke="none" />
    <circle cx="16.4" cy="8.9" r=".85" fill="currentColor" stroke="none" />
  </svg>
);

interface SpeechBubbleProps {
  text: string;
  moodBorder: string;
  side: DockSide;
  className?: string;
}

const SpeechBubble = ({ text, moodBorder, side, className = '' }: SpeechBubbleProps) => (
  <motion.div
    initial={{ opacity: 0, y: 8, scale: 0.94, filter: 'blur(3px)' }}
    animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
    exit={{ opacity: 0, y: -4, scale: 0.97, filter: 'blur(3px)' }}
    transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
    className={`absolute z-20 w-max max-w-[min(190px,calc(100vw-2rem))] md:max-w-[min(240px,calc(100vw-2rem))] text-[13px] rounded-2xl backdrop-blur-md bg-white/72 dark:bg-[#0E1424]/78 border shadow-[0_12px_32px_-20px_rgba(15,23,42,0.45)] px-4 py-2.5 transition-colors duration-500 ${
      side === 'left' ? 'left-0 rounded-bl-md origin-bottom-left' : 'right-0 rounded-br-md origin-bottom-right'
    } ${moodBorder} ${className}`}
  >
    <span className="font-serif leading-[1.7] tracking-[0.02em] text-slate-600 dark:text-slate-200 text-balance">
      {text}
    </span>
    <span
      aria-hidden
      className={`absolute -bottom-[5px] w-2.5 h-2.5 rotate-45 bg-white/72 dark:bg-[#0E1424]/78 border-b border-r transition-colors duration-500 ${
        side === 'left' ? 'left-6' : 'right-6'
      } ${moodBorder}`}
    />
  </motion.div>
);

export const OasisMiku = ({ view }: { view: AppView }) => {
  const stageRef = useRef<MikuStageHandle>(null);
  const particlesRef = useRef<MikuParticlesHandle>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageShellRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const berthTargetsRef = useRef(new Map<DockBerth, BerthTarget>());
  const idleTimerRef = useRef<number | null>(null);
  const focusSourcesRef = useRef(new Set<string>());

  const coarsePointer = useCoarsePointer();
  const prefersReducedMotion = !!useReducedMotion();
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const profile = profileFor(viewportWidth);
  const expandedW = profile.width;
  const expandedH = profile.height;

  const [expanded, setExpanded] = useState(() => sessionStorage.getItem('oasis_miku_expanded') === '1');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [berth, setBerth] = useState<DockBerth>(initialBerth);
  const [positioned, setPositioned] = useState(false);
  const [retreated, setRetreated] = useState(false);
  const [focusActive, setFocusActive] = useState(false);
  const [dragBounds, setDragBounds] = useState<DragBounds>({ left: 0, right: 0, top: 0, bottom: 0 });
  const dragControls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const { isPlaying, currentTrack } = useSoundscape();
  const { bubble, bubbleMood, handlePointerDown, handlePointerUp, handlePointerCancel } = useMikuBrain({
    stageRef,
    particlesRef,
    ready,
    view,
    isPlaying,
    trackId: currentTrack?.id,
    trackCategory: currentTrack?.category,
    getSpectrum,
    coarsePointer,
    reduceMotion: prefersReducedMotion,
  });
  const bubbleBorder = MOOD_BUBBLE_BORDER[bubbleMood] ?? DEFAULT_BUBBLE_BORDER;
  const bubbleSide = sideOf(berth);
  const mikuTrackPlaying = isPlaying && currentTrack?.category === 'Miku';

  useEffect(() => {
    sessionStorage.setItem('oasis_miku_expanded', expanded ? '1' : '0');
  }, [expanded]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => onMikuSignal((signal) => {
    let source: string | null = null;
    let active: boolean | null = null;
    if (signal.type === 'editor-open' || signal.type === 'editor-close') {
      source = 'editor';
      active = signal.type === 'editor-open';
    } else if (signal.type === 'reading-open' || signal.type === 'reading-close') {
      source = 'reading';
      active = signal.type === 'reading-open';
    } else if (signal.type === 'focus-open' || signal.type === 'focus-close') {
      source = signal.source;
      active = signal.type === 'focus-open';
    }
    if (!source || active === null) return;
    if (active) focusSourcesRef.current.add(source);
    else focusSourcesRef.current.delete(source);
    setFocusActive(focusSourcesRef.current.size > 0);
  }), []);

  const measureBerths = useCallback(() => {
    const shell = stageShellRef.current;
    const host = hostRef.current;
    if (!shell || !host) return;
    // 浏览器旋转/响应式测试时可能连续跨过多个断点；丢弃仍排在 rAF 队列里的旧尺寸测量，
    // 免得 132×208 的泊位在 112×168 已渲染后又覆盖一次。
    if (profileFor(window.innerWidth).width !== expandedW) return;

    const hostRect = host.getBoundingClientRect();
    const computedBottom = Number.parseFloat(window.getComputedStyle(shell).bottom);
    // 舞台的 CSS 原点始终是宿主右边缘 + bottom 偏移；直接由宿主 layout 算出，
    // 不读取尚未合成完的 transform，连续测量也不会把位移重复叠加。
    const baseLeft = hostRect.right - expandedW;
    const baseTop = hostRect.bottom - computedBottom - expandedH;
    const horizontalMargin = viewportWidth < 480 ? 12 : viewportWidth < 768 ? 18 : 26;
    const safeTop = viewportWidth < 768 ? 18 : 72;
    const safeBottom = window.innerHeight - (viewportWidth < 480 ? 96 : 88);
    const lowerTop = Math.max(safeTop, safeBottom - expandedH);
    const middleTop = Math.max(safeTop, Math.min((window.innerHeight - expandedH) / 2, lowerTop));
    const left = horizontalMargin;
    const right = window.innerWidth - horizontalMargin - expandedW;
    const makeTarget = (targetLeft: number, targetTop: number): BerthTarget => ({
      x: targetLeft - baseLeft,
      y: targetTop - baseTop,
      left: targetLeft,
      top: targetTop,
    });
    const targets = new Map<DockBerth, BerthTarget>([
      ['left-middle', makeTarget(left, middleTop)],
      ['right-middle', makeTarget(right, middleTop)],
      ['left-lower', makeTarget(left, lowerTop)],
      ['right-lower', makeTarget(right, lowerTop)],
    ]);
    berthTargetsRef.current = targets;

    const nextBounds = {
      left: left - baseLeft,
      right: right - baseLeft,
      top: safeTop - baseTop,
      bottom: safeBottom - (baseTop + expandedH),
    };
    setDragBounds(nextBounds);

    const allowed: DockBerth[] = profile.mobileBerths
      ? ['left-lower', 'right-lower']
      : ['left-middle', 'right-middle', 'left-lower', 'right-lower'];
    const normalizedPreferred: DockBerth = profile.mobileBerths
      ? `${sideOf(berth)}-lower`
      : berth;
    const avoidRects = Array.from(document.querySelectorAll<HTMLElement>('[data-miku-avoid]'))
      .filter((element) => element !== shell && !shell.contains(element))
      .map((element) => element.getBoundingClientRect())
      .filter((avoid) => avoid.width > 0 && avoid.height > 0);
    const score = (candidate: DockBerth) => {
      const target = targets.get(candidate)!;
      const preferredTarget = targets.get(normalizedPreferred)!;
      const overlap = avoidRects.reduce(
        (total, avoid) => total + intersectionArea(avoid, { left: target.left, top: target.top, width: expandedW, height: expandedH }),
        0,
      );
      const distance = Math.hypot(target.left - preferredTarget.left, target.top - preferredTarget.top);
      return [overlap, distance] as const;
    };
    const selected = [...allowed].sort((a, b) => {
      const [areaA, distanceA] = score(a);
      const [areaB, distanceB] = score(b);
      return areaA - areaB || distanceA - distanceB;
    })[0];
    const target = targets.get(selected);
    if (target) {
      x.set(target.x);
      y.set(target.y);
      if (selected !== berth) {
        setBerth(selected);
        sessionStorage.setItem(BERTH_KEY, selected);
      }
    }
    setPositioned(true);
  }, [berth, expandedH, expandedW, profile.mobileBerths, viewportWidth, x, y]);

  // AnimatePresence(mode="wait") 会先让挂坠退场、再挂载舞台；仅监听 expanded 的 effect
  // 可能早于真实 DOM 一帧。用 ref 回调在舞台实际出现后补测，杜绝“透明地停在原点”。
  const bindStageShell = useCallback((node: HTMLDivElement | null) => {
    stageShellRef.current = node;
    if (node) window.requestAnimationFrame(measureBerths);
  }, [measureBerths]);

  useEffect(() => {
    if (!expanded) {
      x.set(0);
      y.set(0);
      return;
    }

    const frame = window.requestAnimationFrame(measureBerths);
    window.addEventListener('resize', measureBerths);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', measureBerths);
    };
  }, [expanded, measureBerths, x, y]);

  useEffect(() => {
    if (!expanded) return;
    const frame = window.requestAnimationFrame(measureBerths);
    return () => window.cancelAnimationFrame(frame);
  }, [expanded, measureBerths, view]);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const restorePresence = useCallback(() => {
    setRetreated(false);
    clearIdleTimer();
    if (expanded && !focusActive && !bubble && !mikuTrackPlaying) {
      idleTimerRef.current = window.setTimeout(() => setRetreated(true), 7000);
    }
  }, [bubble, clearIdleTimer, expanded, focusActive, mikuTrackPlaying]);

  useEffect(() => {
    clearIdleTimer();
    if (!expanded) return;
    let frame: number | null = null;
    if (focusActive) {
      frame = window.requestAnimationFrame(() => setRetreated(true));
    } else if (bubble || mikuTrackPlaying) {
      frame = window.requestAnimationFrame(() => setRetreated(false));
    } else {
      idleTimerRef.current = window.setTimeout(() => setRetreated(true), 7000);
    }
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      clearIdleTimer();
    };
  }, [bubble, clearIdleTimer, expanded, focusActive, mikuTrackPlaying]);

  const expand = () => {
    setReady(false);
    setFailed(false);
    setPositioned(false);
    setRetreated(false);
    setExpanded(true);
  };

  const collapse = () => {
    clearIdleTimer();
    setPositioned(false);
    setRetreated(false);
    setExpanded(false);
    x.set(0);
    y.set(0);
  };

  const dockToBerth = useCallback((nextBerth: DockBerth) => {
    const normalized: DockBerth = profile.mobileBerths ? `${sideOf(nextBerth)}-lower` : nextBerth;
    const candidates: DockBerth[] = profile.mobileBerths
      ? ['left-lower', 'right-lower']
      : ['left-middle', 'right-middle', 'left-lower', 'right-lower'];
    const preferredTarget = berthTargetsRef.current.get(normalized);
    const avoidRects = Array.from(document.querySelectorAll<HTMLElement>('[data-miku-avoid]'))
      .filter((element) => element !== stageShellRef.current && !stageShellRef.current?.contains(element))
      .map((element) => element.getBoundingClientRect())
      .filter((avoid) => avoid.width > 0 && avoid.height > 0);
    const selected = [...candidates].sort((a, b) => {
      const targetA = berthTargetsRef.current.get(a);
      const targetB = berthTargetsRef.current.get(b);
      if (!targetA || !targetB || !preferredTarget) return 0;
      const areaOf = (target: BerthTarget) => avoidRects.reduce(
        (total, avoid) => total + intersectionArea(avoid, { left: target.left, top: target.top, width: expandedW, height: expandedH }),
        0,
      );
      return areaOf(targetA) - areaOf(targetB)
        || Math.hypot(targetA.left - preferredTarget.left, targetA.top - preferredTarget.top)
          - Math.hypot(targetB.left - preferredTarget.left, targetB.top - preferredTarget.top);
    })[0];
    const target = berthTargetsRef.current.get(selected);
    if (!target) return;
    setBerth(selected);
    sessionStorage.setItem(BERTH_KEY, selected);
    const transition = prefersReducedMotion
      ? { type: 'tween' as const, duration: 0.01 }
      : { type: 'spring' as const, stiffness: 340, damping: 30 };
    animate(x, target.x, transition);
    animate(y, target.y, transition);
    restorePresence();
  }, [expandedH, expandedW, prefersReducedMotion, profile.mobileBerths, restorePresence, x, y]);

  const settleAfterDrag = () => {
    const candidates: DockBerth[] = profile.mobileBerths
      ? ['left-lower', 'right-lower']
      : ['left-middle', 'right-middle', 'left-lower', 'right-lower'];
    const closest = candidates.reduce((best, candidate) => {
      const target = berthTargetsRef.current.get(candidate);
      const bestTarget = berthTargetsRef.current.get(best);
      if (!target || !bestTarget) return best;
      return Math.hypot(x.get() - target.x, y.get() - target.y)
        < Math.hypot(x.get() - bestTarget.x, y.get() - bestTarget.y)
        ? candidate
        : best;
    }, candidates[0]);
    dockToBerth(closest);
    window.setTimeout(() => { draggingRef.current = false; }, 0);
  };

  const dockWithKey = (key: string) => {
    if (key === 'ArrowLeft') dockToBerth(`left-${levelOf(berth)}`);
    else if (key === 'ArrowRight') dockToBerth(`right-${levelOf(berth)}`);
    else if (!profile.mobileBerths && key === 'ArrowUp') dockToBerth(`${sideOf(berth)}-middle`);
    else if (!profile.mobileBerths && key === 'ArrowDown') dockToBerth(`${sideOf(berth)}-lower`);
    else return false;
    return true;
  };
  const berthMargin = viewportWidth < 480 ? 12 : viewportWidth < 768 ? 18 : 26;
  const retreatOffset = (sideOf(berth) === 'right' ? 1 : -1) * (expandedW * 0.32 + berthMargin);

  return (
    <div ref={hostRef} className="relative w-12 h-16 flex items-center justify-center select-none">
      <AnimatePresence>
        {!expanded && bubble && (
          <SpeechBubble
            key="miku-collapsed-bubble"
            text={bubble}
            moodBorder={bubbleBorder}
            side="right"
            className="bottom-full mb-2.5"
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {expanded ? (
          <motion.div
            ref={bindStageShell}
            key="stage"
            data-miku-stage
            data-berth={berth}
            data-retreated={retreated ? 'true' : 'false'}
            data-ready={ready ? 'true' : 'false'}
            drag={profile.mobileBerths ? 'x' : true}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={dragBounds}
            dragElastic={0.06}
            dragMomentum={false}
            onDragStart={() => {
              draggingRef.current = true;
              restorePresence();
            }}
            onDragEnd={settleAfterDrag}
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: positioned ? 1 : 0, scale: positioned ? 1 : 0.96 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={prefersReducedMotion
              ? { duration: 0.01 }
              : { type: 'spring', stiffness: 340, damping: 30 }}
            className="absolute bottom-[calc(100%+0.7rem)] right-0 z-10 cursor-grab active:cursor-grabbing touch-none"
            style={{ width: expandedW, height: expandedH, x, y, pointerEvents: positioned ? 'auto' : 'none' }}
            onPointerEnter={restorePresence}
            title={profile.mobileBerths ? '左右拖动，让她换一边待着' : '拖动 Miku，松手后会停入最近的边缘泊位'}
          >
            <motion.div
              className="relative w-full h-full"
              animate={{ x: retreated ? retreatOffset : 0 }}
              transition={prefersReducedMotion
                ? { duration: 0.01 }
                : { type: 'spring', stiffness: 340, damping: 30 }}
            >
              <AnimatePresence>
                {bubble && (
                  <SpeechBubble
                    key="miku-expanded-bubble"
                    text={bubble}
                    moodBorder={bubbleBorder}
                    side={bubbleSide}
                    className="bottom-full mb-2"
                  />
                )}
              </AnimatePresence>

              <div
                ref={wrapRef}
                className="w-full h-full overflow-hidden"
                onPointerDown={(event) => {
                  restorePresence();
                  draggingRef.current = false;
                  if (!wrapRef.current) return;
                  handlePointerDown(event.clientX, event.clientY, wrapRef.current.getBoundingClientRect());
                }}
                onPointerUp={(event) => {
                  if (!draggingRef.current) handlePointerUp(event.clientX, event.clientY);
                }}
                onPointerCancel={handlePointerCancel}
              >
                {!failed && (
                  <Live2DStage
                    ref={stageRef}
                    modelUrl={MODEL_URL}
                    width={expandedW}
                    height={expandedH}
                    modelHeightRatio={profile.modelHeightRatio}
                    reduceMotion={prefersReducedMotion}
                    onReady={() => {
                      measureBerths();
                      setReady(true);
                    }}
                    onError={() => {
                      measureBerths();
                      setFailed(true);
                    }}
                  />
                )}

                {!ready && !failed && (
                  <div className="absolute inset-0 flex items-end justify-center pb-8 opacity-45">
                    <span className="font-mono text-[10px] tracking-[0.18em] text-slate-400">LOADING…</span>
                  </div>
                )}
                {failed && (
                  <div className="absolute inset-0 flex items-end justify-center pb-8 opacity-55 text-center px-2">
                    <span className="font-serif text-xs text-slate-400">她今天有点害羞，暂时不肯出来见人。</span>
                  </div>
                )}
              </div>

              <MikuParticles
                ref={particlesRef}
                reduceMotion={prefersReducedMotion}
                coarsePointer={coarsePointer}
              />

              <button
                data-no-global-ripple
                type="button"
                aria-label="移动 Miku"
                title="拖动到附近后松手；方向键可切换边缘泊位"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  restorePresence();
                  draggingRef.current = true;
                  dragControls.start(event);
                }}
                onKeyDown={(event) => {
                  if (!dockWithKey(event.key)) return;
                  event.preventDefault();
                }}
                className="absolute -top-1 left-1/2 -translate-x-1/2 z-20 w-11 h-11 rounded-full flex items-start justify-center pt-2 outline-none focus-visible:outline-2 focus-visible:outline-[#39C5BB] cursor-grab active:cursor-grabbing text-slate-400 hover:text-[#39C5BB] transition-colors"
              >
                <span aria-hidden className="flex gap-1 opacity-45">
                  <span className="w-1 h-1 rounded-full bg-current" />
                  <span className="w-1 h-1 rounded-full bg-current" />
                  <span className="w-1 h-1 rounded-full bg-current" />
                </span>
              </button>

              <button
                data-no-global-ripple
                onPointerDown={(event) => event.stopPropagation()}
                onClick={collapse}
                aria-label="收起 Miku"
                className={`absolute -top-1 w-11 h-11 rounded-full flex items-center justify-center outline-none focus-visible:outline-2 focus-visible:outline-[#39C5BB] ${
                  bubbleSide === 'right' ? 'left-0' : '-right-1'
                }`}
              >
                <span className="w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md bg-white/72 dark:bg-[#0E1424]/76 border border-white/60 dark:border-white/10 text-slate-500 dark:text-slate-300 hover:text-[#39C5BB] hover:border-[#39C5BB]/35 shadow-sm transition-colors">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="m7 7 10 10M17 7 7 17" />
                  </svg>
                </span>
              </button>

              <span className="absolute -bottom-4 right-0 left-0 text-right font-mono text-[8px] tracking-wide opacity-30 truncate text-slate-400">
                形象 © Crypton Future Media・建模 © Live2D Inc.
              </span>
            </motion.div>

            {retreated && (
              <button
                data-no-global-ripple
                type="button"
                aria-label="唤回 Miku"
                onClick={restorePresence}
                className={`absolute top-1/2 -translate-y-1/2 z-30 w-8 h-12 flex items-center justify-center rounded-full border border-[#39C5BB]/25 bg-white/65 dark:bg-[#0E1424]/72 text-[#0E8C85] dark:text-[#66DED5] backdrop-blur-md shadow-sm outline-none focus-visible:outline-2 focus-visible:outline-[#39C5BB] ${
                  bubbleSide === 'right' ? '-left-2' : '-right-2'
                }`}
              >
                <span aria-hidden>{bubbleSide === 'right' ? '‹' : '›'}</span>
              </button>
            )}
          </motion.div>
        ) : (
          <motion.button
            key="pendant"
            data-no-global-ripple
            initial={{ opacity: 0, scale: 0.86 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.88 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            onClick={expand}
            title="唤醒 Miku"
            aria-label="唤醒 Miku"
            className={`miku-pendant group relative w-12 h-12 rounded-full flex items-center justify-center overflow-visible outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#39C5BB] backdrop-blur-2xl bg-white/60 dark:bg-[#0A0F1D]/72 border border-t-white/80 dark:border-t-white/20 text-slate-600 dark:text-slate-300 hover:text-[#0E8C85] dark:hover:text-[#66DED5] hover:border-[#39C5BB]/45 shadow-[0_14px_34px_-18px_rgba(15,23,42,0.42),inset_0_1px_0_rgba(255,255,255,0.44)] dark:shadow-[0_14px_34px_-18px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors duration-300 ${
              isPlaying ? 'border-[#39C5BB]/45 text-[#0E8C85] dark:text-[#66DED5]' : 'border-white/55 dark:border-white/10'
            }`}
          >
            {isPlaying && (
              <>
                <span aria-hidden className="miku-playing-halo absolute inset-[-1px] rounded-full border border-[#39C5BB]/35" />
                <span aria-hidden className="absolute right-0.5 bottom-0.5 w-2 h-2 rounded-full bg-[#39C5BB] border-2 border-white/80 dark:border-[#0A0F1D] shadow-[0_0_8px_rgba(57,197,187,0.75)]" />
              </>
            )}
            <PendantIcon />

            <span className="hidden md:block absolute bottom-full mb-3 right-0 pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 translate-y-1 group-hover:translate-y-0 group-focus-visible:translate-y-0 transition-all duration-200">
              <span className="block px-3 py-1.5 text-[10px] font-mono tracking-[0.14em] text-slate-600 dark:text-slate-300 bg-white/82 dark:bg-[#0E1424]/88 border border-white/60 dark:border-white/10 rounded-lg shadow-sm whitespace-nowrap backdrop-blur-md">
                唤醒 Miku
              </span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
