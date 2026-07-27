import { describe, expect, it } from 'vitest';
import { findActiveLine, mergeTranslation, parseLrc, validateLyricsDocument } from './lyrics';

describe('parseLrc', () => {
  it('parses multiple timestamps, offset and bilingual same-time lines', () => {
    const parsed = parseLrc(
      '\uFEFF[offset:-120]\n[00:01.20][00:03.200]こんにちは\n[00:01.20]你好\n[00:05.2]またね',
    );
    expect(parsed.offsetMs).toBe(-120);
    expect(parsed.lines).toEqual([
      { startMs: 1_200, endMs: 3_200, ja: 'こんにちは', zh: '你好' },
      { startMs: 3_200, endMs: 5_200, ja: 'こんにちは' },
      { startMs: 5_200, endMs: 13_200, ja: 'またね' },
    ]);
  });

  it('ignores malformed input without poisoning valid lines', () => {
    const parsed = parseLrc('[03:29.26] [00:00.42] 夕陽が落ちる様に\nnot timed\n[99:99]bad');
    expect(parsed.lines.map(line => line.startMs)).toEqual([420, 209_260]);
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });
});

describe('lyrics timeline', () => {
  const lines = parseLrc('[00:01.00]a\n[00:02.00]b\n[00:04.00]c').lines;

  it('finds the active line with binary search', () => {
    expect(findActiveLine(lines, 999)).toBe(-1);
    expect(findActiveLine(lines, 1_000)).toBe(0);
    expect(findActiveLine(lines, 3_999)).toBe(1);
  });

  it('merges translations within a bounded tolerance', () => {
    const translated = parseLrc('[00:01.20]甲\n[00:02.10]乙').lines;
    expect(mergeTranslation(lines, translated).map(line => line.zh)).toEqual(['甲', '乙', undefined]);
  });
});

describe('validateLyricsDocument', () => {
  it('rejects a document for a different track', () => {
    expect(() => validateLyricsDocument({ version: 1, trackId: 'other', lines: [] }, 'm_01'))
      .toThrow('不匹配');
  });
});
