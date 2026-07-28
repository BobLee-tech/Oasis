import { describe, expect, it } from 'vitest';
import {
  beatsOf,
  formatClock,
  interludeAt,
  lineProgress,
  moraCount,
  prepareTimedLines,
  sungMsOf,
} from './lyricTiming';
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

  it('grades line spacing by how long the rest after it is', () => {
    const timed = prepareTimedLines([
      line('あ', 0, 1_000),      // 后面紧接下一句
      line('い', 1_000, 3_000),  // 唱到 1.9s，下一句 3.5s 才起 → 换气
      line('う', 3_500, 5_500),  // 唱到 4.4s，下一句 12s 才起 → 间奏
      line('え', 12_000, 14_000),
    ]);
    expect(timed.map(l => l.breath)).toEqual([0, 1, 2, 0]);
  });

  it('formats the browse-mode clock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65_400)).toBe('1:05');
  });

  describe('beatsOf', () => {
    it('weights kanji above small kana and keeps latin words whole', () => {
      expect(beatsOf('ゅAbc').map(b => b.text)).toEqual(['ゅ', 'Abc']);
      expect(beatsOf('朝 目が覚めて').map(b => b.text)).toEqual(
        ['朝', ' ', '目', 'が', '覚', 'め', 'て'],
      );
    });

    it('covers the whole line exactly once, end to end', () => {
      // 这条锁住行尾残影的修复：最后一个单元必须收在 1，
      // 否则 --p=1 时行尾仍有一截没被情绪色盖住。
      for (const text of ['朝 目が覚めて', 'Miracle painting キセキ', 'あっ！', '君']) {
        const beats = beatsOf(text);
        expect(beats[0].from).toBe(0);
        expect(beats[beats.length - 1].to).toBeCloseTo(1, 10);
        beats.forEach((beat, index) => {
          expect(beat.to).toBeGreaterThan(beat.from);
          if (index) expect(beat.from).toBeCloseTo(beats[index - 1].to, 10);
        });
      }
    });

    it('gives punctuation a small but non-zero window', () => {
      const [character, punctuation] = beatsOf('君、');
      expect(punctuation.to - punctuation.from).toBeLessThan(character.to - character.from);
      expect(punctuation.to - punctuation.from).toBeGreaterThan(0);
    });

    it('returns nothing for an empty line rather than dividing by zero', () => {
      expect(beatsOf('')).toEqual([]);
    });
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
