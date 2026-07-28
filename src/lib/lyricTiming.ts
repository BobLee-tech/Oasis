import type { LyricLine } from '../types/music';

const MS_PER_MORA = 300;
const TAIL_MS = 600;
const MIN_SUNG_MS = 700;
const INTERLUDE_MS = 4_000;
const SMALL_KANA = /[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ]/;
const PUNCTUATION = /[\s、。！？「」『』…・,.!?()[\]{}]/g;
/** 与 PUNCTUATION 同一字符集，但不带 /g —— 带 /g 的正则 .test() 有 lastIndex 副作用 */
const PUNCTUATION_CHAR = /[\s、。！？「」『』…・,.!?()[\]{}]/;
const LATIN = /[A-Za-z0-9'’-]/;
const BREATH_MS = 1_100;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export interface TimedLyricLine extends LyricLine {
  sungMs: number;
  sungEndMs: number;
  gapMs: number;
  hasInterludeAfter: boolean;
  /** 行后留白等级：0 紧接下一句 · 1 换气 · 2 间奏 */
  breath: 0 | 1 | 2;
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
    const hasInterludeAfter = gapMs > INTERLUDE_MS;
    return {
      ...line,
      sungMs,
      sungEndMs,
      gapMs,
      hasInterludeAfter,
      // 停顿越久留白越大：视觉节奏直接照抄音乐的乐句划分
      breath: hasInterludeAfter ? 2 : gapMs > BREATH_MS ? 1 : 0,
    };
  });

/** 一行里的一个发音单元：假名/汉字各自成组，拉丁词整词不拆（否则会从单词中间断行）。 */
export interface LyricBeat {
  text: string;
  /** 该单元在本行「已唱比例」上的起止，0–1 */
  from: number;
  to: number;
}

const beatWeight = (token: string) => {
  if (LATIN.test(token[0])) return Math.max(0.5, token.length * 0.35);
  if (SMALL_KANA.test(token)) return 0.5;
  if (PUNCTUATION_CHAR.test(token)) return 0.3;
  return 1;
};

/**
 * 把一行切成按音拍加权的单元。曲库里没有任何一首带逐词时间戳，
 * 所以点亮位置只能估——但按 mora 权重估，比按像素线性扫准得多：
 * 汉字比小假名唱得久，标点几乎不占时值。
 */
export const beatsOf = (text: string): LyricBeat[] => {
  const tokens: string[] = [];
  let latin = '';
  for (const character of text) {
    if (LATIN.test(character)) {
      latin += character;
      continue;
    }
    if (latin) {
      tokens.push(latin);
      latin = '';
    }
    tokens.push(character);
  }
  if (latin) tokens.push(latin);
  if (!tokens.length) return [];

  const weights = tokens.map(beatWeight);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let accumulated = 0;
  return tokens.map((token, index) => {
    const from = accumulated / total;
    accumulated += weights[index];
    return { text: token, from, to: accumulated / total };
  });
};

/** 浏览态左右留白里的时间刻度。 */
export const formatClock = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1_000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

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
