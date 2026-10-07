import { describe, expect, it } from 'vitest';
import { DECIDE_MS, GestureTracker, HOLD_MS, type TouchZone } from './gesture';

// 用合成的指针序列驱动状态机：每 8ms 一个采样点，与 120Hz 指针事件同量级
const drive = (zone: TouchZone, points: [number, number, number][]) => {
  const g = new GestureTracker();
  const [x0, y0, t0] = points[0];
  g.down(x0, y0, t0, zone);
  const seen: string[] = [];
  for (const [x, y, t] of points.slice(1, -1)) {
    g.tick(t);
    const s = g.move(x, y, t);
    if (s && seen[seen.length - 1] !== s.kind) seen.push(s.kind);
  }
  const [x1, y1, t1] = points[points.length - 1];
  const end = g.up(x1, y1, t1)!;
  return { end, seen };
};

const line = (from: [number, number], to: [number, number], ms: number, t0 = 0) => {
  const n = Math.max(1, Math.round(ms / 8));
  return Array.from({ length: n + 1 }, (_, i) => [
    from[0] + ((to[0] - from[0]) * i) / n,
    from[1] + ((to[1] - from[1]) * i) / n,
    t0 + (ms * i) / n,
  ] as [number, number, number]);
};

// 在宽约 30px 的头上来回摸：每一趟 24px，可快可慢
const strokes = (passes: number, msPerPass: number) => {
  const pts: [number, number, number][] = [];
  for (let p = 0; p < passes; p++) {
    const [a, b] = p % 2 === 0 ? [100, 124] : [124, 100];
    const seg = line([a, 100], [b, 100], msPerPass, p * msPerPass);
    pts.push(...(p === 0 ? seg : seg.slice(1)));
  }
  return pts;
};

describe('GestureTracker', () => {
  it('快速点按 = tap', () => {
    const { end } = drive('head', [[100, 100, 0], [101, 100, 40], [101, 101, 90]]);
    expect(end.kind).toBe('tap');
  });

  it('不动按住超过 260ms = hold，且在按住过程中（而非松手时）就已判定', () => {
    const g = new GestureTracker();
    g.down(50, 50, 0, 'head');
    expect(g.tick(HOLD_MS - 1)?.kind).toBe('pending');
    expect(g.tick(HOLD_MS)?.kind).toBe('hold');
    expect(g.up(50, 50, 600)?.kind).toBe('hold');
  });

  it('在小小的头上慢慢来回摸 = stroke', () => {
    const { end, seen } = drive('head', strokes(4, 200));
    expect(seen).toEqual(['pending', 'stroke']);
    expect(end.kind).toBe('stroke');
    expect(end.path).toBeGreaterThan(90);
  });

  it('回归：用鼠标快速来回摸头（每趟 24px/35ms ≈ 0.69px/ms，旧版会卡在 pending）也要判成 stroke，且在 ~90ms 内开始跟手', () => {
    const pts = strokes(10, 35);
    const g = new GestureTracker();
    g.down(pts[0][0], pts[0][1], 0, 'head');
    let firstStrokeAt = -1;
    for (const [x, y, t] of pts.slice(1)) {
      g.tick(t);
      const s = g.move(x, y, t);
      if (firstStrokeAt < 0 && s?.kind === 'stroke') firstStrokeAt = t;
    }
    expect(firstStrokeAt).toBeGreaterThanOrEqual(DECIDE_MS);
    expect(firstStrokeAt).toBeLessThan(DECIDE_MS + 20);
    expect(g.up(pts[pts.length - 1][0], 100, 400)?.kind).toBe('stroke');
  });

  it('在马尾上慢慢拖 = pull', () => {
    const { end } = drive('twintail', line([60, 120], [40, 170], 300));
    expect(end.kind).toBe('pull');
  });

  it('身体上快速划过 = swipe，并记录方向', () => {
    const { end } = drive('body', line([100, 200], [100, 120], 60));
    expect(end.kind).toBe('swipe');
    expect(end.upward).toBe(true);
  });

  it('头上划过要更远更快才算 swipe：40px/100ms 仍按抚摸处理', () => {
    expect(drive('head', line([100, 100], [140, 100], 100)).end.kind).toBe('stroke');
    expect(drive('head', line([100, 100], [170, 100], 80)).end.kind).toBe('swipe');
  });

  it('快速但很短的一下仍是 tap', () => {
    const { end } = drive('body', line([100, 200], [100, 180], 20));
    expect(end.kind).toBe('tap');
  });

  it('长按之后开始移动会转成 stroke', () => {
    const g = new GestureTracker();
    g.down(0, 0, 0, 'head');
    g.tick(300);
    for (const [x, y, t] of line([0, 0], [20, 0], 160, 300)) g.move(x, y, t);
    expect(g.state?.kind).toBe('stroke');
  });

  it('cancel 后不再有状态', () => {
    const g = new GestureTracker();
    g.down(0, 0, 0, 'head');
    g.cancel();
    expect(g.state).toBeNull();
    expect(g.up(0, 0, 10)).toBeNull();
  });
});
