import { describe, expect, it } from 'vitest';
import {
  pairLyrics,
  parseDetailResponse,
  parseLyricResponse,
  parseWikiResponse,
  searchQueriesFor,
  splitArtists,
  stripTitleSuffix,
  swapRomanNumeral,
} from './netease.mjs';
import { overlap } from '../lyrics-match.mjs';

describe('检索归一化', () => {
  it('去掉只会添乱的版本后缀', () => {
    expect(stripTitleSuffix('あなたの歌姫 Complete ver.')).toBe('あなたの歌姫');
    expect(stripTitleSuffix('One Way (Original Mix)')).toBe('One Way');
    expect(stripTitleSuffix('Last Night,Good Night(Re:Dialed)')).toBe('Last Night,Good Night');
    expect(stripTitleSuffix('爆弾魔 (Re-Recording)')).toBe('爆弾魔');
    expect(stripTitleSuffix('melody...')).toBe('melody...');
  });

  it('罗马数字半角/全角互换，只对日文标题生效', () => {
    expect(swapRomanNumeral('愛言葉II')).toBe('愛言葉Ⅱ');
    expect(swapRomanNumeral('愛言葉Ⅲ')).toBe('愛言葉III');
    expect(swapRomanNumeral('Part II')).toBe('');
    expect(swapRomanNumeral('メルト')).toBe('');
  });

  it('feat. 拆分并去掉发行商噪音', () => {
    expect(splitArtists(['DECO*27 feat. 初音ミク', 'DECO*27', 'Sony Music'])).toEqual(['DECO*27', '初音ミク']);
    expect(splitArtists(['Aura Qualic, Trinity Note feat. 初音ミク'])).toEqual(['Aura Qualic', 'Trinity Note', '初音ミク']);
  });

  it('检索词去重且最多 4 个', () => {
    const queries = searchQueriesFor({ lookup: { title: '愛言葉II', artists: ['DECO*27 feat. 初音ミク'] } });
    expect(queries).toEqual(['愛言葉II', '愛言葉Ⅱ', '愛言葉II DECO*27']);
  });

  it('简体写法的日文汉字在比对时折叠（白の季节 = 白の季節）', () => {
    expect(overlap('白の季節', '白の季节')).toBe(1);
  });
});

describe('解析', () => {
  it('成对歌词：同时间戳配对，去掉署名行，「//」视为无译文', () => {
    const lines = pairLyrics({
      lrc: '[00:00.00] 作词 : n-buna\n[00:10.00]夏の匂い\n[00:14.50]君がいた\n[00:20.00]ラララ\n',
      tlyric: '[00:10.00]夏天的气味\n[00:14.53]你曾在\n[00:20.00]//\n',
      romalrc: '[00:10.00]natsu no nioi\n[00:14.50]kimi ga ita\n',
    });
    expect(lines.map(line => line.ja)).toEqual(['夏の匂い', '君がいた', 'ラララ']);
    expect(lines[1]).toMatchObject({ zh: '你曾在', roma: 'kimi ga ita' });
    expect(lines[2].zh).toBeUndefined();
  });

  it('nolyric / 纯音乐提示都不算有词', () => {
    expect(parseLyricResponse({ nolyric: true }).hasLyrics).toBe(false);
    expect(parseLyricResponse({ lrc: { lyric: '[00:00.00]纯音乐，请欣赏\n' } }).hasLyrics).toBe(false);
    const ok = parseLyricResponse({
      lrc: { lyric: '[00:00.00] 作曲 : kz\n[00:01]a\n[00:02]b\n[00:03]c\n[00:04]d\n' },
      transUser: { nickname: 'MisakaChino' },
    });
    expect(ok).toMatchObject({ hasLyrics: true, credits: { composer: ['kz'] }, transUser: 'MisakaChino' });
  });

  it('详情：译名与出处说明分开', () => {
    const detail = parseDetailResponse({
      songs: [{
        name: 'ただ好きと言えたら',
        tns: ['若能就说出喜欢你 (电影《交换谎言日记》主题曲)'],
        al: { name: '夜明け前' },
        no: 8,
        cd: '1',
        publishTime: 1_498_579_200_000,
        dt: 200_000,
        ar: [{ name: 'あたらよ' }],
      }],
    });
    expect(detail).toMatchObject({
      titleAlt: '若能就说出喜欢你',
      tieInHint: '电影《交换谎言日记》主题曲',
      album: '夜明け前',
      trackNo: 8,
      released: '2017-06-28',
    });
    expect(parseDetailResponse({ songs: [{ name: '左右盲', tns: ['电影《今夜》主题曲'] }]}).titleAlt).toBeUndefined();
  });

  it('音乐百科：影视节目、BPM、推荐标签', () => {
    const creative = (title, resources = [], texts = []) => ({
      uiElement: { mainTitle: { title }, textLinks: texts.map(text => ({ text })) },
      resources: resources.map(name => ({ uiElement: { mainTitle: { title: name } } })),
    });
    const wiki = parseWikiResponse({
      data: {
        blocks: [{
          code: 'SONG_PLAY_ABOUT_SONG_BASIC',
          creatives: [creative('推荐标签', ['治愈']), creative('BPM', [], ['79']), creative('影视节目', ['《某》插曲'])],
        }],
      },
    });
    expect(wiki).toEqual({ tags: ['治愈'], bpm: 79, tieIn: '《某》插曲' });
  });
});
