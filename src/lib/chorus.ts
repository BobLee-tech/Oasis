// 副歌区段·歌词法（docs/miku-design.md A2.6 ①，思路参考 Goto 的 RefraiD：副歌即被重复的段落）。
//
// 行文本归一化 → 找连续 ≥2 行、整块出现 ≥2 次的重复块 → 「出现次数 × 块长」最大的块记为副歌
// → 每次出现取 [首行 startMs, 末行 endMs]。纯函数；工坊用它给「标注」页签出建议，你再修正。

interface TimedLine {
  startMs: number;
  endMs: number;
  ja: string;
}

const keyOf = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export const detectChorus = (lines: TimedLine[]): [number, number][] => {
  const keys = lines.map(line => keyOf(line.ja));
  const n = keys.length;
  const matchesAt = (start: number, block: string[]) =>
    block.every((key, offset) => keys[start + offset] === key);

  let best: { starts: number[]; length: number; score: number } | null = null;
  const seen = new Set<string>();
  for (let i = 0; i < n; i += 1) {
    if (!keys[i]) continue;
    for (let j = i + 1; j < n; j += 1) {
      if (keys[j] !== keys[i]) continue;
      let length = 0;
      while (j + length < n && i + length < j && keys[i + length] && keys[i + length] === keys[j + length]) length += 1;
      if (length < 2) continue;
      const block = keys.slice(i, i + length);
      const signature = block.join('\n');
      if (seen.has(signature)) continue;
      seen.add(signature);
      // 不重叠地数这个块在全曲出现几次
      const starts: number[] = [];
      for (let k = 0; k + length <= n; ) {
        if (matchesAt(k, block)) {
          starts.push(k);
          k += length;
        } else k += 1;
      }
      const score = starts.length * length;
      if (starts.length >= 2 && (!best || score > best.score || (score === best.score && length > best.length))) {
        best = { starts, length, score };
      }
    }
  }
  if (!best) return [];
  const { starts, length } = best;
  return starts.map(start => [lines[start].startMs, lines[start + length - 1].endMs]);
};
