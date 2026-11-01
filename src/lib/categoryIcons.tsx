// src/lib/categoryIcons.tsx
// 分类图标的路径数据（JSX 片段）。组件在 components/CategoryIcon.tsx，
// 拆开是为了让组件文件只导出组件（Vite 热更新的要求）。
import type React from 'react';

// —— 🎨 线性图标集：内置 5 个 + 供自定义分类挑选的扩展图标，风格统一 ——
export const strokeProps = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
  strokeLinecap: 'round', strokeLinejoin: 'round',
} as const;
export const ICONS: Record<string, React.ReactNode> = {
  pen: (<><path d="M20.4 14.5L16 10 4 20"/><path d="M14 4l6 6"/><path d="M3 21l4-1 11-11a2.8 2.8 0 0 0-4-4L3 16z"/></>),
  calendar: (<><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>),
  book: (<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>),
  sprout: (<><path d="M7 20h10"/><path d="M12 20V8"/><path d="M12 8C12 5 9.5 3 6 3c0 3.5 2.5 5 6 5z"/><path d="M12 11c0-2.5 2.2-4.5 5.5-4.5C17.5 9.5 15.2 11 12 11z"/></>),
  tool: (<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>),
  star: (<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>),
  heart: (<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/>),
  music: (<><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>),
  camera: (<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></>),
  flask: (<><path d="M10 2v7L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V2"/><path d="M8.5 2h7"/><path d="M7 15h10"/></>),
  globe: (<><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>),
  film: (<><rect x="2" y="2" width="20" height="20" rx="2.2"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 7h5M17 17h5"/></>),
  compass: (<><circle cx="12" cy="12" r="10"/><path d="M16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3z"/></>),
  coffee: (<><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><path d="M6 1v3M10 1v3M14 1v3"/></>),
};
export const ICON_NAMES = Object.keys(ICONS);
