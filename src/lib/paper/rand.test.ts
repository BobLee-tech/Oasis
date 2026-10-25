import { describe, expect, it } from 'vitest';
import { hash, rnd } from './rand';

describe('rnd', () => {
  it('同一种子同一串', () => {
    const a = rnd(hash('hejiac')), b = rnd(hash('hejiac'));
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });

  it('fork 接着原来那串走，晚画的笺与当场画的一样', () => {
    const now = rnd(42), later = rnd(42);
    for (let i = 0; i < 37; i++) { now(); later(); }   // 先画信封
    const branch = later.fork();
    for (let i = 0; i < 200; i++) expect(branch()).toBe(now());
  });

  it('落在 [0, 1)', () => {
    const r = rnd(7);
    for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});
