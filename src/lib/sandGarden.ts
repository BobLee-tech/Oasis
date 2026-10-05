// ✦ 砂与星 —— 星图的纯数据层（无 DOM）。
//
// 同一套几何，昼是枯山水砂庭，夜是星池。每一笔都在编码一件数据：
//   石 / 星         = 文章（大小 = 篇幅五档；种子虚线卵石、常青覆苔 / 四角芒）
//   庭              = 分类（一组石 + 竖排庭名 + 带分类色的砂纹）
//   飞石 / 星座线   = 合集（入口立一盏石灯笼 = 第一章）
//   石桥 / 鹊桥     = 双链 [[标题]]
//   砂纹            = 距离场等值线（Bubble Sets 同一原理）
//
// 一条规矩管住整座庭：**出生时择邻，此后终生不迁**。按 createdAt 依次落座，
// 每一步只看已经落好的石，从不回头改——「新增文章不移动任何旧石」是算法自带的。
// sandGarden.test.ts 用前缀不变量守着它。方案见 docs/constellation-v5.1-refinement.md。
import type { BlogPost } from '../hooks/useGarden';
import { extractWikiLinks, buildTitleIndex } from './wikilinks';
import { readingMinutes } from './reading';
import { tagKey, buildTagCanonicalMap } from './tags';
import { SOLAR_TERMS } from './solarTerms';

export const DAY = 86_400_000;

export const seeded = (str: string) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  const x = Math.sin(h) * 10000;
  return x - Math.floor(x);
};

// ══ 尺寸阶 ══════════════════════════════════════════════════════════════════
// 星等 = 篇幅（门限贴真实数据：7 / 12 / 18 / 25 分钟——最长的文章 25 分钟，
// 门限再高最亮那档就永远不出现）。相邻两档半径 ×1.26（面积 ×1.59）：人眼对圆面积的
// 感知约为实际面积的 0.87 次方（Flannery），补偿后五档在感知上大致等距。
export const MAG_MINUTES = [7, 12, 18, 25];
export const magOfMinutes = (min: number) => {
  let m = 1;
  for (const g of MAG_MINUTES) if (min >= g) m++;
  return Math.min(5, m);
};
export const RS = [4.8, 6.0, 7.5, 9.5, 12.0];   // 石半径 px（昼）
export const RH = [0.8, 1.4, 2.2, 3.2, 4.2];    // 石高 → 影长 px：越长的文章越「高」
export const RC = [1.6, 2.0, 2.5, 3.2, 4.0];    // 星核半径 px（夜）；晕 = 核 × 4.4
// 借日本庭园「五行石」的分法，俯视能分辨的只取三种：一二等平石、三等低立石、四五等立石
export const ARCH = [
  { name: '平石', sq: .62, e1: .05, e2: .03 }, { name: '平石', sq: .68, e1: .06, e2: .04 },
  { name: '低立石', sq: .8, e1: .08, e2: .05 }, { name: '立石', sq: .88, e1: .1, e2: .06 },
  { name: '立石', sq: .92, e1: .12, e2: .07 },
];
export type Arch = typeof ARCH[number];

// ══ 数据 ════════════════════════════════════════════════════════════════════
export interface SandPost {
  id: string;
  title: string;
  series: string | null;
  cat: string;
  createdAt: number;
  updatedAt: number;
  minutes: number;
  growth: BlogPost['growth'];
  tags: string[];
  excerpt: string;
  /** 这篇正文里 [[双链]] 命中的其他文章 id（已去重、不含自己）。 */
  links: string[];
}

const excerptOf = (post: BlogPost) => {
  if (post.excerpt?.trim()) return post.excerpt.trim();
  return (post.content ?? '')
    .replace(/```[\s\S]*?```/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/[#>*_`~-]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, 96);
};

export const toSandPosts = (posts: BlogPost[]): SandPost[] => {
  const canonical = buildTagCanonicalMap(posts.flatMap(p => p.tags));
  const titles = buildTitleIndex(posts);
  return posts.map(p => {
    const links = new Set<string>();
    extractWikiLinks(p.content).forEach(t => {
      const hit = titles.get(t.trim().toLowerCase());
      if (hit && hit.id !== p.id) links.add(hit.id);
    });
    const tags = [...new Set(p.tags.map(t => canonical.get(tagKey(t)) ?? t.trim()).filter(Boolean))];
    return {
      id: p.id, title: p.title, series: p.series?.trim() || null, cat: p.type || 'thought',
      createdAt: p.createdAt, updatedAt: p.updatedAt, minutes: readingMinutes(p.content),
      growth: p.growth, tags, excerpt: excerptOf(p), links: [...links],
    };
  });
};

// ══ 落座 ════════════════════════════════════════════════════════════════════
export const MIN_SEP = 30;
const STEP = 54, ISLAND = 270, GOLD = 2.39996, SQ = .82;

export interface Stone {
  p: SandPost;
  x: number;
  y: number;
  mag: number;
  rot: number;
  isl: Island;
  series: string | null;
}
export interface Island { cat: string; k: number; seed: { x: number; y: number }; stars: Stone[] }
export interface Path { name: string; cat: string; stars: Stone[]; head: number }
export interface Garden { stars: Stone[]; islands: Island[]; series: Path[]; byId: Map<string, Stone> }

const byBirth = (a: SandPost, b: SandPost) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export const layoutGarden = (posts: SandPost[]): Garden => {
  const order = [...posts].sort(byBirth);
  const CELL = 40, grid = new Map<number, Stone[]>(), key = (i: number, j: number) => i * 100003 + j;
  const add = (s: Stone) => {
    const k = key(Math.floor(s.x / CELL), Math.floor(s.y / CELL));
    const b = grid.get(k);
    if (b) b.push(s); else grid.set(k, [s]);
  };
  const near = (x: number, y: number, r: number) => {
    const out: Stone[] = [];
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++)
      for (let j = Math.floor((y - r) / CELL); j <= Math.floor((y + r) / CELL); j++) {
        const b = grid.get(key(i, j));
        if (b) for (const s of b) if (Math.hypot(s.x - x, s.y - y) < r) out.push(s);
      }
    return out;
  };
  const free = (x: number, y: number) => near(x, y, MIN_SEP).length === 0;

  const islands = new Map<string, Island>(), series = new Map<string, Path>(), stars: Stone[] = [];
  const choose = (anchor: { x: number; y: number }, dir: number, dist: number, isl: Island, ser: Path | null) => {
    if (dist === 0 && free(anchor.x, anchor.y)) return { x: anchor.x, y: anchor.y };
    const base = dist || STEP * .9;
    let best: { x: number; y: number } | null = null, bs = Infinity;
    for (let ring = 0; ring < 10; ring++) {
      const r = base * (1 + ring * .3);
      for (let m = 0; m < 18; m++) {
        const off = (m % 2 ? 1 : -1) * Math.ceil(m / 2) * (Math.PI / 9), a = dir + off;
        const x = anchor.x + Math.cos(a) * r, y = anchor.y + Math.sin(a) * r * SQ;
        if (!free(x, y)) continue;
        // 代价：离锚越远越贵、偏离小径方向越贵、离庭心越远越贵；挤进别的庭最贵
        let sc = ring * 9 + Math.abs(off) * 8 + Math.hypot(x - isl.seed.x, (y - isl.seed.y) / SQ) * (ser ? .1 : .14);
        for (const q of near(x, y, 120)) {
          const d = Math.hypot(q.x - x, q.y - y);
          if (q.isl !== isl) sc += (120 - d) * 2.4;
          else if (ser && q.series !== ser.name && d < 64) sc += (64 - d) * .8;
        }
        if (sc < bs) { bs = sc; best = { x, y }; }
      }
    }
    if (best) return best;
    // 十圈都满了（极端拥挤）：沿黄金角螺线往外找第一个空位。永不违反最小间距。
    for (let i = 1; ; i++) {
      const a = dir + i * GOLD, r = base + Math.sqrt(i) * MIN_SEP * .8;
      const x = anchor.x + Math.cos(a) * r, y = anchor.y + Math.sin(a) * r * SQ;
      if (free(x, y)) return { x, y };
    }
  };

  for (const p of order) {
    let isl = islands.get(p.cat);
    if (!isl) {
      // 新的一片庭：黄金角螺线，半径 ∝ √k。第一片在原点。
      const k = islands.size, a = k * GOLD + .74 + (seeded('isl:' + p.cat) - .5) * .5;
      const r = k ? ISLAND * Math.sqrt(k) * (.92 + seeded('ir:' + p.cat) * .2) : 0;
      isl = { cat: p.cat, k, seed: { x: Math.cos(a) * r, y: Math.sin(a) * r * .66 }, stars: [] };
      islands.set(p.cat, isl);
    }
    const u = seeded('u:' + p.id), v = seeded('v:' + p.id);
    let ser = p.series ? series.get(p.series) ?? null : null;
    let anchor: { x: number; y: number }, dir: number, dist: number;
    if (ser) {
      // 小径续长：顺着上一段的方向往前走一步，略有摆动
      const t = ser.stars[ser.stars.length - 1], pv = ser.stars[ser.stars.length - 2];
      const head = pv ? Math.atan2(t.y - pv.y, t.x - pv.x) : ser.head;
      dir = head + (u - .5) * 1.7 * (v > .8 ? 1.4 : 1); dist = STEP * (.72 + v * .75); anchor = t;
    } else if (p.series) {
      anchor = isl.seed; dist = isl.stars.length ? STEP * 1.6 : 0; dir = u * Math.PI * 2;
    } else {
      // 散石择邻：挨着同庭里最近一块有共同话题的石
      let kin: Stone | null = null;
      for (let i = isl.stars.length - 1; i >= 0 && !kin; i--)
        if (isl.stars[i].p.tags.some(t => p.tags.includes(t))) kin = isl.stars[i];
      anchor = kin ?? isl.seed; dist = kin ? STEP * .95 : (isl.stars.length ? STEP * 1.2 : 0); dir = u * Math.PI * 2;
    }
    const pos = choose(anchor, dir, dist, isl, ser);
    const s: Stone = { p, x: pos.x, y: pos.y, isl, series: p.series, mag: magOfMinutes(p.minutes), rot: 0 };
    add(s); stars.push(s); isl.stars.push(s);
    if (p.series) {
      if (!ser) {
        ser = { name: p.series, cat: p.cat, stars: [], head: Math.atan2(s.y - isl.seed.y, s.x - isl.seed.x) || u * 6.28 };
        series.set(p.series, ser);
      }
      ser.stars.push(s);
    }
  }
  // 石的朝向：小径上的石长轴顺着小径摆（飞石的规矩），散石随种子。只影响字形，不影响落座。
  const oriented = new Set<Stone>();
  series.forEach(ser => ser.stars.forEach((s, i) => {
    const a = ser.stars[Math.max(0, i - 1)], b = ser.stars[Math.min(ser.stars.length - 1, i + 1)];
    if (a !== b) { s.rot = Math.atan2(b.y - a.y, b.x - a.x); oriented.add(s); }
  }));
  stars.forEach(s => { if (!oriented.has(s)) s.rot = seeded('ro' + s.p.id) * 3.14; });
  return { stars, islands: [...islands.values()], series: [...series.values()], byId: new Map(stars.map(s => [s.p.id, s])) };
};

// ══ 关系：小径（合集）· 桥（双链）· 同话题（砂纹相邻） ═══════════════════════════
export interface Neighbors {
  path: Stone[];
  bridges: { s: Stone; dir: 'out' | 'in' }[];
  kin: { s: Stone; tags: string[] }[];
}
export const tagFrequency = (g: Garden) => {
  const tf = new Map<string, number>();
  g.stars.forEach(q => q.p.tags.forEach(t => tf.set(t, (tf.get(t) ?? 0) + 1)));
  return tf;
};
export const neighborsOf = (g: Garden, id: string, cutoff = Infinity, tf = tagFrequency(g)): Neighbors => {
  const s = g.byId.get(id);
  if (!s) return { path: [], bridges: [], kin: [] };
  const path = s.series ? (g.series.find(x => x.name === s.series)?.stars ?? []).filter(q => q.p.createdAt <= cutoff) : [];
  const bridges: Neighbors['bridges'] = [];
  for (const q of g.stars) {
    if (q.p.createdAt > cutoff || q === s) continue;
    if (s.p.links.includes(q.p.id)) bridges.push({ s: q, dir: 'out' });
    else if (q.p.links.includes(s.p.id)) bridges.push({ s: q, dir: 'in' });
  }
  // 太泛的话题（超过 14 篇共用）不算「相邻」：那等于什么都没说
  const kin = g.stars.filter(q => q !== s && q.p.createdAt <= cutoff && !path.includes(q))
    .map(q => ({ s: q, tags: q.p.tags.filter(t => s.p.tags.includes(t) && (tf.get(t) ?? 0) <= 14) }))
    .filter(x => x.tags.length)
    .sort((a, b) => b.tags.length - a.tags.length || b.s.mag - a.s.mag)
    .slice(0, 5);
  return { path, bridges, kin };
};

// ══ 砂纹：smooth-min 距离场 + marching squares ════════════════════════════════
// 三圈等值线（离石 9 / 17 / 25 屏幕 px），同庭的石自然合成一片，远的各自成圈。
export const LV = [9, 17, 25];
export interface Field { nx: number; ny: number; x0: number; y0: number; g: number; v: Float32Array }
/** 线段原语：枯流れ（干涸的溪）的河床。r 为负＝河心比石面「高」，最内一圈不沿河成形，只留两道岸。 */
export interface Seg { x1: number; y1: number; x2: number; y2: number; r: number }
export const sandField = (
  list: { x: number; y: number; r: number }[], kT: number, reachPx = LV[2] + 36, Kpx = 7, segs: Seg[] = [],
): Field | null => {
  if (!list.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of list) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); }
  const reach = reachPx / kT, pad = reach + 14 / kT;
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  let g = 3.2 / kT, nx = Math.ceil((x1 - x0) / g) + 1, ny = Math.ceil((y1 - y0) / g) + 1;
  const CAP = 240000;
  if (nx * ny > CAP) { g *= Math.sqrt(nx * ny / CAP); nx = Math.ceil((x1 - x0) / g) + 1; ny = Math.ceil((y1 - y0) / g) + 1; }
  const C = reach, B = new Map<number, [number, number, number][]>(), bk = (i: number, j: number) => i * 100003 + j;
  for (const s of list) {
    const k = bk(Math.floor(s.x / C), Math.floor(s.y / C));
    const b = B.get(k), item: [number, number, number] = [s.x, s.y, s.r / kT];
    if (b) b.push(item); else B.set(k, [item]);
  }
  // 线段各自带包围盒（外扩 reach），格点只和盒子罩得住它的线段算距离；线段数 ≈ 合集章数，量很小
  const SG = segs.map(q => {
    const dx = q.x2 - q.x1, dy = q.y2 - q.y1, L2 = dx * dx + dy * dy || 1;
    return {
      ...q, dx, dy, L2, rr: q.r / kT,
      bx0: Math.min(q.x1, q.x2) - reach, bx1: Math.max(q.x1, q.x2) + reach,
      by0: Math.min(q.y1, q.y2) - reach, by1: Math.max(q.y1, q.y2) + reach,
    };
  });
  const K = Kpx / kT, v = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const y = y0 + j * g, cj = Math.floor(y / C);
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * g, ci = Math.floor(x / C);
      let acc = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const bb = B.get(bk(ci + a, cj + b));
        if (!bb) continue;
        for (const q of bb) { const d = Math.hypot(q[0] - x, q[1] - y) - q[2]; if (d < reach) acc += Math.exp(-d / K); }
      }
      for (const q of SG) {
        if (x < q.bx0 || x > q.bx1 || y < q.by0 || y > q.by1) continue;
        const t = Math.max(0, Math.min(1, ((x - q.x1) * q.dx + (y - q.y1) * q.dy) / q.L2));
        const d = Math.hypot(q.x1 + t * q.dx - x, q.y1 + t * q.dy - y) - q.rr;
        if (d < reach) acc += Math.exp(-d / K);
      }
      v[j * nx + i] = acc > 0 ? Math.min(reach, -K * Math.log(acc)) : reach;
    }
  }
  return { nx, ny, x0, y0, g, v };
};

type Pt = [number, number];
const joinSegs = (segs: number[]): Pt[][] => {
  const n = segs.length / 4, used = new Uint8Array(n), map = new Map<string, number[]>();
  const K = (x: number, y: number) => Math.round(x * 64) + '_' + Math.round(y * 64);
  for (let s = 0; s < n; s++) for (let e = 0; e < 2; e++) {
    const k = K(segs[4 * s + 2 * e], segs[4 * s + 2 * e + 1]);
    const a = map.get(k);
    if (a) a.push(s); else map.set(k, [s]);
  }
  const step = (x: number, y: number): Pt | null => {
    const c = map.get(K(x, y));
    if (!c) return null;
    for (const t of c) if (!used[t]) {
      used[t] = 1;
      return K(segs[4 * t], segs[4 * t + 1]) === K(x, y) ? [segs[4 * t + 2], segs[4 * t + 3]] : [segs[4 * t], segs[4 * t + 1]];
    }
    return null;
  };
  const out: Pt[][] = [];
  for (let s = 0; s < n; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const fw: Pt[] = [[segs[4 * s], segs[4 * s + 1]], [segs[4 * s + 2], segs[4 * s + 3]]], bw: Pt[] = [];
    for (let p = step(...fw[fw.length - 1]); p; p = step(...fw[fw.length - 1])) fw.push(p);
    for (let p = step(...fw[0]); p; p = step(...bw[bw.length - 1])) bw.push(p);
    out.push(bw.reverse().concat(fw));
  }
  return out;
};

export const iso = (F: Field, level: number): Pt[][] => {
  const { nx, ny, x0, y0, g, v } = F, segs: number[] = [];
  const hx = (i: number, j: number): Pt => { const a = v[j * nx + i], b = v[j * nx + i + 1]; return [x0 + (i + (level - a) / (b - a)) * g, y0 + j * g]; };
  const vy = (i: number, j: number): Pt => { const a = v[j * nx + i], b = v[(j + 1) * nx + i]; return [x0 + i * g, y0 + (j + (level - a) / (b - a)) * g]; };
  const s = (p: Pt, q: Pt) => segs.push(p[0], p[1], q[0], q[1]);
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = v[j * nx + i], b = v[j * nx + i + 1], c = v[(j + 1) * nx + i + 1], d = v[(j + 1) * nx + i];
    const id = (a < level ? 8 : 0) | (b < level ? 4 : 0) | (c < level ? 2 : 0) | (d < level ? 1 : 0);
    if (id === 0 || id === 15) continue;
    const T = () => hx(i, j), Bo = () => hx(i, j + 1), L = () => vy(i, j), R = () => vy(i + 1, j);
    const mid = (a + b + c + d) / 4 < level;
    switch (id) {
      case 1: case 14: s(L(), Bo()); break;
      case 2: case 13: s(Bo(), R()); break;
      case 3: case 12: s(L(), R()); break;
      case 4: case 11: s(T(), R()); break;
      case 6: case 9: s(T(), Bo()); break;
      case 7: case 8: s(T(), L()); break;
      case 5: if (mid) { s(T(), L()); s(Bo(), R()); } else { s(T(), R()); s(L(), Bo()); } break;
      case 10: if (mid) { s(T(), R()); s(L(), Bo()); } else { s(T(), L()); s(Bo(), R()); } break;
    }
  }
  return joinSegs(segs);
};

/** 折线 → 二次贝塞尔平滑路径；首尾相接时闭合。 */
export const smooth = (pts: Pt[], dp = 1): string => {
  const n = pts.length;
  if (n < 3) return '';
  const f = (x: number) => x.toFixed(dp), mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const closed = Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]) < 1e-6;
  const P = closed ? pts.slice(0, -1) : pts, m = P.length;
  if (closed) {
    const s0 = mid(P[m - 1], P[0]);
    let d = `M${f(s0[0])} ${f(s0[1])}`;
    for (let i = 0; i < m; i++) { const q = mid(P[i], P[(i + 1) % m]); d += `Q${f(P[i][0])} ${f(P[i][1])} ${f(q[0])} ${f(q[1])}`; }
    return d + 'Z';
  }
  let d = `M${f(P[0][0])} ${f(P[0][1])}`;
  for (let i = 1; i < m - 1; i++) { const q = mid(P[i], P[i + 1]); d += `Q${f(P[i][0])} ${f(P[i][1])} ${f(q[0])} ${f(q[1])}`; }
  return d + `L${f(P[m - 1][0])} ${f(P[m - 1][1])}`;
};

// ══ 字形几何：图、图例用同一支笔，所以图例不会说谎 ═════════════════════════════
/** 不规则庭石的轮廓：椭圆叠两阶正弦扰动，按 id 种子稳定复现。 */
export const stonePath = (id: string, R: number, A: Arch, rot: number) => {
  const a1 = seeded('a1' + id) * 6.28, a2 = seeded('a2' + id) * 6.28;
  const e1 = A.e1 * (.8 + seeded('e1' + id) * .5), e2 = A.e2 * (.8 + seeded('e2' + id) * .5);
  const pts: Pt[] = [];
  for (let i = 0; i < 14; i++) {
    const t = i / 14 * 6.2832, r = R * (1 + e1 * Math.sin(2 * t + a1) + e2 * Math.sin(3 * t + a2));
    const x = Math.cos(t) * r, y = Math.sin(t) * r * A.sq;
    pts.push([x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  pts.push(pts[0]);
  return smooth(pts, 2);
};
/** 苔：左上一块不规则的绿。苔是「常青」的唯一记号，与分类色无关。 */
export const mossPath = (id: string, R: number, A: Arch) => {
  const cx = -R * .16, cy = -R * .26 * A.sq, pts: Pt[] = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 9 * 6.2832, r = R * .44 * (1 + .22 * Math.sin(3 * t + seeded('m' + id) * 6));
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r * .62]);
  }
  pts.push(pts[0]);
  return {
    d: smooth(pts, 2),
    dots: Array.from({ length: 4 }, (_, i) => ({
      cx: cx + (seeded('mx' + i + id) - .5) * R * .6,
      cy: cy + (seeded('my' + i + id) - .5) * R * .3,
      r: .45 + seeded('mr' + i + id) * .35,
    })),
  };
};

// ══ 时间 ════════════════════════════════════════════════════════════════════
const TERMS_BY_DATE = [...SOLAR_TERMS].sort((a, b) => a.month - b.month || a.day - b.day);
export const PRINCIPAL_TERMS = new Set(['立春', '春分', '立夏', '夏至', '立秋', '秋分', '立冬', '冬至']);
/** 某个时刻所处的节气（公历近似，±1 天）。 */
export const termOf = (ts: number) => {
  const d = new Date(ts), y = d.getFullYear();
  let best = '冬至';
  for (const t of TERMS_BY_DATE) if (new Date(y, t.month - 1, t.day) <= d) best = t.name;
  return best;
};
/** [年份内的所有节气时刻]，给时光拨盘画刻度。 */
export const termsBetween = (a: number, b: number) => {
  const out: { name: string; t: number }[] = [];
  for (let y = new Date(a).getFullYear(); y <= new Date(b).getFullYear(); y++)
    for (const t of TERMS_BY_DATE) {
      const ts = new Date(y, t.month - 1, t.day).getTime();
      if (ts >= a && ts <= b) out.push({ name: t.name, t: ts });
    }
  return out;
};

const CN = '零一二三四五六七八九十'.split('');
export const cnNum = (n: number): string =>
  n <= 10 ? CN[n]
    : n < 20 ? `十${n % 10 ? CN[n % 10] : ''}`
      : n < 100 ? `${CN[Math.floor(n / 10)]}十${n % 10 ? CN[n % 10] : ''}`
        : String(n);
