// P4（docs/song-emotion-design.md §3.7）：多维情绪的事实，以及它们在规则库里的优先顺序。
import { describe, expect, it } from 'vitest';
import { buildFacts, type FactsInput } from './facts';
import { DialogueState, select } from './dialogue';
import { MIKU_RULES } from '../../../data/mikuRules';
import { resolveTrackMood, segmentAt, type MoodLayer, type Segment } from '../../../lib/trackMood';

const SEGMENTS: Segment[] = [['verse', 0, 30000], ['chorus', 30000, 60000], ['outro', 60000, 90000]];

const factsFor = (manual: MoodLayer, { owner = true, ms = 10000, imagery }: { owner?: boolean; ms?: number; imagery?: 'rain' } = {}) => {
  const mood = resolveTrackMood({ manual, auto: { arousal: 0.5, contrast: 0.5, segments: SEGMENTS, imagery } });
  const input: FactsInput = {
    now: new Date(2026, 9, 9, 15), owner, view: 'soundscape', playing: true,
    track: { id: 'x', title: 't', artist: 'a', category: 'Yorushika' }, mood, segment: segmentAt(mood.segments, ms),
    posts: [], combo: 0, patsTotal: 0, patsToday: 0, memory: null, affect: { v: 0, a: 0, emotion: null },
  };
  return buildFacts(input);
};

const memory = () => {
  const said = new Map<string, number>();
  return { lastSaid: (k: string) => said.get(k), markSaid: (k: string, t: number) => { said.set(k, t); } };
};
/** rng 恒 0：所有 chance 都掷中，只看条件与得分 */
const pick = (event: Parameters<typeof select>[0], facts: ReturnType<typeof buildFacts>) =>
  select(event, facts, MIKU_RULES, { now: 0, state: new DialogueState(memory()), rng: () => 0 })?.rule.id;

describe('多维情绪的事实', () => {
  it('feels / blend 只在有把握时给；「说不准」时都收起来', () => {
    const sure = factsFor({ feels: { sad: 2, tender: 3 } });
    expect(sure.feels).toEqual({ sad: 2, tender: 3 });
    expect(sure.blend).toBe('setsunai');
    const unsure = factsFor({ feels: { sad: 2, tender: 3 }, sure: false });
    expect(unsure.feels).toBeUndefined();
    expect(unsure.blend).toBeUndefined();
    // VA 猜的单维也不算
    expect(factsFor({}).feels).toBeUndefined();
  });

  it('feels 叠上当前段的弧线；section 是此刻的段落', () => {
    const manual: MoodLayer = { feels: { sad: 2 }, arc: [{ at: 'chorus', feels: { power: 2 } }] };
    expect(factsFor(manual, { ms: 10000 })).toMatchObject({ section: 'verse', feels: { sad: 2 } });
    expect(factsFor(manual, { ms: 40000 })).toMatchObject({ section: 'chorus', feels: { sad: 2, power: 2 } });
  });

  it('反差带方向；意象给第一个与中文名', () => {
    expect(factsFor({ feels: { joyful: 2 }, lyricValence: -0.6, soundValence: 0.4 })).toMatchObject({ split: true, splitWay: 'sound' });
    expect(factsFor({ feels: { joyful: 2 }, lyricValence: 0.5, soundValence: -0.3 }).splitWay).toBe('lyric');
    expect(factsFor({}, { imagery: 'rain' })).toMatchObject({ imagery: 'rain', imageryName: '雨' });
  });

  it('台词的正负向跟词走', () => {
    expect(factsFor({ lyricValence: -0.6, soundValence: 0.4 }).trackValence).toBeCloseTo(-0.6);
  });
});

describe('规则的优先顺序', () => {
  it('换歌：反差 > 复合 > 单维', () => {
    expect(pick('track-change', factsFor({ feels: { sad: 3, tender: 2 } }))).toMatch(/^p4\.blend\.setsunai/);
    expect(pick('track-change', factsFor({ feels: { sad: 3, tender: 2 }, lyricValence: -0.6, soundValence: 0.4 }))).toMatch(/^p4\.split\.sound/);
    expect(pick('track-change', factsFor({ feels: { defiant: 3 } }))).toBe('p4.feel.defiant.owner');
    expect(pick('track-change', factsFor({ feels: { defiant: 3 } }, { owner: false }))).toBe('p4.feel.defiant.visitor');
  });

  it('没标情绪的歌也能按意象说一句', () => {
    expect(pick('track-change', factsFor({}, { imagery: 'rain' }))).toBe('p4.imagery.rain.owner');
  });

  it('副歌里燃起来：不说话，只是眼睛一亮、冒音符', () => {
    const facts = factsFor({ feels: { sad: 2 }, arc: [{ at: 'chorus', feels: { power: 2 } }] }, { ms: 40000 });
    const sel = select('arc-turn', facts, MIKU_RULES, { now: 0, state: new DialogueState(memory()), rng: () => 0 });
    expect(sel?.rule.id).toBe('p4.arc.power');
    expect(sel?.template).toBe('');
    expect(sel?.rule.face).toBe('happy');
  });

  it('「说不准」的歌：情绪规则一条都不选', () => {
    const id = pick('track-change', factsFor({ feels: { sad: 3, tender: 2 }, sure: false }));
    expect(id ?? '').not.toMatch(/^p4\.(blend|split|feel)|^p7\.feel/);
  });
});
