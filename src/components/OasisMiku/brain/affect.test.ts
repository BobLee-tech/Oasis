import { describe, expect, it } from 'vitest';
import { Affect, faceFor, particleForFeel, rhythmGain, timeTarget, type AffectInput } from './affect';

const run = (affect: Affect, input: AffectInput, seconds: number, dt = 1 / 30) => {
  const trace: number[] = [];
  for (let t = 0; t < seconds; t += dt) {
    affect.step(dt, input);
    trace.push(affect.m.v);
  }
  return trace;
};

describe('timeTarget', () => {
  it('唤醒度凌晨 3 点最低、下午 3 点最高', () => {
    expect(timeTarget(3, false).a).toBeCloseTo(-0.5);
    expect(timeTarget(15, false).a).toBeCloseTo(0.2);
    expect(timeTarget(12, true).v).toBeCloseTo(0.2);
  });
});

describe('Affect 心境动力学', () => {
  const bright: AffectInput = { hour: 15, owner: true, music: { valence: 0.8, arousal: 0.9 }, liveEnergy: 0.9 };
  const sad: AffectInput = { hour: 15, owner: true, music: { valence: -0.7, arousal: 0.2 }, liveEnergy: 0.1 };

  it('换一首不同心境的歌，约一分钟内平滑转向（走完 ≥ 75%）', () => {
    const affect = new Affect({ v: 0.6, a: 0.4 });
    run(affect, bright, 300);
    const start = affect.m.v;
    const goal = affect.target(sad).v;
    run(affect, sad, 60);
    expect((start - affect.m.v) / (start - goal)).toBeGreaterThan(0.75);
  });

  it('单调收敛、不振荡（一阶系统，没有过冲）', () => {
    const affect = new Affect({ v: 0.6, a: 0.4 });
    const trace = run(affect, sad, 200);
    for (let i = 1; i < trace.length; i++) expect(trace[i]).toBeLessThanOrEqual(trace[i - 1] + 1e-12);
    expect(Math.abs(affect.m.v - affect.target(sad).v)).toBeLessThan(0.01);
  });

  it('与帧率无关：30fps 与 120fps 跑同样时长，结果一致', () => {
    const a = new Affect({ v: 0.5, a: 0 });
    const b = new Affect({ v: 0.5, a: 0 });
    run(a, sad, 30, 1 / 30);
    run(b, sad, 30, 1 / 120);
    expect(Math.abs(a.m.v - b.m.v)).toBeLessThan(1e-3);
  });

  it('交互冲量推一下之后被拉回目标；正向冲量按温暖度放大', () => {
    const owner = new Affect({ v: 0, a: 0 });
    owner.step(0, { ...sad, owner: true });
    owner.nudge(0.1);
    const visitor = new Affect({ v: 0, a: 0 });
    visitor.step(0, { ...sad, owner: false });
    visitor.nudge(0.1);
    expect(owner.m.v).toBeGreaterThan(visitor.m.v);
  });
});

describe('情绪', () => {
  it('按半衰期消退，最终清空', () => {
    const affect = new Affect();
    affect.feel('shy', 1);
    run(affect, { hour: 15, owner: false, music: null, liveEnergy: 0 }, 8);
    expect(affect.emotion?.intensity).toBeCloseTo(0.5, 1);
    run(affect, { hour: 15, owner: false, music: null, liveEnergy: 0 }, 60);
    expect(affect.emotion).toBeNull();
  });

  it('弱的新情绪顶不掉强的旧情绪（轻拍不打断吃痛）', () => {
    const affect = new Affect();
    affect.feel('pained', 1);
    affect.feel('shy', 0.4);
    expect(affect.emotion?.kind).toBe('pained');
    affect.feel('shy', 0.9);
    expect(affect.emotion?.kind).toBe('shy');
  });
});

describe('出口映射', () => {
  it('脸：明亮时眼笑更深，低落激活时皱眉', () => {
    expect(faceFor({ v: 0.8, a: 0.5 }, null).eyeSmile).toBeGreaterThan(faceFor({ v: -0.8, a: 0.5 }, null).eyeSmile);
    expect(faceFor({ v: -0.8, a: 0.8 }, null).browAngle).toBeLessThan(0);
  });
  it('脸：情绪满强度时盖过心境底色', () => {
    expect(faceFor({ v: -1, a: -1 }, { kind: 'shy', intensity: 1 }).cheek).toBeCloseTo(0.65);
  });
  it('脸：深夜低唤醒眼皮略沉', () => {
    expect(faceFor({ v: 0, a: -0.8 }, null).eyeOpen).toBeLessThan(0.9);
    expect(faceFor({ v: 0, a: 0.5 }, null).eyeOpen).toBe(1);
  });
  it('律动：副歌放大、低唤醒收小', () => {
    expect(rhythmGain(0.5, true, 1)).toBeCloseTo(rhythmGain(0.5, false, 1) * 1.4);
    expect(rhythmGain(0, false, 0)).toBeCloseTo(0.3);
  });
  it('粒子：随 feel 换种类', () => {
    expect(particleForFeel('sad', false)).toBe('motes-down');
    expect(particleForFeel('joyful', false)).toBe('notes');
    expect(particleForFeel('tense', true)).toBe('sparks');
  });
});
