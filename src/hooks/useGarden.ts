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

// 保留两篇默认文章作为引子
const DEFAULT_POSTS: BlogPost[] = [
  { 
    id: 'p1', 
    title: 'The Architecture of a Digital Garden', 
    excerpt: '打破传统博客时间轴的暴政。探讨如何构建一个具有疗愈感与空间隐喻的数字避难所。', 
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), 
    tags: ['UI/UX', 'Psyche'], color: '#39C5BB', 
    content: '## 逃离内卷\n\n在充满内卷与信息焦虑的时代，我们需要一种非竞争性的数字表达方式。数字花园不按时间线强制排序，它允许思想自由生长。\n\n### 为什么选择 Markdown？\n\n因为它剥离了形式的干扰，让你回归**纯粹的表达**。' 
  }
];

export const useGarden = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('oasis_garden_posts');
    if (stored) {
      setPosts(JSON.parse(stored));
    } else {
      setPosts(DEFAULT_POSTS);
      localStorage.setItem('oasis_garden_posts', JSON.stringify(DEFAULT_POSTS));
    }
  }, []);

  const plantSeed = useCallback((title: string, tags: string[], color: string, content: string) => {
    const newPost: BlogPost = {
      id: crypto.randomUUID(),
      title: title.trim() || 'Untitled Thought',
      excerpt: content.slice(0, 100).replace(/[#*`>]/g, '') + '...', // 自动生成纯文本摘要
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      tags: tags.length > 0 ? tags : ['Draft'],
      color,
      content,
    };
    
    setPosts(prev => {
      const updated = [newPost, ...prev];
      localStorage.setItem('oasis_garden_posts', JSON.stringify(updated));
      return updated;
    });
  }, []);

  return { posts, plantSeed };
};

