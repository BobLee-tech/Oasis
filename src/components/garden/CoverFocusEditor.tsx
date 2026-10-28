// 🎯 封面取景（写作抽屉 Cover 一栏的下半，上半选图见 CoverPicker.tsx）：在封面图上拖一个框（人物框整个头，物件框主体），
//   松手交给 onBox，由调用方写回地址的 `#focus=x0,y0,x1,y1`；框内拖动是挪，右下角是缩放，框外拖是重画。
//   右边两条用卡片同一套排版（CoverImage）实时预览：宽卡（桌面两列）与手机卡。
import React, { useRef, useState } from 'react';
import { parseFocus, stripFocus, withFocus, type FocusBox } from '../../lib/coverImage';
import { CoverImage } from './CoverImage';

const MIN = 0.04;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const big = (b: FocusBox | null) => (b && b[2] - b[0] >= MIN && b[3] - b[1] >= MIN ? b : null);

type Drag = { mode: 'draw' | 'move' | 'resize'; x: number; y: number; start: FocusBox };

export const CoverFocusEditor: React.FC<{ src: string; note?: string; onBox: (box: FocusBox | null) => void }> = ({ src, note, onBox }) => {
  // 拖动中的框只属于当时那个地址；换了图或框被别处改过，就回到地址里存的框
  const [edit, setEdit] = useState<{ src: string; box: FocusBox | null } | null>(null);
  const box = edit?.src === src ? edit.box : parseFocus(src);
  const setBox = (b: FocusBox | null) => setEdit({ src, box: b });
  const stage = useRef<HTMLDivElement>(null), drag = useRef<Drag | null>(null);

  const at = (e: React.PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  };
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = at(e), b = box;
    // 右下角一圈都算把手（把手本身只有 12px，指尖和触控板都不好对准）
    const nearCorner = !!b && Math.abs(p.x - b[2]) < 0.05 && Math.abs(p.y - b[3]) < 0.04;
    const mode: Drag['mode'] = (e.target as HTMLElement).dataset.handle || nearCorner ? 'resize'
      : b && p.x > b[0] && p.x < b[2] && p.y > b[1] && p.y < b[3] ? 'move' : 'draw';
    drag.current = { mode, ...p, start: b ?? [p.x, p.y, p.x, p.y] };
    if (mode === 'draw') setBox([p.x, p.y, p.x, p.y]);
    stage.current!.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = at(e), [x0, y0, x1, y1] = d.start;
    if (d.mode === 'draw') setBox([Math.min(d.x, p.x), Math.min(d.y, p.y), Math.max(d.x, p.x), Math.max(d.y, p.y)]);
    else if (d.mode === 'resize') setBox([x0, y0, Math.max(x0 + MIN, p.x), Math.max(y0 + MIN, p.y)]);
    else {
      const dx = Math.min(Math.max(p.x - d.x, -x0), 1 - x1), dy = Math.min(Math.max(p.y - d.y, -y0), 1 - y1);
      setBox([x0 + dx, y0 + dy, x1 + dx, y1 + dy]);
    }
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    const b = big(box);
    setEdit(null);
    if (b) onBox(b); // 只点了一下不算重画，原来的框留着
  };
  const preview = withFocus(stripFocus(src), big(box));

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      <div className="shrink-0">
        <div ref={stage} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          className="relative w-[min(340px,80vw)] rounded-lg overflow-hidden cursor-crosshair select-none touch-none bg-slate-100 dark:bg-white/5">
          <img src={stripFocus(src)} alt="" draggable={false} className="block w-full h-auto pointer-events-none" />
          {box && (
            <div className="absolute border-[1.5px] border-dashed border-[#FFB7C5] shadow-[0_0_0_9999px_rgba(15,23,42,0.35)] cursor-move"
              style={{ left: `${box[0] * 100}%`, top: `${box[1] * 100}%`, width: `${(box[2] - box[0]) * 100}%`, height: `${(box[3] - box[1]) * 100}%` }}>
              <span data-handle="1" className="absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-sm bg-[#FFB7C5] border border-white cursor-nwse-resize" />
            </div>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3 font-mono text-[9px] tracking-[0.15em] uppercase text-slate-400 dark:text-slate-500">
          {note && <span className="normal-case tracking-normal font-serif text-[11px]">{note}</span>}
          {parseFocus(src) && <button onClick={() => { setEdit(null); onBox(null); }} className="hover:text-[#FFB7C5] transition-colors">清除取景框</button>}
        </div>
      </div>
      <div className="flex flex-col gap-2 font-serif text-xs text-slate-400 dark:text-slate-500 min-w-0">
        <p className="leading-relaxed max-w-sm">在图上拖一个框：人物框住整个头，物件框住主体。卡片上这个框永远整个露出来，装不下时画会缩小、两边垫虚影。不框就按画面中心铺满。</p>
        <div className="flex items-end gap-3 flex-wrap">
          <figure className="m-0"><div className="relative w-[266px] h-[82px] rounded-lg overflow-hidden bg-[#f3efe7] dark:bg-white/[0.04]"><CoverImage src={preview} /></div><figcaption className="mt-1 font-mono text-[9px] tracking-widest uppercase">Desktop</figcaption></figure>
          <figure className="m-0"><div className="relative w-[164px] h-[82px] rounded-lg overflow-hidden bg-[#f3efe7] dark:bg-white/[0.04]"><CoverImage src={preview} /></div><figcaption className="mt-1 font-mono text-[9px] tracking-widest uppercase">Mobile</figcaption></figure>
        </div>
      </div>
    </div>
  );
};
