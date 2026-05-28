// src/components/OasisGallery.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { useGarden, type BlogPost } from '../hooks/useGarden';

const AURA_COLORS = ['#FFB7C5', '#FDBA74', '#FDE047', '#A7F3D0', '#39C5BB', '#60A5FA', '#A78BFA'];

export const OasisGallery: React.FC = () => {
  const { posts, plantSeed } = useGarden();
  const [activePost, setActivePost] = useState<BlogPost | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  
  // ✍️ 编辑器状态
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editColor, setEditColor] = useState('#39C5BB');

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    posts.forEach(post => post.tags.forEach(tag => tags.add(tag)));
    return Array.from(tags).sort();
  }, [posts]);

  const filteredPosts = useMemo(() => {
    if (!selectedTag) return posts;
    return posts.filter(post => post.tags.includes(selectedTag));
  }, [selectedTag, posts]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { 
      if (e.key === 'Escape') {
        setActivePost(null);
        setIsEditing(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handlePublish = () => {
    if (!editContent.trim()) return;
    const tagArray = editTags.split(',').map(t => t.trim()).filter(Boolean);
    plantSeed(editTitle, tagArray, editColor, editContent);
    // 重置并退出编辑器
    setEditTitle(''); setEditTags(''); setEditContent('');
    setIsEditing(false);
  };

  return (
    <motion.div 
      className="absolute inset-0 w-full h-full overflow-hidden flex"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 1.5 }}
    >
      {/* 🎭 左侧：静谧守望者 */}
      <AnimatePresence>
        {!activePost && !isEditing && (
          <motion.div 
            // ✅ 修复 1：将 justify-center 改为 pt-32 justify-start，让头像呼吸感更强，且与右侧平齐
            className="hidden lg:flex w-1/3 h-full flex-col justify-start pt-32 px-16 relative z-20 border-r border-slate-300/20"
            initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50, filter: 'blur(10px)' }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="relative w-24 h-24 mb-10 group cursor-default">
              <div className="absolute inset-0 rounded-full bg-[#39C5BB] blur-xl opacity-20 group-hover:opacity-60 transition-opacity duration-700" />
              <div className="relative w-full h-full rounded-full border border-white/30 overflow-hidden shadow-2xl bg-white/10 backdrop-blur-md">
                <img src="/avatar.jpg" alt="Curator" className="w-full h-full object-cover opacity-80 mix-blend-luminosity hover:mix-blend-normal transition-all duration-700" 
                  onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                />
              </div>
            </div>

            <h1 className="font-serif text-3xl text-slate-700 mb-4 tracking-wide">
              The Digital Garden
            </h1>
            
            <p className="font-serif italic text-slate-500/80 text-sm leading-relaxed mb-8">
              "Exploring the intersection of human behavior, <br/> aesthetics, and software architecture."
            </p>

            <div className="flex flex-col space-y-2 mb-16">
              <span className="font-mono text-[10px] tracking-[0.2em] text-slate-400 uppercase">CS @ UNSW · SYDNEY</span>
              <span className="font-mono text-[10px] tracking-[0.2em] text-[#39C5BB] uppercase">FULL-STACK CRAFTSMAN</span>
            </div>

            <div className="flex gap-8 font-mono text-xs tracking-widest text-slate-400 mt-auto pb-32">
              <a href="https://github.com/lb15058460816-tech" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 relative group transition-colors">
                [ GITHUB ]
                <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-slate-400 group-hover:w-full transition-all duration-300" />
              </a>
              <a href="mailto:lb15058460816@gmail.com" className="hover:text-slate-600 relative group transition-colors">
                [ MAIL ]
                <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-slate-400 group-hover:w-full transition-all duration-300" />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 🖼️ 右侧：错落记忆画廊 (或编辑器) */}
      <motion.div 
        className="w-full h-full overflow-y-auto no-scrollbar pt-24 pb-32 px-8 lg:px-16 relative z-10 flex flex-col"
        animate={{ width: (activePost || isEditing) ? '100%' : '66.666%' }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="absolute top-12 left-1/2 lg:left-16 -translate-x-1/2 lg:translate-x-0 text-slate-400/30 font-mono text-[10px] tracking-[0.5em] uppercase pointer-events-none transition-opacity" style={{ opacity: (activePost || isEditing) ? 0 : 1 }}>
          Curated Thoughts
        </div>

        <AnimatePresence mode="wait">
          {!isEditing ? (
            <motion.div key="gallery" className="w-full h-full flex flex-col" exit={{ opacity: 0 }}>
              {/* 动态流体标签栏 & 种树按钮 */}
              <AnimatePresence>
                {!activePost && (
                  <motion.div 
                    className="flex flex-wrap items-center justify-between gap-3 mb-10"
                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  >
                    <div className="flex flex-wrap gap-3">
                      <button 
                        onClick={() => setSelectedTag(null)}
                        className={`font-mono text-[10px] tracking-widest uppercase px-3 py-1.5 rounded-full border transition-all duration-300 ${!selectedTag ? 'bg-slate-700 text-white border-slate-700' : 'bg-transparent text-slate-400 border-slate-300/50 hover:border-slate-400'}`}
                      >
                        All
                      </button>
                      {allTags.map(tag => (
                        <button key={tag} onClick={() => setSelectedTag(tag)} className={`font-mono text-[10px] tracking-widest uppercase px-3 py-1.5 rounded-full border transition-all duration-300 ${selectedTag === tag ? 'bg-slate-700 text-white border-slate-700' : 'bg-transparent text-slate-400 border-slate-300/50 hover:border-slate-400'}`}>
                          {tag}
                        </button>
                      ))}
                    </div>
                    {/* ✅ 写作入口：Plant Seed */}
                    <button 
                      onClick={() => setIsEditing(true)}
                      className="font-mono text-[10px] tracking-widest uppercase px-4 py-1.5 rounded-full border border-[#39C5BB]/50 text-[#39C5BB] hover:bg-[#39C5BB] hover:text-white transition-all duration-300"
                    >
                      [ + Seed ]
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 瀑布流 */}
              <motion.div layout className="columns-1 xl:columns-2 gap-8 space-y-8">
                <AnimatePresence>
                  {filteredPosts.map((post) => {
                    const isDimmed = activePost !== null && activePost.id !== post.id;
                    return (
                      <motion.div
                        key={post.id}
                        layoutId={`blog-card-${post.id}`} 
                        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: isDimmed ? 0 : 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                        onClick={() => setActivePost(post)}
                        className="break-inside-avoid relative rounded-3xl cursor-pointer overflow-hidden border border-white/20 transition-all duration-500 bg-white/10"
                        style={{ backdropFilter: `blur(12px)`, opacity: isDimmed ? 0 : 1, filter: isDimmed ? 'blur(10px)' : 'blur(0px)' }}
                        whileHover={{ y: -5, scale: 1.01, boxShadow: `0 20px 40px rgba(0,0,0,0.05), 0 0 30px ${post.color}15` }}
                      >
                        <div className="h-32 w-full relative overflow-hidden bg-slate-50/50 dark:bg-slate-900/50">
                          <motion.div layoutId={`blog-glow-${post.id}`} className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-40" style={{ backgroundColor: post.color }} />
                          <div className="absolute bottom-4 left-6 flex space-x-3">
                            {post.tags.map(tag => (
                              <motion.span layoutId={`blog-tag-${post.id}-${tag}`} key={tag} className="font-mono text-[9px] tracking-widest text-slate-500 uppercase bg-white/40 px-2 py-1 rounded backdrop-blur-sm border border-white/50">{tag}</motion.span>
                            ))}
                          </div>
                        </div>
                        <div className="p-8">
                          <motion.div layoutId={`blog-date-${post.id}`} className="font-mono text-[10px] tracking-[0.2em] text-slate-400 uppercase mb-4">{post.date}</motion.div>
                          <motion.h2 layoutId={`blog-title-${post.id}`} className="font-serif text-xl md:text-2xl text-slate-700 leading-snug mb-4">{post.title}</motion.h2>
                          <motion.p layoutId={`blog-excerpt-${post.id}`} className="font-serif text-slate-500 text-sm leading-relaxed line-clamp-3">{post.excerpt}</motion.p>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          ) : (
            
            // ✍️ 沉浸式创作界面 (Zen Editor)
            <motion.div 
              key="editor" 
              className="w-full max-w-3xl mx-auto flex flex-col h-full pt-10"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex items-center justify-between mb-8">
                <span className="font-mono text-xs tracking-widest text-slate-400 uppercase">Planting a new thought...</span>
                <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-600">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>

              <input 
                type="text" placeholder="Title..." value={editTitle} onChange={e => setEditTitle(e.target.value)}
                className="w-full bg-transparent text-4xl md:text-5xl font-serif text-slate-700 mb-6 outline-none placeholder:text-slate-300"
              />
              
              <div className="flex items-center space-x-6 mb-8 border-b border-slate-200 pb-8">
                <input 
                  type="text" placeholder="Tags (comma separated, e.g. React, Psyche)" value={editTags} onChange={e => setEditTags(e.target.value)}
                  className="flex-1 bg-transparent font-mono text-xs tracking-widest text-slate-500 outline-none placeholder:text-slate-300 uppercase"
                />
                
                {/* 选色器 */}
                <div className="flex items-center space-x-2">
                  {AURA_COLORS.map(c => (
                    <div 
                      key={c} onClick={() => setEditColor(c)}
                      className={`w-4 h-4 rounded-full cursor-pointer transition-transform ${editColor === c ? 'scale-125 ring-2 ring-offset-2 ring-slate-300' : 'opacity-50 hover:opacity-100'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <textarea 
                value={editContent} onChange={e => setEditContent(e.target.value)}
                placeholder="Markdown is supported. Let your thoughts flow..."
                className="flex-1 w-full bg-transparent font-serif text-lg leading-loose text-slate-600 outline-none resize-none placeholder:text-slate-300/50 no-scrollbar mb-8"
              />

              <div className="flex justify-end mt-auto">
                <button onClick={handlePublish} className="font-mono text-xs tracking-widest uppercase px-8 py-3 rounded-full text-white shadow-lg hover:shadow-xl transition-all duration-300" style={{ backgroundColor: editColor }}>
                  Publish
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 📖 沉浸式 Markdown 阅读模式 (保持不变) */}
      <AnimatePresence>
        {activePost && !isEditing && (
          <div className="absolute inset-0 z-50 flex justify-center pointer-events-auto overflow-y-auto no-scrollbar">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} className="fixed inset-0 bg-[#FAFAFA] dark:bg-[#0A0A0A]" />
            <motion.div layoutId={`blog-card-${activePost.id}`} className="relative w-full max-w-3xl min-h-screen bg-transparent z-10 pt-32 pb-48 px-8 md:px-16">
              <div className="absolute top-0 left-0 w-full h-96 overflow-hidden pointer-events-none">
                <motion.div layoutId={`blog-glow-${activePost.id}`} className="absolute -top-32 -left-32 w-96 h-96 rounded-full blur-[100px] opacity-20" style={{ backgroundColor: activePost.color }} />
              </div>
              <motion.div layoutId={`blog-date-${activePost.id}`} className="font-mono text-xs tracking-[0.3em] text-slate-400 uppercase mb-8">{activePost.date}</motion.div>
              <motion.h1 layoutId={`blog-title-${activePost.id}`} className="font-serif text-4xl md:text-5xl text-slate-800 leading-[1.3] mb-8">{activePost.title}</motion.h1>
              
              <div className="flex space-x-4 mb-16">
                {activePost.tags.map(tag => (
                  <motion.span layoutId={`blog-tag-${activePost.id}-${tag}`} key={tag} className="font-mono text-[10px] tracking-widest text-slate-500 uppercase border-b border-slate-300 pb-1">{tag}</motion.span>
                ))}
              </div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.8 }} className="prose prose-slate prose-lg max-w-none font-serif text-slate-600 leading-[2.2] tracking-wide prose-headings:font-serif prose-headings:font-normal prose-headings:text-slate-700 prose-a:text-[#39C5BB] prose-a:no-underline hover:prose-a:underline prose-strong:font-bold prose-strong:text-slate-700">
                <ReactMarkdown>{activePost.content}</ReactMarkdown>
              </motion.div>

              <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} onClick={() => setActivePost(null)} className="fixed top-12 right-12 w-12 h-12 rounded-full border border-slate-300 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors z-50 mix-blend-difference">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </motion.button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};