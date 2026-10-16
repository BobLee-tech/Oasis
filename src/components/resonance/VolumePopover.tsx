import React from 'react';
import { changeVolume, usePlayer } from '../../hooks/useSoundscape';

export const VolumeIcon: React.FC<{ volume: number; className: string }> = ({ volume, className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
    {volume <= 0.001 ? <path d="M23 9l-6 6M17 9l6 6" /> : <><path d="M15.5 8.5a5 5 0 0 1 0 7" />{volume > 0.55 && <path d="M18.5 5.5a9 9 0 0 1 0 13" />}</>}
  </svg>
);

/**
 * 🔊 音量是低频控件：图标点一下静音 / 恢复，悬停或键盘聚焦时才弹出滑轨（渐进披露）。
 * 弹层与图标之间留一段透明的桥，指针从图标移上去时不会断开悬停。
 */
export const VolumePopover: React.FC<{ placement?: 'top' | 'right'; buttonClassName?: string }> = ({
  placement = 'top',
  buttonClassName = 'h-10 w-10',
}) => {
  const volume = usePlayer(s => s.volume);
  const toggleMute = () => changeVolume(volume > 0 ? 0 : 0.5);
  const position = placement === 'top'
    ? 'bottom-full right-1/2 translate-x-1/2 pb-2'
    : 'left-full top-1/2 -translate-y-1/2 pl-2';

  return (
    <div className="group/vol relative shrink-0">
      <button
        type="button"
        onClick={toggleMute}
        aria-label={volume > 0 ? '静音' : '取消静音'}
        className={`flex items-center justify-center text-slate-400 outline-none transition-colors hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-[color:var(--mood)] rounded-full dark:text-slate-500 dark:hover:text-slate-200 ${buttonClassName}`}
      >
        <VolumeIcon volume={volume} className="h-[18px] w-[18px]" />
      </button>
      <div className={`absolute z-50 ${position} pointer-events-none opacity-0 transition-opacity duration-200 group-hover/vol:pointer-events-auto group-hover/vol:opacity-100 group-focus-within/vol:pointer-events-auto group-focus-within/vol:opacity-100`}>
        <div className="flex h-10 w-48 items-center gap-3 rounded-full border border-slate-200/70 bg-white/92 px-4 shadow-[0_12px_30px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:border-white/10 dark:bg-[#111728]/94">
          <div className="relative flex h-6 flex-1 items-center">
            <div className="absolute inset-x-0 h-[3px] overflow-hidden rounded-full bg-slate-300/50 dark:bg-white/10">
              <div className="h-full w-full origin-left rounded-full" style={{ transform: `scaleX(${volume})`, backgroundColor: 'var(--mood)' }} />
            </div>
            <div
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 rounded-full bg-white shadow-md ring-2 dark:bg-slate-100"
              style={{ left: `${volume * 100}%`, ['--tw-ring-color' as string]: 'var(--mood)' }}
            />
            <input
              type="range" min={0} max={1} step={0.01} value={volume}
              onChange={event => changeVolume(Number(event.target.value))}
              aria-label="音量"
              className="absolute inset-x-0 h-6 w-full cursor-pointer appearance-none bg-transparent opacity-0"
            />
          </div>
          <span className="w-6 select-none text-right font-mono text-[10px] tabular-nums text-slate-400 dark:text-slate-500">{Math.round(volume * 100)}</span>
        </div>
      </div>
    </div>
  );
};
