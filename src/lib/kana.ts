// 运行时的假名工具（docs/music-design.md A4.4）：音拍（mora）切分与元音。
// 歌词场按音拍给每个拍子分时值，Miku 的口型按音拍取元音——「嘘」是两拍 う・そ，不是一个字。
import type { LyricLine } from '../types/music';

export type MoraVowel = 'a' | 'i' | 'u' | 'e' | 'o' | 'n' | 'q';

const SMALL = new Set([...'ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ']);
const VOWELS: Record<MoraVowel, string> = {
  a: 'あかさたなはまやらわがざだばぱぁゃゎ',
  i: 'いきしちにひみりぎじぢびぴぃ',
  u: 'うくすつぬふむゆるぐずづぶぷぅゅゔ',
  e: 'えけせてねへめれげぜでべぺぇ',
  o: 'おこそとのほもよろをごぞどぼぽぉょ',
  n: 'ん',
  q: 'っ',
};
const VOWEL_OF = new Map<string, MoraVowel>();
for (const [vowel, chars] of Object.entries(VOWELS) as [MoraVowel, string][]) {
  for (const char of chars) VOWEL_OF.set(char, vowel);
}

export const toHiragana = (text: string) =>
  text.replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));

/** 「きょう」→ ['きょ', 'う']；拗音小字并进前一拍，促音、拨音、长音各占一拍。非假名字符各算一拍。 */
export const splitMora = (text: string): string[] => {
  const morae: string[] = [];
  for (const char of text) {
    if (SMALL.has(char) && morae.length) morae[morae.length - 1] += char;
    else morae.push(char);
  }
  return morae;
};

/** 一个音拍的元音；长音「ー」沿用前一拍。认不出（汉字、拉丁字母）返回 undefined。 */
export const vowelOfMora = (mora: string, previous?: MoraVowel): MoraVowel | undefined => {
  const last = toHiragana(mora.slice(-1));
  if (last === 'ー') return previous && previous !== 'n' && previous !== 'q' ? previous : undefined;
  return VOWEL_OF.get(last);
};

/** 按读音展开后的一行（汉字换成假名），用来数音拍。 */
export const readingTextOf = (line: Pick<LyricLine, 'ja' | 'kana'>) => {
  if (!line.kana?.length) return line.ja;
  let out = '';
  let cursor = 0;
  for (const segment of line.kana) {
    const at = line.ja.indexOf(segment.surface, cursor);
    if (at < 0) continue;
    out += line.ja.slice(cursor, at) + segment.kana;
    cursor = at + segment.surface.length;
  }
  return out + line.ja.slice(cursor);
};
