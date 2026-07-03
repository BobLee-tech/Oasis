// src/components/OasisGallery.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGarden, type BlogPost } from '../hooks/useGarden';
import { useCategories, CategoryIcon, ICON_NAMES } from '../hooks/useCategories';
import { Markdown, PROSE_CLASS } from './Markdown';
import { usePostResonance } from '../hooks/usePostResonance';
import { useSoundscape } from '../hooks/useSoundscape';
import { readingTimeLabel, readingMinutes, extractToc } from '../lib/reading';
import { ReaderProgress, ReaderToc, Lightbox } from './OasisReader';
import { useHashRoute } from '../lib/route';
import { termNoteOfDay, currentSolarTerm } from '../lib/solarTerms';
import { DAILY_QUOTES } from '../data/quotes';

const AURA_COLORS = ['#FFB7C5', '#FDBA74', '#FDE047', '#A7F3D0', '#39C5BB', '#60A5FA', '#A78BFA'];

// 📝 默认写作模板：内置类型的温柔骨架，可被自定义模板覆盖；自定义分类默认无骨架
const DEFAULT_TEMPLATES: Record<string, string> = {
  thought: '',
  weekly: '## 本周做了什么\n\n- \n\n## 学到了什么\n\n- \n\n## 遇到的困难\n\n- \n\n## 下周计划\n\n- \n\n## 一点心情\n\n> ',
  note: '## 核心概念\n\n\n\n## 关键点\n\n- \n\n## 代码 / 示例\n\n```\n\n```\n\n## 我的理解\n\n\n\n## 延伸与疑问\n\n- ',
  growth: '## 此刻的我\n\n\n\n## 一个微小的进步\n\n\n\n## 想对未来的自己说\n\n> ',
  project: '## 目标与背景\n\n\n\n## 方案与取舍\n\n- \n\n## 踩过的坑\n\n- \n\n## 复盘与下一步\n\n- ',
};

// 🎨 自定义模板：持久在 localStorage，按类型覆盖默认骨架
const TEMPLATE_STORE_KEY = 'oasis_custom_templates';
const loadCustomTemplates = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(TEMPLATE_STORE_KEY) || '{}'); } catch { return {}; }
};

// 💾 写作草稿：编辑中自动落盘，误触关闭 / 刷新都不会丢字
const DRAFT_KEY = 'oasis_editor_draft';
interface EditorDraft {
  editingId: string | null;
  title: string; tags: string[]; content: string; color: string; type: string;
  savedAt: number;
}
const readDraft = (): EditorDraft | null => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    return d && typeof d.content === 'string' ? d : null;
  } catch { return null; }
};

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
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [showTags, setShowTags] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  // ✍️ 编辑器三档视图：纯写 / 左写右读分屏 / 纯预览
  const [editorMode, setEditorMode] = useState<'write' | 'split' | 'preview'>('write');
  const isPreviewMode = editorMode === 'preview';
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTagList, setEditTagList] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editColor, setEditColor] = useState('#39C5BB');
  const [editType, setEditType] = useState<string>('thought');

  // 🏷️ 分类系统：内置 + 自定义，与知识星图共用一份数据
  const { categories, metaOf, addCategory, removeCategory } = useCategories();
  const [showCatForm, setShowCatForm] = useState(false);
  const [catLabel, setCatLabel] = useState('');
  const [catZh, setCatZh] = useState('');
  const [catColor, setCatColor] = useState(AURA_COLORS[4]);
  const [catIcon, setCatIcon] = useState(ICON_NAMES[5]);

  const handleCreateCategory = () => {
    if (!catLabel.trim() && !catZh.trim()) return;
    const cat = addCategory(catLabel || catZh, catZh || catLabel, catColor, catIcon);
    setEditType(cat.id);
    setShowCatForm(false); setCatLabel(''); setCatZh('');
  };

  // 🎨 模板系统：默认骨架 + 可自定义覆盖，切换类型绝不吞掉已写内容
  const [customTemplates, setCustomTemplates] = useState<Record<string, string>>(loadCustomTemplates);
  const [templateMsg, setTemplateMsg] = useState('');
  const templateMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getTemplate = (t: string) => customTemplates[t] ?? DEFAULT_TEMPLATES[t] ?? '';
  const flashTemplateMsg = (msg: string) => {
    setTemplateMsg(msg);
    if (templateMsgTimer.current) clearTimeout(templateMsgTimer.current);
    templateMsgTimer.current = setTimeout(() => setTemplateMsg(''), 2400);
  };
  const persistTemplates = (next: Record<string, string>) => {
    setCustomTemplates(next);
    localStorage.setItem(TEMPLATE_STORE_KEY, JSON.stringify(next));
  };

  // 切换类型：仅当内容为空或仍是未动过的模板时才替换，已写内容原样保留
  const handleTypeSwitch = (t: string) => {
    const pristine = !editContent.trim() || categories.some(c => editContent === getTemplate(c.id) && getTemplate(c.id));
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

  // ⌨️ 编辑器键盘增强：Cmd/Ctrl+B/I/K 格式化、Tab 缩进、回车自动接续列表
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = editorRef.current;
    if (!ta) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === 'b') { e.preventDefault(); applyFormat('**', '**', 'bold'); return; }
      if (key === 'i') { e.preventDefault(); applyFormat('*', '*', 'italic'); return; }
      if (key === 'k') { e.preventDefault(); applyFormat('[', '](https://)', 'text'); return; }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: end } = ta;
      setEditContent(editContent.slice(0, s) + '  ' + editContent.slice(end));
      requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + 2, s + 2); });
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      const { selectionStart: s } = ta;
      const lineStart = editContent.lastIndexOf('\n', s - 1) + 1;
      const line = editContent.slice(lineStart, s);
      const m = /^(\s*)(?:([-*])\s\[[ x]\]\s|([-*])\s|(\d+)\.\s)(.*)$/.exec(line);
      if (!m) return;
      e.preventDefault();
      const [, indent, task, bullet, num, rest] = m;
      // 空列表项再回车 → 结束列表（清掉本行前缀）
      if (!rest.trim()) {
        const next = editContent.slice(0, lineStart) + editContent.slice(s);
        setEditContent(next);
        requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(lineStart, lineStart); });
        return;
      }
      const prefix = task ? `${indent}${task} [ ] ` : bullet ? `${indent}${bullet} ` : `${indent}${Number(num) + 1}. `;
      const insert = '\n' + prefix;
      setEditContent(editContent.slice(0, s) + insert + editContent.slice(s));
      requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + insert.length, s + insert.length); });
    }
  };

  // 🏷️ 标签 chip 输入：回车/逗号成签，退格删最后一枚，下拉复用已有标签
  const commitTag = (raw: string) => {
    const t = raw.trim().replace(/,+$/, '');
    if (t && !editTagList.includes(t)) setEditTagList([...editTagList, t]);
    setTagInput('');
  };
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && !e.nativeEvent.isComposing) { e.preventDefault(); commitTag(tagInput); }
    else if (e.key === 'Backspace' && !tagInput && editTagList.length) setEditTagList(editTagList.slice(0, -1));
  };

  // 💾 草稿自动保存：编辑中 800ms 防抖落盘；发布 / 主动丢弃时清除
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [draftMsg, setDraftMsg] = useState('');
  useEffect(() => {
    if (!isEditing) return;
    const timer = setTimeout(() => {
      if (!editContent.trim() && !editTitle.trim()) return;
      const draft: EditorDraft = { editingId, title: editTitle, tags: editTagList, content: editContent, color: editColor, type: editType, savedAt: Date.now() };
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); setDraftSavedAt(draft.savedAt); } catch { /* ignore */ }
    }, 800);
    return () => clearTimeout(timer);
  }, [isEditing, editingId, editTitle, editTagList, editContent, editColor, editType]);
  const clearDraft = () => { localStorage.removeItem(DRAFT_KEY); setDraftSavedAt(null); setDraftMsg(''); };

  // 📑 写作大纲：从正文实时提取 h2/h3，点击滚动到对应位置（按字符占比近似定位）
  const editorToc = useMemo(() => extractToc(editContent), [editContent]);
  const jumpToHeading = (text: string) => {
    const ta = editorRef.current;
    if (!ta) return;
    const idx = editContent.search(new RegExp(`^#{2,3}\\s+.*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'));
    if (idx < 0) return;
    ta.focus();
    ta.setSelectionRange(idx, idx);
    ta.scrollTop = Math.max(0, (idx / Math.max(1, editContent.length)) * ta.scrollHeight - 80);
  };

  const insertTemplate = () => {
    const tpl = getTemplate(editType);
    if (!tpl) return;
    setEditContent(prev => prev.trim() ? `${prev.replace(/\s+$/, '')}\n\n${tpl}` : tpl);
  };

  const saveAsTemplate = () => {
    if (!editContent.trim()) return;
    persistTemplates({ ...customTemplates, [editType]: editContent });
    flashTemplateMsg(`已存为「${metaOf(editType).zh}」模板 ✓`);
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

  // 🔗 摘下本文直链：复制 #/garden/:id 到剪贴板，与 hash 路由对应，可直达单篇
  const [shareCopied, setShareCopied] = useState(false);
  const sharePost = (p: BlogPost) => {
    const url = `${window.location.origin}${window.location.pathname}#/garden/${p.id}`;
    navigator.clipboard?.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1800);
    });
  };

  // 📖 阅读舱滚动容器：进度与目录都基于它（进度追踪已下沉到 ReaderProgress 内，确保容器已挂载）
  const readerRef = useRef<HTMLDivElement>(null);

  // 📑 文中目录、阅读时长、上一/下一篇：随当前文章推导
  const toc = useMemo(() => (activePost ? extractToc(activePost.content) : []), [activePost]);
  const readerMinutes = useMemo(() => (activePost ? readingMinutes(activePost.content) : 0), [activePost]);
  const { prevPost, nextPost } = useMemo(() => {
    if (!activePost) return { prevPost: null as BlogPost | null, nextPost: null as BlogPost | null };
    const idx = posts.findIndex(p => p.id === activePost.id);
    return {
      nextPost: idx > 0 ? posts[idx - 1] : null,                          // 时间上更新的一篇
      prevPost: idx >= 0 && idx < posts.length - 1 ? posts[idx + 1] : null, // 更早的一篇
    };
  }, [activePost, posts]);
  const openPost = (p: BlogPost) => { setActivePost(p); readerRef.current?.scrollTo({ top: 0 }); };

  // 🧭 直链 ⇄ 阅读舱双向同步：
  //   · 地址含 #/garden/:id（分享 / 刷新 / 后退到某篇）→ 打开对应文章
  //   · 地址回到 #/garden（后退关闭）→ 收起阅读舱
  const { route: galleryRoute } = useHashRoute();
  useEffect(() => {
    if (galleryRoute.view !== 'garden') return;
    if (galleryRoute.postId) {
      const p = posts.find(x => x.id === galleryRoute.postId);
      if (p && p.id !== activePost?.id) setActivePost(p);
    } else if (activePost) {
      setActivePost(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryRoute.view, galleryRoute.postId, posts]);

  // 打开 / 关闭文章时回写地址（相等则跳过，杜绝与上面的 effect 往复抖动）
  //   hadPostRef 守卫：首次以 #/garden/:id 直达时，别在文章打开前就把 id 抹掉
  const hadPostRef = useRef(false);
  useEffect(() => {
    if (activePost) {
      hadPostRef.current = true;
      const target = `#/garden/${activePost.id}`;
      if (window.location.hash !== target) window.location.hash = target;
    } else if (hadPostRef.current && window.location.hash.startsWith('#/garden/')) {
      hadPostRef.current = false;
      window.location.hash = '#/garden';
    }
  }, [activePost]);

  const { playlist, switchTrack } = useSoundscape();
  const dailyIndex = useMemo(() => Math.floor(Date.now() / (1000 * 60 * 60 * 24)), []);
  // 🌾 今日共鸣优先带上节气语录：随季节流转，每日在节气与手写箴言之间轮换
  const quotePool = useMemo(() => [termNoteOfDay(), ...DAILY_QUOTES], []);
  const solarTermName = useMemo(() => currentSolarTerm().name, []);
  const dailyQuote = useMemo(() => quotePool[dailyIndex % quotePool.length], [dailyIndex, quotePool]);
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
    // 🔍 全文检索：标题 / 摘要 / 正文 / 标签一并匹配，找回被藏在正文深处的思考
    const q = searchQuery.trim().toLowerCase();
    const matchSearch = q
      ? (post.title.toLowerCase().includes(q) ||
         post.excerpt.toLowerCase().includes(q) ||
         post.content.toLowerCase().includes(q) ||
         post.tags.some(t => t.toLowerCase().includes(q)))
      : true;
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

  // 恢复草稿到编辑器各字段
  const restoreDraft = (d: EditorDraft) => {
    setEditingId(d.editingId); setEditTitle(d.title); setEditTagList(d.tags ?? []);
    setEditContent(d.content); setEditColor(d.color); setEditType(d.type);
    setDraftSavedAt(d.savedAt); setDraftMsg('已恢复上次未发布的草稿');
  };

  const startEditingPost = (post: BlogPost) => {
    const draft = readDraft();
    if (draft && draft.editingId === post.id && draft.content !== post.content) {
      restoreDraft(draft);
    } else {
      setEditingId(post.id); setEditTitle(post.title); setEditTagList(post.tags); setEditColor(post.color); setEditContent(post.content); setEditType(post.type);
      setDraftMsg('');
    }
    setTagInput(''); setEditorMode('write'); setActivePost(null); setIsEditing(true);
  };

  const startNewPost = () => {
    const draft = readDraft();
    if (draft && !draft.editingId && draft.content.trim() && !categories.some(c => draft.content === getTemplate(c.id))) {
      restoreDraft(draft);
    } else {
      const initialType = selectedType ?? 'thought';
      setEditingId(null); setEditTitle(''); setEditTagList([]); setEditContent(getTemplate(initialType)); setEditColor('#39C5BB'); setEditType(initialType);
      setDraftMsg('');
    }
    setTagInput(''); setEditorMode('write'); setIsEditing(true);
  };

  // 丢弃当前草稿，回到空白新篇
  const discardDraft = () => {
    clearDraft();
    setEditingId(null); setEditTitle(''); setEditTagList([]); setTagInput('');
    setEditContent(getTemplate(editType)); setEditColor('#39C5BB');
  };

  const handlePublish = () => {
    if (!editContent.trim()) return;
    const tagArray = [...editTagList, ...(tagInput.trim() ? [tagInput.trim()] : [])];
    if (editingId) updateSeed(editingId, editTitle, tagArray, editColor, editContent, editType); else plantSeed(editTitle, tagArray, editColor, editContent, editType);
    clearDraft();
    setIsEditing(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to uproot this thought?')) { uprootSeed(id); setActivePost(null); }
  };

  return (
    <motion.div className="absolute inset-0 w-full h-full overflow-hidden flex">
      
      {/* 🌿 左侧「园丁的一隅」：去容器化的开放身份栏，用光与留白锚定，与右栏报头共享顶部起跑线 */}
      <AnimatePresence>
        {!isEditing && (
          <motion.div className="hidden lg:flex w-1/3 h-full flex-col items-center pt-24 px-10 relative z-20 transition-colors duration-[1500ms] ease-in-out" initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50, filter: 'blur(10px)' }} transition={{ type: "spring", stiffness: 260, damping: 30 }}>
            {/* 呼吸柔光：teal + 樱粉两团弥散光，6s 与 OASIS 标题同频呼吸，边缘自然溢向右栏黏合两列 */}
            <motion.div aria-hidden className="absolute top-10 left-1/2 -translate-x-1/2 w-[30rem] h-[30rem] rounded-full bg-[#39C5BB]/[0.13] dark:bg-[#39C5BB]/[0.09] blur-[100px] pointer-events-none" animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} />
            <motion.div aria-hidden className="absolute top-72 -right-20 w-80 h-80 rounded-full bg-[#FFB7C5]/[0.12] dark:bg-[#FFB7C5]/[0.08] blur-[100px] pointer-events-none" animate={{ opacity: [1, 0.55, 1] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} />

            {/* 碑文式单群组：重心落在栏高上 1/3，下方整片留白托底 */}
            <div className="relative z-10 flex flex-col items-center text-center w-full max-w-[300px] mt-6">
              {/* 头像：呼吸光晕 + hover 涟漪细环，点击展开完整档案 */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}>
                <motion.div
                  className="relative w-[84px] h-[84px] mb-5 group cursor-pointer"
                  onClick={() => setShowProfile(true)}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <motion.div aria-hidden className="absolute -inset-4 rounded-full bg-[#39C5BB]/30 dark:bg-[#39C5BB]/20 blur-2xl pointer-events-none" animate={{ opacity: [0.45, 0.85, 0.45] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} />
                  <span aria-hidden className="absolute inset-0 rounded-full border border-[#39C5BB]/50 opacity-0 group-hover:animate-[oasis-ripple_1.8s_ease-out_infinite]" />
                  <span aria-hidden className="absolute inset-0 rounded-full border border-[#FFB7C5]/45 opacity-0 group-hover:animate-[oasis-ripple_1.8s_ease-out_0.45s_infinite]" />
                  <div className="relative w-full h-full rounded-full border border-white/70 dark:border-white/15 overflow-hidden shadow-lg bg-white/20 dark:bg-white/5 backdrop-blur-sm transition-colors duration-[1500ms] ease-in-out">
                    <img src="/avatar.jpg" alt="Curator" className="w-full h-full object-cover opacity-90 mix-blend-luminosity group-hover:mix-blend-normal transition-all duration-1000" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  </div>
                </motion.div>
              </motion.div>

              {/* 名字：无卡束缚，尺寸更从容 */}
              <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, delay: 0.27, ease: [0.16, 1, 0.3, 1] }} className="font-serif text-[2.2rem] leading-none text-slate-700 dark:text-slate-100 mb-3 tracking-wide transition-colors duration-[1500ms] ease-in-out">Bob Lee</motion.h1>

              {/* 身份行 */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, delay: 0.39, ease: [0.16, 1, 0.3, 1] }} className="mb-5 font-mono text-[10px] tracking-[0.2em] uppercase">
                <span className="text-[#39C5BB]">Full-Stack Craftsman</span>
                <span className="text-slate-400 dark:text-slate-500"> · CS @ UNSW</span>
              </motion.div>

              {/* 签名引言：从档案弹窗移驻主栏，比头衔更贴近人 */}
              <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, delay: 0.51, ease: [0.16, 1, 0.3, 1] }} className="font-serif italic text-[13px] leading-[1.85] text-slate-500 dark:text-slate-400 mb-7 px-2 transition-colors duration-[1500ms] ease-in-out">
                “Exploring the intersection of human behavior, aesthetics &amp; software architecture.”
              </motion.p>

              {/* 短 hairline：碑文式的轻分隔，与右栏月份线同语言 */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.4, delay: 0.63 }} aria-hidden className="w-7 border-t border-slate-300/70 dark:border-white/10 mb-8" />

              {/* ✨ 今日共鸣：纯排版呈现，无背景无边框 */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, delay: 0.75, ease: [0.16, 1, 0.3, 1] }} className="w-full mb-8">
                <div className="font-mono text-[9px] tracking-[0.3em] text-[#39C5BB]/80 uppercase mb-3 transition-colors duration-[1500ms]">Today's Resonance<span className="ml-2 text-slate-400/70 normal-case tracking-[0.2em]">· {solarTermName}</span></div>
                <p className="font-serif text-[14px] leading-[1.85] text-slate-600 dark:text-slate-300 italic mb-3.5 transition-colors duration-[1500ms] ease-in-out">“{dailyQuote}”</p>
                <div className="flex items-center justify-center gap-2.5 text-slate-500/90 dark:text-slate-400/70 hover:text-[#39C5BB] dark:hover:text-[#39C5BB] transition-colors cursor-pointer group max-w-full pointer-events-auto" onClick={() => switchTrack(dailyTrack)}>
                  <span className="text-[#39C5BB]/70 group-hover:text-[#39C5BB] transition-colors shrink-0"><DiscIcon /></span>
                  <span className="font-mono text-[10px] tracking-wider truncate transition-colors dark:text-slate-400">{dailyTrack.title} <span className="opacity-50">- {dailyTrack.artist}</span></span>
                </div>
              </motion.div>

              {/* 底部一行收纳：链接 + 档案入口 */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, delay: 0.87, ease: [0.16, 1, 0.3, 1] }} className="flex items-center gap-7 pointer-events-auto">
                <a href="https://github.com/lb15058460816-tech" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-slate-400/80 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"><GithubIcon/> <span className="font-mono text-[10px] tracking-[0.2em] uppercase">GitHub</span></a>
                <a href="mailto:lb15058460816@gmail.com" className="flex items-center gap-2 text-slate-400/80 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"><MailIcon/> <span className="font-mono text-[10px] tracking-[0.2em] uppercase">Mail</span></a>
                <button onClick={() => setShowProfile(true)} className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate-400/80 hover:text-[#39C5BB] dark:hover:text-[#39C5BB] transition-colors">Profile →</button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 🖼️ 右侧基础内容画廊区 */}
      <motion.div className="w-full h-full overflow-y-auto no-scrollbar pt-24 pb-32 px-8 lg:px-16 relative z-10 flex flex-col" animate={{ width: isEditing ? '100%' : '66.666%' }} transition={{ type: "spring", stiffness: 260, damping: 30 }}>
        <AnimatePresence mode="wait">
          {!isEditing ? (
            <motion.div key="gallery" className="w-full h-full flex flex-col" exit={{ opacity: 0 }}>
              {/* 📱 移动端身份条：小屏没有左栏时，报头上方一行轻量署名，点击展开完整档案 */}
              <button onClick={() => setShowProfile(true)} className="lg:hidden flex items-center justify-center gap-3 mb-8 mx-auto group">
                <span className="w-9 h-9 rounded-full overflow-hidden border border-white/60 dark:border-white/10 shadow-sm shrink-0 bg-white/20 dark:bg-white/5">
                  <img src="/avatar.jpg" alt="Bob Lee" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                </span>
                <span className="font-serif text-lg text-slate-600 dark:text-slate-200 transition-colors duration-[1500ms]">Bob Lee</span>
                <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-slate-400/80 group-hover:text-[#39C5BB] transition-colors">Profile →</span>
              </button>

              {/* 📰 栏目报头：与左栏头像同高起步、居中，让两侧基线与对齐方式一致 */}
              <div className="mb-9 text-center">
                <div className="font-mono text-[9px] tracking-[0.5em] uppercase text-[#39C5BB]/70 mb-3">The Garden · 数字花园</div>
                <h1 className="font-serif text-4xl text-slate-700 dark:text-slate-100 tracking-wide transition-colors duration-[1500ms] ease-in-out">Curated Thoughts</h1>
                <p className="font-serif italic text-slate-400 dark:text-slate-500 text-sm mt-2.5 transition-colors duration-[1500ms] ease-in-out">A quiet record of learning, growth &amp; small wonders.</p>
              </div>

              <div className="mb-10">
                {/* 🧭 目录线：居中类型筛选为主轴，两端安静收纳搜索 / 标签 / 管理动作，一条线承载全部控件 */}
                <div className="relative border-y border-slate-200/70 dark:border-white/[0.07] py-3 px-24 flex items-center justify-center gap-x-6 gap-y-2 flex-wrap transition-colors duration-[1500ms]">
                  <button onClick={() => setSelectedType(null)} className={`font-mono text-[10px] tracking-[0.18em] uppercase pb-0.5 border-b transition-all duration-500 ${!selectedType ? 'text-slate-700 dark:text-slate-100 border-[#39C5BB]' : 'text-slate-400 dark:text-slate-500 border-transparent hover:text-slate-600 dark:hover:text-slate-300'}`}>
                    All <span className="opacity-50 tracking-normal">{posts.length}</span>
                  </button>
                  {categories.filter(t => t.builtin || (typeCounts[t.id] || 0) > 0).map(t => {
                    const active = selectedType === t.id;
                    const count = typeCounts[t.id] || 0;
                    return (
                      <button key={t.id} onClick={() => setSelectedType(active ? null : t.id)} title={t.zh}
                        className={`font-mono text-[10px] tracking-[0.18em] uppercase pb-0.5 border-b transition-all duration-500 ${active ? '' : 'text-slate-400 dark:text-slate-500 border-transparent hover:text-slate-600 dark:hover:text-slate-300'}`}
                        style={active ? { color: t.color, borderColor: t.color } : undefined}>
                        {t.label} <span className="opacity-50 tracking-normal">{count}</span>
                      </button>
                    );
                  })}

                  {/* 左端：搜索，点击展开输入 */}
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <button onClick={() => setSearchOpen(o => !o)} title="Search" className={`p-1 transition-colors ${searchOpen || searchQuery ? 'text-[#39C5BB]' : 'text-slate-400 dark:text-slate-500 hover:text-[#39C5BB]'}`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                    </button>
                    <AnimatePresence>
                      {searchOpen && (
                        <motion.input
                          autoFocus type="text" placeholder="Search thoughts..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                          initial={{ width: 0, opacity: 0 }} animate={{ width: 150, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                          className="bg-transparent border-b border-slate-300/60 dark:border-white/15 font-serif text-sm text-slate-600 dark:text-slate-200 outline-none pb-0.5 placeholder:text-slate-400/50 dark:placeholder:text-slate-600"
                        />
                      )}
                    </AnimatePresence>
                  </div>

                  {/* 右端：标签抽屉开关 + 管理动作，褪为纯文字 */}
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-4">
                    {allTags.length > 0 && (
                      <button onClick={() => setShowTags(v => !v)} className={`font-mono text-[10px] tracking-[0.18em] uppercase transition-colors ${showTags || selectedTag ? 'text-[#39C5BB]' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}># Tags</button>
                    )}
                    {isAdmin && (
                      <>
                        <button onClick={handleSyncToCloud} disabled={syncState === 'syncing'} title="把本地全部文章一键同步到 Supabase 云端" className="font-mono text-[10px] tracking-[0.18em] uppercase text-slate-400 dark:text-slate-500 hover:text-[#39C5BB] transition-colors disabled:opacity-40">{syncState === 'syncing' ? '☁ …' : '☁ Sync'}</button>
                        <button onClick={startNewPost} className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#39C5BB] hover:text-[#2da098] transition-colors">+ Seed</button>
                      </>
                    )}
                  </div>

                  {/* 同步结果轻提示 */}
                  <AnimatePresence>
                    {syncMsg && <motion.span initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute -bottom-6 right-0 font-mono text-[9px] tracking-wider text-[#39C5BB] normal-case">{syncMsg}</motion.span>}
                  </AnimatePresence>
                </div>

                {/* 标签抽屉：需要时才展开，居中纯文字 */}
                <AnimatePresence>
                  {showTags && allTags.length > 0 && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
                      <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 pt-4 pb-1">
                        <button onClick={() => setSelectedTag(null)} className={`font-mono text-[9px] tracking-widest uppercase transition-colors duration-500 ${!selectedTag ? 'text-[#39C5BB]' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}># all</button>
                        {allTags.map(tag => (
                          <button key={tag} onClick={() => setSelectedTag(selectedTag === tag ? null : tag)} className={`font-mono text-[9px] tracking-widest uppercase transition-colors duration-500 ${selectedTag === tag ? 'text-[#39C5BB] border-b border-[#39C5BB]/60' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}>#{tag}</button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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
                          const meta = metaOf(post.type);
                          return (
                            // ✨ 优化卡片背景：夜间采用纯白微透明度，透出深色星河底色，绝对不会发黑模糊
                            <motion.div key={post.id} className="break-inside-avoid relative rounded-3xl cursor-pointer overflow-hidden border border-white/40 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] hover:dark:bg-white/[0.08] transition-colors duration-[1500ms] ease-in-out" style={{ backdropFilter: `blur(12px)` }} initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: "spring", stiffness: 260, damping: 25 }} onClick={() => setActivePost(post)} whileHover={{ y: -6, scale: 1.02, boxShadow: `0 20px 40px rgba(0,0,0,0.05), 0 0 30px ${post.color}15` }} whileTap={{ scale: 0.96 }}>
                              <div className="h-28 w-full relative overflow-hidden">
                                {/* 情绪色柔渐变背景：替代空头图，给卡片质感与归属感 */}
                                <div className="absolute inset-0 transition-all duration-[1500ms] ease-in-out" style={{ background: `linear-gradient(135deg, ${post.color}29, ${post.color}0a 55%, transparent)` }} />
                                {/* 大类型图标水印：淡化的情绪色，去占位感 */}
                                <div className="absolute -right-3 -bottom-6 w-28 h-28 opacity-[0.13] dark:opacity-[0.16] pointer-events-none transition-opacity duration-[1500ms]" style={{ color: post.color }}><CategoryIcon name={meta.icon} /></div>
                                {/* 类型徽章：左上角，图标 + 名称，染类型微光色 */}
                                <div className="absolute top-4 left-6 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 dark:bg-black/50 backdrop-blur-sm border border-white/60 dark:border-white/10" style={{ color: meta.color }}>
                                  <span className="w-3 h-3"><CategoryIcon name={meta.icon} /></span>
                                  <span className="font-mono text-[8px] tracking-[0.2em] uppercase">{meta.label}</span>
                                </div>
                                <div className="absolute bottom-4 left-6 flex space-x-2">{post.tags.slice(0, 3).map(tag => <span key={tag} className="font-mono text-[9px] tracking-widest text-slate-500 dark:text-slate-300 uppercase bg-white/60 dark:bg-black/60 px-2 py-1 rounded backdrop-blur-sm border border-white/50 dark:border-white/10 transition-colors duration-[1500ms] ease-in-out">{tag}</span>)}</div>
                              </div>
                              <div className="p-8">
                                <div className="font-mono text-[10px] tracking-[0.2em] text-slate-400 dark:text-slate-500 uppercase mb-4 flex items-center gap-2 transition-colors duration-[1500ms]"><span>{post.date}</span><span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span><span className="opacity-70">{readingTimeLabel(post.content)}</span></div>
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
                   {([['write', 'Write'], ['split', 'Split'], ['preview', 'Preview']] as const).map(([mode, label]) => (
                     <button key={mode} onClick={() => setEditorMode(mode)}
                       className={`px-5 py-1.5 text-[10px] tracking-[0.2em] uppercase font-mono rounded-md transition-all duration-300 ${mode === 'split' ? 'hidden lg:block' : ''} ${editorMode === mode ? 'bg-white dark:bg-slate-700 text-[#39C5BB] shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>{label}</button>
                   ))}
                 </div>
                 <div className="flex items-center gap-4">
                   {/* 💾 草稿提示：恢复通知 + 丢弃入口 */}
                   <AnimatePresence>
                     {draftMsg && (
                       <motion.span initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="font-mono text-[9px] tracking-wider text-[#39C5BB]">
                         {draftMsg} · <button onClick={discardDraft} className="underline decoration-dotted hover:text-[#FFB7C5] transition-colors">丢弃</button>
                       </motion.span>
                     )}
                   </AnimatePresence>
                   <button onClick={() => setIsEditing(false)} title="收起编辑器（草稿已自动保存）" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
                 </div>
               </div>
               
               <input type="text" placeholder="Title..." value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full bg-transparent text-4xl md:text-5xl font-serif text-slate-700 dark:text-slate-200 mb-6 outline-none placeholder:text-slate-300 dark:placeholder:text-slate-700 transition-colors duration-[1500ms] ease-in-out" disabled={isPreviewMode} />

               {/* 🌱 类型选择：内置 + 自定义分类，行末可即时新建 */}
               <div className="flex flex-wrap items-center gap-2 mb-6" style={{ opacity: isPreviewMode ? 0.3 : 1, pointerEvents: isPreviewMode ? 'none' : 'auto' }}>
                 {categories.map(t => {
                   const active = editType === t.id;
                   return (
                     <button key={t.id} onClick={() => handleTypeSwitch(t.id)} title={t.zh}
                       className={`group/cat relative flex items-center gap-2 font-mono text-[10px] tracking-[0.15em] uppercase px-4 py-2 rounded-full border transition-all duration-300 ${active ? 'text-white border-transparent' : 'text-slate-500 dark:text-slate-400 border-slate-300/50 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/25'}`}
                       style={active ? { backgroundColor: t.color, boxShadow: `0 4px 16px ${t.color}40` } : undefined}>
                       <span className="w-3.5 h-3.5" style={{ color: active ? '#fff' : t.color }}><CategoryIcon name={t.icon} /></span>
                       {t.label}<span className="opacity-60 normal-case tracking-normal">· {t.zh}</span>
                       {/* 自定义分类可删除：悬停浮现小 ×，删除后旧文章自动回落默认样式 */}
                       {!t.builtin && (
                         <span role="button" title={`删除分类「${t.zh}」`}
                           onClick={(e) => { e.stopPropagation(); if (window.confirm(`删除分类「${t.zh}」？已有文章会保留，仅失去分类样式。`)) { removeCategory(t.id); if (editType === t.id) setEditType('thought'); } }}
                           className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-400/90 dark:bg-slate-600 text-white text-[9px] leading-4 text-center opacity-0 group-hover/cat:opacity-100 transition-opacity hover:bg-red-400">×</span>
                       )}
                     </button>
                   );
                 })}
                 <button onClick={() => setShowCatForm(v => !v)} title="新建分类"
                   className={`font-mono text-[10px] tracking-[0.15em] uppercase px-4 py-2 rounded-full border border-dashed transition-colors ${showCatForm ? 'text-[#39C5BB] border-[#39C5BB]/60' : 'text-slate-400 dark:text-slate-500 border-slate-300/60 dark:border-white/15 hover:text-[#39C5BB] hover:border-[#39C5BB]/50'}`}>+ New</button>
               </div>

               {/* 🆕 新建分类内联表单：名字 + 颜色 + 图标即刻生效 */}
               <AnimatePresence>
                 {showCatForm && !isPreviewMode && (
                   <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                     <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mb-6 px-5 py-4 rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/40 dark:bg-white/[0.03]">
                       <input type="text" placeholder="English name" value={catLabel} onChange={e => setCatLabel(e.target.value)} className="w-32 bg-transparent border-b border-slate-300/60 dark:border-white/15 font-mono text-xs text-slate-600 dark:text-slate-300 outline-none pb-1 placeholder:text-slate-400/60" />
                       <input type="text" placeholder="中文名" value={catZh} onChange={e => setCatZh(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleCreateCategory(); }} className="w-24 bg-transparent border-b border-slate-300/60 dark:border-white/15 font-serif text-sm text-slate-600 dark:text-slate-300 outline-none pb-1 placeholder:text-slate-400/60" />
                       <div className="flex items-center gap-1.5">
                         {AURA_COLORS.map(c => <div key={c} onClick={() => setCatColor(c)} className={`w-3.5 h-3.5 rounded-full cursor-pointer transition-transform ${catColor === c ? 'scale-125 ring-2 ring-offset-1 ring-current' : 'opacity-40 hover:opacity-100'}`} style={{ backgroundColor: c, color: c }} />)}
                       </div>
                       <div className="flex items-center gap-1">
                         {ICON_NAMES.map(name => (
                           <button key={name} onClick={() => setCatIcon(name)} title={name}
                             className={`w-7 h-7 p-1.5 rounded-lg transition-colors ${catIcon === name ? 'text-white' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
                             style={catIcon === name ? { backgroundColor: catColor } : undefined}><CategoryIcon name={name} /></button>
                         ))}
                       </div>
                       <button onClick={handleCreateCategory} disabled={!catLabel.trim() && !catZh.trim()} className="ml-auto font-mono text-[10px] tracking-widest uppercase px-5 py-2 rounded-full text-white transition-all disabled:opacity-30" style={{ backgroundColor: catColor }}>Create</button>
                     </div>
                   </motion.div>
                 )}
               </AnimatePresence>

               <div className="flex items-center space-x-6 mb-8 border-b border-slate-200 dark:border-white/10 pb-8 transition-all" style={{ opacity: isPreviewMode ? 0.3 : 1, pointerEvents: isPreviewMode ? 'none' : 'auto' }}>
                 {/* 🏷️ 标签 chip 输入：回车成签、点 × 摘除、下拉复用已有标签 */}
                 <div className="flex-1 relative flex flex-wrap items-center gap-2">
                   {editTagList.map(tag => (
                     <span key={tag} className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest uppercase px-2.5 py-1 rounded-full bg-slate-500/[0.08] dark:bg-white/[0.08] text-slate-500 dark:text-slate-300">
                       {tag}
                       <button onClick={() => setEditTagList(editTagList.filter(t => t !== tag))} className="text-slate-400 hover:text-red-400 transition-colors">×</button>
                     </span>
                   ))}
                   <input type="text" placeholder={editTagList.length ? '' : 'Tags · 回车添加'} value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={handleTagKeyDown}
                     className="flex-1 min-w-[120px] bg-transparent font-mono text-xs tracking-widest text-slate-500 dark:text-slate-400 outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600 uppercase transition-colors" />
                   {/* 已有标签联想 */}
                   {tagInput.trim() && allTags.some(t => t.toLowerCase().includes(tagInput.trim().toLowerCase()) && !editTagList.includes(t)) && (
                     <div className="absolute top-full left-0 mt-2 z-30 flex flex-wrap gap-2 max-w-full p-3 rounded-xl bg-white/90 dark:bg-[#111827]/95 backdrop-blur-xl border border-slate-200/70 dark:border-white/10 shadow-lg">
                       {allTags.filter(t => t.toLowerCase().includes(tagInput.trim().toLowerCase()) && !editTagList.includes(t)).slice(0, 8).map(t => (
                         <button key={t} onClick={() => commitTag(t)} className="font-mono text-[10px] tracking-widest uppercase text-slate-500 dark:text-slate-400 hover:text-[#39C5BB] transition-colors">#{t}</button>
                       ))}
                     </div>
                   )}
                 </div>
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
                       <button onClick={insertTemplate} title={`把「${metaOf(editType).zh}」的写作骨架追加到正文`} className="text-slate-400 dark:text-slate-500 hover:text-[#39C5BB] transition-colors">+ Insert 插入骨架</button>
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
                   {/* ✍️ 写作区：write 单栏（宽屏侧挂大纲）/ split 左写右读 */}
                   <div className="flex-1 flex gap-8 min-h-0 mb-3">
                     <textarea ref={editorRef} value={editContent} onChange={e => setEditContent(e.target.value)} onKeyDown={handleEditorKeyDown} placeholder="Let your thoughts flow..." className="flex-1 min-w-0 bg-transparent font-serif text-lg leading-loose text-slate-600 dark:text-slate-300 outline-none resize-none placeholder:text-slate-300/50 dark:placeholder:text-slate-700 no-scrollbar transition-colors duration-[1500ms] ease-in-out" />
                     {editorMode === 'split' && (
                       <div className="hidden lg:block flex-1 min-w-0 overflow-y-auto no-scrollbar pl-8 border-l border-slate-200/60 dark:border-white/5">
                         {editContent.trim() ? <Markdown>{editContent}</Markdown> : <div className="text-slate-300 dark:text-slate-600 italic text-center mt-20">Preview...</div>}
                       </div>
                     )}
                     {/* 📑 写作大纲：单栏写作时提取 h2/h3，点击跳到对应段落 */}
                     {editorMode === 'write' && editorToc.length > 1 && (
                       <nav className="hidden xl:flex flex-col gap-2 w-44 shrink-0 overflow-y-auto no-scrollbar py-1">
                         <span className="font-mono text-[9px] tracking-[0.25em] uppercase text-slate-300 dark:text-slate-600 mb-1 select-none">Outline</span>
                         {editorToc.map(item => (
                           <button key={item.id} onClick={() => jumpToHeading(item.text)}
                             className={`text-left font-serif text-xs leading-snug text-slate-400 dark:text-slate-500 hover:text-[#39C5BB] transition-colors truncate ${item.level === 3 ? 'pl-4' : ''}`}>{item.text}</button>
                         ))}
                       </nav>
                     )}
                   </div>
                   {/* 📊 状态栏：字数 / 预计阅读 / 草稿保存时间 */}
                   <div className="flex items-center gap-4 mb-6 font-mono text-[9px] tracking-widest uppercase text-slate-300 dark:text-slate-600 select-none">
                     <span>{editContent.length} chars</span>
                     <span>· {readingMinutes(editContent)} min read</span>
                     {draftSavedAt && <span className="text-[#39C5BB]/60 normal-case">· 草稿已存 {new Date(draftSavedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>}
                     <span className="ml-auto normal-case">⌘B 粗体 · ⌘I 斜体 · ⌘K 链接 · Tab 缩进</span>
                   </div>
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
            className="fixed inset-0 z-[100] overflow-y-auto no-scrollbar bg-[#FAF8F3] dark:bg-[#0A0F1D] transition-colors duration-[1500ms] ease-in-out"
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40, filter: 'blur(10px)' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* 📖 顶部情绪丝线 + 🪷 右下墨环进度（剩余分钟 / 回顶）：共用滚动弹簧 */}
            <ReaderProgress containerRef={readerRef} color={activePost.color} totalMinutes={readerMinutes} />
            {/* 📑 左侧文中目录（枯山水耙痕） */}
            <ReaderToc items={toc} color={activePost.color} containerRef={readerRef} />
            <div className="min-h-screen w-full flex flex-col items-center">
              
              <div className="absolute top-0 left-0 w-full h-96 overflow-hidden pointer-events-none">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.2 }} className="absolute -top-32 -left-32 w-96 h-96 rounded-full blur-[100px] dark:opacity-10 transition-opacity duration-[1500ms] ease-in-out" style={{ backgroundColor: activePost.color }} transition={{ duration: 1 }} />
              </div>

              <div className="relative w-full max-w-3xl px-8 md:px-12 pt-24 pb-64">
                
                <div className="flex justify-end items-center space-x-6 mb-12 font-mono text-[10px] tracking-widest uppercase">
                  <button onClick={() => activePost && sharePost(activePost)} className="text-slate-400 dark:text-slate-500 hover:text-oasis-teal transition-colors">{shareCopied ? '链接已摘下 ✓' : 'Share'}</button>
                  {isAdmin && <button onClick={() => activePost && startEditingPost(activePost)} className="text-slate-400 dark:text-slate-500 hover:text-[#39C5BB] transition-colors">Edit</button>}
                  {isAdmin && <button onClick={() => activePost && handleDelete(activePost.id)} className="text-slate-400 dark:text-slate-500 hover:text-red-400 transition-colors">Destroy</button>}
                  <button onClick={() => setActivePost(null)} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors ml-4 p-2 -mr-2 bg-white/50 dark:bg-white/5 rounded-full border border-slate-200/50 dark:border-white/10 shadow-sm hover:bg-white dark:hover:bg-white/10"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
                </div>

                <div className="font-mono text-xs tracking-[0.3em] text-slate-400 dark:text-slate-500 uppercase mb-8 flex items-center gap-3 flex-wrap transition-colors duration-[1500ms]">
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border" style={{ color: metaOf(activePost.type).color, borderColor: `${metaOf(activePost.type).color}40`, backgroundColor: `${metaOf(activePost.type).color}10` }}>
                    <span className="w-3 h-3"><CategoryIcon name={metaOf(activePost.type).icon} /></span>{metaOf(activePost.type).label}
                  </span>
                  <span>{activePost.date}</span><span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span><span className="opacity-70">{readingTimeLabel(activePost.content)}</span>
                </div>
                
                <h1 className="font-serif text-4xl md:text-5xl text-slate-800 dark:text-slate-100 leading-[1.3] mb-8 transition-colors duration-[1500ms] ease-in-out">{activePost.title}</h1>
                
                <div className="flex space-x-4 mb-16">
                  {activePost.tags.map(tag => <span key={tag} className="font-mono text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase border-b border-slate-300 dark:border-white/10 pb-1 transition-colors duration-[1500ms]">{tag}</span>)}
                </div>

                {/* ✨ 核心修复四：强力介入并定义 Markdown 的全级夜间排版字色，保证多层嵌套下渲染坚固不丢失 */}
                <Markdown className={`${PROSE_CLASS} leading-[2.2] prose-img:my-12 prose-headings:scroll-mt-24 transition-colors duration-[1500ms] ease-in-out`}>{activePost.content}</Markdown>

                {/* 🪶 上一篇 / 下一篇：一条枯山水式分隔线，读完不必退回列表 */}
                {(prevPost || nextPost) && (
                  <div className="mt-24 pt-10 border-t border-slate-200/50 dark:border-white/10 grid grid-cols-2 gap-8 transition-colors duration-[1500ms]">
                    {prevPost ? (
                      <button onClick={() => openPost(prevPost)} className="group text-left min-w-0">
                        <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-slate-400 dark:text-slate-500 mb-2.5 flex items-center gap-2"><span className="transition-transform group-hover:-translate-x-1">←</span> 更早</div>
                        <div className="font-serif text-slate-600 dark:text-slate-300 leading-snug line-clamp-2 group-hover:text-oasis-teal dark:group-hover:text-oasis-teal transition-colors">{prevPost.title}</div>
                      </button>
                    ) : <span />}
                    {nextPost ? (
                      <button onClick={() => openPost(nextPost)} className="group text-right min-w-0">
                        <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-slate-400 dark:text-slate-500 mb-2.5 flex items-center justify-end gap-2">更新 <span className="transition-transform group-hover:translate-x-1">→</span></div>
                        <div className="font-serif text-slate-600 dark:text-slate-300 leading-snug line-clamp-2 group-hover:text-oasis-teal dark:group-hover:text-oasis-teal transition-colors">{nextPost.title}</div>
                      </button>
                    ) : <span />}
                  </div>
                )}

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
              className="relative w-[90vw] max-w-md max-h-[88vh] overflow-y-auto no-scrollbar bg-white/80 dark:bg-[#111827]/90 backdrop-blur-3xl border border-white/50 dark:border-white/10 p-10 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex flex-col transition-colors duration-1000"
            >
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-[#39C5BB] rounded-full blur-[80px] opacity-30 dark:opacity-20 pointer-events-none transition-opacity duration-1000" />
              <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-[#FFB7C5] rounded-full blur-[80px] opacity-30 dark:opacity-20 pointer-events-none transition-opacity duration-1000" />

              <button onClick={() => setShowProfile(false)} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors z-20">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>

              {/* 头部：居中 */}
              <div className="flex flex-col items-center text-center z-10">
                <div className="w-28 h-28 rounded-full border border-white/70 dark:border-white/15 shadow-xl overflow-hidden mb-6 transition-colors duration-1000">
                  <img src="/avatar.jpg" alt="Bob Lee" className="w-full h-full object-cover" />
                </div>
                <h2 className="font-serif text-3xl text-slate-800 dark:text-slate-100 mb-2 transition-colors">Bob Lee</h2>
                <p className="font-mono text-xs tracking-[0.2em] text-[#39C5BB] uppercase">Full-Stack Craftsman</p>
                <p className="font-mono text-[10px] tracking-[0.2em] text-slate-400 dark:text-slate-500 uppercase mt-1.5">CS @ UNSW · Sydney</p>

                {/* 签名引言 */}
                <p className="font-serif italic text-slate-500 dark:text-slate-400 text-sm leading-relaxed mt-6 px-2 transition-colors">
                  “Exploring the intersection of human behavior, aesthetics &amp; software architecture.”
                </p>
              </div>

              {/* 正文：左对齐，可读性更好 */}
              <div className="z-10 mt-8 text-left">
                <p className="font-serif text-slate-600 dark:text-slate-300 leading-relaxed text-sm transition-colors">
                  A 19-year-old computer science undergraduate at UNSW-Sydney. Dedicated to building elegant architectures and non-competitive digital spaces — where craft, calm and curiosity matter more than the race.
                </p>
              </div>

              {/* Now：最近在做什么，每次回访都有新东西看 */}
              <div className="z-10 mt-8 text-left">
                <div className="font-mono text-[9px] tracking-[0.25em] text-[#39C5BB]/80 uppercase mb-3">Now</div>
                <ul className="flex flex-col gap-2.5">
                  {[
                    { k: 'Building', v: 'Oasis — a quiet digital garden' },
                    { k: 'Reading', v: 'Designing Data-Intensive Applications' },
                    { k: 'Learning', v: 'C++ systems & AI agents' },
                  ].map(item => (
                    <li key={item.k} className="flex items-baseline gap-3 text-sm">
                      <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-slate-400 dark:text-slate-500 w-16 shrink-0">{item.k}</span>
                      <span className="font-serif text-slate-600 dark:text-slate-300 leading-snug transition-colors">{item.v}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 兴趣标签：带一句话注解 */}
              <div className="z-10 mt-8 text-left">
                <div className="font-mono text-[9px] tracking-[0.25em] text-[#39C5BB]/80 uppercase mb-3">Interests</div>
                <div className="flex flex-col gap-2">
                  {[
                    { tag: 'C++', note: 'systems & performance' },
                    { tag: 'AI', note: 'agents & applied LLMs' },
                    { tag: 'Claude', note: 'daily craft companion' },
                    { tag: 'Hatsune Miku ❤️', note: 'forever the muse' },
                  ].map(({ tag, note }) => (
                    <div key={tag} className="flex items-baseline gap-3">
                      <span className="font-mono text-[9px] tracking-widest uppercase px-2.5 py-1 rounded-full bg-slate-500/[0.07] dark:bg-white/[0.07] text-slate-500 dark:text-slate-400 transition-colors duration-1000 shrink-0">{tag}</span>
                      <span className="font-serif italic text-xs text-slate-400 dark:text-slate-500">{note}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 链接矩阵 */}
              <div className="z-10 mt-8 pt-6 border-t border-slate-300/40 dark:border-white/10 flex gap-8">
                <a href="https://github.com/lb15058460816-tech" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-slate-400/80 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"><GithubIcon/> <span className="font-mono text-[10px] tracking-[0.2em] uppercase">GitHub</span></a>
                <a href="mailto:lb15058460816@gmail.com" className="flex items-center gap-2 text-slate-400/80 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"><MailIcon/> <span className="font-mono text-[10px] tracking-[0.2em] uppercase">Mail</span></a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 🖼️ 图片灯箱：监听正文图片点击，全屏放大 */}
      <Lightbox />

    </motion.div>
  );
};