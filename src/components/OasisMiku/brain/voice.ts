// 🗣 她的「嗓子」：把 事实 → 规则 → 话量调控 → 称呼 串起来，并负责记忆的读写。
//   不是 React：useMikuBrain 只负责收集输入、把结果演出来（气泡、表情、粒子），这里可以直接单测。
//
//   关系切换（访客 ⇄ 站主，包括 [VISITOR : ON] 预览）时换记忆适配器：站主用 LocalMemoryStore，
//   访客用 NullMemoryStore——访客的一切既不写入、也读不到站主的记忆。
import { MIKU_RULES } from '../../../data/mikuRules';
import { LocalMemoryStore, NullMemoryStore, localDate, type MemoryStore } from '../../../lib/mikuMemory';
import { AddressState, chooseAddress } from './address';
import { DEFAULT_PRIORITY, DialogueState, SpeechGovernor, commit, select, type MikuEvent, type Rule } from './dialogue';
import { buildFacts, type Facts, type FactsInput } from './facts';

export interface VoiceLine {
  text: string;
  rule: Rule;
  /** 调试面板：命中规则、得分、称呼场域与原因 */
  debug: { ruleId: string; score: number; field: string; addressReason: string; candidates: number };
}

let ownerStore: LocalMemoryStore | null = null;
/** 站主记忆全站共用一份（同一个标签页里只开一次 localStorage） */
const getOwnerStore = () => (ownerStore ??= new LocalMemoryStore());

export class MikuVoice {
  owner = false;
  store: MemoryStore = new NullMemoryStore();
  readonly dialogue: DialogueState;
  readonly governor = new SpeechGovernor();
  readonly address = new AddressState();
  last: VoiceLine['debug'] | null = null;
  private visitorStore = this.store;

  private rules: readonly Rule[];

  constructor(rules: readonly Rule[] = MIKU_RULES, opts: { ownerStore?: () => MemoryStore } = {}) {
    this.rules = rules;
    if (opts.ownerStore) this.ownerStoreFactory = opts.ownerStore;
    // DialogueState 读写「说过」走当前的记忆适配器：站主跨会话记得，访客只在本次会话里记得
    this.dialogue = new DialogueState({
      lastSaid: key => this.store.lastSaid(key),
      markSaid: (key, t) => this.store.markSaid(key, t),
    });
  }

  private ownerStoreFactory: () => MemoryStore = getOwnerStore;

  setOwner(owner: boolean) {
    if (owner === this.owner) return;
    this.owner = owner;
    this.store = owner ? this.ownerStoreFactory() : this.visitorStore;
  }

  /** 只在站主时写记忆（访客适配器本身也是空操作，这里再拦一道，意图更明确） */
  remember(e: Parameters<MemoryStore['append']>[0]) {
    if (this.owner) this.store.append(e);
  }

  facts(input: Omit<FactsInput, 'owner' | 'memory'>, now = Date.now()): Facts {
    return buildFacts({ ...input, owner: this.owner, memory: this.owner ? this.store.facts(now) : null });
  }

  /**
   * 尝试说一句。返回 null 表示这次不说（没有匹配的规则、话量不允许、或规则只用表情回应时 text 为空）。
   * opts.force：绕过话量调控（例如用户明确的大事件），默认 false。
   */
  speak(event: MikuEvent, input: Omit<FactsInput, 'owner' | 'memory'>, opts: { now?: number; rng?: () => number; force?: boolean } = {}): VoiceLine | null {
    const now = opts.now ?? Date.now();
    const facts = this.facts(input, now);
    const sel = select(event, facts, this.rules, { now, state: this.dialogue, rng: opts.rng });
    if (!sel) return null;
    const priority = sel.rule.priority ?? DEFAULT_PRIORITY[event];
    const ctx = { owner: this.owner, reading: !!facts.reading, editing: !!facts.editing };
    // 只用表情 / 粒子回应（say 为空）不算开口：不受话量调控，也不占话量（眼睛亮一下不该让下一句话等 90 秒）
    const silent = !sel.template;
    if (!opts.force && !silent && !this.governor.allow(priority, now, ctx)) return null;
    commit(sel, facts, this.dialogue, now);
    if (!silent) this.governor.commit(priority, now);
    const choice = sel.template
      ? chooseAddress(sel.template, {
        event,
        facts: {
          owner: facts.owner,
          visitorAlias: facts.visitorAlias,
          intimacy: facts.intimacy,
          daysTogether: facts.memory?.daysTogether ?? 0,
          lateNight: facts.lateNight,
          valence: facts.valence,
          editing: !!facts.editing,
          reading: !!facts.reading,
          emotion: facts.emotion,
          anniversary: facts.memory?.anniversary,
        },
        field: sel.rule.field,
        zone: facts.zone,
        state: this.address,
        date: localDate(now),
        rng: opts.rng,
      })
      : null;
    const debug = {
      ruleId: sel.rule.id,
      score: sel.score,
      field: choice?.field ?? '—',
      addressReason: choice?.reason ?? '只用表情回应',
      candidates: sel.debug.candidates.length,
    };
    this.last = debug;
    return { text: choice?.text ?? '', rule: sel.rule, debug };
  }
}
