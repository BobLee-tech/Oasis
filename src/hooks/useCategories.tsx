// src/hooks/useCategories.tsx
// 🏷️ 自定义分类系统：内置 5 类打底 + 用户自建分类。
//   · 数据源与 useGarden 同一套哲学：Supabase garden_categories 为权威源，localStorage 兜底，
//     云端失败静默回落，绝不影响可用性。
//   · Gallery（博客）与 Orchard（知识星图）共用，分类的颜色 / 中文名 / 图标只有一处定义。
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';

export interface Category {
  id: string;        // 存进文章 type 字段的稳定标识
  label: string;     // 英文名（列表 / 徽章展示）
  zh: string;        // 中文名
  color: string;
  icon: string;      // ICON 集合里的 key
  builtin?: boolean; // 内置分类不可删除
}

// —— 🎨 线性图标集：内置 5 个 + 供自定义分类挑选的扩展图标，风格统一 ——
const strokeProps = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
  strokeLinecap: 'round', strokeLinejoin: 'round',
} as const;
const ICONS: Record<string, React.ReactNode> = {
  pen: (<><path d="M20.4 14.5L16 10 4 20"/><path d="M14 4l6 6"/><path d="M3 21l4-1 11-11a2.8 2.8 0 0 0-4-4L3 16z"/></>),
  calendar: (<><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>),
  book: (<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>),
  sprout: (<><path d="M7 20h10"/><path d="M12 20V8"/><path d="M12 8C12 5 9.5 3 6 3c0 3.5 2.5 5 6 5z"/><path d="M12 11c0-2.5 2.2-4.5 5.5-4.5C17.5 9.5 15.2 11 12 11z"/></>),
  tool: (<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>),
  star: (<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>),
  heart: (<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/>),
  music: (<><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>),
  camera: (<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></>),
  flask: (<><path d="M10 2v7L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V2"/><path d="M8.5 2h7"/><path d="M7 15h10"/></>),
  globe: (<><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>),
  film: (<><rect x="2" y="2" width="20" height="20" rx="2.2"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 7h5M17 17h5"/></>),
  compass: (<><circle cx="12" cy="12" r="10"/><path d="M16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3z"/></>),
  coffee: (<><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><path d="M6 1v3M10 1v3M14 1v3"/></>),
};
export const ICON_NAMES = Object.keys(ICONS);

// 分类图标组件：任何地方渲染图标只经此一处
export const CategoryIcon: React.FC<{ name?: string }> = ({ name }) => (
  <svg viewBox="0 0 24 24" {...strokeProps} className="w-full h-full">
    {ICONS[name || 'pen'] ?? ICONS.pen}
  </svg>
);

// —— 内置分类：与历史数据的 type 值一一对应，永远存在 ——
export const BUILTIN_CATEGORIES: Category[] = [
  { id: 'thought', label: 'Thoughts', zh: '随笔', color: '#39C5BB', icon: 'pen', builtin: true },
  { id: 'weekly', label: 'Weekly', zh: '周报', color: '#FFB7C5', icon: 'calendar', builtin: true },
  { id: 'note', label: 'Notes', zh: '学习笔记', color: '#60A5FA', icon: 'book', builtin: true },
  { id: 'growth', label: 'Growth', zh: '成长', color: '#A7F3D0', icon: 'sprout', builtin: true },
  { id: 'project', label: 'Projects', zh: '项目复盘', color: '#A78BFA', icon: 'tool', builtin: true },
];

// 未知 type（如分类被删后的遗留文章）的兜底元数据：仍能正常展示
export const fallbackMeta = (type: string): Category =>
  ({ id: type, label: type || 'Misc', zh: type || '未分类', color: '#39C5BB', icon: 'pen' });

const TABLE = 'garden_categories';
const CACHE_KEY = 'oasis_custom_categories';

const readCache = (): Category[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
};
const writeCache = (cats: Category[]) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cats)); } catch { /* ignore */ }
};

// 英文名 → 稳定 id：小写连字符；撞上内置 id 或空串时追加随机后缀
const makeId = (label: string) => {
  const slug = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const taken = BUILTIN_CATEGORIES.some(c => c.id === slug);
  return (!slug || taken) ? `${slug || 'cat'}-${Math.random().toString(36).slice(2, 7)}` : slug;
};

export const useCategories = () => {
  const [custom, setCustom] = useState<Category[]>(readCache);
  const cloudOk = useRef(true);
  const customRef = useRef(custom);
  customRef.current = custom;

  const commit = useCallback((next: Category[]) => {
    setCustom(next);
    writeCache(next);
  }, []);

  // 首次挂载：拉云端自定义分类覆盖本地缓存；失败静默回落
  useEffect(() => {
    supabase.from(TABLE).select('*').then(({ data, error }) => {
      if (error) { cloudOk.current = false; return; }
      cloudOk.current = true;
      if (data) commit(data.map((r: any) => ({ id: r.id, label: r.label, zh: r.zh, color: r.color, icon: r.icon })));
    });
  }, [commit]);

  const addCategory = useCallback((label: string, zh: string, color: string, icon: string): Category => {
    const cat: Category = { id: makeId(label), label: label.trim() || 'Untitled', zh: zh.trim() || label.trim(), color, icon };
    commit([...customRef.current, cat]);
    if (cloudOk.current) supabase.from(TABLE).insert(cat).then(({ error }) => { if (error) cloudOk.current = false; });
    return cat;
  }, [commit]);

  const removeCategory = useCallback((id: string) => {
    commit(customRef.current.filter(c => c.id !== id));
    if (cloudOk.current) supabase.from(TABLE).delete().eq('id', id).then(({ error }) => { if (error) cloudOk.current = false; });
  }, [commit]);

  // ⚡ 稳定引用：categories/catMap/metaOf 每次渲染都新建的话，下游 useMemo（如星图 buildGraph）
  //   永远拿到「不同」的 categories，memo 形同虚设——见 OasisOrchard.tsx 的性能修复。
  const categories = useMemo(() => [...BUILTIN_CATEGORIES, ...custom], [custom]);
  const catMap: Record<string, Category> = useMemo(
    () => Object.fromEntries(categories.map(c => [c.id, c])),
    [categories]
  );
  const metaOf = useCallback((type: string): Category => catMap[type] ?? fallbackMeta(type), [catMap]);

  return { categories, catMap, metaOf, addCategory, removeCategory };
};
