import { describe, expect, it } from 'vitest';
import { alignReading, extractInlineRuby, readingForLine, romaLineToKana, romaTokenToKana } from './kana.mjs';

// 罗马音都是网易云的写法：按音节空格分开，促音写成双辅音，长音写成重复元音
const read = (ja, roma) => readingForLine({ ja }, roma, null).kana;

describe('罗马音 → 假名', () => {
  it('拗音、促音、拨音、长音', () => {
    expect(romaTokenToKana('kyo')).toBe('きょ');
    expect(romaTokenToKana('kka')).toBe('っか');
    expect(romaTokenToKana('tchi')).toBe('っち');
    expect(romaTokenToKana('n')).toBe('ん');
    expect(romaTokenToKana('taa')).toBe('たあ');
    expect(romaTokenToKana('tōkyō')).toBe('とうきょう');
    expect(romaTokenToKana('love')).toBeNull();
  });

  it('原文里也有的英文词整词丢掉', () => {
    expect(romaLineToKana('Last night Good night ki mi to', 'Last night Good night 君と')).toBe('きみと');
  });
});

describe('对齐读音', () => {
  it('拗音与促音：「一回」读 いっかい、「今日」读 きょう', () => {
    expect(read('口に出してもう一回', 'ku chi ni da shi te mo u i kka i')).toEqual([
      { surface: '口', kana: 'くち' },
      { surface: '出', kana: 'だ' },
      { surface: '一回', kana: 'いっかい' },
    ]);
    expect(read('今日も歌う', 'kyo u mo u ta u')).toEqual([
      { surface: '今日', kana: 'きょう' },
      { surface: '歌', kana: 'うた' },
    ]);
  });

  it('长音：片假名「ー」对罗马音的重复元音或不写', () => {
    expect(read('ギターを鳴らして', 'gi taa wo na ra shi te')).toEqual([{ surface: '鳴', kana: 'な' }]);
    expect(read('ギターを鳴らして', 'gi ta wo na ra shi te')).toEqual([{ surface: '鳴', kana: 'な' }]);
  });

  it('助词 は / を / へ 读作 わ / お / え', () => {
    expect(read('僕は君へ', 'bo ku wa ki mi e')).toEqual([
      { surface: '僕', kana: 'ぼく' },
      { surface: '君', kana: 'きみ' },
    ]);
  });

  it('英文混排：拉丁词跳过，汉字照常对上', () => {
    expect(read('Last night 君の手', 'Last night ki mi no te')).toEqual([
      { surface: '君', kana: 'きみ' },
      { surface: '手', kana: 'て' },
    ]);
  });

  it('当て字：按实际唱法（三節 → さんふし，本気 → まじ）', () => {
    expect(read('もう三節', 'mo u sa n fu shi')).toEqual([{ surface: '三節', kana: 'さんふし' }]);
    expect(read('本気で', 'ma ji de')).toEqual([{ surface: '本気', kana: 'まじ' }]);
  });

  it('两个汉字串之间只隔标点时按「、」分句对齐', () => {
    expect(read('頭の六畳間、君と暮らす', 'a ta ma no ro ku ta ta mi ma、ki mi to ku ra su')).toEqual([
      { surface: '頭', kana: 'あたま' },
      { surface: '六畳間', kana: 'ろくたたみま' },
      { surface: '君', kana: 'きみ' },
      { surface: '暮', kana: 'く' },
    ]);
  });

  it('对不上返回 null，不硬凑', () => {
    expect(alignReading('君と', 'あいうえおかきくけこ')).toBeNull();
  });
});

describe('行内注音与优先级', () => {
  it('「空（そら）」去括号、读音另存', () => {
    expect(extractInlineRuby('空（そら）から見てる')).toEqual({ text: '空から見てる', ruby: [{ surface: '空', kana: 'そら' }] });
    expect(extractInlineRuby('（間奏）')).toEqual({ text: '（間奏）', ruby: [] });
  });

  it('你定的读法 > 行内注音 > 罗马音', () => {
    const line = { ja: '空を見た', kana: [{ surface: '空', kana: 'そら' }] };
    expect(readingForLine(line, 'ku u wo mi ta', null).kana[0]).toEqual({ surface: '空', kana: 'そら' });
    expect(readingForLine(line, 'ku u wo mi ta', null, { 空: 'から' }).kana[0]).toEqual({ surface: '空', kana: 'から' });
  });
});
