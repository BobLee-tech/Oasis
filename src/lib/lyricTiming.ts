import type { LyricLine } from '../types/music';

const MS_PER_MORA = 300;
const TAIL_MS = 600;
const MIN_SUNG_MS = 700;
const INTERLUDE_MS = 4_000;
const SMALL_KANA = /[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ]/;
const PUNCTUATION = /[\s、。！？「」『』…・,.!?()[\]{}]/g;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export interface TimedLyricLine extends LyricLine {
  sungMs: number;
  sungEndMs: number;
  gapMs: number;
  hasInterludeAfter: boolean;
}

export const moraCount = (text: string) =>
  [...text.replace(PUNCTUATION, '')].reduce((total, character) => {
    if (SMALL_KANA.test(character)) return total + 0.5;
    if (/[A-Za-z]/.test(character)) return total + 0.5;
    return total + 1;
  }, 0);

export const sungMsOf = (line: LyricLine) => {
  const span = Math.max(MIN_SUNG_MS, line.endMs - line.startMs);
  const finalWord = line.words?.[line.words.length - 1];
  if (finalWord) return clamp(finalWord.endMs - line.startMs, MIN_SUNG_MS, span);
  return clamp(moraCount(line.ja) * MS_PER_MORA + TAIL_MS, MIN_SUNG_MS, span);
};

export const prepareTimedLines = (lines: LyricLine[]): TimedLyricLine[] =>
  lines.map((line, index) => {
    const sungMs = sungMsOf(line);
    const sungEndMs = line.startMs + sungMs;
    const nextStart = lines[index + 1]?.startMs ?? line.endMs;
    const gapMs = Math.max(0, nextStart - sungEndMs);
    return {
      ...line,
      sungMs,
      sungEndMs,
      gapMs,
      hasInterludeAfter: gapMs > INTERLUDE_MS,
    };
  });

export const lineProgress = (line: TimedLyricLine, playbackMs: number) =>
  clamp((playbackMs - line.startMs) / line.sungMs, 0, 1);

export interface InterludeState {
  active: boolean;
  progress: number;
}

export const interludeAt = (
  lines: TimedLyricLine[],
  activeIndex: number,
  playbackMs: number,
): InterludeState => {
  if (!lines.length) return { active: false, progress: 0 };

  if (activeIndex < 0) {
    const firstStart = lines[0].startMs;
    return {
      active: firstStart > 1_000,
      progress: clamp(playbackMs / Math.max(firstStart, 1), 0, 1),
    };
  }

  const line = lines[activeIndex];
  if (!line?.hasInterludeAfter || playbackMs < line.sungEndMs) {
    return { active: false, progress: 0 };
  }
  return {
    active: true,
    progress: clamp((playbackMs - line.sungEndMs) / Math.max(line.gapMs, 1), 0, 1),
  };
};
