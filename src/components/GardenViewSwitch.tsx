// 🗺️ 文章的两种看法：列表（按时间流的「溪」）与星图（按关系长的「园」）。
//   星图不再占 Dock 一格，入口就是这里；Dock 在星图时仍亮「花园」那格。
//   内部还是两个场所（garden / orchard），#/garden 与 #/constellation 各自照旧，Miku 的场所台词也照旧。
//   样式照音乐页右上的「歌词 / 选碟」切换条，只把当前项的底色换成初音绿。
//   窄屏不做星图（已拍板），所以整个切换不显示——不是导航里少一格，是少一种看法。
//   位置：顶部居中、与右上时钟同高；星图页头（sand.css 的 top: 65px）在它下面留 13px，别再往下挪。
import { useSyncExternalStore } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { AppView } from '../types/auth';

const subscribeNarrow = (notify: () => void) => {
  const q = window.matchMedia('(max-width: 767px)');
  q.addEventListener('change', notify);
  return () => q.removeEventListener('change', notify);
};
const isNarrow = () => window.matchMedia('(max-width: 767px)').matches;

// 光标刚落上去就拉星图的 chunk（与 App.tsx 的 lazy() 同一模块，不会重复打包）
const prefetchOrchard = () => { void import('./OasisOrchard'); };

const MODES = [
  { view: 'garden', label: '列表' },
  { view: 'orchard', label: '星图' },
] as const;

interface GardenViewSwitchProps {
  view: 'garden' | 'orchard';
  onSwitch: (view: AppView, origin?: { x: number; y: number }) => void;
}

export const GardenViewSwitch = ({ view, onSwitch }: GardenViewSwitchProps) => {
  const reduce = !!useReducedMotion();
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
  if (narrow) return null;

  return (
    <motion.div
      role="group"
      aria-label="文章的看法"
      data-oasis-avoid
      className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] inline-flex p-[3px] rounded-full bg-white/40 dark:bg-white/[0.035] border border-white/55 dark:border-white/[0.08] backdrop-blur-md shadow-sm"
      initial={{ opacity: 0, y: reduce ? 0 : -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0.12 : 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {MODES.map(m => {
        const on = view === m.view;
        return (
          <button
            key={m.view}
            type="button"
            aria-pressed={on}
            onPointerEnter={m.view === 'orchard' ? prefetchOrchard : undefined}
            onClick={(e) => {
              if (on) return;
              const r = e.currentTarget.getBoundingClientRect();
              onSwitch(m.view, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
            }}
            className={`relative min-w-20 h-7 px-4 rounded-full font-mono text-[9px] tracking-[0.24em] transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[#39C5BB] ${on ? 'text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            {on && (
              <motion.span
                layoutId="gardenViewPill"
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: '#39C5BB', boxShadow: '0 4px 16px rgba(57,197,187,0.25)' }}
                transition={reduce ? { duration: 0.12 } : { type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10">{m.label}</span>
          </button>
        );
      })}
    </motion.div>
  );
};
