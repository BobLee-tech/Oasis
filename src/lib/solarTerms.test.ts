import { describe, it, expect } from 'vitest';
import { currentSolarTerm, currentSeason, termTint } from './solarTerms';

const d = (m: number, day: number) => new Date(2024, m - 1, day);

describe('currentSolarTerm', () => {
  it('flips from 大寒 to 立春 exactly on 2/4', () => {
    expect(currentSolarTerm(d(2, 3)).name).toBe('大寒');
    expect(currentSolarTerm(d(2, 4)).name).toBe('立春');
  });

  it('treats early January as still 冬至 until 小寒 on 1/6', () => {
    expect(currentSolarTerm(d(1, 5)).name).toBe('冬至');
    expect(currentSolarTerm(d(1, 6)).name).toBe('小寒');
  });

  it('picks the nearest not-later term for an ordinary mid-term date', () => {
    expect(currentSolarTerm(d(7, 10)).name).toBe('小暑'); // 小暑 7/7, 大暑 7/23
  });
});

describe('currentSeason', () => {
  it('switches at each of the four 立 boundaries', () => {
    expect(currentSeason(d(2, 3))).toBe('winter');
    expect(currentSeason(d(2, 4))).toBe('spring');
    expect(currentSeason(d(5, 5))).toBe('spring');
    expect(currentSeason(d(5, 6))).toBe('summer');
    expect(currentSeason(d(8, 7))).toBe('summer');
    expect(currentSeason(d(8, 8))).toBe('autumn');
    expect(currentSeason(d(11, 7))).toBe('autumn');
    expect(currentSeason(d(11, 8))).toBe('winter');
  });
});

describe('termTint', () => {
  it('returns a wash/accent pair matching the date\'s season', () => {
    const spring = termTint(d(3, 1));
    const winter = termTint(d(12, 1));
    expect(spring.wash).toMatch(/^rgba/);
    expect(spring.accent).toMatch(/^rgba/);
    expect(spring).not.toEqual(winter);
  });
});
