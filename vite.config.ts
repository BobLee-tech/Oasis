import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// 曲目工坊（/__studio）：apply: 'serve'，只在开发服务器里存在，见 docs/music-design.md P3
import musicStudio from './scripts/music-studio/plugin.mjs'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // 注入 Tailwind v4 编译灵魂
    musicStudio(),
  ],
})