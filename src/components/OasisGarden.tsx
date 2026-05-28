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
  
  // ✅ 延长停留时间至 6 秒，给情绪渐变留出充分的绽放时间
  useEffect(() => {
    const timer = setTimeout(() => {
      onEnterGarden();
    }, 4500);
    return () => clearTimeout(timer);
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
        
        <motion.span
          className="absolute inset-0 text-[15vw] md:text-[180px] font-black tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-[#39C5BB] via-[#FFB7C5] to-[#39C5BB] ml-[0.2em] leading-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.4, 1, 0.4], textShadow: ["0px 0px 0px rgba(57,197,187,0)", "0px 0px 60px rgba(57,197,187,0.3)", "0px 0px 0px rgba(57,197,187,0)"] }}
          exit={{ opacity: 0, transition: { duration: 0.5, repeat: 0 } }}
          // ✅ 提前渐变浮现时间至 1.8 秒
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1.8 }}
        >
          SEGA
        </motion.span>
      </motion.div>

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