// src/components/OasisDock.tsx
// 🧭 底部坞：四个场所的入口。图标统一为 1.5px 线性 SVG（替代 emoji），
//    与站内其余手绘图标同一套语言；辉光克制，激活时才轻轻点亮。
import React from 'react';
import { motion } from 'framer-motion';
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
  glowColor: string;
}

const ico = 'w-6 h-6';
const svgProps = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  className: ico,
};

// 🎧 共鸣：耳机  🌿 花园：新芽  ✦ 星座：连星  🏮 灯火：灯笼
const ResonanceIcon = () => (<svg {...svgProps}><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.5" y="13.5" width="4" height="6.5" rx="1.8"/><rect x="17.5" y="13.5" width="4" height="6.5" rx="1.8"/></svg>);
const GardenIcon = () => (<svg {...svgProps}><path d="M12 21V9"/><path d="M12 9C12 6 9.2 4 5.5 4c0 3.6 2.8 5.6 6.5 5z"/><path d="M12 12.5c0-2.6 2.4-4.6 6-4.6C18 11.4 15.6 12.5 12 12.5z"/></svg>);
const ConstellationIcon = () => (<svg {...svgProps}><path d="M5 6l6.5 10.5L18 8.5"/><circle cx="5" cy="6" r="1.3"/><circle cx="18" cy="8.5" r="1.3"/><circle cx="11.5" cy="16.5" r="1.3"/><path d="M15.5 4.2l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z"/></svg>);
const LanternIcon = () => (<svg {...svgProps}><path d="M12 2.5v2.2"/><path d="M8.8 4.7h6.4"/><rect x="6.5" y="6.5" width="11" height="11" rx="4.5"/><path d="M12 6.7v10.6"/><path d="M12 17.5v2.2"/><path d="M10.4 20.4h3.2"/></svg>);

export const OasisDock: React.FC<OasisDockProps> = ({ currentView, onViewChange }) => {
  const dockItems: DockItem[] = [
    { view: 'soundscape', label: 'Resonance', icon: <ResonanceIcon />, glowColor: 'rgba(57,197,187,0.8)' },
    { view: 'garden', label: 'Garden', icon: <GardenIcon />, glowColor: 'rgba(110,231,183,0.8)' },
    { view: 'orchard', label: 'Constellation', icon: <ConstellationIcon />, glowColor: 'rgba(167,139,250,0.8)' },
    { view: 'lights', label: 'Lanterns', icon: <LanternIcon />, glowColor: 'rgba(253,186,116,0.8)' }
  ];

  return (
    <motion.div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] md:bottom-8 left-1/2 -translate-x-1/2 z-40" initial={{ y: 80, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 120, damping: 18, mass: 1 }}>
      {/* ✨ 注入了暗色模式样式与平滑色彩过渡 */}
      <div className="flex items-center space-x-2.5 md:space-x-4 px-4 md:px-5 py-3 bg-white/20 dark:bg-white/5 border border-white/20 dark:border-white/10 border-t-white/40 dark:border-t-white/20 rounded-3xl backdrop-blur-3xl shadow-[0_20px_40px_rgba(0,0,0,0.08)] transition-colors duration-700">
        {dockItems.map((item) => {
          const isActive = currentView === item.view;
          const activeColor = item.glowColor.replace(/,\s*[\d.]+\)$/, ', 1)');
          return (
            <motion.button
              key={item.view}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                onViewChange(item.view, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
              }}
              className="relative p-2.5 md:p-2 rounded-xl flex items-center justify-center cursor-pointer group outline-none"
              whileHover={{ scale: 1.2, y: -6 }} whileTap={{ scale: 0.9 }} transition={{ type: "spring", stiffness: 400, damping: 15 }}
              aria-label={item.label}
            >
              {isActive && <motion.div layoutId="dock-indicator" className="absolute -bottom-1 w-1 h-1 rounded-full" style={{ backgroundColor: activeColor, boxShadow: `0 0 8px ${item.glowColor}` }} transition={{ type: "spring", stiffness: 300, damping: 20 }} />}
              <span
                className={`block transition-all duration-500 ${isActive ? 'opacity-100 scale-105' : 'opacity-40 group-hover:opacity-90'}`}
                style={isActive ? { color: activeColor, filter: `drop-shadow(0 0 6px ${item.glowColor})` } : { color: 'rgb(100 116 139)' }}
              >
                {item.icon}
              </span>
              <div className="hidden md:block absolute bottom-full mb-4 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 group-focus:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
                <div className="px-3 py-1.5 text-[10px] font-mono tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-[#111]/80 border border-white/50 dark:border-white/10 rounded-lg shadow-sm whitespace-nowrap backdrop-blur-md transition-colors duration-700">{item.label}</div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
};
