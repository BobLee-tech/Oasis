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
      // ✨ 核心修复：弹出警报，提示数据库问题
      alert(`Failed to leave resonance: ${error.message}\n(Make sure you ran the Supabase SQL!)`);
      throw error;
    }
    
    setResonances(prev => prev.map(r => r.id === tempId ? data : r));
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