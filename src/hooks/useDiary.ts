// src/hooks/useDiary.ts
import { useState, useCallback, useEffect } from 'react';
import type { DiaryEcho } from '../types/diary';

let globalDraftContent = '';
let globalDraftColor: string | null = null;

export const useDiary = () => {
  const [echoes, setEchoes] = useState<DiaryEcho[]>([]);
  const [draftContent, _setDraftContent] = useState<string>(globalDraftContent);
  const [draftColor, _setDraftColor] = useState<string | null>(globalDraftColor);

  useEffect(() => {
    const stored = localStorage.getItem('oasis_echoes');
    if (stored) setEchoes(JSON.parse(stored));
  }, []);

  const setDraft = useCallback((content: string, color: string | null) => {
    globalDraftContent = content; globalDraftColor = color;
    _setDraftContent(content); _setDraftColor(color);
  }, []);

  const releaseEcho = useCallback((content: string, color: string) => {
    const newEcho: DiaryEcho = {
      id: crypto.randomUUID(), content, timestamp: Date.now(), color,
    };
    setEchoes(prev => {
      const updated = [newEcho, ...prev];
      localStorage.setItem('oasis_echoes', JSON.stringify(updated));
      return updated;
    });
    globalDraftContent = ''; globalDraftColor = null;
    _setDraftContent(''); _setDraftColor(null);
    return newEcho;
  }, []);

  // ✅ 新增：物理粉碎日记功能
  const forgetEcho = useCallback((id: string) => {
    setEchoes(prev => {
      const updated = prev.filter(echo => echo.id !== id);
      localStorage.setItem('oasis_echoes', JSON.stringify(updated));
      return updated;
    });
  }, []);

  return { echoes, releaseEcho, draftContent, draftColor, setDraft, forgetEcho };
};