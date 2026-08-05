// src/components/OasisLights.tsx
// 🏮 灯火 Neighboring Lights：朋友们的花园，长夜里各自亮着的灯。
//   每位朋友是一盏漂浮的「光茧」——磨砂玻璃卡，站名与一句话直接可见，
//   错落高低、各按自己的节奏浮沉，hover 时整盏灯被点亮。
//   数据源：src/data/friends.ts（与站内 aura 色板同语言）。
import React from 'react';
import { motion } from 'framer-motion';
import { FRIENDS } from '../data/friends';

// 确定性哈希：错落偏移与呼吸相位每次一致，不随渲染乱跳
const seeded = (str: string) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  const x = Math.sin(h) * 10000;
  return x - Math.floor(x);
};

const hostOf = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};

export const OasisLights: React.FC = () => (
  <motion.div className="oasis-bottom-scroll-safe absolute inset-0 w-full h-full overflow-y-auto no-scrollbar flex flex-col items-center pt-20 md:pt-28 pb-44 px-5 md:px-8 z-10">
    {/* 报头：与其他场所同款的安静排版 */}
    <div className="text-center mb-16 shrink-0">
      <div className="font-mono text-[10px] tracking-[0.5em] uppercase text-slate-400/70 dark:text-slate-500 mb-3 transition-colors duration-[1500ms]">Neighboring Lights</div>
      <p className="font-serif italic text-slate-400 dark:text-slate-500 text-sm transition-colors duration-[1500ms]">长夜里，朋友们的花园各自亮着灯。</p>
    </div>

    {FRIENDS.length === 0 ? (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center -mt-16">
        <span className="font-serif italic text-slate-400 dark:text-slate-400 text-lg">夜色很安静，还没有灯。</span>
        <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-slate-400/60 dark:text-slate-600">The night is quiet — no lights yet</span>
      </div>
    ) : (
      <div className="flex flex-wrap justify-center items-start gap-x-9 gap-y-8 max-w-4xl w-full">
        {FRIENDS.map((f, i) => {
          const lift = seeded(f.name) * 56;            // 错落高低，像高低不一的灯
          const breathe = 6 + seeded(f.url) * 3;       // 各自的呼吸周期
          const phase = seeded(f.name + 'p') * 4;      // 错峰相位
          return (
            <motion.a
              key={f.url}
              href={f.url} target="_blank" rel="noopener noreferrer"
              className="group relative w-full max-w-[340px] sm:w-[230px] outline-none md:mt-[var(--lift)]"
              style={{ ['--lift' as string]: `${lift}px` }}
              initial={{ opacity: 0, y: 26, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 1.1, delay: 0.2 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
              whileTap={{ scale: 0.97 }}
              aria-label={`${f.name} — ${f.desc}`}
            >
              {/* 灯在夜里轻轻浮沉 */}
              <motion.div
                animate={{ y: [-4, 4] }}
                transition={{ duration: breathe, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut', delay: phase }}
              >
                {/* 灯的辉光：常态微微呼吸，hover 时整盏点亮 */}
                <motion.span
                  aria-hidden
                  className="absolute -inset-2 rounded-[2rem] blur-xl pointer-events-none"
                  style={{ backgroundColor: f.color }}
                  animate={{ opacity: [0.07, 0.16, 0.07] }}
                  transition={{ duration: breathe, repeat: Infinity, ease: 'easeInOut', delay: phase }}
                />
                <span
                  aria-hidden
                  className="absolute -inset-2 rounded-[2rem] blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-700 pointer-events-none"
                  style={{ backgroundColor: f.color }}
                />

                {/* 光茧本体 */}
                <div className="relative flex flex-col items-center text-center rounded-3xl px-7 pt-8 pb-7 bg-white/45 dark:bg-white/[0.045] backdrop-blur-xl border border-white/55 dark:border-white/[0.08] shadow-[0_18px_50px_-30px_rgba(15,23,42,0.35)] dark:shadow-[0_18px_50px_-30px_rgba(0,0,0,0.7)] transition-colors duration-700 group-hover:border-white/80 dark:group-hover:border-white/[0.16]">
                  {/* 灯芯：呼吸光点 */}
                  <span className="relative flex items-center justify-center w-4 h-4 mb-4">
                    <motion.span
                      aria-hidden
                      className="absolute w-4 h-4 rounded-full blur-[5px]"
                      style={{ backgroundColor: f.color }}
                      animate={{ opacity: [0.35, 0.85, 0.35] }}
                      transition={{ duration: breathe, repeat: Infinity, ease: 'easeInOut', delay: phase }}
                    />
                    <span className="relative w-1.5 h-1.5 rounded-full" style={{ backgroundColor: f.color, boxShadow: `0 0 10px ${f.color}90` }} />
                  </span>

                  <span className="font-serif text-[17px] text-slate-700 dark:text-slate-200 mb-2 leading-snug transition-colors duration-700 group-hover:text-slate-900 dark:group-hover:text-white">{f.name}</span>
                  <span className="font-serif italic text-xs leading-[1.7] text-slate-400 dark:text-slate-500 mb-4 transition-colors duration-700">{f.desc}</span>
                  <span className="font-mono text-[8px] tracking-[0.25em] uppercase text-slate-400/60 dark:text-slate-600 group-hover:opacity-100 transition-all duration-700" style={{ color: undefined }}>
                    <span className="group-hover:hidden">{hostOf(f.url)}</span>
                    <span className="hidden group-hover:inline oasis-accent-ink" style={{ '--accent': f.color } as React.CSSProperties}>Visit →</span>
                  </span>
                </div>
              </motion.div>
            </motion.a>
          );
        })}
      </div>
    )}

    {/* 尾注：友链交换的温柔入口 */}
    <p className="mt-20 shrink-0 text-center font-serif italic text-xs text-slate-400/80 dark:text-slate-600 transition-colors duration-[1500ms]">
      灯火常新 — 想把你的花园连过来？<a href="mailto:lb15058460816@gmail.com" className="text-slate-400 dark:text-slate-500 hover:text-[#39C5BB] dark:hover:text-[#39C5BB] border-b border-slate-300/50 dark:border-white/10 hover:border-[#39C5BB]/50 pb-0.5 transition-colors">来信</a>
    </p>
  </motion.div>
);
