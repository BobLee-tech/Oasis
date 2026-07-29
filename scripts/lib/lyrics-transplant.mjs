// 歌词轴移植：把网易云译文的时间戳换成本地既有原文（LRCLIB/本地 LRC）的时间戳。
// 两份原文文本来自不同转写，逐行未必逐字相同，因此用文本相似度做「弱匹配的最长公共
// 子序列」对齐，而不是逐行位置直接对应——这样能容忍网易云与本地版本偶尔的断句差异，
// 同时保持顺序单调，不会因为副歌重复句而错配到别处。
import { overlap } from './lyrics-match.mjs';

const PUNCTUATION = /[、。，,！!？?「」『』…・～〜～\-—–()（）\[\]【】"'’‘"”\s]/g;

export const normalizeLineText = value => String(value ?? '')
  .normalize('NFKC')
  .toLocaleLowerCase('ja')
  .replace(PUNCTUATION, '');

/** 字符集重叠度，短行加长度比惩罚，避免语气词短句互相误配。 */
export const lineSimilarity = (left, right) => {
  const a = normalizeLineText(left);
  const b = normalizeLineText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const shortLength = Math.min(a.length, b.length);
  const longLength = Math.max(a.length, b.length);
  if (shortLength <= 2 && longLength > shortLength * 3) return 0;
  return overlap(a, b) * Math.min(1, shortLength / Math.max(1, longLength * 0.4));
};

/**
 * 在保持顺序的前提下，为 sourceLines（本地时间轴、只有原文）从 neteaseLines
 * （网易时间轴、原文+译文）里找最优弱匹配，把译文写到本地时间戳上。
 * 复杂度 O(n·m)，n/m 均 ≤ 2000（上游 parseLrc 的行数上限）。
 */
export const alignNeteaseTranslation = (sourceLines, neteaseLines, { matchThreshold = 0.62 } = {}) => {
  const n = sourceLines.length;
  const m = neteaseLines.length;
  const score = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < m; j += 1) {
      const similarity = lineSimilarity(sourceLines[i].ja, neteaseLines[j].ja);
      score[i][j] = similarity >= matchThreshold ? similarity : 0;
    }
  }

  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const matchValue = score[i - 1][j - 1] > 0 ? dp[i - 1][j - 1] + score[i - 1][j - 1] : -Infinity;
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], matchValue);
    }
  }

  const matches = new Map();
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (score[i - 1][j - 1] > 0 && dp[i][j] === dp[i - 1][j - 1] + score[i - 1][j - 1]) {
      matches.set(i - 1, j - 1);
      i -= 1;
      j -= 1;
    } else if (dp[i][j] === dp[i - 1][j]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  const unmatchedSource = [];
  const lines = sourceLines.map((line, index) => {
    const neteaseIndex = matches.get(index);
    const zh = neteaseIndex === undefined ? '' : (neteaseLines[neteaseIndex].zh ?? '').trim();
    if (!zh) unmatchedSource.push(index);
    return zh ? { ...line, zh } : { ...line };
  });

  return {
    lines,
    coverage: n ? matches.size / n : 0,
    matchedCount: matches.size,
    totalSource: n,
    totalNetease: m,
    unmatchedSourceIndexes: unmatchedSource,
  };
};
