import { describe, expect, it } from 'vitest';
import { colophonOf, ganzhiYear } from './hou';

describe('落款的时间', () => {
  it('干支纪年以立春为岁首', () => {
    expect(ganzhiYear(new Date(2026, 9, 5))).toBe('丙午');
    expect(ganzhiYear(new Date(2026, 1, 3))).toBe('乙巳');    // 立春前仍是上一年
    expect(ganzhiYear(new Date(2026, 1, 4))).toBe('丙午');
    expect(ganzhiYear(new Date(1984, 5, 1))).toBe('甲子');
  });

  it('秋分第 13 天是末候「水始涸」', () => {
    expect(colophonOf(new Date(2026, 9, 5))).toEqual({ year: '丙午', term: '秋分', houIndex: 2, hou: '水始涸' });
  });

  it('节气头一天是初候', () => {
    const c = colophonOf(new Date(2026, 9, 24, 12));
    expect(c.term).toBe('霜降');
    expect(c.houIndex).toBe(0);
    expect(c.hou).toBe('豺乃祭兽');
  });
});
