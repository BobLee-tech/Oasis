// src/components/OasisGarden.tsx
import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { currentSolarTerm, daysIntoTerm, termNoteOfDay } from '../lib/solarTerms';
import { isLateNight } from '../lib/timeContext';

interface OasisGardenProps {
  visitorName: string;
  isReturningUser: boolean;
  onEnterGarden: () => void;
  /** 📜 园图的一扇门：第一次来的人可以先看一眼整座园子 */
  onOpenScroll?: () => void;
}

const customEase: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const OasisGarden: React.FC<OasisGardenProps> = ({ visitorName, isReturningUser, onEnterGarden, onOpenScroll }) => {
  const term = currentSolarTerm();
  // 🌙 深夜到访：问候换成夜间版；平日则随节气内的日子在几句语录间轮换
  const termDay = daysIntoTerm();
  const lateNight = isLateNight();
  const note = lateNight ? '已经很晚喽～ 夜里的绿洲也很美，但别忘了休息。' : termNoteOfDay();
  useEffect(() => {
    // 首次到访留足读完节气问候的时间；同一会话内重复回到欢迎页（如登出）则不必再等那么久
    const revisit = sessionStorage.getItem('oasis_welcomed');
    sessionStorage.setItem('oasis_welcomed', '1');
    const timer = setTimeout(() => onEnterGarden(), revisit ? 3000 : 8000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEnterGarden(); }
  };

return (
    <motion.div
      key="zen-garden"
      role="button"
      tabIndex={0}
      aria-label="进入绿洲"
      onKeyDown={handleKeyDown}
      className="absolute inset-0 z-10 flex flex-col items-center justify-center cursor-pointer select-none outline-none"
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
        {/* 呼吸的光晕：预先用 blur 栅格化好的发光副本，循环里只动 opacity（合成器友好），
            不再逐帧对 text-shadow 重新走 paint 管线 —— 首屏动画对移动端 GPU 更友好。 */}
        <span className="relative inline-block">
          <span
            className="text-[15vw] md:text-[180px] font-black tracking-[0.3em] ml-[0.3em] leading-none text-transparent bg-clip-text"
            style={{ backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(57,197,187,0.6) 50%, rgba(255,183,197,0.6) 100%)' }}
          >
            OASIS
          </span>
          <motion.span
            aria-hidden
            className="absolute inset-0 text-[15vw] md:text-[180px] font-black tracking-[0.3em] ml-[0.3em] leading-none text-transparent bg-clip-text blur-[18px]"
            style={{ backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(57,197,187,0.9) 50%, rgba(255,183,197,0.9) 100%)' }}
            animate={{ opacity: [0.25, 0.75, 0.25] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          >
            OASIS
          </motion.span>
        </span>
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

      {/* 📜 另一扇门：整页是「点哪都进园」，这里要拦住点击与回车，别让它冒泡成进园 */}
      {onOpenScroll && (
        <motion.button
          type="button"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          transition={{ duration: 1.5, delay: 1.6 }}   // 熟客的入口页 3 秒就进园，门要早一点露出来
          onClick={(e) => { e.stopPropagation(); onOpenScroll(); }}
          onKeyDown={(e) => e.stopPropagation()}
          className="absolute bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] inline-flex items-center gap-2 px-2 py-1.5 font-serif text-sm tracking-[0.24em] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 border-b border-transparent hover:border-slate-300/60 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#39C5BB] rounded-sm"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
            <rect x="3" y="5" width="3" height="14" rx="1.5" /><rect x="18" y="5" width="3" height="14" rx="1.5" /><path d="M6 7h12M6 17h12" /><path d="M8.5 12c1.6-1.4 3.2-1.4 4.8 0s3.2 1.4 4.7 0" opacity=".6" />
          </svg>
          或者，展卷看园
        </motion.button>
      )}
    </motion.div>
  );
};