import { describe, expect, it } from 'vitest';
import {
  acceptableLrclibCandidate,
  rankLrclibCandidates,
} from './lyrics-match.mjs';

const config = {
  artistAliases: {
    ヨルシカ: ['Yorushika'],
  },
};

const identity = (title, durationMs = 170_000) => ({
  lookup: {
    title,
    artists: ['ヨルシカ'],
    album: 'だから僕は音楽を辞めた',
  },
  tags: { durationMs },
});

const candidate = (trackName, artistName, duration, albumName = '') => ({
  trackName,
  artistName,
  duration,
  albumName,
  syncedLyrics: '[00:01.00]test',
});

describe('LRCLIB identity gates', () => {
  it('rejects a same-title, same-duration song by the wrong artist', () => {
    const [best] = rankLrclibCandidates(
      [candidate('4.10', 'DIVINE, Lal Chand Yamla Jatt', 170)],
      identity('4/10'),
      config,
    );
    expect(best.durationDelta).toBe(0);
    expect(acceptableLrclibCandidate(best)).toBe(false);
  });

  it('accepts the Japanese artist through the generated identity aliases', () => {
    const [best] = rankLrclibCandidates(
      [candidate('第一夜', 'Yorushika', 261.8, '幻燈')],
      {
        lookup: { title: '第一夜', artists: ['ヨルシカ'], album: '幻燈' },
        tags: { durationMs: 262_000 },
      },
      config,
    );
    expect(best.artistScore).toBe(1);
    expect(acceptableLrclibCandidate(best)).toBe(true);
  });

  it('uses the tagged search title instead of the display title', () => {
    const [best] = rankLrclibCandidates(
      [candidate('だから僕は音楽を辞めた', 'ヨルシカ', 243)],
      identity('だから僕は音楽を辞めた', 243_000),
      config,
    );
    expect(best.titleScore).toBe(1);
    expect(acceptableLrclibCandidate(best)).toBe(true);
  });
});
