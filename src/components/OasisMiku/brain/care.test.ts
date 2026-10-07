import { describe, expect, it } from 'vitest';
import { CareScheduler, isReturn, nightKey, type CareFiring, type CareInput } from './care';

const MIN = 60_000;
const at = (h: number, m = 0, day = 7) => new Date(2026, 9, day, h, m).getTime();

/**
 * 假时钟：每 15 秒推进一次（与 useMikuBrain 的轮询同频），input 可按时间给出。
 * 每次触发都当作「说出来了」并记账，返回所有触发及其时间。
 */
const run = (
  care: CareScheduler,
  from: number,
  minutes: number,
  input: (now: number) => Partial<CareInput> = () => ({}),
) => {
  const fired: (CareFiring & { at: number })[] = [];
  const step = 15_000;
  for (let now = from; now < from + minutes * MIN; now += step) {
    const extra = input(now);
    const i: CareInput = {
      now,
      hour: new Date(now).getHours(),
      visible: true,
      lastInputAt: now - 10_000,
      editingSince: null,
      ...extra,
    };
    const f = care.tick(step, i);
    if (f) {
      care.fired(f.kind, now, i.editingSince);
      fired.push({ ...f, at: now });
    }
  }
  return fired;
};

describe('深夜关照', () => {
  it('1 点以后会话满 20 分钟才提，每晚第一档一次', () => {
    const care = new CareScheduler();
    const fired = run(care, at(0, 50), 60).filter(f => f.kind === 'care-late');
    expect(fired).toHaveLength(1);
    // 0:50 开始，1:00 才过门槛，会话到 1:10 满 20 分钟
    expect(fired[0].at).toBeGreaterThanOrEqual(at(1, 10) - 15_000);
    expect(fired[0].repeat).toBe(0);
  });

  it('3 点以后再轻轻提一次（repeat=1），之后整晚不再提', () => {
    const care = new CareScheduler();
    const fired = run(care, at(1, 30), 4 * 60).filter(f => f.kind === 'care-late');
    expect(fired.map(f => f.repeat)).toEqual([0, 1]);
    expect(new Date(fired[1].at).getHours()).toBeGreaterThanOrEqual(3);
  });

  it('人不在（没有输入）时不提', () => {
    const care = new CareScheduler();
    const fired = run(care, at(1), 60, now => ({ lastInputAt: now - 10 * MIN }));
    expect(fired.filter(f => f.kind === 'care-late')).toHaveLength(0);
  });

  it('凌晨算前一晚：刷新页面后从记忆恢复，不重复提', () => {
    expect(nightKey(at(2, 0, 8))).toBe('2026-10-07');
    const care = new CareScheduler();
    care.restore([{ t: at(1, 30), type: 'care-late' }]);
    const fired = run(care, at(1, 40), 40).filter(f => f.kind === 'care-late');
    expect(fired).toHaveLength(0);
  });
});

describe('久坐', () => {
  it('连续在场 50 分钟提一次', () => {
    const care = new CareScheduler();
    const fired = run(care, at(14), 60).filter(f => f.kind === 'care-sedentary');
    expect(fired).toHaveLength(1);
    expect(fired[0].at - at(14)).toBeGreaterThanOrEqual(49 * MIN);
  });

  it('中间休息过 ≥ 5 分钟就重新计', () => {
    const care = new CareScheduler();
    // 14:30 起离开 6 分钟
    const fired = run(care, at(14), 70, now => (now >= at(14, 30) && now < at(14, 36) ? { lastInputAt: at(14, 30) } : {}));
    expect(fired.filter(f => f.kind === 'care-sedentary')).toHaveLength(0);
  });

  it('间隔 ≥ 2 小时、每天最多两次，第二次 repeat=1', () => {
    const care = new CareScheduler();
    const fired = run(care, at(9), 10 * 60).filter(f => f.kind === 'care-sedentary');
    expect(fired.map(f => f.repeat)).toEqual([0, 1]);
    expect(fired[1].at - fired[0].at).toBeGreaterThanOrEqual(2 * 60 * MIN);
  });

  it('标签页藏起来时不计在场', () => {
    const care = new CareScheduler();
    const fired = run(care, at(14), 80, () => ({ visible: false }));
    expect(fired).toHaveLength(0);
    expect(care.sessionMs).toBe(0);
  });
});

describe('长时间写作', () => {
  it('编辑器开着 60 分钟且还在写，每次打开只提一次', () => {
    const care = new CareScheduler();
    const opened = at(10);
    const fired = run(care, opened, 120, () => ({ editingSince: opened })).filter(f => f.kind === 'care-long-write');
    expect(fired).toHaveLength(1);
    expect(fired[0].at - opened).toBeGreaterThanOrEqual(60 * MIN);
  });

  it('编辑器开着但人早走了，不提', () => {
    const care = new CareScheduler();
    const opened = at(10);
    const fired = run(care, opened, 90, () => ({ editingSince: opened, lastInputAt: opened })).filter(f => f.kind === 'care-long-write');
    expect(fired).toHaveLength(0);
  });

  it('重新打开编辑器可以再提一次，但每天最多两次', () => {
    const care = new CareScheduler();
    const fired = [
      ...run(care, at(9), 70, () => ({ editingSince: at(9) })),
      ...run(care, at(11), 70, () => ({ editingSince: at(11) })),
      ...run(care, at(13), 70, () => ({ editingSince: at(13) })),
    ].filter(f => f.kind === 'care-long-write');
    expect(fired.map(f => f.repeat)).toEqual([0, 1]);
  });
});

describe('关系', () => {
  it('访客只有久坐提醒：深夜不会卡住久坐', () => {
    const care = new CareScheduler();
    const fired = run(care, at(1), 60, () => ({ allowed: ['care-sedentary'] }));
    expect(fired.map(f => f.kind)).toEqual(['care-sedentary']);
  });
});

describe('回来了', () => {
  it('离开 ≥ 10 分钟，或跨了一天', () => {
    expect(isReturn(at(14), at(14, 5))).toBe(false);
    expect(isReturn(at(14), at(14, 10))).toBe(true);
    expect(isReturn(at(23, 58), at(0, 1, 8))).toBe(true);
  });
});
