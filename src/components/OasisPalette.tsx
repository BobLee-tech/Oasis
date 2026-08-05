// src/components/OasisPalette.tsx
// ⌘K 命令面板：全站「搜文章 / 去往场所 / 切主题」的统一入口。
//   与终端暗门共享同一种气质——mono 提示符开场，serif 承载内容——
//   两种美学在这里交汇，而不是又造一套独立的搜索 UI。
//   不引第三方库（cmdk 的样式重置会和这套 Tailwind 美学打架），三类条目就是全部功能。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { BlogPost } from '../hooks/useGarden';
import { useCoarsePointer } from '../hooks/useCoarsePointer';
import { emitMikuSignal } from '../lib/mikuSignal';
import { emitRipple } from '../lib/rippleSignal';

// 🔔 跨组件唤起：与 Markdown.tsx 的 LIGHTBOX_EVENT 同一种约定——
//   任何深处的组件（如 Gallery 的搜索图标）都能 dispatch 这个事件唤起面板，
//   而不必把 open 状态一路 prop-drill 穿过懒加载的场所边界。
export const PALETTE_EVENT = 'oasis:palette';
export const openPalette = () => window.dispatchEvent(new CustomEvent(PALETTE_EVENT));

export type PaletteView = 'soundscape' | 'garden' | 'orchard' | 'lights' | 'atelier';
const VIEW_META: Record<PaletteView, { label: string; icon: string }> = {
  garden: { label: '花园 · Garden', icon: '🌱' },
  soundscape: { label: '共鸣 · Soundscape', icon: '🎧' },
  orchard: { label: '星图 · Orchard', icon: '🪐' },
  lights: { label: '灯火 · Lanterns', icon: '🏮' },
  atelier: { label: '绘阁 · Atelier', icon: '🖼️' },
};

interface PostHit { kind: 'post'; id: string; title: string; color: string; snippet: string }
interface GoHit { kind: 'go'; view: PaletteView; label: string; icon: string }
interface DoHit { kind: 'do'; label: string }
type Hit = PostHit | GoHit | DoHit;

const hitKey = (h: Hit) => (h.kind === 'post' ? `p-${h.id}` : h.kind === 'go' ? `g-${h.view}` : `d-${h.label}`);

// 极简 Markdown → 纯文本：只为搜索与摘句，不追求还原排版
const stripMd = (s: string) => s.replace(/[#*`>!\[\]()]/g, '').replace(/\s+/g, ' ').trim();

interface OasisPaletteProps {
  posts: BlogPost[];
  currentView: PaletteView | 'welcome';
  themeLabel: string;
  onGo: (view: PaletteView) => void;
  onOpenPost: (id: string) => void;
  onToggleTheme: () => void;
}

export const OasisPalette: React.FC<OasisPaletteProps> = ({ posts, currentView, themeLabel, onGo, onOpenPost, onToggleTheme }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const coarse = useCoarsePointer();

  // ⌨️ ⌘K / Ctrl+K 唤起；输入框/文本域/可编辑区内不响应（写作书房里按 ⌘K 不该弹面板）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !typing) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 🔔 供移动端 / 无键盘场景唤起（见 openPalette 导出函数）
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(PALETTE_EVENT, handler);
    return () => window.removeEventListener(PALETTE_EVENT, handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    emitMikuSignal({ type: open ? 'focus-open' : 'focus-close', source: 'palette' });
    return () => emitMikuSignal({ type: 'focus-close', source: 'palette' });
  }, [open]);

  // 正文预先转纯文本 + 小写缓存，避免每次按键都重新清洗一遍 markdown
  const searchable = useMemo(
    () => posts.map((p) => ({
      post: p,
      plain: stripMd(p.content).toLowerCase(),
      titleLc: p.title.toLowerCase(),
      tagsLc: p.tags.map((t) => t.toLowerCase()),
    })),
    [posts]
  );

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    const goHits: GoHit[] = (Object.keys(VIEW_META) as PaletteView[])
      .filter((v) => v !== currentView)
      .map((v) => ({ kind: 'go', view: v, label: VIEW_META[v].label, icon: VIEW_META[v].icon }));
    const doHits: DoHit[] = [{ kind: 'do', label: `切换日夜 · 当前 ${themeLabel}` }];

    if (!q) return [...goHits, ...doHits]; // 空查询不刷屏文章列表，只给「去往」与「动作」

    const postHits = searchable
      .map(({ post, plain, titleLc, tagsLc }) => {
        let score = 0;
        if (titleLc.includes(q)) score += 3;
        if (tagsLc.some((t) => t.includes(q))) score += 2;
        const bodyIdx = plain.indexOf(q);
        if (bodyIdx >= 0) score += 1;
        if (score === 0) return null;
        const snippet = bodyIdx >= 0
          ? '…' + plain.slice(Math.max(0, bodyIdx - 24), bodyIdx + q.length + 40).trim() + '…'
          : post.excerpt;
        return { kind: 'post' as const, id: post.id, title: post.title, color: post.color, snippet, score };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ score: _score, ...rest }) => rest);

    const filteredGo = goHits.filter((g) => g.label.toLowerCase().includes(q));
    const filteredDo = doHits.filter((d) => d.label.toLowerCase().includes(q));

    return [...postHits, ...filteredGo, ...filteredDo];
  }, [query, searchable, currentView, themeLabel]);

  useEffect(() => setCursor(0), [query, hits.length]);

  const commit = (hit: Hit) => {
    if (hit.kind === 'post') onOpenPost(hit.id);
    else if (hit.kind === 'go') onGo(hit.view);
    else onToggleTheme();
    setOpen(false);
    // 🫧 ⌘K 执行一条命令：有后果的动作，值得一圈涟漪；面板即将合上，落点用面板自己的中心
    const rect = panelRef.current?.getBoundingClientRect();
    emitRipple(rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 });
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(hits.length - 1, c + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); const hit = hits[cursor]; if (hit) commit(hit); }
      else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hits, cursor]);

  const groups = useMemo(() => {
    const list: { label: string; items: Hit[] }[] = [];
    const p = hits.filter((h): h is PostHit => h.kind === 'post');
    const g = hits.filter((h): h is GoHit => h.kind === 'go');
    const d = hits.filter((h): h is DoHit => h.kind === 'do');
    if (p.length) list.push({ label: 'GARDEN · 文章', items: p });
    if (g.length) list.push({ label: 'GO · 去往', items: g });
    if (d.length) list.push({ label: 'DO · 动作', items: d });
    return list;
  }, [hits]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="palette-veil"
          className="fixed inset-0 z-[220] flex items-start justify-center bg-black/20 backdrop-blur-sm"
          style={coarse ? undefined : { paddingTop: '14vh' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <motion.div
            ref={panelRef}
            className={coarse
              ? 'fixed bottom-0 left-0 right-0 max-h-[75vh] rounded-t-3xl bg-[#FAF8F3] dark:bg-[#0A0F1D] border-t border-slate-200/60 dark:border-white/10 flex flex-col'
              : 'w-[92vw] max-w-xl rounded-2xl bg-white/85 dark:bg-[#0A0F1D]/90 backdrop-blur-xl border border-slate-200/60 dark:border-white/10 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.35)] flex flex-col overflow-hidden'}
            initial={coarse ? { y: '100%' } : { opacity: 0, y: -12, scale: 0.98 }}
            animate={coarse ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
            exit={coarse ? { y: '100%' } : { opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {coarse && <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-white/15 mx-auto mt-3 mb-1 shrink-0" />}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200/50 dark:border-white/10 shrink-0">
              <span className="font-mono text-sm text-[#39C5BB]">&gt;</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="寻找一片叶子…"
                className="flex-1 bg-transparent outline-none font-serif text-base text-slate-700 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              <kbd className="hidden md:inline font-mono text-[9px] text-slate-400 dark:text-slate-500 border border-slate-300/50 dark:border-white/10 rounded px-1.5 py-0.5">ESC</kbd>
            </div>

            <div className="overflow-y-auto no-scrollbar py-2 max-h-[50vh]">
              {hits.length === 0 && (
                <div className="px-5 py-8 text-center font-serif text-sm text-slate-400 dark:text-slate-500 italic">这片土地上还没有这样的叶子</div>
              )}
              {groups.map(({ label, items }) => (
                <div key={label} className="mb-1">
                  <div className="px-5 pt-3 pb-1 font-mono text-[9px] tracking-[0.3em] uppercase text-slate-400 dark:text-slate-500">{label}</div>
                  {items.map((hit) => {
                    const idx = hits.indexOf(hit);
                    const active = idx === cursor;
                    const accent = hit.kind === 'post' ? hit.color : '#39C5BB';
                    return (
                      <button
                        key={hitKey(hit)}
                        onMouseEnter={() => setCursor(idx)}
                        onClick={() => commit(hit)}
                        className="w-full flex items-center gap-3 pl-5 pr-5 py-2.5 text-left relative"
                      >
                        <span
                          className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full transition-opacity"
                          style={{ backgroundColor: accent, opacity: active ? 0.9 : 0 }}
                          aria-hidden
                        />
                        {hit.kind === 'post' && (
                          <span className="flex flex-col gap-0.5 min-w-0">
                            <span className={`font-serif text-sm truncate ${active ? 'text-[#39C5BB]' : 'text-slate-700 dark:text-slate-200'}`}>{hit.title}</span>
                            <span className="font-serif text-xs text-slate-400 dark:text-slate-500 truncate italic">{hit.snippet}</span>
                          </span>
                        )}
                        {hit.kind === 'go' && (
                          <span className={`font-serif text-sm flex items-center gap-2 ${active ? 'text-[#39C5BB]' : 'text-slate-600 dark:text-slate-300'}`}>
                            <span>{hit.icon}</span>{hit.label}
                          </span>
                        )}
                        {hit.kind === 'do' && (
                          <span className={`font-serif text-sm ${active ? 'text-[#39C5BB]' : 'text-slate-600 dark:text-slate-300'}`}>{hit.label}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
