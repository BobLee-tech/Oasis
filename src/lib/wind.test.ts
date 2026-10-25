import { describe, expect, it } from 'vitest';
import { breath, gust } from './wind';

describe('风钟', () => {
  it('阵风在 0–1，且有起有落', () => {
    let lo = 1, hi = 0;
    for (let t = 0; t < 600; t += 0.25) { const g = gust(t); lo = Math.min(lo, g); hi = Math.max(hi, g); expect(g).toBeGreaterThanOrEqual(0); expect(g).toBeLessThanOrEqual(1); }
    expect(lo).toBeLessThan(0.05);
    expect(hi).toBeGreaterThan(0.9);
  });

  it('同一时刻谁读都一样', () => {
    expect(gust(123.4)).toBe(gust(123.4));
    expect(breath(55)).toBe(breath(55));
  });

  it('呼吸有方向、幅度不过 0.25', () => {
    for (let t = 0; t < 600; t += 0.5) expect(Math.abs(breath(t))).toBeLessThanOrEqual(0.25);
  });
});
