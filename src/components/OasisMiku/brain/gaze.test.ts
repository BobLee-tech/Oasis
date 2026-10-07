import { afterEach, describe, expect, it, vi } from 'vitest';
import { BODY_DEG, GazeController, HEAD_DEG, gazeFromPoint } from './gaze';

afterEach(() => vi.restoreAllMocks());

describe('GazeController', () => {
  it('眼先到、头跟上、身体最慢', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const gaze = new GazeController();
    const first = { eye: -1, head: -1, body: -1 };
    for (let i = 1; i <= 150; i++) {
      const pose = gaze.update(1 / 60, { target: { x: 1, y: 0 }, arousal: 0.5 });
      const eye = pose.ParamEyeBallX!;
      const head = pose.ParamAngleX! / HEAD_DEG;
      const body = pose.ParamBodyAngleX! / BODY_DEG;
      if (first.eye < 0 && eye > 0.9) first.eye = i;
      if (first.head < 0 && head > 0.9) first.head = i;
      if (first.body < 0 && body > 0.9) first.body = i;
    }
    expect(first.eye).toBeGreaterThan(0);
    expect(first.eye).toBeLessThan(first.head);
    expect(first.head).toBeLessThan(first.body);
  });

  it('头到位后眼球回到 1:1，不会一直斜着', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const gaze = new GazeController();
    let pose = {} as ReturnType<GazeController['update']>;
    for (let i = 0; i < 240; i++) pose = gaze.update(1 / 60, { target: { x: 0.5, y: 0 }, arousal: 0 });
    expect(pose.ParamAngleX! / HEAD_DEG).toBeCloseTo(0.5, 2);
    // 只剩微扫视的小偏移
    expect(Math.abs(pose.ParamEyeBallX! - 0.5)).toBeLessThan(0.1);
  });

  it('自主张望比跟随指针慢：同样 200ms，lazy 模式头转过去的比例明显更小', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const quick = new GazeController();
    const lazy = new GazeController();
    let q = 0;
    let l = 0;
    for (let i = 0; i < 12; i++) {
      q = quick.update(1 / 60, { target: { x: 1, y: 0 }, arousal: 0.5 }).ParamAngleX!;
      l = lazy.update(1 / 60, { target: { x: 1, y: 0 }, arousal: 0.5, lazy: true }).ParamAngleX!;
    }
    expect(l).toBeLessThan(q * 0.6);
  });

  it('大幅转移视线会触发眨眼回调', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const gaze = new GazeController();
    const onBigShift = vi.fn();
    gaze.onBigShift = onBigShift;
    gaze.update(1 / 60, { target: { x: -0.8, y: 0 }, arousal: 0.5 });
    expect(onBigShift).toHaveBeenCalledTimes(1);
  });
});

describe('gazeFromPoint', () => {
  const head = { x: 500, y: 300, r: 20 };
  it('指针贴着脸时只是轻轻一瞥，远处才接近满偏', () => {
    const near = gazeFromPoint({ x: 510, y: 300 }, head);
    const far = gazeFromPoint({ x: 1500, y: 300 }, head);
    expect(near.x).toBeGreaterThan(0);
    expect(near.x).toBeLessThan(0.3);
    expect(far.x).toBeGreaterThan(0.9);
  });
  it('屏幕上方 = 视线向上', () => {
    expect(gazeFromPoint({ x: 500, y: 0 }, head).y).toBeGreaterThan(0);
  });
});
