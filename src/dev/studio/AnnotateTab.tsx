// 标注：先按专辑标 valence / feel（Miku 那边约 20 分钟的活就在这里），再逐曲覆盖；
// 在歌词时间轴上修正副歌；写你对这首的一句话；标关联曲。
import { useMemo, useState } from 'react';
import { detectChorus } from '../../lib/chorus';
import { api, FEEL_LABELS, fmtTime, RELATION_LABELS, type Feel, type Library, type RelationKind, type TrackDetail } from './api';
import type { StudioActions } from './StudioApp';
import { player, usePlayerState } from './player';
import { Button, Counter, DraftNote, Section, SourceTag } from './ui';
import { cx, inputClass } from './classes';

const FEELS = Object.keys(FEEL_LABELS) as Feel[];

const valenceWord = (value: number) =>
  value <= -0.6 ? '很低落' : value <= -0.2 ? '偏低落' : value < 0.2 ? '中性' : value < 0.6 ? '偏明亮' : '很明亮';

function MoodEditor({
  valence, feel, onValence, onFeel, inherited,
}: {
  valence: number | undefined;
  feel: Feel | undefined;
  onValence: (value: number | undefined) => void;
  onFeel: (value: Feel | undefined) => void;
  inherited?: { valence?: number; feel?: Feel };
}) {
  const shown = valence ?? inherited?.valence;
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-center gap-2 text-[12px] text-slate-500">
          效价 valence
          <span className="font-mono text-slate-700">{shown === undefined ? '—' : shown.toFixed(1)}</span>
          {shown !== undefined && <span>{valenceWord(shown)}</span>}
          {valence === undefined && inherited?.valence !== undefined && <span className="text-slate-400">（跟随专辑）</span>}
          {valence !== undefined && inherited && (
            <button type="button" className="ml-auto text-[11px] text-slate-400 hover:text-slate-600" onClick={() => onValence(undefined)}>
              改回跟随专辑
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">低落</span>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.1}
            value={shown ?? 0}
            onChange={event => onValence(Number(event.target.value))}
            className={cx('flex-1 accent-[#39C5BB]', valence === undefined && 'opacity-50')}
            aria-label="效价"
          />
          <span className="text-[11px] text-slate-400">明亮</span>
        </div>
      </div>
      <div>
        <div className="mb-1 text-[12px] text-slate-500">
          感受 feel
          {feel === undefined && inherited?.feel && <span className="ml-1 text-slate-400">（跟随专辑：{FEEL_LABELS[inherited.feel]}）</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FEELS.map(item => (
            <button
              key={item}
              type="button"
              aria-pressed={feel === item}
              onClick={() => onFeel(feel === item ? undefined : item)}
              className={cx(
                'rounded-full border px-2.5 py-0.5 text-[13px] transition-colors',
                feel === item
                  ? 'border-[#39C5BB] bg-[#39C5BB]/15 text-[#1B7A74]'
                  : feel === undefined && inherited?.feel === item
                    ? 'border-dashed border-[#39C5BB]/60 text-[#1B7A74]/70'
                    : 'border-black/10 text-slate-600 hover:border-black/25',
              )}
            >
              {FEEL_LABELS[item]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AnnotateTab({ detail, library, actions }: { detail: TrackDetail; library: Library; actions: StudioActions }) {
  const { identity, profile, merged, album } = detail;
  const id = identity.id;
  const state = usePlayerState();
  const duration = identity.tags.durationMs;

  // ── 专辑 ──
  // 专辑与本曲都还没定过时，用草稿预填（虚线标出）；点保存就是采纳
  const albumInfo = library.albums.find(item => item.slug === album?.slug);
  const albumDraft = album?.moodDefaults ? undefined : albumInfo?.moodDraft ?? undefined;
  const [albumValence, setAlbumValence] = useState<number | undefined>(album?.moodDefaults?.valence ?? albumDraft?.valence ?? undefined);
  const [albumFeel, setAlbumFeel] = useState<Feel | undefined>(album?.moodDefaults?.feel ?? albumDraft?.feel ?? undefined);
  const albumDirty = albumValence !== (album?.moodDefaults?.valence ?? undefined) || albumFeel !== (album?.moodDefaults?.feel ?? undefined);
  const albumTracks = library.rows.filter(row => album && row.album === album.album);
  const albumDraftsPending = Boolean(albumDraft) || albumTracks.some(row => row.draftPending);
  const draft = profile.sources?.draft;

  // ── 本曲 ──
  const [valence, setValence] = useState<number | undefined>(profile.mood?.valence ?? draft?.valence);
  const [feel, setFeel] = useState<Feel | undefined>(profile.mood?.feel ?? draft?.feel);
  const moodFromDraft = Boolean(draft) && (profile.mood?.valence === undefined || profile.mood?.feel === undefined);
  const [sections, setSections] = useState<[number, number][]>(profile.mood?.sections ?? []);
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  const [note, setNote] = useState(profile.note ?? '');
  const [noteVisitor, setNoteVisitor] = useState(profile.noteVisitor ?? '');
  const [notePrivate, setNotePrivate] = useState(Boolean(profile.notePrivate));
  const [relations, setRelations] = useState(profile.relations ?? []);

  const lines = useMemo(() => detail.lyrics?.document.lines ?? detail.netease?.lines ?? [], [detail.lyrics, detail.netease]);
  const suggestion = useMemo(() => detectChorus(lines), [lines]);

  const save = () =>
    actions.run('保存标注', () => api.saveProfile(id, {
      mood: (() => {
        const next = { ...profile.mood, valence, feel, sections: sections.length ? sections : undefined };
        const clean = Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined));
        return Object.keys(clean).length ? clean : null;
      })(),
      note: note.trim() || null,
      noteVisitor: noteVisitor.trim() || null,
      notePrivate: notePrivate || null,
      relations: relations.length ? relations : null,
    }));

  const pct = (ms: number) => `${(ms / duration) * 100}%`;

  return (
    <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-2">
      <div className="space-y-4">
        {album ? (
          <Section
            title={`专辑 · ${album.album}`}
            aside={
              <Button
                tone="primary"
                disabled={!albumDirty}
                onClick={() => actions.run('保存专辑心境', () => api.saveAlbum(album.slug, { moodDefaults: { valence: albumValence, feel: albumFeel } }))}
              >
                保存专辑
              </Button>
            }
          >
            <p className="mb-3 text-[12px] text-slate-500">
              先给整张专辑定一个基调，{albumTracks.length} 首都会继承；个别不一样的再在下面单独改。
            </p>
            <MoodEditor valence={albumValence} feel={albumFeel} onValence={setAlbumValence} onFeel={setAlbumFeel} />
            {albumDraft && <DraftNote basis={albumDraft.basis} />}
            {albumDraftsPending && (
              <div className="mt-3 flex items-center gap-2 text-[12px] text-slate-500">
                <Button
                  tone="primary"
                  onClick={() => {
                    if (!confirm(`采纳「${album.album}」的全部草稿？只会填你还没写的介绍与心境，已写的不动。`)) return;
                    void actions.run('采纳整张专辑的草稿', () => api.acceptAlbumDrafts(album.slug));
                  }}
                >
                  采纳整张专辑的草稿
                </Button>
                <span>逐首看完再点也行；采纳后仍可随时改</span>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-1">
              {albumTracks.map(row => (
                <a
                  key={row.id}
                  href={`#/${row.id}/annotate`}
                  className={cx(
                    'rounded px-1.5 py-0.5 font-[family-name:var(--font-ja)] text-[11px]',
                    row.id === id ? 'bg-[#39C5BB]/15 text-[#1B7A74]' : 'text-slate-500 hover:bg-black/5',
                  )}
                >
                  {row.title}
                </a>
              ))}
            </div>
          </Section>
        ) : (
          <Section title="专辑">
            <p className="text-[13px] text-slate-500">这首的专辑没有对应的 music-data/albums 文件。</p>
          </Section>
        )}

        <Section
          title="这一首"
          aside={<Button tone="primary" onClick={save}>保存本曲标注</Button>}
        >
          <MoodEditor
            valence={valence}
            feel={feel}
            onValence={setValence}
            onFeel={setFeel}
            inherited={{ valence: album?.moodDefaults?.valence ?? undefined, feel: album?.moodDefaults?.feel ?? undefined }}
          />
          {moodFromDraft && draft && (draft.valence !== undefined || draft.feel) && (
            <DraftNote basis={draft.basis} confidence={draft.confidence} refs={draft.refs}>
              <span className="text-[11px]">
                草稿：{draft.feel ? FEEL_LABELS[draft.feel] : '—'} · 效价 {draft.valence?.toFixed(1) ?? '—'}
              </span>
            </DraftNote>
          )}
          {merged.mood && (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              合并结果：
              {merged.mood.valence !== undefined && <>效价 {merged.mood.valence.toFixed(1)} <SourceTag source={merged.provenance['mood.valence']} /></>}
              {merged.mood.feel && <>· {FEEL_LABELS[merged.mood.feel]} <SourceTag source={merged.provenance['mood.feel']} /></>}
              {merged.mood.bpm && <>· {merged.mood.bpm} BPM <SourceTag source={merged.provenance['mood.bpm']} /></>}
            </p>
          )}
        </Section>

        <Section title="他的话" aside={<Counter value={note} max={library.limits.note} />}>
          <p className="mb-2 text-[12px] text-slate-500">
            用你自己的口吻写一句（可以有「我」）。曲目卡显示为「他说：『…』」；Miku 会在站主模式下当作共同记忆引用。
          </p>
          <input className={cx(inputClass, 'font-[family-name:var(--font-zh)] text-[14px]')} value={note} onChange={event => setNote(event.target.value)} />
          <label className="mt-3 block text-[12px] text-slate-500">
            给访客的另一种说法（可选，有它时访客只看到这句）
            <input className={cx(inputClass, 'mt-1 font-[family-name:var(--font-zh)]')} value={noteVisitor} onChange={event => setNoteVisitor(event.target.value)} />
          </label>
          <label className="mt-3 flex items-center gap-2 text-[13px] text-slate-600">
            <input type="checkbox" className="accent-[#39C5BB]" checked={notePrivate} onChange={event => setNotePrivate(event.target.checked)} />
            只给自己看（不进公开档案，曲目卡和访客模式都不显示）
          </label>
        </Section>

        <Section
          title="关联曲"
          aside={<Button onClick={() => setRelations(current => [...current, { kind: 'reply', to: '' }])}>添加</Button>}
        >
          {!relations.length && <p className="text-[13px] text-slate-400">比如「エルマ」是「エイミー」的回信。点击曲目卡上的关联会直接播放。</p>}
          <div className="space-y-2">
            {relations.map((relation, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  className={cx(inputClass, 'w-32')}
                  value={relation.kind}
                  onChange={event => setRelations(current => current.map((item, i) => (i === index ? { ...item, kind: event.target.value as RelationKind } : item)))}
                >
                  {(Object.keys(RELATION_LABELS) as RelationKind[]).map(kind => <option key={kind} value={kind}>{RELATION_LABELS[kind]}</option>)}
                </select>
                <span className="text-slate-400">→</span>
                <select
                  className={inputClass}
                  value={relation.to}
                  onChange={event => setRelations(current => current.map((item, i) => (i === index ? { ...item, to: event.target.value } : item)))}
                >
                  <option value="">选一首…</option>
                  {library.rows.filter(row => row.id !== id).map(row => (
                    <option key={row.id} value={row.id}>{row.title} · {row.album}</option>
                  ))}
                </select>
                <Button tone="danger" onClick={() => setRelations(current => current.filter((_, i) => i !== index))}>删</Button>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section
        title="副歌段落"
        className="self-start"
        aside={
          <div className="flex gap-2">
            {suggestion.length > 0 && <Button onClick={() => setSections(suggestion)}>采用建议（{suggestion.length} 段）</Button>}
            {sections.length > 0 && <Button tone="danger" onClick={() => setSections([])}>清空</Button>}
          </div>
        }
      >
        <p className="mb-3 text-[12px] text-slate-500">
          虚线是按歌词重复块算出的建议；实色是你确认的。歌词场会在这些段落里把水面线稍稍调亮，Miku 用它做副歌预备。
        </p>
        <div className="relative mb-2 h-10 rounded-md bg-black/[0.04]">
          {suggestion.map(([start, end]) => (
            <div key={`s${start}`} className="absolute inset-y-1 rounded border border-dashed border-[#39C5BB]/70" style={{ left: pct(start), width: pct(end - start) }} />
          ))}
          {sections.map(([start, end], index) => (
            <button
              key={`m${start}`}
              type="button"
              title={`${fmtTime(start)}–${fmtTime(end)}（点击删除）`}
              onClick={() => setSections(current => current.filter((_, i) => i !== index))}
              className="absolute inset-y-2 rounded bg-[#39C5BB]/60 hover:bg-rose-300"
              style={{ left: pct(start), width: pct(end - start) }}
            />
          ))}
          {lines.map(line => (
            <span key={line.startMs} className="absolute bottom-0 h-1.5 w-px bg-slate-400/60" style={{ left: pct(line.startMs) }} />
          ))}
          {pendingStart !== null && <span className="absolute inset-y-0 w-0.5 bg-[#FF8FA6]" style={{ left: pct(pendingStart) }} />}
          <span className="absolute inset-y-0 w-px bg-slate-800" style={{ left: pct(Math.min(state.timeMs, duration)) }} />
          <input
            type="range"
            min={0}
            max={duration}
            step={100}
            value={Math.min(state.timeMs, duration)}
            onChange={event => player.seek(Number(event.target.value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="在时间轴上定位"
          />
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="font-mono text-slate-500">{fmtTime(state.timeMs)}</span>
          {pendingStart === null ? (
            <Button onClick={() => setPendingStart(player.nowMs())}>从这里开始一段</Button>
          ) : (
            <>
              <span className="text-slate-500">起点 {fmtTime(pendingStart)}</span>
              <Button
                tone="primary"
                disabled={player.nowMs() <= pendingStart}
                onClick={() => {
                  const end = player.nowMs();
                  setSections(current => [...current, [pendingStart, end] as [number, number]].sort((a, b) => a[0] - b[0]));
                  setPendingStart(null);
                }}
              >
                到这里结束
              </Button>
              <Button onClick={() => setPendingStart(null)}>取消</Button>
            </>
          )}
          <span className="ml-auto text-slate-400">改完点左边「保存本曲标注」</span>
        </div>
        {sections.length > 0 && (
          <ul className="mt-3 space-y-1 font-mono text-[12px] text-slate-600">
            {sections.map(([start, end]) => (
              <li key={start}>
                <button type="button" className="hover:text-[#1B7A74]" onClick={() => player.seek(start)}>
                  {fmtTime(start)} – {fmtTime(end)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
