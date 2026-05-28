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
    
    // ✨ 核心优化：乐观更新 (Optimistic UI)
    // 假造一个临时 ID，瞬间把用户的留言渲染在屏幕上，享受 0ms 延迟的快感
    const tempId = crypto.randomUUID();
    const tempResonance: PostResonance = {
      id: tempId, post_id: postId, author_name, content, aura_color, created_at: new Date().toISOString()
    };
    setResonances(prev => [...prev, tempResonance]);

    const { error } = await supabase
      .from('post_resonances')
      .insert([{ post_id: postId, author_name, content, aura_color }]);
      
    if (error) {
      // 如果写入失败，悄悄回滚
      setResonances(prev => prev.filter(r => r.id !== tempId));
      throw error;
    }
    
    // 成功后在后台悄悄同步真实的数据库 ID
    fetchResonances(); 
  };

  const purifyResonance = async (id: string) => {
    const { error } = await supabase
      .from('post_resonances')
      .delete()
      .eq('id', id);
    if (error) throw error;
    setResonances(prev => prev.filter(r => r.id !== id));
  };

  return { resonances, isLoading, leaveResonance, purifyResonance };
};