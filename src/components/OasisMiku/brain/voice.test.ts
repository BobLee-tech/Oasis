import { describe, expect, it } from 'vitest';
import { MikuVoice } from './voice';
import { LocalMemoryStore } from '../../../lib/mikuMemory';
import { MIKU_RULES } from '../../../data/mikuRules';
import type { FactsInput } from './facts';
import type { BlogPost } from '../../../hooks/useGarden';

const memStorage = () => {
  const map = new Map<string, string>();
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } };
};

const NIGHT = new Date(2026, 9, 7, 21, 0);
const post = (title: string, daysAgo: number, status: BlogPost['status'] = 'published') =>
  ({ id: title, title, status, createdAt: NIGHT.getTime() - daysAgo * 86_400_000, excerpt: '', date: '', updatedAt: 0, growth: 'seed', type: 'thought', tags: [], color: '', content: '' }) as unknown as BlogPost;

const input = (extra: Partial<FactsInput> = {}): Omit<FactsInput, 'owner' | 'memory'> => ({
  now: NIGHT, view: 'garden', playing: false, posts: [post('建筑杂谈', 2)], combo: 0, patsTotal: 0, patsToday: 0,
  affect: { v: 0.1, a: 0, emotion: null }, ...extra,
});

const make = () => {
  const storage = memStorage();
  let t = NIGHT.getTime();
  const store = new LocalMemoryStore({ storage, now: () => t });
  const voice = new MikuVoice(MIKU_RULES, { ownerStore: () => store });
  return { voice, store, storage, setT: (x: number) => { t = x; } };
};

describe('MikuVoice', () => {
  it('访客：不写记忆，提到站主用「他」，不用亲昵称呼', () => {
    const { voice, storage } = make();
    voice.remember({ kind: 'publish', data: { title: 'x' } });
    expect(storage.map.size).toBe(0);
    const texts = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const line = voice.speak('greet', input(), { now: NIGHT.getTime() + i * 10_000, force: true });
      if (line?.text) texts.add(line.text);
    }
    expect([...texts].some(t => t.includes('他'))).toBe(true);
    for (const t of texts) expect(/宝贝|爱人|小盆友/.test(t)).toBe(false);
  });

  it('站主：记得上次没读完的那篇', () => {
    const { voice, setT } = make();
    voice.setOwner(true);
    setT(NIGHT.getTime() - 86_400_000);
    voice.remember({ kind: 'session-start' });
    voice.remember({ kind: 'session-end', data: { readingId: 'p1', readingTitle: '建筑杂谈', readingProgress: 0.35 } });
    setT(NIGHT.getTime());
    voice.remember({ kind: 'session-start' });
    const line = voice.speak('recall', input(), { now: NIGHT.getTime(), rng: () => 0 });
    expect(line?.text).toMatch(/建筑杂谈/);
    // 每个会话最多一句回忆
    expect(voice.speak('recall', input(), { now: NIGHT.getTime() + 3_600_000, rng: () => 0 })).toBeNull();
  });

  it('切到访客预览时读不到站主记忆', () => {
    const { voice, setT } = make();
    voice.setOwner(true);
    setT(NIGHT.getTime() - 86_400_000);
    voice.remember({ kind: 'session-end', data: { readingTitle: '建筑杂谈', readingProgress: 0.35 } });
    setT(NIGHT.getTime());
    voice.setOwner(false);
    expect(voice.facts(input()).memory).toBeUndefined();
    expect(voice.speak('recall', input(), { now: NIGHT.getTime() })).toBeNull();
  });

  it('发布：带标题的那句更具体，优先；场域是郑重', () => {
    const { voice } = make();
    voice.setOwner(true);
    const line = voice.speak('published', input({ published: { title: '春日记' } }), { now: NIGHT.getTime(), rng: () => 0.9 });
    expect(line?.text).toMatch(/《春日记》/);
    expect(line?.debug.field).toBe('solemn');
  });

  it('话量：闲聊之间至少隔 90s；写作中不闲聊', () => {
    const { voice } = make();
    voice.setOwner(true);
    const t0 = NIGHT.getTime();
    expect(voice.speak('idle', input(), { now: t0 })).not.toBeNull();
    expect(voice.speak('idle', input(), { now: t0 + 30_000 })).toBeNull();
    expect(voice.speak('idle', input({ editing: { words: 10, openedAt: t0 } }), { now: t0 + 200_000 })).toBeNull();
    expect(voice.speak('idle', input(), { now: t0 + 200_000 })).not.toBeNull();
  });

  it('访客只会被推荐公开发布的文章', () => {
    const { voice } = make();
    const texts = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const line = voice.speak('greet', input({ posts: [post('秘密', 0, 'unlisted'), post('公开', 3)] }), { now: NIGHT.getTime() + i, force: true, rng: () => (i % 10) / 10 });
      if (line?.text) texts.add(line.text);
    }
    for (const t of texts) expect(t.includes('秘密')).toBe(false);
  });
});

describe('P7 第一批：每组都够得着', () => {
  const track = { id: 't', title: '歌', artist: 'a', category: 'Yorushika' };
  const mood = (extra: Record<string, unknown>) => ({
    arousal: 0.5, valence: 0, feel: 'peaceful', sections: [], contrast: 0.5,
    provenance: { arousal: 'auto', valence: 'default', feel: 'default', bpm: 'default', sections: 'default', contrast: 'auto', season: 'default', time: 'default' },
    ...extra,
  }) as unknown as NonNullable<FactsInput['mood']>;
  /** 多试几次（每次换一个随机数），收集命中过的规则 id */
  const hits = (voice: MikuVoice, event: Parameters<MikuVoice['speak']>[0], inp: Omit<FactsInput, 'owner' | 'memory'>) => {
    const ids = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const line = voice.speak(event, inp, { now: NIGHT.getTime() + i * 3_600_000, force: true, rng: () => (i * 0.137) % 1 });
      if (line) ids.add(line.rule.id);
    }
    return ids;
  };

  it('标过「哀伤」的歌：站主听到安慰场域的那组', () => {
    const { voice } = make();
    voice.setOwner(true);
    const ids = hits(voice, 'track-change', input({ playing: true, track, mood: mood({ feel: 'sad', valence: -0.6, provenance: { feel: 'manual', valence: 'manual' } }) }));
    expect(ids.has('p7.feel.sad.owner')).toBe(true);
  });

  it('没标 feel 的燃歌：按离线唤醒度兜底', () => {
    const { voice } = make();
    const ids = hits(voice, 'track-change', input({ playing: true, track, mood: mood({ arousal: 0.9 }) }));
    expect(ids.has('p7.arousal.high')).toBe(true);
    expect([...ids].some(id => id.startsWith('p7.feel.'))).toBe(false);
  });

  it('冬天听夏天的歌：季节不一致的那句', () => {
    const { voice } = make();
    const winter = new Date(2026, 0, 10, 21, 0);
    const ids = hits(voice, 'track-change', input({ now: winter, playing: true, track, mood: mood({ season: 'summer' }) }));
    expect(ids.has('p7.season.mismatch')).toBe(true);
  });

  it('站主摸头：亲昵场域，熟了以后会叫「宝贝」', () => {
    const { voice } = make();
    voice.setOwner(true);
    const texts = new Set<string>();
    // 固定种子的伪随机：结果可复现，不靠运气
    let seed = 42;
    const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 80; i++) {
      const line = voice.speak('stroke', input({ zone: 'head', patsTotal: 60 }), { now: NIGHT.getTime() + i * 3_600_000, force: true, rng });
      if (line) texts.add(line.text);
    }
    expect([...texts].some(t => t.includes('宝贝'))).toBe(true);
  });

  it('第一次来的访客：招待的那句', () => {
    const { voice } = make();
    const ids = hits(voice, 'greet', input({ posts: [] }));
    expect(ids.has('p7.host.first')).toBe(true);
  });
});
