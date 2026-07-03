import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// 🅰️ 字体：西文衬线 EB Garamond + 中文手写体 霞鹜文楷 Screen（按 unicode-range 分片，按需加载）+ 等宽 JetBrains Mono
//    字体栈在 index.css 的 @theme 中装配，此处仅注入 @font-face。
import '@fontsource/eb-garamond/400.css'
import '@fontsource/eb-garamond/500.css'
import '@fontsource/eb-garamond/600.css'
import '@fontsource/eb-garamond/400-italic.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import 'lxgw-wenkai-screen-webfont/lxgwwenkaigbscreen.css'

import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
