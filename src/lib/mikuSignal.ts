// 🎐 极轻量事件总线：OasisGallery 的写作/阅读态和常驻的 Miku 大脑不在同一条组件树路径上——
//   OasisGallery 懒加载、只在 garden 视图挂载，Miku 全局常驻。为这点信号把 App 的 prop 链路
//   凿穿一路传下去不值得，用 window CustomEvent 打个招呼就够了，不为此引入状态库。
/** 阅读舱里那一篇（只带台词要用的几项；访客只会打开非草稿，天然不泄露） */
export interface MikuReadingPost {
  id: string;
  title: string;
  /** 条目类型（thought / note / project…）与合集名 */
  category: string;
  series?: string;
  words: number;
}

export type MikuSignal =
  | { type: 'editor-open' }
  | { type: 'editor-close' }
  /** 编辑器里的字数（节流约 2s 一次）：写作里程碑 500/1000/2000 字 */
  | { type: 'editor-progress'; words: number }
  | { type: 'published'; id?: string; title?: string }
  | { type: 'reading-open'; post?: MikuReadingPost }
  | { type: 'reading-close' }
  | { type: 'focus-open'; source: string }
  | { type: 'focus-close'; source: string };

const EVENT_NAME = 'oasis:miku-signal';

export const emitMikuSignal = (signal: MikuSignal) => {
  window.dispatchEvent(new CustomEvent<MikuSignal>(EVENT_NAME, { detail: signal }));
};

export const onMikuSignal = (handler: (signal: MikuSignal) => void) => {
  const listener = (e: Event) => handler((e as CustomEvent<MikuSignal>).detail);
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
};

/** 字数：中日文按字、西文按词——与「写了多少」的直觉一致，不用 String.length（会把英文按字母算）。 */
export const countWords = (text: string) => {
  const cjk = text.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const latin = text.replace(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g, ' ').match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0;
  return cjk + latin;
};
