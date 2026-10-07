// 工坊里唯一的 <audio>。播放时间用 useSyncExternalStore 以 ~12fps 推给订阅者（工坊不追求逐帧）。
import { useSyncExternalStore } from 'react';

const audio = typeof Audio === 'undefined' ? null : new Audio();
if (audio) audio.preload = 'auto';

const listeners = new Set<() => void>();
let snapshot = { timeMs: 0, playing: false, src: '' };
let timer = 0;

const emit = () => {
  const next = {
    timeMs: Math.round((audio?.currentTime ?? 0) * 1_000),
    playing: Boolean(audio && !audio.paused),
    src: audio?.src ?? '',
  };
  if (next.timeMs === snapshot.timeMs && next.playing === snapshot.playing && next.src === snapshot.src) return;
  snapshot = next;
  listeners.forEach(listener => listener());
};

if (audio) {
  for (const event of ['play', 'pause', 'seeked', 'ended', 'loadedmetadata', 'emptied']) audio.addEventListener(event, emit);
  audio.addEventListener('play', () => {
    window.clearInterval(timer);
    timer = window.setInterval(emit, 80);
  });
  audio.addEventListener('pause', () => window.clearInterval(timer));
}

export const player = {
  load(url: string) {
    if (!audio) return;
    const src = new URL(encodeURI(url), location.origin).href;
    if (audio.src !== src) {
      audio.src = src;
      emit();
    }
  },
  play: () => audio?.play().catch(() => undefined),
  pause: () => audio?.pause(),
  toggle() {
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  },
  seek(ms: number) {
    if (!audio) return;
    audio.currentTime = Math.max(0, ms / 1_000);
    emit();
  },
  /** 打点用：直接读 audio.currentTime，不等节流。 */
  nowMs: () => Math.round((audio?.currentTime ?? 0) * 1_000),
  durationMs: () => Math.round((audio?.duration || 0) * 1_000),
};

export const usePlayerState = () =>
  useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
