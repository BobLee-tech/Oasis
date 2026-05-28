// src/components/OasisGallery.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { useGarden, type BlogPost } from '../hooks/useGarden';
import { usePostResonance } from '../hooks/usePostResonance';

const AURA_COLORS = ['#FFB7C5', '#FDBA74', '#FDE047', '#A7F3D0', '#39C5BB', '#60A5FA', '#A78BFA'];
const calculateReadingTime = (text: string) => `${Math.ceil(text.trim().split(/\s+/).length / 200)} min read`;

// ✅ 接收父组件传来的上帝视角权限
interface OasisGalleryProps { isAdmin: boolean; }

export const OasisGallery: React.FC<OasisGalleryProps> = ({ isAdmin }) => {
  const { posts, plantSeed, updateSeed, uprootSeed } = useGarden();
  const [activePost, setActivePost] = useState<BlogPost | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isEditing, setIsEditing] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editColor, setEditColor] = useState('#39C5BB');

  // 🍂 挂载落叶共鸣系统
  const { resonances, leaveResonance, purifyResonance } = usePostResonance(activePost ? activePost.id : null);
  const [resAuthor, setResAuthor] = useState('');
  const [resContent, setResContent] = useState('');
  const [resColor, setResColor] = useState('#39C5BB');
  const [isResFocused, setIsResFocused] = useState(false);
  const [isResSubmitting, setIsResSubmitting] = useState(false);

  // 切换文章时，折叠并清空共鸣输入框
  useEffect(() => {
    setResContent(''); setResAuthor(''); setIsResFocused(false);
  }, [activePost?.id]);

  const allTags = useMemo(() => {
    const tags = new Set<string>(); posts.forEach(p => p.tags.forEach(t => tags.add(t))); return Array.from(tags).sort();
  }, [posts]);

  const filteredPosts = useMemo(() => posts.filter(post => {
    const matchTag = selectedTag ? post.tags.includes(selectedTag) : true;
    const matchSearch = searchQuery ? (post.title.toLowerCase().includes(searchQuery.toLowerCase()) || post.excerpt.toLowerCase().includes(searchQuery.toLowerCase())) : true;
    return matchTag && matchSearch;
  }), [selectedTag, searchQuery, posts]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setActivePost(null); setIsEditing(false); } };
    window.addEventListener('keydown', handleEsc); return () => window.removeEventListener('keydown', handleEsc);
  }, []);

const handleResSubmit = async () => {
    if (!resAuthor.trim() || !resContent.trim() || isResSubmitting) return;
    setIsResSubmitting(true);
    try {
      await leaveResonance(resAuthor, resContent, resColor);
      setResContent(''); setResAuthor(''); setIsResFocused(false);
    } catch (error) {
      console.error(error);
    } finally {
      setIsResSubmitting(false); // ✅ 绝对保证状态重置
    }
  };

  const startEditingPost = (post: BlogPost) => {
    setEditingId(post.id); setEditTitle(post.title); setEditTags(post.tags.join(', ')); setEditColor(post.color); setEditContent(post.content);
    setIsPreviewMode(false); setActivePost(null); setIsEditing(true);
  };

  const startNewPost = () => {
    setEditingId(null); setEditTitle(''); setEditTags(''); setEditContent(''); setEditColor('#39C5BB');
    setIsPreviewMode(false); setIsEditing(true);
  };

  const handlePublish = () => {
    if (!editContent.trim()) return;
    const tagArray = editTags.split(',').map(t => t.trim()).filter(Boolean);
    if (editingId) updateSeed(editingId, editTitle, tagArray, editColor, editContent); else plantSeed(editTitle, tagArray, editColor, editContent);
    setIsEditing(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to uproot this thought?')) { uprootSeed(id); setActivePost(null); }
  };

  return (
    <motion.div className="absolute inset-0 w-full h-full overflow-hidden flex" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.5 }}>
      {/* --- 左侧守望者档案省略（保持之前的一致，节省空间） --- */}
      <AnimatePresence>
        {!activePost && !isEditing && (
          <motion.div className="hidden lg:flex w-1/3 h-full flex-col justify-start pt-32 px-16 relative z-20 border-r border-slate-300/20" initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50, filter: 'blur(10px)' }} transition={{ type: "spring", stiffness: 260, damping: 30 }}>
            <div className="relative w-24 h-24 mb-10 group cursor-default">
              <div className="absolute inset-0 rounded-full bg-[#39C5BB] blur-xl opacity-20 group-hover:opacity-60 transition-opacity duration-700" />
              <div className="relative w-full h-full rounded-full border border-white/30 overflow-hidden shadow-2xl bg-white/10 backdrop-blur-md">
                <img src="/avatar.jpg" alt="Curator" className="w-full h-full object-cover opacity-80 mix-blend-luminosity hover:mix-blend-normal transition-all duration-700" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              </div>
            </div>
            <h1 className="font-serif text-3xl text-slate-700 mb-4 tracking-wide">The Digital Garden</h1>
            <p className="font-serif italic text-slate-500/80 text-sm leading-relaxed mb-8">"Exploring the intersection of human behavior, <br/> aesthetics, and software architecture."</p>
            <div className="flex flex-col space-y-2 mb-16">
              <span className="font-mono text-[10px] tracking-[0.2em] text-slate-400 uppercase">CS @ UNSW · SYDNEY</span>
              <span className="font-mono text-[10px] tracking-[0.2em] text-[#39C5BB] uppercase">FULL-STACK CRAFTSMAN</span>
            </div>
            <div className="flex gap-8 font-mono text-xs tracking-widest text-slate-400 mt-auto pb-32">
              <a href="https://github.com/lb15058460816-tech" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 relative group transition-colors">[ GITHUB ]<span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-slate-400 group-hover:w-full transition-all duration-300" /></a>
              <a href="mailto:lb15058460816@gmail.com" className="hover:text-slate-600 relative group transition-colors">[ MAIL ]<span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-slate-400 group-hover:w-full transition-all duration-300" /></a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- 右侧主要内容区 --- */}
      <motion.div className="w-full h-full overflow-y-auto no-scrollbar pt-24 pb-32 px-8 lg:px-16 relative z-10 flex flex-col" animate={{ width: (activePost || isEditing) ? '100%' : '66.666%' }} transition={{ type: "spring", stiffness: 260, damping: 30 }}>
        <div className="absolute top-12 left-1/2 lg:left-16 -translate-x-1/2 lg:translate-x-0 text-slate-400/30 font-mono text-[10px] tracking-[0.5em] uppercase pointer-events-none transition-opacity" style={{ opacity: (activePost || isEditing) ? 0 : 1 }}>Curated Thoughts</div>

        <AnimatePresence mode="wait">
          {!isEditing && !activePost ? (
            <motion.div key="gallery" className="w-full h-full flex flex-col" exit={{ opacity: 0 }}>
              {/* 画廊视图：搜索、列表（与之前完全一致，直接复用） */}
              <AnimatePresence>
                  <motion.div className="flex flex-col gap-6 mb-10" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <div className="flex items-center justify-between">
                      <div className="relative w-64 group">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 opacity-50 group-hover:opacity-100 transition-opacity">
                           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                        </span>
                        <input type="text" placeholder="Search thoughts..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white/10 border border-slate-300/30 text-slate-600 font-serif text-sm rounded-full py-1.5 pl-9 pr-4 outline-none focus:border-slate-400/60 focus:bg-white/30 backdrop-blur-sm transition-all placeholder:text-slate-400/50" />
                      </div>
                      {isAdmin && <button onClick={startNewPost} className="font-mono text-[10px] tracking-widest uppercase px-4 py-1.5 rounded-full border border-[#39C5BB]/50 text-[#39C5BB] hover:bg-[#39C5BB] hover:text-white transition-all duration-300">[ + Seed ]</button>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setSelectedTag(null)} className={`font-mono text-[9px] tracking-widest uppercase px-3 py-1 rounded-full border transition-all duration-300 ${!selectedTag ? 'bg-slate-700 text-white border-slate-700' : 'bg-transparent text-slate-400 border-slate-300/50 hover:border-slate-400'}`}>All</button>
                      {allTags.map(tag => (
                        <button key={tag} onClick={() => setSelectedTag(tag)} className={`font-mono text-[9px] tracking-widest uppercase px-3 py-1 rounded-full border transition-all duration-300 ${selectedTag === tag ? 'bg-slate-700 text-white border-slate-700' : 'bg-transparent text-slate-400 border-slate-300/50 hover:border-slate-400'}`}>{tag}</button>
                      ))}
                    </div>
                  </motion.div>
              </AnimatePresence>
              <motion.div layout className="columns-1 xl:columns-2 gap-8 space-y-8">
                <AnimatePresence>
                  {filteredPosts.map((post) => (
                    <motion.div 
                      key={post.id} 
                      className="break-inside-avoid relative rounded-3xl cursor-pointer overflow-hidden border border-white/20 bg-white/10" 
                      style={{ backdropFilter: `blur(12px)` }} 
                      initial={{ opacity: 0, scale: 0.9, y: 20 }} 
                      animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }} 
                      exit={{ opacity: 0, scale: 0.9 }} 
                      transition={{ type: "spring", stiffness: 260, damping: 25 }} 
                      onClick={() => setActivePost(post)} 
                      whileHover={{ y: -6, scale: 1.02, boxShadow: `0 20px 40px rgba(0,0,0,0.05), 0 0 30px ${post.color}15` }} 
                      whileTap={{ scale: 0.96 }}
                    >
                      <div className="h-32 w-full relative overflow-hidden bg-slate-50/50 dark:bg-slate-900/50">
                        <motion.div layoutId={`blog-glow-${post.id}`} className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-40" style={{ backgroundColor: post.color }} />
                        <div className="absolute bottom-4 left-6 flex space-x-3">{post.tags.map(tag => <motion.span layoutId={`blog-tag-${post.id}-${tag}`} key={tag} className="font-mono text-[9px] tracking-widest text-slate-500 uppercase bg-white/40 px-2 py-1 rounded backdrop-blur-sm border border-white/50">{tag}</motion.span>)}</div>
                      </div>
                      <div className="p-8">
                        <motion.div layoutId={`blog-date-${post.id}`} className="font-mono text-[10px] tracking-[0.2em] text-slate-400 uppercase mb-4 flex items-center gap-2"><span>{post.date}</span><span className="w-1 h-1 rounded-full bg-slate-300"></span><span className="opacity-70">{calculateReadingTime(post.content)}</span></motion.div>
                        <motion.h2 layoutId={`blog-title-${post.id}`} className="font-serif text-xl md:text-2xl text-slate-700 leading-snug mb-4">{post.title}</motion.h2>
                        <motion.p layoutId={`blog-excerpt-${post.id}`} className="font-serif text-slate-500 text-sm leading-relaxed line-clamp-3">{post.excerpt}</motion.p>
                      </div>
                    </motion.div>
                  ))}
                  {filteredPosts.length === 0 && <div className="col-span-full pt-20 text-center font-serif text-slate-400 italic">No thoughts found.</div>}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          ) : isEditing ? (
            // --- 编辑器界面保持不变 ---
            <motion.div key="editor" className="w-full max-w-3xl mx-auto flex flex-col h-full pt-10" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
               {/* 原有编辑器内容...为省字数结构复用，粘贴你现有的 editor JSX 即可 */}
               <div className="flex items-center justify-between mb-8"><div className="flex bg-slate-200/50 dark:bg-slate-800/50 rounded-lg p-1 backdrop-blur-sm shadow-inner"><button onClick={() => setIsPreviewMode(false)} className={`px-5 py-1.5 text-[10px] tracking-[0.2em] uppercase font-mono rounded-md transition-all duration-300 ${!isPreviewMode ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Write</button><button onClick={() => setIsPreviewMode(true)} className={`px-5 py-1.5 text-[10px] tracking-[0.2em] uppercase font-mono rounded-md transition-all duration-300 ${isPreviewMode ? 'bg-white text-[#39C5BB] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Preview</button></div><button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-600"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div><input type="text" placeholder="Title..." value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full bg-transparent text-4xl md:text-5xl font-serif text-slate-700 mb-6 outline-none placeholder:text-slate-300" disabled={isPreviewMode} /><div className="flex items-center space-x-6 mb-8 border-b border-slate-200 pb-8 transition-opacity" style={{ opacity: isPreviewMode ? 0.3 : 1, pointerEvents: isPreviewMode ? 'none' : 'auto' }}><input type="text" placeholder="Tags (comma separated)" value={editTags} onChange={e => setEditTags(e.target.value)} className="flex-1 bg-transparent font-mono text-xs tracking-widest text-slate-500 outline-none placeholder:text-slate-300 uppercase" /><div className="flex items-center space-x-2">{AURA_COLORS.map(c => <div key={c} onClick={() => setEditColor(c)} className={`w-4 h-4 rounded-full cursor-pointer transition-transform ${editColor === c ? 'scale-125' : 'opacity-40 hover:opacity-100'}`} style={{ backgroundColor: c, boxShadow: editColor === c ? `0 0 0 2px #FAFAFA, 0 0 0 4px ${c}` : 'none' }} />)}</div></div>{isPreviewMode ? (<div className="flex-1 w-full overflow-y-auto no-scrollbar mb-8 prose prose-slate prose-lg max-w-none font-serif text-slate-600 leading-[2.2] tracking-wide prose-headings:font-serif prose-headings:font-normal prose-headings:text-slate-700 prose-a:text-[#39C5BB] prose-a:no-underline hover:prose-a:underline prose-strong:font-bold prose-strong:text-slate-700 prose-img:rounded-3xl prose-img:shadow-2xl prose-img:my-12 prose-img:mx-auto">{editContent.trim() ? <ReactMarkdown>{editContent}</ReactMarkdown> : <div className="text-slate-300 italic text-center mt-20">No content to preview...</div>}</div>) : (<><div className="text-[10px] text-slate-400 font-mono mb-4 opacity-60 tracking-widest">SUPPORT MARKDOWN & IMAGES: ![alt](/img/picture.jpg)</div><textarea value={editContent} onChange={e => setEditContent(e.target.value)} placeholder="Let your thoughts flow..." className="flex-1 w-full bg-transparent font-serif text-lg leading-loose text-slate-600 outline-none resize-none placeholder:text-slate-300/50 no-scrollbar mb-8" /></>)}<div className="flex justify-end mt-auto"><button onClick={handlePublish} className="font-mono text-xs tracking-widest uppercase px-8 py-3 rounded-full text-white shadow-lg hover:shadow-xl transition-all duration-300" style={{ backgroundColor: editColor }}>{editingId ? 'Update' : 'Publish'}</button></div>
            </motion.div>
          ) : (
            // --- 阅读视图 ---
            <motion.div key="reader" className="w-full max-w-3xl mx-auto flex flex-col h-full relative" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* 沉浸式背景垫层 */}
              <div className="fixed inset-0 bg-[#FAFAFA] dark:bg-[#0A0A0A] -z-10" />
              
              <motion.div className="relative w-full z-10 pt-32 pb-48" transition={{ type: "spring", stiffness: 260, damping: 25 }}>
                <div className="absolute top-0 left-0 w-full h-96 overflow-hidden pointer-events-none -z-10">
                <motion.div layoutId={`blog-glow-${activePost?.id}`} className="absolute -top-32 -left-32 w-96 h-96 rounded-full blur-[100px] opacity-20" style={{ backgroundColor: activePost?.color }} />
              </div>
                
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="absolute top-12 right-0 flex items-center space-x-6 z-50 font-mono text-[10px] tracking-widest uppercase">
                  {isAdmin && <button onClick={() => activePost && startEditingPost(activePost)} className="text-slate-400 hover:text-[#39C5BB] transition-colors">Edit</button>}
                  {isAdmin && <button onClick={() => activePost && handleDelete(activePost.id)} className="text-slate-400 hover:text-red-400 transition-colors">Destroy</button>}
                  <button onClick={() => setActivePost(null)} className="text-slate-400 hover:text-slate-700 transition-colors ml-4"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
                </motion.div>

                <motion.div layoutId={`blog-date-${activePost?.id}`} className="font-mono text-xs tracking-[0.3em] text-slate-400 uppercase mb-8 mt-8 flex items-center gap-3">
                  <span>{activePost?.date}</span><span className="w-1 h-1 rounded-full bg-slate-300"></span><span className="opacity-70">{calculateReadingTime(activePost?.content || '')}</span>
                </motion.div>
                
                <motion.h1 layoutId={`blog-title-${activePost?.id}`} className="font-serif text-4xl md:text-5xl text-slate-800 leading-[1.3] mb-8">{activePost?.title}</motion.h1>
                
                <div className="flex space-x-4 mb-16">
                  {activePost?.tags.map(tag => <motion.span layoutId={`blog-tag-${activePost.id}-${tag}`} key={tag} className="font-mono text-[10px] tracking-widest text-slate-500 uppercase border-b border-slate-300 pb-1">{tag}</motion.span>)}
                </div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.8 }} className="prose prose-slate prose-lg max-w-none font-serif text-slate-600 leading-[2.2] tracking-wide prose-headings:font-serif prose-headings:font-normal prose-headings:text-slate-700 prose-a:text-[#39C5BB] prose-a:no-underline hover:prose-a:underline prose-strong:font-bold prose-strong:text-slate-700 prose-img:rounded-3xl prose-img:shadow-2xl prose-img:my-12 prose-img:mx-auto first-letter:text-5xl first-letter:font-bold first-letter:text-slate-800 first-letter:mr-1 first-letter:float-left first-letter:leading-[0.8]">
                  <ReactMarkdown>{activePost?.content || ''}</ReactMarkdown>
                </motion.div>

                {/* 🍂 落叶共鸣区 (Fallen Leaves) */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 1 }} className="mt-24 pt-16 border-t border-slate-200/50">
                  <h3 className="font-serif text-2xl text-slate-400 mb-8 italic">Fallen Leaves</h3>
                  
                  {/* 落叶平铺展示 */}
                  <div className="flex flex-wrap gap-4 mb-16">
                    {resonances.map(res => (
                      <div key={res.id} className="relative group px-5 py-4 bg-white/40 backdrop-blur-md border border-white/50"
                           style={{ borderTopRightRadius: '1.5rem', borderBottomLeftRadius: '1.5rem', borderTopLeftRadius: '0.5rem', borderBottomRightRadius: '0.5rem', borderColor: `${res.aura_color}40`, boxShadow: `0 4px 20px -5px ${res.aura_color}20` }}>
                        <div className="flex items-center space-x-3 mb-2">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: res.aura_color }} />
                          <span className="font-mono text-[9px] tracking-widest uppercase text-slate-400">{res.author_name}</span>
                          {isAdmin && (
                            <button onClick={() => purifyResonance(res.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-red-400 hover:text-red-500 ml-2">×</button>
                          )}
                        </div>
                        <p className="font-serif text-slate-600 text-sm leading-relaxed">{res.content}</p>
                      </div>
                    ))}
                  </div>

                  {/* 落叶书写容器：平滑且不打扰 */}
                  <div className="relative bg-white/50 border border-slate-200/50 rounded-2xl p-4 transition-all duration-500" style={{ boxShadow: isResFocused ? `0 10px 40px ${resColor}15` : 'none', borderColor: isResFocused ? `${resColor}50` : '' }}>
                    {!isResFocused ? (
                      <input type="text" placeholder="Leave a trace..." onClick={() => setIsResFocused(true)} readOnly className="w-full bg-transparent font-serif text-slate-400 outline-none cursor-text italic" />
                    ) : (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex flex-col">
                        <input type="text" placeholder="Your Alias..." value={resAuthor} onChange={e => setResAuthor(e.target.value)} maxLength={20} className="bg-transparent border-b border-slate-200/50 font-mono text-xs text-slate-500 pb-2 mb-4 outline-none focus:border-slate-400 transition-colors placeholder:text-slate-400" />
                        <textarea placeholder="The leaf falls..." value={resContent} onChange={e => setResContent(e.target.value)} maxLength={150} className="bg-transparent font-serif text-slate-600 h-20 outline-none resize-none mb-4 placeholder:text-slate-400" />
                        <div className="flex items-center justify-between">
                          <div className="flex space-x-2">
                            {AURA_COLORS.map(c => (
                              <div key={c} onClick={() => setResColor(c)} className={`w-3 h-3 rounded-full cursor-pointer transition-transform ${resColor === c ? 'scale-125' : 'opacity-40 hover:opacity-100'}`} style={{ backgroundColor: c, boxShadow: resColor === c ? `0 0 0 1.5px #FAFAFA, 0 0 0 3px ${c}` : 'none' }} />
                            ))}
                          </div>
                          <div className="flex space-x-4">
                            <button onClick={() => setIsResFocused(false)} className="font-mono text-[10px] tracking-widest uppercase text-slate-400 hover:text-slate-600">Cancel</button>
                            <button onClick={handleResSubmit} disabled={!resAuthor.trim() || !resContent.trim() || isResSubmitting} className="font-mono text-[10px] tracking-widest uppercase px-4 py-1.5 rounded-full text-white transition-all disabled:opacity-30" style={{ backgroundColor: resColor, boxShadow: `0 4px 10px ${resColor}40` }}>{isResSubmitting ? '...' : 'Release'}</button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </motion.div>

              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};