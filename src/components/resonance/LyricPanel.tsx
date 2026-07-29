import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLyrics } from '../../hooks/useLyrics';
import type { LyricLanguage, Track } from '../../types/music';
import { LyricField } from './LyricField';

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
  const stored = window.localStorage.getItem('oasis_lyric_language');
  return stored === 'ja' || stored === 'zh' ? stored : 'bilingual';
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

const InstrumentalEmpty: React.FC<{ track: Track; color: string }> = ({ track, color }) => (
  <div className="flex h-full flex-col items-center justify-center px-6 text-center">
    <div
      className="instrumental-orbit relative h-24 w-24 rounded-full"
      style={{ '--accent': color } as React.CSSProperties}
      aria-hidden="true"
    >
      <span className="absolute inset-[18%] rounded-full border border-current" />
      <span className="absolute inset-[36%] rounded-full border border-current" />
      <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
    </div>
    <p className="mt-7 font-ja text-lg tracking-[0.16em] text-slate-600 dark:text-slate-300">
      纯器乐
    </p>
    <p className="mt-2 font-zh text-sm tracking-[0.12em] text-slate-400 dark:text-slate-500">
      此曲无词，且听水纹
    </p>
    {track.excerpt && (
      <p className="mt-6 max-w-sm font-zh text-sm leading-loose text-slate-500/75 dark:text-slate-400/70">
        {track.excerpt.replace(/^---\s*|\s*---$/g, '')}
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
              <span className="hidden max-w-32 truncate font-mono text-[7px] tracking-[0.2em] uppercase text-slate-400/55 dark:text-slate-600 sm:block">
                {lyrics.document.source.label}
                {lyrics.document.translator ? ` · 译：${lyrics.document.translator}` : ''}
                {lyrics.document.translationStatus === 'machine' ? ' · 待校' : ''}
              </span>
              {lyrics.hasTranslation && (
                <div
                  className="flex items-center rounded-full bg-white/34 p-0.5 backdrop-blur-sm dark:bg-white/[0.025]"
                  aria-label="歌词语言"
                >
                  {([
                    ['ja', '日'],
                    ['bilingual', '日中'],
                    ['zh', '中'],
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
              language={lyrics.hasTranslation ? language : 'ja'}
            />
          </motion.div>
        ) : lyrics.status === 'instrumental' ? (
          <motion.div
            key="instrumental"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <InstrumentalEmpty track={track} color={color} />
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
