import { describe, expect, it } from 'vitest';
import { COMFORT_STREAK, RESONANCE_COMFORT, RESONANCE_DEFAULT, SessionListening, isLow, type TrackPass } from './resonance';

const sad: TrackPass = { feels: { sad: 3, tender: 1 }, ratio: 1, skipped: false };
const bright: TrackPass = { feels: { joyful: 3 }, ratio: 1, skipped: false };
const late = { owner: true, lateNight: true };

describe('共鸣系数 r（§3.5）', () => {
  it('缺省 0.65；访客永远 0.65，不管听了什么', () => {
    const s = new SessionListening();
    expect(s.resonance(late)).toEqual({ r: RESONANCE_DEFAULT, comfort: false });
    for (let i = 0; i < 5; i += 1) s.record(sad);
    expect(s.resonance({ owner: false, lateNight: true })).toEqual({ r: RESONANCE_DEFAULT, comfort: false });
  });

  it('站主深夜连续听完 3 首低落的歌：r → 0.35 并陪着；白天不触发', () => {
    const s = new SessionListening();
    for (let i = 0; i < COMFORT_STREAK - 1; i += 1) s.record(sad);
    expect(s.resonance(late).comfort).toBe(false);
    s.record({ feels: { defiant: 2 }, ratio: 0.9, skipped: false });
    expect(s.resonance(late)).toEqual({ r: RESONANCE_COMFORT, comfort: true });
    expect(s.resonance({ owner: true, lateNight: false }).comfort).toBe(false);
  });

  it('听完一首亮的、或跳过一首，连续就断了', () => {
    const s = new SessionListening();
    for (let i = 0; i < 3; i += 1) s.record(sad);
    s.record(bright);
    expect(s.resonance(late).comfort).toBe(false);
    for (let i = 0; i < 3; i += 1) s.record(sad);
    s.record({ feels: { peaceful: 2 }, ratio: 0.1, skipped: true });
    expect(s.lowStreak).toBe(0);
  });

  it('没听完也没跳过（≥30s 但不到八成）：不加也不断', () => {
    const s = new SessionListening();
    s.record(sad);
    s.record({ ...sad, ratio: 0.5 });
    expect(s.lowStreak).toBe(1);
  });

  it('跳过低落的歌：本会话 r 每次 −0.1，最低 0.35；跳过亮的歌不扣', () => {
    const s = new SessionListening();
    s.record({ ...bright, skipped: true, ratio: 0.05 });
    expect(s.resonance(late).r).toBeCloseTo(RESONANCE_DEFAULT);
    s.record({ ...sad, skipped: true, ratio: 0.05 });
    expect(s.resonance({ owner: true, lateNight: false }).r).toBeCloseTo(0.55);
    for (let i = 0; i < 5; i += 1) s.record({ ...sad, skipped: true, ratio: 0.05 });
    expect(s.resonance({ owner: true, lateNight: false }).r).toBeCloseTo(RESONANCE_COMFORT);
  });

  it('felt 优先于 feels：他说这首让他平静，它就不算往下拽', () => {
    const s = new SessionListening();
    for (let i = 0; i < 3; i += 1) s.record({ ...sad, felt: { peaceful: 3 } });
    expect(s.lowStreak).toBe(0);
    expect(s.sessionLean).toBe('peaceful');
    const t = new SessionListening();
    for (let i = 0; i < 3; i += 1) t.record({ ...bright, felt: { sad: 2 } });
    expect(t.lowStreak).toBe(3);
  });
});

describe('听歌倾向（§3.8）', () => {
  it('一首不够；连着两三首同一类才有倾向，并随后来的歌转向', () => {
    const s = new SessionListening();
    s.record(sad);
    expect(s.sessionLean).toBeUndefined();
    s.record(sad);
    s.record(sad);
    expect(s.sessionLean).toBe('sad');
    for (let i = 0; i < 4; i += 1) s.record(bright);
    expect(s.sessionLean).toBe('joyful');
  });

  it('跳过的歌按 −0.5 计入：一直跳过哀伤的，倾向不会是哀伤', () => {
    const s = new SessionListening();
    for (let i = 0; i < 3; i += 1) s.record(sad);
    for (let i = 0; i < 3; i += 1) s.record({ ...sad, skipped: true, ratio: 0.05 });
    expect(s.lean.sad).toBeLessThan(0.5);
    expect(s.sessionLean).toBeUndefined();
  });

  it('没写情绪的歌不进倾向（但听完仍会断开低落连听）', () => {
    const s = new SessionListening();
    for (let i = 0; i < 3; i += 1) s.record(sad);
    const before = s.lean.sad;
    s.record({ ratio: 1, skipped: false });
    expect(s.lean.sad).toBe(before);
    expect(s.lowStreak).toBe(0);
  });

  it('快照与恢复：刷新页面后接着算；坏数据被钳住', () => {
    const s = new SessionListening();
    for (let i = 0; i < 3; i += 1) s.record(sad);
    s.record({ ...sad, skipped: true, ratio: 0 });
    const t = new SessionListening();
    t.restore(JSON.parse(JSON.stringify(s.snapshot())));
    expect(t.sessionLean).toBe(s.sessionLean);
    expect(t.skipPenalty).toBeCloseTo(s.skipPenalty);
    const bad = new SessionListening();
    bad.restore({ lean: { sad: 9 }, lowStreak: -2, skipPenalty: 4 } as never);
    expect(bad.lean.sad).toBe(1);
    expect(bad.lowStreak).toBe(0);
    expect(bad.resonance(late).r).toBeCloseTo(RESONANCE_COMFORT);
  });

  it('isLow：哀伤或不甘 ≥ 2', () => {
    expect(isLow({ sad: 2 })).toBe(true);
    expect(isLow({ defiant: 2 })).toBe(true);
    expect(isLow({ sad: 1, tense: 3 })).toBe(false);
    expect(isLow(undefined)).toBe(false);
  });
});
