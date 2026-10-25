// 📜 分类 → 封面纸（garden/CoverPaper.tsx）。没有对应纸的分类（自定义分类）返回 null，卡片保留原来的渐变 + 图标。
export type PaperKind = 'blossom' | 'laid' | 'cloud';
const KIND_OF: Record<string, PaperKind> = { thought: 'blossom', growth: 'blossom', note: 'laid', weekly: 'laid', project: 'cloud' };
export const coverKindOf = (type: string | undefined): PaperKind | null => (type && KIND_OF[type]) || null;
