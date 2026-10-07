import { describe, expect, it } from 'vitest';
import {
  analyzeSpectrum, arousalFromRaw, chorusFromEnergy, chorusFromLyrics, estimateBpm, fitArousalWeights,
  onsetRate, percentileRanks, seasonOf, spearman, timeOf,
} from './track-features.mjs';

const SR = 11025;

/** 合成一段「每拍一下」的打击声：短促的噪声包络叠在安静的正弦底上。 */
const clicks = (bpm, seconds, { offbeat = false } = {}) => {
  const pcm = new Float32Array(SR * seconds);
  let seed = 7;
  const noise = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (let i = 0; i < pcm.length; i++) pcm[i] = 0.02 * Math.sin((2 * Math.PI * 220 * i) / SR);
  const beat = (60 / bpm) * SR;
  const hit = (at, gain) => {
    for (let k = 0; k < 600 && at + k < pcm.length; k++) pcm[at + k] += gain * noise() * Math.exp(-k / 120);
  };
  for (let t = 0; t < pcm.length; t += beat) {
    hit(Math.round(t), 0.9);
    if (offbeat) hit(Math.round(t + beat / 2), 0.35);
  }
  return pcm;
};

describe('percentileRanks', () => {
  it('最小 0、最大 1，并列取平均名次', () => {
    expect(percentileRanks([3, 1, 2])).toEqual([1, 0, 0.5]);
    expect(percentileRanks([5, 5, 1])).toEqual([0.75, 0.75, 0]);
  });
});

describe('estimateBpm', () => {
  for (const bpm of [72, 96, 128, 150]) {
    it(`合成鼓点 ${bpm} BPM 估计误差 < 3%`, () => {
      const { flux, hopSec } = analyzeSpectrum(clicks(bpm, 30), SR);
      const got = estimateBpm(flux, hopSec);
      expect(Math.abs(got - bpm) / bpm).toBeLessThan(0.03);
    });
  }

  it('带反拍的 85 BPM 不会被翻倍成 170（先验 + 倍频纠错）', () => {
    const { flux, hopSec } = analyzeSpectrum(clicks(85, 30, { offbeat: true }), SR);
    const got = estimateBpm(flux, hopSec);
    expect(Math.abs(got - 85) / 85).toBeLessThan(0.03);
  });
});

describe('onsetRate', () => {
  it('鼓点越密，起音密度越高', () => {
    const slow = analyzeSpectrum(clicks(70, 20), SR);
    const fast = analyzeSpectrum(clicks(140, 20), SR);
    expect(onsetRate(fast.flux, fast.hopSec)).toBeGreaterThan(onsetRate(slow.flux, slow.hopSec) * 1.5);
  });
});

describe('chorusFromLyrics', () => {
  const line = (t, text) => ({ startMs: t * 1000, endMs: t * 1000 + 4000, ja: text });
  it('找到出现最多 × 最长的重复块，返回每次出现的起止', () => {
    const lines = [
      line(0, 'A1'), line(4, 'A2'),
      line(8, 'サビ1'), line(12, 'サビ2'), line(16, 'サビ3'),
      line(20, 'B1'),
      line(24, 'サビ1'), line(28, 'サビ2'), line(32, 'サビ3'),
      line(36, 'C'),
      line(40, 'サビ1！'), line(44, 'サビ2'), line(48, 'サビ3'),
    ];
    // 第三次的「サビ1！」带标点，归一化后仍算同一行
    expect(chorusFromLyrics(lines)).toEqual([[8000, 20000], [24000, 36000], [40000, 52000]]);
  });

  it('只有单行重复不算副歌', () => {
    expect(chorusFromLyrics([line(0, 'あ'), line(4, 'い'), line(8, 'あ'), line(12, 'う')])).toBeNull();
  });
});

describe('chorusFromEnergy', () => {
  it('取高能量且持续 ≥ 8s 的段', () => {
    const hop = 0.05;
    const rms = new Float64Array(Math.round(120 / hop)).map((_, i) => {
      const t = i * hop;
      return (t > 30 && t < 50) || (t > 80 && t < 100) ? 1 : 0.2;
    });
    const sections = chorusFromEnergy(rms, hop);
    expect(sections).toHaveLength(2);
    expect(Math.abs(sections[0][0] - 30000)).toBeLessThan(3000);
    expect(Math.abs(sections[1][1] - 100000)).toBeLessThan(3000);
  });
});

describe('seasonOf / timeOf', () => {
  it('歌题命中权重 3：「夏草」+ 一处歌词即可判夏', () => {
    expect(seasonOf('夏草が邪魔をする', '花火の音').season).toBe('summer');
  });
  it('证据不足或四季混杂时不标', () => {
    expect(seasonOf('言って。', '君の匂い').season).toBeNull();
    expect(seasonOf('', '春 夏 秋 冬').season).toBeNull();
  });
  it('夜明け 归早晨，不算夜', () => {
    expect(timeOf('夜明けと蛍', '朝が来る', 0.5).time).toBe('morning');
  });
  it('低唤醒给夜加一分', () => {
    expect(timeOf('', '夜 星', 0.2).time).toBe('night');
    expect(timeOf('', '夜 星', 0.6).time).toBeNull();
  });
});

describe('arousal 与校准', () => {
  const raws = Array.from({ length: 12 }, (_, i) => ({ lufs: -20 + i, onsetRate: (i * 7) % 12, centroid: 1000 + ((i * 5) % 12) * 50, bpm: 80 + i * 5, lra: 12 - i }));
  it('arousal 在 [0,1]，响度最高的一首 arousal 不低于响度最低的一首', () => {
    const out = arousalFromRaw(raws);
    expect(out.every(o => o.arousal >= 0 && o.arousal <= 1)).toBe(true);
    expect(out[11].arousal).toBeGreaterThan(out[0].arousal);
    expect(out[0].contrast).toBe(1);
  });
  it('校准能从人标里找回生成它的权重', () => {
    const out = arousalFromRaw(raws);
    const truth = { loudness: 0.1, onsets: 0.5, centroid: 0.1, tempo: 0.3 };
    const targets = out.map(o => Object.entries(truth).reduce((s, [k, w]) => s + w * o.percentiles[k], 0));
    const fitted = fitArousalWeights(out.map(o => o.percentiles), targets);
    const pred = out.map(o => Object.entries(fitted).reduce((s, [k, w]) => s + w * o.percentiles[k], 0));
    expect(spearman(pred, targets)).toBeGreaterThan(0.95);
  });
});
