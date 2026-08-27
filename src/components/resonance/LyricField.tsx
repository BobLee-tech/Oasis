import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getEnergy, setActiveLyric } from '../../hooks/useSoundscape';
import { beatsOf, formatClock, interludeAt, lineProgress, prepareTimedLines } from '../../lib/lyricTiming';
import { findActiveLine } from '../../lib/lyrics';
import { useTicker } from '../../lib/ticker';
import type { LyricLanguage, LyricsDocument, Track } from '../../types/music';
import { Interlude } from './Interlude';
import { LyricRow } from './LyricRow';

interface LyricFieldProps {
  lyrics: LyricsDocument;
  track: Track;
  color: string;
  isPlaying: boolean;
  active: boolean;
  currentTime: number;
  seek: (seconds: number) => void;
  getPlaybackTime: () => number;
  compact: boolean;
  language: LyricLanguage;
}

/** 焦点行停在词场高度的这个位置：上方留 42% 的已唱，下方留 58% 的将唱。 */
const FOCUS_RATIO = 0.42;
const TAP_SLOP = 6;          // px，小于此位移算点击而非拖拽
const FLING_TAU = 0.32;      // s，惯性衰减时间常数
const FLING_STOP = 60;       // px/s，低于此速度就吸附
const FLING_MAX = 4_000;     // px/s，单次抛掷的速度上限
const WHEEL_SETTLE_MS = 170;
const IDLE_RETURN_MS = 4_200;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const LyricField: React.FC<LyricFieldProps> = ({
  lyrics,
  track,
  color,
  isPlaying,
  active,
  currentTime,
  seek,
  getPlaybackTime,
  compact,
  language,
}) => {
  const timedLines = useMemo(() => prepareTimedLines(lyrics.lines), [lyrics.lines]);
  const offsetMs = lyrics.offsetMs + (track.lyrics?.offsetMs ?? 0);
  const initialIndex = findActiveLine(timedLines, currentTime * 1_000 - offsetMs);

  const [playbackIndex, setPlaybackIndex] = useState(initialIndex);
  const [following, setFollowing] = useState(true);
  const [interludeVisible, setInterludeVisible] = useState(false);

  const fieldRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const interludeRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const rippleRef = useRef<HTMLSpanElement>(null);
  const waterClockRef = useRef<HTMLSpanElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const publishedLyricRef = useRef('');

  useEffect(() => {
    if (!active) {
      publishedLyricRef.current = '';
      setActiveLyric(null);
    }
    return () => setActiveLyric(null);
  }, [active, track.id]);

  const measurementsRef = useRef({
    tops: [] as number[],
    heights: [] as number[],
    fieldHeight: 0,
    minY: 0,
    maxY: 0,
  });
  const springRef = useRef({ y: 0, target: 0, velocity: 0, initialized: false });

  /** 一次指针/滚轮手势的全部瞬时状态。全放 ref 里，60fps 不触发任何重渲染。 */
  const gestureRef = useRef({
    pointerId: -1,
    active: false,
    lastY: 0,
    lastAt: 0,
    moved: 0,
    velocity: 0,
    downTarget: null as HTMLElement | null,
    fling: false,
    wheelUntil: 0,
    needsSnap: false,
  });

  const playbackIndexRef = useRef(initialIndex);
  const focusRef = useRef(initialIndex);
  const appliedFocusRef = useRef(Number.NaN);
  const appliedPlaybackRef = useRef(Number.NaN);
  const appliedBrowsingRef = useRef(false);
  const followingRef = useRef(true);
  const interludeVisibleRef = useRef(false);
  const lastInputRef = useRef(0);

  const markInput = useCallback(() => {
    lastInputRef.current = performance.now();
  }, []);

  const targetFor = useCallback((index: number) => {
    const { tops, heights, fieldHeight, maxY } = measurementsRef.current;
    if (!fieldHeight) return springRef.current.target;
    if (index < 0) return maxY;
    if (tops[index] === undefined) return springRef.current.target;
    return -(tops[index] + heights[index] / 2) + fieldHeight * FOCUS_RATIO;
  }, []);

  const measure = useCallback(() => {
    const field = fieldRef.current;
    const trackElement = trackRef.current;
    if (!field || !trackElement) return;
    field.scrollTop = 0;
    const fieldTop = field.getBoundingClientRect().top;
    const currentY = springRef.current.initialized ? springRef.current.y : 0;
    const fieldHeight = field.clientHeight;
    const count = timedLines.length;
    const tops: number[] = new Array(count);
    const heights: number[] = new Array(count);
    for (let index = 0; index < count; index += 1) {
      const row = rowRefs.current[index];
      // 用视觉坐标反推 y=0 时的位置，兼容 Framer layout projection 在祖先层施加的变换。
      tops[index] = row ? row.getBoundingClientRect().top - fieldTop - currentY : 0;
      heights[index] = row?.offsetHeight ?? 0;
    }
    const title = titleRef.current;
    const maxY = title ? fieldHeight * 0.19 - title.offsetTop : 0;
    const minY = count
      ? -(tops[count - 1] + heights[count - 1] / 2) + fieldHeight * FOCUS_RATIO
      : 0;
    measurementsRef.current = { tops, heights, fieldHeight, minY, maxY };

    const spring = springRef.current;
    spring.target = targetFor(focusRef.current);
    if (!spring.initialized) {
      spring.y = spring.target;
      spring.velocity = 0;
      spring.initialized = true;
      trackElement.style.transform = `translate3d(0,${spring.y}px,0)`;
    }
  }, [targetFor, timedLines]);

  /** 与焦点的距离 → 每行的 --d，只在焦点真的变了时才遍历。 */
  const applyFocus = useCallback((focus: number) => {
    const rows = rowRefs.current;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (row) row.style.setProperty('--d', String(focus < 0 ? index + 1 : Math.abs(index - focus)));
    }
  }, []);

  /** 已唱/未唱 → 每行的 --past 与 --p 端值；焦点行的 --p 每帧单独更新。 */
  const applyPlayback = useCallback((playback: number) => {
    const rows = rowRefs.current;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row) continue;
      const past = index < playback;
      row.style.setProperty('--past', past ? '1' : '0');
      if (index !== playback) row.style.setProperty('--p', past ? '1' : '0');
    }
  }, []);

  useLayoutEffect(() => {
    rowRefs.current.length = timedLines.length;
    measure();
    applyFocus(focusRef.current);
    applyPlayback(playbackIndexRef.current);
    appliedFocusRef.current = focusRef.current;
    appliedPlaybackRef.current = playbackIndexRef.current;

    // 行高会随字体加载 / 译文语言 / 容器尺寸变化，任何一处漏测都会让焦点行慢慢跑偏
    const observer = new ResizeObserver(measure);
    if (fieldRef.current) observer.observe(fieldRef.current);
    if (trackRef.current) observer.observe(trackRef.current);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [measure, applyFocus, applyPlayback, timedLines, language, compact, track.id]);

  const nearestIndex = useCallback((y: number) => {
    const { tops, heights, fieldHeight } = measurementsRef.current;
    const focusAt = fieldHeight * FOCUS_RATIO - y;
    let best = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < tops.length; index += 1) {
      const distance = Math.abs(tops[index] + heights[index] / 2 - focusAt);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return best;
  }, []);

  const settle = useCallback(() => {
    const gesture = gestureRef.current;
    gesture.fling = false;
    gesture.needsSnap = false;
    if (!measurementsRef.current.fieldHeight) return;
    const index = nearestIndex(springRef.current.y);
    focusRef.current = index;
    springRef.current.target = targetFor(index);
  }, [nearestIndex, targetFor]);

  /** 位移直连：手指走多远内容走多远，越出首尾时才逐渐变沉。 */
  const dragBy = useCallback((dy: number) => {
    const spring = springRef.current;
    const { minY, maxY } = measurementsRef.current;
    const over = spring.y > maxY ? spring.y - maxY : spring.y < minY ? minY - spring.y : 0;
    const outward = (spring.y > maxY && dy > 0) || (spring.y < minY && dy < 0);
    spring.y += outward ? dy * Math.max(0.12, 1 - over / 260) : dy;
    spring.target = spring.y;
    spring.velocity = 0;
    if (measurementsRef.current.fieldHeight) focusRef.current = nearestIndex(spring.y);
  }, [nearestIndex]);

  const browseTo = useCallback((index: number) => {
    const next = clamp(index, 0, timedLines.length - 1);
    focusRef.current = next;
    springRef.current.target = targetFor(next);
    gestureRef.current.fling = false;
    markInput();
    if (followingRef.current) setFollowing(false);
  }, [markInput, targetFor, timedLines.length]);

  const chooseLine = useCallback((index: number) => {
    const line = timedLines[index];
    if (!line) return;
    seek(Math.max(0, (line.startMs + offsetMs) / 1_000));
    if (fieldRef.current) fieldRef.current.scrollTop = 0;
    focusRef.current = index;
    springRef.current.target = targetFor(index);
    springRef.current.y = springRef.current.target;
    springRef.current.velocity = 0;
    gestureRef.current.fling = false;
    markInput();
    setFollowing(true);
  }, [markInput, offsetMs, seek, targetFor, timedLines]);

  useEffect(() => {
    followingRef.current = following;
    if (following) focusRef.current = playbackIndexRef.current;
    markInput();
  }, [following, markInput]);

  // 滚轮必须非 passive 才能 preventDefault，React 的 onWheel 给不了这个保证
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const onWheel = (event: WheelEvent) => {
      if (!measurementsRef.current.fieldHeight) return;
      event.preventDefault();
      const gesture = gestureRef.current;
      gesture.fling = false;
      gesture.wheelUntil = performance.now() + WHEEL_SETTLE_MS;
      gesture.needsSnap = true;
      if (followingRef.current) setFollowing(false);
      dragBy(-event.deltaY * (event.deltaMode === 1 ? 16 : 1));
      markInput();
    };
    field.addEventListener('wheel', onWheel, { passive: false });
    return () => field.removeEventListener('wheel', onWheel);
  }, [dragBy, markInput]);

  useTicker(
    (now, dt) => {
      const spring = springRef.current;
      const gesture = gestureRef.current;
      const measurements = measurementsRef.current;

      const playbackMs = (isPlaying ? getPlaybackTime() : currentTime) * 1_000 - offsetMs;
      const nextIndex = findActiveLine(timedLines, playbackMs);
      if (nextIndex !== playbackIndexRef.current) {
        playbackIndexRef.current = nextIndex;
        setPlaybackIndex(nextIndex);
      }
      if (followingRef.current) focusRef.current = nextIndex;

      if (focusRef.current !== appliedFocusRef.current) {
        const jumped = Math.abs(focusRef.current - appliedFocusRef.current) > 3;
        appliedFocusRef.current = focusRef.current;
        applyFocus(focusRef.current);
        if (waterClockRef.current) {
          waterClockRef.current.textContent = formatClock(
            timedLines[Math.max(0, focusRef.current)]?.startMs ?? 0,
          );
        }
        if (followingRef.current) {
          spring.target = targetFor(focusRef.current);
          if (jumped || reducedMotion()) {
            spring.y = spring.target;
            spring.velocity = 0;
          }
          // 换行涟漪：从行首荡开一圈，呼应站点的水波语汇
          const ripple = rippleRef.current;
          if (ripple && !reducedMotion()) {
            ripple.style.animation = 'none';
            void ripple.offsetWidth;
            ripple.style.animation = '';
          }
        }
      }
      if (playbackIndexRef.current !== appliedPlaybackRef.current) {
        appliedPlaybackRef.current = playbackIndexRef.current;
        applyPlayback(playbackIndexRef.current);
      }

      if (!spring.initialized && measurements.fieldHeight) {
        spring.target = targetFor(focusRef.current);
        spring.y = spring.target;
        spring.initialized = true;
      }

      const wheeling = now < gesture.wheelUntil;
      if (gesture.active || wheeling) {
        // 位置完全由手势掌控，弹簧让路
      } else if (gesture.needsSnap) {
        settle();
      } else if (gesture.fling) {
        spring.y += gesture.velocity * dt;
        gesture.velocity *= Math.exp(-dt / FLING_TAU);
        const over =
          spring.y > measurements.maxY
            ? spring.y - measurements.maxY
            : spring.y < measurements.minY
              ? measurements.minY - spring.y
              : 0;
        if (over > 0) gesture.velocity *= 0.55;
        if (Math.abs(gesture.velocity) < FLING_STOP || over > 140) settle();
        else focusRef.current = nearestIndex(spring.y);
        spring.target = spring.y;
      } else if (reducedMotion()) {
        spring.y = spring.target;
        spring.velocity = 0;
      } else {
        const distance = Math.abs(spring.y - spring.target);
        const omega = 11.5 * Math.max(0.75, Math.min(1, 1 - (distance / 2_000) * 0.25));
        const acceleration =
          -omega * omega * (spring.y - spring.target) - 2 * omega * spring.velocity;
        spring.velocity += acceleration * dt;
        spring.y += spring.velocity * dt;
      }

      if (trackRef.current) {
        trackRef.current.style.transform = `translate3d(0,${spring.y.toFixed(2)}px,0)`;
      }

      const currentLine = timedLines[nextIndex];
      const currentRow = rowRefs.current[nextIndex];
      if (currentLine && currentRow) {
        currentRow.style.setProperty('--p', String(lineProgress(currentLine, playbackMs)));
      }

      // 焦点柔光取代了旧的逐帧 textShadow：同样的呼吸感，但只动 opacity/transform
      if (glowRef.current) {
        const mid = isPlaying ? getEnergy().mid : 0;
        glowRef.current.style.opacity = String(0.06 + mid * 0.42);
        glowRef.current.style.transform = `translate3d(0,-50%,0) scaleY(${1 + mid * 0.3})`;
      }

      const interlude = interludeAt(timedLines, nextIndex, playbackMs);
      const lyricKey = `${track.id}:${nextIndex}:${interlude.active ? '间奏' : '歌唱'}`;
      if (lyricKey !== publishedLyricRef.current) {
        publishedLyricRef.current = lyricKey;
        const line = timedLines[nextIndex];
        if (!line || interlude.active) {
          // 空 beats 表示「歌词系统明确知道此刻无人声」；null 则表示没有歌词数据、允许频段兜底。
          setActiveLyric({ beats: [], progress: () => 0 });
        } else {
          setActiveLyric({
            beats: beatsOf(line),
            progress: () => lineProgress(line, getPlaybackTime() * 1_000 - offsetMs),
          });
        }
      }
      if (interlude.active !== interludeVisibleRef.current) {
        interludeVisibleRef.current = interlude.active;
        setInterludeVisible(interlude.active);
      }
      if (interludeRef.current) {
        interludeRef.current.style.setProperty('--g', String(interlude.progress));
        interludeRef.current.style.setProperty('--e', String(getEnergy().beat));
      }

      const titleBottom = titleRef.current
        ? titleRef.current.offsetTop + titleRef.current.offsetHeight
        : 0;
      if (headerRef.current) {
        headerRef.current.style.opacity = String(
          Math.max(0, Math.min(1, (-spring.y - titleBottom) / 24)),
        );
      }

      const browsing = !followingRef.current;
      if (browsing !== appliedBrowsingRef.current) {
        appliedBrowsingRef.current = browsing;
        if (fieldRef.current) fieldRef.current.dataset.browsing = browsing ? 'true' : 'false';
      }

      // 松手后停在原地 4 秒多，就自己回到此刻——不必非得去点那颗按钮
      if (
        browsing &&
        !gesture.active &&
        !gesture.fling &&
        !wheeling &&
        now - lastInputRef.current > IDLE_RETURN_MS
      ) {
        setFollowing(true);
      }
    },
    active,
  );

  // 手势期间监听 window 而不是 setPointerCapture：指针捕获会把 click 一并重定向到
  // 词场，「回到此刻」这类子按钮就再也点不动了。
  const detachRef = useRef<(() => void) | null>(null);
  useEffect(() => () => detachRef.current?.(), []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const gesture = gestureRef.current;
    detachRef.current?.();
    gesture.pointerId = event.pointerId;
    gesture.active = true;
    gesture.lastY = event.clientY;
    gesture.lastAt = performance.now();
    gesture.moved = 0;
    gesture.velocity = 0;
    gesture.fling = false;
    gesture.downTarget = event.target as HTMLElement;
    markInput();

    const onMove = (native: PointerEvent) => {
      if (!gesture.active || native.pointerId !== gesture.pointerId) return;
      const now = performance.now();
      const dy = native.clientY - gesture.lastY;
      const elapsed = Math.max(1, now - gesture.lastAt) / 1_000;
      gesture.lastY = native.clientY;
      gesture.lastAt = now;
      gesture.moved += Math.abs(dy);
      if (gesture.moved <= TAP_SLOP) return;
      if (followingRef.current) setFollowing(false);
      gesture.velocity = gesture.velocity * 0.7 + (dy / elapsed) * 0.3;
      dragBy(dy);
      markInput();
    };

    const onEnd = (native: PointerEvent) => {
      if (native.pointerId !== gesture.pointerId) return;
      detach();
      gesture.active = false;
      gesture.pointerId = -1;
      markInput();
      const target = gesture.downTarget;
      gesture.downTarget = null;

      if (gesture.moved <= TAP_SLOP) {
        // 位移够小 → 当作点击。点击一律由手势判定，行上的 click 会被拦掉，
        // 免得「想滑歌词结果跳了进度」。
        const row = target?.closest<HTMLElement>('[data-lyric-index]');
        const index = row ? Number(row.dataset.lyricIndex) : Number.NaN;
        if (Number.isInteger(index)) chooseLine(index);
        return;
      }
      // 限速：高刷屏上事件间隔可以短到几毫秒，不封顶的话一次快甩能把词场抛出几千像素
      gesture.velocity = clamp(gesture.velocity, -FLING_MAX, FLING_MAX);
      if (Math.abs(gesture.velocity) > FLING_STOP) gesture.fling = true;
      else settle();
    };

    const detach = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      detachRef.current = null;
    };
    detachRef.current = detach;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      browseTo(Math.max(0, focusRef.current) + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      browseTo(Math.max(0, focusRef.current) - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      chooseLine(Math.max(0, focusRef.current));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      seek(Math.max(0, getPlaybackTime() - 5));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      seek(getPlaybackTime() + 5);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setFollowing(true);
      springRef.current.target = targetFor(-1);
    }
  };

  return (
    <div
      ref={fieldRef}
      tabIndex={0}
      data-browsing="false"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onClickCapture={event => {
        // 歌词行上的真实点击已由手势判定过，这里拦掉避免重复；
        // 辅助技术合成的 click(detail=0) 与词场里的其它按钮照常放行。
        if (event.detail > 0 && (event.target as HTMLElement).closest('[data-lyric-index]')) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      className="lyric-field relative h-full min-h-0 touch-none overflow-clip overscroll-contain text-left outline-none"
      aria-label={`${track.title} 流动歌词，上下键浏览，回车跳转，左右键快退快进`}
    >
      <div
        ref={headerRef}
        className="pointer-events-none absolute left-3 right-3 top-5 z-20 flex items-baseline justify-between opacity-0"
      >
        <span className="max-w-[70%] truncate font-serif text-sm tracking-wider text-slate-500 dark:text-slate-400">
          {track.title}
        </span>
        <span className="font-mono text-[8px] tracking-[0.25em] uppercase text-slate-400/70 dark:text-slate-600">
          {track.artist}
        </span>
      </div>

      {/* 焦点位的柔光与水面线：歌词落进来的那道光 */}
      <div
        ref={glowRef}
        aria-hidden="true"
        className="lyric-focus-glow pointer-events-none absolute inset-x-0 z-0"
        style={{ top: `${FOCUS_RATIO * 100}%`, '--accent': color } as React.CSSProperties}
      >
        <span ref={rippleRef} className="lyric-focus-ripple" />
      </div>
      <div
        aria-hidden="true"
        className="lyric-waterline pointer-events-none absolute inset-x-0 z-10 flex items-center gap-2 px-2"
        style={{ top: `${FOCUS_RATIO * 100}%`, '--accent': color } as React.CSSProperties}
      >
        <span className="lyric-waterline-rule h-px flex-1" />
        <span
          ref={waterClockRef}
          className="font-mono text-[8px] tabular-nums tracking-[0.18em] text-slate-500 dark:text-slate-400"
        >
          0:00
        </span>
      </div>

      <div ref={trackRef} className="absolute inset-x-0 top-0 transform-gpu px-1 pb-[42vh] pt-[12%]">
        <div ref={titleRef} className="mb-14 px-3 text-left">
          <motion.h2
            layoutId={compact ? undefined : 'track-title'}
            layout="position"
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            className={`font-serif font-medium leading-[1.08] tracking-wide text-slate-800 dark:text-slate-50 ${
              compact ? 'text-[2rem]' : 'text-[2.45rem] xl:text-[3.15rem]'
            }`}
          >
            {track.title}
          </motion.h2>
          <p className="mt-3 font-mono text-[9px] tracking-[0.32em] uppercase text-slate-400 dark:text-slate-500">
            {track.artist}
          </p>
          {track.excerpt && (
            <motion.p
              layoutId={compact ? undefined : 'track-excerpt'}
              layout="position"
              transition={{ type: 'spring', stiffness: 260, damping: 30 }}
              className={`mt-6 max-w-[92%] font-serif italic leading-loose tracking-wider text-slate-500 dark:text-slate-400 ${
                compact ? 'text-sm' : 'text-base'
              }`}
            >
              <span style={{ color }}>“ </span>
              {track.excerpt}
              <span style={{ color }}> ”</span>
            </motion.p>
          )}
        </div>

        <div role="list" aria-live="off">
          {timedLines.map((line, index) => (
            <LyricRow
              key={`${line.startMs}-${index}`}
              ref={node => {
                rowRefs.current[index] = node;
              }}
              line={line}
              index={index}
              isCurrent={index === playbackIndex}
              language={language}
              compact={compact}
              color={color}
              onChoose={chooseLine}
            />
          ))}
        </div>
      </div>

      <Interlude ref={interludeRef} visible={interludeVisible} color={color} />

      <AnimatePresence>
        {!following && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onClick={() => setFollowing(true)}
            className="absolute bottom-5 left-1/2 z-30 h-9 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/70 bg-white/78 px-4 font-mono text-[8px] tracking-[0.18em] text-slate-600 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-slate-900/78 dark:text-slate-300"
          >
            回到此刻
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
