// 🫖 照顾行为的触发器（docs/miku-design.md A7）。纯逻辑、时间从外面传进来，单测用假时钟跑（care.test.ts）。
//
//   守则：照顾不说教——同一件事一天最多提两次，第二次更轻（规则按 careRepeat 换句）。
//
//   | 行为     | 触发                                                         | 上限                 |
//   | 深夜关照 | 1 点以后且本次会话（页面可见）≥ 20 分钟；3 点以后再一次，更轻   | 每晚两次（两档各一次） |
//   | 久坐     | 真实活动连续 50 分钟（2 分钟内有输入算在场，空闲 ≥ 5 分钟算休息过）| 间隔 ≥ 2 小时，每天 ≤ 2 |
//   | 长时间写作 | 编辑器开着超过 60 分钟，且人还在写（5 分钟内有输入）            | 每次打开一次，每天 ≤ 2 |
//   | 回来了   | 离开 ≥ 10 分钟，或跨了一天                                     | —                    |
//
//   「注意到模式」（深夜循环同一首低效价的歌）在换歌时由规则判断（care-loop），不走这里的计时。
import { localDate } from '../../../lib/mikuMemory';

export type CareKind = 'care-late' | 'care-sedentary' | 'care-long-write';

export const ACTIVE_WINDOW_MS = 2 * 60_000;
export const BREAK_MS = 5 * 60_000;
export const SEDENTARY_MS = 50 * 60_000;
export const SEDENTARY_GAP_MS = 2 * 3_600_000;
export const LATE_SESSION_MS = 20 * 60_000;
export const LONG_WRITE_MS = 60 * 60_000;
export const RETURN_AWAY_MS = 10 * 60_000;
const DAILY_CAP = 2;

/** 「这一晚」的日期：凌晨 0–6 点算前一晚 */
export const nightKey = (t: number) => localDate(t - 6 * 3_600_000);

export interface CareInput {
  now: number;
  hour: number;
  visible: boolean;
  /** 最近一次真实输入（指针、键盘、滚轮、触摸）的时间 */
  lastInputAt: number;
  /** 编辑器打开的时间；没开为 null */
  editingSince: number | null;
  /** 允许的照顾种类（访客只有久坐；深夜关照与写作是对站主的） */
  allowed?: readonly CareKind[];
}

export interface CareFiring {
  kind: CareKind;
  /** 今天（深夜关照是「今晚」）这件事已经提过几次：0 = 第一次，1 = 第二次（更轻） */
  repeat: number;
}

export class CareScheduler {
  /** 本次会话页面可见的累计时长 */
  sessionMs = 0;
  /** 连续在场的时长（休息过就清零） */
  activeSpanMs = 0;
  private idleMs = 0;
  private lastSedentaryAt = -Infinity;
  private lateFiredAt = -Infinity;
  private longWriteFor: number | null = null;
  private counts = new Map<string, number>();

  private key(kind: CareKind, now: number) {
    return `${kind}|${kind === 'care-late' ? nightKey(now) : localDate(now)}`;
  }

  count(kind: CareKind, now: number) {
    return this.counts.get(this.key(kind, now)) ?? 0;
  }

  /** 从记忆里恢复今天已经提过的次数（刷新页面不会再提一遍） */
  restore(events: { t: number; type: string }[]) {
    for (const e of events) {
      const kind = e.type as CareKind;
      if (kind !== 'care-late' && kind !== 'care-sedentary' && kind !== 'care-long-write') continue;
      const k = this.key(kind, e.t);
      this.counts.set(k, (this.counts.get(k) ?? 0) + 1);
      if (kind === 'care-sedentary') this.lastSedentaryAt = Math.max(this.lastSedentaryAt, e.t);
      if (kind === 'care-late') this.lateFiredAt = Math.max(this.lateFiredAt, e.t);
    }
  }

  /**
   * 推进时间并判断此刻该不该照顾一下。最多返回一件（优先级：深夜 > 长时间写作 > 久坐）；
   * 返回后调用方说出来了，要调 fired() 记账；没说出来（比如被收起了）就不记，之后条件仍满足会再给。
   */
  tick(dt: number, input: CareInput): CareFiring | null {
    const { now } = input;
    if (input.visible) this.sessionMs += dt;
    const present = input.visible && now - input.lastInputAt < ACTIVE_WINDOW_MS;
    if (present) {
      this.activeSpanMs += dt;
      this.idleMs = 0;
    } else {
      // 休息多久从「最后一次输入」算起（不是从在场窗口过期算起）；标签页藏起来则按藏起来的时长算
      this.idleMs += dt;
      const idleFor = input.visible ? now - input.lastInputAt : this.idleMs;
      if (idleFor >= BREAK_MS) this.activeSpanMs = 0;
    }
    if (!input.visible) return null;
    const ok = (kind: CareKind) => !input.allowed || input.allowed.includes(kind);

    // 深夜关照：1 点以后会话满 20 分钟提一次；3 点以后（且距第一次 ≥ 1 小时）再轻轻提一次
    const lateCount = this.count('care-late', now);
    if (ok('care-late') && input.hour >= 1 && input.hour < 6 && this.sessionMs >= LATE_SESSION_MS && present) {
      if (lateCount === 0) return { kind: 'care-late', repeat: 0 };
      if (lateCount === 1 && input.hour >= 3 && now - this.lateFiredAt >= 3_600_000) return { kind: 'care-late', repeat: 1 };
    }

    // 长时间写作：每次打开编辑器最多一次
    if (ok('care-long-write') && input.editingSince !== null && this.longWriteFor !== input.editingSince
      && now - input.editingSince >= LONG_WRITE_MS && now - input.lastInputAt < BREAK_MS
      && this.count('care-long-write', now) < DAILY_CAP) {
      return { kind: 'care-long-write', repeat: this.count('care-long-write', now) };
    }

    // 久坐：连续在场 50 分钟，距上次 ≥ 2 小时，每天 ≤ 2
    if (ok('care-sedentary') && this.activeSpanMs >= SEDENTARY_MS && now - this.lastSedentaryAt >= SEDENTARY_GAP_MS && this.count('care-sedentary', now) < DAILY_CAP) {
      return { kind: 'care-sedentary', repeat: this.count('care-sedentary', now) };
    }
    return null;
  }

  fired(kind: CareKind, now: number, editingSince: number | null = null) {
    const k = this.key(kind, now);
    this.counts.set(k, (this.counts.get(k) ?? 0) + 1);
    if (kind === 'care-sedentary') { this.lastSedentaryAt = now; this.activeSpanMs = 0; }
    if (kind === 'care-late') this.lateFiredAt = now;
    if (kind === 'care-long-write') this.longWriteFor = editingSince;
  }
}

/** 「回来了」：离开 ≥ 10 分钟，或者离开时和回来时不是同一天。 */
export const isReturn = (hiddenAt: number, now: number) =>
  now - hiddenAt >= RETURN_AWAY_MS || localDate(hiddenAt) !== localDate(now);
