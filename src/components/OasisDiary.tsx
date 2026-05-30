// src/components/OasisDiary.tsx
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDiary } from '../hooks/useDiary';

// 🌈 提取出来的 7 种顶级治愈情绪色
const AURA_COLORS = [
  '#FFB7C5', // Sakura Pink 樱粉
  '#FDBA74', // Amber 琥珀
  '#FDE047', // Morning Yellow 晨黄
  '#A7F3D0', // Mint Green 薄荷
  '#39C5BB', // Miku Green 初音绿
  '#60A5FA', // Sky Blue 澄空
  '#A78BFA'  // Lavender 薰衣草
];

export const OasisDiary: React.FC = () => {
  const { releaseEcho, draftContent, draftColor, setDraft } = useDiary();
  
  // 初始化时读取草稿
  const [content, setContent] = useState(draftContent);
  const [selectedColor, setSelectedColor] = useState(draftColor);
  const [isReleasing, setIsReleasing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 每当输入或改色时，同步到全局草稿
  useEffect(() => {
    setDraft(content, selectedColor);
  }, [content, selectedColor, setDraft]);

  // ✅ 自动调节高度，但限制最大高度，防止把下面的按钮挤出去
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      // 限制最大高度为视口高度的 35%
      textareaRef.current.style.height = `${Math.min(scrollHeight, window.innerHeight * 0.35)}px`;
    }
  }, [content]);

  const handleRelease = () => {
    if (!content.trim()) return;
    setIsReleasing(true);
    releaseEcho(content, selectedColor || '#39C5BB');
    setTimeout(() => {
      setContent('');
      setIsReleasing(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }, 1500);
  };

  return (
    <motion.div 
      className="relative w-full max-w-4xl mx-auto min-h-[60vh] flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0, scale: 0.95, filter: 'blur(15px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        className="absolute inset-0 pointer-events-none rounded-[4rem] blur-[100px]"
        animate={{ 
          backgroundColor: selectedColor || '#ffffff', // 没选颜色时是纯白
          opacity: selectedColor ? 0.15 : 0 // ✅ 没选颜色时绝对透明，保持环境纯净
        }}
        transition={{ duration: 1.2, ease: "easeInOut" }}
      />

      <div className="w-full relative z-10 px-6 flex flex-col items-center">
        <AnimatePresence mode="wait">
          {!isReleasing ? (
            <motion.div 
              key="editor"
              initial={{ opacity: 0, filter: 'blur(10px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -20, scale: 0.98, filter: 'blur(15px)', transition: { duration: 1 } }}
              className="flex flex-col items-center w-full"
            >
              <div className="text-slate-400/50 font-serif text-sm tracking-widest uppercase mb-10 shrink-0">
                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · The Present
              </div>

              {/* ✅ 修改为带有极限高度和滚动条的防挤出布局 */}
              <div className="w-full max-h-[35vh] overflow-y-auto no-scrollbar mb-16 flex items-center justify-center">
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="What's on your mind? Just let it flow..."
                  className="w-full bg-transparent text-slate-700 text-3xl md:text-4xl lg:text-5xl font-serif leading-[1.6] text-center outline-none resize-none placeholder:text-slate-300/60 placeholder:font-light focus:ring-0"
                  rows={1}
                  spellCheck={false}
                />
              </div>

              <AnimatePresence>
                {content.trim() && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="w-full max-w-md flex flex-col items-center shrink-0 space-y-10"
                  >
                    {/* ✅ 全新七彩情绪色盘 */}
                    <div className="flex items-center space-x-4 p-3 rounded-full bg-white/20 backdrop-blur-md border border-white/30 shadow-inner">
                      {AURA_COLORS.map(c => (
                        <motion.button
                          key={c}
                          onClick={() => setSelectedColor(c)}
                          className="relative w-6 h-6 rounded-full cursor-pointer outline-none"
                          style={{ backgroundColor: c }}
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.9 }}
                        >
                          {selectedColor === c && (
                            <motion.div 
                              layoutId="color-ring"
                              className="absolute -inset-1.5 border-2 rounded-full pointer-events-none"
                              style={{ borderColor: c }}
                              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                            />
                          )}
                        </motion.button>
                      ))}
                    </div>

                    <button
                      onClick={handleRelease}
                      disabled={!selectedColor} // ✅ 未选颜色禁用
                      className={`relative px-10 py-3 rounded-full border border-slate-200 font-serif tracking-widest transition-all duration-500 overflow-hidden ${
                        selectedColor ? 'text-slate-500 hover:bg-slate-50 hover:shadow-xl group' : 'text-slate-300 cursor-not-allowed'
                      }`}
                    >
                      <span className="group-hover:opacity-0 transition-opacity duration-300">Hold</span>
                      <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 font-medium" style={{ color: selectedColor || '#39C5BB' }}>
                        Release
                      </span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div 
              key="releasing"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center justify-center min-h-[20vh] text-2xl font-serif text-slate-400 tracking-[0.2em] italic"
            >
              Letting go...
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};