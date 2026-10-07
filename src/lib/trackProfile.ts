// 曲目档案的运行时入口（docs/music-design.md A3.2 / A7）。
//
// 档案（src/data/trackProfiles.generated.json）是一个独立 chunk：音乐页挂载、或 Miku 第一次需要
// 曲目事实时才 import()。加载前 getTrackProfile 返回 undefined——按 Miku A4.2 的规则，
// 任何槽位缺值，那句台词就不说；曲目卡对应的段落就不显示。
import { useSyncExternalStore } from 'react';
import type { TrackProfile, TrackProfilesDocument, TrackRelationKind } from '../types/music';

let documentCache: TrackProfilesDocument | null = null;
let pending: Promise<TrackProfilesDocument> | null = null;
const listeners = new Set<() => void>();

export const loadTrackProfiles = () => {
  if (documentCache) return Promise.resolve(documentCache);
  pending ??= import('../data/trackProfiles.generated.json').then(module => {
    documentCache = module.default as unknown as TrackProfilesDocument;
    listeners.forEach(listener => listener());
    return documentCache;
  });
  return pending;
};

/** 同步取：已加载就返回，没加载返回 undefined（并顺手开始加载）。 */
export const getTrackProfile = (id: string): TrackProfile | undefined => {
  if (!documentCache) void loadTrackProfiles();
  return documentCache?.tracks[id];
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** 组件里用：档案到达时重渲染一次，之后只随 id 变化。 */
export const useTrackProfile = (id: string): TrackProfile | undefined =>
  useSyncExternalStore(subscribe, () => (documentCache ? documentCache.tracks[id] : undefined));

/** 整份档案是否已就绪（选碟台用它决定按档案的专辑分组）。 */
export const useTrackProfilesReady = () => useSyncExternalStore(subscribe, () => documentCache !== null);

// ── 给 Miku 的事实（A7）────────────────────────────────────────────────────

export interface TrackFacts {
  titleAlt?: string;
  album?: string;
  year?: number;
  /** 作曲者优先，没有就作词者；Miku 台词槽 {composer} */
  composer?: string;
  credits?: TrackProfile['credits'];
  tieIn?: string;
  /** intro 的第一句：访客规则「介绍这首」只用第一句 */
  introFirst?: string;
  /** 访客视角下可以转述的那句话（notePrivate 时为空） */
  noteForVisitor?: string;
  note?: string;
  /** 与上一首的关系（由切歌事件带上 prevTrackId 计算）：「上一首是エルマ，这首是她的回信」 */
  relationToPrev?: { kind: TrackRelationKind; to: string };
}

export const firstSentence = (text?: string) => text?.match(/^[^。！？!?]+[。！？!?]?/)?.[0];

export const trackFacts = (id: string, prevTrackId?: string): TrackFacts | undefined => {
  const profile = getTrackProfile(id);
  if (!profile) return undefined;
  const previous = prevTrackId ? getTrackProfile(prevTrackId) : undefined;
  const relationToPrev =
    profile.relations?.find(relation => relation.to === prevTrackId) ??
    previous?.relations?.find(relation => relation.to === id);
  return {
    titleAlt: profile.titleAlt,
    album: profile.album,
    year: profile.year,
    composer: profile.credits?.composer?.[0] ?? profile.credits?.lyricist?.[0],
    credits: profile.credits,
    tieIn: profile.tieIn,
    introFirst: firstSentence(profile.intro),
    noteForVisitor: profile.noteVisitor ?? profile.note,
    note: profile.note,
    ...(relationToPrev ? { relationToPrev } : {}),
  };
};
