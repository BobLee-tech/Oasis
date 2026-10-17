import { describe, it, expect } from 'vitest';
import { mergeProfile, validateProfile, DRAFT_LAYER } from './profile-merge.mjs';

const draft = (extra = {}) => ({
  intro: '据资料起草的一句介绍。',
  valence: -0.3,
  feels: { nostalgic: 3, sad: 2 },
  confidence: 'high',
  basis: '歌词。',
  draftedAt: '2026-10-17',
  ...extra,
});

describe('草稿层（sources.draft）', () => {
  it('is on: searched drafts take effect unless the owner wrote the field', () => {
    expect(DRAFT_LAYER).toBe(true);
  });

  it('fills intro and mood from the draft, marked as draft', () => {
    const out = mergeProfile({ id: 'x', sources: { draft: draft() } }, null, null);
    expect(out.intro).toBe('据资料起草的一句介绍。');
    expect(out.provenance.intro).toBe('draft');
    expect(out.mood.feels).toEqual({ nostalgic: 3, sad: 2 });
    expect(out.mood.feel).toBe('nostalgic');
    expect(out.provenance['mood.feels']).toBe('draft');
    expect(out.mood.valence).toBe(-0.3);
    expect(out.provenance['mood.valence']).toBe('draft');
  });

  it('never overrides what the owner wrote', () => {
    const out = mergeProfile({
      id: 'x',
      intro: '我写的。',
      mood: { feels: { joyful: 2 }, valence: 0.4 },
      sources: { draft: draft() },
    }, null, null);
    expect(out.intro).toBe('我写的。');
    expect(out.provenance.intro).toBe('manual');
    expect(out.mood.feels).toEqual({ joyful: 2 });
    expect(out.provenance['mood.feels']).toBe('manual');
    expect(out.mood.valence).toBe(0.4);
  });

  it('sits above the album defaults and the automatic valence', () => {
    const album = { slug: 'a', moodDefaults: { valence: 0.5, feels: { tender: 1, nostalgic: 2 } } };
    const out = mergeProfile({ id: 'x', sources: { draft: draft() } }, null, album, { valence: 0.9 });
    expect(out.mood.feels).toEqual({ nostalgic: 3, sad: 2 });
    expect(out.provenance['mood.feels']).toBe('draft');
    expect(out.mood.valence).toBe(-0.3);
  });

  it('averages lyric and sound valence when the draft splits them', () => {
    const out = mergeProfile({ id: 'x', sources: { draft: draft({ valence: undefined, lyricValence: -0.6, soundValence: 0.4 }) } }, null, null);
    expect(out.mood.lyricValence).toBe(-0.6);
    expect(out.mood.soundValence).toBe(0.4);
    expect(out.mood.valence).toBeCloseTo(-0.1);
    expect(out.provenance['mood.lyricValence']).toBe('draft');
  });

  it('reads an old single-feel draft as that feel at full strength', () => {
    const out = mergeProfile({ id: 'x', sources: { draft: draft({ feels: undefined, feel: 'tender' }) } }, null, null);
    expect(out.mood.feels).toEqual({ tender: 3 });
  });

  it('validates draft content like hand-written content', () => {
    const known = new Set(['x']);
    expect(validateProfile({ id: 'x', sources: { draft: draft() } }, known)).toEqual([]);
    const long = validateProfile({ id: 'x', sources: { draft: draft({ intro: '字'.repeat(121) }) } }, known);
    expect(long.some((p) => p.includes('草稿 intro'))).toBe(true);
    const bad = validateProfile({ id: 'x', sources: { draft: draft({ feels: { sad: 5 } }) } }, known);
    expect(bad.some((p) => p.includes('（草稿）'))).toBe(true);
  });
});
