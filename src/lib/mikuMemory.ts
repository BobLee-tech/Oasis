// 🧠 Miku 的记忆（docs/miku-design.md A6）：现在只存本机 localStorage，接口按以后的 memory 功能定形。
//
//   三层（参考 Generative Agents 的记忆流 / 反思 / 检索）：
//     事件流 stream —— 只追加：会话开始结束、听歌、读完、发布、照顾、里程碑、抚摸……带 importance 与 tags
//     画像 profile  —— 「反思」：从事件流 + 日汇总确定性地算出来（来访时段、连续天数、常听曲目……），不用 LLM
//     珍藏 pinned   —— importance ≥ 8 的事件自动晋升；以后加「记住：……」手写。永不汇总、永不过期
//
//   保留策略：近 30 天原样；更早的按日汇总；一年以上按月汇总。序列化后超过 200KB 先汇总、再丢最旧。
//   只为站主记：store 由调用方在 isOwner 时才写（访客与 [VISITOR : ON] 预览都不写，避免污染）。
//   以后的 SupabaseMemoryStore 只换适配器：事件 id = 时间戳 + 随机后缀，按 id upsert 天然幂等。

export type MemoryKind =
  | 'session-start' | 'session-end'
  | 'listen' | 'skip'
  | 'read' | 'publish' | 'write'
  | 'care' | 'milestone' | 'pat';

export interface MemoryEvent {
  id: string;
  t: number;
  kind: MemoryKind;
  data?: Record<string, unknown>;
  /** 1–10：生日当天来访 9 / 发布 8 / 亲密里程碑 7 / 深夜照顾 4 / 读完一篇 3 / 听完一首 1 */
  importance: number;
  tags: string[];
}

export interface PinnedMemory {
  id: string;
  t: number;
  kind: MemoryKind | 'manual';
  /** 手写记忆的正文（以后）；自动晋升的用 data 描述 */
  text?: string;
  data?: Record<string, unknown>;
  source: 'auto' | 'manual';
}

/** 一天的汇总：计数 + 听过的曲目次数 + 出现过的小时（来访时段直方图用） */
export interface DaySummary {
  date: string; // YYYY-MM-DD（本地）
  counts: Partial<Record<MemoryKind, number>>;
  tracks: Record<string, number>;
  hours: number[];
}

export interface MonthSummary {
  month: string; // YYYY-MM
  days: number;
  counts: Partial<Record<MemoryKind, number>>;
}

export interface MemoryDump {
  v: 1;
  firstMetAt: number | null;
  stream: MemoryEvent[];
  days: DaySummary[];
  months: MonthSummary[];
  pinned: PinnedMemory[];
  /** 台词「说过」的时间：选句时挑最久没说过的（A4.2 ③） */
  said: Record<string, number>;
}

export interface Profile {
  firstMetAt: number | null;
  /** 不同来访日的数量（相处天数） */
  daysTogether: number;
  /** 截至今天（或昨天）连续来访的天数 */
  streakDays: number;
  /** 来访时段直方图（24 格，会话开始的小时） */
  hourHistogram: number[];
  usualHour: number | null;
  /** 近 7 天听得最多的曲目（≥ 2 次才算） */
  topTrackThisWeek: { id: string; plays: number } | null;
  /** 近 7 天有深夜（23–5 点）活动的天数 */
  lateNightsThisWeek: number;
  avgSessionMin: number | null;
}

export interface LastSession {
  endedAt: number;
  endedAtHour: number;
  trackId?: string;
  trackTitle?: string;
  readingId?: string;
  readingTitle?: string;
  readingProgress?: number;
}

/** 台词规则直接读的记忆事实（A6.4）。 */
export interface MemoryFacts {
  firstMetDate: string | null;
  daysTogether: number;
  streakDays: number;
  /** 距上一次会话结束的天数（同一天为 0）；从没来过为 null */
  daysSinceLastVisit: number | null;
  /** 距上一次会话结束的分钟数 */
  minutesSinceLastVisit: number | null;
  lastSession: LastSession | null;
  topTrackThisWeek: { id: string; plays: number } | null;
  usualHour: number | null;
  lateNightsThisWeek: number;
  /** 认识第 100/200/300…/365 天（今天正好是）时的天数 */
  anniversary: number | null;
  /** 今天是否有珍藏事件的周年 */
  pinnedToday: PinnedMemory | null;
  /** 今天这首听了几次（由调用方按当前曲目取） */
  playsToday: (trackId: string) => number;
}

export interface MemoryQuery {
  kinds?: MemoryKind[];
  since?: number;
  tags?: string[];
  limit?: number;
}

export interface MemoryStore {
  append(e: Omit<MemoryEvent, 'id' | 't' | 'tags' | 'importance'> & Partial<Pick<MemoryEvent, 't' | 'tags' | 'importance'>>): MemoryEvent;
  query(q: MemoryQuery): MemoryEvent[];
  profile(): Profile;
  facts(now?: number): MemoryFacts;
  pin(m: Omit<PinnedMemory, 'id'>): void;
  pinned(): PinnedMemory[];
  markSaid(key: string, t?: number): void;
  lastSaid(key: string): number | undefined;
  export(): MemoryDump;
  import(d: MemoryDump): void;
  forget(scope: 'all' | 'stream' | 'pinned'): void;
}

export const MEMORY_KEY = 'oasis_miku_memory_v1';
export const MEMORY_BUDGET_BYTES = 200 * 1024;
const RAW_DAYS = 30;
const DAY_SUMMARY_DAYS = 365;
const SAID_CAP = 400;
const PIN_THRESHOLD = 8;
const DAY_MS = 86_400_000;

export const DEFAULT_IMPORTANCE: Record<MemoryKind, number> = {
  'session-start': 1, 'session-end': 1, listen: 1, skip: 1, read: 3, publish: 8, write: 2, care: 4, milestone: 7, pat: 1,
};

const pad = (n: number) => String(n).padStart(2, '0');
export const localDate = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dayIndex = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(new Date(y, m - 1, d).getTime() / DAY_MS);
};

const emptyDump = (): MemoryDump => ({ v: 1, firstMetAt: null, stream: [], days: [], months: [], pinned: [], said: {} });

/** 迁移：现在只有 v1；以后加字段在这里补缺省值，旧数据不丢。 */
export const migrate = (raw: unknown): MemoryDump => {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<MemoryDump>;
  return {
    v: 1,
    firstMetAt: typeof d.firstMetAt === 'number' ? d.firstMetAt : null,
    stream: Array.isArray(d.stream) ? d.stream : [],
    days: Array.isArray(d.days) ? d.days : [],
    months: Array.isArray(d.months) ? d.months : [],
    pinned: Array.isArray(d.pinned) ? d.pinned : [],
    said: d.said && typeof d.said === 'object' ? d.said : {},
  };
};

const summarizeDay = (date: string, events: MemoryEvent[]): DaySummary => {
  const s: DaySummary = { date, counts: {}, tracks: {}, hours: [] };
  for (const e of events) {
    s.counts[e.kind] = (s.counts[e.kind] ?? 0) + 1;
    if (e.kind === 'listen' && typeof e.data?.trackId === 'string') s.tracks[e.data.trackId] = (s.tracks[e.data.trackId] ?? 0) + 1;
    const h = new Date(e.t).getHours();
    if (!s.hours.includes(h)) s.hours.push(h);
  }
  return s;
};

const mergeDay = (a: DaySummary, b: DaySummary): DaySummary => {
  const counts = { ...a.counts };
  for (const [k, n] of Object.entries(b.counts)) counts[k as MemoryKind] = (counts[k as MemoryKind] ?? 0) + (n ?? 0);
  const tracks = { ...a.tracks };
  for (const [k, n] of Object.entries(b.tracks)) tracks[k] = (tracks[k] ?? 0) + n;
  return { date: a.date, counts, tracks, hours: [...new Set([...a.hours, ...b.hours])] };
};

/** 汇总：rawDays 天以前的事件折成日汇总，dayDays 天以前的日汇总折成月汇总。纯函数。 */
export const compact = (dump: MemoryDump, now: number, rawDays = RAW_DAYS, dayDays = DAY_SUMMARY_DAYS): MemoryDump => {
  const rawCut = now - rawDays * DAY_MS;
  const old = dump.stream.filter(e => e.t < rawCut);
  const stream = dump.stream.filter(e => e.t >= rawCut);
  const byDate = new Map(dump.days.map(d => [d.date, d]));
  const grouped = new Map<string, MemoryEvent[]>();
  for (const e of old) {
    const date = localDate(e.t);
    grouped.set(date, [...(grouped.get(date) ?? []), e]);
  }
  for (const [date, events] of grouped) {
    const s = summarizeDay(date, events);
    byDate.set(date, byDate.has(date) ? mergeDay(byDate.get(date)!, s) : s);
  }
  const todayIdx = dayIndex(localDate(now));
  const days: DaySummary[] = [];
  const months = new Map(dump.months.map(m => [m.month, { ...m, counts: { ...m.counts } }]));
  for (const d of [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    if (todayIdx - dayIndex(d.date) <= dayDays) { days.push(d); continue; }
    const month = d.date.slice(0, 7);
    const m = months.get(month) ?? { month, days: 0, counts: {} };
    m.days += 1;
    for (const [k, n] of Object.entries(d.counts)) m.counts[k as MemoryKind] = (m.counts[k as MemoryKind] ?? 0) + (n ?? 0);
    months.set(month, m);
  }
  return { ...dump, stream, days, months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)) };
};

/** 容量预算：先按常规汇总；仍超就逐步收紧（原样天数减半），最后丢最旧的日汇总。珍藏永不丢。 */
export const fitBudget = (dump: MemoryDump, now: number, budget = MEMORY_BUDGET_BYTES): MemoryDump => {
  let d = compact(dump, now);
  let rawDays = RAW_DAYS;
  const size = (x: MemoryDump) => JSON.stringify(x).length * 2; // UTF-16 粗估，宁大勿小
  while (size(d) > budget && rawDays > 1) {
    rawDays = Math.max(1, Math.floor(rawDays / 2));
    d = compact(d, now, rawDays);
  }
  while (size(d) > budget && d.days.length) d = { ...d, days: d.days.slice(1) };
  while (size(d) > budget && d.months.length) d = { ...d, months: d.months.slice(1) };
  return d;
};

/** 反思：从事件流 + 日汇总算画像。纯函数，可用假时钟测试。 */
export const reflect = (dump: MemoryDump, now: number): Profile => {
  const visit = new Set<string>(dump.days.filter(d => (d.counts['session-start'] ?? 0) > 0).map(d => d.date));
  const hourHistogram = new Array(24).fill(0);
  for (const d of dump.days) if (d.counts['session-start']) for (const h of d.hours) hourHistogram[h] += 1;
  const sessions: number[] = [];
  let openAt: number | null = null;
  for (const e of dump.stream) {
    if (e.kind === 'session-start') {
      visit.add(localDate(e.t));
      hourHistogram[new Date(e.t).getHours()] += 1;
      openAt = e.t;
    } else if (e.kind === 'session-end' && openAt !== null) {
      sessions.push((e.t - openAt) / 60000);
      openAt = null;
    }
  }
  const visitDays = [...visit].sort();
  const today = dayIndex(localDate(now));
  let streak = 0;
  const visitIdx = new Set(visitDays.map(dayIndex));
  // 今天还没算进来时，从昨天往回数也算连续（今天的会话开始事件可能还没写）
  let cursor = visitIdx.has(today) ? today : today - 1;
  while (visitIdx.has(cursor)) { streak += 1; cursor -= 1; }

  const weekAgo = now - 7 * DAY_MS;
  const plays = new Map<string, number>();
  const lateDays = new Set<string>();
  for (const e of dump.stream) {
    if (e.t < weekAgo) continue;
    if (e.kind === 'listen' && typeof e.data?.trackId === 'string') plays.set(e.data.trackId, (plays.get(e.data.trackId) ?? 0) + 1);
    const h = new Date(e.t).getHours();
    if (h >= 23 || h < 5) lateDays.add(localDate(e.t - (h < 5 ? DAY_MS : 0))); // 凌晨算前一晚
  }
  for (const d of dump.days) {
    if (today - dayIndex(d.date) > 7) continue;
    for (const [id, n] of Object.entries(d.tracks)) plays.set(id, (plays.get(id) ?? 0) + n);
    if (d.hours.some(h => h >= 23 || h < 5)) lateDays.add(d.date);
  }
  const top = [...plays.entries()].sort((a, b) => b[1] - a[1])[0];
  const maxHour = Math.max(...hourHistogram);
  return {
    firstMetAt: dump.firstMetAt,
    daysTogether: visitDays.length + dump.months.reduce((s, m) => s + m.days, 0),
    streakDays: streak,
    hourHistogram,
    usualHour: maxHour > 0 ? hourHistogram.indexOf(maxHour) : null,
    topTrackThisWeek: top && top[1] >= 2 ? { id: top[0], plays: top[1] } : null,
    lateNightsThisWeek: lateDays.size,
    avgSessionMin: sessions.length ? sessions.reduce((a, b) => a + b, 0) / sessions.length : null,
  };
};

const ANNIVERSARIES = new Set([100, 200, 300, 365, 400, 500, 600, 700, 730, 800, 900, 1000]);

export const memoryFacts = (dump: MemoryDump, now: number, profile = reflect(dump, now)): MemoryFacts => {
  // 「上一次」= 本次会话开始之前的最后一个 session-end
  const starts = dump.stream.filter(e => e.kind === 'session-start');
  const currentStart = starts.length ? starts[starts.length - 1].t : now;
  const lastEnd = [...dump.stream].reverse().find(e => e.kind === 'session-end' && e.t <= currentStart);
  const lastSession: LastSession | null = lastEnd ? {
    endedAt: lastEnd.t,
    endedAtHour: new Date(lastEnd.t).getHours(),
    ...(lastEnd.data as Omit<LastSession, 'endedAt' | 'endedAtHour'>),
  } : null;
  const lastDays = dump.days.length ? dump.days[dump.days.length - 1].date : null;
  const lastVisitT = lastEnd?.t ?? (lastDays ? new Date(`${lastDays}T12:00:00`).getTime() : null);
  const today = localDate(now);
  const dayMs = (t: number) => dayIndex(localDate(t));
  const pinnedToday = dump.pinned.find(p => localDate(p.t).slice(5) === today.slice(5) && localDate(p.t) !== today) ?? null;
  const todayStart = new Date(`${today}T00:00:00`).getTime();
  const listensToday = dump.stream.filter(e => e.kind === 'listen' && e.t >= todayStart);
  return {
    firstMetDate: profile.firstMetAt ? localDate(profile.firstMetAt) : null,
    daysTogether: profile.daysTogether,
    streakDays: profile.streakDays,
    daysSinceLastVisit: lastVisitT === null ? null : dayIndex(today) - dayMs(lastVisitT),
    minutesSinceLastVisit: lastVisitT === null ? null : Math.round((now - lastVisitT) / 60000),
    lastSession,
    topTrackThisWeek: profile.topTrackThisWeek,
    usualHour: profile.usualHour,
    lateNightsThisWeek: profile.lateNightsThisWeek,
    anniversary: ANNIVERSARIES.has(profile.daysTogether) ? profile.daysTogether : null,
    pinnedToday,
    playsToday: (trackId: string) => listensToday.filter(e => e.data?.trackId === trackId).length,
  };
};

const newId = (t: number) => `${t.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * localStorage 适配器。读写都 try/catch；存储不可用（隐私模式、配额满）时降级为只在内存里保存本次会话。
 * profile 读缓存，写入新事件后才重算。
 */
export class LocalMemoryStore implements MemoryStore {
  private dump: MemoryDump;
  private storage: StorageLike | null;
  private cachedProfile: { at: number; value: Profile } | null = null;
  private readonly clock: () => number;

  constructor(opts: { storage?: StorageLike | null; now?: () => number } = {}) {
    this.clock = opts.now ?? Date.now;
    this.storage = opts.storage === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : opts.storage;
    let raw: unknown;
    try { raw = JSON.parse(this.storage?.getItem(MEMORY_KEY) ?? 'null'); } catch { raw = null; }
    this.dump = migrate(raw);
  }

  /** 存储是否真的可写（false = 仅本次会话的内存记忆） */
  get persistent() { return this.storage !== null; }

  private lastCompactDay = '';

  private save() {
    this.cachedProfile = null;
    if (!this.storage) return;
    // 汇总每天做一次（跨天后第一次写入时），或者体积超预算时；平时只序列化一次
    const now = this.clock();
    const today = localDate(now);
    let json = JSON.stringify(this.dump);
    if (today !== this.lastCompactDay || json.length * 2 > MEMORY_BUDGET_BYTES) {
      this.lastCompactDay = today;
      this.dump = fitBudget(this.dump, now);
      json = JSON.stringify(this.dump);
    }
    try {
      this.storage.setItem(MEMORY_KEY, json);
    } catch {
      // 配额满或被禁用：之后只留在内存里
      this.storage = null;
    }
  }

  append(e: Parameters<MemoryStore['append']>[0]): MemoryEvent {
    const t = e.t ?? this.clock();
    const event: MemoryEvent = {
      id: newId(t),
      t,
      kind: e.kind,
      data: e.data,
      importance: e.importance ?? DEFAULT_IMPORTANCE[e.kind],
      tags: e.tags ?? [],
    };
    this.dump.stream.push(event);
    if (this.dump.firstMetAt === null) this.dump.firstMetAt = t;
    if (event.importance >= PIN_THRESHOLD) {
      this.dump.pinned.push({ id: event.id, t, kind: event.kind, data: event.data, source: 'auto' });
    }
    this.save();
    return event;
  }

  query({ kinds, since, tags, limit }: MemoryQuery): MemoryEvent[] {
    let out = this.dump.stream.filter(e =>
      (!kinds || kinds.includes(e.kind)) && (since === undefined || e.t >= since) && (!tags || tags.some(tag => e.tags.includes(tag))));
    if (limit !== undefined) out = out.slice(-limit);
    return out;
  }

  profile(): Profile {
    const now = this.clock();
    if (this.cachedProfile && now - this.cachedProfile.at < 60_000) return this.cachedProfile.value;
    const value = reflect(this.dump, now);
    this.cachedProfile = { at: now, value };
    return value;
  }

  facts(now = this.clock()): MemoryFacts {
    return memoryFacts(this.dump, now, this.profile());
  }

  pin(m: Omit<PinnedMemory, 'id'>) {
    this.dump.pinned.push({ ...m, id: newId(m.t) });
    this.save();
  }

  pinned() { return [...this.dump.pinned]; }

  markSaid(key: string, t = this.clock()) {
    this.dump.said[key] = t;
    const keys = Object.keys(this.dump.said);
    if (keys.length > SAID_CAP) {
      for (const k of keys.sort((a, b) => this.dump.said[a] - this.dump.said[b]).slice(0, keys.length - SAID_CAP)) delete this.dump.said[k];
    }
    this.save();
  }

  lastSaid(key: string) { return this.dump.said[key]; }

  export(): MemoryDump { return JSON.parse(JSON.stringify(this.dump)); }

  import(d: MemoryDump) {
    // 合并而非覆盖：事件按 id 去重（以后多设备同步也走这条）
    const incoming = migrate(d);
    const ids = new Set(this.dump.stream.map(e => e.id));
    this.dump.stream = [...this.dump.stream, ...incoming.stream.filter(e => !ids.has(e.id))].sort((a, b) => a.t - b.t);
    const pins = new Set(this.dump.pinned.map(p => p.id));
    this.dump.pinned.push(...incoming.pinned.filter(p => !pins.has(p.id)));
    const days = new Map(this.dump.days.map(x => [x.date, x]));
    for (const day of incoming.days) days.set(day.date, days.has(day.date) ? mergeDay(days.get(day.date)!, day) : day);
    this.dump.days = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
    const firsts = [this.dump.firstMetAt, incoming.firstMetAt].filter((x): x is number => x !== null);
    this.dump.firstMetAt = firsts.length ? Math.min(...firsts) : null;
    this.save();
  }

  forget(scope: 'all' | 'stream' | 'pinned') {
    if (scope === 'all') this.dump = emptyDump();
    if (scope === 'stream') this.dump = { ...this.dump, stream: [], days: [], months: [] };
    if (scope === 'pinned') this.dump = { ...this.dump, pinned: [] };
    this.save();
  }
}

/** 访客与预览模式用的「不记」：读出空记忆，写入一律丢弃。 */
export class NullMemoryStore implements MemoryStore {
  private said: Record<string, number> = {};
  append(e: Parameters<MemoryStore['append']>[0]): MemoryEvent {
    return { id: 'null', t: e.t ?? Date.now(), kind: e.kind, importance: 0, tags: [] };
  }
  query() { return []; }
  profile(): Profile { return reflect(emptyDump(), Date.now()); }
  facts(now = Date.now()) { return memoryFacts(emptyDump(), now); }
  pin() {}
  pinned() { return []; }
  // 访客也需要「最久没说过」：只记在内存里，本次会话有效
  markSaid(key: string, t = Date.now()) { this.said[key] = t; }
  lastSaid(key: string) { return this.said[key]; }
  export() { return emptyDump(); }
  import() {}
  forget() { this.said = {}; }
}
