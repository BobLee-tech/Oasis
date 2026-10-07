// 曲目工坊入口：只由 scripts/music-studio/plugin.mjs 在开发服务器的 /__studio 页面引用，
// index.html 与 main.tsx 都不引用它，所以构建产物里没有工坊。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/500.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/klee-one/400.css';
import 'lxgw-wenkai-screen-webfont/lxgwwenkaigbscreen.css';
import '../../index.css';
import { StudioApp } from './StudioApp';

createRoot(document.getElementById('studio')!).render(
  <StrictMode>
    <StudioApp />
  </StrictMode>,
);
