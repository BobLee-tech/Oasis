// 🔔 跨组件唤起 ⌘K 面板：与 lib/lightbox.ts 同一种约定——
//   任何深处的组件（如 Gallery 的搜索图标）都能 dispatch 这个事件唤起面板，
//   而不必把 open 状态一路 prop-drill 穿过懒加载的场所边界。
export const PALETTE_EVENT = 'oasis:palette';
export const openPalette = () => window.dispatchEvent(new CustomEvent(PALETTE_EVENT));
