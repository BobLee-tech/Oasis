import { describe, expect, it } from 'vitest';
import { DialogueState, SpeechGovernor, commit, fillSlots, matches, select, type Rule } from './dialogue';

const memory = () => {
  const said = new Map<string, number>();
  return { lastSaid: (k: string) => said.get(k), markSaid: (k: string, t: number) => { said.set(k, t); }, said };
};
const facts = (extra: Record<string, unknown> = {}) => ({ owner: true, period: 'night', zone: 'head', reading: { title: '建筑杂谈', minutes: 12 }, ...extra });

describe('matches', () => {
  it('字面量、数组、比较、有无', () => {
    expect(matches('night', 'night')).toBe(true);
    expect(matches(['a', 'b'], 'b')).toBe(true);
    expect(matches('>=3', 3)).toBe(true);
    expect(matches('<0.9', 0.95)).toBe(false);
    expect(matches('>=3', '3')).toBe(false);
    expect(matches('?', '')).toBe(false);
    expect(matches('!', undefined)).toBe(true);
    expect(matches('!=x', 'y')).toBe(true);
  });
});

describe('fillSlots', () => {
  it('按路径填值；缺值返回 null（这句不说）', () => {
    expect(fillSlots('《{reading.title}》要读 {reading.minutes} 分钟', facts())).toBe('《建筑杂谈》要读 12 分钟');
    expect(fillSlots('《{latestPost.title}》', facts())).toBeNull();
  });
  it('称呼槽不是事实槽，原样保留', () => {
    expect(fillSlots('{呼，}该睡了{，呼}。', facts())).toBe('{呼，}该睡了{，呼}。');
  });
});

describe('select', () => {
  const rules: Rule[] = [
    { id: 'generic', on: 'tap', who: 'any', say: ['A'] },
    { id: 'head', on: 'tap', who: 'any', when: { zone: 'head' }, say: ['B1', 'B2'] },
    { id: 'head-night', on: 'tap', who: 'owner', when: { zone: 'head', period: 'night' }, say: ['C {latestPost.title}'] },
    { id: 'visitor', on: 'tap', who: 'visitor', when: { zone: 'head', period: 'night' }, say: ['V'] },
  ];

  it('最具体的规则赢；它的句子槽位缺值时退回下一档', () => {
    const state = new DialogueState(memory());
    const sel = select('tap', facts(), rules, { now: 0, state, rng: () => 0.5 });
    // head-night 分最高但槽位填不上 → 退到 head 档
    expect(sel?.rule.id).toBe('head');
    const withPost = select('tap', facts({ latestPost: { title: '春' } }), rules, { now: 0, state, rng: () => 0.5 });
    expect(withPost?.template).toBe('C 春');
  });

  it('关系过滤：访客拿不到站主规则', () => {
    const sel = select('tap', facts({ owner: false, latestPost: { title: '春' } }), rules, { now: 0, state: new DialogueState(memory()), rng: () => 0.5 });
    expect(sel?.rule.id).toBe('visitor');
  });

  it('档内按「最久没说过」轮换', () => {
    const state = new DialogueState(memory());
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const sel = select('tap', facts(), rules, { now: i * 10_000, state, rng: () => 0.5 })!;
      commit(sel, facts(), state, i * 10_000);
      seen.push(sel.template);
    }
    expect(seen[0]).not.toBe(seen[1]);
    expect(seen[2]).toBe(seen[0]);
    expect(seen[3]).toBe(seen[1]);
  });

  it('冷却与 once（带 onceKey 时按曲目分开计）', () => {
    const r: Rule[] = [
      { id: 'cool', on: 'idle', who: 'any', cooldown: 60, say: ['x'] },
      { id: 'note', on: 'track-change', who: 'any', once: 'week', onceKey: '{trackId}', say: ['n'] },
    ];
    const state = new DialogueState(memory());
    const a = select('idle', facts(), r, { now: 0, state })!;
    commit(a, facts(), state, 0);
    expect(select('idle', facts(), r, { now: 30_000, state })).toBeNull();
    expect(select('idle', facts(), r, { now: 61_000, state })).not.toBeNull();

    const f1 = facts({ trackId: 'm_01' });
    const n = select('track-change', f1, r, { now: 0, state })!;
    commit(n, f1, state, 0);
    expect(select('track-change', f1, r, { now: 86_400_000, state })).toBeNull();
    expect(select('track-change', facts({ trackId: 'a_04' }), r, { now: 86_400_000, state })).not.toBeNull();
    expect(select('track-change', f1, r, { now: 8 * 86_400_000, state })).not.toBeNull();
  });

  it('chance 掷骰未中就不参与', () => {
    const r: Rule[] = [{ id: 'rare', on: 'rare', who: 'any', chance: 0.1, say: ['r'] }];
    expect(select('rare', facts(), r, { now: 0, state: new DialogueState(memory()), rng: () => 0.5 })).toBeNull();
    expect(select('rare', facts(), r, { now: 0, state: new DialogueState(memory()), rng: () => 0.05 })).not.toBeNull();
  });
});

describe('SpeechGovernor', () => {
  const ctx = { owner: true, reading: false, editing: false };
  it('回应有 4s 冷却', () => {
    const g = new SpeechGovernor();
    g.commit('response', 0);
    expect(g.allow('response', 3000, ctx)).toBe(false);
    expect(g.allow('response', 4000, ctx)).toBe(true);
  });
  it('闲聊：站主 90s、访客 150s、阅读 ×2、写作静音、每小时 ≤ 6 句', () => {
    const g = new SpeechGovernor();
    g.commit('ambient', 0);
    expect(g.allow('ambient', 89_000, ctx)).toBe(false);
    expect(g.allow('ambient', 91_000, ctx)).toBe(true);
    expect(g.allow('ambient', 120_000, { ...ctx, owner: false })).toBe(false);
    expect(g.allow('ambient', 170_000, { ...ctx, reading: true })).toBe(false);
    expect(g.allow('ambient', 10_000_000, { ...ctx, editing: true })).toBe(false);
    const h = new SpeechGovernor();
    for (let i = 0; i < 6; i++) h.commit('ambient', i * 91_000);
    expect(h.allow('ambient', 6 * 91_000, ctx)).toBe(false);
  });
  it('回忆每个会话最多一句；照顾可以插队', () => {
    const g = new SpeechGovernor();
    g.commit('response', 0);
    expect(g.allow('care', 100, ctx)).toBe(true);
    g.commit('recall', 0);
    expect(g.allow('recall', 1e9, ctx)).toBe(false);
  });
});
