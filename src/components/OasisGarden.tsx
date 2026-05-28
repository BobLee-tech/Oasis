// src/components/OasisGarden.tsx
import React, { useEffect } from 'react';
import { motion } from 'framer-motion';

interface OasisGardenProps {
  visitorName: string;
  isReturningUser: boolean;
  onEnterGarden: () => void;
}

const customEase: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const OasisGarden: React.FC<OasisGardenProps> = ({ visitorName, isReturningUser, onEnterGarden }) => {
  
  // 自动转场：稍微延长至 4.5 秒，给用户充分欣赏晨雾降临的时间
  useEffect(() => {
    const timer = setTimeout(() => {
      onEnterGarden();
    }, 4500);
    return () => clearTimeout(timer);
    // ✅ 修复：移除了依赖项，防止父组件偶尔重渲染导致定时器不断重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mistTransition = { duration: 2.5, ease: customEase };

  return (
    <motion.div
      key="zen-garden"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center cursor-pointer select-none"
      onClick={onEnterGarden} 
      initial={{ opacity: 0, y: 30, filter: 'blur(20px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={mistTransition}
    >
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10, filter: 'blur(10px)', transition: { duration: 0.8, ease: "easeIn" } }}
        transition={{ duration: 1.5, delay: 0.4, ease: "easeOut" }}
        className="flex items-center text-3xl md:text-5xl font-serif text-slate-600 mb-6"
      >
        <span className="text-[#39C5BB] font-mono italic mr-4">Hello,</span>
        <span>{visitorName}</span>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -5, filter: 'blur(10px)', transition: { duration: 0.8, delay: 0.1, ease: "easeIn" } }}
        transition={{ duration: 1.5, delay: 0.8, ease: "easeOut" }}
        className="text-xs md:text-sm text-slate-400 font-light tracking-[0.5em] uppercase mb-12"
      >
        {isReturningUser ? 'Welcome back to our' : 'Welcome to our'}
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95, filter: 'blur(15px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, scale: 1.15, filter: 'blur(20px)', transition: { duration: 1.2, ease: customEase } }}
        transition={{ duration: 2, delay: 1.2, ease: customEase }}
        className="relative flex items-center justify-center"
      >
        <span className="text-[15vw] md:text-[180px] font-black tracking-[0.2em] text-slate-800 ml-[0.2em] leading-none">
          SEGA
        </span>
        
        {/* 会呼吸的光晕层 */}
        <motion.span
          className="absolute inset-0 text-[15vw] md:text-[180px] font-black tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-[#39C5BB] via-[#FFB7C5] to-[#39C5BB] ml-[0.2em] leading-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.4, 1, 0.4], textShadow: ["0px 0px 0px rgba(57,197,187,0)", "0px 0px 60px rgba(57,197,187,0.3)", "0px 0px 0px rgba(57,197,187,0)"] }}
          // ✅ 核心手术修复：强制覆盖退场的 repeat 属性，让无限死锁瞬间终结！
          exit={{ opacity: 0, transition: { duration: 0.5, repeat: 0 } }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 2.5 }}
        >
          SEGA
        </motion.span>
      </motion.div>

      {/* ✅ 视觉体验优化：将提示语升格为 text-sm，并稍微提亮至 0.6 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        exit={{ opacity: 0, transition: { duration: 0.3 } }}
        transition={{ duration: 1.5, delay: 2.5 }}
        className="absolute bottom-12 text-sm text-slate-400 font-mono tracking-widest"
      >
        [ Click anywhere to step into the oasis ]
      </motion.div>
    </motion.div>
  );
};