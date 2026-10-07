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

/** 一个汉字片段的假名读音（读音层，docs/music-design.md A4.4）。 */
export interface LyricReading {
  surface: string;
  kana: string;
}

export interface LyricLine {
  startMs: number;
  endMs: number;
  ja: string;
  zh?: string;
  /** v2 歌词可选的逐词/逐音节时间；缺失时仍以逐行墨迹展示。 */
  words?: LyricWord[];
  role?: 'lead' | 'backing' | 'duet-left' | 'duet-right';
  /** 按词切分的假名读音：只列含汉字的片段，按在 ja 里出现的顺序。供「注音」与 Miku 口型。 */
  kana?: LyricReading[];
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

// ── 曲目档案（docs/music-design.md A3）：scripts/build-profiles.mjs 生成，src/lib/trackProfile.ts 按需加载 ──

export type TrackFeel = 'tender' | 'nostalgic' | 'sad' | 'peaceful' | 'joyful' | 'tense' | 'wonder';
export type TrackRelationKind = 'reply' | 'sequel' | 'sameStory' | 'sameLyrics';

export interface TrackCredits {
  lyricist?: string[];
  composer?: string[];
  arranger?: string[];
  vocal?: string[];
}

export interface TrackProfileMood {
  valence?: number;
  arousal?: number;
  feel?: TrackFeel;
  bpm?: number;
  /** 副歌段落 [startMs, endMs] */
  sections?: [number, number][];
  contrast?: number;
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
  time?: 'morning' | 'dusk' | 'night';
}

export interface TrackProfile {
  titleAlt?: string;
  album?: string;
  albumSlug?: string;
  trackNo?: number;
  released?: string;
  year?: number;
  credits?: TrackCredits;
  tieIn?: string;
  intro?: string;
  /** 他的话；notePrivate 的曲目构建时就不写进来 */
  note?: string;
  noteVisitor?: string;
  notePrivate?: boolean;
  relations?: { kind: TrackRelationKind; to: string }[];
  mood?: TrackProfileMood;
  /** 字段 → 出处：manual / netease / vocadb / musicbrainz / web / tags / auto / album / va */
  provenance: Record<string, string>;
}

export interface TrackProfilesDocument {
  version: 1;
  albums: Record<string, { album: string }>;
  tracks: Record<string, TrackProfile>;
}
