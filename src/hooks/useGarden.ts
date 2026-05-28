// src/hooks/useGarden.ts
import { useState, useCallback, useEffect } from 'react';

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  tags: string[];
  color: string;
  content: string;
}

const DEFAULT_POSTS: BlogPost[] = [
  { 
    id: 'p1', title: 'The Architecture of a Digital Garden', 
    excerpt: '打破传统博客时间轴的暴政。探讨如何构建一个具有疗愈感与空间隐喻的数字避难所。', 
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), 
    tags: ['UI/UX', 'Psyche'], color: '#39C5BB', 
    content: '## 逃离内卷\n\n在充满内卷与信息焦虑的时代，我们需要一种非竞争性的数字表达方式。数字花园不按时间线强制排序，它允许思想自由生长。\n\n### Markdown 与图片支持\n\n你现在可以像这样插入图片：\n\n![Oasis Vibe](https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=2000&auto=format&fit=crop)' 
  }
];

export const useGarden = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('oasis_garden_posts');
    if (stored) setPosts(JSON.parse(stored));
    else { setPosts(DEFAULT_POSTS); localStorage.setItem('oasis_garden_posts', JSON.stringify(DEFAULT_POSTS)); }
  }, []);

  const plantSeed = useCallback((title: string, tags: string[], color: string, content: string) => {
    const newPost: BlogPost = {
      id: crypto.randomUUID(),
      title: title.trim() || 'Untitled Thought',
      excerpt: content.slice(0, 100).replace(/[#*`>!\[\]]/g, '') + '...', 
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      tags: tags.length > 0 ? tags : ['Draft'], color, content,
    };
    setPosts(prev => { const updated = [newPost, ...prev]; localStorage.setItem('oasis_garden_posts', JSON.stringify(updated)); return updated; });
  }, []);

  // ✅ 新增：更新文章功能
  const updateSeed = useCallback((id: string, title: string, tags: string[], color: string, content: string) => {
    setPosts(prev => {
      const updated = prev.map(p => p.id === id ? { 
        ...p, title: title.trim() || 'Untitled', tags: tags.length > 0 ? tags : ['Draft'], color, content,
        excerpt: content.slice(0, 100).replace(/[#*`>!\[\]]/g, '') + '...'
      } : p);
      localStorage.setItem('oasis_garden_posts', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // ✅ 新增：摧毁文章功能
  const uprootSeed = useCallback((id: string) => {
    setPosts(prev => {
      const updated = prev.filter(p => p.id !== id);
      localStorage.setItem('oasis_garden_posts', JSON.stringify(updated));
      return updated;
    });
  }, []);

  return { posts, plantSeed, updateSeed, uprootSeed };
};