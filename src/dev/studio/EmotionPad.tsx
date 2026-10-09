// 情绪板（docs/song-emotion-design.md §4.2，Musicovery 式）：横轴效价、纵轴唤醒度，拖一个点就是心境。
// 按住 ⌥ 拖会把点拆成「词 / 曲」两个点，连线即反差；拆开后整体效价不再单写，由两者平均（mood-core 的规矩）。
// 唤醒度显示自动值；拖动时纵向偏离自动值不到 0.08 视为没改，免得横着拖一下就把自动值盖掉。
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { FEEL_LABELS, FEEL_VA, SPLIT_MIN } from '../../../scripts/lib/mood-core.mjs';
import type { Feel } from './api';
import { cx } from './classes';
import { valenceWord } from './emotion';

export interface PadValue {
  valence?: number;
  lyricValence?: number;
  soundValence?: number;
  /** 你覆盖的唤醒度 0..1；undefined = 用自动值 */
  arousal?: number;
}

const W = 320;
const H = 180;
const AROUSAL_DEAD = 0.08;
const round = (x: number, step = 0.05) => Math.round(x / step) * step;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const fix = (x: number) => Number(x.toFixed(2));

type Handle = 'one' | 'lyric' | 'sound';

export function EmotionPad({
  value, inherited, autoArousal, onChange,
}: {
  value: PadValue;
  /** 专辑默认（自己没写效价时以虚线显示） */
  inherited?: Pick<PadValue, 'valence' | 'lyricValence' | 'soundValence'>;
  /** 自动层的唤醒度；不给 = 这块板不管唤醒度（专辑） */
  autoArousal?: number;
  onChange: (next: PadValue) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ handle: Handle; pointerId: number } | null>(null);
  const arousalEditable = autoArousal !== undefined;
  const ownSplit = value.lyricValence !== undefined || value.soundValence !== undefined;
  const ownAny = ownSplit || value.valence !== undefined;
  const base = ownAny ? value : { ...inherited };
  const split = base.lyricValence !== undefined || base.soundValence !== undefined;
  const overall = base.valence ?? (split ? ((base.lyricValence ?? 0) + (base.soundValence ?? 0)) / 2 : undefined);
  const lyric = base.lyricValence ?? overall ?? 0;
  const sound = base.soundValence ?? overall ?? 0;
  const arousal = value.arousal ?? autoArousal ?? 0.5;

  const xOf = (v: number) => ((v + 1) / 2) * W;
  const yOf = (a: number) => (1 - a) * H;
  const fromEvent = (event: PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      v: clamp(round(((event.clientX - rect.left) / rect.width) * 2 - 1), -1, 1),
      a: clamp(round(1 - (event.clientY - rect.top) / rect.height), 0, 1),
    };
  };

  const nextArousal = (a: number) => {
    if (!arousalEditable) return undefined;
    if (value.arousal === undefined && Math.abs(a - autoArousal!) < AROUSAL_DEAD) return undefined;
    return fix(a);
  };

  const apply = (handle: Handle, v: number, a: number, start: PadValue = value) => {
    const next: PadValue = { ...start, arousal: nextArousal(a) };
    if (handle === 'one') {
      next.valence = fix(v);
      delete next.lyricValence;
      delete next.soundValence;
    } else {
      delete next.valence;
      next.lyricValence = fix(handle === 'lyric' ? v : start.lyricValence ?? lyric);
      next.soundValence = fix(handle === 'sound' ? v : start.soundValence ?? sound);
    }
    onChange(next);
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    const { v, a } = fromEvent(event);
    let handle: Handle;
    let start = value;
    if (split) {
      handle = Math.abs(v - lyric) <= Math.abs(v - sound) ? 'lyric' : 'sound';
      // 跟随专辑的拆分：第一次拖就把两点都写成自己的
      if (!ownSplit) start = { ...value, lyricValence: lyric, soundValence: sound };
    } else if (event.altKey) {
      // ⌥：拆点。原位留下「词」，拖走的是「曲」
      handle = 'sound';
      start = { ...value, lyricValence: overall ?? 0, soundValence: overall ?? 0 };
    } else {
      handle = 'one';
    }
    svgRef.current?.setPointerCapture(event.pointerId);
    setDrag({ handle, pointerId: event.pointerId });
    apply(handle, v, a, start);
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const { v, a } = fromEvent(event);
    apply(drag.handle, v, a);
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const step = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 0.05], ArrowDown: [0, -0.05] }[event.key];
    if (!step) return;
    event.preventDefault();
    if (split) {
      if (arousalEditable && step[1]) onChange({ ...value, arousal: fix(clamp(arousal + step[1], 0, 1)) });
      return;
    }
    const v = clamp((overall ?? 0) + step[0], -1, 1);
    onChange({ ...value, valence: fix(v), arousal: step[1] && arousalEditable ? fix(clamp(arousal + step[1], 0, 1)) : value.arousal });
  };

  const merge = () => {
    onChange({ valence: fix((lyric + sound) / 2), arousal: value.arousal });
  };

  const y = yOf(arousal);
  const dashed = !ownAny;
  const gap = Math.abs(sound - lyric);

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        tabIndex={0}
        role="slider"
        aria-label="情绪板：横轴效价，纵轴唤醒度"
        aria-valuetext={split ? `词 ${lyric}，曲 ${sound}` : `效价 ${overall ?? '未定'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={onKeyDown}
        className={cx('w-full max-w-[22rem] touch-none rounded-lg bg-black/[0.03] outline-none focus-visible:ring-2 focus-visible:ring-[#39C5BB]/50', drag ? 'cursor-grabbing' : 'cursor-crosshair')}
      >
        <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="rgba(0,0,0,0.08)" />
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(0,0,0,0.08)" />
        {/* 各维在 VA 上的锚点：只作参照，淡淡地标着 */}
        {(Object.keys(FEEL_VA) as Feel[]).map(feel => (
          <text key={feel} x={xOf(FEEL_VA[feel].v)} y={yOf((FEEL_VA[feel].a + 1) / 2)} textAnchor="middle" dominantBaseline="middle" className="pointer-events-none fill-slate-300 text-[10px]" style={{ fontFamily: 'var(--font-zh)' }}>
            {FEEL_LABELS[feel]}
          </text>
        ))}
        <text x={6} y={H - 6} className="pointer-events-none fill-slate-400 text-[10px]">低落</text>
        <text x={W - 6} y={H - 6} textAnchor="end" className="pointer-events-none fill-slate-400 text-[10px]">明亮</text>
        <text x={W / 2 + 4} y={11} className="pointer-events-none fill-slate-400 text-[10px]">激活</text>
        <text x={W / 2 + 4} y={H - 6} className="pointer-events-none fill-slate-400 text-[10px]">安静</text>
        {arousalEditable && value.arousal !== undefined && (
          <line x1={0} y1={yOf(autoArousal!)} x2={W} y2={yOf(autoArousal!)} stroke="#39C5BB" strokeOpacity={0.35} strokeDasharray="3 4" />
        )}
        {split ? (
          <g className="pointer-events-none">
            <line x1={xOf(lyric)} y1={y} x2={xOf(sound)} y2={y} stroke={gap >= SPLIT_MIN ? '#FF8FA6' : '#94a3b8'} strokeWidth={2} strokeDasharray={dashed ? '4 3' : undefined} />
            {[['词', lyric, '#6F86B8'], ['曲', sound, '#F08A3C']].map(([label, v, color]) => (
              <g key={label as string} transform={`translate(${xOf(v as number)} ${y})`}>
                <circle r={11} fill={dashed ? '#fff' : (color as string)} stroke={color as string} strokeDasharray={dashed ? '3 2' : undefined} />
                <text textAnchor="middle" dominantBaseline="central" className={cx('text-[11px]', dashed ? 'fill-slate-600' : 'fill-white')}>{label}</text>
              </g>
            ))}
          </g>
        ) : overall !== undefined ? (
          <circle className="pointer-events-none" cx={xOf(overall)} cy={y} r={8} fill={dashed ? '#fff' : '#1B7A74'} stroke="#1B7A74" strokeDasharray={dashed ? '3 2' : undefined} />
        ) : null}
      </svg>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500">
        {split ? (
          <span>
            词 <span className="font-mono text-slate-700">{lyric.toFixed(2)}</span> / 曲 <span className="font-mono text-slate-700">{sound.toFixed(2)}</span>
            {gap >= SPLIT_MIN && <span className="ml-1 text-[#e06c86]">{sound > lyric ? '曲亮词暗' : '曲暗词亮'}</span>}
          </span>
        ) : (
          <span>
            效价 <span className="font-mono text-slate-700">{overall === undefined ? '—' : overall.toFixed(2)}</span> {overall !== undefined && valenceWord(overall)}
          </span>
        )}
        {dashed && (overall !== undefined || split) && <span className="text-slate-400">（跟随专辑）</span>}
        {arousalEditable && (
          <span>
            唤醒 <span className="font-mono text-slate-700">{arousal.toFixed(2)}</span>
            <span className="ml-1 text-slate-400">{value.arousal === undefined ? '自动' : `你改的（自动 ${autoArousal!.toFixed(2)}）`}</span>
          </span>
        )}
        <span className="ml-auto flex gap-2 text-[11px]">
          {ownSplit && <button type="button" className="text-slate-400 hover:text-slate-600" onClick={merge}>合成一个点</button>}
          {arousalEditable && value.arousal !== undefined && (
            <button type="button" className="text-slate-400 hover:text-slate-600" onClick={() => onChange({ ...value, arousal: undefined })}>唤醒改回自动</button>
          )}
          {ownAny && inherited && (inherited.valence !== undefined || inherited.lyricValence !== undefined) && (
            <button
              type="button"
              className="text-slate-400 hover:text-slate-600"
              onClick={() => onChange({ arousal: value.arousal })}
            >
              效价改回跟随专辑
            </button>
          )}
        </span>
      </div>
      {!split && <p className="mt-0.5 text-[11px] text-slate-400">按住 ⌥ 拖，把点拆成「词 / 曲」两个</p>}
    </div>
  );
}
