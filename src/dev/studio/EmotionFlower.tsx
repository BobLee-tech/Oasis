// 情绪花（docs/song-emotion-design.md §4.1）：十片花瓣按 GEMS 里相近的维首尾相接排一圈，
// 点一片 +1（3 之后回 0），⇧ 点或右键 −1；花瓣长度 = 强度，花心是按强度混出来的颜色（Cowen 情绪地图式）。
// 超过 3 维非零时外圈变成虚线提示，不拦。
import type { KeyboardEvent, MouseEvent } from 'react';
import { BLENDS, FEEL_LABELS, MAX_ACTIVE_FEELS, MAX_INTENSITY, blendOf } from '../../../scripts/lib/mood-core.mjs';
import type { Feel, Feels } from './api';
import { cx } from './classes';
import { FEEL_COLORS, FLOWER_KEYS, FLOWER_ORDER, bumpFeel, feelsText, mixFeelColor } from './emotion';

const R0 = 24; // 花心外缘
const LEN = [12, 30, 52, 76]; // 强度 0（只画淡轮廓）..3 的花瓣长度
const LABEL_R = 122;

const polar = (r: number, deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return [r * Math.cos(rad), r * Math.sin(rad)] as const;
};

const petalPath = (deg: number, len: number, width: number) => {
  const [bx, by] = polar(R0, deg);
  const [tx, ty] = polar(R0 + len, deg);
  const [mx, my] = polar(R0 + len * 0.55, deg);
  const [px, py] = polar(width, deg + 90);
  const f = (n: number) => n.toFixed(1);
  return `M${f(bx)} ${f(by)} Q${f(mx + px)} ${f(my + py)} ${f(tx)} ${f(ty)} Q${f(mx - px)} ${f(my - py)} ${f(bx)} ${f(by)}Z`;
};

export function EmotionFlower({
  value, inherited, onChange, keyHints = false, className,
}: {
  value: Feels | undefined;
  /** 跟随的上一层（专辑默认）：自己没写时以虚线显示 */
  inherited?: Feels;
  onChange: (next: Feels | undefined) => void;
  /** 显示 1–0 键位小字（只有接键盘的那朵花显示） */
  keyHints?: boolean;
  className?: string;
}) {
  const own = value !== undefined;
  const shown = value ?? inherited;
  const active = Object.keys(value ?? {}).length;
  const tooMany = active > MAX_ACTIVE_FEELS;
  const blend = blendOf(shown);
  const center = mixFeelColor(shown);

  const bump = (feel: Feel, delta: 1 | -1) => onChange(bumpFeel(value, feel, delta));
  const onClick = (feel: Feel) => (event: MouseEvent) => bump(feel, event.shiftKey ? -1 : 1);
  const onContext = (feel: Feel) => (event: MouseEvent) => {
    event.preventDefault();
    bump(feel, -1);
  };
  const onKey = (feel: Feel) => (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      bump(feel, event.shiftKey ? -1 : 1);
    }
  };

  return (
    <div className={cx('flex flex-col items-center', className)}>
      <svg viewBox="-150 -150 300 300" className="w-full max-w-[15rem] select-none" role="group" aria-label="情绪花">
        <circle r={R0 + LEN[3] + 4} fill="none" stroke={tooMany ? '#FF8FA6' : 'rgba(0,0,0,0.06)'} strokeDasharray={tooMany ? '4 4' : undefined} />
        {FLOWER_ORDER.map((feel, index) => {
          const deg = -90 + index * 36;
          const level = shown?.[feel] ?? 0;
          const color = FEEL_COLORS[feel];
          const [lx, ly] = polar(LABEL_R, deg);
          return (
            <g
              key={feel}
              role="button"
              tabIndex={0}
              aria-label={`${FEEL_LABELS[feel]} ${value?.[feel] ?? 0}/${MAX_INTENSITY}`}
              onClick={onClick(feel)}
              onContextMenu={onContext(feel)}
              onKeyDown={onKey(feel)}
              className="cursor-pointer outline-none [&:focus-visible>path:last-of-type]:stroke-slate-700"
            >
              {/* 整片扇区都能点 */}
              <path d={petalPath(deg, LEN[3] + 6, 22)} fill="transparent" />
              {level === 0 ? (
                <path d={petalPath(deg, LEN[0] + 8, 8)} fill="none" stroke={color} strokeOpacity={0.45} strokeDasharray="2 3" />
              ) : (
                <path
                  d={petalPath(deg, LEN[level], 9 + level * 2)}
                  fill={own ? color : 'none'}
                  fillOpacity={0.35 + level * 0.2}
                  stroke={color}
                  strokeWidth={own ? 1 : 1.5}
                  strokeDasharray={own ? undefined : '4 3'}
                  className="transition-[d] duration-150"
                />
              )}
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                className={cx('text-[13px]', level ? 'fill-slate-800' : 'fill-slate-400')}
                style={{ fontFamily: 'var(--font-zh)' }}
              >
                {FEEL_LABELS[feel]}
              </text>
              {keyHints && (
                <text x={lx} y={ly + 13} textAnchor="middle" dominantBaseline="middle" className="fill-slate-300 font-mono text-[9px]">
                  {FLOWER_KEYS[index]}
                </text>
              )}
            </g>
          );
        })}
        <circle r={R0 - 4} fill={center ?? '#F1EEE6'} fillOpacity={own ? 0.9 : 0.45} stroke="rgba(0,0,0,0.08)" />
      </svg>
      <div className="mt-1 flex min-h-5 flex-wrap items-center justify-center gap-2 text-[12px]">
        {blend && (
          <span className="rounded-full bg-[#39C5BB]/12 px-2 py-px text-[#1B7A74]" style={{ fontFamily: 'var(--font-zh)' }}>
            {BLENDS.find(item => item.id === blend)?.label}
          </span>
        )}
        <span className="text-slate-500">{feelsText(shown) || '还没标'}</span>
        {!own && inherited && <span className="text-slate-400">（跟随专辑）</span>}
        {tooMany && <span className="text-rose-500">{active} 维，建议不超过 {MAX_ACTIVE_FEELS}</span>}
      </div>
      {own && inherited && (
        <button type="button" className="mt-1 text-[11px] text-slate-400 hover:text-slate-600" onClick={() => onChange(undefined)}>
          改回跟随专辑
        </button>
      )}
    </div>
  );
}
