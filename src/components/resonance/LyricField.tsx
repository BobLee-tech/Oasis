import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getEnergy } from '../../hooks/useSoundscape';
import { interludeAt, lineProgress, prepareTimedLines } from '../../lib/lyricTiming';
import { findActiveLine } from '../../lib/lyrics';
import { useTicker } from '../../lib/ticker';
import type { LyricsDocument, Track } from '../../types/music';
import { Interlude } from './Interlude';
import { LyricRow } from './LyricRow';

type LyricLanguage = 'bilingual' | 'ja';

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

const alphaHex = (alpha: number) =>
  Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');

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
  const [browseIndex, setBrowseIndex] = useState(Math.max(0, initialIndex));
  const [following, setFollowing] = useState(true);
  const [interludeVisible, setInterludeVisible] = useState(false);

  const fieldRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const interludeRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const measurementsRef = useRef<{ tops: number[]; heights: number[]; fieldHeight: number }>({
    tops: [],
    heights: [],
    fieldHeight: 0,
  });
  const springRef = useRef({ y: 0, target: 0, velocity: 0, initialized: false });
  const playbackIndexRef = useRef(initialIndex);
  const displayIndexRef = useRef(initialIndex);
  const previousDisplayIndexRef = useRef(initialIndex);
  const interludeVisibleRef = useRef(false);
  const followingRef = useRef(true);
  const browseIndexRef = useRef(Math.max(0, initialIndex));
  const gestureStartRef = useRef<number | null>(null);
  const wheelAtRef = useRef(0);

  const displayIndex = following ? playbackIndex : browseIndex;

  useEffect(() => {
    playbackIndexRef.current = playbackIndex;
  }, [playbackIndex]);
  useEffect(() => {
    displayIndexRef.current = displayIndex;
  }, [displayIndex]);
  useEffect(() => {
    followingRef.current = following;
  }, [following]);
  useEffect(() => {
    browseIndexRef.current = browseIndex;
  }, [browseIndex]);

  const targetFor = useCallback((index: number) => {
    const { tops, heights, fieldHeight } = measurementsRef.current;
    if (!fieldHeight) return springRef.current.target;
    if (index < 0) {
      const title = titleRef.current;
      return title ? fieldHeight * 0.19 - title.offsetTop : 0;
    }
    if (tops[index] === undefined) return springRef.current.target;
    return -(tops[index] + heights[index] / 2) + fieldHeight * 0.42;
  }, []);

  const measure = useCallback(() => {
    const field = fieldRef.current;
    const trackElement = trackRef.current;
    if (!field || !trackElement) return;
    field.scrollTop = 0;
    const fieldTop = field.getBoundingClientRect().top;
    const currentY = springRef.current.initialized ? springRef.current.y : 0;
    measurementsRef.current = {
      // 用视觉坐标反推 y=0 时的位置，兼容 Framer layout projection 在祖先层施加的变换。
      tops: rowRefs.current.map(row =>
        row ? row.getBoundingClientRect().top - fieldTop - currentY : 0),
      heights: rowRefs.current.map(row => row?.offsetHeight ?? 0),
      fieldHeight: field.clientHeight,
    };
    const spring = springRef.current;
    spring.target = targetFor(displayIndexRef.current);
    if (!spring.initialized) {
      spring.y = spring.target;
      spring.velocity = 0;
      spring.initialized = true;
      if (trackRef.current) trackRef.current.style.transform = `translate3d(0,${spring.y}px,0)`;
    }
  }, [targetFor]);

  useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (fieldRef.current) observer.observe(fieldRef.current);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [measure, timedLines, language, compact, track.id]);

  useEffect(() => {
    const spring = springRef.current;
    const nextTarget = targetFor(displayIndex);
    const jumped = Math.abs(displayIndex - previousDisplayIndexRef.current) > 3;
    spring.target = nextTarget;
    if (jumped || reducedMotion()) {
      spring.y = nextTarget;
      spring.velocity = 0;
    }
    previousDisplayIndexRef.current = displayIndex;

    rowRefs.current.forEach((row, index) => {
      if (!row) return;
      row.style.setProperty('--d', String(Math.abs(index - displayIndex)));
      row.style.setProperty('--past', index < displayIndex ? '1' : '0');
      if (index < playbackIndexRef.current) row.style.setProperty('--p', '1');
      else if (index > playbackIndexRef.current) row.style.setProperty('--p', '0');
    });
  }, [displayIndex, targetFor]);

  useTicker(
    (_now, dt) => {
      const playbackMs = (isPlaying ? getPlaybackTime() : currentTime) * 1_000 - offsetMs;
      const nextIndex = findActiveLine(timedLines, playbackMs);
      if (nextIndex !== playbackIndexRef.current) {
        playbackIndexRef.current = nextIndex;
        setPlaybackIndex(nextIndex);
        if (followingRef.current) displayIndexRef.current = nextIndex;
      }

      const spring = springRef.current;
      if (!spring.initialized) {
        spring.target = targetFor(displayIndexRef.current);
        spring.y = spring.target;
        spring.initialized = true;
      }
      if (reducedMotion()) {
        spring.y = spring.target;
        spring.velocity = 0;
      } else {
        const distance = Math.abs(spring.y - spring.target);
        const omega = 11.5 * Math.max(0.75, Math.min(1, 1 - distance / 2_000 * 0.25));
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
        const mid = isPlaying ? getEnergy().mid : 0;
        const glowAlpha = 0.14 + mid * 0.32;
        currentRow.style.textShadow = `0 0 ${10 + mid * 26}px ${color}${alphaHex(glowAlpha)}`;
      }

      const interlude = interludeAt(timedLines, nextIndex, playbackMs);
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
    },
    active,
  );

  const chooseLine = (index: number) => {
    const line = timedLines[index];
    if (!line) return;
    seek(Math.max(0, (line.startMs + offsetMs) / 1_000));
    if (fieldRef.current) fieldRef.current.scrollTop = 0;
    springRef.current.target = targetFor(index);
    springRef.current.y = springRef.current.target;
    springRef.current.velocity = 0;
    setFollowing(true);
  };

  const browseTo = (index: number) => {
    const next = Math.max(0, Math.min(timedLines.length - 1, index));
    browseIndexRef.current = next;
    setBrowseIndex(next);
    setFollowing(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      browseTo((following ? Math.max(0, playbackIndex) : browseIndex) + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      browseTo((following ? Math.max(0, playbackIndex) : browseIndex) - 1);
    } else if (event.key === 'Enter' && !following) {
      event.preventDefault();
      chooseLine(browseIndex);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setFollowing(true);
      springRef.current.target = targetFor(-1);
    }
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const now = performance.now();
    if (Math.abs(event.deltaY) < 8 || now - wheelAtRef.current < 140) return;
    wheelAtRef.current = now;
    browseTo(
      (following ? Math.max(0, playbackIndexRef.current) : browseIndexRef.current) +
        (event.deltaY > 0 ? 1 : -1),
    );
  };

  return (
    <div
      ref={fieldRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onWheel={onWheel}
      onPointerDown={event => {
        gestureStartRef.current = event.clientY;
      }}
      onPointerUp={event => {
        if (gestureStartRef.current === null) return;
        const delta = gestureStartRef.current - event.clientY;
        gestureStartRef.current = null;
        if (Math.abs(delta) > 32) {
          browseTo(
            (following ? Math.max(0, playbackIndexRef.current) : browseIndexRef.current) +
              (delta > 0 ? 1 : -1),
          );
        }
      }}
      className="relative h-full min-h-0 overflow-clip text-left outline-none"
      style={{
        maskImage: 'linear-gradient(to bottom, transparent 0, #000 11%, #000 88%, transparent 100%)',
        WebkitMaskImage:
          'linear-gradient(to bottom, transparent 0, #000 11%, #000 88%, transparent 100%)',
      }}
      aria-label={`${track.title} 流动歌词，方向键浏览，回车跳转`}
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

      <div ref={trackRef} className="absolute inset-x-0 top-0 transform-gpu px-1 pb-[42vh] pt-[12%]">
        <div ref={titleRef} className="mb-14 px-3 text-left">
          <motion.h2
            layoutId={compact ? undefined : 'track-title'}
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
          {timedLines.map((line, index) => {
            const distance = displayIndex < 0 ? index + 1 : Math.abs(index - displayIndex);
            return (
              <LyricRow
                key={`${line.startMs}-${index}`}
                ref={node => {
                  rowRefs.current[index] = node;
                }}
                line={line}
                index={index}
                distance={distance}
                isCurrent={index === playbackIndex}
                isPast={index < playbackIndex}
                showTranslation={language === 'bilingual' && distance <= 1}
                compact={compact}
                color={color}
                onChoose={chooseLine}
              />
            );
          })}
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

export type { LyricLanguage };
