import { describe, expect, it } from 'vitest';
import {
  ARC_TURN_MIN, Affect, beatNodAffinity, blendRhythm, faceFor, imageryParticle, particleForFeel, RHYTHM_BY_FEEL, rhythmGain, sampleTone,
  soundLift, timeTarget, toneDistance, toneFaceOffset, toneTarget, type AffectInput,
} from './affect';
import type { Feels } from '../../../lib/trackMood';

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

describe('情绪色调（docs/song-emotion-design.md §3）', () => {
  const play = (feels: Feels): AffectInput =>
    ({ hour: 15, owner: true, music: { valence: 0, arousal: 0.5, feels }, liveEnergy: 0.5 });

  it('不放歌时停在她的底色；放歌后约 25s 走完六成，向歌的强度靠拢', () => {
    const affect = new Affect();
    expect(affect.tone.tender).toBeCloseTo(0.2);
    expect(affect.tone.defiant).toBe(0);
    const input = play({ defiant: 3 });
    const goal = toneTarget({ defiant: 3 }).defiant;
    for (let t = 0; t < 25; t += 1 / 30) affect.step(1 / 30, input);
    expect(affect.tone.defiant / goal).toBeGreaterThan(0.6);
    expect(affect.tone.defiant / goal).toBeLessThan(0.7);
    // 底色被歌稀释，但不清零
    expect(toneTarget({ defiant: 3 }).tender).toBeCloseTo(0.2 * 0.35);
  });

  it('摸头往温柔推一下，钳在 0..1', () => {
    const affect = new Affect();
    affect.nudgeTone('tender', 0.1);
    expect(affect.tone.tender).toBeCloseTo(0.3);
    affect.nudgeTone('tender', 5);
    expect(affect.tone.tender).toBe(1);
  });

  it('哀伤 + 温柔叠出切ない：眼在笑、眉是八字', () => {
    const m = { v: 0, a: 0 };
    const plain = faceFor(m, null, toneTarget(null, 0));
    const setsunai = faceFor(m, null, toneTarget({ sad: 3, tender: 3 }, 1));
    expect(setsunai.eyeSmile).toBeGreaterThan(plain.eyeSmile);
    expect(setsunai.browAngle).toBeGreaterThan(plain.browAngle + 0.1);
    expect(setsunai.mouthForm).toBeLessThan(plain.mouthForm);
  });

  it('偏移叠加后每个参数夹在 ±0.25', () => {
    const all = toneTarget({ sad: 3, nostalgic: 3, tender: 3, defiant: 3, power: 3, wonder: 3, tense: 3, transcendence: 3 }, 1);
    const offset = toneFaceOffset(all);
    for (const value of Object.values(offset)) expect(Math.abs(value!)).toBeLessThanOrEqual(0.25);
  });

  it('律动按权重混合：燃 + 空灵各半落在两者之间', () => {
    const style = blendRhythm(toneTarget({ power: 3, transcendence: 3 }, 1))!;
    expect(style.amp).toBeCloseTo((RHYTHM_BY_FEEL.power.amp + RHYTHM_BY_FEEL.transcendence.amp) / 2);
    expect(blendRhythm(toneTarget(null, 0))).toMatchObject({ amp: expect.any(Number) });
  });

  it('粒子按权重抽：怀念 3 + 温柔 2 → 六成怀念、四成温柔', () => {
    const tone = toneTarget({ nostalgic: 3, tender: 2 }, 1);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const feel = sampleTone(tone, (i + 0.5) / 1000)!;
      counts[feel] = (counts[feel] ?? 0) + 1;
    }
    expect(counts.nostalgic).toBe(600);
    expect(counts.tender).toBe(400);
  });

  it('强拍点头只在雀跃 / 奇妙 / 燃占上风时', () => {
    expect(beatNodAffinity(toneTarget({ power: 3, joyful: 2 }, 1))).toBeCloseTo(1);
    expect(beatNodAffinity(toneTarget({ sad: 3 }, 1))).toBe(0);
  });

  it('新三维有各自的粒子', () => {
    expect(particleForFeel('power', false)).toBe('notes');
    expect(particleForFeel('defiant', false)).toBe('sparks');
    expect(particleForFeel('transcendence', false)).toBe('motes-up');
  });
});

describe('段落、词曲分治与意象（P3）', () => {
  it('弧线给副歌加 2 级「燃」就够格算情绪转向；只加 1 级不算', () => {
    const base = toneTarget({ sad: 2 });
    expect(toneDistance(base, toneTarget({ sad: 2, power: 2 }))).toBeGreaterThan(ARC_TURN_MIN);
    expect(toneDistance(base, toneTarget({ sad: 2, power: 1 }))).toBeLessThan(ARC_TURN_MIN);
  });

  it('曲亮词暗：身体增益跟曲走，中性为 1', () => {
    expect(soundLift(0)).toBe(1);
    expect(soundLift(1)).toBeCloseTo(1.15);
    expect(soundLift(-1)).toBeCloseTo(0.85);
  });

  it('心境点只吃词的效价：同一首「曲亮词暗」的歌，脸往低落那边走', () => {
    const affect = new Affect({ v: 0, a: 0 });
    for (let t = 0; t < 120; t += 1 / 30) affect.step(1 / 30, { hour: 15, owner: false, music: { valence: -0.6, arousal: 0.6 }, liveEnergy: 0.6 });
    expect(affect.m.v).toBeLessThan(-0.2);
  });

  it('意象粒子：雨丝、气泡、花瓣、月下萤火、雪；信没有粒子', () => {
    expect(imageryParticle(['rain'])).toBe('rain');
    expect(imageryParticle(['sea'])).toBe('bubbles');
    expect(imageryParticle(['flower'])).toBe('petals');
    expect(imageryParticle(['moon'])).toBe('firefly');
    expect(imageryParticle(['letter'])).toBeNull();
    expect(imageryParticle(['letter', 'snow'])).toBe('snow');
    expect(imageryParticle([])).toBeNull();
  });
});

describe('共鸣系数（P5，§3.5）', () => {
  const sadSong: AffectInput = { hour: 1, owner: true, music: { valence: -0.8, arousal: 0.2, feels: { sad: 3 } }, liveEnergy: 0.1 };

  it('r 决定目标里歌占多少：陪着时心境不跟着沉到底', () => {
    const affect = new Affect();
    const follow = affect.target(sadSong).v;
    const stay = affect.target({ ...sadSong, resonance: { r: 0.35, comfort: true } }).v;
    const base = timeTarget(1, true).v;
    expect(follow).toBeCloseTo(base + (-0.8 - base) * 0.65);
    expect(stay).toBeCloseTo(base + (-0.8 - base) * 0.35);
    expect(stay).toBeGreaterThan(follow);
  });

  it('陪着时情绪色调往温柔靠：温柔 ≥ 0.5，哀伤只到一半出头', () => {
    const follow = new Affect();
    const stay = new Affect();
    for (let t = 0; t < 300; t += 1 / 30) {
      follow.step(1 / 30, sadSong);
      stay.step(1 / 30, { ...sadSong, resonance: { r: 0.35, comfort: true } });
    }
    expect(stay.tone.tender).toBeGreaterThan(0.49);
    expect(follow.tone.tender).toBeLessThan(0.1);
    expect(stay.tone.sad).toBeLessThan(follow.tone.sad);
    expect(toneTarget({ sad: 3 }, 0.35, 0.5).tender).toBe(0.5);
  });
});
