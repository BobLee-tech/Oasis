import { describe, expect, it } from 'vitest';
import { CriticalSpring, DampedSpring } from './spring';

const run = (spring: CriticalSpring, goal: number, halfLife: number, frames: number[]) => {
  for (const dt of frames) spring.step(goal, halfLife, dt);
  return spring.x;
};

describe('CriticalSpring', () => {
  it('经过一个半衰期，距目标的距离约缩一半（解析解，与步长无关）', () => {
    const fine = new CriticalSpring(0);
    const coarse = new CriticalSpring(0);
    const a = run(fine, 1, 0.2, Array(120).fill(0.2 / 120));
    const b = run(coarse, 1, 0.2, [0.2]);
    // 临界阻尼从静止出发：半衰期的定义针对的是指数包络，起步时因速度为 0 会略慢于纯指数
    expect(a).toBeGreaterThan(0.35);
    expect(a).toBeLessThan(0.65);
    expect(Math.abs(a - b)).toBeLessThan(1e-9);
  });

  it('帧间隔在 8–50ms 之间抖动时，收敛结果与 60fps 一致且不过冲', () => {
    const steady = new CriticalSpring(0);
    const jitter = new CriticalSpring(0);
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let tSteady = 0;
    let tJitter = 0;
    let maxJitter = 0;
    while (tSteady < 1.5) { steady.step(1, 0.04, 1 / 60); tSteady += 1 / 60; }
    while (tJitter < 1.5) {
      const dt = 0.008 + rand() * 0.042;
      jitter.step(1, 0.04, dt);
      tJitter += dt;
      maxJitter = Math.max(maxJitter, jitter.x);
    }
    expect(steady.x).toBeCloseTo(1, 6);
    expect(jitter.x).toBeCloseTo(1, 6);
    expect(maxJitter).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('DampedSpring', () => {
  it('kickTo 的第一个峰值接近要求值，并衰减回 0', () => {
    const spring = new DampedSpring(3.5, 0.45);
    spring.kickTo(8);
    let peak = 0;
    for (let i = 0; i < 240; i++) {
      spring.step(1 / 120);
      peak = Math.max(peak, spring.x);
    }
    expect(peak).toBeGreaterThan(7.5);
    expect(peak).toBeLessThan(8.5);
    for (let i = 0; i < 600; i++) spring.step(1 / 60);
    expect(Math.abs(spring.x)).toBeLessThan(0.01);
  });

  it('30fps 与 120fps 下轨迹一致（解析解）', () => {
    const a = new DampedSpring(3.5, 0.45);
    const b = new DampedSpring(3.5, 0.45);
    a.kickTo(5);
    b.kickTo(5);
    for (let i = 0; i < 30; i++) a.step(1 / 30);
    for (let i = 0; i < 120; i++) b.step(1 / 120);
    expect(a.x).toBeCloseTo(b.x, 6);
  });

  it('切后台回来的超长帧不会让它发散', () => {
    const spring = new DampedSpring(3.5, 0.45);
    spring.kickTo(8);
    spring.step(5);
    expect(Number.isFinite(spring.x)).toBe(true);
    expect(Math.abs(spring.x)).toBeLessThan(8);
  });
});
