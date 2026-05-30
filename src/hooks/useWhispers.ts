// src/hooks/useWhispers.ts
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface Whisper {
  id: string;
  author_name: string;
  content: string;
  aura_color: string;
  created_at: string;
  x: number; y: number;
  size: number; blur: number; duration: number;
  driftX: number; driftY: number;
}

// 🧮 极其精妙的「确定性哈希生成器」：同一个种子永远输出同一个 0-1 之间的小数
const getSeededRandom = (seedStr: string) => {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
};

// 🧬 为每条数据打上「永不改变」的物理基因
const appendPhysics = (item: any): Whisper => {
  const randX = getSeededRandom(item.id + 'x');
  const randY = getSeededRandom(item.id + 'y');
  const randSize = getSeededRandom(item.id + 's');
  const randBlur = getSeededRandom(item.id + 'b');
  const randDur = getSeededRandom(item.id + 'd');
  const randDx = getSeededRandom(item.id + 'dx');
  const randDy = getSeededRandom(item.id + 'dy');
  
  return {
    ...item,
    x: Math.floor(randX * 80) + 10,
    y: Math.floor(randY * 80) + 10,
    size: randSize * 3 + 2,
    blur: randBlur * 1.5,
    duration: randDur * 10 + 15,
    driftX: randDx * 40 - 20,
    driftY: randDy * 40 - 20,
  };
};

export const useWhispers = () => {
  const [whispers, setWhispers] = useState<Whisper[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchWhispers = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('whispers').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      setWhispers(data.map(appendPhysics));
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchWhispers(); }, []);

  const leaveWhisper = async (author_name: string, content: string, aura_color: string) => {
    const tempId = crypto.randomUUID();
    const tempW = appendPhysics({ id: tempId, author_name, content, aura_color, created_at: new Date().toISOString() });
    
    // ✨ 乐观更新：无延迟呈现在星空中
    setWhispers(prev => [tempW, ...prev]);

    // ✨ 核心修复：要求 Supabase 返回插入的真实数据，不触发全局 fetch()
    const { data, error } = await supabase
      .from('whispers')
      .insert([{ author_name, content, aura_color }])
      .select()
      .single();

    if (error) {
      setWhispers(prev => prev.filter(w => w.id !== tempId)); // 失败则悄悄撤回
      throw error;
    }
    
    // 成功后，悄悄将临时 ID 替换为云端的真实 ID，不引发任何位置重绘
    setWhispers(prev => prev.map(w => w.id === tempId ? appendPhysics(data) : w));
  };

  const purifyWhisper = async (id: string) => {
    const { error } = await supabase.from('whispers').delete().eq('id', id);
    if (error) throw error;
    setWhispers(prev => prev.filter(w => w.id !== id));
  };

  return { whispers, isLoading, leaveWhisper, purifyWhisper };
};