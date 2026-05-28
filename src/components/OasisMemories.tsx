// src/components/OasisMemories.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDiary } from '../hooks/useDiary';
import type { DiaryEcho } from '../types/diary';

// 兼容老版本的温度逻辑
const getFallbackColor = (temp?: number) => {
  if (temp === undefined) return '#39C5BB';
  if (temp < 50) return `color-mix(in srgb, #39C5BB ${temp * 2}%, #0EA5E9)`;
  return `color-mix(in srgb, #FFB7C5 ${(temp - 50) * 2}%, #39C5BB)`;
};

const getTimeStyle = (timestamp: number) => {
  const ageInDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  if (ageInDays < 1) return { opacity: 0.9, blur: '0px' };
  if (ageInDays < 7) return { opacity: 0.7, blur: '0px' };
  return { opacity: 0.5, blur: '1px' }; 
};

export const OasisMemories: React.FC = () => {
  const { echoes } = useDiary();
  const [activeEcho, setActiveEcho] = useState<DiaryEcho | null>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setActiveEcho(null); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 w-full h-full overflow-hidden flex flex-col pt-24 pb-32"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
    >
      <div className="absolute top-12 left-1/2 -translate-x-1/2 text-slate-400/40 font-mono text-[10px] tracking-[0.5em] uppercase z-40 pointer-events-none">
        Memory Crystals
      </div>

      <div className="w-full h-full overflow-y-auto no-scrollbar px-8 md:px-16 lg:px-32">
        <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6">
          {echoes.map((echo) => {
            // ✅ 直接使用选定的颜色，兼容老版本
            const color = echo.color || getFallbackColor(echo.temperature);
            const timeStyle = getTimeStyle(echo.timestamp);
            const isDimmed = activeEcho !== null && activeEcho.id !== echo.id;

            return (
              <motion.div
                key={echo.id}
                layoutId={`card-${echo.id}`} 
                onClick={() => setActiveEcho(echo)}
                className="break-inside-avoid relative rounded-3xl cursor-pointer overflow-hidden border border-white/20 transition-all duration-500"
                style={{ 
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  backdropFilter: `blur(12px) ${isDimmed ? 'brightness(0.8)' : ''}`, 
                  WebkitBackdropFilter: 'blur(12px)',
                  opacity: isDimmed ? 0.3 : timeStyle.opacity,
                  filter: `blur(${timeStyle.blur})`
                }}
                whileHover={{ 
                  opacity: 1, 
                  filter: 'blur(0px)',
                  scale: 1.02,
                  y: -5,
                  boxShadow: `0 20px 40px rgba(0,0,0,0.1), 0 0 20px ${color}20` 
                }}
              >
                <motion.div 
                  layoutId={`header-${echo.id}`}
                  className="h-1.5 w-full opacity-60"
                  style={{ backgroundColor: color }}
                />
                
                <div className="p-6">
                  <motion.div 
                    layoutId={`date-${echo.id}`}
                    className="font-mono text-[10px] tracking-widest text-slate-400/80 uppercase mb-4"
                  >
                    {new Date(echo.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </motion.div>
                  
                  <motion.p 
                    layoutId={`content-${echo.id}`}
                    className="font-serif text-slate-600 leading-relaxed text-sm line-clamp-6 whitespace-pre-wrap"
                  >
                    {echo.content}
                  </motion.p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {activeEcho && (
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-auto">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0 bg-black/10 backdrop-blur-[2px]"
              onClick={() => setActiveEcho(null)}
            />

            <motion.div 
              layoutId={`card-${activeEcho.id}`}
              className="relative w-[90vw] max-w-2xl max-h-[80vh] flex flex-col bg-white/70 dark:bg-slate-900/70 backdrop-blur-3xl border border-white/50 rounded-[2rem] shadow-2xl overflow-hidden z-10"
            >
              <motion.div 
                layoutId={`header-${activeEcho.id}`}
                className="h-2 w-full shrink-0"
                style={{ backgroundColor: activeEcho.color || getFallbackColor(activeEcho.temperature) }}
              />

              <div className="flex-1 overflow-y-auto no-scrollbar p-10 md:p-14">
                <motion.div 
                  layoutId={`date-${activeEcho.id}`}
                  className="font-mono text-xs tracking-[0.3em] text-slate-400 uppercase mb-10 flex items-center gap-4"
                >
                  <span>{new Date(activeEcho.timestamp).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activeEcho.color || getFallbackColor(activeEcho.temperature) }} />
                </motion.div>
                
                <motion.p 
                  layoutId={`content-${activeEcho.id}`}
                  className="font-serif text-xl md:text-2xl leading-[1.8] text-slate-700 whitespace-pre-wrap"
                >
                  {activeEcho.content}
                </motion.p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};