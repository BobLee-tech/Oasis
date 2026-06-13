// src/hooks/useGarden.ts
// 🌱 数字花园数据层：Supabase 云端为权威源 + localStorage 本地缓存兜底。
//   · 首屏：先用本地缓存瞬时点亮，再向云端拉取最新覆盖（不白屏、不等待）。
//   · 实时：订阅 garden_posts 表变更，博客与知识星图（同源 useGarden）跨标签页/设备自动同步。
//   · 离线 / 表未建：云端任何失败都静默回落到本地缓存，行为与旧版纯本地一致，绝不破坏可用性。
// 公开 API 与旧版完全一致：{ posts, plantSeed, updateSeed, uprootSeed }。
import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

// 🌱 条目类型：随笔 / 周报 / 学习笔记 / 成长记录 / 项目复盘
export type PostType = 'thought' | 'weekly' | 'note' | 'growth' | 'project';

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  date: string;          // 展示用的友好日期串
  createdAt: number;     // 真实时间戳，用于可靠排序与按月归档
  type: PostType;        // 条目类型
  tags: string[];
  color: string;
  content: string;
}

const TABLE = 'garden_posts';
const CACHE_KEY = 'oasis_garden_posts';

const makeExcerpt = (content: string) =>
  content.slice(0, 110).replace(/[#*`>!\[\]()]/g, '').replace(/\n+/g, ' ').trim() + '…';

const friendlyDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const DEFAULT_POSTS: BlogPost[] = [
  {
    id: 'p1', title: 'The Architecture of a Digital Garden',
    excerpt: '打破传统博客时间轴的暴政。探讨如何构建一个具有疗愈感与空间隐喻的数字避难所。',
    date: friendlyDate(Date.now()), createdAt: Date.now(), type: 'thought',
    tags: ['UI/UX', 'Psyche'], color: '#39C5BB',
    content: '## 逃离内卷\n\n在充满内卷与信息焦虑的时代，我们需要一种非竞争性的数字表达方式。数字花园不按时间线强制排序，它允许思想自由生长。\n\n### Markdown 与图片支持\n\n你现在可以像这样插入图片：\n\n![Oasis Vibe](https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=2000&auto=format&fit=crop)'
  }
];

const sortByNewest = (arr: BlogPost[]) => [...arr].sort((a, b) => b.createdAt - a.createdAt);

// 🩹 老数据迁移：为缺失字段的旧文章补齐 type / createdAt / tags
const hydrate = (raw: any[]): BlogPost[] =>
  raw.map((p, i) => {
    const createdAt = typeof p.createdAt === 'number'
      ? p.createdAt
      : (Date.parse(p.date) || (Date.now() - i * 86400000));
    return {
      type: 'thought' as PostType,
      ...p,
      createdAt,
      tags: Array.isArray(p.tags) ? p.tags : [],
      date: p.date || friendlyDate(createdAt),
    };
  });

// —— 本地缓存读写 ——
const readCache = (): BlogPost[] | null => {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    return stored ? sortByNewest(hydrate(JSON.parse(stored))) : null;
  } catch { return null; }
};
const writeCache = (posts: BlogPost[]) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(posts)); } catch { /* 容量/隐私模式失败可忽略 */ }
};

// —— DB 行 ⇄ BlogPost 映射（snake_case ⇄ camelCase） ——
const fromRow = (r: any): BlogPost => ({
  id: r.id,
  title: r.title,
  excerpt: r.excerpt,
  date: r.date || friendlyDate(Number(r.created_at)),
  createdAt: typeof r.created_at === 'number' ? r.created_at : Number(r.created_at),
  type: r.type,
  tags: Array.isArray(r.tags) ? r.tags : [],
  color: r.color,
  content: r.content,
});
const toRow = (p: BlogPost) => ({
  id: p.id, title: p.title, excerpt: p.excerpt, date: p.date,
  created_at: p.createdAt, type: p.type, tags: p.tags, color: p.color, content: p.content,
});

export const useGarden = () => {
  const [posts, setPosts] = useState<BlogPost[]>(() => readCache() ?? []);
  // 云端是否可用：失败一次即标记，后续写入只走本地，保持离线可用
  const cloudOk = useRef(true);
  // 始终持有最新 posts，供事件回调读取，避免把 posts 列进 useCallback 依赖造成订阅反复重建
  const postsRef = useRef(posts);
  postsRef.current = posts;

  // 统一更新入口：写状态 + 同步本地缓存
  const commit = useCallback((next: BlogPost[]) => {
    const sorted = sortByNewest(next);
    setPosts(sorted);
    writeCache(sorted);
  }, []);

  const fetchCloud = useCallback(async () => {
    try {
      const { data, error } = await supabase.from(TABLE).select('*');
      if (error) throw error;
      cloudOk.current = true;
      if (data && data.length > 0) {
        commit(data.map(fromRow));
      } else if (!readCache()) {
        // 云端为空且本地也无缓存：植入默认首篇（并尝试上云）
        commit(DEFAULT_POSTS);
        supabase.from(TABLE).insert(DEFAULT_POSTS.map(toRow)).then(({ error: e }) => { if (e) cloudOk.current = false; });
      }
    } catch {
      // 云端不可用（离线 / 表未建 / 凭证缺失）：回落本地缓存，无缓存则播种默认
      cloudOk.current = false;
      const cached = readCache();
      commit(cached ?? DEFAULT_POSTS);
    }
  }, [commit]);

  useEffect(() => {
    fetchCloud();
    // 🛰️ 实时订阅：任意端增删改 → 本地刷新，博客与星图同步
    const channel = supabase
      .channel('garden_posts_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => fetchCloud())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchCloud]);

  const plantSeed = useCallback((title: string, tags: string[], color: string, content: string, type: PostType = 'thought') => {
    const now = Date.now();
    const newPost: BlogPost = {
      id: crypto.randomUUID(),
      title: title.trim() || 'Untitled Thought',
      excerpt: makeExcerpt(content),
      date: friendlyDate(now), createdAt: now, type,
      tags: tags.length > 0 ? tags : ['Draft'], color, content,
    };
    commit([newPost, ...postsRef.current]); // 乐观更新
    if (cloudOk.current) supabase.from(TABLE).insert(toRow(newPost)).then(({ error }) => { if (error) cloudOk.current = false; });
  }, [commit]);

  const updateSeed = useCallback((id: string, title: string, tags: string[], color: string, content: string, type: PostType = 'thought') => {
    const patch = {
      title: title.trim() || 'Untitled', tags: tags.length > 0 ? tags : ['Draft'], color, content, type,
      excerpt: makeExcerpt(content),
    };
    commit(postsRef.current.map(p => p.id === id ? { ...p, ...patch } : p));
    if (cloudOk.current) supabase.from(TABLE).update(patch).eq('id', id).then(({ error }) => { if (error) cloudOk.current = false; });
  }, [commit]);

  const uprootSeed = useCallback((id: string) => {
    commit(postsRef.current.filter(p => p.id !== id));
    if (cloudOk.current) supabase.from(TABLE).delete().eq('id', id).then(({ error }) => { if (error) cloudOk.current = false; });
  }, [commit]);

  // ☁️ 一键迁移：把当前所有本地文章 upsert 到云端（按 id 去重，可重复安全执行）。
  //    返回 { count } 表示同步条数；若表未建 / 未登录 / 离线则抛错，由调用方提示。
  const syncToCloud = useCallback(async (): Promise<{ count: number }> => {
    const all = postsRef.current;
    if (all.length === 0) return { count: 0 };
    const { error } = await supabase.from(TABLE).upsert(all.map(toRow), { onConflict: 'id' });
    if (error) { cloudOk.current = false; throw error; }
    cloudOk.current = true;
    return { count: all.length };
  }, []);

  return { posts, plantSeed, updateSeed, uprootSeed, syncToCloud };
};
