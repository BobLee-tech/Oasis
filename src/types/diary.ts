// src/types/diary.ts
export interface DiaryEcho {
  id: string;
  content: string;
  timestamp: number;
  temperature?: number; // 兼容老日记
  color: string;        // ✅ 新增：七彩情绪色
}