// src/types/music.ts
export type MusicCategory = 'Yorushika' | 'Atarayo' | 'Miku' | 'All Tracks';

export interface TrackLyricsRef {
  /** R2 / dist-lyrics 中的相对键；不允许由用户输入直接拼接。 */
  key: string;
  /** 对个别母带做最终校准，不修改原始歌词文件。 */
  offsetMs?: number;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  url: string;
  color: string;
  /** 播放器标题下方的一句策展摘句，不是逐行歌词。 */
  excerpt?: string;
  lyrics?: TrackLyricsRef;
  category: MusicCategory;
}

export type LyricTranslationStatus = 'none' | 'machine' | 'reviewed';
export type LyricLanguage = 'ja' | 'bilingual' | 'zh';

export interface LyricWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface LyricLine {
  startMs: number;
  endMs: number;
  ja: string;
  zh?: string;
  /** v2 歌词可选的逐词/逐音节时间；缺失时仍以逐行墨迹展示。 */
  words?: LyricWord[];
  role?: 'lead' | 'backing' | 'duet-left' | 'duet-right';
}

export interface LyricsSource {
  kind: 'local' | 'lrclib' | 'netease';
  label: string;
  url?: string;
  fetchedAt?: string;
}

export interface LyricsDocument {
  version: 1 | 2;
  trackId: string;
  title: string;
  artist: string;
  language: 'ja' | 'und';
  offsetMs: number;
  translationStatus: LyricTranslationStatus;
  source: LyricsSource;
  /** 译文署名，如「网易云」「Codex」或站主本名；缺省时不展示来源。 */
  translator?: string;
  lines: LyricLine[];
}

export interface LyricsManifestLyricsEntry {
  kind: 'lyrics';
  key: string;
  translationStatus: LyricTranslationStatus;
}

export interface LyricsManifestInstrumentalEntry {
  kind: 'instrumental';
}

export type LyricsManifestEntry =
  | LyricsManifestLyricsEntry
  | LyricsManifestInstrumentalEntry;

export interface LyricsManifest {
  version: 1;
  generatedAt: string;
  tracks: Record<string, LyricsManifestEntry>;
}
