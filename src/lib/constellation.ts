// src/lib/constellation.ts
// ✦ 知识星座的图谱构建与力导布局：从 OasisOrchard.tsx 抽出的纯算法层，理由三条——
//   1) 能单独写回归测试（布局稳定性、大规模耗时上界），组件里测不了这些；
//   2) 组件文件本身瘦身；
//   3) 未来任何要往星图里喂数据的管线（如「导入文件生成候选节点」）都该喂给这一层，
//      而不是再往 UI 组件里塞算法。
import type { BlogPost } from '../hooks/useGarden';
import { extractWikiLinks, buildTitleIndex } from './wikilinks';
import { tagKey, buildTagCanonicalMap } from './tags';

export const VW = 1000;
export const VH = 760;
export const CENTER = { x: 500, y: 372 };
const TAU = Math.PI * 2;

// 确定性哈希：同一 key 每次都算出同一个 [0,1) 值，用来生成初始坐标——
//   绝不能用数组下标（节点在数组里的位置会因排序/增删而变），否则新增一篇文章会让
//   全体节点的初始角集体旋转，纵使力导最终收敛，也会落进完全不同的收敛盆地，
//   在屏幕上表现为「加一篇文章，整片天空重新洗牌」。
export const seeded = (str: string) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  const x = Math.sin(h) * 10000;
  return x - Math.floor(x);
};

export type NodeKind = 'core' | 'tag' | 'post';
export interface GNode {
  key: string;
  kind: NodeKind;
  x: number; y: number;
  r: number;
  post?: BlogPost;
  tag?: string;
  count?: number;
  color?: string;
}
export interface GLink { a: GNode; b: GNode; color: string; core: boolean; wikilink?: boolean; }

export interface GraphResult {
  nodes: GNode[];
  links: GLink[];
  tagNodes: Map<string, GNode>;
  postNodes: Map<string, GNode>;
  tagMap: Map<string, BlogPost[]>;
  core: GNode;
}

// 已确定节点的坐标缓存：key → 最新收敛坐标。由调用方持有（React 里通常是 useRef），
// 跨次 buildGraph 调用传入同一个 Map，实现「新增文章不打乱已有星星」的增量松弛。
// buildGraph 会原地更新这个 Map（写回最终坐标、剔除已消失节点的旧条目）。
export type PositionCache = Map<string, { x: number; y: number }>;

// 双链引用的两篇文章各自的情绪色取中，作为连线颜色——「这条连线属于两颗星」
export const blendColor = (a: string, b: string): string => {
  const pa = parseInt(a.replace('#', ''), 16), pb = parseInt(b.replace('#', ''), 16);
  const mix = (shift: number) => Math.round((((pa >> shift) & 255) + ((pb >> shift) & 255)) / 2);
  return `#${[mix(16), mix(8), mix(0)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

const fullIterations = (nodeCount: number) => (nodeCount > 160 ? 140 : nodeCount > 70 ? 220 : 320);

// —— 力导松弛：斥力分散 + 弹簧拉近相连节点 + 轻微向心 ——
//    斥力用空间哈希网格只比较邻近节点，复杂度从 O(n²) 降到近似 O(n)。
//    movable(node) 判定这颗星本轮迭代是否可以移动——增量松弛的「钉住老星」就是靠它实现，
//    与 core 节点「参与几何计算但坐标永不更新」是同一种机制的推广。
const relax = (nodes: GNode[], links: GLink[], iterations: number, movable: (n: GNode) => boolean) => {
  const CELL = 70;
  for (let it = 0; it < iterations; it++) {
    const grid = new Map<string, GNode[]>();
    for (const n of nodes) {
      const key = `${Math.floor(n.x / CELL)},${Math.floor(n.y / CELL)}`;
      (grid.get(key) ?? grid.set(key, []).get(key)!).push(n);
    }
    for (const A of nodes) {
      const col = Math.floor(A.x / CELL), row = Math.floor(A.y / CELL);
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
        const bucket = grid.get(`${col + dc},${row + dr}`);
        if (!bucket) continue;
        for (const B of bucket) {
          if (A === B) continue;
          let dx = B.x - A.x, dy = B.y - A.y;
          const d = Math.hypot(dx, dy) || 0.01;
          const min = A.r + B.r + (A.kind === 'post' && B.kind === 'post' ? 30 : 40);
          if (d < min) {
            const push = ((min - d) / d) * 0.25;
            dx *= push; dy *= push;
            if (movable(A)) { A.x -= dx; A.y -= dy; }
            if (movable(B)) { B.x += dx; B.y += dy; }
          }
        }
      }
    }
    for (const l of links) {
      const L = l.core ? 170 : l.wikilink ? 66 : 84;
      let dx = l.b.x - l.a.x, dy = l.b.y - l.a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const k = ((d - L) / d) * 0.06;
      dx *= k; dy *= k;
      if (movable(l.a)) { l.a.x += dx; l.a.y += dy; }
      if (movable(l.b)) { l.b.x -= dx; l.b.y -= dy; }
    }
    for (const n of nodes) {
      if (!movable(n)) continue;
      n.x += (CENTER.x - n.x) * 0.004;
      n.y += (CENTER.y - n.y) * 0.004;
    }
  }
};

// 🌌 构建知识图谱并用轻量力导布局松弛开，得到舒朗、不重叠的星座坐标
//   typeColorOf：星核/连线颜色统一取「文章类型色」，与情绪色 post.color 脱钩——
//   颜色作为唯一编码通道只表达一件事（类型），不然一颗绿星拖着粉线、右上角图例却对不上。
//   posCache：传入即启用增量松弛——已有节点从缓存坐标起步且优先「钉住」，只有新节点
//   自由寻找落点，找到大致空位后再全体做一轮温和微调；不传或传空 Map 则是首次全量布局。
export const buildGraph = (
  posts: BlogPost[],
  typeColorOf: (post: BlogPost) => string,
  posCache?: PositionCache
): GraphResult => {
  // 标签 → 文章：按归一化 key 分组（大小写/全半角/首尾空白差异不再各自长出一团星云），
  //   展示名取该组里出现次数最多的原始写法（见 lib/tags.ts）。
  const canonicalOf = buildTagCanonicalMap(posts.flatMap(p => p.tags));
  const tagMap = new Map<string, BlogPost[]>();
  posts.forEach(p => p.tags.forEach(raw => {
    const k = tagKey(raw);
    const arr = tagMap.get(k) ?? tagMap.set(k, []).get(k)!;
    if (!arr.some(x => x.id === p.id)) arr.push(p);
  }));
  const tagKeys = [...tagMap.keys()];

  const nodes: GNode[] = [];
  const core: GNode = { key: '__core', kind: 'core', x: CENTER.x, y: CENTER.y, r: 26 };
  nodes.push(core);

  // 起始坐标：缓存命中 → 沿用上次收敛结果；未命中（新节点）→ 用确定性哈希撒开的初值，
  //   与「谁排第几个」完全无关，见 seeded() 顶部注释。
  const startPos = (key: string, radiusBase: number, radiusSpread: number): { x: number; y: number } => {
    const cached = posCache?.get(key);
    if (cached) return { x: cached.x, y: cached.y };
    const ang = seeded(key + ':a') * TAU;
    const rad = radiusBase + seeded(key + ':r') * radiusSpread;
    return { x: CENTER.x + Math.cos(ang) * rad, y: CENTER.y + Math.sin(ang) * rad };
  };

  const newKeys = new Set<string>(); // 本次出现、缓存里没有的节点——增量松弛只让它们自由移动

  const tagNodes = new Map<string, GNode>();
  tagKeys.forEach(k => {
    const key = 'tag:' + k;
    const pos = startPos(key, 150, 90);
    if (!posCache?.has(key)) newKeys.add(key);
    const n: GNode = {
      key, kind: 'tag', tag: canonicalOf.get(k) ?? k, count: tagMap.get(k)!.length,
      x: pos.x, y: pos.y,
      r: 5 + Math.sqrt(tagMap.get(k)!.length) * 3.4,
    };
    tagNodes.set(k, n); nodes.push(n);
  });

  const postNodes = new Map<string, GNode>();
  posts.forEach(p => {
    const key = 'post:' + p.id;
    const pos = startPos(key, 230, 90);
    if (!posCache?.has(key)) newKeys.add(key);
    const n: GNode = {
      key, kind: 'post', post: p, color: typeColorOf(p),
      x: pos.x, y: pos.y,
      r: 6.5 + Math.min(4.5, p.content.length / 1100),
    };
    postNodes.set(p.id, n); nodes.push(n);
  });

  // 连边：核心 → 标签；标签 → 文章（无标签文章直接连核心，避免孤岛）
  //   连线染「文章类型色」而非情绪色 post.color——与星核、图例保持同一套颜色语义。
  const links: GLink[] = [];
  tagKeys.forEach(k => links.push({ a: core, b: tagNodes.get(k)!, color: '#94a3b8', core: true }));
  posts.forEach(p => {
    const pn = postNodes.get(p.id)!;
    const color = typeColorOf(p);
    const ptKeys = [...new Set(p.tags.map(tagKey))].filter(k => tagNodes.has(k));
    if (ptKeys.length === 0) links.push({ a: core, b: pn, color, core: true });
    else ptKeys.forEach(k => links.push({ a: tagNodes.get(k)!, b: pn, color, core: false }));
  });

  // 🔗 双链 [[标题]]：正文里写下的直接引用，额外画一条引力线，把两颗星彼此拉近——
  //   标签连线呈现「同一主题」，双链连线呈现「作者亲手写下的思想联结」，是两种不同的邻近关系。
  const titleIndex = buildTitleIndex(posts);
  const wikiSeen = new Set<string>();
  posts.forEach(p => {
    const pn = postNodes.get(p.id)!;
    extractWikiLinks(p.content).forEach(title => {
      const target = titleIndex.get(title.trim().toLowerCase());
      if (!target || target.id === p.id) return;
      const pairKey = [p.id, target.id].sort().join('|');
      if (wikiSeen.has(pairKey)) return;
      wikiSeen.add(pairKey);
      const tn = postNodes.get(target.id);
      if (tn) links.push({ a: pn, b: tn, color: blendColor(typeColorOf(p), typeColorOf(target)), core: false, wikilink: true });
    });
  });

  const isFullBuild = !posCache || posCache.size === 0;
  if (isFullBuild) {
    // 首次布局（或缓存被显式清空 = 用户点了「重排星图」）：全体自由，跑满迭代收敛。
    relax(nodes, links, fullIterations(nodes.length), (n) => n.kind !== 'core');
  } else if (newKeys.size === 0) {
    // 没有新节点（可能只是文章内容/标签编辑改了连边），全体自由但只需轻量收敛几步。
    relax(nodes, links, 30, (n) => n.kind !== 'core');
  } else {
    // 增量：先钉住所有旧节点，只让新节点在空隙里找到落点；
    //   再放开全体做一轮温和微调，让旧节点为新邻居让出一点点空间——但不至于被推得面目全非。
    const movableInPhaseA = (n: GNode) => n.kind !== 'core' && newKeys.has(n.key);
    relax(nodes, links, 80, movableInPhaseA);
    relax(nodes, links, 30, (n) => n.kind !== 'core');
  }

  const pad = 64;
  nodes.forEach(n => {
    n.x = Math.max(pad, Math.min(VW - pad, n.x));
    n.y = Math.max(pad, Math.min(VH - pad, n.y));
  });

  // 写回缓存：保存本次收敛坐标，供下次增量调用；同时清掉已经不存在的旧节点（文章被拔除/改名标签）。
  if (posCache) {
    posCache.clear();
    nodes.forEach(n => { if (n.kind !== 'core') posCache.set(n.key, { x: n.x, y: n.y }); });
  }

  return { nodes, links, tagNodes, postNodes, tagMap, core };
};
