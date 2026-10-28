// 🖼️ 文章卡的封面图：正文里挑出的那张（lib/coverImage.ts 的 pickCover），按取景框排进封面条。
//   框整个留在封面里；铺满时装不下（竖图的人像落在宽卡上）就缩到刚好装下，两边垫同一幅画的虚影、边缘淡开。
//   排版是直写 style 的几何，不进 React 状态：图到了、封面尺寸变了才重排。夜里画暗两成，悬停以框心推近 3%（index.css）。
import React, { useEffect, useRef } from 'react';
import { coverLayout, parseFocus } from '../../lib/coverImage';

export const CoverImage: React.FC<{ src: string }> = ({ src }) => {
  const boxRef = useRef<HTMLDivElement>(null), fgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const box = boxRef.current, img = fgRef.current;
    if (!box || !img) return;
    const focus = parseFocus(src);
    const layout = () => {
      if (!img.naturalWidth || !box.clientWidth) return;
      const l = coverLayout(box.clientWidth, box.clientHeight, img.naturalWidth, img.naturalHeight, focus);
      Object.assign(img.style, { width: `${l.width}px`, height: `${l.height}px`, left: `${l.left}px`, top: `${l.top}px`, transformOrigin: `${l.originX}px ${l.originY}px` });
      box.classList.toggle('is-letterbox', l.letterbox);
      box.classList.toggle('is-letterbox-y', l.letterbox && l.height < box.clientHeight - 0.5);
      box.classList.add('is-ready');
    };
    if (img.complete) layout(); else img.addEventListener('load', layout, { once: true });
    const ro = new ResizeObserver(layout); ro.observe(box);
    return () => { ro.disconnect(); img.removeEventListener('load', layout); };
  }, [src]);
  return (
    <div ref={boxRef} className="oasis-cover-image absolute inset-0 overflow-hidden" aria-hidden>
      <img className="oasis-cover-bg" src={src} alt="" loading="lazy" decoding="async" />
      <img ref={fgRef} className="oasis-cover-fg" src={src} alt="" loading="lazy" decoding="async" />
      {/* 下沿一层很薄的纱，压在画上的标签不用各自加重底 */}
      <div className="absolute inset-x-0 bottom-0 h-[46%] bg-gradient-to-b from-transparent to-black/15 pointer-events-none" />
    </div>
  );
};
