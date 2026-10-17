// 🌊 声波峰值（docs/music-stage-redesign-demo.html P4「声波即进度」）：脚本与前端共用的一份编码。
//
//   analyze-tracks 解码时把整首歌等分成 PEAK_COUNT 段，每段取响度（RMS 换成 dB，再按全曲最响处
//   往下 PEAK_RANGE_DB 归一到 0–1），量化成 64 级、每级一个字符——一首歌 96 个字符。
//   前端 src/lib/trackPeaks.ts 用 decodePeaks 还原，PlaybackBar 画成声波进度条。

export const PEAK_COUNT = 96;
/** 全曲最响处往下 24dB 记为 0：流行乐母带的动态多在这个范围里，主歌与副歌才拉得开（36dB 时均值 0.86，几乎一样高）；更静的段落只是矮，前端另有最低高度 */
export const PEAK_RANGE_DB = 24;
const LEVELS = 64;
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';

/** 0–1 的数组 → 每值一个字符 */
export const encodePeaks = values =>
  values.map(value => ALPHABET[Math.round(Math.min(1, Math.max(0, value)) * (LEVELS - 1))]).join('');

/** 字符串 → 0–1 的数组；认不出的字符当 0 */
export const decodePeaks = text =>
  Array.from(text, char => Math.max(0, ALPHABET.indexOf(char)) / (LEVELS - 1));

/**
 * 单声道 PCM → PEAK_COUNT 个 0–1 的响度值。
 * 每段的 RMS 换算成 dB；以全曲最响的一段为 0dB，往下 PEAK_RANGE_DB 线性映射到 1 → 0。
 */
export const peaksOf = (pcm, count = PEAK_COUNT, rangeDb = PEAK_RANGE_DB) => {
  const db = new Array(count).fill(-Infinity);
  const size = pcm.length / count;
  if (!(size >= 1)) return new Array(count).fill(0);
  for (let i = 0; i < count; i += 1) {
    const from = Math.floor(i * size);
    const to = Math.max(from + 1, Math.floor((i + 1) * size));
    let energy = 0;
    for (let j = from; j < to; j += 1) energy += pcm[j] * pcm[j];
    const rms = Math.sqrt(energy / (to - from));
    db[i] = rms > 1e-7 ? 20 * Math.log10(rms) : -Infinity;
  }
  const loudest = Math.max(...db);
  if (!Number.isFinite(loudest)) return new Array(count).fill(0);
  return db.map(value => (Number.isFinite(value) ? Math.min(1, Math.max(0, 1 - (loudest - value) / rangeDb)) : 0));
};
