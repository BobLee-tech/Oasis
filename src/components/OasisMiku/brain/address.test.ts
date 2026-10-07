import { describe, expect, it } from 'vitest';
import { AddressState, applyAddress, chooseAddress, cleanPunctuation, inferField, type AddressFacts } from './address';

const owner: AddressFacts = { owner: true, intimacy: 3, daysTogether: 120, lateNight: false, valence: 0.2, editing: false, reading: false };
const always = () => 0; // rng 恒为 0：必过出现率、抽第一个候选
const D = '2026-10-07';

describe('applyAddress / 标点', () => {
  it('句首、句末两种槽位', () => {
    expect(applyAddress('{呼，}两点了。', '宝贝', 'tail')).toBe('宝贝，两点了。');
    expect(applyAddress('该睡了{，呼}。', '宝贝', 'tail')).toBe('该睡了，宝贝。');
  });
  it('不称呼时干净地清掉槽位', () => {
    expect(applyAddress('{呼，}两点了。', null, 'head')).toBe('两点了。');
    expect(applyAddress('该睡了{，呼}。', null, 'head')).toBe('该睡了。');
  });
  it('两个槽都在时按场域惯用位置只用一个', () => {
    expect(applyAddress('{呼，}发出去了{，呼}。', '爱人', 'head')).toBe('爱人，发出去了。');
    expect(applyAddress('{呼，}发出去了{，呼}。', '宝贝', 'tail')).toBe('发出去了，宝贝。');
  });
  it('清理多余标点', () => {
    expect(cleanPunctuation('，，好，，的，。')).toBe('好，的。');
  });
});

describe('inferField', () => {
  it('按优先级判定', () => {
    expect(inferField('published', owner)).toBe('solemn');
    expect(inferField('care-late', owner)).toBe('care');
    expect(inferField('combo', owner)).toBe('play');
    expect(inferField('stroke', owner, 'head')).toBe('tender');
    expect(inferField('idle', { ...owner, editing: true })).toBe('focus');
    expect(inferField('idle', owner)).toBe('daily');
    expect(inferField('track-change', { ...owner, lateNight: true, valence: -0.5 })).toBe('comfort');
  });
});

describe('chooseAddress', () => {
  it('访客永远不用亲昵称呼；有别名时偶尔用别名', () => {
    const visitor = { ...owner, owner: false };
    for (let i = 0; i < 50; i++) {
      const r = chooseAddress('{呼，}好久不见。', { event: 'published', facts: visitor, state: new AddressState(), date: D, rng: Math.random });
      expect(r.text).toBe('好久不见。');
    }
    const aliased = chooseAddress('{呼，}好久不见。', { event: 'greet', facts: { ...visitor, visitorAlias: '阿树' }, state: new AddressState(), date: D, rng: always });
    expect(aliased.text).toBe('阿树，好久不见。');
  });

  it('门槛：亲密度和相处天数都不够时不叫「宝贝」', () => {
    const fresh = { ...owner, intimacy: 0, daysTogether: 2 };
    const r = chooseAddress('该睡了{，呼}。', { event: 'care-late', facts: fresh, state: new AddressState(), date: D, rng: always });
    expect(r.term).toBeNull();
    const r2 = chooseAddress('该睡了{，呼}。', { event: 'care-late', facts: { ...fresh, daysTogether: 8 }, state: new AddressState(), date: D, rng: always });
    expect(r2.term).toBe('宝贝');
  });

  it('「爱人」每天最多一次', () => {
    const state = new AddressState();
    const first = chooseAddress('{呼，}发出去了。', { event: 'published', facts: owner, state, date: D, rng: always });
    expect(first.term).toBe('爱人');
    state.history = []; // 排除疲劳与「最近 3 句」的影响，单看每日上限
    const second = chooseAddress('{呼，}发出去了。', { event: 'published', facts: owner, state, date: D, rng: always });
    expect(second.term).toBeNull();
    state.history = [];
    const tomorrow = chooseAddress('{呼，}发出去了。', { event: 'published', facts: owner, state, date: '2026-10-08', rng: always });
    expect(tomorrow.term).toBe('爱人');
  });

  it('称呼疲劳：最近叫过越多，越不容易再叫', () => {
    const state = new AddressState();
    state.history = ['宝贝', '宝贝'];
    // care 出现率 0.35 × 疲劳 0.25 = 0.0875：rng 0.1 时不叫
    const r = chooseAddress('该睡了{，呼}。', { event: 'care-late', facts: owner, state, date: D, rng: () => 0.1 });
    expect(r.term).toBeNull();
    const fresh = chooseAddress('该睡了{，呼}。', { event: 'care-late', facts: owner, state: new AddressState(), date: D, rng: () => 0.1 });
    expect(fresh.term).toBe('宝贝');
  });

  it('最近 3 句用过的称呼不重复', () => {
    const state = new AddressState();
    state.history = ['小盆友'];
    // 疲劳 0.5 × 0.45 = 0.225 > 0 → 过出现率；小盆友被排除，只剩「你」= 零称呼
    const r = chooseAddress('{呼，}又戳？', { event: 'combo', facts: owner, state, date: D, rng: always });
    expect(r.term).toBeNull();
  });

  it('专注场域不称呼；不带槽位的句子也计入疲劳历史', () => {
    const state = new AddressState();
    expect(chooseAddress('{呼，}慢慢写。', { event: 'idle', facts: { ...owner, editing: true }, state, date: D, rng: always }).term).toBeNull();
    chooseAddress('嗯。', { event: 'tap', facts: owner, state, date: D });
    expect(state.history).toHaveLength(2);
  });
});
