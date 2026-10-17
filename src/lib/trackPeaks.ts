// 🌊 声波峰值的运行时入口：src/data/trackPeaks.generated.json 是独立 chunk（约 6KB gzip），
// 进度条第一次需要时才 import()。加载前、或这首歌没有峰值时返回 undefined，进度条就画成一条线。
// 编码见 scripts/lib/peaks-core.mjs（与 analyze-tracks 共用）。
import { useSyncExternalStore } from 'react';
import { decodePeaks } from '../../scripts/lib/peaks-core.mjs';

interface TrackPeaksDocument {
  version: 1;
  count: number;
  tracks: Record<string, string>;
}

let documentCache: TrackPeaksDocument | null = null;
let pending: Promise<TrackPeaksDocument> | null = null;
const decoded = new Map<string, number[]>();
const listeners = new Set<() => void>();

export const loadTrackPeaks = () => {
  if (documentCache) return Promise.resolve(documentCache);
  pending ??= import('../data/trackPeaks.generated.json').then(module => {
    documentCache = module.default as unknown as TrackPeaksDocument;
    listeners.forEach(listener => listener());
    return documentCache;
  });
  return pending;
};

/** 同一首歌的数组只解一次，所以引用稳定，可以直接作为 useSyncExternalStore 的快照 */
const peaksOf = (id: string): number[] | undefined => {
  const text = documentCache?.tracks[id];
  if (!text) return undefined;
  let values = decoded.get(id);
  if (!values) {
    values = decodePeaks(text);
    decoded.set(id, values);
  }
  return values;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (!documentCache) void loadTrackPeaks();
  return () => listeners.delete(listener);
};

export const useTrackPeaks = (id: string): number[] | undefined =>
  useSyncExternalStore(subscribe, () => peaksOf(id));
