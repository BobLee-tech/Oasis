import { describe, expect, it } from 'vitest';
import { interludeAt, lineProgress, moraCount, prepareTimedLines, sungMsOf } from './lyricTiming';
import type { LyricLine } from '../types/music';

const line = (ja: string, startMs: number, endMs: number): LyricLine => ({
  ja,
  startMs,
  endMs,
});

describe('lyric timing model', () => {
  it('counts small kana as half mora and latin letters as half', () => {
    expect(moraCount('きゃっと A')).toBe(3.5);
  });

  it('finishes a short lyric before a very long next-line gap', () => {
    expect(sungMsOf(line('おやすみ', 0, 24_200))).toBe(1_800);
  });

  it('clamps estimated singing to the available line span', () => {
    expect(sungMsOf(line('とてもとても長い歌詞です', 0, 1_000))).toBe(1_000);
  });

  it('prefers word timing when v2 data exists', () => {
    const withWords: LyricLine = {
      ...line('夢を見る', 1_000, 8_000),
      words: [
        { text: '夢を', startMs: 1_000, endMs: 2_100 },
        { text: '見る', startMs: 2_100, endMs: 3_700 },
      ],
    };
    expect(sungMsOf(withWords)).toBe(2_700);
  });

  it('recognizes long rests and exposes a stable ink progress', () => {
    const timed = prepareTimedLines([
      line('おやすみ', 0, 24_200),
      line('朝', 24_200, 27_000),
    ]);
    expect(timed[0].hasInterludeAfter).toBe(true);
    expect(lineProgress(timed[0], 1_800)).toBe(1);
    expect(interludeAt(timed, 0, 12_000).active).toBe(true);
  });
});
