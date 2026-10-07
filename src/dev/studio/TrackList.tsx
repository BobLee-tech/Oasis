import { memo, useMemo, useState } from 'react';
import { GATE_LABELS, GATE_ORDER, type LibraryRow } from './api';
import { cx, inputClass } from './classes';

// 「缺什么」筛选：每一项都对应工坊里能直接补的一件事
const FILTERS: { key: string; label: string; test: (row: LibraryRow) => boolean }[] = [
  { key: 'draft', label: '待校草稿', test: row => row.draftPending },
  { key: 'missing', label: '没有歌词', test: row => row.kind === 'missing' },
  { key: 'version', label: '版本', test: row => row.gates?.version === false },
  { key: 'clean', label: '洁净', test: row => row.gates?.clean === false },
  { key: 'translation', label: '缺译文', test: row => row.gates?.translation === false },
  { key: 'listened', label: '待校', test: row => row.gates?.listened === false },
  { key: 'credits', label: '缺署名', test: row => !row.have.credits },
  { key: 'intro', label: '缺介绍', test: row => !row.have.intro },
  { key: 'feel', label: '缺心境', test: row => !row.have.feel || !row.have.valence },
  { key: 'note', label: '缺一句话', test: row => !row.have.note },
];

const HAVE_KEYS = ['credits', 'titleAlt', 'intro', 'note', 'feel', 'valence', 'sections'] as const;

export const TrackList = memo(function TrackList({
  rows,
  selected,
  onSelect,
}: {
  rows: LibraryRow[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map(item => [item.key, rows.filter(item.test).length])),
    [rows],
  );
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const test = FILTERS.find(item => item.key === filter)?.test ?? (() => true);
    const visible = rows.filter(row =>
      test(row) &&
      (!needle || `${row.id} ${row.title} ${row.artist} ${row.album}`.toLowerCase().includes(needle)));
    const byAlbum = new Map<string, LibraryRow[]>();
    for (const row of visible) {
      const key = row.album || row.category;
      byAlbum.set(key, [...(byAlbum.get(key) ?? []), row]);
    }
    return [...byAlbum.entries()];
  }, [rows, query, filter]);

  return (
    <nav className="flex h-full min-h-0 flex-col" aria-label="曲目">
      <div className="space-y-2 border-b border-black/[0.06] p-3">
        <input
          className={inputClass}
          placeholder="搜索曲名 / id / 专辑"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        <div className="flex flex-wrap gap-1">
          {FILTERS.map(item => (
            <button
              key={item.key}
              type="button"
              aria-pressed={filter === item.key}
              onClick={() => setFilter(current => (current === item.key ? '' : item.key))}
              className={cx(
                'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                filter === item.key
                  ? 'border-[#39C5BB] bg-[#39C5BB]/12 text-[#1B7A74]'
                  : 'border-black/10 text-slate-500 hover:border-black/20',
              )}
            >
              {item.label} <span className="font-mono opacity-70">{counts[item.key]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {groups.map(([album, items]) => (
          <div key={album}>
            <div className="sticky top-0 z-10 bg-[#F4F1EA]/95 px-3 py-1 text-[11px] tracking-wide text-slate-500 backdrop-blur">
              {album}
            </div>
            {items.map(row => (
              <button
                key={row.id}
                type="button"
                onClick={() => onSelect(row.id)}
                aria-current={row.id === selected}
                className={cx(
                  'block w-full border-l-2 px-3 py-1.5 text-left transition-colors',
                  row.id === selected ? 'border-[#39C5BB] bg-white' : 'border-transparent hover:bg-white/60',
                )}
              >
                <div className="flex items-baseline gap-2">
                  <span className="w-12 shrink-0 font-mono text-[10px] text-slate-400">{row.id}</span>
                  <span className="truncate font-[family-name:var(--font-ja)] text-[13px] text-slate-800">{row.title}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 pl-14">
                  {row.kind === 'instrumental' ? (
                    <span className="text-[10px] text-slate-400">纯音乐</span>
                  ) : row.kind === 'missing' ? (
                    <span className="text-[10px] text-rose-500">没有歌词</span>
                  ) : (
                    <span className="flex gap-0.5" title={GATE_ORDER.map(gate => `${GATE_LABELS[gate]} ${row.gates?.[gate] ? '✓' : '✗'}`).join('  ')}>
                      {GATE_ORDER.map(gate => (
                        <span
                          key={gate}
                          className={cx('h-1.5 w-3 rounded-sm', row.gates?.[gate] ? 'bg-[#39C5BB]' : 'bg-[#FFB7C5]')}
                        />
                      ))}
                    </span>
                  )}
                  <span className="flex gap-0.5" title="资料：署名 译名 介绍 一句话 心境 效价 副歌">
                    {HAVE_KEYS.map(key => (
                      <span key={key} className={cx('h-1 w-1 rounded-full', row.have[key] ? 'bg-slate-500' : 'bg-slate-200')} />
                    ))}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
});
