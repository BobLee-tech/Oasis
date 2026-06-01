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
  useEffect(() => {
    const timer = setTimeout(() => onEnterGarden(), 4500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      key="zen-garden"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center cursor-pointer select-none"
      onClick={onEnterGarden} 
      initial={{ opacity: 0, y: 30, filter: 'blur(20px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 2.5, ease: customEase }}
    >
      <motion.div 
        initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10, filter: 'blur(10px)' }} transition={{ duration: 1.5, delay: 0.4, ease: "easeOut" }}
        className="flex items-center text-3xl md:text-5xl font-serif text-slate-600 mb-6"
      >
        <span className="text-[#39C5BB] font-mono italic mr-4">Hello,</span>
        <span>{visitorName}</span>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5, filter: 'blur(10px)' }} transition={{ duration: 1.5, delay: 0.8, ease: "easeOut" }}
        className="text-xs md:text-sm text-slate-400 font-light tracking-[0.5em] uppercase mb-12"
      >
        {isReturningUser ? 'Welcome back to our' : 'Welcome to our'}
      </motion.div>

      {/* ✨ 核心重塑：剔除灰色底色，采用纯粹的发光玻璃质感 */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, filter: 'blur(30px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
        transition={{ duration: 3, delay: 1, ease: customEase }}
        className="relative flex items-center justify-center mix-blend-screen"
      >
        <motion.span
          className="text-[15vw] md:text-[180px] font-black tracking-[0.3em] ml-[0.3em] leading-none text-transparent bg-clip-text"
          style={{ backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(57,197,187,0.6) 50%, rgba(255,183,197,0.6) 100%)' }}
          animate={{ opacity: [0.6, 1, 0.6], textShadow: ["0px 0px 20px rgba(57,197,187,0)", "0px 0px 80px rgba(255,183,197,0.4)", "0px 0px 20px rgba(57,197,187,0)"] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          SEGA
        </motion.span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} exit={{ opacity: 0, transition: { duration: 0.3 } }} transition={{ duration: 1.5, delay: 2.5 }}
        className="absolute bottom-12 text-sm text-slate-400 font-mono tracking-widest"
      >
        [ Click anywhere to step into the oasis ]
      </motion.div>
    </motion.div>
  );
};