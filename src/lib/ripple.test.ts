import { describe, expect, it } from 'vitest';
import { RIPPLE, advance, easeClose, easeOpen, pushOf, reachOf, retarget, revealOf, waveAmplitude } from './ripple';

describe('ripple', () => {
  it('缓动两端落在 0 与 1', () => {
    for (const ease of [easeOpen, easeClose]) {
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
      expect(ease(-1)).toBe(0);
      expect(ease(2)).toBe(1);
    }
  });

  it('波要走到最远的角', () => {
    const reach = reachOf(100, 200, 1000, 600);
    expect(reach).toBeGreaterThan(Math.hypot(900, 400));
  });

  it('内容只在波前越过之后才浮出，且单调', () => {
    expect(revealOf(100, 300)).toBe(0);
    expect(revealOf(300 + RIPPLE.clipLag + RIPPLE.contentWindow, 300)).toBe(1);
    let last = -1;
    for (let r = 0; r < 800; r += 10) {
      const value = revealOf(r, 300);
      expect(value).toBeGreaterThanOrEqual(last);
      last = value;
    }
  });

  it('推开只在波前附近', () => {
    expect(pushOf(270, 300)).toBeCloseTo(1);
    expect(pushOf(0, 600)).toBeLessThan(1e-6);
  });

  it('振幅随半径衰减，展开末尾归零', () => {
    expect(waveAmplitude(400, 0.3, true)).toBeLessThan(waveAmplitude(50, 0.3, true));
    expect(waveAmplitude(900, 1, true)).toBe(0);
    expect(waveAmplitude(0, 0, false)).toBe(0);
  });

  it('中途折返从当前进度出发，不跳帧', () => {
    let motion = retarget({ p: 0, from: 0, to: 0, startedAt: 0, durationMs: 1 }, true, 0);
    const mid = advance(motion, RIPPLE.openMs / 2);
    expect(mid.done).toBe(false);
    motion = retarget({ ...motion, p: mid.p }, false, 500);
    expect(advance(motion, 500).p).toBeCloseTo(mid.p);
    const end = advance(motion, 500 + motion.durationMs);
    expect(end.done).toBe(true);
    expect(end.p).toBe(0);
    expect(motion.durationMs).toBeLessThan(RIPPLE.closeMs);
  });
});
