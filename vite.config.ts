import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// 曲目工坊（/__studio）：apply: 'serve'，只在开发服务器里存在，见 docs/music-design.md P3
import musicStudio from './scripts/music-studio/plugin.mjs'
// 写作抽屉的本地上传（/__upload/image）：同样只在开发服务器里，压 webp 传 R2，与 npm run img 同一条路
import imageUpload from './scripts/image-upload/plugin.mjs'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // 注入 Tailwind v4 编译灵魂
    musicStudio(),
    imageUpload(),
  ],
  build: {
    // 灯火页的两套中文字（朱雀仿宋、志莽行书）切成几百片：小于 4 KB 的片默认会被 base64 塞进 CSS，
    // 一进灯火就得下完整整 200 KB 的 CSS。让它们保持独立文件，按 unicode-range 用到哪片取哪片。
    assetsInlineLimit: (file) => (/zhuque-fangsong|zhi-mang-xing/i.test(file) ? false : undefined),
  },
})