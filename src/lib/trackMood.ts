// 🎼 曲目心境的合并解析（docs/miku-design.md A2）：人标 > 导入（网易云）> 自动 > 专辑默认 > 缺省，
//   每个字段带出处（provenance），调试面板与台词规则都能看到「这个值从哪来」。
//
//   层的来源：
//     · 人标 —— music-data/tracks/<id>.json 的 mood / note / noteVisitor / notePrivate
//     · 专辑 —— music-data/albums/*.json 的 moodDefaults（按 title 与曲目的专辑名对上）
//     · 自动 —— src/data/trackFeatures.generated.json（scripts/analyze-tracks.mjs 产出，含导入层的 bpmNetease）
//   数据在 trackMoodData.ts 里，被这里 import() 成独立 chunk：Miku 第一次需要曲目事实时才加载。

// 情绪维度与推导（feels → feel / blend / 词曲反差）与脚本共用 scripts/lib/mood-core.mjs，见 docs/song-emotion-design.md §2
import {
  addFeels, arcAt, blendOf, dominantFeel, feelsOfLayer, isSplit, nearestFeel, normalizeArc, normalizeImagery, overallValenceOfLayer,
  type ArcStep, type BlendId, type Feel, type Feels, type Imagery, type SectionLabel,
} from '../../scripts/lib/mood-core.mjs';

export { BLENDS, FEELS, FEEL_LABELS, FEEL_VA, IMAGERY_LABELS, nearestFeel } from '../../scripts/lib/mood-core.mjs';
export type { ArcStep, BlendId, Feel, Feels, Imagery, SectionLabel } from '../../scripts/lib/mood-core.mjs';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type TrackTime = 'morning' | 'dusk' | 'night';
export type Provenance = 'manual' | 'draft' | 'netease' | 'auto' | 'album' | 'default' | 'va';

/** 人标 / 专辑默认里可以写的字段（全部可选）。arousal 用 0..1，与自动层同一量纲。 */
export interface MoodLayer {
  arousal?: number;
  valence?: number;
  /** 词 / 曲各自的效价；不写等于 valence */
  lyricValence?: number;
  soundValence?: number;
  /** 旧档案的单个感受，读作 { feel: 3 } */
  feel?: Feel;
  feels?: Feels;
  arc?: ArcStep[];
  imagery?: Imagery[];
  /** false = 「我自己也说不准」：身体照用，台词不说 */
  sure?: boolean;
  bpm?: number;
  sections?: [number, number][];
  contrast?: number;
  season?: Season;
  time?: TrackTime;
}

export interface AutoFeatures {
  album?: string;
  arousal: number;
  contrast: number;
  bpm?: number;
  bpmNetease?: number;
  sections?: [number, number][];
  sectionsSource?: 'lyrics' | 'energy';
  /** 整首切成首尾相接的段落 [标签, fromMs, toMs]（scripts/lib/track-features.mjs 的 segmentsFromLyrics） */
  segments?: Segment[];
  /** 歌题与歌词里计出来的意象（只有一个） */
  imagery?: Imagery;
  season?: Season;
  time?: TrackTime;
}

export type Segment = [SectionLabel, number, number];

export interface TrackNotes {
  note?: string;
  noteVisitor?: string;
  notePrivate?: boolean;
}

type ProvenanceKey =
  | 'arousal' | 'valence' | 'lyricValence' | 'soundValence' | 'feels' | 'feel'
  | 'arc' | 'imagery' | 'bpm' | 'sections' | 'segments' | 'contrast' | 'season' | 'time';

export interface ResolvedTrackMood extends TrackNotes {
  arousal: number;
  valence: number;
  lyricValence: number;
  soundValence: number;
  /** 词曲反差：两者差 ≥ 0.6（只在至少一个分量是写出来的时候才可能成立） */
  split: boolean;
  /** 情绪向量，恒非空：没标注时是 VA 猜的那一维 × 2 */
  feels: Feels;
  /** feels 里最强的一维 */
  feel: Feel;
  blend?: BlendId;
  arc: ArcStep[];
  imagery: Imagery[];
  sure: boolean;
  bpm?: number;
  sections: [number, number][];
  /** 段落：没有歌词也没有副歌区段时为空（弧线就不生效） */
  segments: Segment[];
  contrast: number;
  season?: Season;
  time?: TrackTime;
  provenance: Record<ProvenanceKey, Provenance>;
}

// 效价缺省取轻微正向（她自己的基线）：取 0 的话，没标注的燃歌按 VA 最近邻会全落到「紧绷」，满屏火花。
// 标注前的缺省 feel 因此是 wonder（燃）/ peaceful（静）这类中性偏暖的感受。
const DEFAULTS = { arousal: 0.4, valence: 0.15, contrast: 0.5 };

export const resolveTrackMood = (layers: {
  manual?: MoodLayer;
  /** 草稿：据网络资料与歌词起草（music-data 的 sources.draft，构建时出处记 draft）；人标压住它 */
  draft?: MoodLayer;
  album?: MoodLayer;
  auto?: AutoFeatures;
  notes?: TrackNotes;
}): ResolvedTrackMood => {
  const { manual = {}, draft = {}, album = {}, auto, notes = {} } = layers;
  const provenance = {} as ResolvedTrackMood['provenance'];
  const pick = <K extends keyof ResolvedTrackMood['provenance']>(
    key: K,
    chain: [unknown, Provenance][],
  ) => {
    for (const [value, source] of chain) {
      if (value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0)) {
        provenance[key] = source;
        return value;
      }
    }
    provenance[key] = 'default';
    return undefined;
  };

  const arousal = (pick('arousal', [[manual.arousal, 'manual'], [auto?.arousal, 'auto'], [album.arousal, 'album']]) as number | undefined) ?? DEFAULTS.arousal;
  const valence = (pick('valence', [[overallValenceOfLayer(manual), 'manual'], [overallValenceOfLayer(draft), 'draft'], [overallValenceOfLayer(album), 'album']]) as number | undefined) ?? DEFAULTS.valence;
  const lyricValence = pick('lyricValence', [[manual.lyricValence, 'manual'], [draft.lyricValence, 'draft'], [album.lyricValence, 'album']]) as number | undefined;
  const soundValence = pick('soundValence', [[manual.soundValence, 'manual'], [draft.soundValence, 'draft'], [album.soundValence, 'album']]) as number | undefined;
  // 情绪向量整层替换，不跨层混合
  let feels = pick('feels', [[feelsOfLayer(manual), 'manual'], [feelsOfLayer(draft), 'draft'], [feelsOfLayer(album), 'album']]) as Feels | undefined;
  let feel: Feel;
  if (feels) {
    feel = dominantFeel(feels)!;
    provenance.feel = provenance.feels;
  } else {
    feel = nearestFeel(valence, arousal);
    feels = { [feel]: 2 };
    // 由 VA 推出来的：效价本身若只是缺省值，这个 feel 也只是猜
    provenance.feel = provenance.valence === 'default' ? 'default' : 'va';
    provenance.feels = provenance.feel;
  }
  const arc = (pick('arc', [[normalizeArc(manual.arc), 'manual'], [normalizeArc(draft.arc), 'draft']]) as ArcStep[] | undefined) ?? [];
  // 人标写了空数组 = 「这首没有意象」，压住自动计出来的
  let imagery: Imagery[];
  if (Array.isArray(manual.imagery)) {
    imagery = normalizeImagery(manual.imagery) ?? [];
    provenance.imagery = 'manual';
  } else if (Array.isArray(draft.imagery) && normalizeImagery(draft.imagery)?.length) {
    imagery = normalizeImagery(draft.imagery)!;
    provenance.imagery = 'draft';
  } else imagery = (pick('imagery', [[normalizeImagery(auto?.imagery ? [auto.imagery] : undefined), 'auto']]) as Imagery[] | undefined) ?? [];
  const bpm = pick('bpm', [[manual.bpm, 'manual'], [auto?.bpmNetease, 'netease'], [auto?.bpm, 'auto'], [album.bpm, 'album']]) as number | undefined;
  const sections = (pick('sections', [[manual.sections, 'manual'], [auto?.sections, 'auto']]) as [number, number][] | undefined) ?? [];
  const segments = (pick('segments', [[auto?.segments, 'auto']]) as Segment[] | undefined) ?? [];
  const contrast = (pick('contrast', [[manual.contrast, 'manual'], [auto?.contrast, 'auto'], [album.contrast, 'album']]) as number | undefined) ?? DEFAULTS.contrast;
  const season = pick('season', [[manual.season, 'manual'], [auto?.season, 'auto'], [album.season, 'album']]) as Season | undefined;
  const time = pick('time', [[manual.time, 'manual'], [auto?.time, 'auto'], [album.time, 'album']]) as TrackTime | undefined;

  return {
    arousal: clamp(arousal, 0, 1),
    valence: clamp(valence, -1, 1),
    lyricValence: clamp(lyricValence ?? valence, -1, 1),
    soundValence: clamp(soundValence ?? valence, -1, 1),
    split: isSplit(lyricValence ?? valence, soundValence ?? valence),
    feels,
    feel,
    // 复合情绪只认写出来的向量（人标、草稿、专辑）：VA 猜的单维凑不出组合
    blend: provenance.feels === 'manual' || provenance.feels === 'draft' || provenance.feels === 'album' ? blendOf(feels) : undefined,
    arc,
    imagery,
    sure: manual.sure !== false,
    bpm,
    sections,
    segments,
    contrast: clamp(contrast, 0, 1),
    season,
    time,
    note: notes.note,
    noteVisitor: notes.noteVisitor,
    notePrivate: notes.notePrivate,
    provenance,
  };
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** 此刻是否在副歌里；lead 秒以内即将进入副歌时返回 'soon'（副歌预备用）。 */
export const chorusState = (sections: readonly [number, number][], ms: number, leadMs = 1200): 'in' | 'soon' | null => {
  for (const [from, to] of sections) {
    if (ms >= from && ms < to) return 'in';
    if (ms >= from - leadMs && ms < from) return 'soon';
  }
  return null;
};

export interface SegmentNow {
  at: SectionLabel;
  /** 这一段在同标签里是第几次（从 1 数）：arc 的「chorus#2」认它 */
  n: number;
  /** 在 segments 里的下标：段落切换就看它变没变 */
  index: number;
}

/** 此刻在哪一段；segments 为空或越界时 null。 */
export const segmentAt = (segments: readonly Segment[], ms: number): SegmentNow | null => {
  const counts: Partial<Record<SectionLabel, number>> = {};
  for (let index = 0; index < segments.length; index++) {
    const [at, from, to] = segments[index];
    counts[at] = (counts[at] ?? 0) + 1;
    if (ms >= from && ms < to) return { at, n: counts[at]!, index };
  }
  return null;
};

/**
 * 这一刻歌的心境（§3.2 / §3.4）：整首的底色 ⊕ 当前段的弧线增量。
 *   faceValence  —— 词的效价（脸、视线、台词正负向）
 *   soundValence —— 曲的效价（律动幅度、粒子发射率与色温）
 * 弧线的 dv 两者都加；da 加在唤醒度上；feels 逐维相加钳到 3。
 */
export const moodNow = (mood: ResolvedTrackMood, segment: SegmentNow | null) => {
  const arc = segment ? arcAt(mood.arc, segment.at, segment.n) : null;
  return {
    faceValence: clamp(mood.lyricValence + (arc?.dv ?? 0), -1, 1),
    soundValence: clamp(mood.soundValence + (arc?.dv ?? 0), -1, 1),
    arousal: clamp(mood.arousal + (arc?.da ?? 0), 0, 1),
    feels: arc?.feels ? addFeels(mood.feels, arc.feels) : mood.feels,
    arc,
  };
};

// ───────────────────────── 运行时加载 ─────────────────────────

let cache: Map<string, ResolvedTrackMood> | null = null;
let loading: Promise<Map<string, ResolvedTrackMood>> | null = null;

export const loadTrackMoods = () => {
  if (cache) return Promise.resolve(cache);
  loading ??= import('./trackMoodData').then(({ trackMoodLayers }) => {
    const map = new Map<string, ResolvedTrackMood>();
    for (const [id, layers] of Object.entries(trackMoodLayers())) map.set(id, resolveTrackMood(layers));
    cache = map;
    return map;
  }).catch((error) => {
    // 加载失败不影响她的其他行为：各出口按缺省走，下次需要时再试
    loading = null;
    if (import.meta.env.DEV) console.warn('[trackMood] 加载失败', error);
    return new Map<string, ResolvedTrackMood>();
  });
  return loading;
};

/** 加载完成后同步返回；加载前返回 undefined（调用方按「缺值就不说」处理）。 */
export const getTrackMood = (id: string | undefined) => (id && cache ? cache.get(id) : undefined);
