import { describe, expect, it } from 'vitest';
import { TwintailPull, tailParamIds } from './twintail';

const range = () => [-45, 45] as [number, number];
const total = (out: Record<string, number>) => Object.values(out).reduce((a, b) => a + b, 0);

const settle = (pull: TwintailPull, raw: number, seconds = 1) => {
  pull.drag(raw);
  let out: Record<string, number> = {};
  for (let i = 0; i < seconds * 60; i++) out = pull.update(1 / 60, range);
  return out;
};

describe('TwintailPull', () => {
  it('满拉时整条马尾合计只转 ~22°，且越往外越拉不动（软饱和）', () => {
    const pull = new TwintailPull();
    pull.start('00');
    const light = total(settle(pull, 0.3));
    const full = total(settle(pull, 1));
    const yank = total(settle(pull, 3));
    expect(full).toBeGreaterThan(12);
    expect(yank).toBeLessThan(23);
    // 拉 3 倍远，摆幅远不到 3 倍
    expect(yank / full).toBeLessThan(1.5);
    expect(light / full).toBeGreaterThan(0.3);
  });

  it('根部几乎不动，摆动集中在中段与发梢', () => {
    const pull = new TwintailPull();
    pull.start('10');
    const out = settle(pull, 1);
    const ids = tailParamIds('10');
    expect(Math.abs(out[ids[0]])).toBeLessThan(Math.abs(out[ids[5]]) / 2);
  });

  it('松手后柔和落回：过冲不超过放手位移的 15%，约 1.5s 内归位并停止输出', () => {
    const pull = new TwintailPull();
    pull.start('00');
    const held = total(settle(pull, 1));
    pull.release();
    let minTotal = Infinity;
    let frames = 0;
    let out = pull.update(1 / 60, range);
    while (Object.keys(out).length && frames < 300) {
      minTotal = Math.min(minTotal, total(out));
      out = pull.update(1 / 60, range);
      frames++;
    }
    expect(-minTotal / held).toBeLessThan(0.15);
    expect(frames).toBeLessThan(90);
    expect(pull.offset).toBe(0);
  });
});
