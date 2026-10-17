// peaks-core.mjs 的类型：前端（src/lib/trackPeaks.ts）经它拿到与脚本同一份编码。
export declare const PEAK_COUNT: number;
export declare const PEAK_RANGE_DB: number;
export declare const encodePeaks: (values: number[]) => string;
export declare const decodePeaks: (text: string) => number[];
export declare const peaksOf: (pcm: ArrayLike<number>, count?: number, rangeDb?: number) => number[];
