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
  reply?: string; // ✨ 新增：作者的回音
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

    if (!error && data) setResonances(data);
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

  // ✨ 新增：赋予造物主留下回音的能力
  const replyResonance = async (id: string, replyContent: string) => {
    // 乐观更新：瞬间显示回复
    setResonances(prev => prev.map(r => r.id === id ? { ...r, reply: replyContent } : r));

    const { error } = await supabase
      .from('post_resonances')
      .update({ reply: replyContent })
      .eq('id', id);

    if (error) {
      // 失败则回滚
      alert("Failed to leave echo. Connection unstable.");
      setResonances(prev => prev.map(r => r.id === id ? { ...r, reply: undefined } : r));
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