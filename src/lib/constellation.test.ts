// src/lib/constellation.test.ts
// 覆盖三类回归：① 标签分档 / 合集 / 双链结构；② 落座的确定性与不重叠；③ 大规模耗时上界。
//
// 落座换成「出生时择邻，此后终生不迁」之后，稳定性有了比「旧星不动」更强的表述：
// layoutStars(前 k 篇) 必须是 layoutStars(全部) 的前缀。这一条守住了另外两条的根。
import { describe, it, expect } from 'vitest';
import {
  angleForDate, annularSector, arcPath, bandsFor, buildGraph, densityByTerm,
  layoutStars, magnitudeOf, MIN_SEP, plateBounds, PLATE_MIN_W, PLATE_MIN_H,
  relaxColumn, seeded, SKY_INNER, SKY_OUTER,
} from './constellation';
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
const DAY_MS = 86_400_000;

describe('seeded', () => {
  it('同一 key 恒定返回同一个 [0,1) 值', () => {
    expect(seeded('post:abc')).toBe(seeded('post:abc'));
  });
  it('不同 key 大概率给出不同值（哈希基本不重合）', () => {
    expect(seeded('post:a')).not.toBe(seeded('post:b'));
  });
});

describe('年轮盘数据与几何工具', () => {
  it('密度固定返回 24 箱，且守恒文章总数与同日归箱', () => {
    const sameDay = Date.UTC(2026, 7, 18);
    const bins = densityByTerm([
      { createdAt: sameDay }, { createdAt: sameDay }, { createdAt: Date.UTC(2026, 1, 4) },
    ]);
    expect(bins).toHaveLength(24);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(3);
    expect(bins.some(bin => bin.count === 2)).toBe(true);
    expect(densityByTerm([])).toHaveLength(24);
    expect(densityByTerm([]).every(bin => bin.count === 0)).toBe(true);
  });

  it('松弛结果有序、在界内，并在容量允许时保持最小行距', () => {
    const out = relaxColumn([{ y: 48 }, { y: 51 }, { y: 52 }, { y: 88 }], 22, 20, 120);
    expect(out).toHaveLength(4);
    expect(out.every(item => item.y >= 20 && item.y <= 120)).toBe(true);
    for (let i = 1; i < out.length; i++) expect(out[i].y - out[i - 1].y).toBeGreaterThanOrEqual(22);
  });

  it('环扇形与圆弧始终生成合法 path', () => {
    [annularSector(-1, 1, 100, 120), arcPath(200, -1, 1)].forEach(path => {
      expect(path.startsWith('M')).toBe(true);
      expect(path).not.toContain('NaN');
    });
  });
});

describe('buildGraph — 基础结构', () => {
  it('无文章时只有核心节点、零连边', () => {
    const g = buildGraph([], typeColor);
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0].kind).toBe('core');
    expect(g.links).toHaveLength(0);
  });

  it('每篇文章都长成一颗坐标有限、落在版心内的 post 星', () => {
    const posts = Array.from({ length: 12 }, (_, i) => mkPost(i));
    const g = buildGraph(posts, typeColor);
    expect(g.postNodes.size).toBe(12);
    // 版心是算出来的，不再是写死的 1000×760——星可以长到画布外，版心跟着长
    const plate = plateBounds([...g.postNodes.values()]);
    g.nodes.forEach(n => {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    });
    [...g.postNodes.values()].forEach(n => {
      expect(n.x).toBeGreaterThanOrEqual(plate.x);
      expect(n.x).toBeLessThanOrEqual(plate.x + plate.width);
      expect(n.y).toBeGreaterThanOrEqual(plate.y);
      expect(n.y).toBeLessThanOrEqual(plate.y + plate.height);
    });
  });

  it('同义标签（大小写/空白差异）合并，并按 2–3 篇规则直接连文章', () => {
    const posts = [mkPost(0, { tags: ['Miku'] }), mkPost(1, { tags: [' miku '] })];
    const g = buildGraph(posts, typeColor);
    expect(g.tagMap.size).toBe(1);
    expect(g.tagNodes.size).toBe(0);
    expect(g.links.some(l => l.kind === 'shared-tag' && l.tags?.includes('Miku'))).toBe(true);
  });

  it('单例标签不建节点；4 篇以上才建星云 hub', () => {
    const singleton = buildGraph([mkPost(0, { tags: ['only'] })], typeColor);
    expect(singleton.tagNodes.size).toBe(0);
    expect(singleton.postNodes.get('p0')?.singletonTags).toEqual(['only']);
    const hub = buildGraph(Array.from({ length: 4 }, (_, i) => mkPost(i, { tags: ['theme'] })), typeColor);
    expect(hub.tagNodes.size).toBe(1);
    expect(hub.links.filter(l => l.kind === 'nebula')).toHaveLength(4);
  });

  // 线上真实数据：#comp3121 / #计算机 / 合集《COMP3121》装着同样的四篇，
  // 不去重的话同一个分组会被画三遍（两个灰星云 + 一条合集线）。
  it('成员集合与某个合集相同的标签不建星云——合集连线已经说完了', () => {
    const posts = Array.from({ length: 4 }, (_, i) =>
      mkPost(i, { tags: ['comp3121'], series: 'COMP3121' }));
    const g = buildGraph(posts, typeColor);
    expect(g.tagNodes.size).toBe(0);
    expect(g.links.filter(l => l.kind === 'nebula')).toHaveLength(0);
    expect(g.links.filter(l => l.kind === 'series')).toHaveLength(3);
  });

  it('近义标签（Jaccard > 0.8）并成一个星云，两个名字并列', () => {
    const posts = Array.from({ length: 4 }, (_, i) => mkPost(i, { tags: ['计算机', 'comp3121'] }));
    const g = buildGraph(posts, typeColor);
    expect(g.tagNodes.size).toBe(1);
    const hub = [...g.tagNodes.values()][0];
    expect([hub.tag, ...(hub.aliases ?? [])].sort()).toEqual(['comp3121', '计算机']);
    expect(g.links.filter(l => l.kind === 'nebula')).toHaveLength(4);
  });

  it('已被合集或双链连上的两篇，不再重复画共享标签的细线', () => {
    const viaSeries = buildGraph(
      [mkPost(0, { tags: ['x'], series: 'S' }), mkPost(1, { tags: ['x'], series: 'S' })],
      typeColor,
    );
    expect(viaSeries.links.filter(l => l.kind === 'shared-tag')).toHaveLength(0);
    expect(viaSeries.links.filter(l => l.kind === 'series')).toHaveLength(1);

    const viaWiki = buildGraph(
      [mkPost(0, { title: 'A', tags: ['x'], content: '看 [[B]]' }), mkPost(1, { title: 'B', tags: ['x'] })],
      typeColor,
    );
    expect(viaWiki.links.filter(l => l.kind === 'shared-tag')).toHaveLength(0);
  });

  it('同合集文章按 createdAt 顺序连成有名称的星座线', () => {
    const posts = [mkPost(2, { series: 'COMP3121' }), mkPost(0, { series: 'COMP3121' }), mkPost(1, { series: 'COMP3121' })];
    const g = buildGraph(posts, typeColor);
    expect(g.series[0].posts.map(p => p.id)).toEqual(['p0', 'p1', 'p2']);
    expect(g.links.filter(l => l.kind === 'series')).toHaveLength(2);
  });

  it('正文里命中的 [[双链]] 会额外画一条 wikilink 连边', () => {
    const posts = [
      mkPost(0, { title: 'A', content: '看 [[B]]', tags: ['x'] }),
      mkPost(1, { title: 'B', content: '', tags: ['x'] }),
    ];
    const g = buildGraph(posts, typeColor);
    expect(g.links.some(l => l.wikilink)).toBe(true);
  });

  // 「未种下的星」这个概念已经去掉：欠着的稿子不在天上占位置，只进园丁的观测手记。
  it('未命中的 [[双链]] 只进观测手记，不落星也不画线', () => {
    const posts = [mkPost(0, { content: '提到 [[还没写的标题]]' })];
    const g = buildGraph(posts, typeColor);
    expect(g.links.some(l => l.wikilink)).toBe(false);
    expect(g.nodes.every(n => n.kind !== 'post' || n.post)).toBe(true);
    expect(g.nodes).toHaveLength(2);                 // core + 那一篇
    const pending = g.signals.filter(x => x.kind === 'pending');
    expect(pending).toHaveLength(1);
    expect(pending[0].pendingTitle).toBe('还没写的标题');
  });
});

describe('buildGraph — 落座的确定性与不重叠', () => {
  const day = Date.UTC(2026, 7, 10);
  const dayNow = Date.UTC(2026, 7, 11);
  const sameDay = (i: number, hour: number, over: Partial<BlogPost> = {}) =>
    mkPost(i, { createdAt: day + hour * 3600_000, ...over });
  it('新增文章后，所有旧星的坐标逐像素不变', () => {
    const base = Array.from({ length: 40 }, (_, i) => mkPost(i));
    const now = Date.UTC(2026, 7, 11);
    const g1 = buildGraph(base, typeColor, now);
    // 新星的 createdAt 必须更晚才谈得上「后来者」；同分类，走同一条带，冲突最激烈。
    const g2 = buildGraph([mkPost(999, { createdAt: 1700000000000 + 9999 }), ...base], typeColor, now);
    base.forEach(post => {
      expect(g2.postNodes.get(post.id)?.x).toBe(g1.postNodes.get(post.id)?.x);
      expect(g2.postNodes.get(post.id)?.y).toBe(g1.postNodes.get(post.id)?.y);
    });
  });

  it('同一天再写一篇，当天已有的星一格都不动', () => {
    const base = [sameDay(0, 1), sameDay(1, 2), sameDay(2, 3)];
    const before = buildGraph(base, typeColor, dayNow);
    const after = buildGraph([...base, sameDay(3, 9)], typeColor, dayNow);
    ['p0', 'p1', 'p2'].forEach(id => {
      expect(after.postNodes.get(id)!.x).toBe(before.postNodes.get(id)!.x);
      expect(after.postNodes.get(id)!.y).toBe(before.postNodes.get(id)!.y);
    });
  });

  // 这条是整张图能不能读的底线：星挤在一起时，标注、命中、连线会同时失效。
  it('任意两颗星（含星云）都不小于最小间距', () => {
    const posts = Array.from({ length: 80 }, (_, i) => mkPost(i, {
      // 一半集中在同一天、同一分类：最坏情况的爆发式写作
      createdAt: day + (i % 2 === 0 ? 0 : i * DAY_MS),
      type: ['thought', 'note', 'project'][i % 3],
      content: 'x'.repeat(500 + i * 50),
    }));
    const g = buildGraph(posts, typeColor, dayNow);
    const all = [...g.postNodes.values(), ...g.tagNodes.values()];
    let worst = Infinity;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        worst = Math.min(worst, Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y));
      }
    }
    expect(worst).toBeGreaterThanOrEqual(MIN_SEP - 1e-9);
  });

  it('命中区最多相切，永不相交——点哪颗就开哪颗', () => {
    const posts = Array.from({ length: 40 }, (_, i) => mkPost(i, { createdAt: day + (i % 3) * DAY_MS }));
    const all = [...buildGraph(posts, typeColor, dayNow).postNodes.values()];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const d = Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y);
        expect(all[i].hitR + all[j].hitR).toBeLessThanOrEqual(d + 1e-9);
      }
    }
  });

  // 星座 = 合集。链是一步一步长出来的，所以相邻两颗必然彼此够得着——
  // 这条守住「连线读起来是一串，不是横跨半张天的一根钢丝」。
  it('同合集的星连成一串：相邻两颗的间距有上界', () => {
    const posts = Array.from({ length: 9 }, (_, i) => sameDay(i, i, { series: 'S' }));
    const g = buildGraph(posts, typeColor, dayNow);
    const chain = g.series[0].posts.map(p => g.postNodes.get(p.id)!);
    for (let i = 1; i < chain.length; i++) {
      const d = Math.hypot(chain[i].x - chain[i - 1].x, chain[i].y - chain[i - 1].y);
      expect(d).toBeGreaterThanOrEqual(MIN_SEP - 1e-9);
      expect(d).toBeLessThan(220);           // 一步的上限（含冲突外推的余量）
    }
  });

  // 不同合集各占一块领地：黄金角螺线保证它们不会长在一起。
  it('不同合集分居不同领地，重心明显分开', () => {
    const posts = [
      ...Array.from({ length: 5 }, (_, i) => sameDay(i, i, { series: 'A' })),
      ...Array.from({ length: 5 }, (_, i) => sameDay(i + 10, i, { series: 'B' })),
    ];
    const g = buildGraph(posts, typeColor, dayNow);
    const mid = (ids: number[]) => {
      const ns = ids.map(i => g.postNodes.get(`p${i}`)!);
      return { x: ns.reduce((a, n) => a + n.x, 0) / ns.length, y: ns.reduce((a, n) => a + n.y, 0) / ns.length };
    };
    const a = mid([0, 1, 2, 3, 4]), b = mid([10, 11, 12, 13, 14]);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(MIN_SEP * 2);
  });

  // 星等 = 篇幅，绝对门限。同一篇文章的亮度不因为别人写了什么而变。
  it('星等只由自己的篇幅决定，与语料无关', () => {
    const short = mkPost(0, { content: '短' });
    const long = mkPost(1, { content: '字'.repeat(12000) });
    expect(magnitudeOf(short)).toBe(1);
    expect(magnitudeOf(long)).toBe(5);
    const alone = buildGraph([long], typeColor, dayNow);
    const crowd = buildGraph([long, ...Array.from({ length: 30 }, (_, i) => mkPost(i + 10))], typeColor, dayNow);
    expect(crowd.postNodes.get('p1')!.magnitude).toBe(alone.postNodes.get('p1')!.magnitude);
  });

  it('分类带按「首篇写作时间」排序，越早开垦的越靠内', () => {
    const bands = bandsFor([
      { id: 'a', type: 'project', createdAt: 300 },
      { id: 'b', type: 'note', createdAt: 100 },
      { id: 'c', type: 'note', createdAt: 900 },
    ]);
    expect(bands.center.get('note')!).toBeLessThan(bands.center.get('project')!);
    expect(bands.center.get('note')!).toBeGreaterThanOrEqual(SKY_INNER);
    expect(bands.center.get('project')!).toBeLessThanOrEqual(SKY_OUTER);
  });

  it('落座是纯函数：输入的顺序不影响结果', () => {
    const posts = Array.from({ length: 30 }, (_, i) => mkPost(i, { createdAt: day + (i % 4) * DAY_MS }));
    const a = layoutStars(posts).seats;
    const b = layoutStars([...posts].reverse()).seats;
    posts.forEach(p => {
      expect(b.get(p.id)!.x).toBe(a.get(p.id)!.x);
      expect(b.get(p.id)!.y).toBe(a.get(p.id)!.y);
    });
  });

  // ✦ 这一条是整套落座的根：layoutStars(前 k 篇) 必须是 layoutStars(全部) 的前缀。
  //   它一旦成立，「新增文章不移动旧星」就是它的推论——不管新来的是几篇、
  //   属于老合集还是开了新合集、有没有和谁共标签。
  it('前缀不变量：先写的 k 篇，在写到第 n 篇时坐标一格不动', () => {
    const posts = Array.from({ length: 45 }, (_, i) => mkPost(i, {
      createdAt: day + i * 3600_000,
      series: i % 5 === 0 ? undefined : `S${i % 7}`,
      tags: [`tag${i % 9}`],
    }));
    const full = layoutStars(posts).seats;
    for (const k of [1, 2, 7, 20, 44]) {
      const partial = layoutStars(posts.slice(0, k)).seats;
      expect(partial.size).toBe(k);
      posts.slice(0, k).forEach(p => {
        expect(partial.get(p.id)!.x).toBe(full.get(p.id)!.x);
        expect(partial.get(p.id)!.y).toBe(full.get(p.id)!.y);
      });
    }
  });

  it('版心随星群长大，八颗星时仍有下限', () => {
    const few = plateBounds([{ x: 500, y: 376 }, { x: 510, y: 380 }]);
    expect(few.width).toBeGreaterThanOrEqual(PLATE_MIN_W);
    expect(few.height).toBeGreaterThanOrEqual(PLATE_MIN_H);
    const many = plateBounds([{ x: 0, y: 0 }, { x: 2000, y: 1200 }]);
    expect(many.width).toBeGreaterThan(2000);
    // 长宽比锁死：版心永远是同一张纸的形状
    expect(many.width / many.height).toBeCloseTo(PLATE_MIN_W / PLATE_MIN_H, 6);
    expect(plateBounds([]).width).toBe(PLATE_MIN_W);
  });

  it('立春为时间环正上方零点', () => {
    expect(angleForDate(Date.UTC(2026, 1, 4))).toBeCloseTo(-Math.PI / 2, 8);
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

  it('标签近义合并是 O(hub²)，150 个星云也不该成为瓶颈', () => {
    const posts = Array.from({ length: 600 }, (_, i) => mkPost(i, { tags: [`tag${i % 150}`] }));
    const t0 = performance.now();
    const g = buildGraph(posts, typeColor);
    expect(g.tagNodes.size).toBe(150);
    expect(performance.now() - t0).toBeLessThan(800);
  });
});
