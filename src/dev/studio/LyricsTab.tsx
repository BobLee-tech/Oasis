import { useMemo, useState, type ReactNode } from 'react';
import { api, fmtTime, GATE_LABELS, GATE_ORDER, type PairedLine, type TrackDetail } from './api';
import type { StudioActions } from './StudioApp';
import { player, usePlayerState } from './player';
import { TapSync } from './TapSync';
import { Button, GateDot, Section } from './ui';
import { cx, inputClass } from './classes';

const hasWords = (text: string) => /[\p{L}\p{N}]/u.test(text);

/** 原文配上注音（line.kana 的片段按顺序替换成 <ruby>），让你边听边核读音。 */
function Ruby({ text, kana }: { text: string; kana?: { surface: string; kana: string }[] }) {
  if (!kana?.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  kana.forEach((segment, index) => {
    const at = text.indexOf(segment.surface, cursor);
    if (at < 0) return;
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(
      <ruby key={index}>
        {segment.surface}
        <rt className="text-[9px] text-slate-400">{segment.kana}</rt>
      </ruby>,
    );
    cursor = at + segment.surface.length;
  });
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}

/** 当前在唱的行：最后一个 startMs ≤ now 的行。 */
const activeIndex = (lines: { startMs: number }[], now: number, offsetMs = 0) => {
  let found = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startMs + offsetMs <= now) found = i;
    else break;
  }
  return found;
};

export function LyricsTab({ detail, actions }: { detail: TrackDetail; actions: StudioActions }) {
  const { identity, lyrics, netease, profile } = detail;
  const id = identity.id;
  const [mode, setMode] = useState<'review' | 'tap'>(lyrics || netease ? 'review' : 'tap');
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [translator, setTranslator] = useState(lyrics?.document.translator ?? '');
  const [outro, setOutro] = useState(profile.lyrics?.outroMs ? String(Math.round(profile.lyrics.outroMs / 1_000)) : '');
  const state = usePlayerState();

  if (identity.kind === 'instrumental') {
    return <div className="p-6 text-slate-500">纯音乐，没有歌词要做。资料与标注在另外两个页签。</div>;
  }

  if (mode === 'tap') {
    const seed = detail.imported?.text ?? lyrics?.document.lines.map(line => line.ja).join('\n') ?? '';
    return (
      <TapSync
        detail={detail}
        seedText={seed}
        seedSource={detail.imported ? `${detail.imported.source} · ${detail.imported.url}` : lyrics ? '当前歌词（重新对时间）' : ''}
        onCancel={lyrics || netease ? () => setMode('review') : undefined}
        onCommit={lines => actions.run('写入打点歌词', () => {
          // 给现有歌词重对时间时，原文没变的行把译文带上
          const zhByJa = new Map((lyrics?.document.lines ?? []).filter(line => line.zh).map(line => [line.ja, line.zh!]));
          return api.tapsync(id, lines.map(line => ({ ...line, zh: zhByJa.get(line.ja) })), detail.imported?.url);
        }).then(ok => {
          if (ok) setMode('review');
        })}
      />
    );
  }

  const doc = lyrics?.document;
  const gate = lyrics?.gate;
  const dirty = Object.keys(edits).length > 0;
  const missingTranslation = new Set(gate?.gates.translation.lines ?? []);
  const nowIndex = doc ? activeIndex(doc.lines, state.timeMs, doc.offsetMs) : -1;
  const ncmIndex = netease ? activeIndex(netease.lines, state.timeMs) : -1;

  const saveOutro = () =>
    actions.run('保存尾奏豁免并重建', async () => {
      await api.saveProfile(id, { lyrics: outro ? { outroMs: Math.round(Number(outro) * 1_000) } : null });
      return api.rebuild(id);
    });

  return (
    <div className="space-y-4 p-4">
      <Section
        title="五道闸"
        aside={
          <div className="flex gap-2">
            <Button onClick={() => setMode('tap')}>边听边打点</Button>
            <Button onClick={() => actions.run('重新抓取网易云', () => api.refreshNetease(id))}>重新抓取网易云</Button>
          </div>
        }
      >
        {gate ? (
          <div className="grid grid-cols-5 gap-3">
            {GATE_ORDER.map(name => (
              <div key={name} className="rounded-lg bg-black/[0.025] p-2">
                <GateDot pass={gate.gates[name].pass} label={GATE_LABELS[name]} />
                <p className="mt-1 text-[11px] leading-snug text-slate-500">{gate.gates[name].detail}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-rose-600">这首还没有歌词。{netease ? '网易云有成对版本，可以直接换上；' : ''}也可以从「资料」页签的网页导入拿到文本后打点。</p>
        )}
        {gate && !gate.gates.version.pass && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-slate-600">如果末行之后是纯器乐尾奏，声明它的长度（秒）即可放行：</span>
            <input className={cx(inputClass, 'w-20')} inputMode="numeric" value={outro} onChange={event => setOutro(event.target.value.replace(/\D/g, ''))} />
            <Button onClick={saveOutro}>保存并重建</Button>
          </div>
        )}
        {gate?.credits && Object.keys(gate.credits).length > 0 && (
          <p className="mt-2 text-[12px] text-slate-500">歌词头里的署名：{Object.entries(gate.credits).map(([role, names]) => `${role} ${names?.join('/')}`).join(' · ')}</p>
        )}
      </Section>

      {detail.readingConflicts.length > 0 && (
        <ReadingConflicts detail={detail} actions={actions} />
      )}

      {netease && (
        <Section
          title="网易云成对版本"
          aside={
            <span className="text-[11px] text-slate-400">
              song {netease.songId}
              {netease.lyricUser && ` · 歌词 @${netease.lyricUser}`}
              {netease.transUser && ` · 翻译 @${netease.transUser}`}
            </span>
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className={cx('rounded-full px-2 py-0.5 text-[12px]', netease.compare.recommend ? 'bg-[#39C5BB]/15 text-[#1B7A74]' : 'bg-black/5 text-slate-500')}>
              {netease.compare.recommend ? '建议换' : '不建议自动换'}
            </span>
            <span className="text-[13px] text-slate-600">{netease.compare.reason}</span>
            <span className="text-[12px] text-slate-400">
              {netease.compare.candidate.lines} 行 · 译文 {Math.round(netease.compare.candidate.zhCoverage * 100)}%
              · 罗马音 {Math.round(netease.compare.candidate.romaCoverage * 100)}%
            </span>
            <Button
              tone={netease.compare.recommend ? 'primary' : 'quiet'}
              className="ml-auto"
              disabled={doc?.translationStatus === 'reviewed'}
              onClick={() => {
                if (!netease.compare.recommend && !confirm('比对不建议替换（见左侧原因）。仍然换成网易云版本？')) return;
                void actions.run('换成网易云成对版本', () => api.useNetease(id));
              }}
            >
              换成网易云版本
            </Button>
          </div>
        </Section>
      )}

      <div className={cx('grid gap-4', netease && doc ? 'grid-cols-2' : 'grid-cols-1')}>
        {doc && (
          <Section
            title={`当前版本 · ${doc.source.label}${doc.translator ? ` · 译 ${doc.translator}` : ''}`}
            aside={
              <div className="flex items-center gap-2">
                {dirty && (
                  <>
                    <Button onClick={() => setEdits({})}>放弃</Button>
                    <Button
                      tone="primary"
                      onClick={() => actions.run('保存译文', () => api.saveTranslation(
                        id,
                        Object.entries(edits).map(([index, zh]) => ({ index: Number(index), zh })),
                      )).then(ok => ok && setEdits({}))}
                    >
                      保存 {Object.keys(edits).length} 行译文
                    </Button>
                  </>
                )}
              </div>
            }
          >
            <ol className="space-y-px">
              {doc.lines.map((line, index) => {
                const value = edits[index] ?? line.zh ?? '';
                const missing = missingTranslation.has(index) && !String(edits[index] ?? '').trim();
                return (
                  <li
                    key={`${line.startMs}-${index}`}
                    className={cx(
                      'grid grid-cols-[4rem_1fr] gap-x-2 rounded px-1 py-1 transition-colors',
                      index === nowIndex && 'bg-[#39C5BB]/10',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => player.seek(line.startMs + doc.offsetMs)}
                      className="self-start pt-0.5 text-left font-mono text-[11px] text-slate-400 hover:text-[#1B7A74]"
                    >
                      {fmtTime(line.startMs)}
                    </button>
                    <div className="min-w-0">
                      <p className="font-[family-name:var(--font-ja)] text-[14px] leading-relaxed text-slate-800">
                        <Ruby text={line.ja} kana={line.kana} />
                      </p>
                      {hasWords(line.ja) && (
                        <input
                          className={cx(
                            'mt-0.5 w-full rounded border bg-transparent px-1 py-px font-[family-name:var(--font-zh)] text-[13px] text-slate-600 focus:bg-white focus:outline-none',
                            missing ? 'border-[#FFB7C5] bg-[#FFB7C5]/10' : 'border-transparent hover:border-black/10 focus:border-[#39C5BB]',
                            edits[index] !== undefined && 'border-amber-300',
                          )}
                          value={value}
                          placeholder={missing ? '缺译文' : ''}
                          onChange={event => {
                            const next = event.target.value;
                            setEdits(current => {
                              const copy = { ...current };
                              if (next === (line.zh ?? '')) delete copy[index];
                              else copy[index] = next;
                              return copy;
                            });
                          }}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/5 pt-3 text-[13px]">
              <span className="text-slate-600">完整听过一遍、逐行读过之后：</span>
              <input className={cx(inputClass, 'w-44')} placeholder="译者署名" value={translator} onChange={event => setTranslator(event.target.value)} />
              <Button
                tone="primary"
                disabled={dirty || doc.translationStatus === 'reviewed' || !gate?.gates.translation.pass}
                title={!gate?.gates.translation.pass ? '先补齐译文' : dirty ? '先保存改动' : ''}
                onClick={() => actions.run('标为已校', () => api.markReviewed(id, translator))}
              >
                {doc.translationStatus === 'reviewed' ? '已校' : '听完了，标为已校'}
              </Button>
            </div>
          </Section>
        )}

        {netease && (
          <Section title="网易云成对版本（只读）">
            <PairedList lines={netease.lines} activeIndex={ncmIndex} />
          </Section>
        )}
      </div>
    </div>
  );
}

function PairedList({ lines, activeIndex: active }: { lines: PairedLine[]; activeIndex: number }) {
  const rows = useMemo(() => lines, [lines]);
  return (
    <ol className="space-y-px">
      {rows.map((line, index) => (
        <li
          key={`${line.startMs}-${index}`}
          className={cx('grid grid-cols-[4rem_1fr] gap-x-2 rounded px-1 py-1', index === active && 'bg-[#39C5BB]/10')}
        >
          <button
            type="button"
            onClick={() => player.seek(line.startMs)}
            className="self-start pt-0.5 text-left font-mono text-[11px] text-slate-400 hover:text-[#1B7A74]"
          >
            {fmtTime(line.startMs)}
          </button>
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-ja)] text-[14px] leading-snug text-slate-800">{line.ja}</p>
            {line.roma && <p className="font-mono text-[10px] leading-snug text-slate-400">{line.roma}</p>}
            {line.zh ? (
              <p className="font-[family-name:var(--font-zh)] text-[13px] text-slate-600">{line.zh}</p>
            ) : hasWords(line.ja) ? (
              <p className="text-[12px] text-rose-400">缺译文</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** 罗马音（实际唱法）与词典读法不一致的汉字串：选一个，存进档案 lyrics.readings 后重建。 */
function ReadingConflicts({ detail, actions }: { detail: TrackDetail; actions: StudioActions }) {
  const { profile, readingConflicts } = detail;
  const id = detail.identity.id;
  const readings = profile.lyrics?.readings ?? {};
  const [custom, setCustom] = useState<Record<string, string>>({});
  // 同一个汉字串在多行出现时只列一次
  const unique = useMemo(() => {
    const seen = new Map<string, (typeof readingConflicts)[number] & { count: number }>();
    for (const conflict of readingConflicts) {
      const existing = seen.get(conflict.surface);
      if (existing) existing.count += 1;
      else seen.set(conflict.surface, { ...conflict, count: 1 });
    }
    return [...seen.values()];
  }, [readingConflicts]);

  const choose = (surface: string, kana: string) =>
    actions.run(`读法：${surface} → ${kana}`, async () => {
      await api.saveProfile(id, { lyrics: { ...profile.lyrics, readings: { ...readings, [surface]: kana } } });
      return api.rebuild(id);
    });

  return (
    <Section
      title={`读音冲突 · ${unique.length}`}
      aside={<span className="text-[11px] text-slate-400">罗马音 = 网易云按实际唱法标的；词典 = kuromoji。默认用罗马音。</span>}
    >
      <div className="divide-y divide-black/5">
        {unique.map(conflict => (
          <div key={conflict.surface} className="flex flex-wrap items-center gap-2 py-1.5 text-[13px]">
            <span className="w-24 font-[family-name:var(--font-ja)] text-[15px] text-slate-900">{conflict.surface}</span>
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left font-[family-name:var(--font-ja)] text-[12px] text-slate-500 hover:text-[#1B7A74]"
              onClick={() => player.seek((detail.lyrics?.document.lines[conflict.index]?.startMs ?? 0) + (detail.lyrics?.document.offsetMs ?? 0))}
              title="跳到这一行"
            >
              {conflict.ja}{conflict.count > 1 && ` ×${conflict.count}`}
            </button>
            {[['罗马音', conflict.roma], ['词典', conflict.dictionary]].map(([label, kana]) => (
              <Button
                key={label}
                tone={readings[conflict.surface] === kana ? 'primary' : 'quiet'}
                onClick={() => choose(conflict.surface, kana)}
              >
                {label} {kana}
              </Button>
            ))}
            <input
              className={cx(inputClass, 'w-24')}
              placeholder="其他读法"
              value={custom[conflict.surface] ?? ''}
              onChange={event => setCustom(current => ({ ...current, [conflict.surface]: event.target.value }))}
              onKeyDown={event => {
                const value = custom[conflict.surface]?.trim();
                if (event.key === 'Enter' && value) void choose(conflict.surface, value);
              }}
            />
          </div>
        ))}
      </div>
    </Section>
  );
}
