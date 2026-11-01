// 🖼️ 图片点击 → 全屏灯箱。用自定义事件解耦：Markdown 只管派发，Reader 里的 Lightbox 负责呈现。
export const LIGHTBOX_EVENT = 'oasis:lightbox';
export const openLightbox = (src: string, alt?: string) =>
  window.dispatchEvent(new CustomEvent(LIGHTBOX_EVENT, { detail: { src, alt } }));
