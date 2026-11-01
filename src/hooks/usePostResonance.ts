// src/hooks/usePostResonance.ts
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface PostResonance {
  id: string;
  post_id: string;
  author_name: string;
  content: string;
  aura_color: string;
  created_at: string;
  reply?: string;
}

export const usePostResonance = (postId: string | null) => {
  const [resonances, setResonances] = useState<PostResonance[]>([]);
  // 读完哪篇就记哪篇：isLoading 由此推出，不必在 effect 里同步 setState
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const isLoading = !!postId && loadedFor !== postId;

  useEffect(() => {
    if (!postId) return;
    let stale = false; // 读者翻到下一篇时，上一篇迟到的结果不许覆盖
    (async () => {
      const { data, error } = await supabase
        .from('post_resonances')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
      if (stale) return;

      if (!error && data) {
        // ✨ 核心机制：无损拆包。将隐匿在 content 里的回复提取出来
        const parsedData = (data as PostResonance[]).map((item) => {
          const str = item.content || '';
          const parts = str.split('[_REPLY_]');
          if (parts.length > 1) {
            return { ...item, content: parts[0], reply: parts[1] };
          }
          return item;
        });
        setResonances(parsedData);
      }
      setLoadedFor(postId);
    })();
    return () => { stale = true; };
  }, [postId]);

  const leaveResonance = async (rawAuthor: string, rawContent: string, rawColor: string) => {
    if (!postId) return;

    // 🛡️ 与 supabase/post_resonances.sql 的 RLS 约束一一对应（那边才是真正的边界，这里只是体验层）：
    //   [_REPLY_] 是站主回复的拆包标记，访客写入即可伪造挂着站主头像的假回复，必须剥掉；
    //   aura_color 会进内联样式，只放行 #RRGGBB。
    const author_name = rawAuthor.trim().slice(0, 20);
    const content = rawContent.replaceAll('[_REPLY_]', '').trim().slice(0, 150);
    const aura_color = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : '#39C5BB';
    if (!author_name || !content) return;

    const tempId = crypto.randomUUID();
    const tempResonance: PostResonance = {
      id: tempId, post_id: postId, author_name, content, aura_color, created_at: new Date().toISOString()
    };
    
    setResonances(prev => [...prev, tempResonance]);
    
    const { data, error } = await supabase
      .from('post_resonances')
      .insert([{ post_id: postId, author_name, content, aura_color }])
      .select()
      .single();
      
    if (error) {
      setResonances(prev => prev.filter(r => r.id !== tempId));
      throw error;
    }
    
    setResonances(prev => prev.map(r => r.id === tempId ? data : r));
  };

  const replyResonance = async (id: string, replyContent: string) => {
    // 1. 乐观更新渲染 UI
    setResonances(prev => prev.map(r => r.id === id ? { ...r, reply: replyContent } : r));

    // 2. 找到最纯净的原留言数据
    const target = resonances.find(r => r.id === id);
    if (!target) return;

    // ✨ 核心机制：魔术拼接。不需要数据库有 reply 列，直接隐秘塞入 content 中
    const mergedContent = `${target.content}[_REPLY_]${replyContent}`;

    const { error } = await supabase
      .from('post_resonances')
      .update({ content: mergedContent }) 
      .eq('id', id);

    if (error) {
      console.error("Failed to update reply:", error);
      setResonances(prev => prev.map(r => r.id === id ? { ...r, reply: undefined } : r));
      alert("Failed to leave echo. Please check network connection.");
      throw error;
    }
  };

  const purifyResonance = async (id: string) => {
    const { error } = await supabase.from('post_resonances').delete().eq('id', id);
    if (error) throw error;
    setResonances(prev => prev.filter(r => r.id !== id));
  };

  return { resonances, isLoading, leaveResonance, replyResonance, purifyResonance };
};