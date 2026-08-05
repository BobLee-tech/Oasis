// 🫧 有后果的动作 → 涟漪：全局点击涟漪只为「留下痕迹」的动作而响——发布文章、
//   留下一片落叶、⌘K 执行一条命令。到处响的信号等于没有信号（habituation）；
//   切换场所已经有自己专属的 RippleBloom 转场，不需要再叠一圈小涟漪。
//   与 mikuSignal.ts 同一种轻量 CustomEvent 写法，各处 emit 时带上落点坐标；
//   坐标类型复用 transitions.ts 里 RippleBloom 已经定义的同形状类型，不再另开一份。
import type { RippleOrigin } from './transitions';

const EVENT_NAME = 'oasis:ripple';

export const emitRipple = (origin: RippleOrigin) => {
  window.dispatchEvent(new CustomEvent<RippleOrigin>(EVENT_NAME, { detail: origin }));
};

export const onRipple = (handler: (origin: RippleOrigin) => void) => {
  const listener = (e: Event) => handler((e as CustomEvent<RippleOrigin>).detail);
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
};
