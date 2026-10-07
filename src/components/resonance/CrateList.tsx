import React from 'react';
import { switchTrack } from '../../hooks/useSoundscape';
import type { Track } from '../../types/music';

export interface AlbumGroup {
  key: string;
  name: string;
  year: string;
  tracks: Track[];
}

interface CrateListProps {
  groups: AlbumGroup[];
  currentTrackId: string;
  isPlaying: boolean;
  /** 律动条是否跳动：动态氛围关闭或减少动态时静止。 */
  live: boolean;
  compact?: boolean;
}

/**
 * 📀 选碟台的碟片索引。只依赖「当前是哪首、在不在播」，进度和音量变化都不会让它重渲染。
 * 在播标识放在曲号那一格里替换数字（规矩 2）：歌名所在的那一行宽度永远不变。
 */
export const CrateList: React.FC<CrateListProps> = React.memo(({ groups, currentTrackId, isPlaying, live, compact = false }) => (
  <>
    {groups.map(group => (
      <section key={group.key}>
        <div className={`flex items-center gap-2.5 pt-6 pb-2 first:pt-3 select-none ${compact ? 'px-2' : 'px-5'}`}>
          <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: group.tracks[0].color }} />
          <span className="font-serif text-[13px] text-slate-500 dark:text-slate-400 truncate">{group.name}</span>
          {group.year && <span className="font-mono text-[8px] tracking-[0.2em] text-slate-300 dark:text-slate-600 shrink-0">{group.year}</span>}
          <span className="h-px flex-1 bg-gradient-to-r from-slate-200/70 dark:from-white/10 to-transparent" />
          <span className="font-mono text-[8px] text-slate-300 dark:text-slate-600 tabular-nums shrink-0">{group.tracks.length}</span>
        </div>

        {group.tracks.map((track, i) => {
          const isActive = currentTrackId === track.id;
          return (
            <button
              key={track.id}
              type="button"
              onClick={() => switchTrack(track)}
              aria-current={isActive ? 'true' : undefined}
              className={`oasis-crate-row group relative w-full flex items-center text-left outline-none transition-colors duration-200 ${
                compact
                  ? 'gap-3.5 px-2 py-3 active:bg-slate-900/[0.04] dark:active:bg-white/[0.04]'
                  : 'gap-4 px-5 py-[11px] hover:bg-slate-900/[0.025] dark:hover:bg-white/[0.025]'
              }`}
              style={isActive ? { background: `linear-gradient(90deg, ${track.color}1f, ${track.color}08 35%, transparent 75%)` } : undefined}
            >
              {/* 左缘情绪色细标：固定高度，只缩放 */}
              <span
                className="absolute left-0 top-[19%] h-[62%] w-[2px] rounded-full origin-center transition-transform duration-200"
                style={{ backgroundColor: track.color, boxShadow: isActive ? `0 0 8px ${track.color}` : 'none', transform: `scaleY(${isActive ? 1 : 0})` }}
              />

              {/* 曲号槽：曲序 → 悬停播放标 → 在播律动条 / 暂停圆点，宽度固定 */}
              <span className="relative w-5 h-4 shrink-0 flex items-center justify-center self-start mt-1">
                {isActive ? (
                  isPlaying ? (
                    <span className="oasis-eq flex items-end gap-[2px] h-3" data-live={live}>
                      {[0, 1, 2].map(k => <span key={k} className="w-[2px] rounded-full" style={{ backgroundColor: track.color }} />)}
                    </span>
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: track.color, boxShadow: `0 0 6px ${track.color}` }} />
                  )
                ) : (
                  <>
                    <span className={`font-mono text-[10px] tabular-nums text-slate-400/55 dark:text-slate-600 select-none ${compact ? '' : 'group-hover:opacity-0 transition-opacity duration-200'}`}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {!compact && (
                      <svg viewBox="0 0 24 24" fill="currentColor" className="absolute w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-slate-500 dark:text-slate-300">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    )}
                  </>
                )}
              </span>

              {/* 标题 + 艺术家 */}
              <span className="flex-1 min-w-0 flex flex-col">
                <span className={`font-serif text-[15px] ${compact ? '' : 'md:text-base'} leading-snug tracking-wide truncate transition-colors duration-200 ${isActive ? 'text-slate-900 dark:text-slate-50' : `text-slate-600 dark:text-slate-300 ${compact ? '' : 'group-hover:text-slate-900 dark:group-hover:text-slate-100'}`}`}>
                  {track.title}
                </span>
                <span className="font-mono text-[9px] tracking-[0.22em] uppercase mt-1 truncate text-slate-400/80 dark:text-slate-500">
                  {track.artist}
                </span>
              </span>
            </button>
          );
        })}
      </section>
    ))}
  </>
));
CrateList.displayName = 'CrateList';
