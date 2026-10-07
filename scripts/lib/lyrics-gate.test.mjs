import { describe, expect, it } from 'vitest';
import { checkLyrics, creditsFromLines, parseCreditLine, stripHeaderLines } from './lyrics-gate.mjs';

// 夹具只复刻这几首歌「出问题的形状」（时长、行数、署名行、缺译位置），不放真实歌词正文。
const line = (startMs, ja, extra = {}) => ({ startMs, endMs: startMs + 4_000, ja, ...extra });
const translated = (startMs, ja, zh = '译') => line(startMs, ja, { zh });
const verse = (count, startMs = 10_000, step = 4_000, make = translated) =>
  Array.from({ length: count }, (_, index) => make(startMs + index * step, `かなの行${index}`));

describe('版本闸', () => {
  it('左右盲：267s 的歌只有 90s 的 TV 版歌词', () => {
    const doc = { offsetMs: 0, lines: verse(20, 2_000, 4_400) }; // 末行约 85.6s
    const { gates, blocked } = checkLyrics(doc, { durationMs: 267_489 });
    expect(gates.version.pass).toBe(false);
    expect(gates.version.detail).toMatch(/之后还有/);
    expect(blocked).toContain('version');
  });

  it('纯器乐尾奏在档案里声明 outroMs 后放行', () => {
    const doc = { offsetMs: 0, lines: verse(30, 10_000, 5_000) }; // 末行 155s
    expect(checkLyrics(doc, { durationMs: 240_000 }).gates.version.pass).toBe(false);
    expect(checkLyrics(doc, { durationMs: 240_000, outroMs: 75_000 }).gates.version.pass).toBe(true);
  });

  it('首行加上 offset 早于 0、或末行晚于音频结尾，都拦下', () => {
    expect(checkLyrics({ offsetMs: -800, lines: verse(3, 500) }, { durationMs: 30_000 }).gates.version.pass).toBe(false);
    expect(checkLyrics({ offsetMs: 0, lines: verse(3, 25_000) }, { durationMs: 30_000 }).gates.version.pass).toBe(false);
  });

  it('时长吻合的正常歌词通过', () => {
    const doc = { offsetMs: 0, lines: verse(40, 12_000, 4_500) }; // 末行 187.5s
    expect(checkLyrics(doc, { durationMs: 210_000 }).gates.version.pass).toBe(true);
  });
});

describe('洁净闸', () => {
  it('逃亡：网易云歌词头的 作词/作曲/编曲 三行', () => {
    const doc = {
      title: '逃亡',
      lines: [
        line(0, '作词 : n-buna'),
        line(500, '作曲 : n-buna'),
        line(1_000, '编曲：n-buna'),
        ...verse(10),
      ],
    };
    const { gates, credits } = checkLyrics(doc, { durationMs: 60_000 });
    expect(gates.clean.pass).toBe(false);
    expect(gates.clean.lines).toEqual([0, 1, 2]);
    expect(credits).toEqual({ lyricist: ['n-buna'], composer: ['n-buna'], arranger: ['n-buna'] });
    // 署名行不算正文，不应该因为没译文而拖累译文闸
    expect(gates.translation.pass).toBe(true);
  });

  it('僕らはそれを愛と呼んだ：「曲名 - 艺人」标题行 + 词：/曲：简写', () => {
    const doc = {
      title: '僕らはそれを愛と呼んだ',
      lines: [line(0, '僕らはそれを愛と呼んだ - あたらよ'), line(400, '词：ひとみ'), line(800, '曲：ひとみ'), ...verse(5)],
    };
    const { gates, credits } = checkLyrics(doc);
    expect(gates.clean.lines).toEqual([0, 1, 2]);
    expect(credits.lyricist).toEqual(['ひとみ']);
    expect(stripHeaderLines(doc.lines, doc.title)).toHaveLength(5);
  });

  it('正文里带冒号的普通歌词不误判为署名', () => {
    expect(parseCreditLine('ねえ：聞いてよ')).toBeNull();
    expect(parseCreditLine('時計の針：午前二時')).toBeNull();
    expect(parseCreditLine('Lyrics by: ナユタン星人')).toMatchObject({ role: 'lyricist', names: ['ナユタン星人'] });
    expect(creditsFromLines([{ ja: '作曲 : A / B' }]).composer).toEqual(['A', 'B']);
  });
});

describe('洁净闸 · 字形', () => {
  it('心壊サミット 的网易云版本：简体字形混进日文正文', () => {
    const doc = { lines: [translated(0, 'きっとね、空から见てる'), translated(4_000, '痛みに歪むその颜が'), translated(8_000, '可愛くて')] };
    const { gates } = checkLyrics(doc);
    expect(gates.clean.pass).toBe(false);
    expect(gates.clean.lines).toEqual([0, 1]);
    expect(gates.clean.detail).toMatch(/见颜/);
  });

  it('正常日文（含 JIS X 0213 的「捥」）不误判', () => {
    expect(checkLyrics({ lines: [translated(0, '僕の手を捥ぎ走り去る君を見ていた')] }).gates.clean.pass).toBe(true);
  });
});

describe('译文闸', () => {
  it('八月、某、月明かり：65 行里缺 18 行译文', () => {
    // 移植对齐丢行：缺口散落在全曲，不是集中在结尾
    const lines = verse(65).map((value, index) => (index % 4 === 1 || index === 62 || index === 64 ? { ...value, zh: '' } : value));
    const doc = { lines };
    const { gates } = checkLyrics(doc, { durationMs: 300_000 });
    expect(gates.translation.pass).toBe(false);
    expect(gates.translation.detail).toBe('缺 18/65 行译文');
    expect(gates.translation.lines).toHaveLength(18);
  });

  it('纯符号行不需要译文；显式 zhSkip 的行放行；全无译文不通过', () => {
    const doc = { lines: [...verse(3), line(30_000, '……'), line(31_000, '♪'), line(32_000, 'La la la', { zhSkip: true })] };
    expect(checkLyrics(doc).gates.translation.pass).toBe(true);
    expect(checkLyrics({ lines: verse(3, 0, 4_000, (s, ja) => line(s, ja)) }).gates.translation.pass).toBe(false);
  });
});

describe('读音闸与试听闸', () => {
  it('含汉字的行没有 kana 就不通过；纯假名行不需要', () => {
    const doc = {
      lines: [translated(0, 'さよならを'), translated(4_000, '嘘をついた'), translated(8_000, '夏の日', { kana: [] })],
    };
    expect(checkLyrics(doc).gates.reading).toMatchObject({ pass: false, lines: [1, 2] });
    const withKana = {
      lines: [
        translated(0, 'さよならを'),
        line(4_000, '嘘をついた', { zh: '说了谎', kana: [{ surface: '嘘', kana: 'うそ' }] }),
      ],
    };
    expect(checkLyrics(withKana).gates.reading.pass).toBe(true);
  });

  it('试听只看 reviewed，且不进入 blocked', () => {
    const base = { lines: [translated(0, 'さよなら')] };
    const machine = checkLyrics({ ...base, translationStatus: 'machine' }, { durationMs: 20_000 });
    expect(machine.gates.listened.pass).toBe(false);
    expect(machine.blocked).not.toContain('listened');
    expect(checkLyrics({ ...base, translationStatus: 'reviewed' }).gates.listened.pass).toBe(true);
  });
});
