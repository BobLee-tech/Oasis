import { useEffect, useMemo, useState } from 'react';
import type { LyricsDocument, LyricsManifest, Track } from '../types/music';
import { validateLyricsDocument, validateLyricsManifest } from '../lib/lyrics';

type LyricsState =
  | { status: 'idle' | 'loading' | 'unavailable' | 'instrumental'; document: null; error: null }
  | { status: 'ready'; document: LyricsDocument; error: null }
  | { status: 'error'; document: null; error: string };

const EMPTY: LyricsState = { status: 'idle', document: null, error: null };
const documentCache = new Map<string, LyricsDocument>();
let manifestCache: LyricsManifest | null = null;
let manifestPromise: Promise<LyricsManifest> | null = null;

const configuredBase = (import.meta.env.VITE_LYRICS_BASE ?? '').replace(/\/$/, '');
const audioBase = (import.meta.env.VITE_AUDIO_BASE ?? '').replace(/\/$/, '');
const LYRICS_BASE = configuredBase || (audioBase ? `${audioBase}/lyrics` : '/lyrics');
const MAX_JSON_BYTES = 2 * 1024 * 1024;

const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');

const fetchJson = async (url: string, signal?: AbortSignal) => {
  // R2 不回 Cache-Control,浏览器会按 Last-Modified 启发式缓存好几天,
  // 重新发布后还读旧 manifest;no-cache 让每次都带 ETag 回源校验(没变只回 304)。
  const response = await fetch(url, {
    signal,
    cache: 'no-cache',
    credentials: 'omit',
    referrerPolicy: 'strict-origin-when-cross-origin',
  });
  if (!response.ok) throw new Error(response.status === 404 ? 'not-found' : `HTTP ${response.status}`);
  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_JSON_BYTES) throw new Error('歌词响应过大');
  const text = await response.text();
  if (text.length > MAX_JSON_BYTES) throw new Error('歌词响应过大');
  return JSON.parse(text) as unknown;
};

const loadManifest = async () => {
  if (manifestCache) return manifestCache;
  if (!manifestPromise) {
    manifestPromise = fetchJson(`${LYRICS_BASE}/manifest.json`)
      .then(validateLyricsManifest)
      .then(value => {
        manifestCache = value;
        return value;
      })
      .finally(() => { manifestPromise = null; });
  }
  return manifestPromise;
};

export const useLyrics = (track: Track, enabled: boolean) => {
  const [resource, setResource] = useState<{ trackId: string; state: LyricsState }>({
    trackId: '',
    state: EMPTY,
  });

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    let disposed = false;

    const load = async () => {
      try {
        const manifestRef = track.lyrics
          ? { kind: 'lyrics' as const, ...track.lyrics }
          : (await loadManifest()).tracks[track.id];
        if (!manifestRef) {
          if (!disposed) setResource({
            trackId: track.id,
            state: { status: 'unavailable', document: null, error: null },
          });
          return;
        }
        if (manifestRef.kind === 'instrumental') {
          if (!disposed) setResource({
            trackId: track.id,
            state: { status: 'instrumental', document: null, error: null },
          });
          return;
        }

        const key = manifestRef.key;
        let document = documentCache.get(key);
        if (!document) {
          const raw = await fetchJson(`${LYRICS_BASE}/${encodeKey(key)}`, controller.signal);
          document = validateLyricsDocument(raw, track.id);
          documentCache.set(key, document);
        }
        if (!disposed) setResource({
          trackId: track.id,
          state: { status: 'ready', document, error: null },
        });
      } catch (error) {
        if (controller.signal.aborted || disposed) return;
        const message = error instanceof Error ? error.message : '未知错误';
        if (!disposed) {
          setResource({
            trackId: track.id,
            state: message === 'not-found'
              ? { status: 'unavailable', document: null, error: null }
              : { status: 'error', document: null, error: '歌词暂时无法抵达' },
          });
        }
      }
    };

    void load();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [enabled, track]);

  const state: LyricsState = !enabled
    ? EMPTY
    : resource.trackId === track.id
      ? resource.state
      : { status: 'loading', document: null, error: null };

  const hasTranslation = useMemo(
    () => state.document?.lines.some(line => Boolean(line.zh)) ?? false,
    [state.document],
  );

  return { ...state, hasTranslation };
};
