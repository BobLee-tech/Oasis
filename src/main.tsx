import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// 🅰️ 字体：西文衬线 EB Garamond + 中文手写体 霞鹜文楷 Screen（按 unicode-range 分片，按需加载）+ 等宽 JetBrains Mono
//    字体栈在 index.css 的 @theme 中装配，此处仅注入 @font-face。
//    Klee One（日文歌词专用 --font-ja）不在此处引入——它只服务共鸣场所里的歌词组件，
//    124 条 @font-face 声明占关键 CSS gzip 后体积的三分之一，随 OasisResonance 懒加载 chunk 一起到达即可，
//    见 components/resonance/LyricPanel.tsx 顶部的引入。
import '@fontsource/eb-garamond/400.css'
import '@fontsource/eb-garamond/500.css'
import '@fontsource/eb-garamond/600.css'
import '@fontsource/eb-garamond/400-italic.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import 'lxgw-wenkai-screen-webfont/lxgwwenkaigbscreen.css'

import './index.css'
import App from './App.tsx'

// 🔬 逐帧瞬移探针：只在开发环境挂到 window.__uiProbe，构建产物里没有它。
if (import.meta.env.DEV) {
  void import('./dev/uiProbe').then(({ installUiProbe }) => installUiProbe())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
