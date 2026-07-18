// src/components/OasisAtelier.tsx
// 🎨 绘阁 Atelier：从别处（pixiv / X）拾得的画作，暂存于此的小小美术馆。
//   瀑布流浏览（CSS columns，不引 masonry 库）+ 灯箱阅览（createPortal，z-[200]，与 garden 阅读舱同层）。
//   数据源 src/hooks/useAtelier.ts（Supabase + localStorage 双写，云端/表未建时回落本地）。
//   admin 专属：「+ 装裱」新增、灯箱内修润 / 摘下（z-[210] 表单弹层，高于灯箱）。
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useAtelier, filterVisible, resolveArtSrc, type Artwork, type ArtworkInput, type ArtPlatform, type ArtVisibility } from '../hooks/useAtelier';
import { useHashRoute } from '../lib/route';
import { BLOOM_EASE, type RippleOrigin } from '../lib/transitions';

const ATELIER_ACCENT = '#FFB7C5'; // 樱粉：绘阁默认强调色
const MIKU_ACCENT = '#39C5BB';    // 初音绿：miku 标签的专属强调色
// 站内 aura 色板（与 friends.ts 注释同一份），装裱表单的快捷取色
const PALETTE_SWATCHES = ['#FFB7C5', '#FDBA74', '#FDE047', '#A7F3D0', '#39C5BB', '#60A5FA', '#A78BFA'];

// 十六进制转 rgba：主色氛围光需要按透明度叠色，容错处理 3 位简写与解析失败（兜底初音绿）
const hexToRgba = (hex: string, alpha: number): string => {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(num)) return `rgba(57,197,187,${alpha})`;
  return `rgba(${(num >> 16) & 255},${(num >> 8) & 255},${num & 255},${alpha})`;
};

const friendlyDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

interface OasisAtelierProps { isAdmin: boolean }

type EditorMode = { kind: 'create' } | { kind: 'edit'; id: string };

export const OasisAtelier: React.FC<OasisAtelierProps> = ({ isAdmin }) => {
  const reduce = !!useReducedMotion();
  const { artworks: rawArtworks, frameArtwork, retouchArtwork, unframeArtwork } = useAtelier();
  const artworks = useMemo(() => filterVisible(rawArtworks, isAdmin), [rawArtworks, isAdmin]);

  // 'demo' 是占位数据的内部标记，不作为可筛选的策展标签展示
  const tags = useMemo(
    () => Array.from(new Set(artworks.flatMap((a) => a.tags))).filter((t) => t !== 'demo'),
    [artworks]
  );
  const [activeTag, setActiveTag] = useState<string>('all');
  const filtered = useMemo(
    () => (activeTag === 'all' ? artworks : artworks.filter((a) => a.tags.includes(activeTag))),
    [artworks, activeTag]
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  // 🌊 灯箱氛围光的晕开落点：卡片点击处的坐标；键盘/前后翻页/地址直达时为空，退回居中晕开
  const [openOrigin, setOpenOrigin] = useState<RippleOrigin | null>(null);
  const activeIndex = useMemo(() => filtered.findIndex((a) => a.id === activeId), [filtered, activeId]);
  const activeArtwork = activeIndex >= 0 ? filtered[activeIndex] : null;

  // 地址栏同步：#/atelier/:id 可直达、可分享、后退可关闭（与 garden 阅读舱同一套逻辑，见 OasisGallery）
  const { route } = useHashRoute();
  useEffect(() => {
    if (route.view !== 'atelier') return;
    if (route.itemId) {
      if (route.itemId !== activeId) setActiveId(route.itemId);
    } else if (activeId) {
      setActiveId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.view, route.itemId]);

  const hadItemRef = useRef(false);
  useEffect(() => {
    if (activeId) {
      hadItemRef.current = true;
      const target = `#/atelier/${activeId}`;
      if (window.location.hash !== target) window.location.hash = target;
    } else if (hadItemRef.current && window.location.hash.startsWith('#/atelier/')) {
      hadItemRef.current = false;
      window.location.hash = '#/atelier';
    }
  }, [activeId]);

  const openArtwork = useCallback((id: string, origin?: RippleOrigin) => {
    setActiveId(id);
    setOpenOrigin(origin ?? null);
  }, []);
  const closeArtwork = useCallback(() => setActiveId(null), []);
  const step = useCallback(
    (delta: number) => {
      if (activeIndex < 0 || filtered.length === 0) return;
      const next = (activeIndex + delta + filtered.length) % filtered.length;
      setOpenOrigin(null); // 翻页没有具体点击落点，氛围光退回居中晕开
      setActiveId(filtered[next].id);
    },
    [activeIndex, filtered]
  );

  // 键盘导航：← → 切换，Esc 关闭（编辑器打开时交给编辑器自己处理，这里让位）
  const [editor, setEditor] = useState<EditorMode | null>(null);
  useEffect(() => {
    if (!activeArtwork || editor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeArtwork();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeArtwork, editor, closeArtwork, step]);

  // 预加载相邻两张，切换时不空等
  useEffect(() => {
    if (activeIndex < 0) return;
    [1, -1].forEach((d) => {
      const n = filtered[(activeIndex + d + filtered.length) % filtered.length];
      if (n) { const img = new Image(); img.src = resolveArtSrc(n.imagePath, 'full'); }
    });
  }, [activeIndex, filtered]);

  const handleDelete = useCallback((id: string) => {
    if (window.confirm('确定要摘下这幅画吗？')) {
      unframeArtwork(id);
      closeArtwork();
    }
  }, [unframeArtwork, closeArtwork]);

  return (
    <motion.div className="absolute inset-0 w-full h-full overflow-y-auto no-scrollbar flex flex-col items-center pt-20 md:pt-28 pb-40 px-4 md:px-8 z-10">
      {/* 报头：与其他场所同款的安静排版 */}
      <div className="text-center mb-8 md:mb-10 shrink-0">
        <div className="font-mono text-[10px] tracking-[0.5em] uppercase text-slate-400/70 dark:text-slate-500 mb-3 transition-colors duration-[1500ms]">Atelier</div>
        <p className="font-serif italic text-slate-400 dark:text-slate-500 text-sm transition-colors duration-[1500ms]">从别处拾得的光，暂存于此。</p>
      </div>

      {/* 筛选 chips + admin 装裱入口 */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full px-1 pb-1 mb-10 md:mb-12 shrink-0">
        {['all', ...tags].map((tag) => {
          const active = activeTag === tag;
          const accent = tag === 'miku' ? MIKU_ACCENT : ATELIER_ACCENT;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(tag)}
              className={`shrink-0 font-mono text-[10px] tracking-[0.2em] uppercase px-3.5 py-1.5 rounded-full border transition-all duration-500 outline-none ${
                active
                  ? 'text-white border-transparent'
                  : 'text-slate-500 dark:text-slate-400 border-slate-300/50 dark:border-white/10 bg-white/30 dark:bg-white/5 hover:border-slate-400/60 dark:hover:border-white/20'
              }`}
              style={active ? { backgroundColor: accent, boxShadow: `0 0 16px ${accent}55` } : undefined}
            >
              {tag === 'all' ? 'All' : tag === 'miku' ? '♪ Miku' : tag}
            </button>
          );
        })}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setEditor({ kind: 'create' })}
            className="shrink-0 font-mono text-[10px] tracking-[0.2em] uppercase px-3.5 py-1.5 rounded-full border border-dashed border-slate-300/60 dark:border-white/20 text-slate-400 dark:text-slate-500 hover:text-[#FFB7C5] hover:border-[#FFB7C5]/60 transition-colors duration-300"
          >
            + 装裱
          </button>
        )}
      </div>

      {/* 瀑布流 */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center -mt-16">
          <span className="font-serif italic text-slate-400 dark:text-slate-400 text-lg">还没有收藏的画作。</span>
          <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-slate-400/60 dark:text-slate-600">The wall is bare — nothing collected yet</span>
        </div>
      ) : (
        <div className="w-full max-w-6xl columns-2 sm:columns-2 md:columns-3 xl:columns-4 gap-3 md:gap-4">
          {filtered.map((art, i) => (
            <ArtCard key={art.id} artwork={art} index={i} reduce={reduce} isAdmin={isAdmin} onOpen={openArtwork} />
          ))}
        </div>
      )}

      {/* 灯箱：portal 到 body，独立于场所转场之外 */}
      {createPortal(
        <AnimatePresence>
          {activeArtwork && !editor && (
            <ArtLightbox
              artwork={activeArtwork}
              reduce={reduce}
              isAdmin={isAdmin}
              origin={openOrigin}
              onClose={closeArtwork}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onEdit={() => setEditor({ kind: 'edit', id: activeArtwork.id })}
              onDelete={() => handleDelete(activeArtwork.id)}
            />
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* 装裱 / 修润表单：z-[210]，高于灯箱 */}
      {createPortal(
        <AnimatePresence>
          {editor && (
            <ArtEditor
              mode={editor}
              artwork={editor.kind === 'edit' ? rawArtworks.find((a) => a.id === editor.id) ?? null : null}
              onCancel={() => setEditor(null)}
              onSubmit={(input) => {
                if (editor.kind === 'create') frameArtwork(input);
                else retouchArtwork(editor.id, input);
                setEditor(null);
              }}
            />
          )}
        </AnimatePresence>,
        document.body
      )}
    </motion.div>
  );
};

// —— 画作卡片 ——
const ArtCard: React.FC<{ artwork: Artwork; index: number; reduce: boolean; isAdmin: boolean; onOpen: (id: string, origin?: RippleOrigin) => void }> = ({ artwork, index, reduce, isAdmin, onOpen }) => (
  <motion.button
    type="button"
    onClick={(e) => onOpen(artwork.id, { x: e.clientX, y: e.clientY })}
    className="group relative block w-full mb-3 md:mb-4 rounded-2xl overflow-hidden break-inside-avoid text-left bg-white/20 dark:bg-white/5 border border-white/20 dark:border-white/10 backdrop-blur-xl outline-none"
    style={{ contentVisibility: 'auto', containIntrinsicSize: `320px ${Math.round((320 * artwork.height) / artwork.width)}px` } as React.CSSProperties}
    initial={reduce ? undefined : { opacity: 0, y: 18, filter: 'blur(6px)' }}
    animate={reduce ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
    transition={{ duration: 0.9, delay: 0.05 + (index % 8) * 0.05, ease: [0.16, 1, 0.3, 1] }}
    whileTap={{ scale: 0.98 }}
    aria-label={`${artwork.title} — ${artwork.artist}`}
  >
    <img
      src={resolveArtSrc(artwork.imagePath, 'thumb')}
      alt={artwork.title}
      loading="lazy"
      decoding="async"
      style={{ aspectRatio: `${artwork.width} / ${artwork.height}` }}
      className="w-full h-auto block transition-transform duration-700 ease-out group-hover:scale-[1.03]"
    />
    {artwork.tags.includes('miku') && (
      <span className="absolute top-2.5 right-2.5 font-mono text-[9px] px-2 py-1 rounded-full bg-black/30 backdrop-blur-md text-[#8CF3EA]">♪</span>
    )}
    {isAdmin && artwork.visibility === 'private' && (
      <span className="absolute top-2.5 left-2.5 flex items-center justify-center w-6 h-6 rounded-full bg-black/30 backdrop-blur-md text-[#FFB7C5]" title="仅园丁可见">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
      </span>
    )}
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-70 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-500" />
    <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
      <div className="font-serif text-[13px] text-white/95 leading-snug truncate">{artwork.title}</div>
      <div className="font-mono text-[9px] tracking-[0.15em] uppercase text-white/70 mt-0.5 truncate">{artwork.artist}</div>
    </div>
  </motion.button>
);

// —— 灯箱 ——
const ArtLightbox: React.FC<{
  artwork: Artwork;
  reduce: boolean;
  isAdmin: boolean;
  origin: RippleOrigin | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ artwork, reduce, isAdmin, origin, onClose, onPrev, onNext, onEdit, onDelete }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-auto">
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }}
      className="absolute inset-0 bg-black/85 backdrop-blur-2xl"
      onClick={onClose}
    >
      {/* 🌊 主色氛围光：从点击处向外晕开（涟漪落点），没有落点（键盘/翻页/地址直达）则居中晕开 */}
      <motion.div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle, ${hexToRgba(artwork.color, 0.5)} 0%, ${hexToRgba(artwork.color, 0.16)} 42%, transparent 72%)`,
          transformOrigin: origin ? `${origin.x}px ${origin.y}px` : '50% 42%',
        }}
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: origin ? 0.1 : 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduce ? 0.4 : 1.1, ease: BLOOM_EASE }}
      />
    </motion.div>

    <button onClick={onClose} className="absolute top-5 right-5 md:top-8 md:right-8 z-10 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white backdrop-blur-md transition-colors" aria-label="Close">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12" /></svg>
    </button>

    {/* 桌面端左右箭头；移动端用触屏 swipe */}
    <button onClick={onPrev} className="hidden md:flex absolute left-6 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white backdrop-blur-md transition-colors" aria-label="Previous">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path d="M15 18l-6-6 6-6" /></svg>
    </button>
    <button onClick={onNext} className="hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white backdrop-blur-md transition-colors" aria-label="Next">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path d="M9 18l6-6-6-6" /></svg>
    </button>

    <motion.div
      key={artwork.id}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.6}
      onDragEnd={(_, info) => {
        if (info.offset.x < -80) onNext();
        else if (info.offset.x > 80) onPrev();
      }}
      className="relative z-[1] w-[94vw] md:w-auto max-w-6xl max-h-[90vh] flex flex-col md:flex-row items-center gap-0 md:gap-8 px-2"
      onClick={(e) => e.stopPropagation()}
    >
      <img
        src={resolveArtSrc(artwork.imagePath, 'full')}
        alt={artwork.title}
        className="max-h-[56vh] md:max-h-[78vh] max-w-full md:max-w-[62vw] w-auto object-contain rounded-lg shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
        draggable={false}
      />

      <div className="w-full md:w-[280px] shrink-0 mt-5 md:mt-0 px-1 md:px-0 text-center md:text-left">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="font-serif text-xl md:text-2xl text-white leading-snug">{artwork.title}</h3>
          {artwork.visibility === 'private' && (
            <span className="shrink-0 mt-1 font-mono text-[8px] tracking-[0.15em] uppercase px-2 py-1 rounded-full border border-[#FFB7C5]/40 text-[#FFB7C5]">private</span>
          )}
        </div>
        <a href={artwork.artistUrl || artwork.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-block font-mono text-[10px] tracking-[0.2em] uppercase text-white/60 hover:text-white transition-colors mb-1">
          {artwork.artist}
        </a>
        <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-white/35 mb-5">{artwork.platform}</div>

        {artwork.note && <p className="font-serif text-[15px] leading-[1.9] text-white/80 mb-6">{artwork.note}</p>}

        <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-white/35 mb-6">Collected {friendlyDate(artwork.collectedAt)}</div>

        <div className="flex items-center justify-center md:justify-start gap-3 flex-wrap">
          <a
            href={artwork.sourceUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase px-4 py-2.5 rounded-full text-black/85 transition-transform hover:scale-105"
            style={{ backgroundColor: artwork.color }}
          >
            去原作页 ↗
          </a>
          {isAdmin && (
            <>
              <button onClick={onEdit} className="font-mono text-[10px] tracking-[0.2em] uppercase px-4 py-2.5 rounded-full border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors">
                修润
              </button>
              <button onClick={onDelete} className="font-mono text-[10px] tracking-[0.2em] uppercase px-4 py-2.5 rounded-full border border-white/20 text-white/40 hover:text-red-400 hover:border-red-400/40 transition-colors">
                摘下
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  </div>
);

// —— 装裱 / 修润表单 ——
const emptyForm = (): ArtworkInput => ({
  title: '', artist: '', artistUrl: '', sourceUrl: '', platform: 'pixiv',
  imagePath: '', width: 0, height: 0, color: PALETTE_SWATCHES[0],
  tags: [], note: '', visibility: 'private',
});

const ArtEditor: React.FC<{
  mode: EditorMode;
  artwork: Artwork | null;
  onCancel: () => void;
  onSubmit: (input: ArtworkInput) => void;
}> = ({ mode, artwork, onCancel, onSubmit }) => {
  const [form, setForm] = useState<ArtworkInput>(() =>
    artwork
      ? { title: artwork.title, artist: artwork.artist, artistUrl: artwork.artistUrl ?? '', sourceUrl: artwork.sourceUrl, platform: artwork.platform, imagePath: artwork.imagePath, width: artwork.width, height: artwork.height, color: artwork.color, tags: artwork.tags.filter((t) => t !== 'demo'), note: artwork.note, visibility: artwork.visibility }
      : emptyForm()
  );
  const [tagInput, setTagInput] = useState(() => form.tags.join(', '));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const valid = form.title.trim() && form.sourceUrl.trim() && form.imagePath.trim() && form.width > 0 && form.height > 0;

  const handleSubmit = () => {
    if (!valid) return;
    onSubmit({ ...form, tags: tagInput.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) });
  };

  const field = 'w-full bg-transparent border-b border-slate-300/60 dark:border-white/15 font-mono text-xs text-slate-600 dark:text-slate-300 outline-none pb-1.5 placeholder:text-slate-400/60 focus:border-[#FFB7C5]/60 transition-colors';
  const label = 'font-mono text-[9px] tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500 mb-1.5 block';

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 pointer-events-auto">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="absolute inset-0 bg-slate-900/50 dark:bg-black/70 backdrop-blur-md" onClick={onCancel} />

      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="relative w-[94vw] max-w-lg max-h-[88vh] overflow-y-auto no-scrollbar bg-white/85 dark:bg-[#111827]/92 backdrop-blur-3xl border border-white/50 dark:border-white/10 p-7 md:p-9 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.5)] transition-colors duration-700"
      >
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-[#39C5BB] rounded-full blur-[70px] opacity-25 dark:opacity-15 pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-[#FFB7C5] rounded-full blur-[70px] opacity-25 dark:opacity-15 pointer-events-none" />

        <div className="relative flex items-center justify-between mb-6">
          <h3 className="font-serif text-xl text-slate-700 dark:text-slate-200">{mode.kind === 'create' ? '装裱一幅画' : '修润这幅画'}</h3>
          <button onClick={onCancel} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="relative flex flex-col gap-5">
          <input type="text" placeholder="标题" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full bg-transparent text-2xl font-serif text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-300 dark:placeholder:text-slate-700" />

          <div className="grid grid-cols-2 gap-4">
            <div><span className={label}>画师</span><input type="text" value={form.artist} onChange={(e) => setForm((f) => ({ ...f, artist: e.target.value }))} className={field} placeholder="画师署名" /></div>
            <div><span className={label}>画师主页</span><input type="text" value={form.artistUrl} onChange={(e) => setForm((f) => ({ ...f, artistUrl: e.target.value }))} className={field} placeholder="可留空" /></div>
          </div>

          <div>
            <span className={label}>原作品页</span>
            <input type="text" value={form.sourceUrl} onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))} className={field} placeholder="https://www.pixiv.net/artworks/..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className={label}>平台</span>
              <select value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as ArtPlatform }))} className={`${field} appearance-none cursor-pointer`}>
                <option value="pixiv">pixiv</option>
                <option value="x">x</option>
                <option value="original">original</option>
                <option value="other">other</option>
              </select>
            </div>
            <div>
              <span className={label}>可见性</span>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, visibility: f.visibility === 'private' ? 'public' as ArtVisibility : 'private' as ArtVisibility }))}
                className={`w-full font-mono text-[11px] tracking-[0.1em] uppercase px-3 py-1.5 rounded-full border text-center transition-colors duration-300 ${form.visibility === 'private' ? 'text-[#FFB7C5] border-[#FFB7C5]/50 bg-[#FFB7C5]/5' : 'text-[#39C5BB] border-[#39C5BB]/50 bg-[#39C5BB]/5'}`}
              >
                {form.visibility === 'private' ? '🔒 private' : '公开可见'}
              </button>
            </div>
          </div>

          <div>
            <span className={label}>图片路径</span>
            <input type="text" value={form.imagePath} onChange={(e) => setForm((f) => ({ ...f, imagePath: e.target.value }))} className={field} placeholder="/artworks-src/xxx.svg 或 R2 key（不含扩展名）" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><span className={label}>原图宽 px</span><input type="number" min={0} value={form.width || ''} onChange={(e) => setForm((f) => ({ ...f, width: Number(e.target.value) || 0 }))} className={field} placeholder="1200" /></div>
            <div><span className={label}>原图高 px</span><input type="number" min={0} value={form.height || ''} onChange={(e) => setForm((f) => ({ ...f, height: Number(e.target.value) || 0 }))} className={field} placeholder="1800" /></div>
          </div>

          <div>
            <span className={label}>主色调</span>
            <div className="flex items-center gap-2 flex-wrap">
              {PALETTE_SWATCHES.map((c) => (
                <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={`w-6 h-6 rounded-full transition-transform ${form.color === c ? 'scale-110 ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-[#111827]' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }} aria-label={c} />
              ))}
              <input type="text" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className={`${field} !w-24 flex-1 min-w-[6rem]`} placeholder="#39C5BB" />
            </div>
          </div>

          <div>
            <span className={label}>标签（逗号分隔，如 miku, 壁纸）</span>
            <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} className={field} placeholder="miku, 插画" />
          </div>

          <div>
            <span className={label}>收藏语——为什么留下这一张</span>
            <textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} rows={3}
              className="w-full bg-transparent border-b border-slate-300/60 dark:border-white/15 font-serif text-sm text-slate-600 dark:text-slate-300 outline-none pb-1.5 resize-none placeholder:text-slate-400/60 focus:border-[#FFB7C5]/60 transition-colors" placeholder="留一句和这张画相遇的心情……" />
          </div>

          <div className="flex items-center justify-end gap-3 mt-2">
            <button onClick={onCancel} className="font-mono text-xs tracking-widest uppercase px-5 py-2.5 rounded-full text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Cancel</button>
            <button onClick={handleSubmit} disabled={!valid} className="font-mono text-xs tracking-widest uppercase px-7 py-2.5 rounded-full text-white shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-30" style={{ backgroundColor: form.color }}>
              {mode.kind === 'create' ? 'Frame' : 'Update'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
