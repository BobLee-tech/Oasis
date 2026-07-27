// src/lib/tags.ts
// 🏷️ 标签规范化：单一真相源，全站（博客筛选/搜索/联想 + 星图星云）都应经过这里。
//   问题背景：不同写法（大小写 / 全半角 / 首尾空白）曾被当成不同标签，
//   星图里长出两团看起来一模一样的 #MIKU 星云，博客筛选栏也重复列出。

// 🔑 归一化 key：NFKC 折叠全角→半角，trim，内部空白折成一个空格，再转小写。
//   仅用作分组依据，不用于展示——展示要保留用户真实写下的大小写。
export const tagKey = (t: string) =>
  t.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

// 📛 从同一 key 下出现过的所有原始写法里，选一个作为展示名：
//   出现次数最多的写法胜出（平票取最早出现的），不是简单取第一个——
//   偶尔手滑的 "miku" 不该反过来把惯用的 "Miku" 顶掉。
export const pickCanonicalTag = (variants: string[]): string => {
  const counts = new Map<string, { label: string; n: number; firstIdx: number }>();
  variants.forEach((label, idx) => {
    const k = tagKey(label);
    const existing = counts.get(k);
    if (existing) existing.n += 1;
    else counts.set(k, { label, n: 1, firstIdx: idx });
  });
  const candidates = [...counts.values()];
  const best = candidates.reduce<{ label: string; n: number; firstIdx: number } | null>(
    (acc, v) => (!acc || v.n > acc.n || (v.n === acc.n && v.firstIdx < acc.firstIdx) ? v : acc),
    null
  );
  return best ? best.label : variants[0];
};

// 🗂️ 把「原始标签字符串的集合」按归一化 key 分组，返回 key → 展示名 的映射，
//   供 buildGraph / allTags 等场景一次性建好「写法 → canonical 显示名」的查表。
export const buildTagCanonicalMap = (allRawTags: string[]): Map<string, string> => {
  const grouped = new Map<string, string[]>();
  allRawTags.forEach(t => {
    const k = tagKey(t);
    (grouped.get(k) ?? grouped.set(k, []).get(k)!).push(t);
  });
  const out = new Map<string, string>();
  grouped.forEach((variants, k) => out.set(k, pickCanonicalTag(variants)));
  return out;
};
