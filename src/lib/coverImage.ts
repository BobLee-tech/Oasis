// 🖼️ 文章卡封面：从正文里挑一张图、按取景框排进封面条（演示与取舍见 docs/cards.html）。
//   选图：图注里写着「插画」的优先 → 没写图注的 → 注明「摄 / 来源」的别人的照片；
//         「作者自制 / 示意 / 剖面 / 图解」这类图解不上封面（字和线一裁就碎）。都没有就返回 null，卡片照旧用 CoverPaper。
//   取景框：写在图片地址的片段里 `![](url#focus=x0,y0,x1,y1)`（归一化 0–1），写作抽屉里拖出来；
//         片段不随请求发出，正文、灯箱、RSS 都不受影响。没框就按画面中心铺满（竖图取偏上三成）。
//   排画：框必须整个留在封面里（含余量，悬停推近也不出框）；铺满时装不下，就把画缩到框刚好装下，两边由调用方补虚影。
//   手选：正文末尾一行 Markdown 引用定义 `[oasis-cover]: <地址>`（阅读舱渲染时不显示，也不用给表加列）。
//         地址可以是文中某张图、本地上传到 R2 的图、资源包里的画（data/coverPacks.ts）；写 `none` 是不用图、用分类的纸。
//         没有这一行就按上面的次序自动挑。手选的封面，取景框写在这一行的地址上。

export interface PostImage {
  src: string;        // 原样的地址（可能带 #focus）
  alt: string;
  caption: string;    // 紧跟其后的「*图：…*」一行，去掉首尾的 * _；没有为 ''
  index: number;      // 第几张（0 起）
  urlStart: number;   // src 在正文里的起止位置，改取景框时就地替换
  urlEnd: number;
}

export type FocusBox = [number, number, number, number];

const IMG_RE = /!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g;

export const extractImages = (md: string): PostImage[] => {
  const out: PostImage[] = [];
  for (const m of md.matchAll(IMG_RE)) {
    const urlStart = m.index! + 2 + m[1].length + 2;
    const next = md.slice(m.index! + m[0].length, m.index! + m[0].length + 400).replace(/^[ \t]*\n?\s*/, '').split('\n')[0].trim();
    const caption = /^[*_]?图[：:]/.test(next) ? next.replace(/^[*_]+|[*_]+$/g, '').trim() : '';
    out.push({ src: m[2], alt: m[1], caption, index: out.length, urlStart, urlEnd: urlStart + m[2].length });
  }
  return out;
};

/** 0 插画 · 1 没图注 · 2 别人的照片 · 3 图解（不上封面） */
export const imageTier = (img: Pick<PostImage, 'caption'>): 0 | 1 | 2 | 3 => {
  const c = img.caption;
  if (/自制|示意|剖面|图解/.test(c)) return 3;
  if (/插画/.test(c)) return 0;
  if (!c) return 1;
  if (/摄|来源|wikimedia/i.test(c)) return 2;
  return 3;
};

export const pickCover = (md: string): PostImage | null => {
  let best: PostImage | null = null, bestTier = 3;
  for (const img of extractImages(md)) {
    const t = imageTier(img);
    if (t < bestTier) { best = img; bestTier = t; }
  }
  return best;
};

const FOCUS_RE = /#focus=([\d.]+),([\d.]+),([\d.]+),([\d.]+)$/;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const parseFocus = (src: string): FocusBox | null => {
  const m = src.match(FOCUS_RE);
  if (!m) return null;
  const [a, b, c, d] = m.slice(1).map(Number).map(clamp01);
  const box: FocusBox = [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
  return box[2] - box[0] > 0.001 && box[3] - box[1] > 0.001 ? box : null;
};

export const stripFocus = (src: string) => src.replace(FOCUS_RE, '');

const r2 = (v: number) => String(Math.round(clamp01(v) * 100) / 100);
export const withFocus = (src: string, box: FocusBox | null) =>
  box ? `${stripFocus(src)}#focus=${box.map(r2).join(',')}` : stripFocus(src);

/** 把某张图的取景框写回正文（img 取自同一份 md 的 extractImages / pickCover） */
export const setImageFocus = (md: string, img: PostImage, box: FocusBox | null) =>
  md.slice(0, img.urlStart) + withFocus(img.src, box) + md.slice(img.urlEnd);

export interface CoverLayout {
  width: number; height: number; left: number; top: number;
  originX: number; originY: number;  // 悬停推近以框心为原点
  letterbox: boolean;                // 画没铺满封面（两边要补虚影）
}

/** 封面 W×H、图 iw×ih：框整个留在里面，能铺满就铺满，框心尽量居中 */
export const coverLayout = (W: number, H: number, iw: number, ih: number, focus: FocusBox | null, margin = 1.06): CoverLayout => {
  // 没框：横图按中心；竖图多半是人像，脸在上部，焦点放到三成高处（只定中心、不强求整框）
  const f = focus ?? (ih > iw ? [0.5, 0.3, 0.5, 0.3] : [0.5, 0.5, 0.5, 0.5]);
  const sCover = Math.max(W / iw, H / ih);
  const bw = (f[2] - f[0]) * iw * margin, bh = (f[3] - f[1]) * ih * margin;
  const s = Math.min(sCover, bw > 0 ? W / bw : Infinity, bh > 0 ? H / bh : Infinity);
  const width = iw * s, height = ih * s;
  const originX = ((f[0] + f[2]) / 2) * width, originY = ((f[1] + f[3]) / 2) * height;
  const place = (centre: number, size: number, view: number) => Math.min(Math.max(view / 2 - centre, Math.min(0, view - size)), Math.max(0, view - size));
  return {
    width, height, originX, originY,
    left: place(originX, width, W), top: place(originY, height, H),
    letterbox: width < W - 0.5 || height < H - 0.5,
  };
};

// —— 手选封面：正文末尾的 `[oasis-cover]: …` ——
const COVER_DEF = /(^|\n)[ \t]*\[oasis-cover\]:[ \t]*(\S+)[ \t]*(?=\n|$)/;
const COVER_DEF_ALL = new RegExp(COVER_DEF.source, 'g');

export type CoverChoice = { kind: 'auto' } | { kind: 'none' } | { kind: 'src'; src: string };

export const readCoverChoice = (md: string): CoverChoice => {
  const m = md.match(COVER_DEF);
  if (!m) return { kind: 'auto' };
  return m[2] === 'none' ? { kind: 'none' } : { kind: 'src', src: m[2] };
};

/** 去掉封面那一行（摘要、阅读时长、爬虫正文用） */
export const stripCoverDef = (md: string) => md.replace(COVER_DEF_ALL, '$1');

/** 改手选：auto 删掉那一行；其余换成新的一行，放在正文最后 */
export const writeCoverChoice = (md: string, choice: CoverChoice): string => {
  if (choice.kind === 'auto' && readCoverChoice(md).kind === 'auto') return md;
  const body = md.replace(COVER_DEF_ALL, '$1').replace(/\s+$/, '');
  if (choice.kind === 'auto') return `${body}\n`;
  const value = choice.kind === 'none' ? 'none' : choice.src.replace(/ /g, '%20');
  return `${body}\n\n[oasis-cover]: ${value}\n`;
};

/** 卡片封面最终用哪张：手选 > 自动挑；手选 none 或自动挑不到都是 null（用纸） */
export const resolveCover = (md: string): string | null => {
  const c = readCoverChoice(md);
  if (c.kind === 'src') return c.src;
  if (c.kind === 'none') return null;
  return pickCover(md)?.src ?? null;
};

/** 写取景框：手选的写在封面那一行，自动挑的写回正文那张图 */
export const setCoverFocus = (md: string, box: FocusBox | null): string => {
  const c = readCoverChoice(md);
  if (c.kind === 'src') return writeCoverChoice(md, { kind: 'src', src: withFocus(c.src, box) });
  if (c.kind === 'none') return md;
  const img = pickCover(md);
  return img ? setImageFocus(md, img, box) : md;
};
