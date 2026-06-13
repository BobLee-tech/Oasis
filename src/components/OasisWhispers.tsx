// src/components/OasisWhispers.tsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWhispers } from '../hooks/useWhispers';

const AURA_COLORS = ['#FFB7C5', '#FDBA74', '#FDE047', '#A7F3D0', '#39C5BB', '#60A5FA', '#A78BFA'];

interface OasisWhispersProps { isAdmin: boolean; }

export const OasisWhispers: React.FC<OasisWhispersProps> = ({ isAdmin }) => {
  const { whispers, isLoading, leaveWhisper, purifyWhisper } = useWhispers();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  
  const [isWriting, setIsWriting] = useState(false);
  const [author, setAuthor] = useState('');
  const [content, setContent] = useState('');
  const [color, setColor] = useState('#39C5BB');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!author.trim() || !content.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await leaveWhisper(author, content, color);
      setIsWriting(false); setAuthor(''); setContent('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div className="absolute inset-0 w-full h-full overflow-hidden flex items-center justify-center bg-[#050505]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.5 }}>
      <div className="absolute top-12 text-slate-500 font-mono text-[10px] tracking-[0.5em] uppercase z-40 pointer-events-none">
        The Whisper Wall
      </div>

      <div className="relative w-[90vw] h-[80vh] border border-white/5 rounded-3xl overflow-hidden bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.02)_0%,transparent_70%)]">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-mono text-xs tracking-widest animate-pulse">Resonating...</div>
        ) : whispers.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.5 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none px-8 text-center"
          >
            <span className="font-serif italic text-slate-400 text-lg tracking-wide">The sky is quiet tonight.</span>
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-slate-600">Be the first to light a star</span>
          </motion.div>
        ) : (
          whispers.map((whisper) => {
            const isHovered = hoveredId === whisper.id;
            return (
              <motion.div
                key={whisper.id} className="absolute z-10 flex flex-col items-center justify-center"
                style={{ top: `${whisper.y}%`, left: `${whisper.x}%` }}
                animate={{ x: [0, whisper.driftX, 0], y: [0, whisper.driftY, 0] }}
                transition={{ duration: whisper.duration, repeat: Infinity, ease: "easeInOut" }}
                onHoverStart={() => setHoveredId(whisper.id)} onHoverEnd={() => setHoveredId(null)}
              >
                {/* 🌟 极致唯美的星核与光晕 */}
                <div className="relative flex items-center justify-center">
                  <motion.div
                    className="rounded-full"
                    style={{ width: whisper.size, height: whisper.size, backgroundColor: 'white', boxShadow: `0 0 4px white, 0 0 10px ${whisper.aura_color}` }}
                    animate={{ scale: [1, 1.4, 1], opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: whisper.duration / 3, repeat: Infinity, ease: "easeInOut" }}
                  />
                  {/* 弥散的外层光晕 */}
                  <div className="absolute rounded-full opacity-40 blur-md pointer-events-none" style={{ width: whisper.size * 6, height: whisper.size * 6, backgroundColor: whisper.aura_color }} />
                  {/* 扩大鼠标悬停热区 */}
                  <div className="absolute w-12 h-12 bg-transparent rounded-full cursor-pointer" />
                </div>

                <AnimatePresence>
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.9, x: '-50%' }} 
                      animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }} 
                      exit={{ opacity: 0, y: 10, scale: 0.9, x: '-50%' }}
                      // ✅ 永远居中悬浮在星星正上方
                      className="absolute bottom-6 left-1/2 w-56 p-5 rounded-2xl bg-white/5 backdrop-blur-2xl pointer-events-auto border border-white/10"
                      style={{ boxShadow: `0 15px 40px -10px ${whisper.aura_color}60` }}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <span className="font-mono text-[10px] tracking-widest uppercase opacity-90" style={{ color: whisper.aura_color }}>{whisper.author_name}</span>
                        {isAdmin && <button onClick={() => purifyWhisper(whisper.id)} className="text-[9px] font-mono tracking-widest text-slate-400 hover:text-red-400 uppercase transition-colors">Purify</button>}
                      </div>
                      <p className="font-serif text-sm text-slate-200 leading-relaxed font-light">"{whisper.content}"</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
        )}
      </div>

      <motion.button className="absolute bottom-12 right-12 font-mono text-[10px] tracking-widest uppercase px-6 py-3 rounded-full border border-white/20 text-slate-400 hover:bg-white/10 hover:text-white transition-all backdrop-blur-md" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setIsWriting(true)}>
        [ Leave a Trace ]
      </motion.button>

      {/* ... 输入框代码保持原样 ... */}
      <AnimatePresence>
        {isWriting && (
          <div className="absolute inset-0 z-50 flex items-center justify-center">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsWriting(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-[90vw] max-w-lg bg-[#0A0A0A] border border-white/10 p-10 rounded-3xl shadow-2xl flex flex-col">
              <h3 className="font-serif text-2xl text-slate-200 mb-8 tracking-wide">Leave your whisper</h3>
              <input type="text" placeholder="Your Alias..." value={author} onChange={e => setAuthor(e.target.value)} maxLength={20} className="bg-transparent border-b border-white/10 font-mono text-sm text-slate-300 pb-2 mb-6 outline-none focus:border-[#39C5BB] transition-colors placeholder:text-slate-600" />
              <textarea placeholder="What's on your mind?" value={content} onChange={e => setContent(e.target.value)} maxLength={150} className="bg-transparent border border-white/10 rounded-xl p-4 font-serif text-slate-300 h-32 outline-none focus:border-[#39C5BB] transition-colors resize-none mb-6 placeholder:text-slate-600" />
              <div className="flex items-center justify-between">
                <div className="flex space-x-3">
                  {AURA_COLORS.map(c => (
                    <div key={c} onClick={() => setColor(c)} className={`w-4 h-4 rounded-full cursor-pointer transition-transform ${color === c ? 'scale-125' : 'opacity-40 hover:opacity-100'}`} style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px #0A0A0A, 0 0 0 4px ${c}` : 'none' }} />
                  ))}
                </div>
                <button onClick={handleSubmit} disabled={isSubmitting || !author.trim() || !content.trim()} className="font-mono text-xs tracking-widest uppercase px-6 py-2 rounded-full text-white transition-all disabled:opacity-30" style={{ backgroundColor: color, boxShadow: `0 0 20px ${color}40` }}>{isSubmitting ? 'Casting...' : 'Release'}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};