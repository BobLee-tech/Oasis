import { describe, expect, it } from 'vitest';
import { chorusState, nearestFeel, resolveTrackMood } from './trackMood';

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
