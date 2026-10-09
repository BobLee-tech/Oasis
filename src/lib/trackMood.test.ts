import { describe, expect, it } from 'vitest';
import { chorusState, moodNow, nearestFeel, resolveTrackMood, segmentAt, type Segment } from './trackMood';

describe('resolveTrackMood', () => {
  it('人标 > 网易云 > 自动 > 专辑，逐字段记出处', () => {
    const m = resolveTrackMood({
      manual: { valence: -0.5 },
      album: { valence: 0.6, feel: 'joyful', arousal: 0.9 },
      auto: { arousal: 0.3, contrast: 0.7, bpm: 160, bpmNetease: 80, sections: [[1000, 9000]] },
    });
    expect(m.valence).toBe(-0.5);
    expect(m.provenance.valence).toBe('manual');
    expect(m.arousal).toBe(0.3);
    expect(m.provenance.arousal).toBe('auto');
    expect(m.bpm).toBe(80);
    expect(m.provenance.bpm).toBe('netease');
    // 专辑写了 feel：人标没写 feel 时用专辑的，而不是用人标效价去推
    expect(m.feel).toBe('joyful');
    expect(m.provenance.feel).toBe('album');
  });

  it('feel 缺省时取 VA 最近邻；效价也缺省时出处标 default', () => {
    const guessed = resolveTrackMood({ auto: { arousal: 0.2, contrast: 0.5 } });
    expect(guessed.provenance.valence).toBe('default');
    // 没标注的燃歌不该被猜成「紧绷」
    expect(resolveTrackMood({ auto: { arousal: 0.75, contrast: 0.5 } }).feel).toBe('wonder');
    expect(guessed.feel).toBe('peaceful');
    expect(guessed.provenance.feel).toBe('default');
    const derived = resolveTrackMood({ manual: { valence: -0.6 }, auto: { arousal: 0.25, contrast: 0.5 } });
    expect(derived.feel).toBe('sad');
    expect(derived.provenance.feel).toBe('va');
  });

  it('什么都没有时给出可用的缺省值', () => {
    const m = resolveTrackMood({});
    expect(m.arousal).toBeGreaterThan(0);
    expect(m.sections).toEqual([]);
    expect(m.provenance.sections).toBe('default');
  });

  it('越界的人标被钳回量程', () => {
    expect(resolveTrackMood({ manual: { valence: 3, arousal: -1 } })).toMatchObject({ valence: 1, arousal: 0 });
  });
});

describe('resolveTrackMood · 多维情绪', () => {
  it('feels 派生 feel 与复合情绪；人标整层替换专辑', () => {
    const m = resolveTrackMood({ manual: { feels: { sad: 2, tender: 3 } }, album: { feel: 'joyful' } });
    expect(m.feels).toEqual({ sad: 2, tender: 3 });
    expect(m.feel).toBe('tender');
    expect(m.provenance.feel).toBe('manual');
    expect(m.blend).toBe('setsunai');
  });

  it('旧的单个 feel 读作强度 3', () => {
    expect(resolveTrackMood({ album: { feel: 'nostalgic' } }).feels).toEqual({ nostalgic: 3 });
  });

  it('没标注时 feels 是 VA 猜的单维，且不给复合情绪', () => {
    const m = resolveTrackMood({ auto: { arousal: 0.2, contrast: 0.5 } });
    expect(m.feels).toEqual({ [m.feel]: 2 });
    expect(m.provenance.feels).toBe('default');
    expect(m.blend).toBeUndefined();
  });

  it('词曲分量：不写等于整体；写了且差 ≥ 0.6 即反差', () => {
    const plain = resolveTrackMood({ manual: { valence: -0.3 } });
    expect(plain).toMatchObject({ lyricValence: -0.3, soundValence: -0.3, split: false });
    const split = resolveTrackMood({ manual: { lyricValence: -0.6, soundValence: 0.4 } });
    expect(split.valence).toBeCloseTo(-0.1);
    expect(split.split).toBe(true);
  });

  it('arc / imagery 洗过再用；sure 缺省为 true', () => {
    const m = resolveTrackMood({ manual: { arc: [{ at: 'chorus', da: 0.3 }, { at: 'drop', da: 1 }], imagery: ['rain'] } });
    expect(m.arc).toEqual([{ at: 'chorus', da: 0.3 }]);
    expect(m.imagery).toEqual(['rain']);
    expect(m.sure).toBe(true);
    expect(resolveTrackMood({ manual: { sure: false } }).sure).toBe(false);
  });
});

describe('nearestFeel', () => {
  it('四个象限各落到对应的感受', () => {
    expect(nearestFeel(0.7, 0.8)).toBe('joyful');
    expect(nearestFeel(-0.4, 0.8)).toBe('tense');
    expect(nearestFeel(0.3, 0.2)).toBe('peaceful');
    expect(nearestFeel(-0.6, 0.3)).toBe('sad');
  });
});

describe('chorusState', () => {
  const s: [number, number][] = [[10000, 20000], [40000, 50000]];
  it('副歌内 / 预备 / 之外', () => {
    expect(chorusState(s, 15000)).toBe('in');
    expect(chorusState(s, 9000)).toBe('soon');
    expect(chorusState(s, 30000)).toBeNull();
    expect(chorusState(s, 20000)).toBeNull();
  });
});

describe('段落与弧线（P3）', () => {
  const segments: Segment[] = [['intro', 0, 10000], ['verse', 10000, 30000], ['chorus', 30000, 50000], ['verse', 50000, 70000], ['chorus', 70000, 90000], ['outro', 90000, 100000]];

  it('此刻在哪一段、是同标签的第几次', () => {
    expect(segmentAt(segments, 5000)).toEqual({ at: 'intro', n: 1, index: 0 });
    expect(segmentAt(segments, 75000)).toEqual({ at: 'chorus', n: 2, index: 4 });
    expect(segmentAt(segments, 100000)).toBeNull();
    expect(segmentAt([], 0)).toBeNull();
  });

  it('自动意象与段落从自动层来；人标意象优先', () => {
    const auto = { arousal: 0.5, contrast: 0.5, imagery: 'rain' as const, segments };
    expect(resolveTrackMood({ auto }).imagery).toEqual(['rain']);
    expect(resolveTrackMood({ auto }).provenance.imagery).toBe('auto');
    expect(resolveTrackMood({ auto, manual: { imagery: ['sea'] } }).imagery).toEqual(['sea']);
    // 人标空数组：这首没有意象，自动的不算
    expect(resolveTrackMood({ auto, manual: { imagery: [] } }).imagery).toEqual([]);
    expect(resolveTrackMood({ auto }).segments).toHaveLength(6);
  });

  it('弧线：chorus 对每次副歌生效，chorus#2 只对第二次，两条叠加；feels 逐维相加钳到 3', () => {
    const mood = resolveTrackMood({
      auto: { arousal: 0.5, contrast: 0.5, segments },
      manual: {
        feels: { sad: 2, power: 2 }, lyricValence: -0.5, soundValence: 0.3,
        arc: [{ at: 'chorus', feels: { power: 2 }, da: 0.2 }, { at: 'chorus#2', dv: 0.2 }, { at: 'outro', feels: { peaceful: 2 } }],
      },
    });
    const verse = moodNow(mood, segmentAt(mood.segments, 20000));
    expect(verse).toMatchObject({ faceValence: -0.5, soundValence: 0.3, arousal: 0.5, arc: null });
    expect(verse.feels).toEqual({ sad: 2, power: 2 });
    const first = moodNow(mood, segmentAt(mood.segments, 40000));
    expect(first.feels).toEqual({ sad: 2, power: 3 });
    expect(first.arousal).toBeCloseTo(0.7);
    expect(first.faceValence).toBeCloseTo(-0.5);
    const second = moodNow(mood, segmentAt(mood.segments, 80000));
    expect(second.faceValence).toBeCloseTo(-0.3);
    expect(second.soundValence).toBeCloseTo(0.5);
    expect(moodNow(mood, segmentAt(mood.segments, 95000)).feels).toEqual({ sad: 2, power: 2, peaceful: 2 });
  });
});
