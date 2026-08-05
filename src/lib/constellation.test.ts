// src/lib/constellation.test.ts
// 覆盖两类回归：① 图谱基础结构（节点/连边/双链）；② 性能修复本身——
//   布局稳定性（增量松弛后既有星几乎不动）与大规模耗时上界，防止未来改动悄悄退化。
import { describe, it, expect } from 'vitest';
import { buildGraph, seeded, type PositionCache, type GraphResult } from './constellation';
import type { BlogPost } from '../hooks/useGarden';

const mkPost = (i: number, overrides: Partial<BlogPost> = {}): BlogPost => ({
  id: `p${i}`,
  title: `T${i}`,
  excerpt: '',
  date: '2026-01-01',
  createdAt: 1700000000000 + i,
  updatedAt: 1700000000000 + i,
  growth: 'seedling',
  status: 'published',
  type: 'thought',
  tags: [`tag${i % 5}`],
  color: '#39C5BB',
  content: 'x'.repeat(2000),
  ...overrides,
});
const typeColor = () => '#39C5BB';

// 已有文章集合在两次 buildGraph 结果间的平均/最大坐标位移——数值越小代表布局越「稳」
const displacement = (g1: GraphResult, g2: GraphResult, basePosts: BlogPost[]) => {
  let sum = 0, n = 0, max = 0;
  basePosts.forEach(p => {
    const n1 = g1.postNodes.get(p.id), n2 = g2.postNodes.get(p.id);
    if (!n1 || !n2) return;
    const d = Math.hypot(n2.x - n1.x, n2.y - n1.y);
    sum += d; n++; max = Math.max(max, d);
  });
  return { avg: n ? sum / n : 0, max };
};

describe('seeded', () => {
  it('同一 key 恒定返回同一个 [0,1) 值', () => {
    expect(seeded('post:abc')).toBe(seeded('post:abc'));
  });
  it('不同 key 大概率给出不同值（哈希基本不重合）', () => {
    expect(seeded('post:a')).not.toBe(seeded('post:b'));
  });
});

describe('buildGraph — 基础结构', () => {
  it('无文章时只有核心节点、零连边', () => {
    const g = buildGraph([], typeColor);
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0].kind).toBe('core');
    expect(g.links).toHaveLength(0);
  });

  it('每篇文章都长成一颗落在画布内的 post 星', () => {
    const posts = Array.from({ length: 12 }, (_, i) => mkPost(i));
    const g = buildGraph(posts, typeColor);
    expect(g.postNodes.size).toBe(12);
    g.nodes.forEach(n => {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(1000);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(760);
    });
  });

  it('同义标签（大小写/空白差异）合并进同一个标签星云', () => {
    const posts = [mkPost(0, { tags: ['Miku'] }), mkPost(1, { tags: [' miku '] })];
    const g = buildGraph(posts, typeColor);
    expect(g.tagNodes.size).toBe(1);
  });

  it('正文里命中的 [[双链]] 会额外画一条 wikilink 连边', () => {
    const posts = [
      mkPost(0, { title: 'A', content: '看 [[B]]', tags: ['x'] }),
      mkPost(1, { title: 'B', content: '', tags: ['x'] }),
    ];
    const g = buildGraph(posts, typeColor);
    expect(g.links.some(l => l.wikilink)).toBe(true);
  });

  it('未命中的 [[双链]] 不参与布局，也不产生连边', () => {
    const posts = [mkPost(0, { content: '提到 [[还没写的标题]]' })];
    const g = buildGraph(posts, typeColor);
    expect(g.links.some(l => l.wikilink)).toBe(false);
  });
});

describe('buildGraph — 增量松弛的布局稳定性（性能修复的核心验证）', () => {
  it('不传缓存：新增一篇文章仍会让既有星明显重排', () => {
    const base = Array.from({ length: 40 }, (_, i) => mkPost(i));
    const g1 = buildGraph(base, typeColor);
    const g2 = buildGraph([mkPost(999), ...base], typeColor);
    // 修复前（下标驱动初值）实测均值 262px；修复 seeded 初值后独立仍会因整图重新收敛而明显移动。
    // 这条断言标定「不给缓存」时的真实量级，防止有人误以为传不传缓存无所谓。
    expect(displacement(g1, g2, base).avg).toBeGreaterThan(20);
  });

  it('传入位置缓存：新增一篇文章后既有星几乎不动', () => {
    const base = Array.from({ length: 40 }, (_, i) => mkPost(i));
    const cache: PositionCache = new Map();
    const g1 = buildGraph(base, typeColor, cache);
    const g2 = buildGraph([mkPost(999), ...base], typeColor, cache);
    const d = displacement(g1, g2, base);
    // 本机实测 avg≈5.4px / max≈16.7px（画布 1000×760），留出 CI 抖动余量。
    expect(d.avg).toBeLessThan(20);
    expect(d.max).toBeLessThan(60);
  });

  it('清空缓存等价于重新全量布局，不会报错或漏掉节点', () => {
    const base = Array.from({ length: 20 }, (_, i) => mkPost(i));
    const cache: PositionCache = new Map();
    buildGraph(base, typeColor, cache);
    cache.clear();
    const g2 = buildGraph(base, typeColor, cache);
    expect(g2.postNodes.size).toBe(20);
  });

  it('文章被删除后，缓存里对应的坐标条目也会被清掉（不留幽灵坐标）', () => {
    const base = Array.from({ length: 10 }, (_, i) => mkPost(i));
    const cache: PositionCache = new Map();
    buildGraph(base, typeColor, cache);
    expect(cache.has('post:p3')).toBe(true);
    buildGraph(base.filter(p => p.id !== 'p3'), typeColor, cache);
    expect(cache.has('post:p3')).toBe(false);
  });
});

describe('buildGraph — 大规模耗时上界（防止未来改动悄悄拖慢首屏/交互）', () => {
  it('600 篇文章的首次全量布局在合理时间内完成', () => {
    const posts = Array.from({ length: 600 }, (_, i) => mkPost(i, { tags: [`tag${i % 150}`] }));
    const t0 = performance.now();
    buildGraph(posts, typeColor);
    // 本机实测约 270ms；CI 机器较慢，给到 3x 余量。
    expect(performance.now() - t0).toBeLessThan(800);
  });

  it('300 篇的已有图上增量新增 1 篇，耗时明显小于等效全量重建', () => {
    const base = Array.from({ length: 300 }, (_, i) => mkPost(i, { tags: [`tag${i % 80}`] }));
    const cache: PositionCache = new Map();
    buildGraph(base, typeColor, cache);
    const t0 = performance.now();
    buildGraph([mkPost(9999, { tags: ['tag0'] }), ...base], typeColor, cache);
    // 本机实测约 49ms；同规模全量重建约 90ms+。给到充分余量避免 CI 抖动误报。
    expect(performance.now() - t0).toBeLessThan(250);
  });
});
