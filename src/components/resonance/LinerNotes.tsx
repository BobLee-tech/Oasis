// 📜 曲目卡（liner notes，docs/music-design.md A6 + docs/music-ripple-notes-demo.html）：唱片纸套的内页。
//
// 只负责纸套上的字，不负责开合——开合是 RippleReveal 的涟漪。
//   · 桌面：竖排标题贴着唱机右缘像书脊，点它就是合上；右边一栏是署名、介绍、你的话
//   · 手机：横排标题 + 同样的几段，整页可滚
//   · 需要随涟漪错峰浮出的块标 data-ripple；字段缺了整段不显示，不留空壳
//   · 情绪色只用在分隔线、感受词、首字与情绪水纹小印上，正文用墨色
import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PLAYLIST, switchTrack } from '../../hooks/useSoundscape';
import { MOTION } from '../../lib/motion';
import { useTrackProfile } from '../../lib/trackProfile';
import { BLENDS, FEELS, FEEL_LABELS, blendOf, isSplit } from '../../../scripts/lib/mood-core.mjs';
import type { TrackProfile } from '../../types/music';
import type { Track, TrackCredits, TrackRelationKind } from '../../types/music';
import '@fontsource/klee-one/600.css';

const SEASON_WORD = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' } as const;
const TIME_WORD = { morning: '清晨', dusk: '黄昏', night: '夜' } as const;
const RELATION_WORD: Record<TrackRelationKind, string> = {
  reply: '回信', sequel: '续篇', sameStory: '同一个故事', sameLyrics: '同一份词',
};
const ROLE_WORD: Record<keyof TrackCredits, string> = { lyricist: '作词', composer: '作曲', arranger: '编曲', vocal: '演唱' };

/** 「作词 n-buna / 作曲 n-buna / 编曲 n-buna」→「作词·作曲·编曲  n-buna」：同一组人只写一次。 */
const creditRows = (credits?: TrackCredits) => {
  if (!credits) return [];
  const rows: { roles: string[]; names: string }[] = [];
  for (const role of ['lyricist', 'composer', 'arranger', 'vocal'] as const) {
    const names = credits[role]?.join(' / ');
    if (!names) continue;
    const same = rows.find(row => row.names === names);
    if (same) same.roles.push(ROLE_WORD[role]);
    else rows.push({ roles: [ROLE_WORD[role]], names });
  }
  return rows;
};

const SOURCE_WORD: Record<string, string> = {
  netease: '网易云', vocadb: 'VocaDB', musicbrainz: 'MusicBrainz', web: '网页', tags: '音频标签',
};

// 感受词（docs/song-emotion-design.md §5）：有复合情绪就说复合名（切ない、释然…，只在你没标「说不准」时），
// 否则说强度 ≥ 2 的前两维；都没有时退回最强的一维。VA 猜的不说。
const feelWordOf = (profile: TrackProfile | null | undefined) => {
  const mood = profile?.mood;
  if (!mood?.feel || profile!.provenance['mood.feel'] === 'va') return '';
  const feels = mood.feels;
  const blend = mood.sure !== false ? blendOf(feels) : undefined;
  if (blend) return BLENDS.find(item => item.id === blend)!.label;
  const strong = FEELS.filter(feel => (feels?.[feel] ?? 0) >= 2).sort((a, b) => feels![b]! - feels![a]!).slice(0, 2);
  return strong.length ? strong.map(feel => FEEL_LABELS[feel]).join('而') : FEEL_LABELS[mood.feel];
};

/** 词和曲的明暗拉开时加一个小标（两个分量都得是写出来的） */
const splitWordOf = (profile: TrackProfile | null | undefined) => {
  const mood = profile?.mood;
  if (!mood || !isSplit(mood.lyricValence, mood.soundValence)) return '';
  return mood.soundValence! > mood.lyricValence! ? '曲亮词暗' : '曲暗词亮';
};

/** 情绪水纹小印：每一圈是一维 feels（最强的四维），粗细 = 强度 0–3。只认你标的，VA 猜的不画。 */
const FeelSeal: React.FC<{ profile: TrackProfile | null | undefined }> = ({ profile }) => {
  const feels = profile?.mood?.feels;
  if (!feels || profile!.provenance['mood.feels'] === 'va') return null;
  const rings = FEELS.map(feel => feels[feel] ?? 0).filter(value => value > 0).sort((a, b) => b - a).slice(0, 4);
  if (!rings.length) return null;
  return (
    <svg viewBox="0 0 46 46" className="h-11 w-11 shrink-0" aria-hidden>
      {rings.map((value, index) => (
        <circle
          key={index}
          cx="23" cy="23" r={6 + index * 5}
          fill="none" stroke="var(--mood)"
          strokeWidth={0.6 + value * 0.7}
          opacity={0.95 - index * 0.18}
        />
      ))}
      <circle cx="23" cy="23" r="2" fill="var(--mood)" />
    </svg>
  );
};

const Rule = () => (
  <div
    aria-hidden
    data-ripple
    className="my-5 h-px w-full"
    style={{ background: 'linear-gradient(90deg, color-mix(in srgb, var(--mood) 55%, transparent), transparent 85%)' }}
  />
);

/** 竖排标题按视觉长度分档：假名/汉字算 1，其余算 0.6 */
const verticalTitleSize = (title: string) => {
  let width = 0;
  for (const ch of title) width += /[\u3000-\u9FFF\uFF00-\uFFEF]/.test(ch) ? 1 : 0.6;
  if (width <= 9) return 'text-[2.5rem]';
  if (width <= 14) return 'text-[2rem]';
  return 'text-[1.6rem]';
};

const SleeveBody: React.FC<{ track: Track; isOwner: boolean; compact: boolean; onClose: () => void }> = ({ track, isOwner, compact, onClose }) => {
  const profile = useTrackProfile(track.id);
  const credits = creditRows(profile?.credits);
  const note = isOwner ? profile?.note : profile?.noteVisitor ?? profile?.note;
  const feelWords = [
    feelWordOf(profile),
    splitWordOf(profile),
    profile?.mood?.season ? SEASON_WORD[profile.mood.season] : '',
    profile?.mood?.time && profile.provenance['mood.time'] === 'manual' ? TIME_WORD[profile.mood.time] : '',
  ].filter(Boolean);
  const relations = (profile?.relations ?? [])
    .map(relation => ({ ...relation, track: PLAYLIST.find(item => item.id === relation.to) }))
    .filter((relation): relation is typeof relation & { track: Track } => Boolean(relation.track));
  const meta = [
    profile?.trackNo ? `No.${String(profile.trackNo).padStart(2, '0')}` : '',
    profile?.album,
    profile?.released?.replace(/-/g, '.') ?? (profile?.year ? String(profile.year) : ''),
  ].filter(Boolean);

  // 署名：只列这张卡上真的显示了的字段的出处
  const shown = ['titleAlt', 'album', 'released', 'credits', 'tieIn', 'intro'].filter(key => profile?.provenance[key]);
  const sources = [...new Set(shown.map(key => profile!.provenance[key]))]
    .map(source => (source === 'manual' ? (isOwner ? '你' : '站主') : SOURCE_WORD[source]))
    .filter(Boolean);

  const hasFacts = credits.length > 0 || Boolean(profile?.tieIn);
  const hasVoice = Boolean(note) || relations.length > 0;
  const season = profile?.mood?.season ? SEASON_WORD[profile.mood.season] : '';

  const titleBlock = compact ? (
    <header data-ripple className="flex items-start justify-between gap-4 pr-1">
      <div className="min-w-0">
        <h3 lang="ja" className="font-[family-name:var(--font-ja)] text-[1.7rem] font-semibold leading-tight tracking-[0.08em] text-slate-800 dark:text-slate-50">
          {track.title}
        </h3>
        {profile?.titleAlt && (
          <p className="mt-1 font-[family-name:var(--font-zh)] text-[13px] tracking-[0.3em] text-slate-500 dark:text-slate-400">{profile.titleAlt}</p>
        )}
      </div>
      <button
        type="button"
        data-ripple-focus
        onClick={onClose}
        aria-label="合上内页"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 outline-none transition-colors hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-[color:var(--mood)] dark:hover:text-slate-200"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>
  ) : (
    <button
      type="button"
      data-ripple
      data-ripple-focus
      onClick={onClose}
      aria-label={`合上「${track.title}」的内页`}
      title="合上内页"
      className="group/spine flex max-h-full shrink-0 flex-col items-start gap-3 self-start rounded-2xl px-1.5 py-2 text-left outline-none [writing-mode:vertical-rl] focus-visible:ring-2 focus-visible:ring-[color:var(--mood)]"
    >
      <span lang="ja" className={`font-[family-name:var(--font-ja)] font-semibold leading-[1.15] tracking-[0.16em] text-slate-800 transition-colors group-hover/spine:text-slate-950 dark:text-slate-50 dark:group-hover/spine:text-white ${verticalTitleSize(track.title)}`}>
        {track.title}
      </span>
      {profile?.titleAlt && (
        <span className="pt-1 font-[family-name:var(--font-zh)] text-[13px] tracking-[0.4em] text-slate-500 dark:text-slate-400">{profile.titleAlt}</span>
      )}
      {season && (
        <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-[4px] font-[family-name:var(--font-ja)] text-[11px] text-white [writing-mode:horizontal-tb]" style={{ backgroundColor: 'var(--mood)' }}>
          {season}
        </span>
      )}
    </button>
  );

  return (
    <div className={compact ? 'flex flex-col' : 'relative flex h-full min-h-0 gap-7'}>
      {titleBlock}

      <div className={compact ? 'mt-5' : 'min-h-0 flex-1 overflow-y-auto overscroll-contain pb-10 pr-2 pt-2 no-scrollbar'}>
        {meta.length > 0 && (
          <p data-ripple className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] tracking-[0.2em] text-slate-500 dark:text-slate-400">
            {meta.map((item, index) => (
              <span key={item} lang="ja" style={index === 0 && profile?.trackNo ? { color: 'var(--mood)' } : undefined}>{item}</span>
            ))}
          </p>
        )}

        {feelWords.length > 0 && (
          <div data-ripple className="mt-4 flex items-center gap-4">
            <FeelSeal profile={profile} />
            <p className="oasis-accent-ink font-[family-name:var(--font-zh)] text-[15px] tracking-[0.32em]" style={{ '--accent': 'var(--mood)' } as React.CSSProperties}>
              {feelWords.join(' · ')}
            </p>
          </div>
        )}

        {hasFacts && (
          <>
            <Rule />
            <dl data-ripple className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 font-mono text-[11px] leading-relaxed">
              {credits.map(row => (
                <React.Fragment key={row.roles.join()}>
                  <dt className="tracking-[0.12em] text-slate-400 dark:text-slate-500">{row.roles.join('·')}</dt>
                  <dd lang="ja" className="text-slate-700 dark:text-slate-200">{row.names}</dd>
                </React.Fragment>
              ))}
              {profile?.tieIn && (
                <>
                  <dt className="tracking-[0.12em] text-slate-400 dark:text-slate-500">出处</dt>
                  <dd className="font-[family-name:var(--font-zh)] text-[12px] text-slate-700 dark:text-slate-200">{profile.tieIn}</dd>
                </>
              )}
            </dl>
          </>
        )}

        {profile?.intro && (
          <>
            <Rule />
            <p data-ripple className="text-justify font-[family-name:var(--font-zh)] text-[14px] leading-[2] text-slate-700 first-letter:float-left first-letter:mr-2 first-letter:mt-1 first-letter:font-[family-name:var(--font-ja)] first-letter:text-[2.6em] first-letter:leading-none first-letter:text-[color:var(--mood)] dark:text-slate-200">
              {profile.intro}
            </p>
          </>
        )}

        {hasVoice && (
          <>
            <Rule />
            <div data-ripple className="space-y-3 font-[family-name:var(--font-zh)] text-[14px] leading-relaxed">
              {note && (
                <p className="border-l-2 pl-3.5 text-slate-700 dark:text-slate-200" style={{ borderColor: 'color-mix(in srgb, var(--mood) 60%, transparent)' }}>
                  <span className="mb-1 block font-mono text-[10px] tracking-[0.24em] text-slate-400 dark:text-slate-500">{isOwner ? '你写的' : '他说'}</span>
                  「{note}」
                </p>
              )}
              {relations.map(relation => (
                <p key={`${relation.kind}-${relation.to}`} className="text-slate-600 dark:text-slate-300">
                  {RELATION_WORD[relation.kind]}
                  <span className="mx-1.5 text-slate-400">→</span>
                  <button
                    type="button"
                    onClick={() => switchTrack(relation.track)}
                    className="font-serif underline decoration-[color-mix(in_srgb,var(--mood)_50%,transparent)] underline-offset-4 transition-colors hover:text-slate-900 dark:hover:text-white"
                    lang="ja"
                  >
                    {relation.track.title}
                  </button>
                </p>
              ))}
            </div>
          </>
        )}

        {!hasFacts && !profile?.intro && !hasVoice && feelWords.length === 0 && (
          <p data-ripple className="mt-6 font-serif text-[14px] italic text-slate-400 dark:text-slate-500">
            {profile ? '这张碟的内页还空着。' : '翻开内页…'}
          </p>
        )}

        <div data-ripple className="mt-7 flex justify-between gap-4 font-mono text-[10px] tracking-[0.18em] text-slate-400/90 dark:text-slate-500">
          <span>{sources.length > 0 ? `资料：${sources.join(' · ')}` : ''}</span>
          {!compact && <span>ESC 合上</span>}
        </div>
      </div>

      {!compact && profile?.trackNo && (
        <span
          aria-hidden
          data-ripple
          className="pointer-events-none absolute -bottom-6 right-0 select-none font-serif text-[clamp(8rem,13vw,13rem)] leading-none"
          style={{ color: 'color-mix(in srgb, var(--mood) 14%, transparent)' }}
        >
          {String(profile.trackNo).padStart(2, '0')}
        </span>
      )}
    </div>
  );
};

interface LinerNotesProps {
  track: Track;
  /** 站主看到「你写的」，访客看到「他说」 */
  isOwner: boolean;
  compact?: boolean;
  onClose: () => void;
}

/** 纸套上的内容；开着时换曲（点关联曲）在原位交叉淡化 */
export const LinerNotes: React.FC<LinerNotesProps> = ({ track, isOwner, compact = false, onClose }) => (
  <AnimatePresence mode="wait" initial={false}>
    <motion.div
      key={track.id}
      className="h-full min-h-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={MOTION.swap}
      role="region"
      aria-label={`${track.title} 的内页`}
    >
      <SleeveBody track={track} isOwner={isOwner} compact={compact} onClose={onClose} />
    </motion.div>
  </AnimatePresence>
);
