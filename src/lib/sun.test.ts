import { describe, expect, it } from 'vitest';
import { sunAt } from './sun';

// 悉尼 2026-10-25 是夏令时（AEDT，UTC+11）；用 UTC 写时刻，免得测试依赖本机时区
const syd = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 25, h - 11, m));

describe('sunAt（悉尼）', () => {
  it('正午前后太阳在北边，高度约 68°', () => {
    const { az, el } = sunAt(syd(12, 50));
    expect(az > 340 || az < 20).toBe(true);
    expect(el).toBeGreaterThan(64);
    expect(el).toBeLessThan(72);
  });

  it('早上在东、傍晚在西，都比正午低', () => {
    const am = sunAt(syd(7, 30)), pm = sunAt(syd(18, 0));
    expect(am.az).toBeGreaterThan(60); expect(am.az).toBeLessThan(120);
    expect(pm.az).toBeGreaterThan(240); expect(pm.az).toBeLessThan(300);
    expect(am.el).toBeGreaterThan(0); expect(am.el).toBeLessThan(35);
    expect(pm.el).toBeGreaterThan(0); expect(pm.el).toBeLessThan(35);
  });

  it('半夜在地平线下', () => {
    expect(sunAt(syd(0, 30)).el).toBeLessThan(-20);
  });

  it('冬至正午比夏至正午低得多（南半球）', () => {
    const june = sunAt(new Date(Date.UTC(2026, 5, 21, 2, 0)));     // 12:00 AEST
    const dec = sunAt(new Date(Date.UTC(2026, 11, 21, 1, 0)));     // 12:00 AEDT
    expect(dec.el - june.el).toBeGreaterThan(40);
  });
});
