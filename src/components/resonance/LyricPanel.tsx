import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLyrics } from '../../hooks/useLyrics';
import { getPlaybackTime, seek } from '../../hooks/useSoundscape';
import type { LyricLanguage, Track } from '../../types/music';
import { LyricField } from './LyricField';
import { InstrumentalPond } from './InstrumentalPond';
import { MOTION } from '../../lib/motion';
// 🅰️ Klee One：--font-ja 专用，只有 LyricRow 的 .lyric-ja 用到。124 条 @font-face 声明
//    随本 chunk（懒加载）一起到达，不占全站首屏关键 CSS——见 main.tsx 顶部注释。
import '@fontsource/klee-one/600.css';

interface LyricPanelProps {
  track: Track;
  color: string;
  isPlaying: boolean;
  active: boolean;
  compact?: boolean;
  /** 栏头歌名即内页入口；参数是涟漪的原点 */
  onOpenNotes?: (origin: HTMLElement) => void;
  /** 动态氛围开且未要求减弱动态：纯器乐才有会动的水面，否则是静止的水纹 */
  ambient?: boolean;
}

const preference = (): LyricLanguage => {
  if (typeof window === 'undefined') return 'bilingual';
  const stored = window.localStorage.getItem('oasis_lyric_language');
  return stored === 'ja' || stored === 'zh' ? stored : 'bilingual';
};

const furiganaPreference = () => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('oasis_lyric_furigana') === '1';
  } catch {
    return false;
  }
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

/** 静止版（氛围关 / 减弱动态 / 无 WebGL2）：原来的 CSS 水纹 */
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

const LANGUAGE_WORD: Record<LyricLanguage, string> = { ja: '日', bilingual: '日中', zh: '中' };

/**
 * Aa：阅读设置收进一枚按钮。设置是偶尔用的，状态却要一眼看到——所以按钮上直接写
 * 当前状态（「日中 · 注音」），弹层里才是开关与来源。最小字号 10px。
 */
const ReadingSettings: React.FC<{
  language: LyricLanguage;
  onLanguage: (next: LyricLanguage) => void;
  hasTranslation: boolean;
  furigana: boolean;
  onFurigana: () => void;
  hasReadings: boolean;
  source: string;
}> = ({ language, onLanguage, hasTranslation, furigana, onFurigana, hasReadings, source }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const showFurigana = hasReadings && language !== 'zh';

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const state = [hasTranslation ? LANGUAGE_WORD[language] : '', showFurigana && furigana ? '注音' : ''].filter(Boolean).join(' · ');

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`歌词阅读设置${state ? `：${state}` : ''}`}
        className={`flex h-8 items-center gap-2 rounded-full border px-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--mood)] ${
          open
            ? 'border-[color:color-mix(in_srgb,var(--mood)_55%,transparent)] bg-white/70 text-slate-700 dark:bg-white/10 dark:text-slate-100'
            : 'border-slate-300/50 bg-white/40 text-slate-500 hover:text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:text-slate-200'
        }`}
      >
        <span className="font-serif text-[15px] leading-none">Aa</span>
        {state && <span className="font-mono text-[10px] tracking-[0.14em] opacity-80">{state}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="歌词阅读设置"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={MOTION.swap}
            className="absolute right-0 top-10 z-50 grid w-60 gap-3.5 rounded-2xl border border-slate-200/70 bg-white/92 p-3.5 text-left shadow-[0_20px_50px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-white/10 dark:bg-[#111728]/94 dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
          >
            {hasTranslation && (
              <div>
                <p className="mb-1.5 font-mono text-[10px] tracking-[0.2em] text-slate-400 dark:text-slate-500">语言</p>
                <div className="flex rounded-full bg-slate-900/[0.05] p-0.5 dark:bg-white/[0.05]" role="group" aria-label="歌词语言">
                  {(['ja', 'bilingual', 'zh'] as const).map(value => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onLanguage(value)}
                      aria-pressed={language === value}
                      className={`h-7 flex-1 rounded-full font-[family-name:var(--font-zh)] text-[12px] tracking-[0.1em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--mood)] ${
                        language === value ? 'text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                      style={language === value ? { backgroundColor: 'var(--mood)' } : undefined}
                    >
                      {value === 'bilingual' ? '日 · 中' : LANGUAGE_WORD[value]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showFurigana && (
              <label className="flex cursor-pointer items-center justify-between gap-3 font-[family-name:var(--font-zh)] text-[13px] text-slate-600 dark:text-slate-300">
                注音（汉字上标假名）
                <button
                  type="button"
                  role="switch"
                  aria-checked={furigana}
                  onClick={onFurigana}
                  className="relative h-[22px] w-[38px] shrink-0 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--mood)]"
                  style={{ backgroundColor: furigana ? 'var(--mood)' : 'rgba(148,163,184,0.35)' }}
                >
                  <span className={`absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${furigana ? 'translate-x-4' : ''}`} />
                </button>
              </label>
            )}
            <p className={`font-mono text-[10px] leading-relaxed tracking-[0.1em] text-slate-400 dark:text-slate-500 ${hasTranslation || showFurigana ? 'border-t border-slate-200/70 pt-2.5 dark:border-white/10' : ''}`}>
              {source}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const LyricPanel: React.FC<LyricPanelProps> = ({
  track,
  color,
  isPlaying,
  active,
  compact = false,
  onOpenNotes,
  ambient = true,
}) => {
  const lyrics = useLyrics(track, active);
  const [language, setLanguage] = useState<LyricLanguage>(preference);
  const [furigana, setFurigana] = useState(furiganaPreference);
  const hasReadings = Boolean(lyrics.document?.lines.some(line => line.kana?.length));
  const ready = lyrics.status === 'ready' && lyrics.document;

  const toggleFurigana = () => {
    setFurigana(current => {
      try {
        window.localStorage.setItem('oasis_lyric_furigana', current ? '0' : '1');
      } catch {
        // 隐私模式下记不住也无妨
      }
      return !current;
    });
  };

  const chooseLanguage = (next: LyricLanguage) => {
    setLanguage(next);
    try {
      window.localStorage.setItem('oasis_lyric_language', next);
    } catch {
      // 同上
    }
  };

  const source = lyrics.document
    ? [
        `词：${lyrics.document.source.label}`,
        lyrics.document.translator ? `译：${lyrics.document.translator}` : '',
        lyrics.document.translationStatus === 'machine' ? '待校' : '',
      ].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="relative h-full min-h-0 w-full">
      {/* 栏头：歌名（内页入口）与阅读设置固定在这里，词场只放歌词 */}
      <div className={`absolute inset-x-0 top-0 z-40 flex items-center justify-between gap-4 ${compact ? 'h-10 px-1' : 'h-11 px-3'}`}>
        <div className="flex min-w-0 items-baseline gap-3">
          {onOpenNotes ? (
            <button
              type="button"
              onClick={event => onOpenNotes(event.currentTarget)}
              aria-label={`${track.title}，翻开内页`}
              title="翻开内页"
              className={`-mx-1.5 min-w-0 truncate rounded-lg px-1.5 text-left font-serif leading-tight tracking-wide text-slate-800 outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--mood)_8%,transparent)] focus-visible:ring-2 focus-visible:ring-[color:var(--mood)] dark:text-slate-50 ${compact ? 'text-[17px]' : 'text-[20px]'}`}
            >
              <span lang="ja">{track.title}</span>
            </button>
          ) : (
            <span lang="ja" className={`min-w-0 truncate font-serif tracking-wide text-slate-800 dark:text-slate-50 ${compact ? 'text-[17px]' : 'text-[20px]'}`}>{track.title}</span>
          )}
          {!compact && (
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">{track.artist}</span>
          )}
        </div>
        {ready && (
          <ReadingSettings
            language={language}
            onLanguage={chooseLanguage}
            hasTranslation={lyrics.hasTranslation}
            furigana={furigana}
            onFurigana={toggleFurigana}
            hasReadings={hasReadings}
            source={source}
          />
        )}
      </div>

      <div className={`absolute inset-x-0 bottom-0 overflow-hidden ${compact ? 'top-11' : 'top-12'}`}>
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
          ) : ready ? (
            <motion.div
              key={track.id}
              className="absolute inset-0"
              initial={{ opacity: 0, scaleY: 0.985 }}
              animate={{ opacity: 1, scaleY: 1 }}
              exit={{ opacity: 0, scaleY: 0.99 }}
              transition={{ duration: 0.28, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            >
              <LyricField
                lyrics={lyrics.document!}
                track={track}
                color={color}
                isPlaying={isPlaying}
                active={active}
                seek={seek}
                getPlaybackTime={getPlaybackTime}
                compact={compact}
                language={lyrics.hasTranslation ? language : 'ja'}
                furigana={furigana && hasReadings}
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
              {ambient ? (
                <InstrumentalPond
                  track={track}
                  color={color}
                  isPlaying={isPlaying}
                  active={active}
                  compact={compact}
                  fallback={<InstrumentalEmpty track={track} color={color} />}
                />
              ) : (
                <InstrumentalEmpty track={track} color={color} />
              )}
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
    </div>
  );
};
