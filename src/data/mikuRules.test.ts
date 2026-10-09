// 台词质量测试（docs/miku-design.md A4.4）：规则库的静态检查——口癖、黑名单、称呼槽位、访客隐私、槽位存在。
import { describe, expect, it } from 'vitest';
import { MIKU_RULES } from './mikuRules';
import { RESERVED_TERMS } from './mikuAddress';
import { slotsOf, getPath } from '../components/OasisMiku/brain/dialogue';
import { buildFacts } from '../components/OasisMiku/brain/facts';
import type { BlogPost } from '../hooks/useGarden';
import type { MemoryFacts } from '../lib/mikuMemory';
import type { ResolvedTrackMood } from '../lib/trackMood';

const lines = MIKU_RULES.flatMap(r => r.say.map(line => ({ rule: r, line })));
const PARTICLE_END = /[呢哦呀啦嘛哟][。！？~～）)…—\s]*$/;
const BLACKLIST = ['一段光', '像素', '数据', '虚拟', '隔着屏幕'];

/** 一份「所有字段都有值」的事实样本：用来检查槽位与条件路径确实存在 */
const fullFacts = () => {
  const post: BlogPost = { id: 'p', title: '春', excerpt: '', date: '', createdAt: Date.now() - 86400000, updatedAt: 0, growth: 'seed' as BlogPost['growth'], status: 'published', type: 'thought' as BlogPost['type'], tags: [], color: '', content: '' };
  const memory: MemoryFacts = {
    firstMetDate: '2026-01-01', daysTogether: 100, streakDays: 7, daysSinceLastVisit: 1, minutesSinceLastVisit: 600,
    lastSession: { endedAt: 0, endedAtHour: 2, trackId: 'm_01', trackTitle: 't', readingId: 'p', readingTitle: '春', readingProgress: 0.4 },
    topTrackThisWeek: { id: 'm_01', plays: 5 }, usualHour: 21, lateNightsThisWeek: 3, anniversary: 100, pinnedToday: null, playsToday: () => 3,
  };
  const mood = {
    feel: 'sad', valence: -0.5, arousal: 0.5, time: 'night', provenance: { feel: 'manual', valence: 'manual', feels: 'manual' }, note: 'n', noteVisitor: 'nv', season: 'summer',
    // P4：每个情绪维都有值，'feels.x' 这类条件路径才能被检查到
    feels: { tender: 2, nostalgic: 2, sad: 2, peaceful: 2, joyful: 2, tense: 2, wonder: 2, power: 2, transcendence: 2, defiant: 2 },
    blend: 'setsunai', lyricValence: -0.6, soundValence: 0.4, split: true, sure: true, imagery: ['rain'],
    arc: [], segments: [['chorus', 0, 10000]],
  } as unknown as ResolvedTrackMood;
  const owner = buildFacts({
    now: new Date(), owner: true, view: 'garden', playing: true,
    track: { id: 'm_01', title: 't', artist: 'a', category: 'Miku' },
    trackFacts: { titleAlt: 'ta', composer: 'c', album: 'al', year: 2020, introFirst: 'i', note: 'n', noteForVisitor: 'nv', relationToPrev: { kind: 'reply', to: 'm_02' } },
    titleOf: () => 'x', mood, chorus: 'in', segment: { at: 'chorus', n: 1, index: 0 },
    reading: { id: 'p', title: '春', category: 'thought', series: 's', words: 4000, openedAt: Date.now() - 1_800_000, progress: 0.4 },
    editing: { words: 2000, openedAt: Date.now() - 4_000_000 }, published: { title: '春' },
    posts: [post], zone: 'head', gesture: 'tap', awayMinutes: 130, careRepeat: 1, combo: 0, patsTotal: 100, patsToday: 3, memory,
    affect: { v: 0, a: 0, emotion: 'pained' },
    felt: { tender: 2, nostalgic: 2, sad: 2, peaceful: 2, joyful: 2, tense: 2, wonder: 2, power: 2, transcendence: 2, defiant: 2 },
    sessionLean: 'sad',
  });
  return { owner, visitor: buildFacts({ ...{
    now: new Date(), owner: false, visitorAlias: '阿树', view: 'garden' as const, playing: true,
    track: { id: 'm_01', title: 't', artist: 'a', category: 'Miku' },
    trackFacts: { titleAlt: 'ta', note: 'n', noteForVisitor: 'nv' }, mood, segment: { at: 'chorus' as const, n: 1, index: 0 },
    reading: { id: 'p', title: '春', category: 'thought', words: 100, openedAt: 0, progress: 0.2 },
    editing: { words: 2000, openedAt: 0 }, posts: [post], combo: 0, patsTotal: 100, patsToday: 0, memory,
    affect: { v: 0, a: 0, emotion: null },
    // 就算调用方误传了，访客的事实里也不该有
    felt: { peaceful: 3 }, sessionLean: 'sad' as const,
  } }) };
};

describe('规则库结构', () => {
  it('id 唯一', () => {
    const ids = MIKU_RULES.map(r => r.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('槽位与条件路径都是事实里真有的字段', () => {
    const { owner, visitor } = fullFacts();
    // 有些字段只有访客才有（noteForVisitor、visitorAlias），两份样本任一有值即可
    const has = (path: string) => getPath(owner, path) !== undefined || getPath(visitor, path) !== undefined;
    for (const { rule, line } of lines) {
      for (const slot of slotsOf(line)) expect(has(slot), `${rule.id}: {${slot}}`).toBe(true);
    }
    for (const rule of MIKU_RULES) {
      for (const path of Object.keys(rule.when ?? {})) {
        // 条件路径可能对应「访客时为空」的字段，但路径本身在站主样本里必须存在
        expect(has(path), `${rule.id}: when.${path}`).toBe(true);
      }
      if (rule.onceKey) for (const slot of slotsOf(rule.onceKey)) expect(has(slot), `${rule.id}: onceKey`).toBe(true);
    }
  });
});

describe('口吻', () => {
  it('句尾语气词（呢/哦/呀/啦/嘛/哟）全库 ≤ 30%', () => {
    const tail = lines.filter(l => PARTICLE_END.test(l.line));
    console.info(`句尾语气词 ${tail.length}/${lines.length}（${Math.round((tail.length / lines.length) * 100)}%）`);
    expect(tail.length / lines.length).toBeLessThanOrEqual(0.3);
  });

  it('每条规则里「……」最多一句', () => {
    for (const rule of MIKU_RULES) {
      expect(rule.say.filter(line => line.includes('……')).length, rule.id).toBeLessThanOrEqual(1);
    }
  });

  it('黑名单词全库 ≤ 2 句，且只在 once:ever 的规则里', () => {
    const hits = lines.filter(l => BLACKLIST.some(w => l.line.includes(w)));
    expect(hits.length).toBeLessThanOrEqual(2);
    for (const h of hits) expect(h.rule.once, h.rule.id).toBe('ever');
  });

  it('模板里不硬写称呼词（必须走 {呼，} / {，呼} 槽位）', () => {
    for (const { rule, line } of lines) {
      for (const term of RESERVED_TERMS) expect(line.includes(term), `${rule.id}: ${line}`).toBe(false);
    }
  });

  // P7：AI 味的高频信号，给出上限当回归防线（数值是 2026-10-08 的现状留了一点余量）
  const ratio = (re: RegExp) => lines.filter(l => re.test(l.line)).length / lines.length;
  it('「好像」「陪」各 ≤ 5%；「……」≤ 5%', () => {
    expect(ratio(/好像/)).toBeLessThanOrEqual(0.05);
    expect(ratio(/陪/)).toBeLessThanOrEqual(0.05);
    expect(ratio(/……/)).toBeLessThanOrEqual(0.05);
  });

  it('括号里的舞台说明 ≤ 2%；「我很喜欢 / 我很开心」这类自述感受 ≤ 2%（不解释自己的感受）', () => {
    expect(ratio(/（/)).toBeLessThanOrEqual(0.02);
    expect(ratio(/我(很|也|最|挺)?(喜欢|开心|高兴|难过|安心)/)).toBeLessThanOrEqual(0.02);
  });

  // P7（2026-10-08）：这些上限防的是「用滥」，不是禁止文艺——适当的意象和文学美感是要的。
  // 用户反馈过：删成简约无感反而更差；问题在于同一种腔调堆得太多。
  it('不用滥同一种腔调：比喻「像…」≤ 10%，「适合…」≤ 4%，以「这首」开头 ≤ 15%', () => {
    expect(ratio(/像/)).toBeLessThanOrEqual(0.1);
    expect(ratio(/适合/)).toBeLessThanOrEqual(0.04);
    expect(ratio(/^这首/)).toBeLessThanOrEqual(0.15);
  });

  it('像说话不像写字：至少 15% 的句子带语气词或叹词（上限仍是句尾 ≤ 30%）', () => {
    expect(ratio(/[呢哦呀啦嘛吧啊哈诶欸嗯唔哇喂咦～~]/)).toBeGreaterThanOrEqual(0.15);
  });

  it('访客台词里「他说」只能用来转述他写过的 note，不替他编话', () => {
    for (const rule of MIKU_RULES.filter(r => r.who !== 'owner')) {
      for (const line of rule.say) if (line.includes('他说')) expect(line.includes('{noteForVisitor}'), `${rule.id}: ${line}`).toBe(true);
    }
  });

  it('称呼槽写法只有 {呼，} 和 {，呼} 两种', () => {
    for (const { rule, line } of lines) {
      const stray = line.replace(/\{呼，\}|\{，呼\}/g, '').match(/\{[^A-Za-z}][^}]*\}/);
      expect(stray, rule.id).toBeNull();
    }
  });
});

describe('访客隐私', () => {
  const visitorRules = MIKU_RULES.filter(r => r.who !== 'owner');
  const FORBIDDEN = /^(editing|memory|playsToday|note|publishedTitle)(\.|$)/;

  it('访客能用的规则不引用 editing / memory / 听歌统计 / note 原文', () => {
    for (const rule of visitorRules) {
      const paths = [...Object.keys(rule.when ?? {}), ...rule.say.flatMap(slotsOf), ...(rule.onceKey ? slotsOf(rule.onceKey) : [])];
      for (const p of paths) expect(FORBIDDEN.test(p), `${rule.id}: ${p}`).toBe(false);
    }
  });

  it('转述 note 必须放在「」里', () => {
    for (const rule of visitorRules) {
      for (const line of rule.say) {
        if (line.includes('{noteForVisitor}')) expect(line.includes('「{noteForVisitor}」'), rule.id).toBe(true);
      }
    }
  });

  it('访客的事实里根本没有 editing / memory / 听歌次数 / note 原文', () => {
    const { visitor } = fullFacts();
    expect(visitor.editing).toBeUndefined();
    expect(visitor.memory).toBeUndefined();
    expect(visitor.playsToday).toBeUndefined();
    expect(visitor.note).toBeUndefined();
    expect(visitor.noteForVisitor).toBe('nv');
    // 访客亲密度上限 2
    expect(visitor.intimacy).toBeLessThanOrEqual(2);
  });

  it('notePrivate 的歌，访客连转述都拿不到', () => {
    const facts = buildFacts({
      now: new Date(), owner: false, view: 'garden', playing: true, track: { id: 'x', title: 't', artist: 'a', category: 'Miku' },
      mood: { notePrivate: true, provenance: {} } as unknown as ResolvedTrackMood, trackFacts: { noteForVisitor: '私事' },
      posts: [], combo: 0, patsTotal: 0, patsToday: 0, memory: null, affect: { v: 0, a: 0, emotion: null },
    });
    expect(facts.noteForVisitor).toBeUndefined();
  });

  it('访客只看得到公开发布的文章（不推荐 unlisted）', () => {
    const base = { id: '', excerpt: '', date: '', updatedAt: 0, tags: [], color: '', content: '', growth: 'seed', type: 'thought' } as unknown as BlogPost;
    const facts = buildFacts({
      now: new Date(), owner: false, view: 'garden', playing: false,
      posts: [{ ...base, title: '藏起来的', status: 'unlisted', createdAt: Date.now() }, { ...base, title: '公开的', status: 'published', createdAt: Date.now() - 1000 }],
      combo: 0, patsTotal: 0, patsToday: 0, memory: null, affect: { v: 0, a: 0, emotion: null },
    });
    expect(facts.latestPost?.title).toBe('公开的');
  });
});

describe('多维情绪（P4）', () => {
  it('按情绪开口的规则都带 feelSure: true（草稿与 VA 猜的只驱动身体，不驱动台词）', () => {
    const emotional = MIKU_RULES.filter(r => Object.keys(r.when ?? {}).some(path => /^(feel|feels|blend|split|splitWay)(\.|$)/.test(path)));
    expect(emotional.length).toBeGreaterThan(20);
    for (const rule of emotional) {
      // 「没标 feel 的歌」那组反过来写 feelSure: false
      expect(rule.when!.feelSure === true || (rule.when!.feelSure === false && !rule.when!.feel), rule.id).toBe(true);
    }
  });

  it('每种复合情绪与新三维，站主和访客都有话说', () => {
    for (const blend of ['setsunai', 'release', 'fired', 'youth', 'hollow', 'smolder']) {
      expect(MIKU_RULES.some(r => r.when?.blend === blend && r.who !== 'visitor'), `${blend} 站主`).toBe(true);
      expect(MIKU_RULES.some(r => r.when?.blend === blend && r.who !== 'owner' && r.on === 'track-change'), `${blend} 访客`).toBe(true);
    }
    for (const feel of ['power', 'transcendence', 'defiant']) {
      expect(MIKU_RULES.some(r => r.when?.feel === feel && r.who === 'owner'), feel).toBe(true);
      expect(MIKU_RULES.some(r => r.when?.feel === feel && r.who === 'visitor'), feel).toBe(true);
    }
  });
});

describe('陪伴（P5）', () => {
  const OWNER_ONLY_PATH = /^(felt|sessionLean)(\.|$)/;
  it('felt / sessionLean 只能出现在 who: owner 的规则里', () => {
    const using = MIKU_RULES.filter(r =>
      [...Object.keys(r.when ?? {}), ...r.say.flatMap(slotsOf), ...(r.onceKey ? slotsOf(r.onceKey) : [])].some(p => OWNER_ONLY_PATH.test(p)));
    expect(using.length).toBeGreaterThan(0);
    for (const rule of using) expect(rule.who, rule.id).toBe('owner');
  });

  it('访客的事实里没有 felt 与听歌倾向；站主有', () => {
    const { owner, visitor } = fullFacts();
    expect(visitor.felt).toBeUndefined();
    expect(visitor.sessionLean).toBeUndefined();
    expect(owner.felt?.peaceful).toBe(2);
    expect(owner.sessionLean).toBe('sad');
  });

  it('听歌倾向不念出来：台词里没有曲数、没有维度名', () => {
    for (const rule of MIKU_RULES.filter(r => 'sessionLean' in (r.when ?? {}))) {
      for (const line of rule.say) {
        expect(/\d|几首|哀伤|不甘|难过的歌/.test(line), `${rule.id}: ${line}`).toBe(false);
      }
    }
  });
});

describe('覆盖', () => {
  it('每种事件对站主和访客都至少有一条规则可选（站主专属事件除外）', () => {
    const OWNER_ONLY = new Set(['editor-open', 'write-milestone', 'published', 'recall', 'care-late', 'care-long-write', 'care-loop', 'chorus']);
    const events = new Set(MIKU_RULES.map(r => r.on));
    for (const e of events) {
      expect(MIKU_RULES.some(r => r.on === e && r.who !== 'visitor'), `${e} 站主`).toBe(true);
      if (!OWNER_ONLY.has(e)) expect(MIKU_RULES.some(r => r.on === e && r.who !== 'owner'), `${e} 访客`).toBe(true);
    }
  });
});
