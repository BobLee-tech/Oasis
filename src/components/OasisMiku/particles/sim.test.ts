import { describe, expect, it } from 'vitest';
import { POOL_SIZE, ParticlePool, recipe, renderState, toneColor, type EmitKind } from './sim';

// 可复现的伪随机（mulberry32）
const seeded = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const KINDS: EmitKind[] = ['ripple', 'dust', 'hearts', 'notes', 'burst', 'petals', 'zzz', 'motes-up', 'motes-down', 'sparks', 'bloom', 'firefly', 'snow'];

describe('ParticlePool', () => {
  it('寿命到了自动回收，计数归零', () => {
    const pool = new ParticlePool();
    for (const s of recipe('hearts', { x: 0, y: 0 }, seeded(1))) pool.spawn(s);
    expect(pool.count).toBe(3);
    for (let i = 0; i < 400; i++) pool.step(1 / 60);
    expect(pool.count).toBe(0);
  });

  it('池满时挤掉低优先级的旧粒子，涟漪一定发得出去', () => {
    const pool = new ParticlePool();
    const rng = seeded(2);
    for (let i = 0; i < POOL_SIZE; i++) pool.spawn(recipe('dust', { x: 0, y: 0 }, rng)[0]);
    expect(pool.count).toBe(POOL_SIZE);
    const ripple = pool.spawn(recipe('ripple', { x: 5, y: 5 })[0]);
    expect(ripple?.shape).toBe('ring');
    expect(pool.count).toBe(POOL_SIZE);
  });

  it('池里全是高优先级时，低优先级的新粒子被丢弃而不是挤人', () => {
    const pool = new ParticlePool();
    for (let i = 0; i < POOL_SIZE; i++) pool.spawn(recipe('ripple', { x: 0, y: 0 })[0]);
    expect(pool.spawn(recipe('dust', { x: 0, y: 0 }, seeded(3))[0])).toBeNull();
  });

  it('积分与帧率无关：60fps 与 30fps 跑同样时长，位置相差 < 2px', () => {
    const spawn = recipe('notes', { x: 100, y: 100 }, seeded(4))[0];
    const a = new ParticlePool();
    const b = new ParticlePool();
    a.spawn(spawn);
    b.spawn(spawn);
    for (let i = 0; i < 60; i++) a.step(1 / 60);
    for (let i = 0; i < 30; i++) b.step(1 / 30);
    const pa = a.items.find(p => p.alive)!;
    const pb = b.items.find(p => p.alive)!;
    expect(Math.hypot(pa.x - pb.x, pa.y - pb.y)).toBeLessThan(2);
  });
});

describe('recipe', () => {
  it('每种配方都产出有限、正寿命的粒子', () => {
    for (const kind of KINDS) {
      const spawns = recipe(kind, { x: 10, y: 20, r: 16 }, seeded(5));
      expect(spawns.length).toBeGreaterThan(0);
      for (const s of spawns) {
        expect(s.life).toBeGreaterThan(0);
        expect(Number.isFinite(s.x) && Number.isFinite(s.y)).toBe(true);
      }
    }
  });

  it('涟漪从触点本身出发', () => {
    const [s] = recipe('ripple', { x: 42, y: 7 });
    expect([s.x, s.y]).toEqual([42, 7]);
  });

  it('爱心往上飘、樱瓣往下落、哀伤光尘下沉', () => {
    const up = recipe('hearts', { x: 0, y: 0 }, seeded(6));
    expect(up.every(s => (s.vy ?? 0) < 0)).toBe(true);
    expect(recipe('petals', { x: 0, y: 0 }, seeded(7)).every(s => (s.vy ?? 0) > 0)).toBe(true);
    expect(recipe('motes-down', { x: 0, y: 0 }, seeded(8)).every(s => (s.vy ?? 0) > 0)).toBe(true);
  });
});

describe('renderState', () => {
  it('快显慢隐：出生透明、中段不透明、寿终透明', () => {
    const pool = new ParticlePool();
    const p = pool.spawn(recipe('hearts', { x: 0, y: 0 }, seeded(9))[0])!;
    expect(renderState(p).alpha).toBe(0);
    p.age = p.life * 0.3;
    expect(renderState(p).alpha).toBeCloseTo(1);
    p.age = p.life * 0.999;
    expect(renderState(p).alpha).toBeLessThan(0.01);
  });
});

describe('toneColor', () => {
  it('效价两端分别是初音绿和樱粉', () => {
    expect(toneColor(-1)).toBe('rgb(57,197,187)');
    expect(toneColor(1)).toBe('rgb(255,183,197)');
  });
});
