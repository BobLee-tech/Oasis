import { describe, expect, it } from 'vitest';
import { pyramid, type HeadBox } from './pyramid';

const E = { W: 220, H: 330, FH: 118 };
// 1440×900 下页头的字实际占的框（docs/chidu-many.html 里量的，与现网同一套 CSS）
const HEAD: HeadBox = { top: 94, bottom: 252.49, right: 546.88 };
const REAL = ['Evan Lin', '双月之海', 'Garry Yuan', '客服小陈', '虚席以待'];
const FAKE = ['Aster', '听雨', 'Kumo', '青苔', 'Lumen', '南枝', 'Nori'];
const lettersOf = (n: number) => [...FAKE.slice(0, Math.max(0, n - REAL.length)), ...REAL].slice(-n);
const SCREENS: [number, number][] = [[1920, 1080], [1440, 900], [1280, 800], [1024, 768]];

describe('尺牍 · 品字形', () => {
  it('与演示页同一套算式：1440×900、四位邻居', () => {
    const P = pyramid(E, REAL, 1440, 900, HEAD)!;
    expect(P.hs).toBe(264);
    expect(P.cx).toBeCloseTo(815.44, 1);
    expect(P.pos.map((p) => p.row)).toEqual([0, 0, 1, 1, 1]);
    expect(P.pos[0].sx).toBeCloseTo(688.79, 1);
    expect(P.pos[4].sy).toBeCloseTo(645.94, 1);
  });

  it('上排比下排少，信封不碰页头的字、不出边距、不压 Dock', () => {
    for (const [w, h] of SCREENS) {
      for (let n = 5; n <= 12; n++) {
        const P = pyramid(E, lettersOf(n), w, h, HEAD);
        if (!P) continue;
        const ws = (P.hs * E.W) / E.H, top = P.pos.filter((p) => p.row === 0).length;
        expect(top).toBeLessThan(n - top);
        const gut = Math.max(40, w * 0.06);
        for (const p of P.pos) {
          const L = p.sx - ws / 2, T = p.sy - P.hs / 2;
          expect(L).toBeGreaterThanOrEqual(gut - 1);
          expect(p.sx + ws / 2).toBeLessThanOrEqual(w - gut + 1);
          expect(p.sy + P.hs / 2).toBeLessThanOrEqual(h - 120 + 12);
          expect(L < HEAD.right && T < HEAD.bottom).toBe(false);
        }
      }
    }
  });

  it('比原来的两行错落大：1440×900 下五到十封都不小于 213 px', () => {
    for (let n = 5; n <= 10; n++) expect(pyramid(E, lettersOf(n), 1440, 900, HEAD)!.hs).toBeGreaterThanOrEqual(213);
  });

  it('七封以内不互压', () => {
    for (let n = 5; n <= 7; n++) {
      const P = pyramid(E, lettersOf(n), 1440, 900, HEAD)!;
      expect(P.step).toBeGreaterThanOrEqual((P.hs * E.W) / E.H);
    }
  });

  it('同样的输入摆出同样的位置（错位按名字取种子，不随刷新跳）', () => {
    expect(pyramid(E, REAL, 1440, 900, HEAD)).toEqual(pyramid(E, REAL, 1440, 900, HEAD));
  });
});
