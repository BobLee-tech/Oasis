// 工坊前端 ↔ scripts/music-studio/api.mjs。类型只描述工坊用到的那部分。
import type { LyricLine, LyricsDocument } from '../../types/music';

export type GateName = 'version' | 'clean' | 'translation' | 'reading' | 'listened';
export const GATE_ORDER: GateName[] = ['version', 'clean', 'translation', 'reading', 'listened'];
export const GATE_LABELS: Record<GateName, string> = {
  version: '版本', clean: '洁净', translation: '译文', reading: '读音', listened: '试听',
};

export interface GateResult {
  pass: boolean;
  detail: string;
  lines?: number[];
}

export interface Credits {
  lyricist?: string[];
  composer?: string[];
  arranger?: string[];
  vocal?: string[];
}

export type Feel = 'tender' | 'nostalgic' | 'sad' | 'peaceful' | 'joyful' | 'tense' | 'wonder';
export const FEEL_LABELS: Record<Feel, string> = {
  tender: '温柔', nostalgic: '怀念', sad: '哀伤', peaceful: '宁静', joyful: '雀跃', tense: '紧绷', wonder: '奇妙',
};
export type RelationKind = 'reply' | 'sequel' | 'sameStory' | 'sameLyrics';
export const RELATION_LABELS: Record<RelationKind, string> = {
  reply: '回信', sequel: '续篇', sameStory: '同一个故事', sameLyrics: '同一份词',
};

export interface Mood {
  valence?: number;
  arousal?: number;
  feel?: Feel;
  bpm?: number;
  sections?: [number, number][];
  season?: string;
  time?: string;
}

export interface Ref {
  url: string;
  source: string;
  title?: string;
  license?: string;
  fetchedAt: string;
  text: string;
}

/** 网络资料整理出的初稿（scripts 写入，工坊里采纳或改写）；不进公开档案。 */
export interface Draft {
  intro?: string;
  valence?: number;
  feel?: Feel;
  /** 一句话依据：为什么是这个心境 */
  basis?: string;
  confidence?: 'high' | 'medium' | 'low';
  refs?: { title: string; url: string }[];
  draftedAt?: string;
  acceptedAt?: string;
}

export interface ProfileSource {
  songId?: number;
  url?: string;
  fetchedAt?: string;
  titleAlt?: string;
  album?: string;
  trackNo?: number;
  released?: string;
  credits?: Credits;
  creditsMissing?: boolean;
  tieIn?: string;
  bpm?: number;
  transUser?: string;
  lyricUser?: string;
}

export interface Profile {
  id: string;
  ncmId?: number;
  titleAlt?: string;
  album?: string;
  trackNo?: number;
  released?: string;
  credits?: Credits;
  tieIn?: string;
  intro?: string;
  note?: string;
  noteVisitor?: string;
  notePrivate?: boolean;
  relations?: { kind: RelationKind; to: string }[];
  mood?: Mood;
  lyrics?: { outroMs?: number; readings?: Record<string, string> };
  sources?: {
    netease?: ProfileSource;
    vocadb?: ProfileSource;
    musicbrainz?: ProfileSource;
    web?: ProfileSource;
    refs?: Ref[];
    draft?: Draft;
  };
}

export interface Merged {
  id: string;
  titleAlt?: string;
  album?: string;
  trackNo?: number;
  released?: string;
  year?: number;
  credits?: Credits;
  tieIn?: string;
  intro?: string;
  note?: string;
  noteVisitor?: string;
  notePrivate?: boolean;
  relations?: { kind: RelationKind; to: string }[];
  mood?: Mood;
  albumSlug?: string;
  provenance: Record<string, string>;
}

export interface LibraryRow {
  id: string;
  title: string;
  artist: string;
  category: string;
  album: string;
  kind: 'lyrics' | 'missing' | 'instrumental';
  gates: Record<GateName, boolean> | null;
  translationStatus?: string;
  have: Record<'credits' | 'titleAlt' | 'intro' | 'note' | 'feel' | 'valence' | 'sections', boolean>;
  draftPending: boolean;
  ncm: boolean;
  url: string;
}

export interface AlbumInfo {
  slug: string;
  album: string;
  story?: string;
  moodDefaults?: { valence?: number; feel?: Feel } | null;
  moodDraft?: { valence?: number; feel?: Feel; basis?: string } | null;
}

export interface Library {
  rows: LibraryRow[];
  albums: AlbumInfo[];
  limits: { note: number; intro: number };
}

export interface PairedLine {
  startMs: number;
  endMs: number;
  ja: string;
  zh?: string;
  roma?: string;
}

export interface Compare {
  recommend: boolean;
  reason: string;
  shiftMs?: number | null;
  candidate: { lines: number; zhCoverage: number; romaCoverage: number; blocked: GateName[] };
  current?: { lines: number; zhCoverage: number; source: string; translationStatus: string; blocked: GateName[] };
}

export interface TrackDetail {
  identity: {
    id: string;
    kind: 'vocal' | 'instrumental';
    category: string;
    display: { title: string; artist: string };
    tags: { album?: string; trackNumber?: string; isrc?: string; durationMs: number };
  };
  track: { id: string; title: string; artist: string; url: string } | null;
  profile: Profile;
  merged: Merged;
  album: AlbumInfo | null;
  lyrics: { document: LyricsDocument; gate: { gates: Record<GateName, GateResult>; blocked: GateName[]; credits: Credits } } | null;
  netease: { songId: number; lines: PairedLine[]; transUser?: string; lyricUser?: string; compare: Compare } | null;
  neteaseTags: string[];
  imported: { url: string; source: string; fetchedAt: string; text: string } | null;
  readingConflicts: { index: number; ja: string; surface: string; roma: string; dictionary: string }[];
  problems: string[];
}

export interface ScriptResult {
  ok: boolean;
  log: string;
}

export type { LyricLine };

const call = async <T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`/__studio/api${path}`, {
    method,
    headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });
  const value = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`);
  return value as T;
};

export const api = {
  library: () => call<Library>('GET', '/library'),
  track: (id: string) => call<TrackDetail>('GET', `/track/${encodeURIComponent(id)}`),
  /** null = 删掉这个字段（回落到导入值/专辑默认） */
  saveProfile: (id: string, patch: { [K in keyof Profile]?: Profile[K] | null }) =>
    call<{ profile: Profile }>('POST', `/track/${encodeURIComponent(id)}/profile`, patch),
  acceptDraft: (id: string, fields?: ('intro' | 'valence' | 'feel')[]) =>
    call<{ accepted: string[] }>('POST', `/track/${encodeURIComponent(id)}/draft/accept`, { fields }),
  acceptAlbumDrafts: (slug: string) =>
    call<{ albumAccepted: boolean; tracks: Record<string, string[]> }>('POST', `/album/${encodeURIComponent(slug)}/draft/accept`),
  saveAlbum: (slug: string, patch: { story?: string; moodDefaults?: AlbumInfo['moodDefaults'] }) =>
    call<{ album: AlbumInfo }>('POST', `/album/${encodeURIComponent(slug)}`, patch),
  useNetease: (id: string) => call<ScriptResult>('POST', `/track/${encodeURIComponent(id)}/lyrics/netease`),
  tapsync: (id: string, lines: { startMs: number; ja: string; zh?: string }[], sourceUrl?: string) =>
    call<ScriptResult>('POST', `/track/${encodeURIComponent(id)}/lyrics/tapsync`, { lines, sourceUrl }),
  rebuild: (id: string) => call<ScriptResult>('POST', `/track/${encodeURIComponent(id)}/lyrics/rebuild`),
  saveTranslation: (id: string, edits: { index: number; zh: string }[]) =>
    call<ScriptResult>('POST', `/track/${encodeURIComponent(id)}/lyrics/translation`, { edits }),
  markReviewed: (id: string, translator: string) =>
    call<ScriptResult>('POST', `/track/${encodeURIComponent(id)}/lyrics/reviewed`, { translator }),
  refreshNetease: (id: string) =>
    call<{ facts: ProfileSource; proposal: Compare | null }>('POST', `/track/${encodeURIComponent(id)}/netease/refresh`),
  importSearch: <T>(kind: 'vocadb' | 'wikipedia' | 'musicbrainz' | 'url', query: string, lang?: string) =>
    call<{ results: T[] }>('POST', `/import/${kind}`, { query, lang }),
  importSave: (id: string, payload: {
    field: 'lyrics' | 'credits' | 'ref';
    text?: string;
    url?: string;
    source: string;
    title?: string;
    license?: string;
    credits?: Credits;
  }) => call<{ profile?: Profile; saved?: string }>('POST', `/track/${encodeURIComponent(id)}/import/save`, payload),
  session: () => call<{ files: { file: string; at: string }[] }>('GET', '/session'),
};

export const fmtTime = (ms: number) => {
  const total = Math.max(0, ms) / 1_000;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
};
