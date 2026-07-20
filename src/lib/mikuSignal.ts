// 🎐 极轻量事件总线：OasisGallery 的写作/阅读态和常驻的 Miku 大脑不在同一条组件树路径上——
//   OasisGallery 懒加载、只在 garden 视图挂载，Miku 全局常驻。为这点信号把 App 的 prop 链路
//   凿穿一路传下去不值得，用 window CustomEvent 打个招呼就够了，不为此引入状态库。
export type MikuSignal =
  | { type: 'editor-open' }
  | { type: 'editor-close' }
  | { type: 'published' }
  | { type: 'reading-open' }
  | { type: 'reading-close' };

const EVENT_NAME = 'oasis:miku-signal';

export const emitMikuSignal = (signal: MikuSignal) => {
  window.dispatchEvent(new CustomEvent<MikuSignal>(EVENT_NAME, { detail: signal }));
};

export const onMikuSignal = (handler: (signal: MikuSignal) => void) => {
  const listener = (e: Event) => handler((e as CustomEvent<MikuSignal>).detail);
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
};
