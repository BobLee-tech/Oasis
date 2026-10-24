// 🧭 四个顶层场所的稳定入口。星图不占格子：它是文章的另一种看法，入口在文章页顶上的
//   「列表 / 星图」切换（GardenViewSwitch）；在星图时这里亮「花园」，再点一下回到列表。
// 24 网格 / 20×20 live area / 统一 1.6px 描边；色彩只表达「当前所在」，
// 各场所的情绪色留给页面与涟漪，不让导航同时说五种语言。
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { AppView } from '../types/auth';
import { PLACE_NAME } from '../lib/places';

interface OasisDockProps {
  currentView: AppView;
  onViewChange: (view: AppView, origin?: { x: number; y: number }) => void;
}

interface DockItem {
  view: Exclude<AppView, 'welcome' | 'echoes' | 'orchard' | 'yuantu'>;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
}

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'w-[21px] h-[21px] md:w-[22px] md:h-[22px]',
};

const ResonanceIcon = () => (
  <svg {...svgProps}>
    <path d="M4 13.6v-1.9a8 8 0 0 1 16 0v1.9" />
    <rect x="2" y="12.8" width="4.6" height="7.4" rx="2.3" />
    <rect x="17.4" y="12.8" width="4.6" height="7.4" rx="2.3" />
  </svg>
);

const GardenIcon = () => (
  <svg {...svgProps}>
    <path d="M12 20.3V10.1" />
    <path d="M12 11.5C12 7.3 8.9 3.7 3.9 3.7c0 5 3.4 7.8 8.1 7.8Z" />
    <path d="M12 15.3c0-3.6 3-6.2 8.1-6.2 0 4.2-3.4 6.2-8.1 6.2Z" />
  </svg>
);

const AtelierIcon = () => (
  <svg {...svgProps}>
    {/* 工坊：一方印章 */}
    <path d="M9.6 13.6v-3a2.4 2.4 0 1 1 4.8 0v3" />
    <rect x="4.5" y="13.6" width="15" height="4.6" rx="1.6" />
    <path d="M6.5 21h11" />
  </svg>
);

const LetterIcon = () => (
  <svg {...svgProps}>
    {/* 尺牍：竖式信封，封舌合着，正中一道红签 */}
    <rect x="6" y="3.5" width="12" height="17" rx="1.2" />
    <path d="M6 4.2 12 9.6l6-5.4" />
    <path d="M12 12.2v5.6" />
  </svg>
);

const DOCK_ITEMS: DockItem[] = [
  { view: 'soundscape', label: 'Resonance', shortLabel: PLACE_NAME.soundscape, icon: <ResonanceIcon /> },
  { view: 'garden', label: 'Garden', shortLabel: PLACE_NAME.garden, icon: <GardenIcon /> },
  { view: 'atelier', label: 'Atelier', shortLabel: PLACE_NAME.atelier, icon: <AtelierIcon /> },
  { view: 'lights', label: 'Letters', shortLabel: PLACE_NAME.lights, icon: <LetterIcon /> },
];

// 🪄 场所预取：手指/光标刚落到某个目的地图标上就提前拉取对应 chunk（与 App.tsx 的
//   lazy() 指向同一模块，构建时会被识别为同一 chunk，不会重复打包），抢在真正点击、
//   AnimatePresence 退场动画播完之前，把网络等待时间藏起来。import() 自带 promise 缓存，
//   重复 hover 不会重复发请求，无需额外去重。
const VIEW_PREFETCH: Partial<Record<AppView, () => Promise<unknown>>> = {
  soundscape: () => import('./OasisResonance'),
  garden: () => import('./OasisGallery'),
  atelier: () => import('./OasisAtelier'),
  lights: () => import('./OasisLights'),
};

export const OasisDock: React.FC<OasisDockProps> = ({ currentView, onViewChange }) => {
  const reduceMotion = !!useReducedMotion();
  // 星图归在文章名下：亮哪一格看「所在的那一处」，点不点得动看「是不是就在这一页」
  const here: AppView = currentView === 'orchard' ? 'garden' : currentView;

  return (
    <nav aria-label="主要场所" data-oasis-avoid className="pointer-events-auto relative z-10">
      <div className="relative isolate flex items-center gap-0.5 md:gap-2.5 p-2 md:p-2.5 rounded-[24px] md:rounded-[26px] bg-white/55 dark:bg-[#0A0F1D]/70 border border-white/55 dark:border-white/10 border-t-white/80 dark:border-t-white/20 backdrop-blur-2xl shadow-[0_18px_44px_-20px_rgba(15,23,42,0.34),inset_0_1px_0_rgba(255,255,255,0.42)] dark:shadow-[0_20px_48px_-20px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors duration-700">
        {DOCK_ITEMS.map((item) => {
          const isActive = here === item.view;

          return (
            <motion.button
              key={item.view}
              onPointerEnter={() => VIEW_PREFETCH[item.view]?.()}
              onTouchStart={() => VIEW_PREFETCH[item.view]?.()}
              onClick={(event) => {
                if (currentView === item.view) return;
                const rect = event.currentTarget.getBoundingClientRect();
                onViewChange(item.view, {
                  x: rect.left + rect.width / 2,
                  y: rect.top + rect.height / 2,
                });
              }}
              className={`relative w-11 h-12 md:h-11 shrink-0 rounded-[14px] md:rounded-2xl flex flex-col md:flex-row items-center justify-center gap-0.5 cursor-pointer group outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#39C5BB] transition-colors duration-300 ${
                isActive
                  ? 'text-[#0E8C85] dark:text-[#66DED5]'
                  : 'text-slate-500/85 dark:text-slate-400/80 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
              whileHover={reduceMotion ? undefined : { y: -1 }}
              whileTap={reduceMotion ? { opacity: 0.72 } : { scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.7 }}
              aria-label={`${item.shortLabel} · ${item.label}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <motion.span
                  layoutId="dock-active-surface"
                  aria-hidden
                  className="absolute inset-0 rounded-[14px] md:rounded-2xl border border-[#39C5BB]/20 bg-[#39C5BB]/[0.11] dark:bg-[#39C5BB]/[0.13]"
                  transition={reduceMotion
                    ? { duration: 0.12 }
                    : { type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}

              <span className="relative z-10 flex items-center justify-center">
                {item.icon}
              </span>
              <span className={`relative z-10 md:hidden font-serif text-[9px] leading-none tracking-[0.08em] ${isActive ? 'font-semibold' : ''}`}>
                {item.shortLabel}
              </span>

              <div className="hidden md:block absolute bottom-full mb-3 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 translate-y-1 group-hover:translate-y-0 group-focus-visible:translate-y-0 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
                <div className="px-3 py-1.5 text-[10px] font-mono tracking-[0.16em] text-slate-600 dark:text-slate-300 bg-white/82 dark:bg-[#0E1424]/88 border border-white/60 dark:border-white/10 rounded-lg shadow-sm whitespace-nowrap backdrop-blur-md">
                  {item.shortLabel} · {item.label}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
};
