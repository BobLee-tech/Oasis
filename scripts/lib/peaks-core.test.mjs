import { describe, expect, it } from 'vitest';
import { PEAK_COUNT, PEAK_RANGE_DB, decodePeaks, encodePeaks, peaksOf } from './peaks-core.mjs';

const tone = (seconds, amplitude, sampleRate = 1000) =>
  Float32Array.from({ length: seconds * sampleRate }, (_, i) => amplitude * Math.sin(i * 0.3));

describe('peaksOf', () => {
  it('固定 96 段，最响的一段是 1', () => {
    const peaks = peaksOf(tone(10, 0.5));
    expect(peaks).toHaveLength(PEAK_COUNT);
    expect(Math.max(...peaks)).toBe(1);
  });

  it('前半轻后半响：轻的一半矮，差 20dB 就矮 20/24', () => {
    const pcm = new Float32Array(9_600);
    pcm.set(tone(4.8, 0.05).subarray(0, 4_800), 0);
    pcm.set(tone(4.8, 0.5).subarray(0, 4_800), 4_800);
    const peaks = peaksOf(pcm);
    expect(peaks[10]).toBeCloseTo(1 - 20 / PEAK_RANGE_DB, 1);
    expect(peaks[80]).toBeCloseTo(1, 1);
  });

  it('静音段是 0；整首静音全是 0，不出 NaN', () => {
    const pcm = new Float32Array(9_600);
    pcm.set(tone(4.8, 0.5).subarray(0, 4_800), 4_800);
    expect(peaksOf(pcm)[5]).toBe(0);
    expect(peaksOf(new Float32Array(9_600)).every(value => value === 0)).toBe(true);
  });

  it('比量程更静的段落记 0，不会是负数', () => {
    const pcm = new Float32Array(9_600);
    pcm.set(tone(4.8, 0.0005).subarray(0, 4_800), 0);
    pcm.set(tone(4.8, 0.5).subarray(0, 4_800), 4_800);
    expect(peaksOf(pcm)[10]).toBe(0);
  });
});

describe('encodePeaks / decodePeaks', () => {
  it('一值一字符，往返误差不超过半级', () => {
    const values = Array.from({ length: PEAK_COUNT }, (_, i) => i / (PEAK_COUNT - 1));
    const text = encodePeaks(values);
    expect(text).toHaveLength(PEAK_COUNT);
    decodePeaks(text).forEach((value, i) => expect(Math.abs(value - values[i])).toBeLessThanOrEqual(0.5 / 63 + 1e-9));
  });

  it('越界值被夹到 0–1，认不出的字符当 0', () => {
    expect(decodePeaks(encodePeaks([-1, 2]))).toEqual([0, 1]);
    expect(decodePeaks('?')).toEqual([0]);
  });
});
