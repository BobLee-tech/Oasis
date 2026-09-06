// ✦ Oasis 星野的纯数据层。
//
// 一条规矩管住整张天：**出生时择邻，此后终生不迁**。
// 按 createdAt 顺序依次落座，每一步只看「已经落好的星」，从不回头改——
// 所有的布局智力都花在「这颗星生在哪」，落下之后再不动它。
// 于是「新增文章不移动任何旧星」是算法自带的，不是碰巧成立的。
//
// 星座 = 合集，连线 = 合集次序。图形是数据长出来的，不是画上去的。
// 上一版把角度编成日期、半径编成分类——那是把最贵的两个通道花在了博客列表
// 已经用一行日期和一枚 chip 说清楚的事上，星图因此没有职位。日期改由可开关的
// 时间尺兑现（每颗星垂一根线到它真实的节气），分类只留一点色相。
//
// 详见 docs/redesign-2026-08/04-sky-ye.md。
import type { BlogPost } from '../hooks/useGarden';
import { extractWikiLinks, buildTitleIndex } from './wikilinks';
import { readingMinutes } from './reading';
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

export type NodeKind = 'core' | 'tag' | 'post';
export type LinkKind = 'series' | 'wikilink' | 'shared-tag' | 'nebula';

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
// 四种情形，见文件头。所有随机都走 seeded()，所以这是一个纯函数。
const TERR = 168;        // 领地间距：星座之间要有黑，图案才立得住
const GOLD = 2.39996;    // 137.5°，黄金角。保证领地不重叠又不成行列
const SQUASH = 0.72;     // 版心是横的，天也跟着压扁一点
const CHAIN_STEP = 58;   // 链往前长一步的基准长度
const KIN_MIN = 74, KIN_SPAN = 52;   // 散星落在亲戚旁边的半径区间

// 落座用的稀疏网格。格边长 = MIN_SEP，于是「有没有人挨得太近」只需查 3×3 个格子，
// 600 篇文章也不会退化成两两比对。
class Seats {
  private grid = new Map<number, { x: number; y: number }[]>();
  private key = (cx: number, cy: number) => (cx + 4096) * 8192 + (cy + 4096);

  /** 挡路的那颗（3×3 邻域内最近的越界者）。外推需要知道从谁身边让开。 */
  hit(x: number, y: number, sep: number) {
    const cx = Math.floor(x / MIN_SEP), cy = Math.floor(y / MIN_SEP);
    let best: { x: number; y: number } | null = null, bd = Infinity;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const bucket = this.grid.get(this.key(cx + i, cy + j));
        if (!bucket) continue;
        for (const p of bucket) {
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < sep && d < bd) { bd = d; best = p; }
        }
      }
    }
    return best;
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

const asSeat = (x: number, y: number): Seat => ({
  x, y,
  angle: Math.atan2(y - CENTER.y, x - CENTER.x),
  radius: Math.hypot(x - CENTER.x, y - CENTER.y),
});

// 冲突只往外推，永不换位。每一轮把推开的距离加大一点点（i * 0.01），
// 于是它单调向外、必然收敛——否则两颗星之间可以来回弹到天荒地老。
const pushOut = (grid: Seats, sx: number, sy: number): Seat => {
  let x = sx, y = sy, spin = 0;
  for (let i = 0; i < 256; i++) {
    const hit = grid.hit(x, y, MIN_SEP);
    if (!hit) break;
    const dx = x - hit.x, dy = y - hit.y;
    const far = Math.hypot(dx, dy) > 1e-6;
    // 完全重合时没有「外」的方向可言，绕着走一圈找
    if (!far) spin += 0.61803;
    const a = far ? Math.atan2(dy, dx) : spin * Math.PI * 2;
    const push = MIN_SEP * (1.06 + i * 0.01);
    x = hit.x + Math.cos(a) * push;
    y = hit.y + Math.sin(a) * push;
  }
  grid.add(x, y);
  return asSeat(x, y);
};

/** 给非文章的实体（星云 hub 等）在已有网格里找一个不压星的位置。 */
export const seatNear = (grid: Seats, x: number, y: number): Seat => pushOut(grid, x, y);

interface Territory { name: string; stars: Seat[]; tags: Set<string>; head: number }

export interface Layout {
  seats: Map<string, Seat>;
  bands: Bands;
  /** 同一张网格继续给星云 hub 落座，它们也不许压在星上 */
  grid: Seats;
}

// 全图落座。顺序严格按 createdAt 升序（同刻按 id），因此后来的星只能往空处坐。
export const layoutStars = (posts: BlogPost[]): Layout => {
  const bands = bandsFor(posts);
  const grid = new Seats();
  const seats = new Map<string, Seat>();
  const groups = new Map<string, Territory>();
  let claimed = 0;

  // 新领地：黄金角螺线，半径 ∝ √k，再乘一个种子疏密系数。
  // 完全均匀的分布看着最不像天，所以要有丛有空。
  const spiral = (key: string) => {
    const k = claimed++;
    const a = k * GOLD + (seeded(`terr:${key}`) - 0.5) * 0.8;
    const r = TERR * Math.sqrt(k + 0.55) * (0.74 + seeded(`dens:${key}`) * 0.82);
    return { x: CENTER.x + Math.cos(a) * r, y: CENTER.y + Math.sin(a) * r * SQUASH };
  };

  [...posts]
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .forEach(post => {
      const name = post.series?.trim() || '';
      const keys = post.tags.map(tagKey);
      let base: { x: number; y: number };

      if (name && groups.has(name)) {
        // 老合集：从最后一颗星沿它的走向续一步。
        // 真实星座是折线不是弧——转角放到 ±58°，偶尔来一个更硬的肘，步长也跳，
        // 等步长等转角画出来是一条蚯蚓，不是仙后座。
        const g = groups.get(name)!;
        const last = g.stars[g.stars.length - 1];
        const prev = g.stars.length > 1 ? g.stars[g.stars.length - 2] : null;
        const head = prev ? Math.atan2(last.y - prev.y, last.x - prev.x) : g.head;
        const t0 = seeded(`turn:${post.id}`), t1 = seeded(`step:${post.id}`);
        const turn = (t0 - 0.5) * 2.02 * (t1 > 0.78 ? 1.5 : 1);
        const step = CHAIN_STEP * (0.55 + t1 * 1.15);
        base = { x: last.x + Math.cos(head + turn) * step, y: last.y + Math.sin(head + turn) * step };
      } else if (name) {
        base = spiral(name);
      } else {
        // 散星：先找亲戚。共标签就落在它旁边，天上才有「这一带都是这个话题」。
        let kin: Territory | null = null;
        for (const g of groups.values()) if (keys.some(t => g.tags.has(t))) { kin = g; break; }
        if (kin) {
          const c = kin.stars[kin.stars.length - 1];
          const a = seeded(`kin:${post.id}`) * Math.PI * 2;
          const r = KIN_MIN + seeded(`kinr:${post.id}`) * KIN_SPAN;
          base = { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r * SQUASH };
        } else base = spiral(`loose:${post.id}`);
      }

      const seat = pushOut(grid, base.x, base.y);
      seats.set(post.id, seat);

      if (name) {
        let g = groups.get(name);
        if (!g) {
          g = { name, stars: [], tags: new Set(), head: seat.angle + (seeded(`head:${name}`) - 0.5) };
          groups.set(name, g);
        }
        g.stars.push(seat);
        keys.forEach(t => g!.tags.add(t));
      }
    });

  return { seats, bands, grid };
};

// —— 相机：fit 到版心，不再 fit 到「一个可读的天区」——————————————
// 底图不是量尺了，没有「必须读得出弧的弯度」这回事；版心自己就是取景框。
// 版心 = 所有星的包围盒 + 留白，下限保证八颗星的时候也是一张版而不是一撮点。
export const PLATE_PAD = 88;
export const PLATE_MIN_W = 780;
export const PLATE_MIN_H = 526;

export interface Plate { x: number; y: number; width: number; height: number }

export const plateBounds = (points: { x: number; y: number }[]): Plate => {
  if (!points.length) {
    return { x: CENTER.x - PLATE_MIN_W / 2, y: CENTER.y - PLATE_MIN_H / 2, width: PLATE_MIN_W, height: PLATE_MIN_H };
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  let w = Math.max(PLATE_MIN_W, x1 - x0 + PLATE_PAD * 2);
  let h = Math.max(PLATE_MIN_H, y1 - y0 + PLATE_PAD * 2);
  // 长宽比锁死，版心永远是同一张纸的形状
  if (w / h < PLATE_MIN_W / PLATE_MIN_H) w = h * (PLATE_MIN_W / PLATE_MIN_H);
  else h = w * (PLATE_MIN_H / PLATE_MIN_W);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
};

const pairKey = (a: string, b: string) => [a, b].sort().join('|');

// ✦ 星等 = 篇幅。一档，不可切。
//
// 门限必须贴着真实数据定：现有最长的一篇 25 分钟，五等门限就得 ≤25，
// 否则最亮那档和「芒」永远不会出现——整张图会是一片平的。原型里踩过这个坑。
// 曾经用过语料内分位数，问题是它让同一篇文章的亮度随着别人写了什么而变；
// 绝对门限则是「这篇有多长」的老实回答，也不会因为新文章而改动旧星的亮度。
const MAG_MINUTES = [7, 12, 18, 25];
export const magnitudeOf = (post: Pick<BlogPost, 'content'>): number => {
  const minutes = readingMinutes(post.content);
  let m = 1;
  for (const gate of MAG_MINUTES) if (minutes >= gate) m++;
  return Math.min(5, m);
};
// 星的屏幕半径由 CSS 的 --sky-r1..5 给（缩放补偿在那里做），这份只作兜底。
const MAGNITUDE_RADII = [2.4, 2.9, 3.6, 4.6, 6.4];

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

  // 出生时择邻，此后终生不迁。详见文件头与 layoutStars()。
  const layout = layoutStars(posts);

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
        const seat = seatNear(layout.grid, avgX, avgY);
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
  // 欠着的稿子只进观测手记，不落星：它是园丁的待办，不是读者的地标。
  const pendingTitles = new Map<string, { title: string; sourceId: string }>();
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
      // 「未种下的星」这个概念已经去掉：欠着的稿子不该在天上占一个位置，
      // 它是园丁的待办不是读者的地标。仍然记进 signals，只是不再画成星。
      const key = `pending:${source.id}:${title.toLowerCase()}`;
      if (!pendingTitles.has(key)) pendingTitles.set(key, { title, sourceId: source.id });
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

  // magnitude 这里是「亮度序位」，1 最暗、5 最亮——与天文学的星等方向相反，
  // 但全站（标注 LOD、Tab 顺序、最亮的星）都按「大 = 亮」读，别改方向。
  posts.forEach(post => {
    const node = postNodes.get(post.id)!;
    node.magnitude = magnitudeOf(post);
    node.r = MAGNITUDE_RADII[node.magnitude - 1];
  });

  // 命中区收到「到最近邻的一半」：相邻两个命中区最多相切，永不相交。
  // 上限 15 是拇指的舒适尺寸，下限保证再挤也还点得到（不够就靠缩放，命中区随之放大）。
  [...postNodes.values(), ...tagNodes.values()].forEach(node => {
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
  pendingTitles.forEach(({ title, sourceId }, key) => signals.push({
    id: key, kind: 'pending', severity: 3,
    title: `未种下：${title}`,
    detail: `《${postNodes.get(sourceId)?.post?.title ?? '一篇文章'}》正在等待这颗星。`,
    postIds: [sourceId], pendingTitle: title,
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
  const nodes = [core, ...tagNodes.values(), ...postNodes.values()];
  return {
    nodes, links, tagNodes, postNodes, tagMap, series, neighbors, signals, core,
    brightest: ranked[0]?.post,
    stalest: [...posts].sort((a, b) => a.updatedAt - b.updatedAt)[0],
  };
};
