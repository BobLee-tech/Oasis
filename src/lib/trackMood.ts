// 🎼 曲目心境的合并解析（docs/miku-design.md A2）：人标 > 导入（网易云）> 自动 > 专辑默认 > 缺省，
//   每个字段带出处（provenance），调试面板与台词规则都能看到「这个值从哪来」。
//
//   层的来源：
//     · 人标 —— music-data/tracks/<id>.json 的 mood / note / noteVisitor / notePrivate
//     · 专辑 —— music-data/albums/*.json 的 moodDefaults（按 title 与曲目的专辑名对上）
//     · 自动 —— src/data/trackFeatures.generated.json（scripts/analyze-tracks.mjs 产出，含导入层的 bpmNetease）
//   数据在 trackMoodData.ts 里，被这里 import() 成独立 chunk：Miku 第一次需要曲目事实时才加载。

export type Feel = 'tender' | 'nostalgic' | 'sad' | 'peaceful' | 'joyful' | 'tense' | 'wonder';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type TrackTime = 'morning' | 'dusk' | 'night';
export type Provenance = 'manual' | 'netease' | 'auto' | 'album' | 'default' | 'va';

export const FEELS: readonly Feel[] = ['tender', 'nostalgic', 'sad', 'peaceful', 'joyful', 'tense', 'wonder'];

/** GEMS 七类在 VA 平面上的锚点（A2.4）：feel 缺省时取最近邻。 */
export const FEEL_VA: Record<Feel, { v: number; a: number }> = {
  joyful: { v: 0.7, a: 0.6 },
  tense: { v: -0.4, a: 0.6 },
  wonder: { v: 0.4, a: 0.3 },
  tender: { v: 0.5, a: -0.3 },
  peaceful: { v: 0.3, a: -0.6 },
  nostalgic: { v: -0.1, a: -0.3 },
  sad: { v: -0.6, a: -0.4 },
};

/** 人标 / 专辑默认里可以写的字段（全部可选）。arousal 用 0..1，与自动层同一量纲。 */
export interface MoodLayer {
  arousal?: number;
  valence?: number;
  feel?: Feel;
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
  season?: Season;
  time?: TrackTime;
}

export interface TrackNotes {
  note?: string;
  noteVisitor?: string;
  notePrivate?: boolean;
}

export interface ResolvedTrackMood extends TrackNotes {
  arousal: number;
  valence: number;
  feel: Feel;
  bpm?: number;
  sections: [number, number][];
  contrast: number;
  season?: Season;
  time?: TrackTime;
  provenance: Record<'arousal' | 'valence' | 'feel' | 'bpm' | 'sections' | 'contrast' | 'season' | 'time', Provenance>;
}

/** VA → 最近的 feel。arousal 0..1 先映射到 −1..1 再比距离。 */
export const nearestFeel = (valence: number, arousal01: number): Feel => {
  const a = arousal01 * 2 - 1;
  let best: Feel = 'peaceful';
  let bestD = Infinity;
  for (const feel of FEELS) {
    const p = FEEL_VA[feel];
    const d = (p.v - valence) ** 2 + (p.a - a) ** 2;
    if (d < bestD) { bestD = d; best = feel; }
  }
  return best;
};

// 效价缺省取轻微正向（她自己的基线）：取 0 的话，没标注的燃歌按 VA 最近邻会全落到「紧绷」，满屏火花。
// 标注前的缺省 feel 因此是 wonder（燃）/ peaceful（静）这类中性偏暖的感受。
const DEFAULTS = { arousal: 0.4, valence: 0.15, contrast: 0.5 };

export const resolveTrackMood = (layers: {
  manual?: MoodLayer;
  album?: MoodLayer;
  auto?: AutoFeatures;
  notes?: TrackNotes;
}): ResolvedTrackMood => {
  const { manual = {}, album = {}, auto, notes = {} } = layers;
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
  const valence = (pick('valence', [[manual.valence, 'manual'], [album.valence, 'album']]) as number | undefined) ?? DEFAULTS.valence;
  let feel = pick('feel', [[manual.feel, 'manual'], [album.feel, 'album']]) as Feel | undefined;
  if (!feel) {
    feel = nearestFeel(valence, arousal);
    // 由 VA 推出来的：效价本身若只是缺省值，这个 feel 也只是猜
    provenance.feel = provenance.valence === 'default' ? 'default' : 'va';
  }
  const bpm = pick('bpm', [[manual.bpm, 'manual'], [auto?.bpmNetease, 'netease'], [auto?.bpm, 'auto'], [album.bpm, 'album']]) as number | undefined;
  const sections = (pick('sections', [[manual.sections, 'manual'], [auto?.sections, 'auto']]) as [number, number][] | undefined) ?? [];
  const contrast = (pick('contrast', [[manual.contrast, 'manual'], [auto?.contrast, 'auto'], [album.contrast, 'album']]) as number | undefined) ?? DEFAULTS.contrast;
  const season = pick('season', [[manual.season, 'manual'], [auto?.season, 'auto'], [album.season, 'album']]) as Season | undefined;
  const time = pick('time', [[manual.time, 'manual'], [auto?.time, 'auto'], [album.time, 'album']]) as TrackTime | undefined;

  return {
    arousal: clamp(arousal, 0, 1),
    valence: clamp(valence, -1, 1),
    feel,
    bpm,
    sections,
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
