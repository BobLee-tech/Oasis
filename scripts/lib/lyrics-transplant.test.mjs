import { describe, expect, it } from 'vitest';
import { alignNeteaseTranslation, lineSimilarity, normalizeLineText } from './lyrics-transplant.mjs';

describe('normalizeLineText', () => {
  it('去标点、全角转半角、忽略大小写', () => {
    expect(normalizeLineText('あさ、そら！')).toBe('あさそら');
    expect(normalizeLineText('ＡＢＣ')).toBe('abc');
  });
});

describe('lineSimilarity', () => {
  it('对完全相同文本返回 1', () => {
    expect(lineSimilarity('きょうは あめ', 'きょうは あめ')).toBe(1);
  });

  it('对短语气词不误判为强匹配', () => {
    expect(lineSimilarity('うん', 'そら とても たかい ひろい ばしょ')).toBeLessThan(0.62);
  });
});

describe('alignNeteaseTranslation', () => {
  it('逐行完全一致时全量覆盖', () => {
    const source = [
      { startMs: 0, endMs: 1000, ja: 'あさひが のぼる' },
      { startMs: 1000, endMs: 2000, ja: 'かぜが ふく' },
      { startMs: 2000, endMs: 3000, ja: 'そらを みあげる' },
    ];
    const netease = [
      { startMs: 50, ja: 'あさひが のぼる', zh: '朝阳升起' },
      { startMs: 1080, ja: 'かぜが ふく', zh: '风吹过' },
      { startMs: 2200, ja: 'そらを みあげる', zh: '仰望天空' },
    ];
    const result = alignNeteaseTranslation(source, netease);
    expect(result.coverage).toBe(1);
    expect(result.lines.map(line => line.zh)).toEqual(['朝阳升起', '风吹过', '仰望天空']);
    expect(result.lines.map(line => line.startMs)).toEqual([0, 1000, 2000]);
  });

  it('保持顺序单调，不因重复副歌错配', () => {
    const source = [
      { startMs: 0, endMs: 1000, ja: 'すきだよ' },
      { startMs: 1000, endMs: 2000, ja: 'あるく みち' },
      { startMs: 2000, endMs: 3000, ja: 'すきだよ' },
    ];
    const netease = [
      { startMs: 10, ja: 'すきだよ', zh: '喜欢你·第一次' },
      { startMs: 1000, ja: 'あるく みち', zh: '走过的路' },
      { startMs: 2000, ja: 'すきだよ', zh: '喜欢你·第二次' },
    ];
    const result = alignNeteaseTranslation(source, netease);
    expect(result.lines.map(line => line.zh)).toEqual(['喜欢你·第一次', '走过的路', '喜欢你·第二次']);
  });

  it('网易多出的行不拉低覆盖率，只是不参与匹配', () => {
    const source = [
      { startMs: 0, endMs: 1000, ja: 'ひとつめ' },
      { startMs: 1000, endMs: 2000, ja: 'ふたつめ' },
    ];
    const netease = [
      { startMs: 0, ja: '（間奏）', zh: '' },
      { startMs: 500, ja: 'ひとつめ', zh: '第一句' },
      { startMs: 1500, ja: 'ふたつめ', zh: '第二句' },
      { startMs: 2500, ja: 'アウトロ おまけ', zh: '尾声彩蛋' },
    ];
    const result = alignNeteaseTranslation(source, netease);
    expect(result.coverage).toBe(1);
    expect(result.lines.map(line => line.zh)).toEqual(['第一句', '第二句']);
  });

  it('完全不匹配时覆盖率为 0 且不抛错', () => {
    const source = [{ startMs: 0, endMs: 1000, ja: 'ぜんぜん ちがう ぶんしょう' }];
    const netease = [{ startMs: 0, ja: 'まったく べつの うた です', zh: '完全不同的歌' }];
    const result = alignNeteaseTranslation(source, netease);
    expect(result.coverage).toBe(0);
    expect(result.lines[0].zh).toBeUndefined();
  });
});
