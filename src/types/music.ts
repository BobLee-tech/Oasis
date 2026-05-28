// src/types/music.ts
export type MusicCategory = 'Yorushika' | 'Atarayo' | 'Miku' | 'All Tracks';

export interface Track {
  id: string;
  title: string;
  artist: string;
  url: string;
  color: string;
  lyric?: string;
  category: MusicCategory; // ✅ 新增：歌曲所属的分类阵营
}