// 标注：先按专辑定基调（情绪花 + 情绪板），再逐曲覆盖；在歌词时间轴上修正副歌；按段落标弧线增量；
// 标「它让你怎样」（felt，私密，直接存 Supabase，见 FeltPanel）；写你对这首的一句话；标关联曲。
// 情绪的结构与规矩见 docs/song-emotion-design.md §2 / §4。键盘：1–0 点花瓣（⇧ 减），⌘⏎ 保存并跳到下一首你没标过的。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IMAGERY, IMAGERY_LABELS, feelsOfLayer } from '../../../scripts/lib/mood-core.mjs';
import { detectChorus } from '../../lib/chorus';
import {
  api, fmtTime, RELATION_LABELS, type AlbumMood, type ArcStep, type Draft, type Feels, type Imagery, type Library, type Mood, type RelationKind, type TrackDetail,
} from './api';
import type { StudioActions } from './StudioApp';
import { player, usePlayerState } from './player';
import { Button, Counter, DraftNote, Section, SourceTag } from './ui';
import { cx, inputClass } from './classes';
import { EmotionFlower } from './EmotionFlower';
import { FLOWER_KEYS, FLOWER_ORDER, bumpFeel, feelsText } from './emotion';
import { EmotionPad, type PadValue } from './EmotionPad';
import { ArcBar } from './ArcBar';
import { FeltPanel } from './FeltPanel';

const VALENCE_KEYS = ['valence', 'lyricValence', 'soundValence'] as const;

/** 一层里的效价组（整体 / 词 / 曲）；三个都没写时为 undefined */
const padOf = (layer: Partial<Record<(typeof VALENCE_KEYS)[number], number | undefined>> | null | undefined): PadValue | undefined => {
  if (!layer || VALENCE_KEYS.every(key => layer[key] === undefined)) return undefined;
  return { valence: layer.valence, lyricValence: layer.lyricValence, soundValence: layer.soundValence };
};

/** 草稿的情绪向量：新草稿是 feels，旧草稿只有单个 feel（读作强度 3） */
const draftFeels = (draft: Pick<Draft, 'feels' | 'feel'> | null | undefined) => feelsOfLayer(draft ?? undefined);

const describeDraft = (draft: Pick<Draft, 'feels' | 'feel' | 'valence' | 'lyricValence' | 'soundValence'>) => {
  const parts = [feelsText(draftFeels(draft)) || '—'];
  if (draft.lyricValence !== undefined || draft.soundValence !== undefined) parts.push(`词 ${draft.lyricValence?.toFixed(1) ?? '—'} / 曲 ${draft.soundValence?.toFixed(1) ?? '—'}`);
  else if (draft.valence !== undefined) parts.push(`效价 ${draft.valence.toFixed(1)}`);
  return parts.join(' · ');
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export function AnnotateTab({ detail, library, actions }: { detail: TrackDetail; library: Library; actions: StudioActions }) {
  const { identity, profile, merged, album } = detail;
  const id = identity.id;
  const state = usePlayerState();
  const duration = identity.tags.durationMs;

  // ── 专辑 ──
  // 专辑还没定过时，用草稿预填（虚线标出）；点保存就是采纳
  const albumInfo = library.albums.find(item => item.slug === album?.slug);
  const albumDraft = album?.moodDefaults ? undefined : albumInfo?.moodDraft ?? undefined;
  const albumSaved = album?.moodDefaults ?? undefined;
  const [albumFeels, setAlbumFeels] = useState<Feels | undefined>(feelsOfLayer(albumSaved) ?? draftFeels(albumDraft));
  const [albumPad, setAlbumPad] = useState<PadValue>(padOf(albumSaved) ?? padOf(albumDraft) ?? {});
  const albumDirty =
    JSON.stringify(albumFeels ?? null) !== JSON.stringify(feelsOfLayer(albumSaved) ?? null) ||
    JSON.stringify(padOf(albumPad) ?? null) !== JSON.stringify(padOf(albumSaved) ?? null);
  const albumTracks = library.rows.filter(row => album && row.album === album.album);
  const albumDraftsPending = Boolean(albumDraft) || albumTracks.some(row => row.draftPending);
  const draft = profile.sources?.draft;
  const albumMood: AlbumMood | undefined = albumSaved;

  // ── 本曲 ──
  // 情绪向量与效价组各自整组取：你写过就用你的，否则用草稿预填（保存即采纳）
  const ownFeels = feelsOfLayer(profile.mood);
  const ownPad = padOf(profile.mood);
  const [feels, setFeels] = useState<Feels | undefined>(ownFeels ?? draftFeels(draft));
  const [pad, setPad] = useState<PadValue>({ ...(ownPad ?? padOf(draft) ?? {}), arousal: profile.mood?.arousal });
  const [sure, setSure] = useState(profile.mood?.sure !== false);
  const moodFromDraft = Boolean(draft) && (!ownFeels || !ownPad);
  const [sections, setSections] = useState<[number, number][]>(profile.mood?.sections ?? []);
  const [arc, setArc] = useState<ArcStep[]>(profile.mood?.arc ?? []);
  // 意象：你写过就用你的；没写时跟随自动（歌题与歌词计出来的）
  const [imagery, setImagery] = useState<Imagery[] | undefined>(profile.mood?.imagery);
  const autoImagery = detail.autoImagery ? [detail.autoImagery] : [];
  const shownImagery = imagery ?? autoImagery;
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  const [note, setNote] = useState(profile.note ?? '');
  const [noteVisitor, setNoteVisitor] = useState(profile.noteVisitor ?? '');
  const [notePrivate, setNotePrivate] = useState(Boolean(profile.notePrivate));
  const [relations, setRelations] = useState(profile.relations ?? []);

  const lines = useMemo(() => detail.lyrics?.document.lines ?? detail.netease?.lines ?? [], [detail.lyrics, detail.netease]);
  const suggestion = useMemo(() => detectChorus(lines), [lines]);

  const save = useCallback(() => {
    const valenceGroup = padOf(pad);
    const next: Mood = {
      ...profile.mood,
      // 旧的单个 feel 由 feels 取代；拆成词 / 曲时不单写整体
      feel: undefined,
      feels,
      valence: valenceGroup?.lyricValence !== undefined || valenceGroup?.soundValence !== undefined ? undefined : valenceGroup?.valence,
      lyricValence: valenceGroup?.lyricValence,
      soundValence: valenceGroup?.soundValence,
      arousal: pad.arousal,
      sure: sure ? undefined : false,
      sections: sections.length ? sections : undefined,
      arc: arc.length ? arc : undefined,
      imagery,
    };
    const clean = Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined));
    return actions.run('保存标注', () => api.saveProfile(id, {
      mood: Object.keys(clean).length ? clean : null,
      note: note.trim() || null,
      noteVisitor: noteVisitor.trim() || null,
      notePrivate: notePrivate || null,
      relations: relations.length ? relations : null,
    }));
  }, [actions, arc, feels, id, imagery, note, notePrivate, noteVisitor, pad, profile.mood, relations, sections, sure]);

  // 下一首你还没亲手标过情绪的（按曲库顺序往后找，到底回头）
  const nextUnlabeled = useMemo(() => {
    const rows = library.rows;
    const from = rows.findIndex(row => row.id === id);
    for (let step = 1; step < rows.length; step += 1) {
      const row = rows[(from + step) % rows.length];
      if (!row.have.feelsMine) return row.id;
    }
    return null;
  }, [id, library.rows]);

  // 键盘：1–0 点花瓣（⇧ 减）；⌘⏎ / Ctrl⏎ 保存并下一首。输入框里只认 ⌘⏎
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void saveRef.current().then(ok => {
          if (ok && nextUnlabeled) location.hash = `/${nextUnlabeled}/annotate`;
        });
        return;
      }
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const index = FLOWER_KEYS.indexOf(event.code.replace(/^Digit/, ''));
      if (!event.code.startsWith('Digit') || index < 0) return;
      event.preventDefault();
      setFeels(current => bumpFeel(current, FLOWER_ORDER[index], event.shiftKey ? -1 : 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nextUnlabeled]);

  const pct = (ms: number) => `${(ms / duration) * 100}%`;
  const mergedFeels = merged.mood?.feels;

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
                onClick={() => actions.run('保存专辑心境', () => api.saveAlbum(album.slug, {
                  moodDefaults: { ...padOf(albumPad), feels: albumFeels },
                }))}
              >
                保存专辑
              </Button>
            }
          >
            <p className="mb-3 text-[12px] text-slate-500">
              先给整张专辑定一个基调，{albumTracks.length} 首都会继承；个别不一样的再在下面单独改。
            </p>
            <div className="flex flex-wrap items-start gap-4">
              <EmotionFlower value={albumFeels} onChange={setAlbumFeels} className="w-56 shrink-0" />
              <div className="min-w-[16rem] flex-1"><EmotionPad value={albumPad} onChange={setAlbumPad} /></div>
            </div>
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
                    row.id === id ? 'bg-[#39C5BB]/15 text-[#1B7A74]' : row.have.feelsMine ? 'text-slate-500 hover:bg-black/5' : 'text-slate-400 hover:bg-black/5',
                  )}
                >
                  {row.have.feelsMine && <span className="mr-0.5 text-[#39C5BB]">·</span>}
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
          aside={
            <span className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">⌘⏎ 保存并下一首</span>
              <Button tone="primary" onClick={() => void save()}>保存本曲标注</Button>
            </span>
          }
        >
          <div className="flex flex-wrap items-start gap-4">
            <EmotionFlower value={feels} inherited={feelsOfLayer(albumMood)} onChange={setFeels} keyHints className="w-56 shrink-0" />
            <div className="min-w-[16rem] flex-1">
              <EmotionPad value={pad} inherited={padOf(albumMood)} autoArousal={detail.autoArousal ?? 0.5} onChange={setPad} />
              <label className="mt-3 flex items-center gap-2 text-[13px] text-slate-600">
                <input type="checkbox" className="accent-[#39C5BB]" checked={!sure} onChange={event => setSure(!event.target.checked)} />
                我自己也说不准（Miku 的身体照用，但不按这首的情绪开口）
              </label>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">点花瓣 +1（到 3 后归零），⇧ 点或右键 −1；最多标 3 维，0 维表示跟随专辑。</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-slate-500">意象</span>
            {IMAGERY.map(item => {
              const on = shownImagery.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setImagery(on ? shownImagery.filter(x => x !== item) : [...shownImagery, item])}
                  className={cx(
                    'rounded-full border px-2 py-px',
                    on ? (imagery ? 'border-[#39C5BB] bg-[#39C5BB]/15 text-[#1B7A74]' : 'border-dashed border-[#39C5BB] text-[#1B7A74]') : 'border-black/10 text-slate-400 hover:bg-black/5',
                  )}
                  style={{ fontFamily: 'var(--font-zh)' }}
                >
                  {IMAGERY_LABELS[item]}
                </button>
              );
            })}
            {imagery ? (
              <button type="button" className="text-[11px] text-slate-400 hover:text-slate-600" onClick={() => setImagery(undefined)}>改回自动</button>
            ) : (
              <span className="text-[11px] text-slate-400">{autoImagery.length ? '（虚线 = 歌题与歌词里计出来的）' : '（没计出意象）'}</span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">雨、海、花、月、雪会在 Miku 身边落成粒子；信只给她的台词。</p>
          {moodFromDraft && draft && (draft.feels || draft.feel || draft.valence !== undefined || draft.lyricValence !== undefined) && (
            <DraftNote basis={draft.basis} confidence={draft.confidence} refs={draft.refs}>
              <span className="text-[11px]">草稿：{describeDraft(draft)}</span>
            </DraftNote>
          )}
          {merged.mood && (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              合并结果：
              {mergedFeels && <>{feelsText(mergedFeels)} <SourceTag source={merged.provenance['mood.feels']} /></>}
              {merged.mood.valence !== undefined && <>· 效价 {merged.mood.valence.toFixed(2)} <SourceTag source={merged.provenance['mood.valence']} /></>}
              {merged.mood.arousal !== undefined && <>· 唤醒 {merged.mood.arousal.toFixed(2)} <SourceTag source={merged.provenance['mood.arousal']} /></>}
              {merged.mood.bpm && <>· {merged.mood.bpm} BPM <SourceTag source={merged.provenance['mood.bpm']} /></>}
            </p>
          )}
        </Section>

        <FeltPanel trackId={id} />

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

      <div className="space-y-4 self-start">
      <Section
        title="副歌段落"
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

      <Section
        title="段落弧线"
        aside={<span className="text-[11px] text-slate-400">改完点左边「保存本曲标注」</span>}
      >
        <ArcBar
          segments={detail.autoSegments}
          duration={duration}
          arc={arc}
          onChange={setArc}
          timeMs={state.timeMs}
          onSeek={ms => player.seek(ms)}
        />
      </Section>
      </div>
    </div>
  );
}
