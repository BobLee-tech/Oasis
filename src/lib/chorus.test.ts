import { describe, expect, it } from 'vitest';
import { detectChorus } from './chorus';

const song = (texts: string[]) => texts.map((ja, index) => ({ startMs: index * 4_000, endMs: index * 4_000 + 4_000, ja }));

describe('detectChorus', () => {
  it('取「出现次数 × 块长」最大的重复块', () => {
    const lines = song(['A1', 'A2', 'サビ1', 'サビ2', 'サビ3', 'B1', 'B2', 'サビ1', 'サビ2', 'サビ3', 'C', 'サビ1', 'サビ2']);
    expect(detectChorus(lines)).toEqual([[8_000, 20_000], [28_000, 40_000]]);
  });

  it('标点与空白不影响比对；单行重复不算副歌', () => {
    expect(detectChorus(song(['ねえ、', 'x', 'ねえ', 'y']))).toEqual([]);
    const lines = song(['君が好き！', '夏の日', 'A', '君が好き', '夏の日。']);
    expect(detectChorus(lines)).toEqual([[0, 8_000], [12_000, 20_000]]);
  });
});
