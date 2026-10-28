// 📖 阅读辅助：时长估算 + 标题锚点。
//   Gallery（画廊/阅读舱）与 Orchard（知识星图）共用，杜绝算法漂移。
import { stripCoverDef } from './coverImage';

// ⏱️ 中英混排阅读时长：
//   旧算法用 split(/\s+/) 按空格分词，中文整段无空格 → 一段算一个「词」，严重低估。
//   改为分别计量：CJK 表意字符按 ~400 字/分钟，西文按 ~200 词/分钟，二者相加向上取整。
export const readingMinutes = (text: string): number => {
  const src = text ?? '';
  // 去掉 Markdown 图片 / 链接 URL，避免把长链接算进阅读量
  const clean = stripCoverDef(src).replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\]\([^)]*\)/g, ']');
  const cjkChars = (clean.match(/[一-鿿぀-ヿ가-힯]/g) || []).length;
  // 西文词：先剔除 CJK 再按空白切分
  const latinWords = clean.replace(/[一-鿿぀-ヿ가-힯]/g, ' ')
    .trim().split(/\s+/).filter(Boolean).length;
  const minutes = cjkChars / 400 + latinWords / 200;
  return Math.max(1, Math.ceil(minutes));
};

// 展示串，如「3 min read」
export const readingTimeLabel = (text: string): string => `${readingMinutes(text)} min read`;

// 🔖 标题 → 锚点 id：中文保留、空白转连字符，供文中目录（TOC）与直链定位使用。
export const slugify = (raw: string): string =>
  raw
    .toLowerCase()
    .trim()
    .replace(/[!#$%^&*()+=[\]{};:'"\\|,.<>/?`~]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section';

// 📑 从 Markdown 正文提取 h2/h3 目录项（跳过代码块内的 # 井号）。
export interface TocItem { id: string; text: string; level: 2 | 3; }
export const extractToc = (markdown: string): TocItem[] => {
  const items: TocItem[] = [];
  let inFence = false;
  const seen = new Map<string, number>();
  for (const line of (markdown ?? '').split('\n')) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = /^(#{2,3})\s+(.*\S)\s*$/.exec(line);
    if (!m) continue;
    const level = m[1].length as 2 | 3;
    // 去掉标题内的链接语法 [文字](url) → 文字，再去掉强调符号，保证锚点与渲染后的文本一致
    const text = m[2]
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .trim();
    let id = slugify(text);
    // 同名标题去重：追加序号，保证锚点唯一
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    if (n > 0) id = `${id}-${n}`;
    items.push({ id, text, level });
  }
  return items;
};

// 📍 阅读进度记忆：按文章 id 记住滚动百分比，回访时可续读。
//   只存百分比 + 时间戳，足够轻量；接近读完（≥92%）视为已读完，不再提示续读。
const PROGRESS_KEY = 'oasis_read_progress';
interface ProgressEntry { pct: number; updatedAt: number; }
export const readProgressStore = (): Record<string, ProgressEntry> => {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch { return {}; }
};
export const getReadProgress = (id: string): number => readProgressStore()[id]?.pct ?? 0;
export const setReadProgress = (id: string, pct: number) => {
  try {
    const store = readProgressStore();
    if (pct <= 0.02) { delete store[id]; }
    else store[id] = { pct: Math.min(1, pct), updatedAt: Date.now() };
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(store));
  } catch { /* ignore */ }
};
