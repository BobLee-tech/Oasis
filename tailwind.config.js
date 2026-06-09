// tailwind.config.js (或 tailwind.config.ts)
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // ✨ 必须开启这一行，否则你在组件里写的 dark:bg-xxx 全都不会生效！
  darkMode: 'class', 
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}