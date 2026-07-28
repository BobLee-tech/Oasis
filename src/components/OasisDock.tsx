// src/components/OasisDock.tsx
// 🧭 底部坞：四个场所的入口。图标统一为 1.5px 线性 SVG（替代 emoji），
//    与站内其余手绘图标同一套语言；辉光克制，激活时才轻轻点亮。
//
// 图标网格约定：24 网格 / 20×20 live area / 光学中心恒为 (12,12)，形态按外框上限取值
// （横矩形 20×16、竖矩形 16×20、正方 18×18）。五枚图标的视觉体量因此收在同一量级里，
// 不再有的窄得像根线、有的胖得占满格。
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { AppView } from '../types/auth';

interface OasisDockProps {
  currentView: AppView;
  // 第二参数回传被点击图标的中心坐标，作为涟漪转场的荡开落点。
  onViewChange: (view: AppView, origin?: { x: number; y: number }) => void;
  isAdmin: boolean;
  isDark: boolean;
}

interface DockItem {
  view: Exclude<AppView, 'welcome'>;
  label: string;
  icon: React.ReactNode;
  // tint：暗色模式 / 辉光用的原色。ink：亮色模式下用于图标本身——
  // 原色直接当文字色在米白玻璃托盘上普遍不到 2:1 对比度，读不清；
  // ink 是同色相压深后的版本，两套配色各司其职，不是重复。
  tint: string;
  ink: string;
}

const ico = 'w-6 h-6';
const svgProps = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  className: ico,
};

// 🎧 共鸣：耳机  🌿 花园：新芽  ✦ 星座：连星  🏮 灯火：灯笼  🖼️ 绘阁：画框
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
    <path d="M12 11.5C12 7.3 8.9 3.7 3.9 3.7c0 5 3.4 7.8 8.1 7.8z" />
    <path d="M12 15.3c0-3.6 3-6.2 8.1-6.2 0 4.2-3.4 6.2-8.1 6.2z" />
  </svg>
);
const ConstellationIcon = () => (
  <svg {...svgProps}>
    <path d="M5.4 8.8L11.2 5.3L13.4 14.5L19 18.5" opacity=".6" />
    <circle cx="5.4" cy="8.8" r="2" fill="currentColor" stroke="none" />
    <circle cx="11.2" cy="5.3" r="1.35" fill="currentColor" stroke="none" />
    <circle cx="13.4" cy="14.5" r="1.35" fill="currentColor" stroke="none" />
    <circle cx="19" cy="18.5" r="1.6" fill="currentColor" stroke="none" />
  </svg>
);
const LanternIcon = () => (
  <svg {...svgProps}>
    <path d="M12 3v2.3" />
    <path d="M7.2 5.6h9.6" />
    <path d="M15.3 5.6c2.9 1.3 4.5 3.6 4.5 6.2s-1.6 4.9-4.5 6.2h-6.6C5.8 16.7 4.2 14.4 4.2 11.8s1.6-4.9 4.5-6.2z" />
    <path d="M7.2 18h9.6" />
    <path d="M12 18v3" />
  </svg>
);
const AtelierIcon = () => (
  <svg {...svgProps}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <circle cx="8.6" cy="9.6" r="1.5" fill="currentColor" stroke="none" />
    <path d="M4.6 16.9l4.4-4.9 4 4.5 2.6-3 3.9 4.2" />
  </svg>
);

export const OasisDock: React.FC<OasisDockProps> = ({ currentView, onViewChange, isDark }) => {
  const reduceMotion = !!useReducedMotion();
  // 排序以 Garden（主博客）为视觉中心，两侧对称：星图/绘阁是作品的另一种呈现，紧邻 Garden；
  // 共鸣与灯火是纯氛围场所，居两端。
  const dockItems: DockItem[] = [
    { view: 'soundscape', label: 'Resonance', icon: <ResonanceIcon />, tint: '#39C5BB', ink: '#0E8C85' },
    { view: 'orchard', label: 'Constellation', icon: <ConstellationIcon />, tint: '#A78BFA', ink: '#7C5CFF' },
    { view: 'garden', label: 'Garden', icon: <GardenIcon />, tint: '#6EE7B7', ink: '#12946B' },
    { view: 'atelier', label: 'Atelier', icon: <AtelierIcon />, tint: '#FFB7C5', ink: '#D95C7A' },
    { view: 'lights', label: 'Lanterns', icon: <LanternIcon />, tint: '#FDBA74', ink: '#C4741C' }
  ];

  return (
    <motion.nav
      aria-label="主要场所"
      className="absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] md:bottom-8 left-1/2 -translate-x-1/2 z-40"
      initial={reduceMotion ? { opacity: 0 } : { y: 80, opacity: 0, scale: 0.9 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={reduceMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 120, damping: 18, mass: 1 }}
    >
      {/* 月白玻璃托盘：上缘受光、下缘落影，轻而不飘。padding 四边等距 10px + 按钮圆角 16px
          → 托盘圆角严格等于两者之和（26px），四角与内部按钮同心，不再是两套互不相关的曲率。 */}
      <div className="relative isolate flex items-center gap-2 md:gap-2.5 p-2.5 bg-white/30 dark:bg-[#0A0F1D]/45 border border-white/35 dark:border-white/10 border-t-white/65 dark:border-t-white/20 rounded-[26px] backdrop-blur-3xl shadow-[0_18px_45px_-18px_rgba(15,23,42,0.28),inset_0_1px_0_rgba(255,255,255,0.34)] dark:shadow-[0_20px_55px_-20px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors duration-700">
        {dockItems.map((item) => {
          const isActive = currentView === item.view;
          // ink 只在亮色模式启用（暗背景上 tint 原色已经够亮），二者都不直接作用在
          // <svg> 描边的 scale/filter 上——保持全排图标同一根线宽，不因「当前所在」而变粗变糊。
          const activeColor = isDark ? item.tint : item.ink;
          return (
            <motion.button
              key={item.view}
              data-no-global-ripple
              onClick={(e) => {
                if (isActive) return;
                const r = e.currentTarget.getBoundingClientRect();
                onViewChange(item.view, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
              }}
              className="relative w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center cursor-pointer group outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#39C5BB]"
              whileHover={reduceMotion ? undefined : { scale: 1.09, y: -3 }}
              whileTap={reduceMotion ? { opacity: 0.72 } : { scale: 0.94, y: 1, backgroundColor: `${item.tint}1f` }}
              transition={{ type: 'spring', stiffness: 430, damping: 24, mass: 0.7 }}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <motion.span
                  layoutId="dock-active-surface"
                  aria-hidden
                  className="absolute inset-0 rounded-2xl border"
                  style={{
                    background: `linear-gradient(145deg, ${item.tint}24, ${item.tint}0d)`,
                    borderColor: `${item.tint}45`,
                    boxShadow: `0 7px 18px -10px ${item.tint}, inset 0 1px 0 rgba(255,255,255,0.48)`,
                  }}
                  transition={reduceMotion ? { duration: 0.12 } : { type: 'spring', stiffness: 360, damping: 28 }}
                />
              )}
              <span
                className={`relative z-10 block text-slate-600 dark:text-slate-300 transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'}`}
                style={{ color: isActive ? activeColor : undefined }}
              >
                {item.icon}
              </span>
              {isActive && (
                <motion.span
                  layoutId="dock-active-dot"
                  aria-hidden
                  className="absolute -bottom-0.5 z-10 w-1 h-1 rounded-full"
                  style={{ backgroundColor: item.tint, boxShadow: `0 0 7px ${item.tint}` }}
                  transition={reduceMotion ? { duration: 0.12 } : { type: 'spring', stiffness: 360, damping: 26 }}
                />
              )}
              <div className="hidden md:block absolute bottom-full mb-3 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 translate-y-1.5 group-hover:translate-y-0 group-focus-visible:translate-y-0 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
                <div className="px-3 py-1.5 text-[10px] font-mono tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-[#111]/80 border border-white/50 dark:border-white/10 rounded-lg shadow-sm whitespace-nowrap backdrop-blur-md transition-colors duration-700">{item.label}</div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.nav>
  );
};
