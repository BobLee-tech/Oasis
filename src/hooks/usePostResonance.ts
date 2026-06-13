// src/hooks/usePostResonance.ts
import { useState, useEffect, useCallback } from 'react';
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
  const [isLoading, setIsLoading] = useState(false);

  const fetchResonances = useCallback(async () => {
    if (!postId) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from('post_resonances')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      // ✨ 核心机制：无损拆包。将隐匿在 content 里的回复提取出来
      const parsedData = data.map((item: any) => {
        const str = item.content || '';
        const parts = str.split('[_REPLY_]');
        if (parts.length > 1) {
          return { ...item, content: parts[0], reply: parts[1] };
        }
        return item;
      });
      setResonances(parsedData);
    }
    setIsLoading(false);
  }, [postId]);

  useEffect(() => {
    fetchResonances();
  }, [fetchResonances]);

  const leaveResonance = async (author_name: string, content: string, aura_color: string) => {
    if (!postId) return;
    
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