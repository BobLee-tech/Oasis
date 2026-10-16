import { describe, expect, it } from 'vitest';
import { WaterSim, createBeatGate, goldenDrop } from './waterSim';

describe('WaterSim', () => {
  it('落一滴向下凹，并向外传开', () => {
    const sim = new WaterSim({ size: 64 });
    sim.drop(32, 32, 4, 1);
    expect(sim.current[32 * 64 + 32]).toBeCloseTo(-1);
    for (let i = 0; i < 12; i += 1) sim.step();
    expect(Math.abs(sim.current[32 * 64 + 44])).toBeGreaterThan(1e-4);
  });

  it('阻尼与海绵层让水面静下来', () => {
    const sim = new WaterSim({ size: 64 });
    sim.drop(20, 40, 5, 1.2);
    for (let i = 0; i < 60; i += 1) sim.step();
    const early = sim.restlessness();
    for (let i = 0; i < 600; i += 1) sim.step();
    expect(sim.restlessness()).toBeLessThan(early * 0.05);
  });

  it('边界之外的落点被忽略，不越界', () => {
    const sim = new WaterSim({ size: 16 });
    sim.drop(-5, 100, 6, 1);
    expect(sim.restlessness()).toBe(0);
  });
});

describe('goldenDrop', () => {
  it('落点在池内', () => {
    for (let n = 0; n < 50; n += 1) {
      const { x, y } = goldenDrop(n, Math.random());
      expect(Math.hypot(x - 0.5, y - 0.5)).toBeLessThanOrEqual(0.34 + 1e-9);
    }
  });
});

describe('createBeatGate', () => {
  it('上穿记一拍，回落后才重新上膛', () => {
    const gate = createBeatGate(0.45, 0.2, 100);
    expect(gate(0.5, 0)).toBe(true);
    expect(gate(0.6, 50)).toBe(false);
    expect(gate(0.3, 150)).toBe(false);
    expect(gate(0.6, 200)).toBe(false);
    expect(gate(0.1, 250)).toBe(false);
    expect(gate(0.6, 300)).toBe(true);
  });

  it('两拍至少隔 minGap', () => {
    const gate = createBeatGate(0.45, 0.2, 500);
    expect(gate(0.9, 0)).toBe(true);
    expect(gate(0.0, 10)).toBe(false);
    expect(gate(0.9, 100)).toBe(false);
  });
});
