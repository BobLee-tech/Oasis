// 🖼️ 写作抽屉「Cover」一栏：这篇的卡片封面用哪张、框住哪里。
//   来源五种：自动（插画 > 无图注 > 照片，图解不上）/ 文中某张 / 本地上传（npm run dev 下才有，压 webp 传 R2）/ 资源包 / 不用图（分类的纸）。
//   手选的写成正文末尾一行 `[oasis-cover]: 地址`，自动的什么都不写（lib/coverImage.ts）；取景框交给 CoverFocusEditor。
import React, { useMemo, useRef, useState } from 'react';
import { extractImages, imageTier, pickCover, readCoverChoice, resolveCover, setCoverFocus, stripFocus, withFocus, writeCoverChoice, type CoverChoice } from '../../lib/coverImage';
import { COVER_PACKS } from '../../data/coverPacks';
import { CoverFocusEditor } from './CoverFocusEditor';

type Tab = 'auto' | 'article' | 'local' | 'pack' | 'none';
const TABS: { id: Tab; label: string }[] = [
  { id: 'auto', label: '自动' }, { id: 'article', label: '文中' }, { id: 'local', label: '本地' }, { id: 'pack', label: '资源包' }, { id: 'none', label: '不用图' },
];
const TIER = ['插画', '无图注', '照片', '图解'];
const PACK_ITEMS = COVER_PACKS.flatMap((p) => p.items);
const CAN_UPLOAD = import.meta.env.DEV;

const chip = (on: boolean) => `font-serif text-xs px-3 py-1.5 rounded-full border transition-colors duration-300 ${on ? 'text-[#39C5BB] border-[#39C5BB]/60 bg-[#39C5BB]/5' : 'text-slate-400 dark:text-slate-500 border-slate-300/50 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/25'}`;
const thumb = (on: boolean) => `group relative block w-[104px] text-left rounded-lg overflow-hidden border transition-all ${on ? 'border-[#39C5BB] ring-2 ring-[#39C5BB]/30' : 'border-slate-200/70 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/30'}`;

export const CoverPicker: React.FC<{ content: string; onChange: (next: string) => void }> = ({ content, onChange }) => {
  const choice = readCoverChoice(content);
  const images = useMemo(() => extractImages(content), [content]);
  const auto = useMemo(() => pickCover(content), [content]);
  const cover = resolveCover(content);
  const chosen = choice.kind === 'src' ? stripFocus(choice.src) : null;

  const sourceOf = (): Tab => {
    if (choice.kind !== 'src') return choice.kind;
    if (images.some((i) => stripFocus(i.src) === chosen)) return 'article';
    return PACK_ITEMS.some((i) => i.src === chosen) ? 'pack' : 'local';
  };
  const [tab, setTab] = useState<Tab | null>(null);
  const shown = tab ?? sourceOf();
  // 资源包一次只摊开一包；默认是当前封面所在的那包
  const [packId, setPackId] = useState<string | null>(null);
  const shownPack = COVER_PACKS.find((p) => p.id === packId) ?? COVER_PACKS.find((p) => p.items.some((i) => i.src === chosen)) ?? COVER_PACKS[0];
  const [upload, setUpload] = useState<{ busy: boolean; error: string }>({ busy: false, error: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  const choose = (c: CoverChoice) => onChange(writeCoverChoice(content, c));
  const pickTab = (t: Tab) => {
    setTab(t);
    if (t === 'auto' || t === 'none') choose({ kind: t });
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUpload({ busy: true, error: '' });
    try {
      const res = await fetch('/__upload/image', { method: 'POST', headers: { 'X-Filename': encodeURIComponent(file.name) }, body: file });
      const json = await res.json().catch(() => ({ error: `上传失败（${res.status}）` }));
      if (!res.ok || !json.url) throw new Error(json.error || `上传失败（${res.status}）`);
      choose({ kind: 'src', src: json.url });
      setUpload({ busy: false, error: '' });
    } catch (e) {
      setUpload({ busy: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const note = choice.kind === 'auto'
    ? (auto ? `自动 · 文中第 ${auto.index + 1} 张（${TIER[imageTier(auto)]}）` : '')
    : choice.kind === 'src'
      ? (PACK_ITEMS.find((i) => i.src === chosen)?.name ?? (images.findIndex((i) => stripFocus(i.src) === chosen) >= 0 ? `文中第 ${images.findIndex((i) => stripFocus(i.src) === chosen) + 1} 张` : '本地上传'))
      : '';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        {TABS.map((t) => <button key={t.id} type="button" onClick={() => pickTab(t.id)} className={chip(shown === t.id)}>{t.label}</button>)}
        {choice.kind !== 'auto' && <span className="font-mono text-[9px] tracking-wider text-slate-300 dark:text-slate-600">已写进文末 [oasis-cover]</span>}
      </div>

      {shown === 'auto' && (
        <p className="font-serif text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
          {auto ? `按「插画 > 没写图注的图 > 注明摄 / 来源的照片」自动挑，图解不上封面。现在挑的是文中第 ${auto.index + 1} 张。` : '正文里还没有能上封面的图（插画优先，其次是没写图注的图、注明「摄 / 来源」的照片；图解不上），卡片用分类的纸。'}
        </p>
      )}

      {shown === 'article' && (images.length ? (
        <div className="flex flex-wrap gap-2">
          {images.map((im) => (
            <button key={im.index} type="button" onClick={() => choose({ kind: 'src', src: im.src })} className={thumb(chosen === stripFocus(im.src))} title={im.caption || im.alt}>
              <img src={stripFocus(im.src)} alt="" loading="lazy" decoding="async" className="block w-full h-[64px] object-cover" />
              <span className="block px-1.5 py-1 font-serif text-[10px] text-slate-500 dark:text-slate-400 truncate">第 {im.index + 1} 张 · {TIER[imageTier(im)]}</span>
            </button>
          ))}
        </div>
      ) : <p className="font-serif text-xs text-slate-400 dark:text-slate-500">正文里还没有图。</p>)}

      {shown === 'local' && (
        <div className="flex items-center gap-3 flex-wrap font-serif text-xs text-slate-400 dark:text-slate-500">
          {CAN_UPLOAD ? (
            <>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/heic,.heic,.heif" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <button type="button" disabled={upload.busy} onClick={() => fileRef.current?.click()} className={`${chip(false)} disabled:opacity-40`}>{upload.busy ? '压缩上传中…' : '选一张本地图片'}</button>
              <span>压成 1600 宽的 webp 传到 img.boblee.dev（与 npm run img 同一条路），只当封面、不进正文。</span>
              {upload.error && <span className="text-[#FFB7C5]">{upload.error}</span>}
            </>
          ) : <span>本地上传要在本机 <code className="font-mono">npm run dev</code> 里写作时才有（要用 rclone 传 R2）。线上可以先用 <code className="font-mono">npm run img</code> 传好，图插进正文后在「文中」里选。</span>}
          {sourceOf() === 'local' && chosen && <img src={chosen} alt="" className="h-[64px] w-[104px] object-cover rounded-lg border border-[#39C5BB]" />}
        </div>
      )}

      {shown === 'pack' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-x-4 gap-y-1 flex-wrap">
            {COVER_PACKS.map((pack) => (
              <button key={pack.id} type="button" onClick={() => setPackId(pack.id)}
                className={`font-serif text-sm transition-colors ${pack === shownPack ? 'text-[#39C5BB]' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}>{pack.name}</button>
            ))}
          </div>
          <span className="font-serif text-[11px] text-slate-400 dark:text-slate-500">{shownPack.note} · CC0</span>
          <div className="flex flex-wrap gap-2">
            {shownPack.items.map((it) => (
              <button key={it.id} type="button" onClick={() => choose({ kind: 'src', src: withFocus(it.src, it.focus ?? null) })} className={thumb(chosen === it.src)} title={it.name}>
                <img src={it.thumb} alt="" loading="lazy" decoding="async" className="block w-full h-[64px] object-cover" />
                <span className="block px-1.5 py-1 font-serif text-[10px] text-slate-500 dark:text-slate-400 truncate">{it.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {shown === 'none' && <p className="font-serif text-xs text-slate-400 dark:text-slate-500">这篇的卡片不用图，用分类的纸（随笔＝花笺、笔记＝帘纹界格、项目＝云纹缎）。</p>}

      {cover && <CoverFocusEditor src={cover} note={note} onBox={(box) => onChange(setCoverFocus(content, box))} />}
    </div>
  );
};
