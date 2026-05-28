// src/hooks/useDiary.ts
import { useState, useCallback, useEffect } from 'react';
import type { DiaryEcho } from '../types/diary';

// 🌍 全局草稿状态：初始颜色必须为空(null)，保证进门绝对的纯净留白
let globalDraftContent = '';
let globalDraftColor: string | null = null; 

export const useDiary = () => {
  const [echoes, setEchoes] = useState<DiaryEcho[]>([]);
  const [draftContent, _setDraftContent] = useState<string>(globalDraftContent);
  // ✅ 允许状态为空
  const [draftColor, _setDraftColor] = useState<string | null>(globalDraftColor); 

  useEffect(() => {
    const stored = localStorage.getItem('oasis_echoes');
    if (stored) setEchoes(JSON.parse(stored));
  }, []);

  // 实时同步草稿 (允许传入 null)
  const setDraft = useCallback((content: string, color: string | null) => {
    globalDraftContent = content;
    globalDraftColor = color;
    _setDraftContent(content);
    _setDraftColor(color);
  }, []);

  const releaseEcho = useCallback((content: string, color: string) => {
    const newEcho: DiaryEcho = {
      id: crypto.randomUUID(),
      content,
      timestamp: Date.now(),
      color,
    };
    
    setEchoes(prev => {
      const updated = [newEcho, ...prev];
      localStorage.setItem('oasis_echoes', JSON.stringify(updated));
      return updated;
    });
    
    // ✅ 核心：释放记忆后，彻底清空颜色草稿，让光晕熄灭
    globalDraftContent = '';
    globalDraftColor = null; 
    _setDraftContent('');
    _setDraftColor(null);
    
    return newEcho;
  }, []);

  return { echoes, releaseEcho, draftContent, draftColor, setDraft };
};