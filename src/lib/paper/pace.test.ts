import { describe, expect, it } from 'vitest';
import { dprGovernor } from './pace';

/** 按固定帧时连画 ms 毫秒 */
const run = (g: ReturnType<typeof dprGovernor>, dt: number, ms: number, t0 = 0) => {
  let t = t0;
  for (; t < t0 + ms; t += dt) g.frame(t);
  return t;
};

describe('dprGovernor', () => {
  it('60 帧不降', () => {
    const seen: number[] = [], g = dprGovernor(2, (d) => seen.push(d));
    run(g, 16.7, 10_000);
    expect(seen).toEqual([]);
    expect(g.dpr).toBe(2);
  });

  it('连着慢过 24 ms 撑过 1.2 s 降一档，再慢再降，到 1 为止', () => {
    const seen: number[] = [], g = dprGovernor(2, (d) => seen.push(d));
    run(g, 40, 20_000);
    expect(seen).toEqual([1.75, 1.5, 1.25, 1]);
    expect(g.dpr).toBe(1);
  });

  it('偶尔一帧卡顿不降', () => {
    const seen: number[] = [], g = dprGovernor(2, (d) => seen.push(d));
    let t = 0;
    for (let i = 0; i < 600; i++) { t += i % 50 === 0 ? 120 : 16.7; g.frame(t); }
    expect(seen).toEqual([]);
  });

  it('skip() 隔开的帧（闲时 30 帧、静止不画）不算慢', () => {
    const seen: number[] = [], g = dprGovernor(2, (d) => seen.push(d));
    for (let t = 0; t < 10_000; t += 16.7) { if (Math.round(t / 16.7) % 2) g.skip(); else g.frame(t); }
    expect(seen).toEqual([]);
  });
});
