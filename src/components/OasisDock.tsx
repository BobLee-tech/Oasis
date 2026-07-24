// src/components/OasisDock.tsx
// 🧭 底部坞：四个场所的入口。图标统一为 1.5px 线性 SVG（替代 emoji），
//    与站内其余手绘图标同一套语言；辉光克制，激活时才轻轻点亮。
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { AppView } from '../types/auth';

interface OasisDockProps {
  currentView: AppView;
  // 第二参数回传被点击图标的中心坐标，作为涟漪转场的荡开落点。
  onViewChange: (view: AppView, origin?: { x: number; y: number }) => void;
  isAdmin: boolean;
}

interface DockItem {
  view: Exclude<AppView, 'welcome'>;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const ico = 'w-6 h-6';
const svgProps = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  className: ico,
};

// 🎧 共鸣：耳机  🌿 花园：新芽  ✦ 星座：连星  🏮 灯火：灯笼  🖼️ 绘阁：画框
const ResonanceIcon = () => (<svg {...svgProps}><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.5" y="13.5" width="4" height="6.5" rx="1.8"/><rect x="17.5" y="13.5" width="4" height="6.5" rx="1.8"/></svg>);
const GardenIcon = () => (<svg {...svgProps}><path d="M12 21V9"/><path d="M12 9C12 6 9.2 4 5.5 4c0 3.6 2.8 5.6 6.5 5z"/><path d="M12 12.5c0-2.6 2.4-4.6 6-4.6C18 11.4 15.6 12.5 12 12.5z"/></svg>);
const ConstellationIcon = () => (<svg {...svgProps}><path d="M5 6l6.5 10.5L18 8.5"/><circle cx="5" cy="6" r="1.3"/><circle cx="18" cy="8.5" r="1.3"/><circle cx="11.5" cy="16.5" r="1.3"/><path d="M15.5 4.2l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z"/></svg>);
const LanternIcon = () => (<svg {...svgProps}><path d="M12 2.5v2.2"/><path d="M8.8 4.7h6.4"/><rect x="6.5" y="6.5" width="11" height="11" rx="4.5"/><path d="M12 6.7v10.6"/><path d="M12 17.5v2.2"/><path d="M10.4 20.4h3.2"/></svg>);
const AtelierIcon = () => (<svg {...svgProps}><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M4.5 16.8l4.3-4.8 3.4 3.8 2.4-2.8 4.9 5.3"/></svg>);

export const OasisDock: React.FC<OasisDockProps> = ({ currentView, onViewChange }) => {
  const reduceMotion = !!useReducedMotion();
  // 排序以 Garden（主博客）为视觉中心，两侧对称：星图/绘阁是作品的另一种呈现，紧邻 Garden；
  // 共鸣与灯火是纯氛围场所，居两端。
  const dockItems: DockItem[] = [
    { view: 'soundscape', label: 'Resonance', icon: <ResonanceIcon />, color: '#39C5BB' },
    { view: 'orchard', label: 'Constellation', icon: <ConstellationIcon />, color: '#A78BFA' },
    { view: 'garden', label: 'Garden', icon: <GardenIcon />, color: '#6EE7B7' },
    { view: 'atelier', label: 'Atelier', icon: <AtelierIcon />, color: '#FFB7C5' },
    { view: 'lights', label: 'Lanterns', icon: <LanternIcon />, color: '#FDBA74' }
  ];

  return (
    <motion.nav
      aria-label="主要场所"
      className="absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] md:bottom-8 left-1/2 -translate-x-1/2 z-40"
      initial={reduceMotion ? { opacity: 0 } : { y: 80, opacity: 0, scale: 0.9 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={reduceMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 120, damping: 18, mass: 1 }}
    >
      {/* 月白玻璃托盘：上缘受光、下缘落影，轻而不飘。 */}
      <div className="relative isolate flex items-center gap-2 md:gap-3 px-3.5 md:px-4 py-2.5 bg-white/30 dark:bg-[#0A0F1D]/45 border border-white/35 dark:border-white/10 border-t-white/65 dark:border-t-white/20 rounded-[1.75rem] backdrop-blur-3xl shadow-[0_18px_45px_-18px_rgba(15,23,42,0.28),inset_0_1px_0_rgba(255,255,255,0.34)] dark:shadow-[0_20px_55px_-20px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors duration-700">
        {dockItems.map((item) => {
          const isActive = currentView === item.view;
          return (
            <motion.button
              key={item.view}
              data-no-global-ripple
              onClick={(e) => {
                if (isActive) return;
                const r = e.currentTarget.getBoundingClientRect();
                onViewChange(item.view, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
              }}
              className="relative w-11 h-11 shrink-0 rounded-[0.9rem] flex items-center justify-center cursor-pointer group outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#39C5BB]"
              whileHover={reduceMotion ? undefined : { scale: 1.09, y: -3 }}
              whileTap={reduceMotion ? { opacity: 0.72 } : { scale: 0.94, y: 1, backgroundColor: `${item.color}1f` }}
              transition={{ type: 'spring', stiffness: 430, damping: 24, mass: 0.7 }}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <motion.span
                  layoutId="dock-active-surface"
                  aria-hidden
                  className="absolute inset-0 rounded-[0.9rem] border"
                  style={{
                    background: `linear-gradient(145deg, ${item.color}24, ${item.color}0d)`,
                    borderColor: `${item.color}45`,
                    boxShadow: `0 7px 18px -10px ${item.color}, inset 0 1px 0 rgba(255,255,255,0.48)`,
                  }}
                  transition={reduceMotion ? { duration: 0.12 } : { type: 'spring', stiffness: 360, damping: 28 }}
                />
              )}
              <span
                className={`relative z-10 block transition-all duration-300 ${isActive ? 'opacity-100 scale-105' : 'opacity-55 group-hover:opacity-90'}`}
                style={isActive ? { color: item.color, filter: `drop-shadow(0 0 5px ${item.color}80)` } : { color: 'rgb(100 116 139)' }}
              >
                {item.icon}
              </span>
              {isActive && (
                <motion.span
                  layoutId="dock-active-dot"
                  aria-hidden
                  className="absolute -bottom-0.5 z-10 w-1 h-1 rounded-full"
                  style={{ backgroundColor: item.color, boxShadow: `0 0 7px ${item.color}` }}
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
