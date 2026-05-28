// src/components/OasisResonance.tsx
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSoundscape } from '../hooks/useSoundscape';
import type { MusicCategory } from '../types/music';

const Icons = {
  sequence: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
  ),
  loop: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /></svg>
  ),
  shuffle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>
  )
};

const CATEGORIES: { id: MusicCategory; label: string; icon: string }[] = [
  { id: 'All Tracks', label: 'ALL TRACKS', icon: '💿' },
  { id: 'Yorushika', label: 'YORUSHIKA', icon: '🎸' },
  { id: 'Atarayo', label: 'ATARAYO', icon: '🌃' },
  { id: 'Miku', label: 'MIKU', icon: '🌸' }
];

export const OasisResonance: React.FC = () => {
  const { currentTrack, isPlaying, playMode, togglePlay, switchTrack, togglePlayMode, playlist } = useSoundscape();
  const [activeCategory, setActiveCategory] = useState<MusicCategory>('All Tracks');

  const modeDisplay = useMemo(() => {
    if (playMode === 'loop') return { icon: Icons.loop, text: 'LOOP' };
    if (playMode === 'sequence') return { icon: Icons.sequence, text: 'SEQ' };
    return { icon: Icons.shuffle, text: 'RND' };
  }, [playMode]);

  const filteredPlaylist = useMemo(() => {
    if (activeCategory === 'All Tracks') return playlist;
    return playlist.filter(track => track.category === activeCategory);
  }, [activeCategory, playlist]);

  return (
    <motion.div 
      className="relative w-full max-w-5xl mx-auto min-h-[70vh] flex flex-col items-center justify-between z-10 py-12"
      initial={{ opacity: 0, scale: 0.95, filter: 'blur(15px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 1.05, filter: 'blur(15px)' }}
      transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 text-slate-400/40 font-mono text-[10px] tracking-[0.5em] uppercase whitespace-nowrap">
        Resonance Chamber
      </div>

      <div className="flex-1 flex flex-col items-center justify-center w-full relative mt-8">
        {/* 🌌 物理级平滑情绪光晕 */}
        <motion.div
          className="absolute rounded-full blur-[100px]"
          style={{ width: '400px', height: '400px' }}
          animate={{ 
            backgroundColor: currentTrack.color, 
            scale: isPlaying ? [1, 1.15, 1] : 1, 
            opacity: isPlaying ? [0.15, 0.25, 0.15] : 0.08 
          }}
          transition={{ 
            backgroundColor: { duration: 1.5, ease: "easeInOut" },
            scale: { duration: 6, repeat: Infinity, ease: "easeInOut" },
            opacity: { duration: 6, repeat: Infinity, ease: "easeInOut" }
          }}
        />

        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTrack.id}
              initial={{ opacity: 0, y: 10, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -10, filter: 'blur(10px)' }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="flex flex-col items-center cursor-pointer"
              onClick={togglePlay}
            >
              <h2 className="text-3xl md:text-5xl lg:text-6xl font-serif text-slate-700 tracking-wider mb-0 pb-2 px-4 truncate leading-tight">
                {currentTrack.title}
              </h2>
              <p className="font-mono text-xs md:text-sm tracking-[0.3em] uppercase text-slate-400">
                {currentTrack.artist}
              </p>
              
              {/* ✨ 会呼吸的绝美歌词 */}
              {currentTrack.lyric && (
                <motion.div 
                  className="mt-8 h-8"
                  animate={{ opacity: isPlaying ? 1 : 0.4, y: isPlaying ? 0 : 5 }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                >
                  <p className="font-serif italic text-slate-500/80 tracking-widest text-sm drop-shadow-sm">
                    "{currentTrack.lyric}"
                  </p>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* 播控台 */}
          <div className="flex items-center space-x-8 mt-6">
            <button 
              onClick={togglePlayMode}
              className="flex flex-col items-center justify-center w-12 text-slate-400 hover:text-slate-600 transition-colors outline-none group"
            >
              <div className="mb-1.5 transition-transform duration-300 group-hover:scale-110">
                {modeDisplay.icon}
              </div>
              <span className="font-mono text-[8px] tracking-[0.2em] uppercase opacity-60 group-hover:opacity-100 transition-opacity">
                {modeDisplay.text}
              </span>
            </button>

            <div 
              onClick={togglePlay}
              className="w-14 h-14 rounded-full border border-slate-300/40 shadow-sm flex items-center justify-center cursor-pointer hover:bg-white/40 hover:shadow-md transition-all backdrop-blur-md group"
            >
              {isPlaying ? (
                <span className="font-mono text-xs text-slate-500 group-hover:text-slate-700 transition-colors tracking-tighter">||</span>
              ) : (
                <span className="font-mono text-xs ml-1 text-slate-500 group-hover:text-slate-700 transition-colors">▶</span>
              )}
            </div>
            
            <div className="w-12 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ========================================= */}
      {/* 📚 底部：磁吸式流体黑胶唱片列表 (Snap Scroll) */}
      {/* ========================================= */}
      <div className="w-full mt-12 flex flex-col items-center pb-4 z-20">
        <div className="flex space-x-2 md:space-x-4 mb-6">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-full border transition-all duration-300 outline-none ${
                activeCategory === cat.id 
                  ? 'bg-slate-700 text-white border-slate-700 shadow-md scale-105' 
                  : 'bg-white/10 text-slate-500 border-white/20 hover:bg-white/30 backdrop-blur-md'
              }`}
            >
              <span className={activeCategory === cat.id ? 'opacity-100' : 'opacity-60 grayscale'}>{cat.icon}</span>
              <span className="font-mono text-[9px] tracking-widest uppercase">{cat.label}</span>
            </button>
          ))}
        </div>

        {/* 🌟 核心优化：加入 snap-x snap-mandatory 实现解压吸附 */}
        <div className="w-full px-8 overflow-x-auto no-scrollbar snap-x snap-mandatory">
          <motion.div layout className="flex items-center gap-6 min-w-max mx-auto px-[40vw] py-4">
            <AnimatePresence mode="popLayout">
              {filteredPlaylist.map((track) => {
                const isActive = currentTrack.id === track.id;
                return (
                  <motion.button
                    layout
                    initial={{ opacity: 0, scale: 0.8, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, scale: 0.8, filter: 'blur(10px)', transition: { duration: 0.2 } }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    key={track.id}
                    onClick={() => switchTrack(track)}
                    // 🌟 卡片元素加入 snap-center，滑动时自动吸附对齐居中
                    className={`relative px-6 py-4 rounded-2xl border transition-all duration-500 outline-none backdrop-blur-md flex flex-col items-start w-[240px] text-left group shrink-0 snap-center ${
                      isActive 
                        ? 'bg-white/40 border-white/60 shadow-[0_10px_30px_rgba(0,0,0,0.05)]' 
                        : 'bg-white/10 border-white/20 hover:bg-white/20 hover:border-white/30'
                    }`}
                    whileHover={{ y: -4 }}
                    whileTap={{ scale: 0.96 }}
                  >
                    <div 
                      className="absolute top-0 left-4 right-4 h-[2px] rounded-b-full transition-opacity duration-500"
                      style={{ backgroundColor: track.color, opacity: isActive ? 1 : 0, boxShadow: `0 0 10px ${track.color}` }}
                    />
                    <span className={`font-serif text-lg tracking-wide transition-colors ${isActive ? 'text-slate-700' : 'text-slate-500 group-hover:text-slate-600'} truncate w-full`}>
                      {track.title}
                    </span>
                    <span className={`font-mono text-[10px] tracking-[0.2em] uppercase mt-1 transition-colors ${isActive ? 'text-slate-500' : 'text-slate-400/50'} truncate w-full`}>
                      {track.artist}
                    </span>

                    {isActive && isPlaying && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-end space-x-1 h-3">
                        <motion.div className="w-0.5 bg-slate-400" animate={{ height: ['40%', '100%', '40%'] }} transition={{ duration: 0.8, repeat: Infinity }} />
                        <motion.div className="w-0.5 bg-slate-400" animate={{ height: ['80%', '30%', '80%'] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }} />
                        <motion.div className="w-0.5 bg-slate-400" animate={{ height: ['50%', '90%', '50%'] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.4 }} />
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};