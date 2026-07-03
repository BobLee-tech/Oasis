// src/components/OasisGarden.tsx
import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { currentSolarTerm, daysIntoTerm, termNoteOfDay } from '../lib/solarTerms';
import { isLateNight } from '../lib/timeContext';

interface OasisGardenProps {
  visitorName: string;
  isReturningUser: boolean;
  onEnterGarden: () => void;
}

const customEase: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const OasisGarden: React.FC<OasisGardenProps> = ({ visitorName, isReturningUser, onEnterGarden }) => {
  const term = currentSolarTerm();
  // 🌙 深夜到访：问候换成夜间版；平日则随节气内的日子在几句语录间轮换
  const termDay = daysIntoTerm();
  const lateNight = isLateNight();
  const note = lateNight ? '已经很晚喽～ 夜里的绿洲也很美，但别忘了休息。' : termNoteOfDay();
  useEffect(() => {
    // 留足读完节气问候的时间；想快进的人点击任意处即可跳过
    const timer = setTimeout(() => onEnterGarden(), 8000);
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
      exit={{ opacity: 0, transition: { duration: 0.6 } }} // ✨ 修复：极速退场，解除等待阻塞
      transition={{ duration: 2.5, ease: customEase }}
    >
      <motion.div 
        initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} 
        exit={{ opacity: 0, y: -10, filter: 'blur(10px)', transition: { duration: 0.5 } }} // ✨ 隔离退场动画
        transition={{ duration: 1.5, delay: 0.4, ease: "easeOut" }}
        className="flex items-center text-3xl md:text-5xl font-serif text-slate-600 mb-6"
      >
        <span className="text-[#39C5BB] font-mono italic mr-4">Hello,</span>
        <span>{visitorName}</span>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} 
        exit={{ opacity: 0, y: -5, filter: 'blur(10px)', transition: { duration: 0.5 } }} // ✨ 隔离退场动画
        transition={{ duration: 1.5, delay: 0.8, ease: "easeOut" }}
        className="text-xs md:text-sm text-slate-400 font-light tracking-[0.5em] uppercase mb-12"
      >
        {isReturningUser ? 'Welcome back to our' : 'Welcome to our'}
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.9, filter: 'blur(30px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', transition: { duration: 3, delay: 1, ease: customEase } }} // ✨ 将原本的长入场动画移入 animate 对象内部
        exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)', transition: { duration: 0.6 } }} // ✨ 修复：退场只需 0.6s
        className="relative flex items-center justify-center mix-blend-screen"
      >
        <motion.span
          className="text-[15vw] md:text-[180px] font-black tracking-[0.3em] ml-[0.3em] leading-none text-transparent bg-clip-text"
          style={{ backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(57,197,187,0.6) 50%, rgba(255,183,197,0.6) 100%)' }}
          animate={{ opacity: [0.6, 1, 0.6], textShadow: ["0px 0px 20px rgba(57,197,187,0)", "0px 0px 80px rgba(255,183,197,0.4)", "0px 0px 20px rgba(57,197,187,0)"] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          OASIS
        </motion.span>
      </motion.div>

      {/* 🌾 今日节气：让每一次到访都被温柔地记得是什么日子 */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.3 } }}
        transition={{ duration: 1.6, delay: 1.2 }}
        className="absolute bottom-24 flex flex-col items-center gap-2 px-6 text-center"
      >
        <span className="font-serif text-base text-slate-500/90">
          {termDay === 0
            ? <>今日交<span className="text-[#39C5BB] mx-1">{term.name}</span></>
            : <><span className="text-[#39C5BB] mx-1">{term.name}</span>第{'一二三四五六七八九十'[termDay] ?? termDay + 1}日</>}
        </span>
        <span className="font-serif italic text-xs text-slate-400/80 max-w-xs leading-relaxed">{note}</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 0.6 }}
        exit={{ opacity: 0, transition: { duration: 0.3 } }}
        transition={{ duration: 1.5, delay: 2.5 }}
        className="absolute bottom-12 text-sm text-slate-400 font-mono tracking-widest"
      >
        [ Click anywhere to step into the oasis ]
      </motion.div>
    </motion.div>
  );
};