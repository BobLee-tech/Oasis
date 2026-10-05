// src/lib/sandGarden.test.ts
// 守三件事：① 落座的前缀不变量（新增文章不移动任何旧石）与最小间距；② 关系推导；③ 砂纹几何合法。
import { describe, it, expect } from 'vitest';
import {
  cnNum, iso, layoutGarden, magOfMinutes, MIN_SEP, neighborsOf, sandField, smooth,
  stonePath, ARCH, termOf, toSandPosts, type SandPost,
} from './sandGarden';
import type { BlogPost } from '../hooks/useGarden';

const DAY_MS = 86_400_000;
const CATS = ['note', 'thought', 'project', 'weekly', 'growth'];
const SERIES = ['COMP3121', '夜读', 'Hackathon', null, null];

const mk = (i: number, over: Partial<SandPost> = {}): SandPost => ({
  id: `p${i}`, title: `T${i}`, series: SERIES[(i * 7) % 5], cat: CATS[(i * 3) % 5],
  createdAt: 1_750_000_000_000 + i * DAY_MS * 1.7, updatedAt: 1_750_000_000_000 + i * DAY_MS * 1.7,
  minutes: 2 + (i * 11) % 26, growth: 'growing', tags: [`t${i % 6}`, `u${i % 4}`], excerpt: '', links: [],
  ...over,
});
const corpus = (n: number) => Array.from({ length: n }, (_, i) => mk(i));

describe('layoutGarden — 出生时择邻，此后终生不迁', () => {
  it('前缀不变量：前 k 篇的坐标在写到第 n 篇时一格不动', () => {
    const all = corpus(90), full = layoutGarden(all);
    for (const k of [1, 8, 23, 60]) {
      const part = layoutGarden(all.slice(0, k));
      part.stars.forEach(s => {
        const f = full.byId.get(s.p.id)!;
        expect(f.x).toBe(s.x);
        expect(f.y).toBe(s.y);
      });
    }
  });

  it('输入顺序不影响结果（纯函数，只认 createdAt）', () => {
    const all = corpus(40), a = layoutGarden(all), b = layoutGarden([...all].reverse());
    a.stars.forEach(s => expect(b.byId.get(s.p.id)!.x).toBe(s.x));
  });

  it('任意两块石不小于最小间距——命中区因而永不相交', () => {
    const g = layoutGarden(corpus(220));
    for (let i = 0; i < g.stars.length; i++) for (let j = i + 1; j < g.stars.length; j++) {
      const a = g.stars[i], b = g.stars[j];
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(MIN_SEP - 1e-9);
    }
  });

  it('同一分类落进同一片庭，合集按写作先后排成小径', () => {
    const g = layoutGarden(corpus(50));
    g.islands.forEach(isl => isl.stars.forEach(s => expect(s.p.cat).toBe(isl.cat)));
    g.series.forEach(p => {
      const t = p.stars.map(s => s.p.createdAt);
      expect([...t].sort((x, y) => x - y)).toEqual(t);
    });
  });

  it('星等只由篇幅决定，门限 7 / 12 / 18 / 25 分钟', () => {
    expect([1, 6, 7, 11, 12, 17, 18, 24, 25, 90].map(magOfMinutes)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it('600 篇的首次落座在合理时间内完成', () => {
    const t0 = performance.now();
    layoutGarden(corpus(600));
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('关系推导', () => {
  it('双链只认命中的标题，桥分出入方向；小径按截止时间收窄', () => {
    const base = (id: string, title: string, content: string, t: number): BlogPost => ({
      id, title, excerpt: '', date: '', createdAt: t, updatedAt: t, growth: 'growing', status: 'published',
      type: 'note', tags: ['计算机'], color: '', content, series: 'S',
    });
    const posts = toSandPosts([
      base('a', '甲', '见 [[乙]] 与 [[不存在]]', 1), base('b', '乙', '正文', 2), base('c', '丙', '[[丙]]', 3),
    ]);
    expect(posts[0].links).toEqual(['b']);
    expect(posts[2].links).toEqual([]);
    const g = layoutGarden(posts);
    const nb = neighborsOf(g, 'b');
    expect(nb.bridges).toEqual([{ s: g.byId.get('a'), dir: 'in' }]);
    expect(nb.path.map(s => s.p.id)).toEqual(['a', 'b', 'c']);
    expect(neighborsOf(g, 'b', 2).path.map(s => s.p.id)).toEqual(['a', 'b']);
  });
});

describe('砂纹与字形几何', () => {
  it('单块石的等值线是一条闭合路径', () => {
    const F = sandField([{ x: 0, y: 0, r: 8 }], 1)!;
    const loops = iso(F, 17);
    expect(loops).toHaveLength(1);
    const d = smooth(loops[0]);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('石形轮廓稳定复现且数值有限', () => {
    const a = stonePath('x', 9.5, ARCH[3], .4), b = stonePath('x', 9.5, ARCH[3], .4);
    expect(a).toBe(b);
    expect(a).not.toMatch(/NaN|Infinity/);
  });

  it('节气与汉字数字', () => {
    expect(termOf(new Date(2026, 8, 24).getTime())).toBe('秋分');
    expect(termOf(new Date(2026, 0, 2).getTime())).toBe('冬至');
    expect([3, 10, 14, 20, 36].map(cnNum)).toEqual(['三', '十', '十四', '二十', '三十六']);
  });
});
