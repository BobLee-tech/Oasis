// src/components/OasisGallery.tsx
import React, { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useIsPresent } from 'framer-motion';
import { useGarden, filterVisible, makeExcerpt, type BlogPost, type Growth, type PostStatus } from '../hooks/useGarden';
import { useCategories, CategoryIcon, ICON_NAMES } from '../hooks/useCategories';
import { Markdown, PROSE_CLASS } from './Markdown';
import { usePostResonance } from '../hooks/usePostResonance';
import { useSoundscape } from '../hooks/useSoundscape';
import { readingTimeLabel, readingMinutes, extractToc, getReadProgress, setReadProgress } from '../lib/reading';
import { ReaderProgress, ReaderToc, Lightbox, Colophon, Echoes, Related } from './OasisReader';
import { useHashRoute } from '../lib/route';
import { termNoteOfDay, currentSolarTerm } from '../lib/solarTerms';
import { buildTitleIndex, resolveWikiLinks, buildBacklinkIndex, extractWikiLinks } from '../lib/wikilinks';
import { DAILY_QUOTES } from '../data/quotes';
import { useCoarsePointer } from '../hooks/useCoarsePointer';
import { getVisitorAlias, setVisitorAlias } from '../lib/visitor';
import { emitMikuSignal } from '../lib/mikuSignal';
import { emitRipple } from '../lib/rippleSignal';
import { tagKey, buildTagCanonicalMap } from '../lib/tags';
import { AURA_COLORS } from '../lib/aura';

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

// 💾 写作草稿：按文章分 key 落盘（新文章用 __new__），编辑 A 途中切去编辑 B 也不会互相覆盖；
//    误触关闭 / 刷新都不会丢字。
const DRAFT_STORE_KEY = 'oasis_editor_drafts';
interface EditorDraft {
  editingId: string | null;
  title: string; tags: string[]; content: string; color: string; type: string;
  series?: string;
  growth?: Growth; status?: PostStatus;
  slug?: string; excerpt?: string;
  savedAt: number;
}
const draftKeyOf = (editingId: string | null) => editingId ?? '__new__';
const readDraftStore = (): Record<string, EditorDraft> => {
  try { return JSON.parse(localStorage.getItem(DRAFT_STORE_KEY) || '{}'); } catch { return {}; }
};
const readDraft = (editingId: string | null): EditorDraft | null => {
  const d = readDraftStore()[draftKeyOf(editingId)];
  return d && typeof d.content === 'string' ? d : null;
};
const writeDraft = (draft: EditorDraft) => {
  try {
    const store = readDraftStore();
    store[draftKeyOf(draft.editingId)] = draft;
    localStorage.setItem(DRAFT_STORE_KEY, JSON.stringify(store));
  } catch { /* 容量/隐私模式失败可忽略 */ }
};
const removeDraft = (editingId: string | null) => {
  try {
    const store = readDraftStore();
    delete store[draftKeyOf(editingId)];
    localStorage.setItem(DRAFT_STORE_KEY, JSON.stringify(store));
  } catch { /* ignore */ }
};

interface OasisGalleryProps { isAdmin: boolean; }

const GithubIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[14px] h-[14px]"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>);
const MailIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[14px] h-[14px]"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>);
const DiscIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 animate-[spin_4s_linear_infinite]"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>);

// 🌱🌿🌳 生长度小图形：给常客的暗号，不是给所有人的徽章——只用 12px 大小，一个点 / 双叶 / 小树
const GrowthGlyph: React.FC<{ growth: Growth; color: string }> = ({ growth, color }) => {
  if (growth === 'evergreen') return (
    <svg viewBox="0 0 12 12" className="w-3 h-3 shrink-0" style={{ color }} aria-label="常青">
      <path d="M6 1L2.2 6.2h1.9L2 9.6h8L7.9 6.2h1.9z" fill="currentColor" opacity="0.85" />
      <path d="M6 9.6v1.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
  if (growth === 'growing') return (
    <svg viewBox="0 0 12 12" className="w-3 h-3 shrink-0" style={{ color }} aria-label="生长中">
      <path d="M6 11V4.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6 6.2C6 4.3 4.4 3.2 2.4 3.2c0 2 1.6 3.3 3.6 3z" fill="currentColor" opacity="0.85" />
      <path d="M6 7.4c0-1.6 1.3-2.5 2.9-2.5.1 1.7-1.3 2.8-2.9 2.5z" fill="currentColor" opacity="0.6" />
    </svg>
  );
  return <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} aria-label="种子" />;
};

export const OasisGallery: React.FC<OasisGalleryProps> = ({ isAdmin }) => {
  // 📱 触屏：卡片列表去掉逐张 backdrop-filter 模糊——滚动时每张卡都是独立合成层，
  // 数量一多手机 GPU 明显吃力；改实色半透明背景，观感不减，滚动更顺。
  const coarse = useCoarsePointer();
  const { posts: rawPosts, plantSeed, updateSeed, uprootSeed, syncToCloud } = useGarden();
  // 🔒 admin 本人已登录会话会连草稿一并拉下来；「模拟访客」时在客户端滤掉，模拟才名副其实
  // ⚠️ posts 是「能被直接导航/引用到」的集合（深链、反向链接、合集目录都靠它），
  //   unlisted 故意留在里面——分享链接打开后，文章本身该正常渲染。
  const posts = useMemo(() => filterVisible(rawPosts, isAdmin), [rawPosts, isAdmin]);
  // 📋 listedPosts 才是「会被主动摆出来」的集合：网格 / 标签 / 归档 / 站内搜索 / 「继续漫游」类推荐面板
  //   都从这里取数据，非 admin 视角下排除 unlisted（admin 自己仍能看到，便于管理）。
  const listedPosts = useMemo(() => isAdmin ? posts : posts.filter(p => p.status !== 'unlisted'), [posts, isAdmin]);
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
  // 供异步回调（图片加载完成后再定位续读位置）判断当前是否已经切走文章，避免过期跳转
  const activePostRef = useRef(activePost);
  activePostRef.current = activePost;
  // 🚪 关闭编辑器的「最新实现」存一份在 ref 里：closeEditor 定义在组件靠后的位置（依赖一堆
  // 之后才声明的 editXxx 状态），但下面这个 isPresent 副作用要在组件顶部注册、且只想注册一次。
  // 每次渲染把最新闭包写进 ref，effect 永远通过 ref 调用，就不会读到过期的编辑器状态。
  const closeEditorRef = useRef<() => void>(() => {});
  // 🌫️ 本视图开始退场（被 AnimatePresence 移除、isPresent 转 false）时，立即收起
  // portal 到 body 的阅读舱/书房覆盖层。它们脱离 ViewLayer 的 opacity 交叉溶解,
  // 若不主动收起，退场的 0.5s 里会以全不透明悬在新视图（如星图）之上
  // ——即「切到星图偶尔闪现 gallery 组件」的真凶。
  // 注意：退场中 props 被冻结，故不能靠 active prop，必须用 useIsPresent 的实时信号。
  // ⚠️ 切走视图时编辑器若还开着，closeEditor() 会照常落定保存——不能让「切到别的视图」
  //   变成又一条静默丢字的路径（这正是本次要修的 bug）。
  const isPresent = useIsPresent();
  useEffect(() => {
    if (!isPresent) { setActivePost(null); closeEditorRef.current(); }
  }, [isPresent]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [showTags, setShowTags] = useState(false);
  // 🔀 排序：默认最新在前（与旧行为一致）；「最早」「最近照料」两态让排序规则从隐式变可见
  const [sortMode, setSortMode] = useState<'newest' | 'oldest' | 'tended'>('newest');
  const [showSort, setShowSort] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  // ✍️ 编辑器三档视图：纯写 / 左写右读分屏 / 纯预览
  const [editorMode, setEditorMode] = useState<'write' | 'split' | 'preview'>('write');
  const isPreviewMode = editorMode === 'preview';

  // 🎐 给 Miku 递个信号：编辑器/阅读舱开关时她换一套语气——只在状态真正翻转时发一次，
  // 不用 useIsPresent 那条退场兜底也会跟着触发（isEditing/activePost 本身就会被它置空）
  useEffect(() => { emitMikuSignal({ type: isEditing ? 'editor-open' : 'editor-close' }); }, [isEditing]);
  useEffect(() => { emitMikuSignal({ type: activePost ? 'reading-open' : 'reading-close' }); }, [activePost]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTagList, setEditTagList] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editColor, setEditColor] = useState('#39C5BB');
  const [editType, setEditType] = useState<string>('thought');
  // 📚 合集：可空的连载归属；发布栏上方的元信息抽屉里填写
  const [editSeries, setEditSeries] = useState('');
  // 🌱🌿🌳 生长度（自述性质）+ 📝 可见性（draft/unlisted/published）：同样收在元信息抽屉里
  const [editGrowth, setEditGrowth] = useState<Growth>('seedling');
  const [editStatus, setEditStatus] = useState<PostStatus>('published');
  // 🔗 slug 留空则发布时自动从标题生成；✂️ 摘要留空则自动截断正文，两者都只是手动覆盖
  const [editSlug, setEditSlug] = useState('');
  const [editExcerpt, setEditExcerpt] = useState('');
  const [showMetaPanel, setShowMetaPanel] = useState(false);
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null);
  const [showSeries, setShowSeries] = useState(false);

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
  // 最小侵入式改文本：优先走原生 insertText（走真实 input 事件，保留浏览器撤销栈、
  // 不触发 React 整串替换 value 导致的滚动位置重置）；不支持时退回受控 state 写入 + 手动恢复滚动。
  const editText = (ta: HTMLTextAreaElement, selStart: number, selEnd: number, text: string) => {
    ta.setSelectionRange(selStart, selEnd);
    const ok = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text);
    if (!ok) {
      const scrollTop = ta.scrollTop;
      setEditContent(ta.value.slice(0, selStart) + text + ta.value.slice(selEnd));
      requestAnimationFrame(() => { ta.scrollTop = scrollTop; });
    }
  };
  const applyFormat = (before: string, after: string = before, placeholder = '') => {
    const ta = editorRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const sel = ta.value.slice(s, e) || placeholder;
    ta.focus();
    editText(ta, s, e, before + sel + after);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + before.length, s + before.length + sel.length); });
  };
  const applyLinePrefix = (prefix: string) => {
    const ta = editorRef.current;
    if (!ta) return;
    const { selectionStart: s } = ta;
    const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
    ta.focus();
    editText(ta, lineStart, lineStart, prefix);
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
      if (key === 'enter') { e.preventDefault(); handlePublish(); return; }
      if (key === 'b') { e.preventDefault(); applyFormat('**', '**', 'bold'); return; }
      if (key === 'i') { e.preventDefault(); applyFormat('*', '*', 'italic'); return; }
      if (key === 'k') { e.preventDefault(); applyFormat('[', '](https://)', 'text'); return; }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: end } = ta;
      if (s === end) {
        editText(ta, s, s, '  ');
        requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + 2, s + 2); });
        return;
      }
      // 有选区（可能跨多行）：整体缩进/反缩进，而非用两个空格吞掉选中内容
      const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
      const block = ta.value.slice(lineStart, end);
      const lines = block.split('\n');
      const next = e.shiftKey
        ? lines.map(l => l.replace(/^ {1,2}/, '')).join('\n')
        : lines.map(l => '  ' + l).join('\n');
      editText(ta, lineStart, end, next);
      requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(lineStart, lineStart + next.length); });
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      const { selectionStart: s } = ta;
      const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
      const line = ta.value.slice(lineStart, s);
      const m = /^(\s*)(?:([-*])\s\[[ x]\]\s|([-*])\s|(\d+)\.\s)(.*)$/.exec(line);
      if (!m) return;
      e.preventDefault();
      const [, indent, task, bullet, num, rest] = m;
      // 空列表项再回车 → 结束列表（清掉本行前缀）
      if (!rest.trim()) {
        editText(ta, lineStart, s, '');
        requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(lineStart, lineStart); });
        return;
      }
      const prefix = task ? `${indent}${task} [ ] ` : bullet ? `${indent}${bullet} ` : `${indent}${Number(num) + 1}. `;
      const insert = '\n' + prefix;
      editText(ta, s, s, insert);
      requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + insert.length, s + insert.length); });
    }
  };

  // 🏷️ 标签 chip 输入：回车/逗号成签，退格删最后一枚，下拉复用已有标签。
  //   归一化去重（大小写/全半角/空白）：新标签若与已有写法只是变体，直接复用已有写法，
  //   从源头掐断同义标签越长越多，星图才不会再长出两团一样的星云。
  const commitTag = (raw: string) => {
    const t = raw.trim().replace(/,+$/, '');
    if (!t) { setTagInput(''); return; }
    const k = tagKey(t);
    if (editTagList.some(existing => tagKey(existing) === k)) { setTagInput(''); return; }
    const canonical = allTags.find(existing => tagKey(existing) === k) ?? t;
    setEditTagList([...editTagList, canonical]);
    setTagInput('');
  };
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && !e.nativeEvent.isComposing) { e.preventDefault(); commitTag(tagInput); }
    else if (e.key === 'Backspace' && !tagInput && editTagList.length) setEditTagList(editTagList.slice(0, -1));
  };

  // 💾 草稿自动保存：编辑中 800ms 防抖落盘；发布 / 主动丢弃时清除
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [draftMsg, setDraftMsg] = useState('');

  // 🍂 关闭编辑器（✕ / Esc / 切走视图）的落定通知：8 秒内可反悔。
  //   'update' 撤销 = 把关闭前的原文整篇回写；'new-draft' 撤销 = 把刚落定的草稿拔掉。
  const [undoNotice, setUndoNotice] = useState<
    | { kind: 'update'; postId: string; title: string; snapshot: BlogPost }
    | { kind: 'new-draft'; postId: string; title: string }
    | null
  >(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); }, []);
  useEffect(() => {
    if (!isEditing) return;
    const timer = setTimeout(() => {
      if (!editContent.trim() && !editTitle.trim()) return;
      const draft: EditorDraft = { editingId, title: editTitle, tags: editTagList, content: editContent, color: editColor, type: editType, series: editSeries, growth: editGrowth, status: editStatus, slug: editSlug, excerpt: editExcerpt, savedAt: Date.now() };
      writeDraft(draft); setDraftSavedAt(draft.savedAt);
    }, 800);
    return () => clearTimeout(timer);
  }, [isEditing, editingId, editTitle, editTagList, editContent, editColor, editType, editSeries, editGrowth, editStatus, editSlug, editExcerpt]);
  const clearDraft = () => { removeDraft(editingId); setDraftSavedAt(null); setDraftMsg(''); };

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

  // 🖼️ 预览渲染用延迟值：长文时不阻塞每次敲字的输入手感
  const previewContent = useDeferredValue(editContent);
  // 🔄 Split 模式：写作区滚动时按比例同步预览区滚动位置
  const previewRef = useRef<HTMLDivElement>(null);
  const syncPreviewScroll = () => {
    const ta = editorRef.current, pv = previewRef.current;
    if (!ta || !pv) return;
    const taMax = ta.scrollHeight - ta.clientHeight;
    const ratio = taMax > 0 ? ta.scrollTop / taMax : 0;
    pv.scrollTop = ratio * (pv.scrollHeight - pv.clientHeight);
  };
  useEffect(() => {
    if (editorMode === 'split') syncPreviewScroll();
  }, [previewContent, editorMode]);

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
  const [resAuthor, setResAuthor] = useState(() => getVisitorAlias() ?? '');
  const [resContent, setResContent] = useState('');
  const [resColor, setResColor] = useState('#39C5BB');
  const [isResFocused, setIsResFocused] = useState(false);
  const [isResSubmitting, setIsResSubmitting] = useState(false);

  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState('');

  const [showProfile, setShowProfile] = useState(false);

  // 🔗 摘下本文直链：复制 /p/:id（服务端渲染的分享页，见 api/post.ts）而非 hash 路由——
  //   分享到微信/Twitter/Slack 等平台时，对方抓取的是这条链接的静态 meta/OG，
  //   #/garden/:id 的 fragment 从不会被发到服务器，链接预览会是空的。
  const [shareCopied, setShareCopied] = useState(false);
  // unlisted 必须用 share_token（唯一能绕开「public read = published only」的凭证）；
  // published 优先用可读 slug；都没有则回落 id，与旧链接保持兼容
  const sharePost = (p: BlogPost) => {
    const path = p.status === 'unlisted' && p.shareToken ? p.shareToken : (p.slug || p.id);
    const url = `${window.location.origin}/p/${encodeURIComponent(path)}`;
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

  // 🔗 双链 [[标题]]：渲染前把正文里的引用解析成可点击的站内链接（未命中的标题渲染成虚线种子）
  const postTitleIndex = useMemo(() => buildTitleIndex(posts), [posts]);
  const resolvedContent = useMemo(
    () => (activePost ? resolveWikiLinks(activePost.content, postTitleIndex) : ''),
    [activePost, postTitleIndex]
  );
  // ⚠️ 用 listedPosts 而非 posts：否则非 admin 读公开文章时，「上一篇/下一篇」可能踩进
  //   时间上紧邻的 unlisted 文章，链接可达但没被列出的承诺就被这条导航链破了。
  //   活跃文章本身是 unlisted 时 idx 会是 -1（它不在 listedPosts 里），prev/next 都是 null——
  //   符合直觉：unlisted 是游离于时间线之外的孤岛，没有「上一篇/下一篇」。
  const { prevPost, nextPost } = useMemo(() => {
    if (!activePost) return { prevPost: null as BlogPost | null, nextPost: null as BlogPost | null };
    const idx = listedPosts.findIndex(p => p.id === activePost.id);
    return {
      nextPost: idx > 0 ? listedPosts[idx - 1] : null,                          // 时间上更新的一篇
      prevPost: idx >= 0 && idx < listedPosts.length - 1 ? listedPosts[idx + 1] : null, // 更早的一篇
    };
  }, [activePost, listedPosts]);
  const openPost = (p: BlogPost) => { setActivePost(p); readerRef.current?.scrollTo({ top: 0 }); };

  // 🧭 直链 ⇄ 阅读舱双向同步：
  //   · 地址含 #/garden/:id（分享 / 刷新 / 后退到某篇）→ 打开对应文章
  //   · 地址回到 #/garden（后退关闭）→ 收起阅读舱
  const { route: galleryRoute } = useHashRoute();
  useEffect(() => {
    if (galleryRoute.view !== 'garden') return;
    if (galleryRoute.itemId) {
      const p = posts.find(x => x.id === galleryRoute.itemId);
      if (p && p.id !== activePost?.id) setActivePost(p);
    } else if (activePost) {
      setActivePost(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryRoute.view, galleryRoute.itemId, posts]);

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

  // 上一篇文章 id：切走 / 关闭阅读舱前，把它停留的滚动位置存一笔最终进度，
  // 否则 400ms 防抖若还没触发就切走，最后一段阅读不会被记住。
  const prevPostIdRef = useRef<string | null>(null);
  // 续读定位尚未完成时（回顶 → 等图片 → 跳转这段过程）暂停自动保存，
  // 否则回顶触发的 scroll 事件会在跳转完成前把刚读出的进度以 0 覆盖掉。
  const restoringRef = useRef(false);
  // StrictMode 开发模式下会对本 effect 重复调用一次：第二次重复调用发生时 scrollTop
  // 已被第一次调用重置为 0，若不去重会把刚读到的进度当作「离开时的最终位置」错误覆盖为 0。
  // 用「上次真正处理过的 id」做幂等 guard，同一 id 的重复调用直接跳过。
  const processedIdRef = useRef<string | null | undefined>(undefined);
  // 📍 阅读进度防抖保存计时器：声明提到切篇 effect 之前，供其在切篇 / 关闭时抢先清掉
  const progressSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 世代计数器：每次真正切篇 +1。程序化回顶 / 跳转过程会引出若干「迟到」的滚动事件，
  // 它们各自排出的防抖保存即便没被 clearTimeout 逮到，触发时也会因世代号对不上而作废——
  // 比逐个排查「这次 scroll 事件到底是谁触发的」更可靠。
  const saveGenRef = useRef(0);
  useEffect(() => {
    const newId = activePost?.id ?? null;
    if (processedIdRef.current === newId) return;
    processedIdRef.current = newId;
    saveGenRef.current += 1;
    setResContent(''); setResAuthor(getVisitorAlias() ?? ''); setIsResFocused(false); setReplyingToId(null); setReplyInput('');
    // 换篇 / 关闭前先取消上一篇可能还挂着的防抖保存计时器（双保险，世代号才是最终防线）
    if (progressSaveTimer.current) { clearTimeout(progressSaveTimer.current); progressSaveTimer.current = null; }
    const el = readerRef.current;
    if (prevPostIdRef.current && el) {
      const max = el.scrollHeight - el.clientHeight;
      setReadProgress(prevPostIdRef.current, max > 1 ? el.scrollTop / max : 0);
    }
    prevPostIdRef.current = activePost?.id ?? null;
    // 打开新篇目：默认回到顶部，否则从「下一篇」进来会停在上一篇的滚动位置；
    // 若有未读完的续读进度（2%~92% 之间），改为在布局落定后跳到对应位置。
    // ⚠️ 关闭阅读舱（activePost 变 null）时不要再归零：此刻 AnimatePresence 仍在播放
    // 退出动画、DOM 节点还没卸载，归零会触发一次多余的 scroll 事件，把上面刚存好的
    // 退出进度覆盖回 0。
    if (activePost) {
      readerRef.current?.scrollTo({ top: 0 });
      const pct = getReadProgress(activePost.id);
      if (pct > 0.02 && pct < 0.92) {
        const postId = activePost.id;
        restoringRef.current = true;
        // 正文里的图片是异步加载的，此刻 scrollHeight 可能还没到最终高度，
        // 按半成品高度算出的位置会偏低。等图片都加载完（或 1.2s 超时兜底）再跳转。
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const el = readerRef.current;
          if (!el || activePostRef.current?.id !== postId) { restoringRef.current = false; return; }
          const imgs = Array.from(el.querySelectorAll('img')).filter(img => !img.complete);
          const jump = () => {
            const target = readerRef.current;
            if (target && activePostRef.current?.id === postId) {
              target.scrollTo({ top: pct * (target.scrollHeight - target.clientHeight) });
            }
            restoringRef.current = false;
          };
          if (imgs.length === 0) { jump(); return; }
          let settled = false;
          const done = () => { if (!settled) { settled = true; jump(); } };
          const timeout = setTimeout(done, 1200);
          Promise.all(imgs.map(img => new Promise<void>(res => {
            img.addEventListener('load', () => res(), { once: true });
            img.addEventListener('error', () => res(), { once: true });
          }))).then(() => { clearTimeout(timeout); done(); });
        }));
      }
    }
  }, [activePost?.id]);

  // 📍 阅读进度持久化：滚动时防抖记录百分比，供列表「续读」标记与下次自动跳转使用
  const handleReaderScroll = () => {
    const post = activePost;
    const el = readerRef.current;
    if (!post || !el || restoringRef.current) return;
    const gen = saveGenRef.current;
    if (progressSaveTimer.current) clearTimeout(progressSaveTimer.current);
    progressSaveTimer.current = setTimeout(() => {
      // 排出计时器期间若已切篇 / 关闭（世代号变了），这笔保存就是迟到的，作废
      if (restoringRef.current || gen !== saveGenRef.current) return;
      const max = el.scrollHeight - el.clientHeight;
      const pct = max > 1 ? el.scrollTop / max : 0;
      setReadProgress(post.id, pct);
    }, 400);
  };

  // 🏷️ 归一化去重：大小写/全半角/首尾空白不同的写法（"Miku" / "miku" / "ＭＩＫＵ"）
  //   曾各自当成独立标签，这里折成一个，展示名取出现次数最多的写法（见 lib/tags.ts）。
  const allTags = useMemo(() => {
    const canonicalOf = buildTagCanonicalMap(listedPosts.flatMap(p => p.tags));
    return Array.from(new Set(canonicalOf.values())).sort((a, b) => a.localeCompare(b));
  }, [listedPosts]);

  // 📚 合集索引（浏览用）：合集名 → 按时间正序的成员文章；「第 N 篇」由此推导，无需手工维护序号。
  //   基于 listedPosts——过滤面板的合集 chip、编辑器的合集联想都不该暴露 unlisted 成员。
  const seriesInfo = useMemo(() => {
    const map: Record<string, BlogPost[]> = {};
    listedPosts.forEach(p => { if (p.series) (map[p.series] ??= []).push(p); });
    Object.values(map).forEach(arr => arr.sort((a, b) => a.createdAt - b.createdAt));
    return map;
  }, [listedPosts]);
  const allSeries = useMemo(() => Object.keys(seriesInfo).sort(), [seriesInfo]);

  // 📖 阅读舱专用的合集视图：若正在读的这篇本身是 unlisted（靠分享链接直达，不在 listedPosts 里），
  //   把它自己补回所属合集，章节号才不会算错；不牵连同系列其它 unlisted 成员，
  //   否则一篇公开文章的「合集目录」会把系列里未公开的姊妹篇也列给所有访客看到。
  const readerSeriesInfo = useMemo(() => {
    if (!activePost?.series) return seriesInfo;
    const members = seriesInfo[activePost.series] ?? [];
    if (members.some(p => p.id === activePost.id)) return seriesInfo;
    const merged = [...members, activePost].sort((a, b) => a.createdAt - b.createdAt);
    return { ...seriesInfo, [activePost.series]: merged };
  }, [seriesInfo, activePost]);
  const chapterOf = (p: BlogPost) =>
    p.series ? (readerSeriesInfo[p.series]?.findIndex(x => x.id === p.id) ?? -1) + 1 : 0;

  // ⟲ 反向链接索引：目标文章 id → 提到它的来源文章 + 语境摘句。一次全量建索，
  //   任意文章打开都是 O(1) 查表——几百篇量级毫无压力。
  //   来源限定 listedPosts：否则一篇 unlisted 文章反链到某篇公开文章，会在那篇公开文章的
  //   「回响」区块里把 unlisted 的标题暴露给所有访客。
  const backlinkIndex = useMemo(() => buildBacklinkIndex(listedPosts), [listedPosts]);
  const activeBacklinks = useMemo(
    () => (activePost ? backlinkIndex.get(activePost.id) ?? [] : []),
    [activePost, backlinkIndex]
  );

  // 🍃 继续漫游：score = 3×(本文正向双链到对方) + 2×(标签重合数) + 1×(同类型)。
  //   排除自己、已在「合集目录」出现的同 series 文章、已在「回响」出现的文章——
  //   三个区块绝不重复展示同一篇。平分时时间越近越优先。
  const relatedPosts = useMemo(() => {
    if (!activePost) return [] as BlogPost[];
    const forwardIds = new Set(
      extractWikiLinks(activePost.content)
        .map((t) => postTitleIndex.get(t.trim().toLowerCase())?.id)
        .filter((id): id is string => !!id)
    );
    const excludeIds = new Set<string>([
      activePost.id,
      ...activeBacklinks.map((b) => b.post.id),
      ...(activePost.series ? (seriesInfo[activePost.series] ?? []).map((p) => p.id) : []),
    ]);
    const activeTags = new Set(activePost.tags);

    return listedPosts
      .filter((p) => !excludeIds.has(p.id))
      .map((p) => {
        const tagOverlap = p.tags.filter((t) => activeTags.has(t)).length;
        const score = (forwardIds.has(p.id) ? 3 : 0) + tagOverlap * 2 + (p.type === activePost.type ? 1 : 0);
        return { post: p, score, timeDelta: Math.abs(p.createdAt - activePost.createdAt) };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.timeDelta - b.timeDelta)
      .slice(0, 3)
      .map((x) => x.post);
  }, [activePost, listedPosts, postTitleIndex, activeBacklinks, seriesInfo]);

  // 🗓️ 那年今日：按节气名匹配更早年份写下的文章——solarTerms 从「氛围」变成「索引」。
  //   每个节气每位访客只提示一次（localStorage 记按年+节气名的 key），点 × 或点进文章后都不再出现。
  const termEchoSeenKey = useMemo(() => `oasis_term_echo_seen_${new Date().getFullYear()}_${currentSolarTerm().name}`, []);
  const [termEchoDismissed, setTermEchoDismissed] = useState(() => {
    try { return localStorage.getItem(termEchoSeenKey) === '1'; } catch { return true; }
  });
  const dismissTermEcho = () => {
    setTermEchoDismissed(true);
    try { localStorage.setItem(termEchoSeenKey, '1'); } catch { /* 容量/隐私模式失败可忽略，下次刷新再提示一次无妨 */ }
  };
  const termEchoPost = useMemo(() => {
    if (termEchoDismissed) return null;
    const term = currentSolarTerm();
    const thisYear = new Date().getFullYear();
    const candidates = listedPosts.filter(p => {
      const d = new Date(p.createdAt);
      return d.getFullYear() < thisYear && currentSolarTerm(d).name === term.name;
    });
    if (candidates.length === 0) return null;
    return candidates.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
  }, [listedPosts, termEchoDismissed]);

  // 🌿 最近照料：花园在生长的可见证据——只在真被「更新」过（而非发完顺手改错别字）
  //   且在 30 天内照料过的文章里，横向列出至多 3 篇。48h 阈值滤掉误差性小编辑。
  const recentlyTended = useMemo(() => {
    const now = Date.now();
    const DAY = 86400000;
    return listedPosts
      .filter(p => p.updatedAt - p.createdAt > 48 * 3600 * 1000 && now - p.updatedAt < 30 * DAY)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3);
  }, [listedPosts]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    listedPosts.forEach(p => { counts[p.type] = (counts[p.type] || 0) + 1; });
    return counts;
  }, [listedPosts]);

  // 🧭 分类横滚条：首次进入若溢出可滚，轻轻晃一下露出「这里能滑」，只做一次
  const catScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = catScrollRef.current;
    if (!el || localStorage.getItem('oasis_cat_scroll_hint')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => {
      if (el.scrollWidth <= el.clientWidth + 8) return;
      localStorage.setItem('oasis_cat_scroll_hint', '1');
      el.scrollTo({ left: 14, behavior: 'smooth' });
      setTimeout(() => el.scrollTo({ left: 0, behavior: 'smooth' }), 320);
    }, 600);
    return () => clearTimeout(t);
  }, []);

  const filteredPosts = useMemo(() => listedPosts.filter(post => {
    const matchType = selectedType ? post.type === selectedType : true;
    const matchTag = selectedTag ? post.tags.some(t => tagKey(t) === tagKey(selectedTag)) : true;
    const matchSeries = selectedSeries ? post.series === selectedSeries : true;
    // 🔍 全文检索：标题 / 摘要 / 正文 / 标签一并匹配，找回被藏在正文深处的思考
    const q = searchQuery.trim().toLowerCase();
    const matchSearch = q
      ? (post.title.toLowerCase().includes(q) ||
         post.excerpt.toLowerCase().includes(q) ||
         post.content.toLowerCase().includes(q) ||
         post.tags.some(t => t.toLowerCase().includes(q)))
      : true;
    return matchType && matchTag && matchSeries && matchSearch;
  }), [selectedType, selectedTag, selectedSeries, searchQuery, listedPosts]);

  // 📅 按月归档：周报 / 成长记录的时间叙事更清晰。
  //   排序规则从「隐式硬编码最新在前」变成可见可选的三态（见筛选栏 Sort 抽屉）：
  //   newest/oldest 仍按创建月份归档，只是组内外的方向一起翻转；
  //   tended 脱离「创建月份」这个坐标系——按「最近照料」排序时，文章可能是三年前写的却是昨天改的，
  //   硬套进创建月份分组只会制造新的困惑，所以退化成一条不分组的时间线。
  const groupedPosts = useMemo(() => {
    if (sortMode === 'tended') {
      const sorted = [...filteredPosts].sort((a, b) => b.updatedAt - a.updatedAt);
      return sorted.length ? [{ key: 'tended', label: '最近照料', posts: sorted }] : [];
    }
    const ordered = sortMode === 'oldest'
      ? [...filteredPosts].sort((a, b) => a.createdAt - b.createdAt)
      : filteredPosts; // 'newest'：filteredPosts 本就继承 useGarden 的全局倒序，无需再排一次
    const groups: { key: string; label: string; posts: BlogPost[] }[] = [];
    ordered.forEach(post => {
      const d = new Date(post.createdAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      let g = groups.find(x => x.key === key);
      if (!g) { g = { key, label, posts: [] }; groups.push(g); }
      g.posts.push(post);
    });
    return groups;
  }, [filteredPosts, sortMode]);

  useEffect(() => {
    // Esc 等同点 ✕：编辑器开着时走 closeEditorRef（落定保存），不再是纯粹的静默丢弃
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setActivePost(null); closeEditorRef.current(); setShowProfile(false); }
    };
    window.addEventListener('keydown', handleEsc); return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleResSubmit = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!resAuthor.trim() || !resContent.trim() || isResSubmitting) return;
    setIsResSubmitting(true);
    const rect = e.currentTarget.getBoundingClientRect();
    try {
      await leaveResonance(resAuthor, resContent, resColor);
      setVisitorAlias(resAuthor);
      setResContent(''); setIsResFocused(false);
      // 🫧 留下一片叶：有后果的动作，值得一圈涟漪
      emitRipple({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
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
    setEditContent(d.content); setEditColor(d.color); setEditType(d.type); setEditSeries(d.series ?? '');
    setEditGrowth(d.growth ?? 'seedling'); setEditStatus(d.status ?? 'published');
    setEditSlug(d.slug ?? ''); setEditExcerpt(d.excerpt ?? '');
    setDraftSavedAt(d.savedAt); setDraftMsg('已恢复上次未发布的草稿');
  };

  const startEditingPost = (post: BlogPost) => {
    const draft = readDraft(post.id);
    if (draft && draft.content !== post.content) {
      restoreDraft(draft);
    } else {
      setEditingId(post.id); setEditTitle(post.title); setEditTagList(post.tags); setEditColor(post.color); setEditContent(post.content); setEditType(post.type); setEditSeries(post.series ?? '');
      setEditGrowth(post.growth); setEditStatus(post.status);
      // ✂️ 只有手动写过的摘要才回填；等于自动截断结果时留空，让它继续跟随正文自动更新
      setEditSlug(post.slug ?? ''); setEditExcerpt(post.excerpt && post.excerpt !== makeExcerpt(post.content) ? post.excerpt : '');
      setDraftMsg('');
    }
    setTagInput(''); setEditorMode('write'); setShowMetaPanel(false); setActivePost(null); setIsEditing(true);
  };

  const startNewPost = () => {
    const draft = readDraft(null);
    if (draft && draft.content.trim() && !categories.some(c => draft.content === getTemplate(c.id))) {
      restoreDraft(draft);
    } else {
      const initialType = selectedType ?? 'thought';
      setEditingId(null); setEditTitle(''); setEditTagList([]); setEditContent(getTemplate(initialType)); setEditColor('#39C5BB'); setEditType(initialType); setEditSeries(selectedSeries ?? '');
      setEditGrowth('seedling'); setEditStatus('published');
      setEditSlug(''); setEditExcerpt('');
      setDraftMsg('');
    }
    setTagInput(''); setEditorMode('write'); setShowMetaPanel(false); setIsEditing(true);
  };

  // 丢弃当前草稿，回到空白新篇
  const discardDraft = () => {
    clearDraft();
    setEditingId(null); setEditTitle(''); setEditTagList([]); setTagInput(''); setEditSeries('');
    setEditGrowth('seedling'); setEditStatus('published');
    setEditSlug(''); setEditExcerpt('');
    setEditContent(getTemplate(editType)); setEditColor('#39C5BB');
  };

  // 🚪 关闭编辑器（✕ / Esc / 切走视图）：过去只是 setIsEditing(false)——草稿只落 localStorage，
  //   本体和云端毫无变化，"Update" 才会真的保存，点 ✕ 等于悄悄丢弃这次修改。现在按上下文自动落定：
  //   · 改既有文章、且相对原文有实质变化 → 直接保存（updateSeed），8 秒内可撤销（原文整篇回写）。
  //   · 新篇写了实质内容（超出空白模板）→ 落定成一枚 🌰 draft，进列表可见，
  //     不再是要点开同一入口才会从 localStorage 里悄悄冒出来的幽灵草稿。
  //   · 没动过 / 清空了 → 静默关闭，不留痕迹。
  //   「照料」判定单独算一次 diff 阈值（见 useGarden.updateSeed 的 touch 参数）：只有标题/类型/
  //   合集/标签变化，或正文变化超过 30 字符，才刷新 updatedAt——顺手改错别字不该让文章显得
  //   「刚被认真修订过」，冒出到侧栏「最近照料」里。
  const closeEditor = () => {
    if (!isEditing) return;
    const tagArray = [...editTagList, ...(tagInput.trim() ? [tagInput.trim()] : [])];
    const trimmedTitle = editTitle.trim();
    const trimmedContent = editContent.trim();

    if (editingId) {
      const original = posts.find(p => p.id === editingId);
      if (!trimmedContent) {
        // 清空了正文再关闭：不当成一次有效编辑，顺手清掉可能残留的旧草稿——
        // 否则下次打开这篇文章会被一份空草稿悄悄顶替（旧的已知坑）。
        clearDraft();
      } else if (original) {
        const titleChanged = trimmedTitle !== original.title.trim();
        const typeChanged = editType !== original.type;
        const seriesChanged = (editSeries.trim() || undefined) !== (original.series ?? undefined);
        const statusChanged = editStatus !== original.status;
        const growthChanged = editGrowth !== original.growth;
        const tagsChanged = tagArray.length !== original.tags.length || tagArray.some((t, i) => t !== original.tags[i]);
        const contentChanged = editContent !== original.content;

        if (contentChanged || titleChanged || typeChanged || seriesChanged || statusChanged || growthChanged || tagsChanged) {
          const touch = titleChanged || typeChanged || seriesChanged || tagsChanged || Math.abs(editContent.length - original.content.length) > 30;
          const input = { title: editTitle, tags: tagArray, color: editColor, content: editContent, type: editType, series: editSeries, growth: editGrowth, status: editStatus, slug: editSlug, excerpt: editExcerpt };
          updateSeed(editingId, input, { touch });
          clearDraft();
          if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
          setUndoNotice({ kind: 'update', postId: editingId, title: original.title, snapshot: original });
          undoTimerRef.current = setTimeout(() => setUndoNotice(null), 8000);
        } else {
          clearDraft(); // 没有实质变化，顺手清掉可能残留的旧草稿副本
        }
      }
    } else {
      // 新篇：内容偏离全部分类的空白模板才算「写了东西」，与「重新打开时是否恢复草稿」的判定口径一致
      const isBlank = !trimmedContent || categories.some(c => editContent === getTemplate(c.id));
      if (!isBlank) {
        const input = { title: editTitle, tags: tagArray, color: editColor, content: editContent, type: editType, series: editSeries, growth: editGrowth, status: 'draft' as PostStatus, slug: editSlug, excerpt: editExcerpt };
        const planted = plantSeed(input);
        clearDraft();
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        setUndoNotice({ kind: 'new-draft', postId: planted.id, title: planted.title });
        undoTimerRef.current = setTimeout(() => setUndoNotice(null), 8000);
      }
    }
    setIsEditing(false);
  };
  closeEditorRef.current = closeEditor;

  // ↺ 撤销：'update' 把关闭前的原文整篇回写（不再算一次照料）；'new-draft' 把刚落定的草稿拔掉
  const handleUndo = () => {
    if (!undoNotice) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (undoNotice.kind === 'update') {
      const s = undoNotice.snapshot;
      updateSeed(s.id, { title: s.title, tags: s.tags, color: s.color, content: s.content, type: s.type, series: s.series, growth: s.growth, status: s.status, slug: s.slug, excerpt: s.excerpt }, { touch: false });
    } else {
      uprootSeed(undoNotice.postId);
    }
    setUndoNotice(null);
  };

  // origin 留空：⌘⏎ 键盘发布（正文区 / 标题栏两处快捷键）没有一个有意义的落点，
  // 涟漪就近落在发布按钮惯常所在的右下角；鼠标点击发布按钮时用按钮真实位置更精确。
  const handlePublish = (origin?: { x: number; y: number }) => {
    if (!editContent.trim()) return;
    const tagArray = [...editTagList, ...(tagInput.trim() ? [tagInput.trim()] : [])];
    const input = { title: editTitle, tags: tagArray, color: editColor, content: editContent, type: editType, series: editSeries, growth: editGrowth, status: editStatus, slug: editSlug, excerpt: editExcerpt };
    if (editingId) updateSeed(editingId, input); else plantSeed(input);
    clearDraft();
    setIsEditing(false);
    // 存草稿不值得庆祝，只有真正公开出去的才道贺
    if (editStatus !== 'draft') {
      emitMikuSignal({ type: 'published' });
      emitRipple(origin ?? { x: window.innerWidth - 96, y: window.innerHeight - 64 });
    }
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to uproot this thought?')) { uprootSeed(id); setActivePost(null); }
  };

  return (
    <motion.div className="absolute inset-0 w-full h-full overflow-hidden flex">
      
      {/* 🌿 左侧「园丁的一隅」：去容器化的开放身份栏，用光与留白锚定，与右栏报头共享顶部起跑线 */}
      <AnimatePresence>
        {(
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
      <div className="oasis-bottom-scroll-safe w-full lg:w-2/3 h-full overflow-y-auto no-scrollbar pt-14 md:pt-24 pb-32 px-5 md:px-8 lg:px-16 relative z-10 flex flex-col">
        <div className="w-full h-full flex flex-col">
              {/* 📱 移动端身份条：小屏没有左栏时，报头上方一行轻量署名，点击展开完整档案。
                  已经报过一次「我是谁」，下方报头在移动端不必再报「这是什么」——只留一行坐标即可，
                  让第一张卡片尽快出现在折叠线之上。 */}
              <button onClick={() => setShowProfile(true)} className="lg:hidden flex items-center justify-center gap-3 mb-4 mx-auto group">
                <span className="w-9 h-9 rounded-full overflow-hidden border border-white/60 dark:border-white/10 shadow-sm shrink-0 bg-white/20 dark:bg-white/5">
                  <img src="/avatar.jpg" alt="Bob Lee" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                </span>
                <span className="font-serif text-lg text-slate-600 dark:text-slate-200 transition-colors duration-[1500ms]">Bob Lee</span>
                <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-slate-400/80 group-hover:text-[#39C5BB] transition-colors">Profile →</span>
              </button>

              {/* 📰 栏目报头：与左栏头像同高起步、居中，让两侧基线与对齐方式一致 */}
              <div className="mb-5 md:mb-9 text-center">
                <div className="font-mono text-[9px] tracking-[0.5em] uppercase text-[#39C5BB]/70 mb-3">The Garden · 数字花园</div>
                <h1 className="hidden md:block font-serif text-4xl text-slate-700 dark:text-slate-100 tracking-wide transition-colors duration-[1500ms] ease-in-out">Curated Thoughts</h1>
                <p className="hidden md:block font-serif italic text-slate-400 dark:text-slate-500 text-sm mt-2.5 transition-colors duration-[1500ms] ease-in-out">A quiet record of learning, growth &amp; small wonders.</p>
              </div>

              <div className="mb-10">
                {/* 🧭 目录线：居中类型筛选为主轴，两端安静收纳搜索 / 标签 / 管理动作，一条线承载全部控件 */}
                <div className="relative border-y border-slate-200/70 dark:border-white/[0.07] py-3 px-2 xl:px-56 flex flex-col md:flex-row items-center justify-center gap-x-4 md:gap-x-6 gap-y-3 md:gap-y-2.5 md:flex-wrap transition-colors duration-[1500ms]">
                  {/* 分类：移动端单行横滚，避免换行拥挤；md+ 恢复居中换行原样。
                      oasis-hscroll-fade 补回 no-scrollbar 吃掉的「这里能滑」视觉线索 */}
                  <div ref={catScrollRef} className="oasis-hscroll-fade flex items-center gap-x-4 md:gap-x-6 w-full overflow-x-auto no-scrollbar md:w-auto md:contents">
                  <button onClick={() => setSelectedType(null)} className={`shrink-0 font-mono text-[10px] tracking-[0.18em] uppercase pb-0.5 border-b transition-all duration-500 ${!selectedType ? 'text-slate-700 dark:text-slate-100 border-[#39C5BB]' : 'text-slate-400 dark:text-slate-500 border-transparent hover:text-slate-600 dark:hover:text-slate-300'}`}>
                    All <span className="opacity-50 tracking-normal">{listedPosts.length}</span>
                  </button>
                  {/* 空分类（0 篇）不占这条稀缺的横向空间——除非它正被选中，否则筛出 0 篇后会把用户困在无出口的状态里 */}
                  {categories.filter(t => (typeCounts[t.id] || 0) > 0 || selectedType === t.id).map(t => {
                    const active = selectedType === t.id;
                    const count = typeCounts[t.id] || 0;
                    return (
                      <button key={t.id} onClick={() => setSelectedType(active ? null : t.id)} title={t.zh}
                        className={`shrink-0 font-mono text-[10px] tracking-[0.18em] uppercase pb-0.5 border-b transition-all duration-500 ${active ? 'oasis-accent-ink' : 'text-slate-400 dark:text-slate-500 border-transparent hover:text-slate-600 dark:hover:text-slate-300'}`}
                        style={active ? { '--accent': t.color, borderColor: t.color } as React.CSSProperties : undefined}>
                        {t.label} <span className="opacity-50 tracking-normal">{count}</span>
                      </button>
                    );
                  })}
                  </div>

                  {/* 搜索 + 右侧动作：移动端收作独立一行，两端对齐；md+ 各自归位到目录线两端 */}
                  <div className="flex items-center justify-between w-full md:contents">
                  {/* 左端：搜索，点击展开输入（小中屏随流排列，xl+ 吸附左端） */}
                  <div className="order-last xl:order-none w-auto xl:absolute xl:left-0 xl:top-1/2 xl:-translate-y-1/2 flex items-center gap-2">
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

                  {/* 右端：合集/标签抽屉开关 + 管理动作（小中屏随流排列，xl+ 吸附右端） */}
                  <div className="order-last xl:order-none xl:absolute xl:right-0 xl:top-1/2 xl:-translate-y-1/2 flex items-center gap-4">
                    {allSeries.length > 0 && (
                      <button onClick={() => setShowSeries(v => !v)} className={`font-mono text-[10px] tracking-[0.18em] uppercase transition-colors ${showSeries || selectedSeries ? 'text-[#39C5BB]' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}>Series</button>
                    )}
                    {allTags.length > 0 && (
                      <button onClick={() => setShowTags(v => !v)} className={`font-mono text-[10px] tracking-[0.18em] uppercase transition-colors ${showTags || selectedTag ? 'text-[#39C5BB]' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}># Tags</button>
                    )}
                    {filteredPosts.length > 1 && (
                      <button onClick={() => setShowSort(v => !v)} title="排序规则" className={`font-mono text-[10px] tracking-[0.18em] uppercase transition-colors ${showSort || sortMode !== 'newest' ? 'text-[#39C5BB]' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}>↓ Sort</button>
                    )}
                    {isAdmin && (
                      <>
                        <button onClick={handleSyncToCloud} disabled={syncState === 'syncing'} title="把本地全部文章一键同步到 Supabase 云端" className="font-mono text-[10px] tracking-[0.18em] uppercase text-slate-400 dark:text-slate-500 hover:text-[#39C5BB] transition-colors disabled:opacity-40">{syncState === 'syncing' ? '☁ …' : '☁'}</button>
                        <button onClick={startNewPost} className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#39C5BB] hover:text-[#2da098] transition-colors">+ Seed</button>
                      </>
                    )}
                  </div>
                  </div>

                  {/* 同步结果轻提示 */}
                  <AnimatePresence>
                    {syncMsg && <motion.span initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute -bottom-6 right-0 font-mono text-[9px] tracking-wider text-[#39C5BB] normal-case">{syncMsg}</motion.span>}
                  </AnimatePresence>
                </div>

                {/* 📚 合集抽屉：列出所有连载与篇数，点选只看该合集 */}
                <AnimatePresence>
                  {showSeries && allSeries.length > 0 && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
                      <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 pt-4 pb-1">
                        <button onClick={() => setSelectedSeries(null)} className={`font-mono text-[9px] tracking-widest uppercase transition-colors duration-500 ${!selectedSeries ? 'text-[#39C5BB]' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}>📚 all</button>
                        {allSeries.map(s => (
                          <button key={s} onClick={() => setSelectedSeries(selectedSeries === s ? null : s)} className={`font-serif text-xs transition-colors duration-500 ${selectedSeries === s ? 'text-[#39C5BB] border-b border-[#39C5BB]/60' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}>{s} <span className="font-mono text-[9px] opacity-50">{seriesInfo[s].length}</span></button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

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

                {/* 🔀 排序抽屉：把此前隐式的「最新在前」规则摆到明处，可切换 */}
                <AnimatePresence>
                  {showSort && filteredPosts.length > 1 && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
                      <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 pt-4 pb-1">
                        {([['newest', '最新在前'], ['oldest', '最早在前'], ['tended', '最近照料']] as const).map(([mode, label]) => (
                          <button key={mode} onClick={() => setSortMode(mode)} className={`font-mono text-[9px] tracking-widest uppercase transition-colors duration-500 ${sortMode === mode ? 'text-[#39C5BB] border-b border-[#39C5BB]/60' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}>{label}</button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 🗓️ 那年今日：同一节气，更早一年写下的文章——稀缺的惊喜，每节气只出现一次 */}
              <AnimatePresence>
                {termEchoPost && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                    className="flex items-center justify-center gap-2 mb-8 -mt-2 text-center"
                  >
                    <button
                      onClick={() => { dismissTermEcho(); openPost(termEchoPost); }}
                      className="font-serif italic text-sm text-slate-400 dark:text-slate-500 hover:text-slate-500 dark:hover:text-slate-300 transition-colors"
                    >
                      {new Date(termEchoPost.createdAt).getFullYear()} 年{currentSolarTerm().name}，你写下了《
                      <span style={{ '--accent': termEchoPost.color } as React.CSSProperties} className="not-italic oasis-accent-ink">{termEchoPost.title}</span>
                      》—— 要回去看看吗
                    </button>
                    <button onClick={dismissTermEcho} aria-label="不再提示" className="text-slate-300 dark:text-slate-600 hover:text-slate-400 dark:hover:text-slate-400 transition-colors text-xs px-1">✕</button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 🌿 最近照料：花园在生长的可见证据，只在真有文章被认真修订过时才出现 */}
              {recentlyTended.length > 0 && (
                <div className="flex items-center justify-center gap-2.5 flex-wrap mb-8 -mt-2 font-mono text-[9px] tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500">
                  <span className="text-[#39C5BB]/70">🌿 最近照料</span>
                  {recentlyTended.map((p, i) => (
                    <React.Fragment key={p.id}>
                      {i > 0 && <span className="opacity-40">·</span>}
                      <button onClick={() => openPost(p)} className="normal-case tracking-normal font-serif text-slate-500 dark:text-slate-400 hover:text-[#39C5BB] transition-colors">{p.title}</button>
                    </React.Fragment>
                  ))}
                </div>
              )}

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

                      {/* 🗂️ 行优先 grid（非列优先的 CSS multicol）：卡片高度参差不齐时，
                          multicol 会先灌满左列再灌右列，导致「第 6 新」的文章显示在「第 2、3 新」上方，
                          时间线肉眼不可读。grid + items-start 保证 1|2 / 3|4 逐行铺开，顺序即时间。 */}
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
                        {group.posts.map((post) => {
                          const meta = metaOf(post.type);
                          // 📍 续读进度：2%~92% 之间视为「读到一半」，读完或未读都不打扰
                          const progress = getReadProgress(post.id);
                          const isOngoing = progress > 0.02 && progress < 0.92;
                          return (
                            // ✨ 优化卡片背景：夜间采用纯白微透明度，透出深色星河底色，绝对不会发黑模糊
                            // 🌗 明暗两态走不同的建立层次的手法：暗色靠提高白度制造深浅（背景本就近黑，
                            //    提亮即分层）；浅色靠投影 + 更饱和的底色——白边在暖纸白背景上几乎隐形，
                            //    只提高透明度不够，边框改极淡墨色、配一层克制的静态阴影，卡片才立得起来。
                            <motion.div key={post.id} className={`oasis-post-card relative rounded-3xl cursor-pointer overflow-hidden border transition-colors duration-[1500ms] ease-in-out shadow-[0_1px_2px_rgba(30,41,59,0.04),0_10px_28px_-14px_rgba(30,41,59,0.12)] dark:shadow-none ${post.status === 'draft' ? 'border-dashed border-slate-300/70 dark:border-white/20 opacity-80' : post.status === 'unlisted' ? 'border-dashed border-[#60A5FA]/40 dark:border-[#60A5FA]/30' : 'border-slate-900/[0.06] dark:border-white/10 hover:dark:bg-white/[0.08]'} ${coarse ? 'bg-white/[0.82] dark:bg-white/[0.06]' : 'bg-white/[0.72] dark:bg-white/[0.04]'}`} style={coarse ? undefined : { backdropFilter: `blur(12px)` }} initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: post.status === 'draft' ? 0.8 : 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: "spring", stiffness: 260, damping: 25 }} whileHover={{ y: -6, scale: 1.02, boxShadow: `0 20px 40px rgba(0,0,0,0.05), 0 0 30px ${post.color}15` }} whileTap={{ scale: 0.96 }}>
                              <div className="h-28 w-full relative overflow-hidden">
                                {/* 情绪色柔渐变背景：替代空头图，给卡片质感与归属感 */}
                                <div className="absolute inset-0 transition-all duration-[1500ms] ease-in-out" style={{ background: `linear-gradient(135deg, ${post.color}29, ${post.color}0a 55%, transparent)` }} />
                                {/* 大类型图标水印：淡化的情绪色，去占位感 */}
                                <div className="absolute -right-3 -bottom-6 w-28 h-28 opacity-[0.13] dark:opacity-[0.16] pointer-events-none transition-opacity duration-[1500ms]" style={{ color: post.color }}><CategoryIcon name={meta.icon} /></div>
                                {/* 类型徽章：左上角，图标 + 名称，染类型微光色 */}
                                <div className="absolute top-4 left-6 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 dark:bg-black/50 backdrop-blur-sm border border-white/60 dark:border-white/10 oasis-accent-ink" style={{ '--accent': meta.color } as React.CSSProperties}>
                                  <span className="w-3 h-3"><CategoryIcon name={meta.icon} /></span>
                                  <span className="font-mono text-[8px] tracking-[0.2em] uppercase">{meta.label}</span>
                                </div>
                                {/* 🌰 草稿徽章 / 🔗 unlisted 徽章：仅 admin 视角（模拟访客已被过滤掉）能看到自己埋下的种子 */}
                                {post.status === 'draft' && (
                                  <div className="absolute top-4 right-6 flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/70 dark:bg-black/50 backdrop-blur-sm border border-dashed border-[#FFB7C5]/60 text-[#FFB7C5]">
                                    <span className="font-mono text-[8px] tracking-[0.2em] uppercase">Draft · 尚未破土</span>
                                  </div>
                                )}
                                {post.status === 'unlisted' && (
                                  <div className="absolute top-4 right-6 flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/70 dark:bg-black/50 backdrop-blur-sm border border-dashed border-[#60A5FA]/60 text-[#60A5FA]">
                                    <span className="font-mono text-[8px] tracking-[0.2em] uppercase">Unlisted · 仅链接可达</span>
                                  </div>
                                )}
                                <div className="absolute bottom-4 left-6 flex space-x-2">{post.tags.slice(0, 3).map(tag => <span key={tag} className="font-mono text-[9px] tracking-widest text-slate-500 dark:text-slate-300 uppercase bg-white/60 dark:bg-black/60 px-2 py-1 rounded backdrop-blur-sm border border-white/50 dark:border-white/10 transition-colors duration-[1500ms] ease-in-out">{tag}</span>)}</div>
                              </div>
                              <div className="p-6 md:p-8">
                                <div className="font-mono text-[10px] tracking-[0.2em] text-slate-400 dark:text-slate-500 uppercase mb-4 flex items-center gap-2 transition-colors duration-[1500ms]"><GrowthGlyph growth={post.growth} color={post.color} /><span>{post.date}</span><span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span><span className="opacity-70">{readingTimeLabel(post.content)}</span>{post.series && <><span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span><span className="text-[#39C5BB]/80 normal-case tracking-normal font-serif">📚 {post.series} · {chapterOf(post)}</span></>}{isOngoing && <><span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span><span className="normal-case tracking-normal oasis-accent-ink" style={{ '--accent': post.color } as React.CSSProperties}>续读 {Math.round(progress * 100)}%</span></>}</div>
                                <h2 className="font-serif text-xl md:text-2xl text-slate-700 dark:text-slate-100 leading-snug mb-4 transition-colors duration-[1500ms] ease-in-out">
                                  {/* 🔗 卡片整体可点：标题挂真链接，::after 铺满最近的 relative 祖先（卡片本身），
                                      键盘可达、⌘-click 新开、右键可复制——而不是纯 div onClick 假装是链接 */}
                                  <a
                                    href={`#/garden/${post.id}`}
                                    onClick={(e) => {
                                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                                      e.preventDefault();
                                      setActivePost(post);
                                    }}
                                    className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                                  >
                                    {post.title}
                                  </a>
                                </h2>
                                <p className="font-serif text-slate-600 dark:text-slate-300 text-sm leading-relaxed line-clamp-3 whitespace-pre-line transition-colors duration-[1500ms] ease-in-out">{post.excerpt}</p>
                              </div>
                              {isOngoing && <div className="absolute bottom-0 left-0 h-[2px] transition-all duration-700" style={{ width: `${progress * 100}%`, backgroundColor: post.color }} />}
                            </motion.div>
                          );
                        })}
                      </div>
                    </motion.section>
                  ))}
                </AnimatePresence>
                {filteredPosts.length === 0 && <div className="pt-20 text-center font-serif text-slate-400 dark:text-slate-600 italic">这里还没有落下的种子，去种下第一颗吧。</div>}
              </div>
            </div>
      </div>

      {/* ✍️ 沉浸式全屏书房：portal 到 body 跳出视图层的 stacking context，写作接管整个视口 */}
      {createPortal(<AnimatePresence>
        {isEditing && (
          <motion.div key="editor-overlay" className="fixed inset-0 z-[210] flex flex-col bg-[#FAF8F3] dark:bg-[#0A0F1D] transition-colors duration-[1500ms] ease-in-out"
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30, filter: 'blur(8px)' }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
               <div className="shrink-0 w-full max-w-6xl mx-auto px-6 md:px-10 pt-5 md:pt-6 flex items-center justify-between">
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
                   <button onClick={closeEditor} title="收起编辑器（修改会直接落定，8 秒内可撤销）" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
                 </div>
               </div>
               
               {/* 写作主区：居中限宽 ~72ch 阅读友好，标题即页面第一行 */}
               <div className="flex-1 min-h-0 w-full max-w-6xl mx-auto px-6 md:px-10 flex flex-col">
               <input type="text" placeholder="Title..." value={editTitle} onChange={e => setEditTitle(e.target.value)}
                 onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handlePublish(); } }}
                 className="w-full shrink-0 bg-transparent text-3xl md:text-5xl font-serif text-slate-700 dark:text-slate-200 pt-6 md:pt-8 mb-6 outline-none placeholder:text-slate-300 dark:placeholder:text-slate-700 transition-colors duration-[1500ms] ease-in-out" disabled={isPreviewMode} />

               {isPreviewMode ? (
                 <div className="flex-1 w-full overflow-y-auto no-scrollbar mb-8 notranslate" translate="no">
                   {previewContent.trim() ? <Markdown>{previewContent}</Markdown> : <div className="text-slate-300 dark:text-slate-600 italic text-center mt-20">No content to preview...</div>}
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
                       <button key={t.label} type="button" onMouseDown={e => e.preventDefault()} onClick={t.run} title={t.title}
                         className="min-w-[30px] h-7 px-2 flex items-center justify-center font-mono text-[12px] rounded-md text-slate-500 dark:text-slate-400 hover:bg-[#39C5BB]/10 hover:text-[#39C5BB] transition-colors">
                         {t.label}
                       </button>
                     ))}
                     <span className="ml-auto font-mono text-[9px] tracking-widest text-slate-300 dark:text-slate-600 uppercase">Markdown · GFM · 表格/代码/任务</span>
                   </div>
                   {/* ✍️ 写作区：write 单栏（宽屏侧挂大纲）/ split 左写右读 */}
                   <div className="flex-1 flex gap-8 min-h-0 mb-3">
                     <textarea ref={editorRef} value={editContent} onChange={e => setEditContent(e.target.value)} onKeyDown={handleEditorKeyDown} onScroll={editorMode === 'split' ? syncPreviewScroll : undefined} placeholder="Let your thoughts flow..." className="flex-1 min-w-0 bg-transparent font-serif text-lg leading-loose text-slate-600 dark:text-slate-300 outline-none resize-none placeholder:text-slate-300/50 dark:placeholder:text-slate-700 no-scrollbar transition-colors duration-[1500ms] ease-in-out" />
                     {editorMode === 'split' && (
                       <div ref={previewRef} className="hidden lg:block flex-1 min-w-0 overflow-y-auto no-scrollbar pl-8 border-l border-slate-200/60 dark:border-white/5 notranslate" translate="no">
                         {previewContent.trim() ? <Markdown>{previewContent}</Markdown> : <div className="text-slate-300 dark:text-slate-600 italic text-center mt-20">Preview...</div>}
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
                 </>
               )}
               </div>

               {/* 🧾 底部元信息舱：分类 / 合集 / 标签 / 颜色收进抽屉，写作视野只留正文 */}
               <div className="shrink-0 w-full border-t border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] backdrop-blur-md transition-colors duration-[1500ms]">
                 <AnimatePresence>
                   {showMetaPanel && (
                     <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
                       <div className="w-full max-w-6xl mx-auto px-6 md:px-10 pt-5 flex flex-col gap-5 max-h-[45dvh] overflow-y-auto no-scrollbar">
                         {/* 🌱 类型选择：内置 + 自定义分类，行末可即时新建 */}
                         <div className="flex flex-wrap items-center gap-2">
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
                                     className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-400/90 dark:bg-slate-600 text-white text-[9px] leading-4 text-center opacity-100 md:opacity-0 md:group-hover/cat:opacity-100 transition-opacity hover:bg-red-400">×</span>
                                 )}
                               </button>
                             );
                           })}
                           <button onClick={() => setShowCatForm(v => !v)} title="新建分类"
                             className={`font-mono text-[10px] tracking-[0.15em] uppercase px-4 py-2 rounded-full border border-dashed transition-colors ${showCatForm ? 'text-[#39C5BB] border-[#39C5BB]/60' : 'text-slate-400 dark:text-slate-500 border-slate-300/60 dark:border-white/15 hover:text-[#39C5BB] hover:border-[#39C5BB]/50'}`}>+ New</button>
                         </div>

                         {/* 🆕 新建分类内联表单：名字 + 颜色 + 图标即刻生效 */}
                         <AnimatePresence>
                           {showCatForm && (
                             <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                               <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4 rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white/40 dark:bg-white/[0.03]">
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

                         {/* 📚 合集：同主题连载归属，自动联想已有合集名；序号按发布时间推导 */}
                         <div className="flex items-center gap-3">
                           <span className="font-mono text-[9px] tracking-[0.25em] uppercase text-slate-400 dark:text-slate-500 select-none shrink-0 w-14">Series</span>
                           <input type="text" list="oasis-series-options" placeholder="合集名 · 可留空（如「悉尼生活」「React 深入」）" value={editSeries} onChange={e => setEditSeries(e.target.value)}
                             className="flex-1 max-w-md bg-transparent border-b border-slate-300/60 dark:border-white/15 font-serif text-sm text-slate-600 dark:text-slate-300 outline-none pb-1 placeholder:text-slate-400/50 dark:placeholder:text-slate-600 transition-colors" />
                           <datalist id="oasis-series-options">{allSeries.map(s => <option key={s} value={s} />)}</datalist>
                           {editSeries.trim() && seriesInfo[editSeries.trim()] && !editingId && (
                             <span className="font-mono text-[9px] tracking-wider text-[#39C5BB]/70 whitespace-nowrap">将成为第 {seriesInfo[editSeries.trim()].length + 1} 篇</span>
                           )}
                         </div>

                         {/* 🔗 短链：留空发布时自动从标题生成（中文标题直接保留汉字，不转拼音） */}
                         <div className="flex items-center gap-3">
                           <span className="font-mono text-[9px] tracking-[0.25em] uppercase text-slate-400 dark:text-slate-500 select-none shrink-0 w-14">Slug</span>
                           <span className="font-mono text-xs text-slate-300 dark:text-slate-600 select-none shrink-0">/p/</span>
                           <input type="text" placeholder="留空 · 自动从标题生成" value={editSlug} onChange={e => setEditSlug(e.target.value)}
                             className="flex-1 max-w-md bg-transparent border-b border-slate-300/60 dark:border-white/15 font-mono text-xs text-slate-600 dark:text-slate-300 outline-none pb-1 placeholder:text-slate-400/50 dark:placeholder:text-slate-600 transition-colors" />
                         </div>

                         {/* ✂️ 摘要：留空则用正文自动截断（下方 placeholder 即时预览会截成什么样） */}
                         <div className="flex items-start gap-3">
                           <span className="font-mono text-[9px] tracking-[0.25em] uppercase text-slate-400 dark:text-slate-500 select-none shrink-0 w-14 pt-1.5">Excerpt</span>
                           <textarea rows={2} placeholder={editContent.trim() ? makeExcerpt(editContent) : '留空 · 自动截断正文前 110 字'} value={editExcerpt} onChange={e => setEditExcerpt(e.target.value)}
                             className="flex-1 max-w-2xl bg-transparent border-b border-slate-300/60 dark:border-white/15 font-serif text-sm text-slate-600 dark:text-slate-300 outline-none pb-1 resize-none placeholder:text-slate-400/50 dark:placeholder:text-slate-600 transition-colors" />
                         </div>

                         {/* 🌱🌿🌳 生长度：自述性质，花园会长大 */}
                         <div className="flex items-center gap-3 flex-wrap">
                           <span className="font-mono text-[9px] tracking-[0.25em] uppercase text-slate-400 dark:text-slate-500 select-none shrink-0 w-14">Growth</span>
                           {([
                             { v: 'seedling' as Growth, label: '🌱 种子' },
                             { v: 'growing' as Growth, label: '🌿 生长中' },
                             { v: 'evergreen' as Growth, label: '🌳 常青' },
                           ]).map(({ v, label }) => (
                             <button key={v} onClick={() => setEditGrowth(v)}
                               className={`font-serif text-xs px-3 py-1.5 rounded-full border transition-colors duration-300 ${editGrowth === v ? 'text-[#39C5BB] border-[#39C5BB]/60 bg-[#39C5BB]/5' : 'text-slate-400 dark:text-slate-500 border-slate-300/50 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/25'}`}>
                               {label}
                             </button>
                           ))}
                         </div>

                         {/* 📝 可见性：published 所有人可见并列出 / unlisted 不进列表·归档·搜索·RSS·sitemap，但持有链接的人都能读到 / draft 仅自己登录可见 */}
                         <div className="flex items-center gap-3 flex-wrap">
                           <span className="font-mono text-[9px] tracking-[0.25em] uppercase text-slate-400 dark:text-slate-500 select-none shrink-0 w-14">Visible</span>
                           {([
                             { v: 'published' as PostStatus, label: '公开可见', active: 'text-[#39C5BB] border-[#39C5BB]/60 bg-[#39C5BB]/5' },
                             { v: 'unlisted' as PostStatus, label: '🔗 仅链接可达', active: 'text-[#60A5FA] border-[#60A5FA]/60 bg-[#60A5FA]/5' },
                             { v: 'draft' as PostStatus, label: '🌰 先埋进土里', active: 'text-[#FFB7C5] border-[#FFB7C5]/50 bg-[#FFB7C5]/5' },
                           ]).map(({ v, label, active }) => (
                             <button key={v} onClick={() => setEditStatus(v)}
                               title={v === 'draft' ? '草稿：仅自己登录时可见，不进入公开列表' : v === 'unlisted' ? '不进主列表/归档/搜索/RSS/sitemap，但持有分享链接的人都能读到' : '所有人可见，进入主列表与站外索引'}
                               className={`font-mono text-[9px] tracking-[0.15em] uppercase px-3 py-1.5 rounded-full border transition-colors duration-300 ${editStatus === v ? active : 'text-slate-400 dark:text-slate-500 border-slate-300/50 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/25'}`}>
                               {label}
                             </button>
                           ))}
                         </div>

                         <div className="flex items-center space-x-6 pb-5">
                           {/* 🏷️ 标签 chip 输入：回车成签、点 × 摘除、下拉复用已有标签 */}
                           <div className="flex-1 relative flex flex-wrap items-center gap-2">
                             <span className="font-mono text-[9px] tracking-[0.25em] uppercase text-slate-400 dark:text-slate-500 select-none shrink-0 w-14">Tags</span>
                             {editTagList.map(tag => (
                               <span key={tag} className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest uppercase px-2.5 py-1 rounded-full bg-slate-500/[0.08] dark:bg-white/[0.08] text-slate-500 dark:text-slate-300">
                                 {tag}
                                 <button onClick={() => setEditTagList(editTagList.filter(t => t !== tag))} className="text-slate-400 hover:text-red-400 transition-colors">×</button>
                               </span>
                             ))}
                             <input type="text" placeholder={editTagList.length ? '' : '回车添加'} value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={handleTagKeyDown}
                               className="flex-1 min-w-[120px] bg-transparent font-mono text-xs tracking-widest text-slate-500 dark:text-slate-400 outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600 uppercase transition-colors" />
                             {/* 已有标签联想：贴近屏幕底部，向上弹出 */}
                             {tagInput.trim() && allTags.some(t => t.toLowerCase().includes(tagInput.trim().toLowerCase()) && !editTagList.some(e => tagKey(e) === tagKey(t))) && (
                               <div className="absolute bottom-full left-0 mb-2 z-30 flex flex-wrap gap-2 max-w-full p-3 rounded-xl bg-white/90 dark:bg-[#111827]/95 backdrop-blur-xl border border-slate-200/70 dark:border-white/10 shadow-lg">
                                 {allTags.filter(t => t.toLowerCase().includes(tagInput.trim().toLowerCase()) && !editTagList.some(e => tagKey(e) === tagKey(t))).slice(0, 8).map(t => (
                                   <button key={t} onClick={() => commitTag(t)} className="font-mono text-[10px] tracking-widest uppercase text-slate-500 dark:text-slate-400 hover:text-[#39C5BB] transition-colors">#{t}</button>
                                 ))}
                               </div>
                             )}
                           </div>
                           <div className="flex items-center space-x-2">
                             {AURA_COLORS.map(c => <div key={c} onClick={() => setEditColor(c)} className={`w-4 h-4 rounded-full cursor-pointer transition-transform ${editColor === c ? 'scale-125' : 'opacity-40 hover:opacity-100'}`} style={{ backgroundColor: c, boxShadow: editColor === c ? `0 0 0 2px transparent, 0 0 0 4px ${c}` : 'none' }} />)}
                           </div>
                         </div>
                       </div>
                     </motion.div>
                   )}
                 </AnimatePresence>

                 {/* 发布栏：状态 · 元信息开关 · 发布 */}
                 <div className="w-full max-w-6xl mx-auto px-6 md:px-10 py-3.5 flex items-center gap-3 md:gap-5">
                   <div className="flex items-center gap-3 font-mono text-[9px] tracking-widest uppercase text-slate-300 dark:text-slate-600 select-none min-w-0">
                     <span className="hidden sm:inline">{editContent.length} chars</span>
                     <span>{readingMinutes(editContent)} min</span>
                     {draftSavedAt && <span className="text-[#39C5BB]/60 normal-case truncate">草稿已存 {new Date(draftSavedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>}
                   </div>
                   <span className="hidden lg:inline font-mono text-[9px] tracking-widest text-slate-300 dark:text-slate-600 normal-case select-none">⌘B 粗体 · ⌘I 斜体 · ⌘K 链接 · ⌘⏎ 发布</span>
                   <button onClick={() => setShowMetaPanel(v => !v)}
                     className={`ml-auto flex items-center gap-2 font-mono text-[10px] tracking-[0.15em] uppercase px-4 py-2 rounded-full border transition-all duration-300 ${showMetaPanel ? 'text-[#39C5BB] border-[#39C5BB]/50 bg-[#39C5BB]/5' : 'text-slate-500 dark:text-slate-400 border-slate-300/50 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/25'}`}>
                     <span className="w-3.5 h-3.5" style={{ color: metaOf(editType).color }}><CategoryIcon name={metaOf(editType).icon} /></span>
                     <span className="hidden sm:inline">{metaOf(editType).label}</span>
                     {editTagList.length > 0 && <span className="opacity-60 normal-case">#{editTagList.length}</span>}
                     {editSeries.trim() && <span className="opacity-60 normal-case max-w-[8rem] truncate">📚 {editSeries.trim()}</span>}
                     {editStatus === 'draft' && <span className="text-[#FFB7C5] normal-case">🌰 draft</span>}
                     {editStatus === 'unlisted' && <span className="text-[#60A5FA] normal-case">🔗 unlisted</span>}
                     <span className={`transition-transform duration-300 ${showMetaPanel ? 'rotate-180' : ''}`}>⌄</span>
                   </button>
                   <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); handlePublish({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); }} disabled={!editContent.trim()} className="font-mono text-xs tracking-widest uppercase px-7 py-2.5 rounded-full text-white shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-30" style={{ backgroundColor: editStatus === 'draft' ? '#94a3b8' : editStatus === 'unlisted' ? '#60A5FA' : editColor }}>{editStatus === 'draft' ? 'Save Draft' : editStatus === 'unlisted' ? (editingId ? 'Update · Unlisted' : 'Publish · Unlisted') : editingId ? 'Update' : 'Publish'}</button>
                 </div>
               </div>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}

      {/* 📖 沉浸式全屏独立阅读舱：portal 到 body 跳出视图层的 stacking context——
          否则被 App 顶层 HUD（时钟/日夜按钮，其 z-index 相对 body 计算）叠在文章标题上，
          移动端最先露馅（续读定位一滚动到中段就撞见）。手法与写作书房 portal 一致。 */}
      {createPortal(<AnimatePresence>
        {activePost && !isEditing && (
          <motion.div
            key="reader-overlay"
            ref={readerRef}
            onScroll={handleReaderScroll}
            // ✨ 核心修复一：强制将背景色在日夜间与最外层壳体同步，拒绝卡顿断层
            className="fixed inset-0 z-[105] overflow-y-auto no-scrollbar bg-[#FAF8F3] dark:bg-[#0A0F1D] transition-colors duration-[1500ms] ease-in-out"
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40, filter: 'blur(10px)' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* 📖 顶部情绪丝线 + 🪷 右下墨环进度（剩余分钟 / 回顶）：共用滚动弹簧 */}
            {/* key 按文章重挂：切到上一/下一篇时进度环与读完落锁一并归零 */}
            <ReaderProgress key={activePost.id} containerRef={readerRef} color={activePost.color} totalMinutes={readerMinutes} />
            {/* 📑 左侧文中目录（枯山水耙痕） */}
            <ReaderToc items={toc} color={activePost.color} containerRef={readerRef} />
            <div className="min-h-screen w-full flex flex-col items-center">
              
              <div className="absolute top-0 left-0 w-full h-96 overflow-hidden pointer-events-none">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.2 }} className="absolute -top-32 -left-32 w-96 h-96 rounded-full blur-[100px] dark:opacity-10 transition-opacity duration-[1500ms] ease-in-out" style={{ backgroundColor: activePost.color }} transition={{ duration: 1 }} />
              </div>

              <div className="relative w-full max-w-3xl px-6 md:px-12 pt-20 md:pt-24 pb-64">
                
                <div className="flex justify-end items-center space-x-6 mb-12 font-mono text-[10px] tracking-widest uppercase">
                  <button onClick={() => activePost && sharePost(activePost)} className="text-slate-400 dark:text-slate-500 hover:text-oasis-teal transition-colors">{shareCopied ? '链接已摘下 ✓' : 'Share'}</button>
                  {isAdmin && <button onClick={() => activePost && startEditingPost(activePost)} className="text-slate-400 dark:text-slate-500 hover:text-[#39C5BB] transition-colors">Edit</button>}
                  {isAdmin && <button onClick={() => activePost && handleDelete(activePost.id)} className="text-slate-400 dark:text-slate-500 hover:text-red-400 transition-colors">Destroy</button>}
                  <button onClick={() => setActivePost(null)} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors ml-4 p-2 -mr-2 bg-white/50 dark:bg-white/5 rounded-full border border-slate-200/50 dark:border-white/10 shadow-sm hover:bg-white dark:hover:bg-white/10"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
                </div>

                <div className="font-mono text-xs tracking-[0.3em] text-slate-400 dark:text-slate-500 uppercase mb-8 flex items-center gap-3 flex-wrap transition-colors duration-[1500ms]">
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border oasis-accent-ink" style={{ '--accent': metaOf(activePost.type).color, borderColor: `${metaOf(activePost.type).color}40`, backgroundColor: `${metaOf(activePost.type).color}10` } as React.CSSProperties}>
                    <span className="w-3 h-3"><CategoryIcon name={metaOf(activePost.type).icon} /></span>{metaOf(activePost.type).label}
                  </span>
                  <span>{activePost.date}</span><span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span><span className="opacity-70">{readingTimeLabel(activePost.content)}</span>
                  {activePost.series && <span className="text-[#39C5BB]/80 normal-case tracking-normal font-serif">📚 {activePost.series} · 第 {chapterOf(activePost)} 篇</span>}
                </div>
                
                <h1 className="font-serif text-3xl md:text-5xl text-slate-800 dark:text-slate-100 leading-[1.3] mb-8 transition-colors duration-[1500ms] ease-in-out">{activePost.title}</h1>
                
                <div className="flex space-x-4 mb-16">
                  {activePost.tags.map(tag => <span key={tag} className="font-mono text-[10px] tracking-widest text-slate-500 dark:text-slate-400 uppercase border-b border-slate-300 dark:border-white/10 pb-1 transition-colors duration-[1500ms]">{tag}</span>)}
                </div>

                {/* ✨ 核心修复四：强力介入并定义 Markdown 的全级夜间排版字色，保证多层嵌套下渲染坚固不丢失 */}
                <Markdown className={`${PROSE_CLASS} leading-[2.2] prose-img:my-12 prose-headings:scroll-mt-24 transition-colors duration-[1500ms] ease-in-out`}>{resolvedContent}</Markdown>

                {/* 🖋️ 文末落款：每篇文章统一的收束仪式 */}
                <Colophon date={activePost.date} createdAt={activePost.createdAt} updatedAt={activePost.updatedAt} color={activePost.color} />

                {/* 📚 本合集目录：连载全览，当前篇高亮，读者能顺着读下去。用 readerSeriesInfo——
                    公开文章的合集目录不该把系列里未公开（unlisted）的姊妹篇也列给所有访客看到。 */}
                {activePost.series && (readerSeriesInfo[activePost.series]?.length ?? 0) > 1 && (
                  <div className="mt-20 px-7 py-6 md:px-9 md:py-7 rounded-2xl border border-slate-200/60 dark:border-white/10 bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm transition-colors duration-[1500ms]">
                    <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-[#39C5BB]/80 mb-5">📚 Series · {activePost.series} <span className="text-slate-400/70 dark:text-slate-500 tracking-normal normal-case ml-1">共 {readerSeriesInfo[activePost.series].length} 篇</span></div>
                    <ol className="flex flex-col gap-3">
                      {readerSeriesInfo[activePost.series].map((p, i) => {
                        const current = p.id === activePost.id;
                        return (
                          <li key={p.id} className="flex items-baseline gap-3 min-w-0">
                            <span className={`font-mono text-[10px] shrink-0 ${current ? 'text-[#39C5BB]' : 'text-slate-300 dark:text-slate-600'}`}>{String(i + 1).padStart(2, '0')}</span>
                            {current ? (
                              <span className="font-serif text-sm text-slate-700 dark:text-slate-100 leading-snug truncate">{p.title}<span className="ml-2 font-mono text-[9px] tracking-widest uppercase text-[#39C5BB]/70">· 本篇</span></span>
                            ) : (
                              <button onClick={() => openPost(p)} className="font-serif text-sm text-slate-500 dark:text-slate-400 leading-snug truncate text-left hover:text-[#39C5BB] dark:hover:text-[#39C5BB] transition-colors">{p.title}</button>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}

                {/* ⟲ 回响 + 🍃 继续漫游：反向链接与相关推荐，读完之后的漫游入口 */}
                <Echoes backlinks={activeBacklinks} currentColor={activePost.color} onOpen={openPost} />
                <Related posts={relatedPosts} onOpen={openPost} />

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
                  <h3 className="font-serif text-2xl text-slate-400 dark:text-slate-500 mb-8 italic transition-colors">落叶</h3>
                  
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
                          <div className="absolute top-5 right-5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex gap-3 bg-white/80 dark:bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200/50 dark:border-white/10">
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
                    {resonances.length === 0 && <span className="font-serif italic text-slate-400 dark:text-slate-600 text-sm pl-2 transition-colors">静待一阵风…</span>}
                  </div>
                </motion.div>
              </div>
            </div>

            {/* 底部悬浮输入激活胶囊 */}
            <motion.div 
              className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] md:bottom-10 left-1/2 -translate-x-1/2 w-[92vw] max-w-2xl z-[150]"
              initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
              transition={{ delay: 0.8, duration: 0.6, type: "spring", stiffness: 200, damping: 25 }}
            >
              <div 
                className="bg-white/80 dark:bg-[#111827]/80 backdrop-blur-3xl border border-white dark:border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.05)] dark:shadow-[0_20px_40px_rgba(0,0,0,0.4)] p-4 transition-all duration-[1500ms] overflow-hidden" 
                style={{ borderRadius: isResFocused ? '2rem' : '3rem', borderColor: isResFocused ? `${resColor}40` : '' }}
              >
                {!isResFocused ? (
                  <input type="text" placeholder="留下一片落叶…" onClick={() => setIsResFocused(true)} readOnly className="w-full bg-transparent font-serif text-slate-500 dark:text-slate-400 outline-none cursor-pointer italic text-center transition-colors duration-[1500ms]" />
                ) : (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="flex flex-col px-2">
                    <input type="text" placeholder="你的名字，下次还记得…" value={resAuthor} onChange={e => setResAuthor(e.target.value)} maxLength={20} className="bg-transparent border-b border-slate-200/80 dark:border-white/10 font-mono text-xs text-slate-700 dark:text-slate-200 pb-2 mb-4 outline-none focus:border-slate-400 dark:focus:border-[#39C5BB]/50 transition-colors placeholder:text-slate-400" />
                    <textarea placeholder="写下这片叶子的心事…" value={resContent} onChange={e => setResContent(e.target.value)} maxLength={150} className="bg-transparent font-serif text-slate-700 dark:text-slate-200 h-20 outline-none resize-none mb-4 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors" />
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex space-x-2">
                        {AURA_COLORS.map(c => <div key={c} onClick={() => setResColor(c)} className={`w-3.5 h-3.5 rounded-full cursor-pointer transition-transform ${resColor === c ? 'scale-125' : 'opacity-40 hover:opacity-100'}`} style={{ backgroundColor: c, boxShadow: resColor === c ? `0 0 0 2px transparent, 0 0 0 3px ${c}` : 'none' }} />)}
                      </div>
                      <div className="flex space-x-4">
                        <button onClick={() => setIsResFocused(false)} className="font-mono text-[10px] tracking-widest uppercase text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">取消</button>
                        <button onClick={handleResSubmit} disabled={!resAuthor.trim() || !resContent.trim() || isResSubmitting} className="font-mono text-[10px] tracking-widest uppercase px-6 py-2 rounded-full text-white transition-all disabled:opacity-30" style={{ backgroundColor: resColor, boxShadow: `0 4px 15px ${resColor}40` }}>{isResSubmitting ? '…' : '放下'}</button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}

      {/* 个人全屏资料卡弹出层：同理 portal 到 body，避免被顶层 HUD 叠在上面 */}
      {createPortal(<AnimatePresence>
        {showProfile && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-auto">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-md" onClick={() => setShowProfile(false)} />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="relative w-[92vw] max-w-md max-h-[88vh] overflow-y-auto no-scrollbar bg-white/80 dark:bg-[#111827]/90 backdrop-blur-3xl border border-white/50 dark:border-white/10 p-7 md:p-10 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex flex-col transition-colors duration-1000"
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
                  A 20-year-old computer science undergraduate at UNSW-Sydney. Dedicated to building elegant architectures and non-competitive digital spaces — where craft, calm and curiosity matter more than the race.
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
      </AnimatePresence>, document.body)}

      {/* 🍂 关闭编辑器的落定通知：8 秒内可撤销，portal 到 body 保证切视图时依然浮在最上层 */}
      {createPortal(
        <AnimatePresence>
          {undoNotice && (
            <motion.div
              key="undo-toast"
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-4 md:right-8 z-[220] flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/85 dark:bg-[#0E1424]/90 backdrop-blur-xl border border-white/60 dark:border-white/10 shadow-lg"
            >
              <span className="font-serif text-sm text-slate-600 dark:text-slate-200 max-w-[240px] truncate">
                {undoNotice.kind === 'update'
                  ? <>已收起 · <span className="italic">{undoNotice.title || 'Untitled'}</span> 的修改已保存</>
                  : <>🌰 已落为草稿 · <span className="italic">{undoNotice.title || 'Untitled'}</span></>}
              </span>
              <button onClick={handleUndo} className="shrink-0 font-mono text-[10px] tracking-widest uppercase text-[#39C5BB] hover:text-[#2da098] underline decoration-dotted transition-colors">撤销</button>
              <button onClick={() => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); setUndoNotice(null); }} aria-label="知道了" className="shrink-0 text-slate-300 dark:text-slate-600 hover:text-slate-400 dark:hover:text-slate-400 transition-colors text-xs">✕</button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* 🖼️ 图片灯箱：监听正文图片点击，全屏放大 */}
      <Lightbox />

    </motion.div>
  );
};
