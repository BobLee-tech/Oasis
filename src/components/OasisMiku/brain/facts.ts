// 📋 事实黑板（docs/miku-design.md A4.1）：每次决定「说不说、说什么」之前取一份快照。
//   纯函数：输入是此刻能观察到的一切（时间、关系、音乐、站点、触碰、记忆、心境），输出是台词规则
//   能直接引用的扁平事实。规则的条件（when）和槽位（{reading.title}）都按这里的字段路径取值。
//
//   隐私在这一层就收口：访客的事实里没有 editing、memory、听歌统计与 note 原文——规则写错了
//   也说不出来（另有 mikuRules.test 的静态检查兜底）。
import type { AppView } from '../../../types/auth';
import type { BlogPost } from '../../../hooks/useGarden';
import type { MikuReadingPost } from '../../../lib/mikuSignal';
import type { MemoryFacts } from '../../../lib/mikuMemory';
import type { Feel, ResolvedTrackMood } from '../../../lib/trackMood';
import type { TrackFacts } from '../../../lib/trackProfile';
import { currentPeriod, isLateNight, type DayPeriod } from '../../../lib/timeContext';
import { currentSolarTerm, daysIntoTerm, termNoteOfDay } from '../../../lib/solarTerms';
import { isLunarDate } from '../../../lib/lunar';
import type { EmotionKind } from './affect';

export interface FactsInput {
  now: Date;
  owner: boolean;
  visitorAlias?: string | null;
  view: AppView;
  playing: boolean;
  track?: { id: string; title: string; artist: string; category: string };
  trackFacts?: TrackFacts;
  mood?: ResolvedTrackMood;
  chorus?: 'in' | 'soon' | null;
  /** 曲目 id → 标题（「这周你听了 N 遍《…》」要把记忆里的 id 翻成名字） */
  titleOf?: (id: string) => string | undefined;
  reading?: (MikuReadingPost & { openedAt: number; progress: number }) | null;
  editing?: { words: number; openedAt: number } | null;
  published?: { id?: string; title?: string } | null;
  /** 刚才离开了多少分钟（「回来了」事件带上） */
  awayMinutes?: number;
  /** 这件照顾今天（深夜是今晚）已经提过几次：0 第一次，1 第二次（更轻） */
  careRepeat?: number;
  posts: BlogPost[];
  zone?: string | null;
  gesture?: string | null;
  combo: number;
  patsTotal: number;
  patsToday: number;
  memory: MemoryFacts | null;
  affect: { v: number; a: number; emotion: EmotionKind | null };
}

const CN_HOUR = ['零', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
/** 「两点」「十一点」——深夜关照里说的钟点，按 12 小时制口语 */
export const hourText = (hour: number) => `${CN_HOUR[hour % 12 === 0 && hour !== 0 ? 12 : hour % 12]}点`;

const RELATION_PHRASE: Record<string, string> = {
  reply: '它的回信',
  sequel: '它的续篇',
  sameStory: '同一个故事的另一面',
  sameLyrics: '同一段词的另一个版本',
};

const pad = (n: number) => String(n).padStart(2, '0');
const DAY = 86_400_000;

/** 亲密度档位：拍头次数与相处天数取较高者（A7：避免只靠拍头刷亲密度）；访客上限 2。 */
export const intimacyOf = (patsTotal: number, daysTogether: number, owner: boolean): 0 | 1 | 2 | 3 => {
  const byPats = patsTotal >= 100 ? 3 : patsTotal >= 50 ? 2 : patsTotal >= 20 ? 1 : 0;
  if (!owner) return Math.min(2, byPats) as 0 | 1 | 2;
  const byDays = daysTogether >= 100 ? 3 : daysTogether >= 30 ? 2 : daysTogether >= 7 ? 1 : 0;
  return Math.max(byPats, byDays) as 0 | 1 | 2 | 3;
};

export const buildFacts = (input: FactsInput) => {
  const { now, owner } = input;
  const hour = now.getHours();
  const term = currentSolarTerm(now);
  const into = daysIntoTerm(now);
  const mood = input.mood;
  const tf = input.trackFacts;
  const memory = owner ? input.memory : null;

  // 文章：访客只看公开发布的（unlisted 是「知道链接才能读」，不主动推荐）；草稿本就不在缓存里
  const listed = input.posts.filter(p => p.status === 'published').sort((a, b) => b.createdAt - a.createdAt);
  const latest = listed[0];
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const reading = input.reading ? {
    id: input.reading.id,
    title: input.reading.title,
    category: input.reading.category,
    series: input.reading.series,
    words: input.reading.words,
    // 中文约 400 字/分钟
    minutes: Math.max(1, Math.round(input.reading.words / 400)),
    progress: input.reading.progress,
    progressPct: Math.round(input.reading.progress * 100),
    openMinutes: Math.floor((now.getTime() - input.reading.openedAt) / 60000),
  } : undefined;

  const relation = tf?.relationToPrev ? {
    kind: tf.relationToPrev.kind,
    phrase: RELATION_PHRASE[tf.relationToPrev.kind],
    toTitle: input.titleOf?.(tf.relationToPrev.to),
  } : undefined;

  const lastSession = memory?.lastSession ?? undefined;
  const topTrack = memory?.topTrackThisWeek ?? undefined;

  return {
    // 时间
    hour,
    hourText: hourText(hour),
    period: currentPeriod(now) as DayPeriod,
    lateNight: isLateNight(now),
    weekday: now.getDay(),
    mmdd: `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    lunarBirthday: isLunarDate(6, 3, now),
    solarTerm: term.name,
    /** 交节当天 */
    termDay: into === 0,
    termNote: termNoteOfDay(now),

    // 关系
    owner,
    visitorAlias: owner ? undefined : input.visitorAlias ?? undefined,

    // 音乐
    playing: input.playing,
    trackId: input.playing ? input.track?.id : undefined,
    trackTitle: input.playing ? input.track?.title : undefined,
    artist: input.playing ? input.track?.artist : undefined,
    category: input.playing ? input.track?.category : undefined,
    titleAlt: input.playing ? tf?.titleAlt : undefined,
    composer: input.playing ? tf?.composer : undefined,
    album: input.playing ? tf?.album : undefined,
    year: input.playing ? tf?.year : undefined,
    introFirst: input.playing ? tf?.introFirst : undefined,
    // note：站主看原文；访客只拿「可以转述」的那句（notePrivate 时为空）
    note: input.playing && owner ? tf?.note ?? mood?.note : undefined,
    noteForVisitor: input.playing && !owner && !mood?.notePrivate ? tf?.noteForVisitor ?? mood?.noteVisitor ?? mood?.note : undefined,
    relation: input.playing ? relation : undefined,
    feel: input.playing ? (mood?.feel as Feel | undefined) : undefined,
    /** 曲目效价：只在人标或专辑默认时给（缺省的 +0.15 是猜的，不该据此判断「低落的歌」） */
    trackValence: input.playing && mood && (mood.provenance.valence === 'manual' || mood.provenance.valence === 'album') ? mood.valence : undefined,
    /** feel 是人标或专辑默认（不是 VA 猜的）：按 feel 说话的规则只在有把握时说 */
    feelSure: !!mood && (mood.provenance.feel === 'manual' || mood.provenance.feel === 'album'),
    season: input.playing ? mood?.season : undefined,
    inChorus: input.chorus === 'in',
    playsToday: owner && input.playing && input.track && input.memory ? input.memory.playsToday(input.track.id) : undefined,

    // 站点
    view: input.view,
    reading,
    editing: owner && input.editing ? {
      words: input.editing.words,
      minutes: Math.floor((now.getTime() - input.editing.openedAt) / 60000),
    } : undefined,
    publishedTitle: owner ? input.published?.title : undefined,
    awayMinutes: input.awayMinutes,
    careRepeat: input.careRepeat,
    latestPost: latest ? { title: latest.title, daysAgo: Math.floor((now.getTime() - latest.createdAt) / DAY) } : undefined,
    postsThisMonth: listed.filter(p => p.createdAt >= monthStart).length,

    // 交互
    zone: input.zone ?? undefined,
    gesture: input.gesture ?? undefined,
    combo: input.combo,
    patsTotal: input.patsTotal,
    patsToday: input.patsToday,
    intimacy: intimacyOf(input.patsTotal, memory?.daysTogether ?? 0, owner),

    // 记忆（访客为 undefined）
    memory: memory ? {
      daysTogether: memory.daysTogether,
      streakDays: memory.streakDays,
      daysSinceLastVisit: memory.daysSinceLastVisit ?? undefined,
      minutesSinceLastVisit: memory.minutesSinceLastVisit ?? undefined,
      lateNightsThisWeek: memory.lateNightsThisWeek,
      anniversary: memory.anniversary ?? undefined,
      usualHour: memory.usualHour ?? undefined,
      lastSession: lastSession ? {
        hourText: hourText(lastSession.endedAtHour),
        endedLate: lastSession.endedAtHour >= 23 || lastSession.endedAtHour < 5,
        trackTitle: lastSession.trackTitle,
        readingTitle: lastSession.readingTitle,
        readingProgressPct: lastSession.readingProgress !== undefined ? Math.round(lastSession.readingProgress * 100) : undefined,
      } : undefined,
      topTrack: topTrack ? { title: input.titleOf?.(topTrack.id), plays: topTrack.plays } : undefined,
    } : undefined,

    // 她的心境
    valence: input.affect.v,
    arousal: input.affect.a,
    emotion: input.affect.emotion ?? undefined,
  };
};

export type Facts = ReturnType<typeof buildFacts>;
