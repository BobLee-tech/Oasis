// 📜 曲目卡（liner notes，docs/music-design.md A6）：唱片纸套背面的内页说明。
//
// 安静、排版克制，不是百科词条：
//   · 浮层盖在选碟台上方，绝对定位，不推动任何布局（规矩 2）；展开收起只动 opacity / transform（规矩 4）
//   · 只用固定档位：衬线标题、等宽署名、正文一档
//   · 情绪色只用在分隔线和感受词上，正文用墨色
//   · 缺的字段整段不显示，不留空壳
import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PLAYLIST, switchTrack } from '../../hooks/useSoundscape';
import { MOTION } from '../../lib/motion';
import { useTrackProfile } from '../../lib/trackProfile';
import type { Track, TrackCredits, TrackFeel, TrackRelationKind } from '../../types/music';

const FEEL_WORD: Record<TrackFeel, string> = {
  tender: '温柔', nostalgic: '怀念', sad: '哀伤', peaceful: '宁静', joyful: '雀跃', tense: '紧绷', wonder: '奇妙',
};
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

interface LinerNotesProps {
  track: Track;
  open: boolean;
  onClose: () => void;
  /** 站主看到「你写的」，访客看到「他说」 */
  isOwner: boolean;
  compact?: boolean;
}

const Rule = () => (
  <div
    aria-hidden
    className="my-5 h-px w-full"
    style={{ background: 'linear-gradient(90deg, color-mix(in srgb, var(--mood) 55%, transparent), transparent 85%)' }}
  />
);

const NotesBody: React.FC<{ track: Track; isOwner: boolean }> = ({ track, isOwner }) => {
  const profile = useTrackProfile(track.id);
  const credits = creditRows(profile?.credits);
  const note = isOwner ? profile?.note : profile?.noteVisitor ?? profile?.note;
  const feelWords = [
    profile?.mood?.feel && profile.provenance['mood.feel'] !== 'va' ? FEEL_WORD[profile.mood.feel] : '',
    profile?.mood?.season ? SEASON_WORD[profile.mood.season] : '',
    profile?.mood?.time && profile.provenance['mood.time'] === 'manual' ? TIME_WORD[profile.mood.time] : '',
  ].filter(Boolean);
  const relations = (profile?.relations ?? [])
    .map(relation => ({ ...relation, track: PLAYLIST.find(item => item.id === relation.to) }))
    .filter((relation): relation is typeof relation & { track: Track } => Boolean(relation.track));
  const meta = [profile?.album, profile?.year, profile?.trackNo ? `No.${profile.trackNo}` : ''].filter(Boolean);

  // 署名：只列这张卡上真的显示了的字段的出处
  const shown = ['titleAlt', 'album', 'released', 'credits', 'tieIn', 'intro'].filter(key => profile?.provenance[key]);
  const sources = [...new Set(shown.map(key => profile!.provenance[key]))]
    .map(source => (source === 'manual' ? (isOwner ? '你' : '站主') : SOURCE_WORD[source]))
    .filter(Boolean);

  const hasFacts = credits.length > 0 || Boolean(profile?.tieIn);
  const hasVoice = Boolean(note) || feelWords.length > 0 || relations.length > 0;

  return (
    <>
      <header>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pr-8">
          <h3 lang="ja" className="font-serif text-[1.55rem] leading-tight tracking-wide text-slate-800 dark:text-slate-50">
            {track.title}
          </h3>
          {profile?.titleAlt && (
            <span className="font-[family-name:var(--font-zh)] text-[13px] text-slate-500 dark:text-slate-400">{profile.titleAlt}</span>
          )}
        </div>
        {meta.length > 0 && (
          <p className="mt-2 font-mono text-[10px] tracking-[0.18em] text-slate-500 dark:text-slate-400">
            <span lang="ja">{meta.join(' · ')}</span>
          </p>
        )}
      </header>

      {hasFacts && (
        <>
          <Rule />
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 font-mono text-[11px] leading-relaxed">
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
          <p className="font-[family-name:var(--font-zh)] text-[14px] leading-[1.95] text-slate-700 dark:text-slate-200">
            {profile.intro}
          </p>
        </>
      )}

      {hasVoice && (
        <>
          <Rule />
          <div className="space-y-2.5 font-[family-name:var(--font-zh)] text-[14px] leading-relaxed">
            {note && (
              <p className="text-slate-700 dark:text-slate-200">
                <span className="text-slate-400 dark:text-slate-500">{isOwner ? '你写的：' : '他说：'}</span>「{note}」
              </p>
            )}
            {feelWords.length > 0 && (
              <p className="oasis-accent-ink tracking-[0.2em]" style={{ '--accent': 'var(--mood)' } as React.CSSProperties}>
                {feelWords.join(' · ')}
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

      {!hasFacts && !profile?.intro && !hasVoice && (
        <p className="mt-6 font-serif italic text-[14px] text-slate-400 dark:text-slate-500">
          {profile ? '这张碟的内页还空着。' : '翻开内页…'}
        </p>
      )}

      {sources.length > 0 && (
        <p className="mt-6 font-mono text-[9px] tracking-[0.18em] text-slate-400/80 dark:text-slate-600">
          资料：{sources.join(' · ')}
        </p>
      )}
    </>
  );
};

export const LinerNotes: React.FC<LinerNotesProps> = ({ track, open, onClose, isOwner, compact = false }) => {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="liner-notes"
          className={`absolute inset-0 z-40 flex justify-center ${compact ? 'items-end' : 'items-start pt-1'}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={MOTION.swap}
        >
          {/* 底下的选碟台淡下去但不动；点空白处合上 */}
          <button
            type="button"
            aria-label="合上内页"
            tabIndex={-1}
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-[#FAF8F3]/60 backdrop-blur-[2px] dark:bg-[#0A0F1D]/60"
          />
          <motion.section
            role="dialog"
            aria-modal="false"
            aria-label={`${track.title} 的内页`}
            className={`relative w-full overflow-y-auto overscroll-contain text-left border border-white/70 bg-white/88 shadow-[0_24px_70px_rgba(15,23,42,0.16)] backdrop-blur-xl no-scrollbar dark:border-white/10 dark:bg-[#0F1424]/90 dark:shadow-[0_24px_70px_rgba(0,0,0,0.55)] ${
              compact ? 'max-h-[86%] rounded-t-[1.75rem] px-6 pb-8 pt-7' : 'max-h-full max-w-[460px] rounded-[1.75rem] px-8 pb-8 pt-8'
            }`}
            initial={{ opacity: 0, y: compact ? 28 : 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: compact ? 22 : 10 }}
            transition={MOTION.move}
            drag={compact ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 500) onClose();
            }}
          >
            {compact && <div aria-hidden className="mx-auto -mt-3 mb-4 h-1 w-9 rounded-full bg-slate-300/70 dark:bg-white/15" />}
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="关闭内页"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 outline-none transition-colors hover:bg-slate-900/5 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-[color:var(--mood)] dark:hover:bg-white/5 dark:hover:text-slate-200"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            {/* 换曲（点关联曲）时内容在原位交叉淡化 */}
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={track.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={MOTION.swap}
              >
                <NotesBody track={track} isOwner={isOwner} />
              </motion.div>
            </AnimatePresence>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
