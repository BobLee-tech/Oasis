import { describe, expect, it } from 'vitest';
import { acceptableNeteaseCandidate, rankNeteaseCandidates, resolveNeteaseOverrideId } from './netease-lyrics.mjs';

const identity = {
  lookup: { title: '夜明けの唄', artists: ['ヨルシカ'], album: '夏草' },
  tags: { durationMs: 94_000 },
};
const identityConfig = { artistAliases: { ヨルシカ: ['Yorushika'] } };

describe('rankNeteaseCandidates', () => {
  it('把艺人与时长都吻合的候选排在最前', () => {
    const candidates = [
      { id: 1, name: '夜明けの唄 (Live)', artistNames: ['某翻唱歌手'], albumName: '', durationMs: 91_000 },
      { id: 2, name: '夜明けの唄', artistNames: ['Yorushika'], albumName: '夏草', durationMs: 94_200 },
      { id: 3, name: '完全不同的歌名', artistNames: ['Yorushika'], albumName: '', durationMs: 94_000 },
    ];
    const ranked = rankNeteaseCandidates(candidates, identity, identityConfig);
    expect(ranked[0].candidate.id).toBe(2);
    expect(acceptableNeteaseCandidate(ranked[0])).toBe(true);
  });
});

describe('acceptableNeteaseCandidate', () => {
  it('拒绝艺人不符的高分候选', () => {
    const candidates = [
      { id: 9, name: '夜明けの唄', artistNames: ['完全无关的乐队'], albumName: '', durationMs: 94_000 },
    ];
    const ranked = rankNeteaseCandidates(candidates, identity, identityConfig);
    expect(acceptableNeteaseCandidate(ranked[0])).toBe(false);
  });

  it('拒绝时长差超过 5 秒的候选', () => {
    const candidates = [
      { id: 5, name: '夜明けの唄', artistNames: ['Yorushika'], albumName: '夏草', durationMs: 250_000 },
    ];
    const ranked = rankNeteaseCandidates(candidates, identity, identityConfig);
    expect(acceptableNeteaseCandidate(ranked[0])).toBe(false);
  });
});

describe('resolveNeteaseOverrideId', () => {
  it('只在配置里存在合法正整数时生效', () => {
    expect(resolveNeteaseOverrideId('y_18_01', { tracks: { y_18_01: { neteaseId: 123456 } } })).toBe(123456);
    expect(resolveNeteaseOverrideId('y_18_01', { tracks: { y_18_01: { neteaseId: 'abc' } } })).toBeNull();
    expect(resolveNeteaseOverrideId('y_18_01', { tracks: {} })).toBeNull();
  });
});
