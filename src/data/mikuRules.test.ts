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
  const mood = { feel: 'sad', valence: -0.5, provenance: { feel: 'manual', valence: 'manual' }, note: 'n', noteVisitor: 'nv', season: 'summer' } as unknown as ResolvedTrackMood;
  const owner = buildFacts({
    now: new Date(), owner: true, view: 'garden', playing: true,
    track: { id: 'm_01', title: 't', artist: 'a', category: 'Miku' },
    trackFacts: { titleAlt: 'ta', composer: 'c', album: 'al', year: 2020, introFirst: 'i', note: 'n', noteForVisitor: 'nv', relationToPrev: { kind: 'reply', to: 'm_02' } },
    titleOf: () => 'x', mood, chorus: 'in',
    reading: { id: 'p', title: '春', category: 'thought', series: 's', words: 4000, openedAt: Date.now() - 1_800_000, progress: 0.4 },
    editing: { words: 2000, openedAt: Date.now() - 4_000_000 }, published: { title: '春' },
    posts: [post], zone: 'head', gesture: 'tap', awayMinutes: 130, careRepeat: 1, combo: 0, patsTotal: 100, patsToday: 3, memory,
    affect: { v: 0, a: 0, emotion: 'pained' },
  });
  return { owner, visitor: buildFacts({ ...{
    now: new Date(), owner: false, visitorAlias: '阿树', view: 'garden' as const, playing: true,
    track: { id: 'm_01', title: 't', artist: 'a', category: 'Miku' },
    trackFacts: { titleAlt: 'ta', note: 'n', noteForVisitor: 'nv' }, mood,
    reading: { id: 'p', title: '春', category: 'thought', words: 100, openedAt: 0, progress: 0.2 },
    editing: { words: 2000, openedAt: 0 }, posts: [post], combo: 0, patsTotal: 100, patsToday: 0, memory,
    affect: { v: 0, a: 0, emotion: null },
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
