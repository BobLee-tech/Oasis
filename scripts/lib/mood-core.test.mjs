import { describe, expect, it } from 'vitest';
import {
  addFeels, arcAt, blendOf, checkMood, dominantFeel, feelsOfLayer, isSplit, nearestFeel, normalizeArc, normalizeFeels, normalizeImagery,
  overallValenceOfLayer,
} from './mood-core.mjs';
import { mergeProfile } from './profile-merge.mjs';

describe('feels', () => {
  it('洗掉未知维与 0，强度取整钳到 0..3', () => {
    expect(normalizeFeels({ sad: 2.4, tender: 7, joyful: 0, angry: 2, wonder: -1 })).toEqual({ sad: 2, tender: 3 });
    expect(normalizeFeels({})).toBeUndefined();
    expect(normalizeFeels(['sad'])).toBeUndefined();
  });

  it('旧档案的单个 feel 读作强度 3；同时写了 feels 以 feels 为准', () => {
    expect(feelsOfLayer({ feel: 'nostalgic' })).toEqual({ nostalgic: 3 });
    expect(feelsOfLayer({ feel: 'nostalgic', feels: { defiant: 2 } })).toEqual({ defiant: 2 });
    expect(feelsOfLayer({ feel: 'grumpy' })).toBeUndefined();
  });

  it('最强的一维；并列取维度表里靠前的', () => {
    expect(dominantFeel({ sad: 1, defiant: 3 })).toBe('defiant');
    expect(dominantFeel({ defiant: 2, nostalgic: 2 })).toBe('nostalgic');
    expect(dominantFeel(undefined)).toBeUndefined();
  });
});

describe('blendOf', () => {
  it('两维都 ≥ 2 才成立', () => {
    expect(blendOf({ sad: 2, tender: 2 })).toBe('setsunai');
    expect(blendOf({ sad: 3, tender: 1 })).toBeUndefined();
  });
  it('多个成立时取强度和最大的', () => {
    expect(blendOf({ sad: 2, tender: 2, peaceful: 3 })).toBe('release');
    expect(blendOf({ tense: 3, defiant: 3, power: 2 })).toBe('smolder');
  });
});

describe('效价', () => {
  it('只写了词 / 曲时整体取平均；写了 valence 用它', () => {
    expect(overallValenceOfLayer({ lyricValence: -0.6, soundValence: 0.4 })).toBeCloseTo(-0.1);
    expect(overallValenceOfLayer({ valence: -0.3, lyricValence: -0.6 })).toBe(-0.3);
    expect(overallValenceOfLayer({})).toBeUndefined();
  });
  it('词曲差 ≥ 0.6 即反差（方向不论）', () => {
    expect(isSplit(-0.6, 0.4)).toBe(true);
    expect(isSplit(0.3, -0.3)).toBe(true);
    expect(isSplit(-0.2, 0.3)).toBe(false);
    expect(isSplit(undefined, 0.5)).toBe(false);
  });
});

describe('nearestFeel', () => {
  it('很燃的歌猜成「燃」，不再落到紧绷', () => {
    expect(nearestFeel(0.15, 0.9)).toBe('power');
  });
  it('空灵、不甘不参与猜测（VA 分不开，必须人标）', () => {
    for (let v = -1; v <= 1; v += 0.1) {
      for (let a = 0; a <= 1; a += 0.1) expect(['transcendence', 'defiant']).not.toContain(nearestFeel(v, a));
    }
  });
});

describe('arc / imagery', () => {
  it('段落标签必须合法；只留有内容的步', () => {
    expect(normalizeArc([
      { at: 'chorus', feels: { power: 2 }, da: 0.3 },
      { at: 'chorus#2', dv: 2 },
      { at: 'drop', da: 0.5 },
      { at: 'outro' },
    ])).toEqual([{ at: 'chorus', feels: { power: 2 }, da: 0.3 }, { at: 'chorus#2', dv: 1 }]);
  });
  it('意象只收有消费者的，去重并按表序', () => {
    expect(normalizeImagery(['letter', 'rain', 'tobacco', 'rain'])).toEqual(['rain', 'letter']);
  });
});

describe('checkMood', () => {
  it('拦下越界与未知值；felt 不许进档案', () => {
    const { problems } = checkMood({
      feels: { sad: 4, angry: 1 }, lyricValence: 2, imagery: ['tobacco'], arc: [{ at: 'drop' }], felt: { peaceful: 2 },
    }, 'x');
    expect(problems.join('\n')).toMatch(/feels\.sad/);
    expect(problems.join('\n')).toMatch(/未知维「angry」/);
    expect(problems.join('\n')).toMatch(/lyricValence/);
    expect(problems.join('\n')).toMatch(/未知意象/);
    expect(problems.join('\n')).toMatch(/arc\[0\]\.at/);
    expect(problems.join('\n')).toMatch(/felt/);
  });
  it('超过 3 维非零只警告', () => {
    const { problems, warnings } = checkMood({ feels: { sad: 1, tender: 1, nostalgic: 1, peaceful: 1 } }, 'x');
    expect(problems).toEqual([]);
    expect(warnings).toHaveLength(1);
  });
});

describe('mergeProfile 的情绪层', () => {
  const merge = (mood, albumMood, auto = { arousal: 0.4 }) =>
    mergeProfile({ id: 't', mood }, undefined, albumMood ? { slug: 'a', moodDefaults: albumMood } : null, auto);

  it('人标的 feels 整层替换专辑的；feel 由 feels 派生并沿用出处', () => {
    const out = merge({ feels: { defiant: 3, sad: 1 } }, { feel: 'nostalgic', valence: -0.2 });
    expect(out.mood.feels).toEqual({ defiant: 3, sad: 1 });
    expect(out.mood.feel).toBe('defiant');
    expect(out.provenance['mood.feel']).toBe('manual');
    expect(out.mood.valence).toBe(-0.2);
    expect(out.provenance['mood.valence']).toBe('album');
  });

  it('旧的单个 feel 照旧可用', () => {
    const out = merge({ feel: 'nostalgic', valence: -0.1 });
    expect(out.mood.feels).toEqual({ nostalgic: 3 });
    expect(out.mood.feel).toBe('nostalgic');
  });

  it('只写词 / 曲时整体效价取平均，出处是人标', () => {
    const out = merge({ lyricValence: -0.6, soundValence: 0.4 }, { valence: 0.5 });
    expect(out.mood.valence).toBeCloseTo(-0.1);
    expect(out.provenance['mood.valence']).toBe('manual');
    expect(out.mood.lyricValence).toBe(-0.6);
  });

  it('没有情绪向量时按 VA 猜（arousal 是 0..1）', () => {
    const out = merge({ valence: 0.15 }, null, { arousal: 0.9 });
    expect(out.mood.feel).toBe('power');
    expect(out.provenance['mood.feel']).toBe('va');
    expect(out.mood.feels).toBeUndefined();
  });

  it('arc / imagery / sure 透传；sure 只在 false 时写', () => {
    const out = merge({ feels: { sad: 2 }, arc: [{ at: 'outro', dv: 0.2 }], imagery: ['rain'], sure: false });
    expect(out.mood.arc).toEqual([{ at: 'outro', dv: 0.2 }]);
    expect(out.mood.imagery).toEqual(['rain']);
    expect(out.mood.sure).toBe(false);
    expect(merge({ feels: { sad: 2 }, sure: true }).mood.sure).toBeUndefined();
  });
});

describe('arcAt', () => {
  const arc = [{ at: 'chorus', feels: { power: 2 }, da: 0.3 }, { at: 'chorus#2', feels: { power: 2 }, dv: 0.2 }, { at: 'outro', dv: 0.1 }];
  it('不带序号的对每次都生效，带序号的只对那一次，命中的叠加', () => {
    expect(arcAt(arc, 'chorus', 1)).toEqual({ feels: { power: 2 }, dv: 0, da: 0.3 });
    expect(arcAt(arc, 'chorus', 2)).toEqual({ feels: { power: 3 }, dv: 0.2, da: 0.3 });
    expect(arcAt(arc, 'verse', 1)).toBeNull();
    expect(arcAt(undefined, 'chorus', 1)).toBeNull();
  });
  it('addFeels 逐维相加、钳到 3', () => {
    expect(addFeels({ sad: 2 }, { sad: 2, peaceful: 1 })).toEqual({ sad: 3, peaceful: 1 });
    expect(addFeels(undefined, { joyful: 1 })).toEqual({ joyful: 1 });
  });
});
