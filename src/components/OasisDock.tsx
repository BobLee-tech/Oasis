// src/components/OasisDock.tsx
import React from 'react';
import { motion } from 'framer-motion';
import type { AppView } from '../types/auth';

interface OasisDockProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
}

interface DockItem {
  view: Exclude<AppView, 'welcome'>;
  label: string;
  emoji: string;
  glowColor: string;
}

export const OasisDock: React.FC<OasisDockProps> = ({ currentView, onViewChange }) => {
  
  const dockItems: DockItem[] = [
  { view: 'gallery', label: 'Garden', emoji: '🌿', glowColor: 'rgba(167,243,208,0.8)' }, // 新增的 Blog 入口
  { view: 'diary', label: 'Echoes', emoji: '📝', glowColor: 'rgba(57,197,187,0.8)' },
  { view: 'soundscape', label: 'Resonance', emoji: '🎧', glowColor: 'rgba(14,165,233,0.8)' },
  { view: 'memories', label: 'Memories', emoji: '🌸', glowColor: 'rgba(255,183,197,0.9)' }
];

  return (
    <motion.div 
      className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40"
      initial={{ y: 80, opacity: 0, scale: 0.9 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 120, damping: 18, mass: 1 }}
    >
      <div className="flex items-center space-x-4 px-5 py-3 bg-white/20 border border-white/20 border-t-white/40 rounded-3xl backdrop-blur-3xl shadow-[0_20px_40px_rgba(0,0,0,0.08)]">
        {dockItems.map((item) => {
          const isActive = currentView === item.view;

          return (
            <motion.button
              key={item.view}
              onClick={() => onViewChange(item.view)}
              className="relative p-2 rounded-xl flex items-center justify-center cursor-pointer group outline-none"
              whileHover={{ scale: 1.2, y: -6 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
            >
              {/* 激活状态的底座呼吸灯 */}
              {isActive && (
                <motion.div 
                  layoutId="dock-indicator"
                  className="absolute -bottom-1 w-1 h-1 rounded-full"
                  style={{ backgroundColor: item.glowColor.replace(/,\s*[\d.]+\)$/, ', 1)'), boxShadow: `0 0 8px ${item.glowColor}` }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                />
              )}

              {/* ✅ Emoji 渲染：未激活时黑白+虚化，激活或Hover时瞬间恢复色彩与专属光晕 */}
              <span 
                className={`text-2xl transition-all duration-500 block ${
                  isActive 
                    ? 'opacity-100 grayscale-0 scale-110' 
                    : 'opacity-40 grayscale-[0.8] saturate-50 group-hover:grayscale-0 group-hover:opacity-100'
                }`}
                style={isActive ? { filter: `drop-shadow(0 0 12px ${item.glowColor})` } : {}}
              >
                {item.emoji}
              </span>

              {/* 悬浮小气泡 */}
              <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 group-focus:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
                <div className="px-3 py-1.5 text-[10px] font-mono tracking-[0.2em] uppercase text-slate-500 bg-white/80 border border-white/50 rounded-lg shadow-sm whitespace-nowrap backdrop-blur-md">
                  {item.label}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
};