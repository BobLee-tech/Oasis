import { describe, expect, it } from 'vitest';
import { CHARS_PER_SEC, PUNCT_PAUSE_MS, revealDuration, revealTimeline, revealedCount, speakingOpen, utter } from './speech';

describe('revealTimeline', () => {
  it('普通字按 14 字/秒均匀出现', () => {
    const t = revealTimeline('一二三');
    expect(t[0]).toBe(0);
    expect(t[1]).toBeCloseTo(1000 / CHARS_PER_SEC);
    expect(t[2]).toBeCloseTo(2000 / CHARS_PER_SEC);
  });

  it('逗号随前字出现，之后停 160ms', () => {
    const t = revealTimeline('嗯，好');
    expect(t[1]).toBeCloseTo(1000 / CHARS_PER_SEC);
    expect(t[2] - t[1]).toBeCloseTo(PUNCT_PAUSE_MS);
  });

  it('句号停得比逗号久', () => {
    const comma = revealTimeline('好，嗯');
    const stop = revealTimeline('好。嗯');
    expect(stop[2]).toBeGreaterThan(comma[2]);
  });

  it('按码点切分：emoji 不会被拆成两半', () => {
    expect(revealTimeline('🎵好')).toHaveLength(2);
  });
});

describe('revealedCount', () => {
  it('二分查找与线性计数一致', () => {
    const t = revealTimeline('今天也辛苦了，早点休息。');
    for (let ms = -10; ms < revealDuration(t) + 50; ms += 7) {
      expect(revealedCount(t, ms)).toBe(t.filter(x => x <= ms).length);
    }
  });
});

describe('speakingOpen', () => {
  it('出字期间嘴会动，停顿与说完后闭嘴', () => {
    const u = utter('你好，世界', 1000);
    let peak = 0;
    for (let ms = 0; ms < 200; ms += 5) peak = Math.max(peak, speakingOpen(u, 1000 + ms));
    expect(peak).toBeGreaterThan(0.3);
    // 逗号在 t≈143ms 出现并停 160ms：停顿中段闭嘴
    expect(speakingOpen(u, 1000 + 143 + 80)).toBe(0);
    expect(speakingOpen(u, 1000 + revealDuration(u.timeline) + 10)).toBe(0);
    expect(speakingOpen(null, 0)).toBe(0);
  });
});
