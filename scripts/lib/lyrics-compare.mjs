// 「当前版本 vs 网易云成对版本」的比对（docs/music-design.md A4.2 换源规则）。
//
// 默认建议：译文更完整，且两版共同的行时间差中位数 < 300ms 时换；
// reviewed 的歌词永远不建议替换。最终由站主在工坊里点选。
import { checkLyrics } from './lyrics-gate.mjs';
import { normalizeIdentity } from './track-identity.mjs';

export const MAX_SHIFT_MS = 300;

const zhCoverage = lines => {
  const body = lines.filter(line => /[\p{L}\p{N}]/u.test(line.ja));
  if (!body.length) return 0;
  return body.filter(line => String(line.zh ?? '').trim()).length / body.length;
};

/** 两版里文字相同的行，起始时间差的中位数；共同行不足一半时返回 null（不是同一份转写）。 */
export const medianShiftMs = (current, candidate) => {
  const pool = new Map();
  for (const line of current) {
    const key = normalizeIdentity(line.ja);
    if (!key) continue;
    const list = pool.get(key) ?? [];
    list.push(line.startMs);
    pool.set(key, list);
  }
  const deltas = [];
  for (const line of candidate) {
    const starts = pool.get(normalizeIdentity(line.ja));
    if (!starts?.length) continue;
    deltas.push(Math.min(...starts.map(start => Math.abs(start - line.startMs))));
  }
  if (deltas.length < Math.min(current.length, candidate.length) / 2) return null;
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)];
};

/**
 * @param current    当前发布的歌词文档（可为 null：还没有歌词）
 * @param candidate  { lines, translationStatus? } 网易云成对版本
 * @param context    { durationMs, outroMs, title }
 */
export const compareLyricVersions = (current, candidate, context = {}) => {
  const candidateDoc = { title: context.title, offsetMs: 0, translationStatus: 'machine', lines: candidate.lines };
  const candidateGate = checkLyrics(candidateDoc, context);
  const summary = {
    candidate: {
      lines: candidate.lines.length,
      zhCoverage: zhCoverage(candidate.lines),
      romaCoverage: candidate.lines.length
        ? candidate.lines.filter(line => line.roma).length / candidate.lines.length
        : 0,
      blocked: candidateGate.blocked.filter(name => name !== 'reading'),
      gates: candidateGate.gates,
    },
  };
  if (!current) {
    const usable = summary.candidate.blocked.length === 0 || summary.candidate.blocked.every(name => name === 'translation');
    return { ...summary, recommend: usable, reason: usable ? '目前没有歌词' : `网易云版本过不了闸：${summary.candidate.blocked.join('、')}` };
  }
  const currentGate = checkLyrics(current, context);
  summary.current = {
    lines: current.lines.length,
    zhCoverage: zhCoverage(current.lines),
    source: current.source?.kind ?? 'unknown',
    translationStatus: current.translationStatus,
    blocked: currentGate.blocked.filter(name => name !== 'reading'),
  };
  const shift = medianShiftMs(current.lines, candidate.lines);
  summary.shiftMs = shift;

  if (current.translationStatus === 'reviewed') return { ...summary, recommend: false, reason: '当前版本已校，不自动替换' };
  if (current.source?.kind === 'netease' && summary.current.zhCoverage >= summary.candidate.zhCoverage) {
    return { ...summary, recommend: false, reason: '当前已是网易云版本' };
  }
  if (summary.candidate.blocked.includes('version')) {
    return { ...summary, recommend: false, reason: `网易云版本过不了版本闸：${candidateGate.gates.version.detail}` };
  }
  if (summary.current.blocked.includes('version')) {
    return { ...summary, recommend: true, reason: '当前版本过不了版本闸，网易云版本可以' };
  }
  const gain = summary.candidate.zhCoverage - summary.current.zhCoverage;
  if (gain <= 0.001) return { ...summary, recommend: false, reason: '译文不比当前完整' };
  if (shift === null) return { ...summary, recommend: false, reason: '两版转写差异大（共同行不足一半），请人工对比' };
  if (shift >= MAX_SHIFT_MS) return { ...summary, recommend: false, reason: `时间轴差 ${shift}ms，请试听后决定` };
  return {
    ...summary,
    recommend: true,
    reason: `译文 ${(summary.current.zhCoverage * 100).toFixed(0)}% → ${(summary.candidate.zhCoverage * 100).toFixed(0)}%，时间轴差 ${shift}ms`,
  };
};
