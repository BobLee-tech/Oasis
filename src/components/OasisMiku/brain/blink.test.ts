import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlinkEngine } from './blink';

afterEach(() => vi.restoreAllMocks());

describe('BlinkEngine', () => {
  it('一分钟内保持自然频率、非等周期且输出有界', () => {
    let seed = 0x39c5bb;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    });

    const blink = new BlinkEngine();
    const intervals: number[] = [];
    let lastBlink = 0;
    let wasClosed = false;

    for (let frame = 0; frame < 60 * 60; frame++) {
      const value = blink.update(1 / 60);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      const closed = value <= 0.01;
      if (closed && !wasClosed) {
        const at = frame / 60;
        if (lastBlink > 0) intervals.push(at - lastBlink);
        lastBlink = at;
      }
      wasClosed = closed;
    }

    expect(intervals.length + 1).toBeGreaterThanOrEqual(12);
    expect(intervals.length + 1).toBeLessThanOrEqual(28);
    const mean = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    const variance = intervals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / intervals.length;
    expect(Math.sqrt(variance) / mean).toBeGreaterThan(0.3);
  });
});
