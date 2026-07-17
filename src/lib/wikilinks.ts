// 🔗 双链 [[标题]]：正文里写 [[另一篇标题]]，渲染时解析成可点击的站内链接，
//   同时供星图（OasisOrchard）在两篇文章之间画一条额外的引力连线。
//   不入库、不设 id 字段——正文本身就是唯一事实源，改标题后链接自然断开，
//   断链渲染成「还未种下的种子」而非报错，这本身就是数字花园的语义。
const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

// 提取正文中出现的所有双链标题（原样，未去重）
export const extractWikiLinks = (content: string): string[] =>
  Array.from((content ?? '').matchAll(WIKILINK_RE), (m) => m[1].trim());

// 标题归一化：大小写与首尾空白不敏感，供匹配用
const normalize = (title: string) => title.trim().toLowerCase();

export const buildTitleIndex = <T extends { title: string }>(posts: T[]): Map<string, T> => {
  const map = new Map<string, T>();
  posts.forEach((p) => map.set(normalize(p.title), p));
  return map;
};

// 渲染前预处理：[[标题]] → 命中的转成 Markdown 链接（走 #/garden/:id），
// 未命中的转成一段不可点的虚线文字，视觉上标记「这颗种子还没种下」。
export const resolveWikiLinks = <T extends { id: string; title: string }>(
  content: string,
  titleIndex: Map<string, T>
): string =>
  (content ?? '').replace(WIKILINK_RE, (_match, rawTitle: string) => {
    const title = rawTitle.trim();
    const hit = titleIndex.get(normalize(title));
    if (hit) return `[${title}](#/garden/${encodeURIComponent(hit.id)} "wikilink")`;
    return `<span class="wikilink-pending" title="还未种下的种子">${title}</span>`;
  });

// ══════════════════════════════════════════════════════════════
// ⟲ 反向链接（Backlinks）：双链只解析了一半——它让作者能从 A 跳到 B，
//   但真正让花园「可漫游」的是反过来的那一半：读 B 时看见「谁曾提到过我」。
//   连语境摘句一起带上，让回响不是一份枯燥的标题列表，而是「对方当时在说什么」。
//   不入库、纯内存推导，与星图的双链连线同一份数据源、同一套哲学。
// ══════════════════════════════════════════════════════════════
const CONTEXT_RADIUS = 60;   // 摘句时向前后各扩展的字符预算，实际会被句边界收紧
const CONTEXT_MAX_LEN = 90;  // 摘句最终展示上限，超出则省略号收尾
const SENTENCE_BOUNDARY = /[。！？\n]/;

export interface Backlink<T> {
  post: T;        // 提到了目标文章的那篇「来源文章」
  before: string; // 引用处之前的语境（已剪到句首）
  after: string;  // 引用处之后的语境（已剪到句尾）
  rawTitle: string; // 来源文章里实际写下的引用文字（大小写/空白可能与目标标题略有出入）
}

// 从来源正文里，把 [[标题]] 出现处向两侧扩到最近的句边界，剥离方括号后拼成可读的一句话摘录
const extractContext = (content: string, matchIndex: number, matchLen: number): { before: string; after: string } => {
  const before = content.slice(Math.max(0, matchIndex - CONTEXT_RADIUS), matchIndex);
  const after = content.slice(matchIndex + matchLen, matchIndex + matchLen + CONTEXT_RADIUS);

  const boundaryBefore = Math.max(
    before.lastIndexOf('。'), before.lastIndexOf('！'), before.lastIndexOf('？'), before.lastIndexOf('\n')
  );
  const boundaryAfterRel = after.search(SENTENCE_BOUNDARY);

  let trimmedBefore = (boundaryBefore >= 0 ? before.slice(boundaryBefore + 1) : before).trimStart();
  let trimmedAfter = (boundaryAfterRel >= 0 ? after.slice(0, boundaryAfterRel + 1) : after).trimEnd();

  // 总长仍超预算（句子本身很长）时，各截一半并加省略号，保持摘句始终可控
  const budget = CONTEXT_MAX_LEN;
  if (trimmedBefore.length + trimmedAfter.length > budget) {
    const half = Math.floor(budget / 2);
    if (trimmedBefore.length > half) trimmedBefore = '…' + trimmedBefore.slice(-half);
    if (trimmedAfter.length > half) trimmedAfter = trimmedAfter.slice(0, half) + '…';
  }
  return { before: trimmedBefore, after: trimmedAfter };
};

// 建反向索引：目标文章 id（被引用者）→ 提到它的所有来源文章 + 语境
// 同一篇来源多次提及同一目标时只取第一处，避免刷屏
export const buildBacklinkIndex = <T extends { id: string; title: string; content: string }>(
  posts: T[]
): Map<string, Backlink<T>[]> => {
  const titleIndex = buildTitleIndex(posts);
  const index = new Map<string, Backlink<T>[]>();

  posts.forEach((source) => {
    const seenTargets = new Set<string>();
    Array.from((source.content ?? '').matchAll(WIKILINK_RE)).forEach((m) => {
      const rawTitle = m[1].trim();
      const target = titleIndex.get(normalize(rawTitle));
      if (!target || target.id === source.id || seenTargets.has(target.id)) return;
      seenTargets.add(target.id);

      const { before, after } = extractContext(source.content, m.index ?? 0, m[0].length);
      const list = index.get(target.id) ?? [];
      list.push({ post: source, before, after, rawTitle });
      index.set(target.id, list);
    });
  });

  return index;
};
