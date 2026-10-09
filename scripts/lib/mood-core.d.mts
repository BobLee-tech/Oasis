// mood-core.mjs 的类型：前端（src/lib/trackMood.ts）经它拿到与脚本同一份推导。
export type Feel = 'tender' | 'nostalgic' | 'sad' | 'peaceful' | 'joyful' | 'tense' | 'wonder' | 'power' | 'transcendence' | 'defiant';
/** 每维 1–3（0 不写） */
export type Feels = Partial<Record<Feel, number>>;
export type SectionLabel = 'intro' | 'verse' | 'pre' | 'chorus' | 'bridge' | 'outro';
export type Imagery = 'rain' | 'sea' | 'flower' | 'moon' | 'snow' | 'letter';
export type BlendId = 'setsunai' | 'release' | 'fired' | 'youth' | 'hollow' | 'smolder';

export interface ArcStep {
  /** 段落标签，可带第几次：'chorus' | 'chorus#2' */
  at: string;
  feels?: Feels;
  dv?: number;
  da?: number;
}

export declare const FEELS: readonly Feel[];
export declare const FEEL_LABELS: Record<Feel, string>;
export declare const FEEL_VA: Record<Feel, { v: number; a: number }>;
export declare const VA_GUESSABLE: readonly Feel[];
export declare const MAX_INTENSITY: number;
export declare const MAX_ACTIVE_FEELS: number;
export declare const SPLIT_MIN: number;
export declare const SECTION_LABELS: readonly SectionLabel[];
export declare const IMAGERY: readonly Imagery[];
export declare const IMAGERY_LABELS: Record<Imagery, string>;
export declare const SECTION_NAMES: Record<SectionLabel, string>;
export declare const BLENDS: readonly { id: BlendId; label: string; feels: readonly [Feel, Feel] }[];

export declare const nearestFeel: (valence: number, arousal01: number) => Feel;
export declare const normalizeFeels: (raw: unknown) => Feels | undefined;
export declare const feelsOfLayer: (layer: { feels?: unknown; feel?: unknown } | undefined) => Feels | undefined;
export declare const dominantFeel: (feels: Feels | undefined) => Feel | undefined;
export declare const blendOf: (feels: Feels | undefined) => BlendId | undefined;
export declare const overallValenceOfLayer: (layer: { valence?: number; lyricValence?: number; soundValence?: number } | undefined) => number | undefined;
export declare const isSplit: (lyricValence: number | undefined, soundValence: number | undefined) => boolean;
export declare const normalizeArc: (raw: unknown) => ArcStep[] | undefined;
export declare const arcAt: (arc: readonly ArcStep[] | undefined, at: string | undefined, n: number) => { feels?: Feels; dv: number; da: number } | null;
export declare const addFeels: (base: Feels | undefined, delta: Feels | undefined) => Feels;
export declare const normalizeImagery: (raw: unknown) => Imagery[] | undefined;
export declare const checkMood: (mood: Record<string, unknown> | undefined, where: string) => { problems: string[]; warnings: string[] };
