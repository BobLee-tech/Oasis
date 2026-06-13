// src/hooks/useGarden.ts
import { useState, useCallback, useEffect } from 'react';

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

// 🩹 老数据迁移：为缺失字段的旧文章补齐 type / createdAt
const hydrate = (raw: any[]): BlogPost[] =>
  raw.map((p, i) => {
    const createdAt = typeof p.createdAt === 'number'
      ? p.createdAt
      : (Date.parse(p.date) || (Date.now() - i * 86400000));
    return {
      type: 'thought' as PostType,
      ...p,
      createdAt,
      date: p.date || friendlyDate(createdAt),
    };
  });

const sortByNewest = (arr: BlogPost[]) => [...arr].sort((a, b) => b.createdAt - a.createdAt);

export const useGarden = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('oasis_garden_posts');
    if (stored) {
      const hydrated = sortByNewest(hydrate(JSON.parse(stored)));
      setPosts(hydrated);
      localStorage.setItem('oasis_garden_posts', JSON.stringify(hydrated));
    } else {
      setPosts(DEFAULT_POSTS);
      localStorage.setItem('oasis_garden_posts', JSON.stringify(DEFAULT_POSTS));
    }
  }, []);

  const persist = (updater: (prev: BlogPost[]) => BlogPost[]) =>
    setPosts(prev => {
      const updated = updater(prev);
      localStorage.setItem('oasis_garden_posts', JSON.stringify(updated));
      return updated;
    });

  const plantSeed = useCallback((title: string, tags: string[], color: string, content: string, type: PostType = 'thought') => {
    const now = Date.now();
    const newPost: BlogPost = {
      id: crypto.randomUUID(),
      title: title.trim() || 'Untitled Thought',
      excerpt: makeExcerpt(content),
      date: friendlyDate(now), createdAt: now, type,
      tags: tags.length > 0 ? tags : ['Draft'], color, content,
    };
    persist(prev => sortByNewest([newPost, ...prev]));
  }, []);

  const updateSeed = useCallback((id: string, title: string, tags: string[], color: string, content: string, type: PostType = 'thought') => {
    persist(prev => prev.map(p => p.id === id ? {
      ...p, title: title.trim() || 'Untitled', tags: tags.length > 0 ? tags : ['Draft'], color, content, type,
      excerpt: makeExcerpt(content),
    } : p));
  }, []);

  const uprootSeed = useCallback((id: string) => {
    persist(prev => prev.filter(p => p.id !== id));
  }, []);

  return { posts, plantSeed, updateSeed, uprootSeed };
};
