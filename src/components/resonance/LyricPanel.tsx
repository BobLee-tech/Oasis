import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLyrics } from '../../hooks/useLyrics';
import { findActiveLine } from '../../lib/lyrics';
import type { LyricsDocument, Track } from '../../types/music';

type LyricLanguage = 'bilingual' | 'ja';

interface LyricPanelProps {
  track: Track;
  color: string;
  isPlaying: boolean;
  active: boolean;
  currentTime: number;
  seek: (seconds: number) => void;
  getPlaybackTime: () => number;
  compact?: boolean;
}

const preference = (): LyricLanguage => {
  if (typeof window === 'undefined') return 'bilingual';
  return window.localStorage.getItem('oasis_lyric_language') === 'ja' ? 'ja' : 'bilingual';
};

const LyricLoading: React.FC<{ color: string }> = ({ color }) => (
  <div className="h-full flex flex-col items-center justify-center gap-5" role="status" aria-label="歌词载入中">
    <motion.span
      className="relative block w-10 h-10 rounded-full border border-slate-300/60 dark:border-white/10"
      animate={{ rotate: 360 }}
      transition={{ duration: 2.4, ease: 'linear', repeat: Infinity }}
    >
      <span className="absolute left-1/2 top-0 w-1.5 h-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}` }} />
    </motion.span>
    <span className="font-mono text-[9px] tracking-[0.34em] uppercase text-slate-400 dark:text-slate-500">寻觅词迹</span>
  </div>
);

const LyricEmpty: React.FC<{ track: Track; error?: string | null }> = ({ track, error }) => (
  <div className="h-full flex flex-col items-center justify-center px-8 text-center">
    <span className="font-serif text-3xl text-slate-300 dark:text-slate-700 select-none">〽</span>
    <p className="mt-4 font-serif italic text-sm leading-loose text-slate-500 dark:text-slate-400">
      {error ?? '这首歌的词迹还在路上'}
    </p>
    {track.excerpt && (
      <p className="mt-5 max-w-sm font-serif text-base leading-loose tracking-wide text-slate-600/80 dark:text-slate-300/75">
        “{track.excerpt}”
      </p>
    )}
  </div>
);

const LyricLines: React.FC<{
  lyrics: LyricsDocument;
  track: Track;
  color: string;
  isPlaying: boolean;
  active: boolean;
  currentTime: number;
  seek: (seconds: number) => void;
  getPlaybackTime: () => number;
  compact: boolean;
}> = ({ lyrics, track, color, isPlaying, active, currentTime, seek, getPlaybackTime, compact }) => {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [following, setFollowing] = useState(true);
  const [language, setLanguage] = useState<LyricLanguage>(preference);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndexRef = useRef(-1);
  const programmaticScroll = useRef(false);
  const hasTranslation = lyrics.lines.some(line => Boolean(line.zh));
  const offsetMs = lyrics.offsetMs + (track.lyrics?.offsetMs ?? 0);
  const visibleIndex = isPlaying
    ? activeIndex
    : findActiveLine(lyrics.lines, currentTime * 1_000 - offsetMs);

  useEffect(() => {
    if (!active || !isPlaying) return;
    let raf = 0;
    const tick = () => {
      if (document.visibilityState === 'visible') {
        // LRC offset 为正表示歌词整体延后：播放时钟减去 offset 后再落到原始时间轴。
        const next = findActiveLine(lyrics.lines, getPlaybackTime() * 1_000 - offsetMs);
        if (next !== activeIndexRef.current) {
          activeIndexRef.current = next;
          setActiveIndex(next);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, getPlaybackTime, isPlaying, lyrics.lines, offsetMs]);

  useEffect(() => {
    if (!following || visibleIndex < 0) return;
    const scroller = scrollerRef.current;
    const line = lineRefs.current[visibleIndex];
    if (!scroller || !line) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    programmaticScroll.current = true;
    scroller.scrollTo({
      top: line.offsetTop - scroller.clientHeight * 0.43 + line.clientHeight / 2,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
    const timer = window.setTimeout(() => { programmaticScroll.current = false; }, reduceMotion ? 0 : 650);
    return () => window.clearTimeout(timer);
  }, [following, visibleIndex]);

  const suspendFollowing = () => {
    if (!programmaticScroll.current) setFollowing(false);
  };

  const chooseLanguage = (next: LyricLanguage) => {
    setLanguage(next);
    window.localStorage.setItem('oasis_lyric_language', next);
  };

  const goToLine = (startMs: number) => {
    seek(Math.max(0, (startMs + offsetMs) / 1_000));
    setFollowing(true);
  };

  return (
    <div className="relative h-full min-h-0 flex flex-col">
      <div className="shrink-0 h-11 flex items-center justify-between gap-3 px-4 border-b border-slate-200/50 dark:border-white/[0.06]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color, boxShadow: isPlaying ? `0 0 8px ${color}` : 'none' }} />
          <span className="font-mono text-[8px] tracking-[0.26em] uppercase text-slate-400 dark:text-slate-500 truncate">
            {lyrics.source.label}
          </span>
          {lyrics.translationStatus === 'machine' && (
            <span className="font-mono text-[7px] tracking-wider text-amber-500/80 dark:text-amber-300/60 shrink-0">待校</span>
          )}
        </div>
        {hasTranslation && (
          <div className="flex items-center rounded-full bg-slate-900/[0.035] dark:bg-white/[0.04] p-0.5" aria-label="歌词语言">
            {([
              ['bilingual', '中 · 日'],
              ['ja', '日'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => chooseLanguage(value)}
                aria-pressed={language === value}
                className={`min-w-9 h-6 px-2 rounded-full font-mono text-[8px] tracking-wider transition-colors ${
                  language === value
                    ? 'bg-white/85 dark:bg-white/10 text-slate-700 dark:text-slate-200 shadow-sm'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollerRef}
          onPointerDown={suspendFollowing}
          onWheel={suspendFollowing}
          className="absolute inset-0 overflow-y-auto overscroll-contain touch-pan-y [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            maskImage: 'linear-gradient(to bottom, transparent 0, #000 13%, #000 87%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 13%, #000 87%, transparent 100%)',
          }}
          aria-label={`${track.title} 歌词`}
          aria-live="off"
        >
          <div className={compact ? 'py-[34vh]' : 'py-[30%]'}>
            {lyrics.lines.map((line, index) => {
              const distance = visibleIndex < 0 ? 3 : Math.abs(index - visibleIndex);
              const isCurrent = index === visibleIndex;
              const opacity = isCurrent ? 1 : distance === 1 ? 0.5 : distance === 2 ? 0.3 : 0.18;
              return (
                <button
                  key={`${line.startMs}-${index}`}
                  ref={node => { lineRefs.current[index] = node; }}
                  type="button"
                  onClick={() => goToLine(line.startMs)}
                  aria-label={`跳转到 ${(line.startMs / 1_000).toFixed(1)} 秒：${line.ja}`}
                  className={`relative block w-full text-center outline-none px-5 ${compact ? 'py-3.5' : 'py-4'} transform-gpu transition-[opacity,transform,color] duration-500 ease-out focus-visible:opacity-100`}
                  style={{
                    opacity,
                    transform: isCurrent ? 'scale(1.025)' : 'scale(0.985)',
                    color: isCurrent ? color : undefined,
                  }}
                >
                  {isCurrent && (
                    <span
                      className="absolute inset-x-[12%] -inset-y-1 -z-10 rounded-[50%] blur-2xl opacity-[0.12] pointer-events-none"
                      style={{ backgroundColor: color }}
                    />
                  )}
                  <span className={`block font-serif tracking-[0.08em] leading-[1.75] ${compact ? 'text-[17px]' : 'text-lg xl:text-xl'} ${isCurrent ? 'font-medium' : 'text-slate-600 dark:text-slate-300'}`}>
                    {line.ja}
                  </span>
                  {language === 'bilingual' && line.zh && (
                    <span className={`block mt-1.5 font-sans leading-relaxed tracking-[0.04em] ${compact ? 'text-[12px]' : 'text-[13px]'} ${isCurrent ? 'opacity-75' : 'text-slate-400 dark:text-slate-500'}`}>
                      {line.zh}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <AnimatePresence>
          {!following && visibleIndex >= 0 && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={() => setFollowing(true)}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 h-9 px-4 rounded-full bg-white/80 dark:bg-slate-900/80 border border-white/70 dark:border-white/10 backdrop-blur-xl shadow-lg font-mono text-[8px] tracking-[0.18em] text-slate-600 dark:text-slate-300 whitespace-nowrap"
            >
              回到此刻
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export const LyricPanel: React.FC<LyricPanelProps> = ({
  track,
  color,
  isPlaying,
  active,
  currentTime,
  seek,
  getPlaybackTime,
  compact = false,
}) => {
  const lyrics = useLyrics(track, active);

  return (
    <div className="relative w-full h-full min-h-0 overflow-hidden rounded-[1.75rem] bg-white/28 dark:bg-white/[0.018] border border-white/50 dark:border-white/[0.07] backdrop-blur-md shadow-[0_22px_65px_rgba(30,41,59,0.07)] dark:shadow-[0_22px_65px_rgba(0,0,0,0.2)]">
      <AnimatePresence mode="wait">
        {lyrics.status === 'loading' || lyrics.status === 'idle' ? (
          <motion.div key="loading" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LyricLoading color={color} />
          </motion.div>
        ) : lyrics.status === 'ready' && lyrics.document ? (
          <motion.div key={track.id} className="absolute inset-0" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}>
            <LyricLines
              key={track.id}
              lyrics={lyrics.document}
              track={track}
              color={color}
              isPlaying={isPlaying}
              active={active}
              currentTime={currentTime}
              seek={seek}
              getPlaybackTime={getPlaybackTime}
              compact={compact}
            />
          </motion.div>
        ) : (
          <motion.div key="empty" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LyricEmpty track={track} error={lyrics.error} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
