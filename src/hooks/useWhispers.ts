// src/hooks/useWhispers.ts
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface Whisper {
  id: string;
  author_name: string;
  content: string;
  aura_color: string;
  created_at: string;
  // 🌌 星系物理基因
  x: number; y: number;
  size: number; blur: number; duration: number;
  driftX: number; driftY: number;
}

export const useWhispers = () => {
  const [whispers, setWhispers] = useState<Whisper[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchWhispers = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('whispers').select('*').order('created_at', { ascending: false });

    if (!error && data) {
      const positionedData = data.map((item) => ({
        ...item,
        x: Math.floor(Math.random() * 80) + 10,
        y: Math.floor(Math.random() * 80) + 10,
        size: Math.random() * 3 + 2, // 大小 2px - 5px
        blur: Math.random() * 1.5, // 景深模糊
        duration: Math.random() * 10 + 15, // 呼吸与游荡的极慢周期 (15s - 25s)
        driftX: Math.random() * 40 - 20, // 左右漂浮范围
        driftY: Math.random() * 40 - 20, // 上下漂浮范围
      }));
      setWhispers(positionedData);
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchWhispers(); }, []);

  const leaveWhisper = async (author_name: string, content: string, aura_color: string) => {
    const { error } = await supabase.from('whispers').insert([{ author_name, content, aura_color }]);
    if (error) throw error;
    await fetchWhispers(); 
  };

  const purifyWhisper = async (id: string) => {
    const { error } = await supabase.from('whispers').delete().eq('id', id);
    if (error) throw error;
    setWhispers(prev => prev.filter(w => w.id !== id));
  };

  return { whispers, isLoading, leaveWhisper, purifyWhisper };
};