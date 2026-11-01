// src/hooks/useCategories.ts
// 🏷️ 自定义分类系统：内置 5 类打底 + 用户自建分类。
//   · 数据源与 useGarden 同一套哲学：Supabase garden_categories 为权威源，localStorage 兜底，
//     云端失败静默回落，绝不影响可用性。
//   · Gallery（博客）与 Orchard（知识星图）共用，分类的颜色 / 中文名 / 图标只有一处定义。
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { AURA } from '../lib/aura';

export interface Category {
  id: string;        // 存进文章 type 字段的稳定标识
  label: string;     // 英文名（列表 / 徽章展示）
  zh: string;        // 中文名
  color: string;
  icon: string;      // ICON 集合里的 key
  builtin?: boolean; // 内置分类不可删除
}

// —— 内置分类：与历史数据的 type 值一一对应，永远存在。颜色取自 lib/aura.ts 的七色环 ——
export const BUILTIN_CATEGORIES: Category[] = [
  { id: 'thought', label: 'Thoughts', zh: '随笔', color: AURA.teal, icon: 'pen', builtin: true },
  { id: 'weekly', label: 'Weekly', zh: '周报', color: AURA.sakura, icon: 'calendar', builtin: true },
  { id: 'note', label: 'Notes', zh: '学习笔记', color: AURA.sky, icon: 'book', builtin: true },
  { id: 'growth', label: 'Growth', zh: '成长', color: AURA.mint, icon: 'sprout', builtin: true },
  { id: 'project', label: 'Projects', zh: '项目复盘', color: AURA.violet, icon: 'tool', builtin: true },
];

// 未知 type（如分类被删后的遗留文章）的兜底元数据：仍能正常展示
export const fallbackMeta = (type: string): Category =>
  ({ id: type, label: type || 'Misc', zh: type || '未分类', color: AURA.teal, icon: 'pen' });

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
  const customRef = useRef(custom); // 只经 commit 改，回调里读最新列表

  const commit = useCallback((next: Category[]) => {
    customRef.current = next;
    setCustom(next);
    writeCache(next);
  }, []);

  // 首次挂载：拉云端自定义分类覆盖本地缓存；失败静默回落
  useEffect(() => {
    supabase.from(TABLE).select('*').then(({ data, error }) => {
      if (error) { cloudOk.current = false; return; }
      cloudOk.current = true;
      if (data) commit((data as Category[]).map((r) => ({ id: r.id, label: r.label, zh: r.zh, color: r.color, icon: r.icon })));
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
