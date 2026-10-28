import { useEffect, useRef, type RefObject } from 'react';

/**
 * 🫳 顶部下拉关闭（全屏阅读舱用）
 *
 * 不用 framer-motion 的 drag="y"：它给容器写 touch-action: pan-x，
 * 竖向滑动全被拖拽吞掉——手机上在顶部根本滚不动，往下拉还把整层拽下来露出背后的列表。
 *
 * 这里只挂 passive 的 touch 监听，不 preventDefault、不位移：滚动永远是原生的，
 * 只有「手指落下时已在顶部、一路竖着往下拉够远、松手时仍在顶部」才算要关。
 * iOS 的回弹由容器自己的底色兜着，不会透出背景。
 */
export function usePullToClose(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void,
  threshold = 120,
) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    let start: { x: number; y: number } | null = null;
    let dx = 0, dy = 0;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || el.scrollTop > 0) { start = null; return; }
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY };
      dx = dy = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      if (e.touches.length !== 1) { start = null; return; }
      const t = e.touches[0];
      dx = t.clientX - start.x;
      dy = t.clientY - start.y;
      // 往上推就是在读：这一手不再算下拉
      if (dy < -8) start = null;
    };
    const onEnd = () => {
      if (start && dy > threshold && dy > Math.abs(dx) * 1.5 && el.scrollTop <= 0) onCloseRef.current();
      start = null;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [ref, active, threshold]);
}
