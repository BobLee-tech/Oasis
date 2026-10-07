// 💬 逐字出现的时间轴：气泡（显示几个字）与口型（嘴此刻该不该动）共用同一份，二者天然对齐。
//   约每秒 14 字；标点处停 160ms，句末标点停得更久一点。时间轴是纯函数，单测见 speech.test.ts。

export const CHARS_PER_SEC = 14;
export const PUNCT_PAUSE_MS = 160;
const STOP_PAUSE_MS = 260;
const PUNCT = /[，、；：,;:—…·「」『』（）()《》\s]/;
const STOP = /[。！？!?~～]/;

export const isPause = (ch: string) => PUNCT.test(ch) || STOP.test(ch);

/** 第 i 个字（按码点）在第几毫秒出现。标点本身随前一个字一起出现，停顿加在它之后。 */
export const revealTimeline = (text: string): number[] => {
  const chars = Array.from(text);
  const step = 1000 / CHARS_PER_SEC;
  const at: number[] = [];
  let t = 0;
  for (const ch of chars) {
    if (isPause(ch)) {
      at.push(t);
      t += STOP.test(ch) ? STOP_PAUSE_MS : PUNCT_PAUSE_MS;
    } else {
      at.push(t);
      t += step;
    }
  }
  return at;
};

/** 已经显示了几个字。 */
export const revealedCount = (timeline: readonly number[], elapsedMs: number) => {
  let lo = 0;
  let hi = timeline.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid] <= elapsedMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/** 全部出完的时刻（最后一个字出现 + 一个字的时长）。 */
export const revealDuration = (timeline: readonly number[]) =>
  timeline.length ? timeline[timeline.length - 1] + 1000 / CHARS_PER_SEC : 0;

export interface Utterance {
  chars: string[];
  timeline: number[];
  startedAt: number;
}

export const utter = (text: string, now: number): Utterance => ({
  chars: Array.from(text),
  timeline: revealTimeline(text),
  startedAt: now,
});

/**
 * 说话时嘴的张合目标（0..1）。不逐字开合——14Hz 会像在打颤——而是约 5.5 个音节/秒的包络，
 * 只在「正在出字、且当前不是标点停顿」时张嘴；每个音节的幅度带一点确定性的起伏，避免机械感。
 */
export const speakingOpen = (u: Utterance | null, now: number): number => {
  if (!u) return 0;
  const elapsed = now - u.startedAt;
  const end = revealDuration(u.timeline);
  if (elapsed < 0 || elapsed > end) return 0;
  const i = Math.max(0, revealedCount(u.timeline, elapsed) - 1);
  const ch = u.chars[i];
  if (!ch || isPause(ch)) return 0;
  const syllable = elapsed / (1000 / 5.5);
  const phase = syllable - Math.floor(syllable);
  const accent = 0.75 + 0.25 * Math.sin(Math.floor(syllable) * 2.17);
  return Math.sin(Math.PI * phase) ** 0.8 * 0.55 * accent;
};
