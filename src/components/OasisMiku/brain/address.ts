// 💬 称呼选择器（docs/miku-design.md A5.3）：给一句模板填 {呼，} / {，呼} 槽位。
//
//   field  = rule.field ?? inferField(event, facts)
//   fatigue = 0.5 ^ (最近 5 句里带称呼的句数)      ← 每句都叫「宝贝」就成了口癖
//   访客    → 只可能用别名（0.15），否则不称呼
//   rand() > rate × fatigue → 不加称呼
//   候选    = 通过门槛 ∧ 未超每日上限 ∧ 最近 3 句没用过；按权重抽；抽中「你」= 不加称呼
//   插入后清理标点（「，，」「。，」、句首逗号……）
import { FIELDS, TERM_GATES, VISITOR_ALIAS_RATE, type Field, type Term } from '../../../data/mikuAddress';

export interface AddressFacts {
  owner: boolean;
  visitorAlias?: string | null;
  intimacy: number;
  daysTogether: number;
  lateNight: boolean;
  valence: number;
  editing: boolean;
  reading: boolean;
  emotion?: string | null;
  anniversary?: number | null;
}

export class AddressState {
  /** 最近说过的句子用了什么称呼（null = 没称呼），新的在前，最多 5 条 */
  history: (string | null)[] = [];
  daily: { date: string; counts: Record<string, number> } = { date: '', counts: {} };

  record(term: string | null, date: string) {
    this.history = [term, ...this.history].slice(0, 5);
    if (this.daily.date !== date) this.daily = { date, counts: {} };
    if (term) this.daily.counts[term] = (this.daily.counts[term] ?? 0) + 1;
  }

  usedToday(term: string, date: string) {
    return this.daily.date === date ? this.daily.counts[term] ?? 0 : 0;
  }
}

const PLAY_EVENTS = new Set(['combo', 'swipe', 'pull', 'poke']);
const TENDER_EVENTS = new Set(['stroke', 'hold']);
const SOLEMN_EVENTS = new Set(['published', 'milestone', 'date']);

/** 按 A5.2 的优先级从高到低判定场域。 */
export const inferField = (event: string, facts: AddressFacts, zone?: string): Field => {
  if (SOLEMN_EVENTS.has(event) || (event === 'greet' && facts.anniversary)) return 'solemn';
  if (event.startsWith('care-')) return 'care';
  if (event === 'return' && facts.lateNight) return 'comfort';
  if (facts.lateNight && facts.valence < -0.2 && (event === 'track-change' || event === 'idle')) return 'comfort';
  if (PLAY_EVENTS.has(event) || facts.emotion === 'annoyed' || (event === 'tap' && zone && zone !== 'head')) return 'play';
  if ((TENDER_EVENTS.has(event) && zone === 'head') || (event === 'tap' && zone === 'head' && facts.valence > 0.4)) return 'tender';
  if (facts.editing || facts.reading) return 'focus';
  return 'daily';
};

const passesGate = (term: Term, facts: AddressFacts, state: AddressState, date: string) => {
  if (term === '你') return true;
  const gate = TERM_GATES[term];
  const intimate = gate.minIntimacy === undefined || facts.intimacy >= gate.minIntimacy;
  const longEnough = gate.minDays === undefined || facts.daysTogether >= gate.minDays;
  // 门槛是「亲密度 或 相处天数」任一满足
  const open = (gate.minIntimacy === undefined && gate.minDays === undefined) || (gate.minIntimacy !== undefined && intimate) || (gate.minDays !== undefined && longEnough);
  if (!open) return false;
  if (gate.dailyCap !== undefined && state.usedToday(term, date) >= gate.dailyCap) return false;
  return true;
};

/** 把称呼（或不称呼）填进模板并清理标点。term 为 null 时两个槽都清掉。 */
export const applyAddress = (template: string, term: string | null, position: 'head' | 'tail') => {
  const hasHead = template.includes('{呼，}');
  const hasTail = template.includes('{，呼}');
  const useHead = term !== null && hasHead && (position === 'head' || !hasTail);
  const useTail = term !== null && hasTail && !useHead;
  const out = template
    .replace('{呼，}', useHead ? `${term}，` : '')
    .replace('{，呼}', useTail ? `，${term}` : '');
  return cleanPunctuation(out);
};

export const cleanPunctuation = (text: string) => text
  .replace(/^[，、。\s]+/, '')
  .replace(/，{2,}/g, '，')
  .replace(/，([。！？…])/g, '$1')
  .replace(/([。！？])，/g, '$1')
  .trim();

export interface AddressChoice {
  text: string;
  field: Field;
  term: string | null;
  /** 调试面板：为什么叫了 / 没叫 */
  reason: string;
}

export const chooseAddress = (
  template: string,
  opts: { event: string; facts: AddressFacts; field?: Field; zone?: string; state: AddressState; date: string; rng?: () => number },
): AddressChoice => {
  const { event, facts, state, date } = opts;
  const rng = opts.rng ?? Math.random;
  const field = opts.field ?? inferField(event, facts, opts.zone);
  const cfg = FIELDS[field];
  const hasSlot = template.includes('{呼，}') || template.includes('{，呼}');
  // 每句都记一笔（不带称呼的记 null）：疲劳看的是「最近 5 句话」，不是「最近 5 个带槽位的模板」
  const finish = (term: string | null, reason: string): AddressChoice => {
    state.record(term, date);
    return { text: applyAddress(template, term, cfg.position), field, term, reason };
  };
  if (!hasSlot) return finish(null, '模板无槽位');

  if (!facts.owner) {
    if (facts.visitorAlias && rng() < VISITOR_ALIAS_RATE) return finish(facts.visitorAlias, '访客别名');
    return finish(null, '访客不称呼');
  }

  const recent = state.history.filter(Boolean).length;
  const fatigue = Math.pow(0.5, recent);
  if (rng() > cfg.rate * fatigue) return finish(null, `${field}：未过出现率（${cfg.rate} × 疲劳 ${fatigue.toFixed(2)}）`);

  const recent3 = new Set(state.history.slice(0, 3).filter(Boolean));
  const candidates = (Object.entries(cfg.terms) as [Term, number][])
    .filter(([term]) => term === '你' || (!recent3.has(term) && passesGate(term, facts, state, date)));
  const total = candidates.reduce((s, [, w]) => s + w, 0);
  if (!total) return finish(null, `${field}：无可用称呼`);
  let pick = rng() * total;
  for (const [term, weight] of candidates) {
    pick -= weight;
    if (pick <= 0) return term === '你' ? finish(null, `${field}：抽中零称呼`) : finish(term, `${field}：抽中 ${term}`);
  }
  const last = candidates[candidates.length - 1][0];
  return last === '你' ? finish(null, `${field}：抽中零称呼`) : finish(last, `${field}：抽中 ${last}`);
};
