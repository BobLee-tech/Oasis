import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLyrics } from '../../hooks/useLyrics';
import type { Track } from '../../types/music';
import { LyricField } from './LyricField';
import type { LyricLanguage } from './LyricField';

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
  <div className="flex h-full flex-col items-center justify-center gap-5" role="status" aria-label="歌词载入中">
    <motion.span
      className="relative block h-10 w-10 rounded-full border border-slate-300/45 dark:border-white/10"
      animate={{ rotate: 360 }}
      transition={{ duration: 2.4, ease: 'linear', repeat: Infinity }}
    >
      <span
        className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}` }}
      />
    </motion.span>
    <span className="font-mono text-[9px] tracking-[0.34em] uppercase text-slate-400 dark:text-slate-500">
      寻觅词迹
    </span>
  </div>
);

const LyricEmpty: React.FC<{ track: Track; error?: string | null }> = ({ track, error }) => (
  <div className="flex h-full flex-col items-start justify-center px-5 text-left">
    <span className="select-none font-serif text-3xl text-slate-300 dark:text-slate-700">〽</span>
    <p className="mt-4 font-serif text-sm italic leading-loose text-slate-500 dark:text-slate-400">
      {error ?? '这首歌的词迹还在路上'}
    </p>
    {track.excerpt && (
      <p className="mt-5 max-w-sm font-serif text-base leading-loose tracking-wide text-slate-600/80 dark:text-slate-300/75">
        “{track.excerpt}”
      </p>
    )}
  </div>
);

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
  const [language, setLanguage] = useState<LyricLanguage>(preference);

  const chooseLanguage = (next: LyricLanguage) => {
    setLanguage(next);
    window.localStorage.setItem('oasis_lyric_language', next);
  };

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden">
      <AnimatePresence mode="wait">
        {lyrics.status === 'loading' || lyrics.status === 'idle' ? (
          <motion.div
            key="loading"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <LyricLoading color={color} />
          </motion.div>
        ) : lyrics.status === 'ready' && lyrics.document ? (
          <motion.div
            key={track.id}
            className="absolute inset-0"
            initial={{ opacity: 0, scaleY: 0.985 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={{ opacity: 0, scaleY: 0.99 }}
            transition={{ duration: 0.28, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="absolute right-2 top-2 z-40 flex items-center gap-2">
              <span className="hidden max-w-24 truncate font-mono text-[7px] tracking-[0.2em] uppercase text-slate-400/55 dark:text-slate-600 sm:block">
                {lyrics.document.source.label}
                {lyrics.document.translationStatus === 'machine' ? ' · 待校' : ''}
              </span>
              {lyrics.hasTranslation && (
                <div
                  className="flex items-center rounded-full bg-white/34 p-0.5 backdrop-blur-sm dark:bg-white/[0.025]"
                  aria-label="歌词语言"
                >
                  {([
                    ['bilingual', '中 · 日'],
                    ['ja', '日'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => chooseLanguage(value)}
                      aria-pressed={language === value}
                      className={`h-6 min-w-9 rounded-full px-2 font-mono text-[8px] tracking-wider transition-colors ${
                        language === value
                          ? 'bg-white/70 text-slate-700 shadow-sm dark:bg-white/10 dark:text-slate-200'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <LyricField
              lyrics={lyrics.document}
              track={track}
              color={color}
              isPlaying={isPlaying}
              active={active}
              currentTime={currentTime}
              seek={seek}
              getPlaybackTime={getPlaybackTime}
              compact={compact}
              language={language}
            />
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <LyricEmpty track={track} error={lyrics.error} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
