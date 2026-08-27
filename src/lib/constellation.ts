// ✦ Oasis 天文星图的纯数据层。
//
// 两条轴，各表达一件事，谁也不许兼职：
//   · 角度 = 日期。只由 createdAt 决定，与外圈 24 节气严格对应——
//     一颗立秋写的星，就在节气环「立秋」那个方向上。这条对应关系是这张图的信誉，
//     它也是「知识星图」和「随便一张力导向关系图」的全部区别，不要为了构图去动它。
//   · 半径 = 分类。每个分类占一条同心带，于是天空有了可读的地形：
//     「学习笔记在内圈，随笔在中间」。合集连线横穿带与带，星座才有形状。
//
// 拥挤不靠公式硬凑，靠 seatStars() 的贪心落座：按写作先后依次给每颗星找位置，
// 先试径向（角度最诚实）、再试角向，直到与已落的星拉开 MIN_SEP。因为只往后排、
// 从不回头改，所以「新增文章不移动任何旧星」这条不变量是算法自带的，不是碰巧成立的。
import type { BlogPost } from '../hooks/useGarden';
import { extractWikiLinks, buildTitleIndex } from './wikilinks';
import { tagKey, buildTagCanonicalMap } from './tags';

export const VW = 1000;
export const VH = 760;
export const CENTER = { x: 500, y: 376 };
export const SKY_RADIUS = 322;
const TAU = Math.PI * 2;
const DAY = 86_400_000;

// 星体可落座的环带。外缘留 16 单位给节气刻度线，内缘留出观测点周围的空白。
export const SKY_INNER = 128;
export const SKY_OUTER = 306;

// 任意两颗星（含星云 hub 与待种星位）的最小间距，viewBox 单位。
// 这个数字同时决定了命中区的下限：hitR ≥ MIN_SEP / 2，于是命中区永不互相覆盖——
// 「点最大的那颗星，打开的一定是最大的那颗」在几何上就成立了，不靠 z 序碰运气。
export const MIN_SEP = 16;

export const seeded = (str: string) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  const x = Math.sin(h) * 10000;
  return x - Math.floor(x);
};

export type NodeKind = 'core' | 'tag' | 'post' | 'pending';
export type LinkKind = 'series' | 'wikilink' | 'shared-tag' | 'nebula' | 'pending';

export interface GNode {
  key: string;
  kind: NodeKind;
  x: number;
  y: number;
  r: number;
  /** 命中半径（viewBox 单位）。由邻星距离决定，保证任意两个命中区不相交。 */
  hitR: number;
  angle?: number;
  radius?: number;
  magnitude?: number;
  /** 所属分类带的序位，归一到 0（最内圈）–1（最外圈）。星色的光谱型由它决定。 */
  band?: number;
  post?: BlogPost;
  tag?: string;
  count?: number;
  color?: string;
  aliases?: string[];
  singletonTags?: string[];
  pendingTitle?: string;
  sourcePostId?: string;
}

export interface GLink {
  key: string;
  a: GNode;
  b: GNode;
  color: string;
  kind: LinkKind;
  reason: string;
  series?: string;
  tags?: string[];
  sourcePostId?: string;
  // 兼容旧调用方；新界面只读 kind。
  core: boolean;
  wikilink?: boolean;
}

export interface ConstellationSeries {
  name: string;
  color: string;
  posts: BlogPost[];
  links: GLink[];
}

export type SkySignalKind = 'orphan' | 'pending' | 'seedling' | 'cold-series';
export interface SkySignal {
  id: string;
  kind: SkySignalKind;
  title: string;
  detail: string;
  postIds: string[];
  pendingTitle?: string;
  severity: number;
}

export interface GraphResult {
  nodes: GNode[];
  links: GLink[];
  tagNodes: Map<string, GNode>;
  postNodes: Map<string, GNode>;
  pendingNodes: Map<string, GNode>;
  tagMap: Map<string, BlogPost[]>;
  series: ConstellationSeries[];
  neighbors: Map<string, Set<string>>;
  signals: SkySignal[];
  core: GNode;
  brightest?: BlogPost;
  stalest?: BlogPost;
}

export const blendColor = (a: string, b: string): string => {
  const pa = parseInt(a.replace('#', ''), 16), pb = parseInt(b.replace('#', ''), 16);
  const mix = (shift: number) => Math.round((((pa >> shift) & 255) + ((pb >> shift) & 255)) / 2);
  return `#${[mix(16), mix(8), mix(0)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
};

const SERIES_PALETTE = ['#39C5BB', '#FFB7C5', '#8FB8ED', '#C6A7E2', '#F2BE78', '#8FD4AD'];
export const seriesColor = (name: string) => SERIES_PALETTE[Math.floor(seeded(`series:${name}`) * SERIES_PALETTE.length)];

const utcDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

// 天文年从立春近似日（2 月 4 日）起算。相同公历日严格共用同一角度。
export const solarYearPosition = (timestamp: number) => {
  const date = new Date(timestamp);
  let year = date.getUTCFullYear();
  let anchor = Date.UTC(year, 1, 4);
  if (utcDay(date) < anchor) {
    year -= 1;
    anchor = Date.UTC(year, 1, 4);
  }
  const day = Math.floor((utcDay(date) - anchor) / DAY);
  return { year, day, fraction: Math.max(0, Math.min(1, day / 365.2425)) };
};

export const angleForDate = (timestamp: number) => -Math.PI / 2 + solarYearPosition(timestamp).fraction * TAU;

/** 按节气分箱的写作密度：24 个箱，值 = 落在该节气区间内的文章数。
 *
 * 年轮盘用它把稀疏的日期点变成可读的季节纹理；文章越多，轮廓只会更清晰，
 * 不会像常驻连线一样逐渐退化成毛线团。 */
export interface DensityBin { index: number; a0: number; a1: number; count: number }
export const densityByTerm = (posts: Pick<BlogPost, 'createdAt'>[]): DensityBin[] => {
  const bins: DensityBin[] = Array.from({ length: 24 }, (_, index) => ({
    index,
    a0: -Math.PI / 2 + (index / 24) * TAU,
    a1: -Math.PI / 2 + ((index + 1) / 24) * TAU,
    count: 0,
  }));
  posts.forEach(post => {
    const fraction = solarYearPosition(post.createdAt).fraction;
    bins[Math.min(23, Math.floor(fraction * 24))].count += 1;
  });
  return bins;
};

/** 极坐标环扇形 path：密度、当前节气与后续环形图层共用同一份角度换算。 */
export const annularSector = (a0: number, a1: number, r0: number, r1: number): string => {
  const point = (angle: number, radius: number) =>
    `${(CENTER.x + Math.cos(angle) * radius).toFixed(2)} ${(CENTER.y + Math.sin(angle) * radius).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${point(a0, r0)}A${r0} ${r0} 0 ${large} 1 ${point(a1, r0)}`
    + `L${point(a1, r1)}A${r1} ${r1} 0 ${large} 0 ${point(a0, r1)}Z`;
};

/** 圆弧 path（无填充），供 textPath 沿分类参考环排字。 */
export const arcPath = (radius: number, a0: number, a1: number): string => {
  const point = (angle: number) =>
    `${(CENTER.x + Math.cos(angle) * radius).toFixed(2)} ${(CENTER.y + Math.sin(angle) * radius).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${point(a0)}A${radius} ${radius} 0 ${large} 1 ${point(a1)}`;
};

/** 一维松弛：把同侧环外标注按 y 排序，在容量允许时保持最小行距。 */
export const relaxColumn = <T extends { y: number }>(
  items: T[], minGap: number, lo: number, hi: number,
): T[] => {
  const sorted = items.map(item => ({ ...item })).sort((a, b) => a.y - b.y) as T[];
  if (!sorted.length) return sorted;

  // 容量不足时仍保证有序且不溢出；取舍应由上游的星等分级完成。
  if (hi - lo < (sorted.length - 1) * minGap) {
    const gap = sorted.length === 1 ? 0 : (hi - lo) / (sorted.length - 1);
    sorted.forEach((item, index) => { item.y = lo + index * gap; });
    return sorted;
  }

  sorted[0].y = clampNumber(sorted[0].y, lo, hi);
  for (let i = 1; i < sorted.length; i++) {
    sorted[i].y = Math.max(clampNumber(sorted[i].y, lo, hi), sorted[i - 1].y + minGap);
  }
  if (sorted[sorted.length - 1].y > hi) {
    sorted[sorted.length - 1].y = hi;
    for (let i = sorted.length - 2; i >= 0; i--) {
      sorted[i].y = Math.min(sorted[i].y, sorted[i + 1].y - minGap);
    }
  }
  return sorted;
};

const clampNumber = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

export const categoryOf = (post: Pick<BlogPost, 'type'>) => post.type || 'thought';

// —— 分类 → 同心带 ——————————————————————————————————————————————
// 带的顺序按「该分类第一篇文章的写作时间」：最早的兴趣在最内圈，新开的话题向外长。
// 这个次序只在「某个分类的第一篇」诞生时才变化——那是一次刻意的开垦，天空为它让位是合理的；
// 而日常写文章（往已有分类里加）永远不会改动任何一条带。
export interface Bands {
  /** 分类 id → 带中心半径 */
  center: Map<string, number>;
  /** 由内到外的分类次序。星色的光谱型、左沿的带名都按这个序读。 */
  order: string[];
  /** 带的半宽：落座时优先待在带内，超出才允许溢出 */
  half: number;
  /** 实际占用的半径范围，交给相机取景 */
  inner: number;
  outer: number;
}

export const bandsFor = (posts: Pick<BlogPost, 'type' | 'createdAt' | 'id'>[]): Bands => {
  const firstSeen = new Map<string, number>();
  posts.forEach(p => {
    const key = categoryOf(p);
    const at = firstSeen.get(key);
    if (at === undefined || p.createdAt < at) firstSeen.set(key, p.createdAt);
  });
  const order = [...firstSeen.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);

  const center = new Map<string, number>();
  const n = Math.max(1, order.length);
  const width = (SKY_OUTER - SKY_INNER) / n;
  order.forEach((key, i) => center.set(key, SKY_INNER + width * (i + 0.5)));
  return {
    center, order,
    half: Math.max(MIN_SEP * 0.75, width / 2 - 2),
    inner: order.length ? SKY_INNER : SKY_INNER,
    outer: order.length ? SKY_INNER + width * order.length : SKY_OUTER,
  };
};

// —— 落座 ——————————————————————————————————————————————————————
// 候选位移按「离目标多远」排序，同距离时偏爱径向：角向的每一步都是对日期的一点点谎，
// 径向不是，所以径向先走完。1.4 的权重就是这条偏好的全部实现。
const SEAT_R = 9;      // 一格径向位移
const SEAT_ARC = 11;   // 一格角向位移（弧长，落座时再除以半径换成弧度）
const SEAT_SPAN = 13;  // 每个方向最多找 13 格

const SEAT_OFFSETS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let i = -SEAT_SPAN; i <= SEAT_SPAN; i++) {
    for (let j = -SEAT_SPAN; j <= SEAT_SPAN; j++) out.push([i * SEAT_R, j * SEAT_ARC]);
  }
  return out.sort((a, b) =>
    Math.hypot(a[0], a[1] * 1.4) - Math.hypot(b[0], b[1] * 1.4)
    || Math.abs(a[1]) - Math.abs(b[1]) || a[0] - b[0] || a[1] - b[1]);
})();

// 落座用的稀疏网格。格边长 = MIN_SEP，于是「有没有人挨得太近」只需查 3×3 个格子，
// 600 篇文章也不会退化成两两比对。
class Seats {
  private grid = new Map<number, { x: number; y: number }[]>();
  private key = (cx: number, cy: number) => (cx + 4096) * 8192 + (cy + 4096);

  free(x: number, y: number, sep: number) {
    const cx = Math.floor(x / MIN_SEP), cy = Math.floor(y / MIN_SEP);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const bucket = this.grid.get(this.key(cx + i, cy + j));
        if (!bucket) continue;
        for (const p of bucket) if (Math.hypot(p.x - x, p.y - y) < sep) return false;
      }
    }
    return true;
  }

  add(x: number, y: number) {
    const k = this.key(Math.floor(x / MIN_SEP), Math.floor(y / MIN_SEP));
    const bucket = this.grid.get(k);
    if (bucket) bucket.push({ x, y }); else this.grid.set(k, [{ x, y }]);
  }

  /** 最近邻距离，用来把命中区收到刚好不重叠 */
  nearest(x: number, y: number) {
    let best = Infinity;
    const cx = Math.floor(x / MIN_SEP), cy = Math.floor(y / MIN_SEP);
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        const bucket = this.grid.get(this.key(cx + i, cy + j));
        if (!bucket) continue;
        for (const p of bucket) {
          const d = Math.hypot(p.x - x, p.y - y);
          if (d > 0.001 && d < best) best = d;
        }
      }
    }
    return best;
  }
}

export interface Seat { x: number; y: number; angle: number; radius: number }

// 先在带内找，找不到再放开带的约束。两段式而不是一次搜完，是为了让「同分类聚成一条带」
// 这件事在绝大多数情况下成立，只有真挤不下时才牺牲。
const seatOne = (
  seats: Seats, targetAngle: number, targetRadius: number, half: number, sep = MIN_SEP,
): Seat => {
  for (const inBand of [true, false]) {
    for (const [dr, darc] of SEAT_OFFSETS) {
      if (inBand && Math.abs(dr) > half) continue;
      const radius = Math.min(SKY_OUTER, Math.max(SKY_INNER, targetRadius + dr));
      const angle = targetAngle + darc / radius;
      const x = CENTER.x + Math.cos(angle) * radius;
      const y = CENTER.y + Math.sin(angle) * radius;
      if (seats.free(x, y, sep)) { seats.add(x, y); return { x, y, angle, radius }; }
    }
  }
  // 兜底：候选全满（需要上千颗星挤在一条带里）时原地叠放，宁可重叠也不能返回 NaN。
  const x = CENTER.x + Math.cos(targetAngle) * targetRadius;
  const y = CENTER.y + Math.sin(targetAngle) * targetRadius;
  seats.add(x, y);
  return { x, y, angle: targetAngle, radius: targetRadius };
};

// 同一年内分类带里的细分：越新越靠带的外沿。四档，跨度小，只够读出「这批更旧」。
const yearNudge = (yearsAgo: number) => -Math.min(3, Math.max(0, yearsAgo)) * 6;

export interface Layout {
  seats: Map<string, Seat>;
  bands: Bands;
  /** 同一张网格继续给星云 hub 和待种星位落座，它们也不许压在星上 */
  grid: Seats;
}

// 全图落座。返回 post id → 座位，顺序严格按 createdAt 升序（同刻按 id），
// 因此「后来的星只能往空处坐，坐不动已经在那儿的星」。
export const layoutStars = (posts: BlogPost[], now = Date.now()): Layout => {
  const bands = bandsFor(posts);
  const grid = new Seats();
  const seats = new Map<string, Seat>();
  const nowYear = solarYearPosition(now).year;

  [...posts]
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .forEach(post => {
      const band = bands.center.get(categoryOf(post)) ?? (SKY_INNER + SKY_OUTER) / 2;
      const yearsAgo = Math.max(0, nowYear - solarYearPosition(post.createdAt).year);
      seats.set(post.id, seatOne(
        grid, angleForDate(post.createdAt), band + yearNudge(yearsAgo), bands.half,
      ));
    });

  return { seats, bands, grid };
};

// —— 相机：星图从不「适配到内容」那么紧，它适配到一个可读的天区 ——
// 严格 fit 到内容会把画面放大到弧线拉直、一个节气名都看不见，那就不再是一张星图了。
// 所以给一个最小视野，保证永远读得出弧的弯度和左右两个节气。
//
// 60° 而不是 90°：半径现在也承载信息（分类带占满 128–306），fit 的高度方向已经被
// 填满了，角度方向再强撑一个季度只会换来三分之二的空白——一个 25 天大的花园撑不满
// 90°，硬撑的结果就是「这个板块看起来没东西」。
export const MIN_WINDOW = Math.PI / 3;
export interface SkyWindow { center: number; span: number; rInner: number; rOuter: number; }

// 圆周上包含全部角度的最短弧：排序后找最大空隙，取其补弧。
export const skyWindow = (posts: Pick<BlogPost, 'createdAt'>[], now = Date.now()): SkyWindow => {
  // rOuter 一定要盖住节气环：那一圈标注是这张图的坐标说明，不该在「全图」时被裁掉。
  const fallback: SkyWindow = {
    center: angleForDate(now), span: TAU, rInner: SKY_INNER - 30, rOuter: SKY_RADIUS + 30,
  };
  if (!posts.length) return fallback;
  const angles = [...new Set(posts.map(p => angleForDate(p.createdAt)))].sort((a, b) => a - b);
  if (angles.length === 1) return { ...fallback, center: angles[0], span: MIN_WINDOW };

  let gapStart = 0, gap = 0;
  for (let i = 0; i < angles.length; i++) {
    const next = angles[(i + 1) % angles.length] + (i === angles.length - 1 ? TAU : 0);
    if (next - angles[i] > gap) { gap = next - angles[i]; gapStart = i; }
  }
  const arc = TAU - gap;
  const start = angles[(gapStart + 1) % angles.length];
  const span = Math.min(TAU, Math.max(MIN_WINDOW, arc * 1.35));
  return { ...fallback, center: start + arc / 2, span };
};

// 天区 → 视口包围盒。沿两条弧取样即可，扇形的极值一定落在弧上或径向边上。
export const skyBounds = (win: SkyWindow) => {
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i <= 64; i++) {
    const a = win.center - win.span / 2 + (win.span * i) / 64;
    for (const r of [win.rInner, win.rOuter]) {
      xs.push(CENTER.x + Math.cos(a) * r);
      ys.push(CENTER.y + Math.sin(a) * r);
    }
  }
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

const pairKey = (a: string, b: string) => [a, b].sort().join('|');

// ✦ 星等：真实星图只有几档星等，这里也只有 5 档，和字号/墨度/线宽一样是刻度而不是连续值。
//
// 排序用语料内的分位数，不用绝对对数。曾经写的是 4 + log2(字数+32)*0.72，问题是
// log2 对任何真实文章都落在同一个量级（2000 字 ≈ 11，20000 字 ≈ 14.3），
// 于是每颗星都顶到 16 的上限——屏幕上是一片 70px 的白肉球，互相粘成阿米巴。
// 分位数保证无论语料多长多短，天上永远是「少数几颗亮星 + 一片小星」。
// 跨度刻意收窄：真实图版上一等星和五等星的差别是含蓄的。
// 2→6 的半径差意味着 9 倍面积，最亮那颗会像个洞。
const MAGNITUDE_RADII = [2.2, 2.8, 3.4, 4.2, 5.2];
const starWeight = (post: BlogPost, degree: number) => post.content.length + degree * 800;

const makeLink = (
  kind: LinkKind,
  a: GNode,
  b: GNode,
  color: string,
  reason: string,
  extra: Partial<GLink> = {},
): GLink => ({
  key: `${kind}:${a.key}:${b.key}:${reason}`,
  a, b, color, kind, reason,
  core: false,
  wikilink: kind === 'wikilink',
  ...extra,
});

export const buildGraph = (
  posts: BlogPost[],
  typeColorOf: (post: BlogPost) => string,
  now = Date.now(),
): GraphResult => {
  const canonicalOf = buildTagCanonicalMap(posts.flatMap(p => p.tags));
  const tagMap = new Map<string, BlogPost[]>();
  posts.forEach(p => p.tags.forEach(raw => {
    const key = tagKey(raw);
    const group = tagMap.get(key) ?? [];
    if (!group.some(item => item.id === p.id)) group.push(p);
    tagMap.set(key, group);
  }));

  const core: GNode = { key: '__core', kind: 'core', x: CENTER.x, y: CENTER.y, r: 23, hitR: 23 };

  // 角度=日期、半径=分类带、拥挤处贪心让位。详见文件头与 layoutStars()。
  const layout = layoutStars(posts, now);

  // 带的序位归一到 0–1，交给界面换算光谱型：最早开垦的分类在内圈（暖），新话题在外圈（冷）。
  // 只有一条带时给 0.5（中间那档的近白），不然一整片天会是单调的暖或单调的冷。
  const bandSpan = Math.max(1, layout.bands.order.length - 1);
  const bandOf = (post: BlogPost) => {
    const at = layout.bands.order.indexOf(categoryOf(post));
    return layout.bands.order.length < 2 || at < 0 ? 0.5 : at / bandSpan;
  };

  const postNodes = new Map<string, GNode>();
  posts.forEach(post => {
    const seat = layout.seats.get(post.id)!;
    postNodes.set(post.id, {
      key: `post:${post.id}`,
      kind: 'post', post,
      x: seat.x, y: seat.y, angle: seat.angle, radius: seat.radius,
      band: bandOf(post),
      r: 6, hitR: MIN_SEP / 2, color: typeColorOf(post),
      singletonTags: post.tags.filter(t => (tagMap.get(tagKey(t))?.length ?? 0) === 1),
    });
  });

  const links: GLink[] = [];
  const seriesGroups = new Map<string, BlogPost[]>();
  posts.forEach(post => {
    const name = post.series?.trim();
    if (!name) return;
    seriesGroups.set(name, [...(seriesGroups.get(name) ?? []), post]);
  });

  const series: ConstellationSeries[] = [];
  seriesGroups.forEach((group, name) => {
    const ordered = [...group].sort((a, b) => a.createdAt - b.createdAt);
    const color = seriesColor(name);
    const seriesLinks: GLink[] = [];
    for (let i = 1; i < ordered.length; i++) {
      const a = postNodes.get(ordered[i - 1].id)!;
      const b = postNodes.get(ordered[i].id)!;
      const link = makeLink('series', a, b, color, `同属合集《${name}》`, { series: name });
      links.push(link); seriesLinks.push(link);
    }
    series.push({ name, color, posts: ordered, links: seriesLinks });
  });

  // 标签分档：2–3 篇直连；4 篇以上才形成星云；单例只留在星旁刻痕和抽屉里。
  //
  // 两条去重规则，否则同一个分组会被画好几遍——线上真实数据里 #comp3121 / #计算机 / 合集
  // 《COMP3121》的成员集合 Jaccard 全部等于 1，是同样的四篇：
  //   · 成员集合与某个合集完全相同的标签不建星云，合集连线已经把这件事说完了；
  //   · 两个标签的 Jaccard > 0.8 就并成一个星云，两个名字并列写。
  const idSetKey = (group: BlogPost[]) => group.map(p => p.id).sort().join('|');
  const seriesSetKeys = new Set(series.filter(s => s.posts.length > 1).map(s => idSetKey(s.posts)));
  const jaccard = (a: BlogPost[], b: BlogPost[]) => {
    const setB = new Set(b.map(p => p.id));
    const hit = a.filter(p => setB.has(p.id)).length;
    return hit / (a.length + b.length - hit);
  };

  const tagNodes = new Map<string, GNode>();
  const hubGroups: { key: string; group: BlogPost[] }[] = [];
  const sharedPairs = new Map<string, { a: BlogPost; b: BlogPost; tags: string[] }>();

  // 大标签优先当锚：谁先落定，后来的近义标签就并进谁。按篇数降序保证与插入顺序无关。
  [...tagMap.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .forEach(([key, group]) => {
      const name = canonicalOf.get(key) ?? key;
      if (group.length >= 4) {
        if (seriesSetKeys.has(idSetKey(group))) return;
        const merged = hubGroups.find(h => jaccard(h.group, group) > 0.8);
        if (merged) {
          const node = tagNodes.get(merged.key)!;
          node.aliases = [...(node.aliases ?? []), name];
          return;
        }
        // 星云落在成员的重心稍稍偏内处，再走一次落座——它是实体，不能压在星上。
        const positions = group.map(p => postNodes.get(p.id)!);
        const avgX = positions.reduce((sum, n) => sum + n.x, 0) / positions.length;
        const avgY = positions.reduce((sum, n) => sum + n.y, 0) / positions.length;
        const dx = avgX - CENTER.x, dy = avgY - CENTER.y;
        const seat = seatOne(
          layout.grid, Math.atan2(dy, dx), Math.max(SKY_INNER, Math.hypot(dx, dy) - 30),
          SKY_OUTER, MIN_SEP * 1.25,
        );
        const node: GNode = {
          key: `tag:${key}`, kind: 'tag', tag: name, count: group.length,
          x: seat.x, y: seat.y, angle: seat.angle, radius: seat.radius,
          r: 5 + Math.sqrt(group.length) * 1.2, hitR: MIN_SEP / 2,
        };
        tagNodes.set(key, node);
        hubGroups.push({ key, group });
        group.forEach(post => links.push(makeLink('nebula', node, postNodes.get(post.id)!, '#94a3b8', `汇入星云 #${name}`, { tags: [name] })));
        return;
      }
      if (group.length < 2) return;
      for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
        const keyPair = pairKey(group[i].id, group[j].id);
        const hit = sharedPairs.get(keyPair) ?? { a: group[i], b: group[j], tags: [] };
        hit.tags.push(name);
        sharedPairs.set(keyPair, hit);
      }
    });
  sharedPairs.forEach(({ a, b, tags }) => {
    links.push(makeLink(
      'shared-tag', postNodes.get(a.id)!, postNodes.get(b.id)!,
      blendColor(typeColorOf(a), typeColorOf(b)),
      `共享 ${tags.map(t => `#${t}`).join(' · ')}`,
      { tags },
    ));
  });

  // 作者亲手写下的双链最可信；去重但保留来源，用于抽屉解释。
  const titleIndex = buildTitleIndex(posts);
  const wikiSeen = new Set<string>();
  const pendingNodes = new Map<string, GNode>();
  posts.forEach(source => {
    const sourceNode = postNodes.get(source.id)!;
    extractWikiLinks(source.content).forEach(title => {
      const target = titleIndex.get(title.trim().toLowerCase());
      if (target && target.id !== source.id) {
        const pair = pairKey(source.id, target.id);
        if (wikiSeen.has(pair)) return;
        wikiSeen.add(pair);
        links.push(makeLink(
          'wikilink', sourceNode, postNodes.get(target.id)!,
          blendColor(typeColorOf(source), typeColorOf(target)),
          `《${source.title}》引用了 [[${target.title}]]`,
          { sourcePostId: source.id },
        ));
        return;
      }
      if (target?.id === source.id) return;
      const pendingKey = `pending:${source.id}:${title.toLowerCase()}`;
      if (pendingNodes.has(pendingKey)) return;
      // 待种的星位挨着引用它的那篇，落在稍外侧——「这篇文章伸手够向的地方」。
      const offset = (seeded(pendingKey) > 0.5 ? 1 : -1) * 0.05;
      const seat = seatOne(
        layout.grid, (sourceNode.angle ?? 0) + offset,
        (sourceNode.radius ?? SKY_INNER) + 34, SKY_OUTER,
      );
      const pending: GNode = {
        key: pendingKey, kind: 'pending', pendingTitle: title, sourcePostId: source.id,
        x: seat.x, y: seat.y, angle: seat.angle, radius: seat.radius,
        r: 5, hitR: MIN_SEP / 2,
      };
      pendingNodes.set(pendingKey, pending);
      links.push(makeLink('pending', sourceNode, pending, '#94a3b8', `等待种下 [[${title}]]`, { sourcePostId: source.id }));
    });
  });

  // 同一对文章已经被合集连线或双链连上时，那条共享标签的细线是重复的墨——擦掉。
  const strongPairs = new Set(
    links
      .filter(l => (l.kind === 'series' || l.kind === 'wikilink') && l.a.kind === 'post' && l.b.kind === 'post')
      .map(l => pairKey(l.a.post!.id, l.b.post!.id)),
  );
  for (let i = links.length - 1; i >= 0; i--) {
    const l = links[i];
    if (l.kind === 'shared-tag' && strongPairs.has(pairKey(l.a.post!.id, l.b.post!.id))) links.splice(i, 1);
  }

  const degree = new Map<string, number>();
  links.forEach(link => {
    if (link.kind === 'pending') return;
    if (link.a.kind === 'post') degree.set(link.a.post!.id, (degree.get(link.a.post!.id) ?? 0) + 1);
    if (link.b.kind === 'post') degree.set(link.b.post!.id, (degree.get(link.b.post!.id) ?? 0) + 1);
  });
  // magnitude 这里是「亮度序位」，1 最暗、5 最亮——与天文学的星等方向相反，
  // 但全站（标注 LOD、Tab 顺序、最亮的星）都按「大 = 亮」读，别改方向。
  const ordered = [...posts].sort((a, b) =>
    starWeight(a, degree.get(a.id) ?? 0) - starWeight(b, degree.get(b.id) ?? 0) || a.id.localeCompare(b.id));
  ordered.forEach((post, index) => {
    const tier = ordered.length <= 1 ? 4 : Math.min(4, Math.floor((index / ordered.length) * 5));
    const node = postNodes.get(post.id)!;
    node.r = MAGNITUDE_RADII[tier];
    node.magnitude = tier + 1;
  });

  // 命中区收到「到最近邻的一半」：相邻两个命中区最多相切，永不相交。
  // 上限 15 是拇指的舒适尺寸，下限保证再挤也还点得到（不够就靠缩放，命中区随之放大）。
  [...postNodes.values(), ...tagNodes.values(), ...pendingNodes.values()].forEach(node => {
    const gap = layout.grid.nearest(node.x, node.y);
    node.hitR = Math.min(15, Math.max(node.r + 2, (Number.isFinite(gap) ? gap : MIN_SEP) / 2));
  });

  const neighbors = new Map<string, Set<string>>();
  posts.forEach(p => neighbors.set(p.id, new Set()));
  links.forEach(link => {
    if (link.a.kind !== 'post' || link.b.kind !== 'post') return;
    neighbors.get(link.a.post!.id)?.add(link.b.post!.id);
    neighbors.get(link.b.post!.id)?.add(link.a.post!.id);
  });

  const signals: SkySignal[] = [];
  const orphans = posts.filter(p => (neighbors.get(p.id)?.size ?? 0) === 0);
  if (orphans.length) signals.push({
    id: 'orphan', kind: 'orphan', severity: 2,
    title: `${orphans.length} 颗孤星没有航线`,
    detail: '它们没有合集、双链或可复用主题；也许值得补一条通往旧思想的路。',
    postIds: orphans.map(p => p.id),
  });
  pendingNodes.forEach(node => signals.push({
    id: node.key, kind: 'pending', severity: 3,
    title: `未种下：${node.pendingTitle}`,
    detail: `《${postNodes.get(node.sourcePostId!)?.post?.title ?? '一篇文章'}》正在等待这颗星。`,
    postIds: [node.sourcePostId!], pendingTitle: node.pendingTitle,
  }));
  const oldSeedlings = posts.filter(p => p.growth === 'seedling' && now - p.updatedAt > 30 * DAY);
  if (oldSeedlings.length) signals.push({
    id: 'seedling', kind: 'seedling', severity: 1,
    title: `${oldSeedlings.length} 颗种子等待照料`,
    detail: '它们以 seedling 状态停留超过 30 天。',
    postIds: oldSeedlings.map(p => p.id),
  });
  series.filter(s => s.posts.length >= 2).forEach(s => {
    const last = Math.max(...s.posts.map(p => p.updatedAt));
    if (now - last <= 90 * DAY) return;
    signals.push({
      id: `cold:${s.name}`, kind: 'cold-series', severity: 1,
      title: `星座《${s.name}》正在冷却`,
      detail: '这个合集已经 90 天没有新光。',
      postIds: s.posts.map(p => p.id),
    });
  });
  signals.sort((a, b) => b.severity - a.severity);

  const ranked = [...postNodes.values()].sort((a, b) => (b.magnitude ?? 0) - (a.magnitude ?? 0));
  const nodes = [core, ...tagNodes.values(), ...postNodes.values(), ...pendingNodes.values()];
  return {
    nodes, links, tagNodes, postNodes, pendingNodes, tagMap, series, neighbors, signals, core,
    brightest: ranked[0]?.post,
    stalest: [...posts].sort((a, b) => a.updatedAt - b.updatedAt)[0],
  };
};
