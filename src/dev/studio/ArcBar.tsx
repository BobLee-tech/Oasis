// 段落条（docs/song-emotion-design.md §4.3）：整首按段落切开，每段一个小花苞；点开一段标「这一段多了什么」——
// 只标增量，缩小版情绪花 + 效价 / 唤醒度的偏移。90% 的歌只需要标副歌一处或不标。
// 段落是 npm run song:analyze 从歌词算的（与 Miku 运行时同一份），这里只读不改。
import { useState } from 'react';
import { SECTION_NAMES, arcAt } from '../../../scripts/lib/mood-core.mjs';
import { fmtTime, type ArcStep, type Feels, type SectionLabel } from './api';
import { Button } from './ui';
import { cx } from './classes';
import { EmotionFlower } from './EmotionFlower';
import { feelsText, mixFeelColor } from './emotion';

type Segment = [SectionLabel, number, number];

const LABEL_TINT: Record<SectionLabel, string> = {
  intro: 'bg-slate-200/70',
  verse: 'bg-slate-300/50',
  pre: 'bg-[#BFE8E4]/70',
  chorus: 'bg-[#39C5BB]/35',
  bridge: 'bg-[#D8CCF2]/70',
  outro: 'bg-slate-200/70',
};

/** 每段在同标签里是第几次（从 1 数）：「chorus#2」认它 */
const withCounts = (segments: Segment[]) => {
  const counts: Partial<Record<SectionLabel, number>> = {};
  return segments.map(([at, from, to]) => {
    counts[at] = (counts[at] ?? 0) + 1;
    return { at, from, to, n: counts[at]! };
  });
};

const stepEmpty = (step: ArcStep) => !step.feels && !step.dv && !step.da;
const signed = (x: number) => `${x > 0 ? '+' : ''}${x.toFixed(1)}`;

export function ArcBar({
  segments, duration, arc, onChange, timeMs, onSeek,
}: {
  segments: Segment[] | null;
  duration: number;
  arc: ArcStep[];
  onChange: (next: ArcStep[]) => void;
  timeMs: number;
  onSeek: (ms: number) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  // 默认改「每一次」；只想动第二次副歌时切到「只这一次」
  const [onlyThis, setOnlyThis] = useState(false);
  if (!segments?.length) {
    return <p className="text-[13px] text-slate-400">还没有段落：这首没有歌词，也没找到高能段。跑一次 npm run song:analyze 后再来。</p>;
  }
  const rows = withCounts(segments);
  const pct = (ms: number) => `${(ms / duration) * 100}%`;
  const current = selected !== null ? rows[selected] : null;
  const key = current ? (onlyThis ? `${current.at}#${current.n}` : current.at) : null;
  const step = key ? arc.find(item => item.at === key) : undefined;

  const update = (patch: Partial<ArcStep>) => {
    if (!key) return;
    const next: ArcStep = { ...(step ?? { at: key }), ...patch, at: key };
    const rest = arc.filter(item => item.at !== key);
    onChange(stepEmpty(next) ? rest : [...rest, next]);
  };

  return (
    <div>
      <div className="relative mb-2 h-12 rounded-md bg-black/[0.04]">
        {rows.map((row, index) => {
          const hit = arcAt(arc, row.at, row.n);
          const color = mixFeelColor(hit?.feels);
          return (
            <button
              key={`${row.at}${row.from}`}
              type="button"
              title={`${SECTION_NAMES[row.at]} ${row.n} · ${fmtTime(row.from)}–${fmtTime(row.to)}`}
              onClick={() => { setSelected(index === selected ? null : index); onSeek(row.from); }}
              className={cx(
                'absolute inset-y-1 overflow-hidden rounded border text-left text-[10px] leading-tight text-slate-600',
                LABEL_TINT[row.at],
                index === selected ? 'border-slate-700' : 'border-white/80 hover:border-slate-400',
              )}
              style={{ left: pct(row.from), width: pct(row.to - row.from) }}
            >
              <span className="block truncate px-1 pt-0.5" style={{ fontFamily: 'var(--font-zh)' }}>{SECTION_NAMES[row.at]}</span>
              {/* 花苞：这一段有弧线增量时出现，颜色是增量的混色 */}
              {hit && (
                <span
                  className="absolute bottom-1 left-1 h-2.5 w-2.5 rounded-full border border-white"
                  style={{ background: color ?? '#94A3B8' }}
                />
              )}
            </button>
          );
        })}
        <span className="pointer-events-none absolute inset-y-0 w-px bg-slate-800" style={{ left: pct(Math.min(timeMs, duration)) }} />
      </div>

      {current && key ? (
        <div className="rounded-lg border border-black/5 bg-white/60 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="font-medium text-slate-700" style={{ fontFamily: 'var(--font-zh)' }}>
              {SECTION_NAMES[current.at]}（第 {current.n} 次）
            </span>
            <span className="font-mono text-slate-400">{fmtTime(current.from)}–{fmtTime(current.to)}</span>
            <span className="ml-auto flex overflow-hidden rounded border border-black/10">
              {[false, true].map(value => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setOnlyThis(value)}
                  className={cx('px-2 py-0.5', onlyThis === value ? 'bg-[#39C5BB]/15 text-[#1B7A74]' : 'text-slate-500 hover:bg-black/5')}
                >
                  {value ? `只这一次（${current.at}#${current.n}）` : `每一次${SECTION_NAMES[current.at]}`}
                </button>
              ))}
            </span>
          </div>
          <div className="flex flex-wrap items-start gap-4">
            <EmotionFlower value={step?.feels} onChange={(feels?: Feels) => update({ feels })} className="w-40 shrink-0" />
            <div className="min-w-[12rem] flex-1 space-y-3 text-[12px] text-slate-600">
              {(['dv', 'da'] as const).map(field => (
                <label key={field} className="block">
                  <span className="flex justify-between">
                    <span>{field === 'dv' ? '效价（这一段更亮 / 更暗）' : '唤醒度（这一段更燃 / 更静）'}</span>
                    <span className="font-mono">{signed(step?.[field] ?? 0)}</span>
                  </span>
                  <input
                    type="range"
                    min={-0.6}
                    max={0.6}
                    step={0.1}
                    value={step?.[field] ?? 0}
                    onChange={event => update({ [field]: Math.round(Number(event.target.value) * 10) / 10 || undefined })}
                    className="w-full accent-[#39C5BB]"
                  />
                </label>
              ))}
              <p className="text-[11px] text-slate-400">
                只写「这一段多了什么」：花瓣加在整首的情绪上（每维最多 3），效价加在词和曲上。
                Miku 换段时情绪变化够大会有反应。
              </p>
              {step && <Button tone="danger" onClick={() => onChange(arc.filter(item => item.at !== key))}>清掉这一条</Button>}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-slate-400">点一段开始标；有花苞的段是已经写了增量的。</p>
      )}

      {arc.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-[12px] text-slate-600">
          {arc.map(item => {
            const [label, nth] = item.at.split('#') as [SectionLabel, string | undefined];
            return (
              <li key={item.at}>
                <span style={{ fontFamily: 'var(--font-zh)' }}>{nth ? `第 ${nth} 次${SECTION_NAMES[label]}` : `每次${SECTION_NAMES[label]}`}</span>
                ：{[feelsText(item.feels), item.dv ? `效价 ${signed(item.dv)}` : '', item.da ? `唤醒 ${signed(item.da)}` : ''].filter(Boolean).join(' · ')}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
