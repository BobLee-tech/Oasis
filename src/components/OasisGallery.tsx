// src/components/OasisGallery.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useSpring } from 'framer-motion';
import { useGarden, type BlogPost, type PostType } from '../hooks/useGarden';
import { Markdown, PROSE_CLASS } from './Markdown';
import { usePostResonance } from '../hooks/usePostResonance';
import { useSoundscape } from '../hooks/useSoundscape';

const AURA_COLORS = ['#FFB7C5', '#FDBA74', '#FDE047', '#A7F3D0', '#39C5BB', '#60A5FA', '#A78BFA'];
const calculateReadingTime = (text: string) => `${Math.ceil(text.trim().split(/\s+/).length / 200)} min read`;

// 🌱 条目类型元数据：周报 / 学习笔记 / 成长 / 随笔，各有温柔的图标与微光色
const TypeIcons = {
  thought: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full"><path d="M20.4 14.5L16 10 4 20"/><path d="M14 4l6 6"/><path d="M3 21l4-1 11-11a2.8 2.8 0 0 0-4-4L3 16z"/></svg>),
  weekly: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>),
  note: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>),
  growth: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full"><path d="M7 20h10"/><path d="M12 20V8"/><path d="M12 8C12 5 9.5 3 6 3c0 3.5 2.5 5 6 5z"/><path d="M12 11c0-2.5 2.2-4.5 5.5-4.5C17.5 9.5 15.2 11 12 11z"/></svg>),
  project: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>),
};

const POST_TYPES: { id: PostType; label: string; zh: string; color: string }[] = [
  { id: 'thought', label: 'Thoughts', zh: '随笔', color: '#39C5BB' },
  { id: 'weekly', label: 'Weekly', zh: '周报', color: '#FFB7C5' },
  { id: 'note', label: 'Notes', zh: '学习笔记', color: '#60A5FA' },
  { id: 'growth', label: 'Growth', zh: '成长', color: '#A7F3D0' },
  { id: 'project', label: 'Projects', zh: '项目复盘', color: '#A78BFA' },
];
const TYPE_MAP = Object.fromEntries(POST_TYPES.map(t => [t.id, t]));

// 📝 默认写作模板：每种类型的温柔骨架，可被自定义模板覆盖
const DEFAULT_TEMPLATES: Record<PostType, string> = {
  thought: '',
  weekly: '## 本周做了什么\n\n- \n\n## 学到了什么\n\n- \n\n## 遇到的困难\n\n- \n\n## 下周计划\n\n- \n\n## 一点心情\n\n> ',
  note: '## 核心概念\n\n\n\n## 关键点\n\n- \n\n## 代码 / 示例\n\n```\n\n```\n\n## 我的理解\n\n\n\n## 延伸与疑问\n\n- ',
  growth: '## 此刻的我\n\n\n\n## 一个微小的进步\n\n\n\n## 想对未来的自己说\n\n> ',
  project: '## 目标与背景\n\n\n\n## 方案与取舍\n\n- \n\n## 踩过的坑\n\n- \n\n## 复盘与下一步\n\n- ',
};

// 🎨 自定义模板：持久在 localStorage，按类型覆盖默认骨架
const TEMPLATE_STORE_KEY = 'oasis_custom_templates';
const loadCustomTemplates = (): Partial<Record<PostType, string>> => {
  try { return JSON.parse(localStorage.getItem(TEMPLATE_STORE_KEY) || '{}'); } catch { return {}; }
};

const DAILY_QUOTES = [
  "Sometimes life is scary and dark, that's why we must find the light",
  "忘记了昨日的痛苦与泪，现在的脚步很轻快",
  "时光有自己的流速，事物有自己的归宿",
  "小满即是全",
  "早安 午安 晚安"
];

interface OasisGalleryProps { isAdmin: boolean; }

const GithubIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[14px] h-[14px]"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>);
const MailIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[14px] h-[14px]"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>);
const DiscIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 animate-[spin_4s_linear_infinite]"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>);

export const OasisGallery: React.FC<OasisGalleryProps> = ({ isAdmin }) => {
  const { posts, plantSeed, updateSeed, uprootSeed, syncToCloud } = useGarden();
  // ☁️ 本地 → 云端一键迁移状态：idle / syncing / 结果文案
  const [syncState, setSyncState] = useState<'idle' | 'syncing'>('idle');
  const [syncMsg, setSyncMsg] = useState('');
  const handleSyncToCloud = async () => {
    if (syncState === 'syncing') return;
    setSyncState('syncing'); setSyncMsg('');
    try {
      const { count } = await syncToCloud();
      setSyncMsg(count ? `已同步 ${count} 篇到云端 ✓` : '本地暂无文章');
    } catch {
      setSyncMsg('同步失败 · 请先建表并登录');
    } finally {
      setSyncState('idle');
      setTimeout(() => setSyncMsg(''), 3200);
    }
  };
  const [activePost, setActivePost] = useState<BlogPost | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<PostType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editColor, setEditColor] = useState('#39C5BB');
  const [editType, setEditType] = useState<PostType>('thought');

  // 🎨 模板系统：默认骨架 + 可自定义覆盖，切换类型绝不吞掉已写内容
  const [customTemplates, setCustomTemplates] = useState<Partial<Record<PostType, string>>>(loadCustomTemplates);
  const [templateMsg, setTemplateMsg] = useState('');
  const templateMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getTemplate = (t: PostType) => customTemplates[t] ?? DEFAULT_TEMPLATES[t];
  const flashTemplateMsg = (msg: string) => {
    setTemplateMsg(msg);
    if (templateMsgTimer.current) clearTimeout(templateMsgTimer.current);
    templateMsgTimer.current = setTimeout(() => setTemplateMsg(''), 2400);
  };
  const persistTemplates = (next: Partial<Record<PostType, string>>) => {
    setCustomTemplates(next);
    localStorage.setItem(TEMPLATE_STORE_KEY, JSON.stringify(next));
  };

  // 切换类型：仅当内容为空或仍是未动过的模板时才替换，已写内容原样保留
  const handleTypeSwitch = (t: PostType) => {
    const pristine = !editContent.trim() || POST_TYPES.some(pt => editContent === getTemplate(pt.id) && getTemplate(pt.id));
    setEditType(t);
    if (!editingId && pristine && editContent !== getTemplate(t)) setEditContent(getTemplate(t));
  };

  // ✍️ Markdown 格式工具栏：选中文字 → 包裹语法；无选区 → 插入占位并选中
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const applyFormat = (before: string, after: string = before, placeholder = '') => {
    const ta = editorRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const sel = editContent.slice(s, e) || placeholder;
    const next = editContent.slice(0, s) + before + sel + after + editContent.slice(e);
    setEditContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  };
  const applyLinePrefix = (prefix: string) => {
    const ta = editorRef.current;
    if (!ta) return;
    const { selectionStart: s } = ta;
    const lineStart = editContent.lastIndexOf('\n', s - 1) + 1;
    const next = editContent.slice(0, lineStart) + prefix + editContent.slice(lineStart);
    setEditContent(next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + prefix.length, s + prefix.length); });
  };

  const FORMAT_TOOLS: { label: string; title: string; run: () => void }[] = [
    { label: 'B', title: '粗体 **text**', run: () => applyFormat('**', '**', 'bold') },
    { label: 'i', title: '斜体 *text*', run: () => applyFormat('*', '*', 'italic') },
    { label: 'S̶', title: '删除线 ~~text~~', run: () => applyFormat('~~', '~~', 'strike') },
    { label: 'H', title: '标题 ## ', run: () => applyLinePrefix('## ') },
    { label: '❝', title: '引用 > ', run: () => applyLinePrefix('> ') },
    { label: '•', title: '列表 - ', run: () => applyLinePrefix('- ') },
    { label: '☑', title: '任务 - [ ] ', run: () => applyLinePrefix('- [ ] ') },
    { label: '</>', title: '行内代码 `code`', run: () => applyFormat('`', '`', 'code') },
    { label: '{ }', title: '代码块 ```', run: () => applyFormat('\n```\n', '\n```\n', 'code') },
    { label: '🔗', title: '链接 [text](url)', run: () => applyFormat('[', '](https://)', 'text') },
    { label: '🖼', title: '图片 ![alt](url)', run: () => applyFormat('![', '](/img/picture.jpg)', 'alt') },
    { label: '—', title: '分割线', run: () => applyLinePrefix('\n---\n') },
  ];

  const insertTemplate = () => {
    const tpl = getTemplate(editType);
    if (!tpl) return;
    setEditContent(prev => prev.trim() ? `${prev.replace(/\s+$/, '')}\n\n${tpl}` : tpl);
  };

  const saveAsTemplate = () => {
    if (!editContent.trim()) return;
    persistTemplates({ ...customTemplates, [editType]: editContent });
    flashTemplateMsg(`已存为「${TYPE_MAP[editType]?.zh}」模板 ✓`);
  };

  const resetTemplate = () => {
    const next = { ...customTemplates };
    delete next[editType];
    persistTemplates(next);
    flashTemplateMsg('已还原默认模板');
  };

  const { resonances, leaveResonance, replyResonance, purifyResonance } = usePostResonance(activePost ? activePost.id : null);
  const [resAuthor, setResAuthor] = useState('');
  const [resContent, setResContent] = useState('');
  const [resColor, setResColor] = useState('#39C5BB');
  const [isResFocused, setIsResFocused] = useState(false);
  const [isResSubmitting, setIsResSubmitting] = useState(false);

  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState('');

  const [showProfile, setShowProfile] = useState(false);

  // 📖 阅读舱滚动进度：顶部细丝随阅读推进
  const readerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: readerRef });
  const readingProgress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });

  const { playlist, switchTrack } = useSoundscape();
  const dailyIndex = useMemo(() => Math.floor(Date.now() / (1000 * 60 * 60 * 24)), []);
  const dailyQuote = useMemo(() => DAILY_QUOTES[dailyIndex % DAILY_QUOTES.length], [dailyIndex]);
  const dailyTrack = useMemo(() => playlist[dailyIndex % playlist.length], [dailyIndex, playlist]);

  useEffect(() => {
    setResContent(''); setResAuthor(''); setIsResFocused(false); setReplyingToId(null); setReplyInput('');
  }, [activePost?.id]);

  const allTags = useMemo(() => {
    const tags = new Set<string>(); posts.forEach(p => p.tags.forEach(t => tags.add(t))); return Array.from(tags).sort();
  }, [posts]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    posts.forEach(p => { counts[p.type] = (counts[p.type] || 0) + 1; });
    return counts;
  }, [posts]);

  const filteredPosts = useMemo(() => posts.filter(post => {
    const matchType = selectedType ? post.type === selectedType : true;
    const matchTag = selectedTag ? post.tags.includes(selectedTag) : true;
    const matchSearch = searchQuery ? (post.title.toLowerCase().includes(searchQuery.toLowerCase()) || post.excerpt.toLowerCase().includes(searchQuery.toLowerCase())) : true;
    return matchType && matchTag && matchSearch;
  }), [selectedType, selectedTag, searchQuery, posts]);

  // 📅 按月归档：周报 / 成长记录的时间叙事更清晰
  const groupedPosts = useMemo(() => {
    const groups: { key: string; label: string; posts: BlogPost[] }[] = [];
    filteredPosts.forEach(post => {
      const d = new Date(post.createdAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      let g = groups.find(x => x.key === key);
      if (!g) { g = { key, label, posts: [] }; groups.push(g); }
      g.posts.push(post);
    });
    return groups;
  }, [filteredPosts]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { 
      if (e.key === 'Escape') { setActivePost(null); setIsEditing(false); setShowProfile(false); } 
    };
    window.addEventListener('keydown', handleEsc); return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleResSubmit = async () => {
    if (!resAuthor.trim() || !resContent.trim() || isResSubmitting) return;
    setIsResSubmitting(true);
    try {
      await leaveResonance(resAuthor, resContent, resColor);
      setResContent(''); setResAuthor(''); setIsResFocused(false);
    } finally {
      setIsResSubmitting(false);
    }
  };

  const handleReplySubmit = async (id: string) => {
    if (!replyInput.trim()) return;
    await replyResonance(id, replyInput);
    setReplyingToId(null); setReplyInput('');
  };

  const startEditingPost = (post: BlogPost) => {
    setEditingId(post.id); setEditTitle(post.title); setEditTags(post.tags.join(', ')); setEditColor(post.color); setEditContent(post.content); setEditType(post.type);
    setIsPreviewMode(false); setActivePost(null); setIsEditing(true);
  };

  const startNewPost = () => {
    const initialType = selectedType ?? 'thought';
    setEditingId(null); setEditTitle(''); setEditTags(''); setEditContent(getTemplate(initialType)); setEditColor('#39C5BB'); setEditType(initialType);
    setIsPreviewMode(false); setIsEditing(true);
  };

  const handlePublish = () => {
    if (!editContent.trim()) return;
    const tagArray = editTags.split(',').map(t => t.trim()).filter(Boolean);
    if (editingId) updateSeed(editingId, editTitle, tagArray, editColor, editContent, editType); else plantSeed(editTitle, tagArray, editColor, editContent, editType);
    setIsEditing(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to uproot this thought?')) { uprootSeed(id); setActivePost(null); }
  };

  return (
    <motion.div className="absolute inset-0 w-full h-full overflow-hidden flex" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.5 }}>
      
      {/* 🌲 左侧策展人名片面板 */}
      <AnimatePresence>
        {!isEditing && (
          <motion.div className="hidden lg:flex w-1/3 h-full flex-col justify-center items-center px-10 relative z-20 transition-colors duration-[1500ms] ease-in-out" initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50, filter: 'blur(10px)' }} transition={{ type: "spring", stiffness: 260, damping: 30 }}>
            {/* 右缘渐变细线：列分隔，向上下自然淡出 */}
            <div className="absolute top-0 right-0 h-full w-px bg-gradient-to-b from-transparent via-slate-300/40 dark:via-white/10 to-transparent pointer-events-none" />

            {/* 🪪 紧凑居中的磨砂名片：卡片刚好包住内容，垂直居中、节奏紧致，不再松散空旷 */}
            <div className="relative w-full max-w-[340px] flex flex-col items-center text-center rounded-[2.25rem] px-9 pt-11 pb-9 bg-white/55 dark:bg-white/[0.04] backdrop-blur-2xl border border-white/60 dark:border-white/[0.07] shadow-[0_30px_80px_-44px_rgba(15,23,42,0.3)] dark:shadow-[0_30px_80px_-44px_rgba(0,0,0,0.75)] overflow-hidden transition-colors duration-[1500ms]">
              {/* 卡内柔光：teal → sakura 一抹氛围 */}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-52 h-52 rounded-full bg-[#39C5BB]/20 dark:bg-[#39C5BB]/14 blur-[70px] pointer-events-none" />
              <div className="absolute top-24 -right-6 w-40 h-40 rounded-full bg-[#FFB7C5]/16 dark:bg-[#FFB7C5]/10 blur-[70px] pointer-events-none" />

              <div className="relative z-10 flex flex-col items-center w-full">
                {/* 头像 */}
                <motion.div
                  className="relative w-[88px] h-[88px] mb-6 group cursor-pointer"
                  onClick={() => setShowProfile(true)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <div className="absolute inset-0 rounded-full bg-[#39C5BB] blur-xl opacity-25 group-hover:opacity-60 transition-opacity duration-1000" />
                  <div className="relative w-full h-full rounded-full border border-white/60 dark:border-white/10 overflow-hidden shadow-xl bg-white/10 dark:bg-white/5 backdrop-blur-md transition-colors duration-[1500ms] ease-in-out">
                    <img src="/avatar.jpg" alt="Curator" className="w-full h-full object-cover opacity-85 mix-blend-luminosity group-hover:mix-blend-normal transition-all duration-1000" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  </div>
                </motion.div>

                {/* 名字 */}
                <h1 className="font-serif text-[2.4rem] leading-none text-slate-700 dark:text-slate-100 mb-3.5 tracking-wide transition-colors duration-[1500ms] ease-in-out">Bob Lee</h1>

                {/* 身份：两行 */}
                <div className="flex flex-col items-center gap-1.5 mb-6 font-mono text-[10px] tracking-[0.2em] uppercase">
                  <span className="text-[#39C5BB]">Full-Stack Craftsman</span>
                  <span className="text-slate-400 dark:text-slate-500">CS · UNSW · Sydney</span>
                </div>

                {/* 签名 */}
                <p className="font-serif italic text-slate-600/90 dark:text-slate-300 text-sm leading-relaxed mb-6 transition-colors duration-[1500ms] ease-in-out">“Exploring the intersection of human behavior, aesthetics &amp; software architecture.”</p>

                {/* 兴趣标签：柔和无框小胶囊 */}
                <div className="flex flex-wrap justify-center gap-1.5 mb-7">
                  {['C++', 'AI', 'Claude', '初音ミク❤'].map(tag => (
                    <span key={tag} className="font-mono text-[9px] tracking-[0.12em] px-2.5 py-1 rounded-full bg-slate-500/[0.07] dark:bg-white/[0.05] text-slate-500 dark:text-slate-400 transition-colors duration-[1500ms]">{tag}</span>
                  ))}
                </div>

                {/* 分割线 */}
                <span className="w-10 h-px bg-slate-300/60 dark:bg-white/10 mb-6 transition-colors duration-[1500ms]" />

                {/* Today's Resonance */}
                <div className="font-mono text-[9px] tracking-[0.25em] text-slate-400 dark:text-slate-500 uppercase mb-3 transition-colors duration-[1500ms]">Today's Resonance</div>
                <p className="font-serif text-xs leading-[1.75] text-slate-600 dark:text-slate-300 italic mb-3.5 transition-colors duration-[1500ms] ease-in-out">“{dailyQuote}”</p>
                <div className="flex items-center justify-center gap-2.5 mb-7 text-slate-400/80 dark:text-slate-400/60 hover:text-[#39C5BB] dark:hover:text-[#39C5BB] transition-colors cursor-pointer group max-w-full pointer-events-auto" onClick={() => switchTrack(dailyTrack)}>
                  <span className="text-[#39C5BB]/60 group-hover:text-[#39C5BB] transition-colors shrink-0"><DiscIcon /></span>
                  <span className="font-mono text-[10px] tracking-wider truncate transition-colors dark:text-slate-400">{dailyTrack.title} <span className="opacity-50">- {dailyTrack.artist}</span></span>
                </div>

                {/* 链接 */}
                <div className="flex gap-8 pointer-events-auto">
                  <a href="https://github.com/lb15058460816-tech" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-slate-400/80 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"><GithubIcon/> <span className="font-mono text-[10px] tracking-[0.2em] uppercase">GitHub</span></a>
                  <a href="mailto:lb15058460816@gmail.com" className="flex items-center gap-2 text-slate-400/80 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"><MailIcon/> <span className="font-mono text-[10px] tracking-[0.2em] uppercase">Mail</span></a>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 🖼️ 右侧基础内容画廊区 */}
      <motion.div className="w-full h-full overflow-y-auto no-scrollbar pt-24 pb-32 px-8 lg:px-16 relative z-10 flex flex-col" animate={{ width: isEditing ? '100%' : '66.666%' }} transition={{ type: "spring", stiffness: 260, damping: 30 }}>
        <AnimatePresence mode="wait">
          {!isEditing ? (
            <motion.div key="gallery" className="w-full h-full flex flex-col" exit={{ opacity: 0 }}>
              {/* 📰 栏目报头：与左栏头像同高起步、居中，让两侧基线与对齐方式一致 */}
              <div className="mb-9 text-center">
                <div className="font-mono text-[9px] tracking-[0.5em] uppercase text-[#39C5BB]/70 mb-3">The Garden · 数字花园</div>
                <h1 className="font-serif text-4xl text-slate-700 dark:text-slate-100 tracking-wide transition-colors duration-[1500ms] ease-in-out">Curated Thoughts</h1>
                <p className="font-serif italic text-slate-400 dark:text-slate-500 text-sm mt-2.5 transition-colors duration-[1500ms] ease-in-out">A quiet record of learning, growth &amp; small wonders.</p>
              </div>

              <div className="flex flex-col gap-6 mb-10">
                <div className="flex items-center justify-between">
                  <div className="relative w-64 group">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 opacity-50 group-hover:opacity-100 transition-opacity"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg></span>
                    {/* ✨ 优化输入框：夜间高对比高透玻璃态 */}
                    <input type="text" placeholder="Search thoughts..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white/40 dark:bg-white/5 border border-slate-300/30 dark:border-white/10 text-slate-600 dark:text-slate-200 font-serif text-sm rounded-full py-1.5 pl-9 pr-4 outline-none focus:border-slate-400/60 dark:focus:border-white/30 focus:bg-white/60 dark:focus:bg-white/10 backdrop-blur-sm transition-colors duration-[1500ms] ease-in-out placeholder:text-slate-400/50 dark:placeholder:text-slate-500" />
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-3">
                      <AnimatePresence>
                        {syncMsg && <motion.span initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="font-mono text-[9px] tracking-wider text-[#39C5BB] normal-case">{syncMsg}</motion.span>}
                      </AnimatePresence>
                      <button onClick={handleSyncToCloud} disabled={syncState === 'syncing'} title="把本地全部文章一键同步到 Supabase 云端" className="font-mono text-[10px] tracking-widest uppercase px-4 py-1.5 rounded-full border border-slate-300/60 dark:border-white/15 text-slate-500 dark:text-slate-300 hover:border-[#39C5BB]/50 hover:text-[#39C5BB] transition-all duration-300 disabled:opacity-40">{syncState === 'syncing' ? '[ ☁ … ]' : '[ ☁ Sync ]'}</button>
                      <button onClick={startNewPost} className="font-mono text-[10px] tracking-widest uppercase px-4 py-1.5 rounded-full border border-[#39C5BB]/50 text-[#39C5BB] hover:bg-[#39C5BB] hover:text-white transition-all duration-300">[ + Seed ]</button>
                    </div>
                  )}
                </div>

                {/* 🌱 类型过滤：周报 / 学习笔记 / 成长 / 随笔 —— 书写用途的主导维度 */}
                <div className="flex flex-wrap gap-2.5">
                  <button onClick={() => setSelectedType(null)} className={`flex items-center gap-2 font-mono text-[10px] tracking-[0.15em] uppercase px-4 py-2 rounded-full border transition-all duration-500 ${!selectedType ? 'bg-slate-700 dark:bg-white/15 text-white border-slate-700 dark:border-white/25 shadow-sm' : 'bg-transparent text-slate-500 dark:text-slate-400 border-slate-300/50 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/25'}`}>
                    All <span className="opacity-50 tracking-normal">{posts.length}</span>
                  </button>
                  {POST_TYPES.map(t => {
                    const active = selectedType === t.id;
                    const count = typeCounts[t.id] || 0;
                    return (
                      <button key={t.id} onClick={() => setSelectedType(active ? null : t.id)} title={t.zh}
                        className={`flex items-center gap-2 font-mono text-[10px] tracking-[0.15em] uppercase px-4 py-2 rounded-full border transition-all duration-500 ${active ? 'text-white border-transparent shadow-sm' : 'bg-transparent text-slate-500 dark:text-slate-400 border-slate-300/50 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/25'}`}
                        style={active ? { backgroundColor: t.color, boxShadow: `0 4px 16px ${t.color}40` } : undefined}>
                        <span className="w-3.5 h-3.5" style={{ color: active ? '#fff' : t.color }}>{TypeIcons[t.id]}</span>
                        {t.label} <span className="opacity-60 tracking-normal">{count}</span>
                      </button>
                    );
                  })}
                </div>

                {/* 自由标签：次级筛选维度 */}
                {allTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setSelectedTag(null)} className={`font-mono text-[9px] tracking-widest uppercase px-3 py-1 rounded-full border transition-colors duration-500 ${!selectedTag ? 'bg-slate-600/80 dark:bg-white/15 text-white border-transparent' : 'bg-transparent text-slate-400 dark:text-slate-500 border-slate-300/40 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/25'}`}># all</button>
                    {allTags.map(tag => (
                      <button key={tag} onClick={() => setSelectedTag(selectedTag === tag ? null : tag)} className={`font-mono text-[9px] tracking-widest uppercase px-3 py-1 rounded-full border transition-colors duration-500 ${selectedTag === tag ? 'bg-slate-600/80 dark:bg-white/15 text-white border-transparent' : 'bg-transparent text-slate-400 dark:text-slate-500 border-slate-300/40 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/25'}`}>#{tag}</button>
                    ))}
                  </div>
                )}
              </div>

              {/* 📅 按月归档的瀑布流：让周报与成长有清晰的时间叙事 */}
              <div className="flex flex-col gap-12">
                <AnimatePresence mode="popLayout">
                  {groupedPosts.map(group => (
                    <motion.section key={group.key} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <div className="flex items-center gap-4 mb-6">
                        <span className="font-mono text-[10px] tracking-[0.35em] uppercase text-slate-400 dark:text-slate-500 whitespace-nowrap">{group.label}</span>
                        <span className="h-px flex-1 bg-gradient-to-r from-slate-300/50 dark:from-white/10 to-transparent" />
                        <span className="font-mono text-[9px] text-slate-300 dark:text-slate-600">{group.posts.length}</span>
                      </div>

                      <div className="columns-1 xl:columns-2 gap-8 space-y-8">
                        {group.posts.map((post) => {
                          const meta = TYPE_MAP[post.type];
                          return (
                            // ✨ 优化卡片背景：夜间采用纯白微透明度，透出深色星河底色，绝对不会发黑模糊
                            <motion.div key={post.id} className="break-inside-avoid relative rounded-3xl cursor-pointer overflow-hidden border border-white/40 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] hover:dark:bg-white/[0.08] transition-colors duration-[1500ms] ease-in-out" style={{ backdropFilter: `blur(12px)` }} initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: "spring", stiffness: 260, damping: 25 }} onClick={() => setActivePost(post)} whileHover={{ y: -6, scale: 1.02, boxShadow: `0 20px 40px rgba(0,0,0,0.05), 0 0 30px ${post.color}15` }} whileTap={{ scale: 0.96 }}>
                              <div className="h-28 w-full relative overflow-hidden">
                                {/* 情绪色柔渐变背景：替代空头图，给卡片质感与归属感 */}
                                <div className="absolute inset-0 transition-all duration-[1500ms] ease-in-out" style={{ background: `linear-gradient(135deg, ${post.color}29, ${post.color}0a 55%, transparent)` }} />
                                {/* 大类型图标水印：淡化的情绪色，去占位感 */}
                                <div className="absolute -right-3 -bottom-6 w-28 h-28 opacity-[0.13] dark:opacity-[0.16] pointer-events-none transition-opacity duration-[1500ms]" style={{ color: post.color }}>{TypeIcons[post.type]}</div>
                                {/* 类型徽章：左上角，图标 + 名称，染类型微光色 */}
                                <div className="absolute top-4 left-6 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 dark:bg-black/50 backdrop-blur-sm border border-white/60 dark:border-white/10" style={{ color: meta?.color }}>
                                  <span className="w-3 h-3">{TypeIcons[post.type]}</span>
                                  <span className="font-mono text-[8px] tracking-[0.2em] uppercase">{meta?.label}</span>
                                </div>
                                <div className="absolute bottom-4 left-6 flex space-x-2">{post.tags.slice(0, 3).map(tag => <span key={tag} className="font-mono text-[9px] tracking-widest text-slate-500 dark:text-slate-300 uppercase bg-white/60 dark:bg-black/60 px-2 py-1 rounded backdrop-blur-sm border border-white/50 dark:border-white/10 transition-colors duration-[1500ms] ease-in-out">{tag}</span>)}</div>
                              </div>
                              <div className="p-8">
                                <div className="font-mono text-[10px] tracking-[0.2em] text-slate-400 dark:text-slate-500 uppercase mb-4 flex items-center gap-2 transition-colors duration-[1500ms]"><span>{post.date}</span><span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span><span className="opacity-70">{calculateReadingTime(post.content)}</span></div>
                                <h2 className="font-serif text-xl md:text-2xl text-slate-700 dark:text-slate-100 leading-snug mb-4 transition-colors duration-[1500ms] ease-in-out">{post.title}</h2>
                                <p className="font-serif text-slate-600 dark:text-slate-300 text-sm leading-relaxed line-clamp-3 transition-colors duration-[1500ms] ease-in-out">{post.excerpt}</p>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </motion.section>
                  ))}
                </AnimatePresence>
                {filteredPosts.length === 0 && <div className="pt-20 text-center font-serif text-slate-400 dark:text-slate-600 italic">No thoughts found here yet — perhaps plant the first seed.</div>}
              </div>
            </motion.div>
          ) : (
            // --- 创作/编辑器区（不截断，完整实现） ---
            <motion.div key="editor" className="w-full max-w-3xl mx-auto flex flex-col h-full pt-10" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
               <div className="flex items-center justify-between mb-8">
                 <div className="flex bg-slate-200/50 dark:bg-slate-800/50 rounded-lg p-1 backdrop-blur-sm shadow-inner transition-colors duration-[1500ms] ease-in-out">
                   <button onClick={() => setIsPreviewMode(false)} className={`px-5 py-1.5 text-[10px] tracking-[0.2em] uppercase font-mono rounded-md transition-all duration-300 ${!isPreviewMode ? 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>Write</button>
                   <button onClick={() => setIsPreviewMode(true)} className={`px-5 py-1.5 text-[10px] tracking-[0.2em] uppercase font-mono rounded-md transition-all duration-300 ${isPreviewMode ? 'bg-white dark:bg-slate-700 text-[#39C5BB] shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>Preview</button>
                 </div>
                 <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
               </div>
               
               <input type="text" placeholder="Title..." value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full bg-transparent text-4xl md:text-5xl font-serif text-slate-700 dark:text-slate-200 mb-6 outline-none placeholder:text-slate-300 dark:placeholder:text-slate-700 transition-colors duration-[1500ms] ease-in-out" disabled={isPreviewMode} />

               {/* 🌱 类型选择：决定这篇属于周报 / 笔记 / 成长 / 随笔 */}
               <div className="flex flex-wrap items-center gap-2 mb-6" style={{ opacity: isPreviewMode ? 0.3 : 1, pointerEvents: isPreviewMode ? 'none' : 'auto' }}>
                 {POST_TYPES.map(t => {
                   const active = editType === t.id;
                   return (
                     <button key={t.id} onClick={() => handleTypeSwitch(t.id)} title={t.zh}
                       className={`flex items-center gap-2 font-mono text-[10px] tracking-[0.15em] uppercase px-4 py-2 rounded-full border transition-all duration-300 ${active ? 'text-white border-transparent' : 'text-slate-500 dark:text-slate-400 border-slate-300/50 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/25'}`}
                       style={active ? { backgroundColor: t.color, boxShadow: `0 4px 16px ${t.color}40` } : undefined}>
                       <span className="w-3.5 h-3.5" style={{ color: active ? '#fff' : t.color }}>{TypeIcons[t.id]}</span>
                       {t.label}<span className="opacity-60 normal-case tracking-normal">· {t.zh}</span>
                     </button>
                   );
                 })}
               </div>

               <div className="flex items-center space-x-6 mb-8 border-b border-slate-200 dark:border-white/10 pb-8 transition-all" style={{ opacity: isPreviewMode ? 0.3 : 1, pointerEvents: isPreviewMode ? 'none' : 'auto' }}>
                 <input type="text" placeholder="Tags (comma separated)" value={editTags} onChange={e => setEditTags(e.target.value)} className="flex-1 bg-transparent font-mono text-xs tracking-widest text-slate-500 dark:text-slate-400 outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600 uppercase transition-colors" />
                 <div className="flex items-center space-x-2">
                   {AURA_COLORS.map(c => <div key={c} onClick={() => setEditColor(c)} className={`w-4 h-4 rounded-full cursor-pointer transition-transform ${editColor === c ? 'scale-125' : 'opacity-40 hover:opacity-100'}`} style={{ backgroundColor: c, boxShadow: editColor === c ? `0 0 0 2px transparent, 0 0 0 4px ${c}` : 'none' }} />)}
                 </div>
               </div>

               {isPreviewMode ? (
                 <div className="flex-1 w-full overflow-y-auto no-scrollbar mb-8">
                   {editContent.trim() ? <Markdown>{editContent}</Markdown> : <div className="text-slate-300 dark:text-slate-600 italic text-center mt-20">No content to preview...</div>}
                 </div>
               ) : (
                 <>
                   {/* 🎨 模板工具条：插入 / 存为自定义 / 还原默认，互不破坏已写内容 */}
                   <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 font-mono text-[9px] tracking-[0.18em] uppercase">
                     <span className="text-slate-300 dark:text-slate-600 select-none">Template ·</span>
                     {getTemplate(editType) && (
                       <button onClick={insertTemplate} title={`把「${TYPE_MAP[editType]?.zh}」的写作骨架追加到正文`} className="text-slate-400 dark:text-slate-500 hover:text-[#39C5BB] transition-colors">+ Insert 插入骨架</button>
                     )}
                     <button onClick={saveAsTemplate} disabled={!editContent.trim()} className="text-slate-400 dark:text-slate-500 hover:text-[#39C5BB] transition-colors disabled:opacity-30 disabled:hover:text-slate-400">Save As 存为模板</button>
                     {customTemplates[editType] != null && (
                       <button onClick={resetTemplate} className="text-slate-400 dark:text-slate-500 hover:text-[#FFB7C5] transition-colors">Reset 还原默认</button>
                     )}
                     <AnimatePresence>
                       {templateMsg && (
                         <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-[#39C5BB] normal-case tracking-normal">{templateMsg}</motion.span>
                       )}
                     </AnimatePresence>
                   </div>
                   {/* ✍️ Markdown 格式工具栏：选中文字点按钮即插入对应语法 */}
                   <div className="flex flex-wrap items-center gap-1 mb-3 pb-3 border-b border-slate-200/60 dark:border-white/5">
                     {FORMAT_TOOLS.map(t => (
                       <button key={t.label} type="button" onClick={t.run} title={t.title}
                         className="min-w-[30px] h-7 px-2 flex items-center justify-center font-mono text-[12px] rounded-md text-slate-500 dark:text-slate-400 hover:bg-[#39C5BB]/10 hover:text-[#39C5BB] transition-colors">
                         {t.label}
                       </button>
                     ))}
                     <span className="ml-auto font-mono text-[9px] tracking-widest text-slate-300 dark:text-slate-600 uppercase">Markdown · GFM · 表格/代码/任务</span>
                   </div>
                   <textarea ref={editorRef} value={editContent} onChange={e => setEditContent(e.target.value)} placeholder="Let your thoughts flow..." className="flex-1 w-full bg-transparent font-serif text-lg leading-loose text-slate-600 dark:text-slate-300 outline-none resize-none placeholder:text-slate-300/50 dark:placeholder:text-slate-700 no-scrollbar mb-8 transition-colors duration-[1500ms] ease-in-out" />
                 </>
               )}
               
               <div className="flex justify-end mt-auto">
                 <button onClick={handlePublish} className="font-mono text-xs tracking-widest uppercase px-8 py-3 rounded-full text-white shadow-lg hover:shadow-xl transition-all duration-300" style={{ backgroundColor: editColor }}>{editingId ? 'Update' : 'Publish'}</button>
               </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 📖 沉浸式全屏独立阅读舱 */}
      <AnimatePresence>
        {activePost && !isEditing && (
          <motion.div
            key="reader-overlay"
            ref={readerRef}
            // ✨ 核心修复一：强制将背景色在日夜间与最外层壳体同步，拒绝卡顿断层
            className="fixed inset-0 z-[100] overflow-y-auto no-scrollbar bg-[#F8FAFC] dark:bg-[#0A0F1D] transition-colors duration-[1500ms] ease-in-out"
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40, filter: 'blur(10px)' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* 📖 顶部阅读进度细丝，染当前文章情绪色 */}
            <motion.div
              className="fixed top-0 left-0 right-0 h-[2px] z-[160] origin-left"
              style={{ scaleX: readingProgress, backgroundColor: activePost.color, boxShadow: `0 0 10px ${activePost.color}` }}
            />
            <div className="min-h-screen w-full flex flex-col items-center">
              
              <div className="absolute top-0 left-0 w-full h-96 overflow-hidden pointer-events-none">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.2 }} className="absolute -top-32 -left-32 w-96 h-96 rounded-full blur-[100px] dark:opacity-10 transition-opacity duration-[1500ms] ease-in-out" style={{ backgroundColor: activePost.color }} transition={{ duration: 1 }} />
              </div>

              <div className="relative w-full max-w-3xl px-8 md:px-12 pt-24 pb-64">
                
                <div className="flex justify-end items-center space-x-6 mb-12 font-mono text-[10px] tracking-widest uppercase">
                  {isAdmin && <button onClick={() => activePost && startEditingPost(activePost)} className="text-slate-400 dark:text-slate-500 hover:text-[#39C5BB] transition-colors">Edit</button>}
                  {isAdmin && <button onClick={() => activePost && handleDelete(activePost.id)} className="text-slate-400 dark:text-slate-500 hover:text-red-400 transition-colors">Destroy</button>}
                  <button onClick={() => setActivePost(null)} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors ml-4 p-2 -mr-2 bg-white/50 dark:bg-white/5 rounded-full border border-slate-200/50 dark:border-white/10 shadow-sm hover:bg-white dark:hover:bg-white/10"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
                </div>

                <div className="font-mono text-xs tracking-[0.3em] text-slate-400 dark:text-slate-500 uppercase mb-8 flex items-center gap-3 flex-wrap transition-colors duration-[1500ms]">
                  {TYPE_MAP[activePost.type] && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border" style={{ color: TYPE_MAP[activePost.type].color, borderColor: `${TYPE_MAP[activePost.type].color}40`, backgroundColor: `${TYPE_MAP[activePost.type].color}10` }}>
                      <span className="w-3 h-3">{TypeIcons[activePost.type]}</span>{TYPE_MAP[activePost.type].label}
                    </span>
                  )}
                  <span>{activePost.date}</span><span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span><span className="opacity-70">{calculateReadingTime(activePost.content)}</span>
                </div>
                
                <h1 className="font-serif text-4xl md:text-5xl text-slate-800 dark:text-slate-100 leading-[1.3] mb-8 transition-colors duration-[1500ms] ease-in-out">{activePost.title}</h1>
                
                <div className="flex space-x-4 mb-16">
                  {activePost.tags.map(tag => <span key={tag} className="font-mono text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase border-b border-slate-300 dark:border-white/10 pb-1 transition-colors duration-[1500ms]">{tag}</span>)}
                </div>

                {/* ✨ 核心修复四：强力介入并定义 Markdown 的全级夜间排版字色，保证多层嵌套下渲染坚固不丢失 */}
                <Markdown className={`${PROSE_CLASS} leading-[2.2] prose-img:my-12 prose-headings:scroll-mt-24 transition-colors duration-[1500ms] ease-in-out`}>{activePost.content}</Markdown>

                {/* 🍂 Fallen Leaves 评论交互区 */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 1 }} className="mt-24 pt-16 border-t border-slate-200/50 dark:border-white/10 transition-colors duration-[1500ms]">
                  <h3 className="font-serif text-2xl text-slate-400 dark:text-slate-500 mb-8 italic transition-colors">Fallen Leaves</h3>
                  
                  <div className="flex flex-col gap-6 mb-16">
                    {resonances.map(res => (
                      // ✨ 优化评论底色：夜间改用微透明白色玻璃，防止糊黑
                      <div key={res.id} className="relative group px-6 py-5 bg-white/60 dark:bg-white/5 backdrop-blur-md border border-slate-200/50 dark:border-white/10 transition-colors duration-[1500ms]"
                            style={{ borderTopRightRadius: '1.5rem', borderBottomLeftRadius: '1.5rem', borderTopLeftRadius: '0.5rem', borderBottomRightRadius: '0.5rem', boxShadow: `0 4px 20px -5px ${res.aura_color}10` }}>
                        
                        <div className="flex items-center space-x-3 mb-3">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: res.aura_color }} />
                          <span className="font-mono text-[10px] tracking-widest uppercase text-slate-500 dark:text-slate-300">{res.author_name}</span>
                          <span className="font-mono text-[9px] text-slate-400/60 dark:text-slate-500/80 ml-auto">
                            {new Date(res.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="font-serif text-slate-700 dark:text-slate-200 text-sm leading-relaxed transition-colors duration-[1500ms]">{res.content}</p>

                        {/* 回复呈现 */}
                        {res.reply && (
                          <div className="mt-5 pt-4 border-t border-slate-200/50 dark:border-white/10 border-dashed transition-colors duration-[1500ms]">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-4 h-4 rounded-full overflow-hidden border border-[#39C5BB]/30"><img src="/avatar.jpg" alt="Bob" className="w-full h-full object-cover"/></div>
                              <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[#39C5BB]">Bob Lee</span>
                            </div>
                            <p className="font-serif text-slate-500 dark:text-slate-400 text-sm leading-[1.8] italic pl-5 border-l-2 border-[#39C5BB]/30 transition-colors duration-[1500ms]">
                              "{res.reply}"
                            </p>
                          </div>
                        )}

                        {/* Admin 动作面板 */}
                        {isAdmin && (
                          <div className="absolute top-5 right-5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-3 bg-white/80 dark:bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200/50 dark:border-white/10">
                            <button onClick={() => setReplyingToId(replyingToId === res.id ? null : res.id)} className="font-mono text-[9px] tracking-widest uppercase text-[#39C5BB] hover:text-[#2da098] transition-colors">Echo</button>
                            <button onClick={() => purifyResonance(res.id)} className="font-mono text-[9px] tracking-widest uppercase text-red-400 hover:text-red-500 transition-colors">Purify</button>
                          </div>
                        )}

                        <AnimatePresence>
                          {isAdmin && replyingToId === res.id && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-4 overflow-hidden">
                              <textarea 
                                autoFocus placeholder="Whisper back..." value={replyInput} onChange={e => setReplyInput(e.target.value)} 
                                className="w-full bg-white/80 dark:bg-white/5 font-serif text-slate-700 dark:text-slate-200 text-sm p-3 rounded-xl outline-none border border-slate-200/80 dark:border-white/10 resize-none h-20 placeholder:text-slate-400 mb-2 focus:border-[#39C5BB]/50 transition-colors shadow-inner"
                              />
                              <div className="flex justify-end gap-3">
                                <button onClick={() => { setReplyingToId(null); setReplyInput(''); }} className="font-mono text-[9px] uppercase tracking-widest text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 transition-colors">Cancel</button>
                                <button onClick={() => handleReplySubmit(res.id)} className="font-mono text-[9px] uppercase tracking-widest text-white bg-[#39C5BB] px-4 py-1.5 rounded-full shadow-sm hover:bg-[#2da098] transition-colors">Send</button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                      </div>
                    ))}
                    {resonances.length === 0 && <span className="font-serif italic text-slate-400 dark:text-slate-600 text-sm pl-2 transition-colors">Quietly waiting for a breeze...</span>}
                  </div>
                </motion.div>
              </div>
            </div>

            {/* 底部悬浮输入激活胶囊 */}
            <motion.div 
              className="fixed bottom-10 left-1/2 -translate-x-1/2 w-[90vw] max-w-2xl z-[150]"
              initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
              transition={{ delay: 0.8, duration: 0.6, type: "spring", stiffness: 200, damping: 25 }}
            >
              <div 
                className="bg-white/80 dark:bg-[#111827]/80 backdrop-blur-3xl border border-white dark:border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.05)] dark:shadow-[0_20px_40px_rgba(0,0,0,0.4)] p-4 transition-all duration-[1500ms] overflow-hidden" 
                style={{ borderRadius: isResFocused ? '2rem' : '3rem', borderColor: isResFocused ? `${resColor}40` : '' }}
              >
                {!isResFocused ? (
                  <input type="text" placeholder="Leave a falling leaf..." onClick={() => setIsResFocused(true)} readOnly className="w-full bg-transparent font-serif text-slate-500 dark:text-slate-400 outline-none cursor-pointer italic text-center transition-colors duration-[1500ms]" />
                ) : (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex flex-col px-2">
                    <input type="text" placeholder="Your Alias..." value={resAuthor} onChange={e => setResAuthor(e.target.value)} maxLength={20} className="bg-transparent border-b border-slate-200/80 dark:border-white/10 font-mono text-xs text-slate-700 dark:text-slate-200 pb-2 mb-4 outline-none focus:border-slate-400 dark:focus:border-[#39C5BB]/50 transition-colors placeholder:text-slate-400" />
                    <textarea placeholder="The leaf falls..." value={resContent} onChange={e => setResContent(e.target.value)} maxLength={150} className="bg-transparent font-serif text-slate-700 dark:text-slate-200 h-20 outline-none resize-none mb-4 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors" />
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex space-x-2">
                        {AURA_COLORS.map(c => <div key={c} onClick={() => setResColor(c)} className={`w-3.5 h-3.5 rounded-full cursor-pointer transition-transform ${resColor === c ? 'scale-125' : 'opacity-40 hover:opacity-100'}`} style={{ backgroundColor: c, boxShadow: resColor === c ? `0 0 0 2px transparent, 0 0 0 3px ${c}` : 'none' }} />)}
                      </div>
                      <div className="flex space-x-4">
                        <button onClick={() => setIsResFocused(false)} className="font-mono text-[10px] tracking-widest uppercase text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">Cancel</button>
                        <button onClick={handleResSubmit} disabled={!resAuthor.trim() || !resContent.trim() || isResSubmitting} className="font-mono text-[10px] tracking-widest uppercase px-6 py-2 rounded-full text-white transition-all disabled:opacity-30" style={{ backgroundColor: resColor, boxShadow: `0 4px 15px ${resColor}40` }}>{isResSubmitting ? '...' : 'Release'}</button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 个人全屏资料卡弹出层 */}
      <AnimatePresence>
        {showProfile && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-auto">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-md" onClick={() => setShowProfile(false)} />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="relative w-[90vw] max-w-md bg-white/80 dark:bg-[#111827]/90 backdrop-blur-3xl border border-white/50 dark:border-white/10 p-10 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col items-center text-center transition-colors duration-1000"
            >
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-[#39C5BB] rounded-full blur-[80px] opacity-30 dark:opacity-20 pointer-events-none transition-opacity duration-1000" />
              <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-[#FFB7C5] rounded-full blur-[80px] opacity-30 dark:opacity-20 pointer-events-none transition-opacity duration-1000" />

              <button onClick={() => setShowProfile(false)} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>

              <div className="w-28 h-28 rounded-full border-4 border-white dark:border-[#1F2937] shadow-xl overflow-hidden mb-6 z-10 transition-colors duration-1000">
                <img src="/avatar.jpg" alt="Bob Lee" className="w-full h-full object-cover" />
              </div>

              <h2 className="font-serif text-3xl text-slate-800 dark:text-slate-100 mb-2 z-10 transition-colors">Bob Lee</h2>
              <p className="font-mono text-xs tracking-[0.2em] text-[#39C5BB] uppercase mb-6 z-10">Full-Stack Craftsman</p>
              
              <p className="font-serif text-slate-600 dark:text-slate-300 leading-relaxed text-sm mb-8 z-10 px-4 transition-colors">
                A 19-year-old computer science undergraduate at UNSW-Sydney. Dedicated to building elegant architectures and non-competitive digital spaces.
              </p>

              <div className="flex flex-wrap justify-center gap-2 z-10">
                {['CPP', 'AI', 'Claude','Hatsune Miku❤️'].map(tag => (
                  <span key={tag} className="font-mono text-[9px] tracking-widest uppercase px-3 py-1.5 rounded-full border border-slate-300/60 dark:border-white/10 bg-white/60 dark:bg-white/5 text-slate-500 dark:text-slate-400 transition-colors duration-1000">
                    {tag}
                  </span>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
};