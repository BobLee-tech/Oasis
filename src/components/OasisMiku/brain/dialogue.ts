// 🗣 台词引擎（docs/miku-design.md A4.2–A4.3）：事实 + 规则，借鉴 Valve 的规则式动态对话（Ruskin, GDC 2012）。
//
//   选择：
//     1. 筛出事件、关系、条件都匹配、不在冷却、没触发过 once 的规则（chance 在这一步掷骰）
//     2. 得分 = 条件数 × 10 + weight，只取最高分档——最具体的那句赢，选不到逐级退回通用句
//     3. 档内按「最久没说过」挑一句（说过的时间记在记忆里）
//     4. 填事实槽位；任何一个槽位缺值就弃掉这句，换下一句
//     5. 交给称呼选择器（address.ts）填 {呼，} / {，呼}
//   话量：care 可插队（各有自己的上限）；response 有 4s 回应冷却；ambient 有最小间隔与每小时上限；
//   recall 每个会话最多一句（记得但不炫耀）。
import type { Field } from '../../../data/mikuAddress';
import type { EmotionKind } from './affect';
import type { EmitKind } from '../particles/sim';

export type MikuEvent =
  | 'greet' | 'return' | 'view' | 'track-change' | 'chorus' | 'idle'
  | 'reading-open' | 'reading-idle' | 'editor-open' | 'write-milestone' | 'published'
  | 'tap' | 'hold' | 'stroke' | 'swipe' | 'pull' | 'combo'
  | 'doze' | 'copy' | 'milestone' | 'rare' | 'recall'
  | 'care-late' | 'care-sedentary' | 'care-long-write' | 'care-loop';

export type Priority = 'care' | 'response' | 'ambient' | 'recall';

/**
 * 条件：
 *   字面量 —— 相等；数组 —— 其中之一；
 *   '>=3' '<0.9' '>2' '<=1' '!=x' —— 比较；'?' —— 有值（非空）；'!' —— 没有值
 */
export type Criterion = string | number | boolean | readonly (string | number | boolean)[];

export interface Rule {
  id: string;
  on: MikuEvent;
  who: 'owner' | 'visitor' | 'any';
  /** 称呼场域；不写则由 inferField 推断 */
  field?: Field;
  when?: Record<string, Criterion>;
  /** 空数组 = 只用表情/粒子回应 */
  say: readonly string[];
  face?: EmotionKind;
  particles?: EmitKind;
  weight?: number;
  /** 秒 */
  cooldown?: number;
  once?: 'ever' | 'day' | 'week' | 'session';
  /** once 的作用域（可带槽位）：例如 'note:{trackId}' 让「每首每周一次」按曲目分开计 */
  onceKey?: string;
  /** 0..1：命中后再掷一次骰（轻拍约一半出字、稀有彩蛋 1.5%） */
  chance?: number;
  priority?: Priority;
}

export const DEFAULT_PRIORITY: Record<MikuEvent, Priority> = {
  greet: 'response', return: 'response', view: 'ambient', 'track-change': 'response', chorus: 'ambient', idle: 'ambient',
  'reading-open': 'response', 'reading-idle': 'ambient', 'editor-open': 'response', 'write-milestone': 'care', published: 'response',
  tap: 'response', hold: 'response', stroke: 'response', swipe: 'response', pull: 'response', combo: 'response',
  doze: 'ambient', copy: 'ambient', milestone: 'response', rare: 'response', recall: 'recall',
  'care-late': 'care', 'care-sedentary': 'care', 'care-long-write': 'care', 'care-loop': 'care',
};

// ───────────────────────── 条件与槽位 ─────────────────────────

export const getPath = (obj: unknown, path: string): unknown => {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
};

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

export const matches = (criterion: Criterion, value: unknown): boolean => {
  if (Array.isArray(criterion)) return criterion.some(c => c === value);
  if (typeof criterion === 'string') {
    if (criterion === '?') return !isEmpty(value);
    if (criterion === '!') return isEmpty(value);
    const m = criterion.match(/^(>=|<=|!=|>|<)(.+)$/);
    if (m) {
      const [, op, raw] = m;
      if (op === '!=') return String(value) !== raw;
      if (typeof value !== 'number') return false;
      const n = Number(raw);
      return op === '>=' ? value >= n : op === '<=' ? value <= n : op === '>' ? value > n : value < n;
    }
  }
  return value === criterion;
};

const SLOT = /\{([A-Za-z][\w.]*)\}/g;

/** 填事实槽位；任一槽位缺值返回 null（这句就不说）。称呼槽 {呼，} {，呼} 不在这里处理。 */
export const fillSlots = (template: string, facts: unknown): string | null => {
  let missing = false;
  const out = template.replace(SLOT, (_, path: string) => {
    const v = getPath(facts, path);
    if (isEmpty(v)) { missing = true; return ''; }
    return String(v);
  });
  return missing ? null : out;
};

export const slotsOf = (template: string) => [...template.matchAll(SLOT)].map(m => m[1]);

// ───────────────────────── 状态 ─────────────────────────

export interface DialogueMemory {
  /** 某个 key 上次说过 / 触发过的时间（站主存记忆里，访客只在内存里） */
  lastSaid(key: string): number | undefined;
  markSaid(key: string, t: number): void;
}

const DAY = 86_400_000;
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

export class DialogueState {
  lastFired = new Map<string, number>();
  sessionOnce = new Set<string>();
  memory: DialogueMemory;
  constructor(memory: DialogueMemory) {
    this.memory = memory;
  }
}

const onceScope = (rule: Rule, facts: unknown) => {
  const suffix = rule.onceKey ? fillSlots(rule.onceKey, facts) ?? rule.onceKey : '';
  return `once:${rule.id}${suffix ? `:${suffix}` : ''}`;
};

const onceBlocked = (rule: Rule, facts: unknown, state: DialogueState, now: number) => {
  if (!rule.once) return false;
  const key = onceScope(rule, facts);
  if (rule.once === 'session') return state.sessionOnce.has(key);
  const last = state.memory.lastSaid(key);
  if (last === undefined) return false;
  if (rule.once === 'ever') return true;
  if (rule.once === 'day') return sameDay(last, now);
  return now - last < 7 * DAY; // week
};

// ───────────────────────── 选择 ─────────────────────────

export interface Selection {
  rule: Rule;
  /** 填好事实槽位、尚未填称呼的模板 */
  template: string;
  lineKey: string;
  score: number;
  debug: { candidates: { id: string; score: number }[]; rejected: { id: string; reason: string }[] };
}

export const select = (
  event: MikuEvent,
  facts: { owner: boolean } & Record<string, unknown>,
  rules: readonly Rule[],
  ctx: { now: number; state: DialogueState; rng?: () => number },
): Selection | null => {
  const rng = ctx.rng ?? Math.random;
  const { state, now } = ctx;
  const rejected: { id: string; reason: string }[] = [];
  const scored: { rule: Rule; score: number }[] = [];
  for (const rule of rules) {
    if (rule.on !== event) continue;
    if (rule.who !== 'any' && (rule.who === 'owner') !== facts.owner) continue;
    const failed = Object.entries(rule.when ?? {}).find(([path, c]) => !matches(c, getPath(facts, path)));
    if (failed) { rejected.push({ id: rule.id, reason: `条件 ${failed[0]}` }); continue; }
    const last = state.lastFired.get(rule.id);
    if (rule.cooldown && last !== undefined && now - last < rule.cooldown * 1000) { rejected.push({ id: rule.id, reason: '冷却中' }); continue; }
    if (onceBlocked(rule, facts, state, now)) { rejected.push({ id: rule.id, reason: `once:${rule.once}` }); continue; }
    if (rule.chance !== undefined && rng() >= rule.chance) { rejected.push({ id: rule.id, reason: '掷骰未中' }); continue; }
    scored.push({ rule, score: Object.keys(rule.when ?? {}).length * 10 + (rule.weight ?? 0) });
  }
  scored.sort((a, b) => b.score - a.score);
  const debug = { candidates: scored.map(s => ({ id: s.rule.id, score: s.score })), rejected };

  // 从最高分档往下找：档内所有句子按「最久没说过」排，第一句槽位填得上的就用；整档都填不上才退一档
  const tiers = [...new Set(scored.map(s => s.score))];
  for (const score of tiers) {
    const lines = scored
      .filter(s => s.score === score)
      .flatMap(s => s.rule.say.map((line, i) => ({ rule: s.rule, line, key: `${s.rule.id}#${i}` })));
    if (!lines.length) {
      // 只用表情/粒子回应的规则（say 为空）
      const silent = scored.find(s => s.score === score)!;
      return { rule: silent.rule, template: '', lineKey: `${silent.rule.id}#-`, score, debug };
    }
    const order = lines
      .map(l => ({ ...l, last: state.memory.lastSaid(l.key) ?? -Infinity, tie: rng() }))
      .sort((a, b) => a.last - b.last || a.tie - b.tie);
    for (const l of order) {
      const filled = fillSlots(l.line, facts);
      if (filled !== null) return { rule: l.rule, template: filled, lineKey: l.key, score, debug };
    }
  }
  return null;
};

/** 选中之后记账：冷却、once、「最久没说过」。 */
export const commit = (sel: Selection, facts: unknown, state: DialogueState, now: number) => {
  state.lastFired.set(sel.rule.id, now);
  if (sel.template) state.memory.markSaid(sel.lineKey, now);
  if (sel.rule.once) {
    const key = onceScope(sel.rule, facts);
    if (sel.rule.once === 'session') state.sessionOnce.add(key);
    else state.memory.markSaid(key, now);
  }
};

// ───────────────────────── 话量调控 ─────────────────────────

export class SpeechGovernor {
  private lastResponseAt = -Infinity;
  private lastAmbientAt = -Infinity;
  private ambientTimes: number[] = [];
  private recallUsed = false;

  /** ambient 的最小间隔（秒）：站主 90、访客 150；阅读时 ×2；写作时静音 */
  allow(priority: Priority, now: number, ctx: { owner: boolean; reading: boolean; editing: boolean }): boolean {
    if (priority === 'care') return true;
    if (priority === 'response') return now - this.lastResponseAt >= 4000;
    if (priority === 'recall') return !this.recallUsed;
    if (ctx.editing) return false;
    const gap = (ctx.owner ? 90 : 150) * (ctx.reading ? 2 : 1) * 1000;
    if (now - this.lastAmbientAt < gap) return false;
    this.ambientTimes = this.ambientTimes.filter(t => now - t < 3_600_000);
    return this.ambientTimes.length < 6;
  }

  commit(priority: Priority, now: number) {
    if (priority === 'response') this.lastResponseAt = now;
    if (priority === 'ambient') { this.lastAmbientAt = now; this.ambientTimes.push(now); }
    if (priority === 'recall') this.recallUsed = true;
    // 任何一句话都推迟下一句闲聊：刚回应过你，不紧接着自言自语
    if (priority !== 'ambient') this.lastAmbientAt = Math.max(this.lastAmbientAt, now - 60_000);
  }
}
