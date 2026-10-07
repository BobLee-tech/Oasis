import { describe, expect, it } from 'vitest';
import { LocalMemoryStore, MEMORY_BUDGET_BYTES, MEMORY_KEY, NullMemoryStore, compact, localDate, migrate, type MemoryDump, type MemoryStore } from './mikuMemory';

const DAY = 86_400_000;
const memStorage = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
};
// 2026-10-07 21:00 本地
const T0 = new Date(2026, 9, 7, 21, 0).getTime();

const fakeClock = (start: number) => {
  let t = start;
  return { now: () => t, set: (x: number) => { t = x; }, add: (ms: number) => { t += ms; } };
};

/** 模拟一次会话：开始 → 若干事件 → 结束 */
const session = (store: LocalMemoryStore, clock: ReturnType<typeof fakeClock>, at: number, extra: (s: LocalMemoryStore) => void = () => {}, endData = {}) => {
  clock.set(at);
  store.append({ kind: 'session-start' });
  clock.add(10 * 60_000);
  extra(store);
  clock.add(20 * 60_000);
  store.append({ kind: 'session-end', data: endData });
};

describe('LocalMemoryStore', () => {
  it('写入即持久化；重新打开读得回来', () => {
    const storage = memStorage();
    const clock = fakeClock(T0);
    const a = new LocalMemoryStore({ storage, now: clock.now });
    a.append({ kind: 'listen', data: { trackId: 'm_01' } });
    const b = new LocalMemoryStore({ storage, now: clock.now });
    expect(b.query({ kinds: ['listen'] })).toHaveLength(1);
    expect(b.export().firstMetAt).toBe(T0);
  });

  it('importance ≥ 8 自动晋升珍藏', () => {
    const store = new LocalMemoryStore({ storage: memStorage(), now: () => T0 });
    store.append({ kind: 'publish', data: { title: '建筑杂谈' } });
    store.append({ kind: 'read' });
    expect(store.pinned().map(p => p.kind)).toEqual(['publish']);
  });

  it('存储不可用时降级为内存记忆，不抛错', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    const store = new LocalMemoryStore({ storage: broken, now: () => T0 });
    expect(() => store.append({ kind: 'pat' })).not.toThrow();
    expect(store.query({})).toHaveLength(1);
    expect(store.persistent).toBe(false);
  });

  it('坏数据被迁移成空记忆而不是崩溃', () => {
    const storage = memStorage();
    storage.setItem(MEMORY_KEY, '{"stream": "oops"');
    expect(new LocalMemoryStore({ storage, now: () => T0 }).query({})).toEqual([]);
    expect(migrate({ stream: 3 }).stream).toEqual([]);
  });

  it('import 按 id 合并，重复导入幂等', () => {
    const store = new LocalMemoryStore({ storage: memStorage(), now: () => T0 });
    store.append({ kind: 'read' });
    const dump = store.export();
    store.import(dump);
    store.import(dump);
    expect(store.query({})).toHaveLength(1);
  });
});

describe('访客不写入', () => {
  it('NullMemoryStore 什么都不记，记忆事实为空', () => {
    const store: MemoryStore = new NullMemoryStore();
    store.append({ kind: 'publish' });
    expect(store.query({})).toEqual([]);
    expect(store.pinned()).toEqual([]);
    const f = store.facts(T0);
    expect(f.daysTogether).toBe(0);
    expect(f.lastSession).toBeNull();
  });
});

describe('汇总与容量预算', () => {
  it('30 天前的事件折成日汇总，一年前的日汇总折成月汇总', () => {
    const events = [
      { id: 'a', t: T0 - 40 * DAY, kind: 'listen' as const, data: { trackId: 'x' }, importance: 1, tags: [] },
      { id: 'b', t: T0 - 40 * DAY + 1000, kind: 'listen' as const, data: { trackId: 'x' }, importance: 1, tags: [] },
      { id: 'c', t: T0 - 400 * DAY, kind: 'session-start' as const, importance: 1, tags: [] },
      { id: 'd', t: T0 - 2 * DAY, kind: 'read' as const, importance: 3, tags: [] },
    ];
    const dump: MemoryDump = { ...migrate({}), stream: events };
    const out = compact(dump, T0);
    expect(out.stream.map(e => e.id)).toEqual(['d']);
    expect(out.days).toHaveLength(1);
    expect(out.days[0].tracks.x).toBe(2);
    expect(out.months).toHaveLength(1);
    expect(out.months[0].counts['session-start']).toBe(1);
  });

  it('写满之后序列化体积不超过 200KB，珍藏保留', () => {
    const storage = memStorage();
    const clock = fakeClock(T0 - 25 * DAY);
    const store = new LocalMemoryStore({ storage, now: clock.now });
    store.append({ kind: 'publish', data: { title: '第一篇' } });
    for (let i = 0; i < 4000; i++) {
      clock.add(9 * 60_000);
      store.append({ kind: 'listen', data: { trackId: `t_${i % 90}`, note: 'x'.repeat(40) } });
    }
    expect((storage.map.get(MEMORY_KEY) ?? '').length * 2).toBeLessThanOrEqual(MEMORY_BUDGET_BYTES);
    expect(store.pinned()).toHaveLength(1);
  });
});

describe('反思与记忆事实', () => {
  it('相处天数、连续来访、上次会话、常听曲目', () => {
    const clock = fakeClock(T0);
    const store = new LocalMemoryStore({ storage: memStorage(), now: clock.now });
    for (let d = 4; d >= 1; d--) {
      session(store, clock, T0 - d * DAY, s => {
        s.append({ kind: 'listen', data: { trackId: 'a_04' } });
      }, d === 1 ? { trackId: 'a_04', trackTitle: '祥月', readingId: 'p1', readingTitle: '建筑杂谈', readingProgress: 0.4 } : {});
    }
    clock.set(T0);
    store.append({ kind: 'session-start' });
    const f = store.facts();
    expect(f.daysTogether).toBe(5);
    expect(f.streakDays).toBe(5);
    expect(f.daysSinceLastVisit).toBe(1);
    expect(f.lastSession?.readingTitle).toBe('建筑杂谈');
    expect(f.lastSession?.readingProgress).toBe(0.4);
    expect(f.topTrackThisWeek).toEqual({ id: 'a_04', plays: 4 });
    expect(f.usualHour).toBe(21);
  });

  it('断了一天，连续天数从头算', () => {
    const clock = fakeClock(T0);
    const store = new LocalMemoryStore({ storage: memStorage(), now: clock.now });
    session(store, clock, T0 - 3 * DAY);
    session(store, clock, T0 - 1 * DAY);
    clock.set(T0);
    expect(store.facts().streakDays).toBe(1);
  });

  it('深夜（凌晨算前一晚）计数与今天的播放次数', () => {
    const clock = fakeClock(T0);
    const store = new LocalMemoryStore({ storage: memStorage(), now: clock.now });
    clock.set(new Date(2026, 9, 5, 23, 30).getTime());
    store.append({ kind: 'listen', data: { trackId: 'm_01' } });
    clock.set(new Date(2026, 9, 6, 1, 30).getTime());
    store.append({ kind: 'listen', data: { trackId: 'm_01' } });
    clock.set(T0);
    store.append({ kind: 'listen', data: { trackId: 'm_01' } });
    store.append({ kind: 'listen', data: { trackId: 'm_01' } });
    const f = store.facts();
    expect(f.lateNightsThisWeek).toBe(1);
    expect(f.playsToday('m_01')).toBe(2);
  });

  it('认识第 100 天时给出纪念日', () => {
    const clock = fakeClock(T0);
    const store = new LocalMemoryStore({ storage: memStorage(), now: clock.now });
    for (let d = 99; d >= 0; d--) {
      clock.set(T0 - d * DAY);
      store.append({ kind: 'session-start' });
    }
    expect(store.facts().anniversary).toBe(100);
  });

  it('localDate 用本地日期', () => {
    expect(localDate(new Date(2026, 0, 2, 0, 30).getTime())).toBe('2026-01-02');
  });
});
