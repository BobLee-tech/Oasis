import { describe, expect, it } from 'vitest';
import { readingTextOf, splitMora, vowelOfMora } from './kana';

describe('kana', () => {
  it('splits morae: yōon joins, sokuon / hatsuon / chōon stand alone', () => {
    expect(splitMora('きょうはっぴゃく')).toEqual(['きょ', 'う', 'は', 'っ', 'ぴゃ', 'く']);
    expect(splitMora('ギター')).toEqual(['ギ', 'タ', 'ー']);
  });

  it('vowels, with ー carrying the previous vowel', () => {
    expect(vowelOfMora('きょ')).toBe('o');
    expect(vowelOfMora('ー', 'a')).toBe('a');
    expect(vowelOfMora('ん')).toBe('n');
    expect(vowelOfMora('っ')).toBe('q');
    expect(vowelOfMora('嘘')).toBeUndefined();
  });

  it('expands a line to its reading', () => {
    expect(readingTextOf({ ja: '手の平の上で', kana: [{ surface: '手の平', kana: 'てのひら' }, { surface: '上', kana: 'うえ' }] }))
      .toBe('てのひらのうえで');
  });
});
