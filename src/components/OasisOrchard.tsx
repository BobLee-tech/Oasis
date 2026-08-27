// ✦ 知识星图 —— 花园的夜间俯瞰。
//
// 它回答的问题和博客列表不一样：列表回答「最近写了什么」（时间轴），
// 星图回答「这里长着什么、彼此如何连接、从哪进去」（地形图）。两个视图各占一轴，
// 才都有存在的理由。所以这里有三层动线，一步一景，不许越级：
//   L0 概览  这是什么地方   —— 一张年轮盘：节气环、写作密度、长在分类带上的星
//   L1 探索  这颗是什么     —— 悬停浮名、点开星卡（标题 + 一口摘要 + 去处）
//   L2 细读  读全文         —— 跳博客阅读舱 #/garden/<id>
// 上一版把 L2 塞进 380px 的侧栏，正文列宽不到 20 个汉字却要装一篇 21 分钟的文章；
// 读文章这件事整体退还给为它设计的界面，星图只做入口。
//
// 改这个文件之前请先读五条规矩：
//   1) 刻度。字号只有 44/16/13/11/10，墨度只有 5 档，线宽只有 3 档，圆角只有 2px 和 0。
//      令牌全部在 index.css 的 .oasis-sky 里。新增数字之前先问能不能复用已有档位。
//   2) 昼夜是同一张天，只换光。几何、构图、标注两态完全共用；日间星是墨青色的点，
//      夜间才发光。不要为某一态单独加形状。
//   3) 相机的平移缩放永远不进 React。viewRef + 直接写 style.transform + CSS 变量
//      --sky-scale，标注的反向缩放交给 calc() 让浏览器算。星卡的跟随也走同一条路
//      （positionCard 挂在 write() 末尾），所以拖动时卡片贴着星走，一次 setState 都没有。
//   4) 命中区由数据层保证互不相交（constellation.ts 的 hitR），这里只做「最近邻拾取」：
//      点哪颗就开哪颗，不靠 z 序碰运气。
//   5) 年轮盘是默认也是唯一的底图，没有「星图态」分支。关系线是默认关闭的查询图层，
//      不是底图的一部分。按文章数切换表示的早期草案已经取消：双态要维护两套构图、取景和
//      标注规则，而密度弧让同一张年轮盘在文章少和文章多时都成立。
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useGarden, filterVisible, type BlogPost } from '../hooks/useGarden';
import { useCategories } from '../hooks/useCategories';
import { readingMinutes } from '../lib/reading';
import { currentSolarTerm, SOLAR_TERMS } from '../lib/solarTerms';
import { formatHash } from '../lib/route';
import {
  angleForDate, annularSector, arcPath, bandsFor, buildGraph, CENTER, densityByTerm,
  relaxColumn, SKY_INNER, SKY_OUTER, SKY_RADIUS, VW, VH,
  type GLink, type GNode, type SkySignal,
} from '../lib/constellation';

interface OasisOrchardProps {
  isAdmin: boolean;
  itemId?: string;
  onNavigate?: (itemId?: string) => void;
  onCreatePost?: (title: string) => void;
}

type View = { scale: number; x: number; y: number };
type Point = { x: number; y: number };
type Cam = { lod: 0 | 1 | 2; scale: number };

const DAY = 86_400_000;
const MIN_SCALE = 0.5;
const MAX_SCALE = 6;
const CARD_W = 320;       // 星卡宽度；相机要为它在右侧留出空间
const PAD = 32;
const GUTTER_X = 56;      // 桌面站主块占据的左侧版心
const LABEL_GUTTER = 150;
const MIN_LABEL_GAP = 22;
const HINT_KEY = 'oasis_sky_hint_seen';
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// viewBox 单位 → 屏幕 px 的基准倍率（preserveAspectRatio="xMidYMid meet"）
const baseK = (rect: DOMRect) => Math.min(rect.width / VW, rect.height / VH);

// ✦ 星色 = 光谱型 × 星等。
// 带的序位（0 = 最内圈 → 1 = 最外圈）取五档光谱之一（暖 → 冷），星等决定往底色里兑多少。
// 令牌全在 index.css 的 .oasis-sky 里，组件不必知道现在是白天还是晚上。
const SPECTRAL_STOPS = 5;
const starFill = (band = 0.5, magnitude = 3) =>
  `color-mix(in oklab, var(--sky-sp${1 + Math.round(clamp(band, 0, 1) * (SPECTRAL_STOPS - 1))}) `
  + `var(--sky-m${clamp(Math.round(magnitude), 1, 5)}), var(--sky-star-base))`;

// 星等 → 屏幕上恒定的半径。数值本体在 .oasis-sky-canvas 的 --sky-r1..5 里（已做缩放补偿），
// 下面这份 px 值只给标注避让用：那套碰撞是在 viewBox 里算的，得自己除一次倍率。
const R_PX = [1.1, 1.6, 2.2, 3.0, 4.2];
const magOf = (node: GNode) => clamp(Math.round(node.magnitude ?? 3), 1, 5);
const rToken = (node: GNode) => `var(--sky-r${magOf(node)})`;
const rPx = (node: GNode) => R_PX[magOf(node) - 1];

// 星晕：半径 3.2×（不是 4.5×），浓度按星等分档，最暗两档完全不发光。
// 全场一起发光就没有远近——上一版每颗星都罩着一层同样浓的雾，那是「一片肉球」的另一半成因。
const BLOOM_O = [0, 0, 0.18, 0.34, 0.5];

// —— 媒体查询：窄屏是另一张图，不是缩小版 ——
const subscribeNarrow = (notify: () => void) => {
  const q = window.matchMedia('(max-width: 767px)');
  q.addEventListener('change', notify);
  return () => q.removeEventListener('change', notify);
};
const isNarrow = () => window.matchMedia('(max-width: 767px)').matches;
const narrowServerSnapshot = () => false;

const CN = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const cnNum = (n: number): string =>
  n <= 10 ? CN[n]
    : n < 20 ? `十${n % 10 ? CN[n % 10] : ''}`
      : `${CN[Math.floor(n / 10)]}十${n % 10 ? CN[n % 10] : ''}`;

// L0 只写这八个节气 = 一枚罗盘。800px 宽的画面上排 24 个标签是超预算的——
// 上一版「大暑」正压在版脚按钮上。凑近了（L1 起）才补全二十四个，这也是纸质星图的老规矩。
const PRINCIPAL_TERMS = new Set(['立春', '春分', '立夏', '夏至', '立秋', '秋分', '立冬', '冬至']);

const growthLabel: Record<BlogPost['growth'], string> = {
  seedling: '种子', growing: '生长中', evergreen: '常青',
};

const tendedLabel = (updatedAt: number, now: number) => {
  const days = Math.max(0, Math.floor((now - updatedAt) / DAY));
  if (days === 0) return '今日照料';
  if (days < 30) return `${days} 天前照料`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前照料`;
  return `${Math.floor(days / 365)} 年前照料`;
};

// 航线的墨：粗细与浓度都只取令牌里的档位。dash 只留给「还没种下」。
const LINK_INK: Record<GLink['kind'], { w: string; o: string; dash?: string }> = {
  series: { w: 'var(--sky-w3)', o: 'var(--sky-link)' },
  wikilink: { w: 'var(--sky-w2)', o: 'var(--sky-link)' },
  'shared-tag': { w: 'var(--sky-w1)', o: 'var(--sky-o2)' },
  nebula: { w: 'var(--sky-w1)', o: 'var(--sky-o2)' },
  pending: { w: 'var(--sky-w1)', o: 'var(--sky-o2)', dash: '3 5' },
};

const Glyph = {
  search: <path d="M11 11 7.6 7.6M9 5a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />,
  close: <path d="M3 3l8 8M11 3l-8 8" />,
  wander: <path d="M2 12 12 2M12 2H7.5M12 2v4.5M2.5 4.5h2M4 3v3" />,
  fit: <path d="M1 4.5V1h3.5M13 4.5V1H9.5M1 9.5V13h3.5M13 9.5V13H9.5" />,
};
const Icon: React.FC<{ d: keyof typeof Glyph; className?: string }> = ({ d, className }) => (
  <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor"
    strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>{Glyph[d]}</svg>
);

// ══ 标注排布 ══════════════════════════════════════════════════════════
// 上一版只做纵向 15 单位的避让，横向照样穿星、穿彼此——截图里三行标题叠在一起，
// 「拥挤」的观感有一大半来自这里，而不是星本身。
//
// 这里换成制图学里的标准做法：候选位序 + 贪心放置。按亮度从亮到暗依次尝试
// 右 / 左 / 上 / 下 八个位置，第一个既不压别的标注、也不压任何星的位置就落地；
// 八个都不行就不写这颗星的名字——纸上星图本来就不为每颗星写字。
//
// ⚠️ 「写得下才写」这件事只能由上面这套碰撞说了算。曾经在它上游还压了一道配额
//    （share = [0.45, .75, 1][lod]，只让 45% 的星有资格排队），于是 8 颗星的天
//    空着一半、却只写 4 个名字——「名字有时不显示」是这个常数干的，不是碰撞。
//
// 短名也不靠截断。被截断的中文句子不是短名，是坏名：`贪恋有你的未…` 比不写更糟。
// 星图能用四个字母标星是因为 Vega 本来就叫 Vega，博客标题没有短形式——除非造一个：
// 中文标题多是排比句，取第一节（到「，。：；」为止）就是天然的短名，
// 「见招拆招，逢水架桥」→「见招拆招」，「天行健，君子以自强不息」→「天行健」。
const LABEL_MAX = [8, 12, Infinity];
const CLAUSE_END = /[，,。．：:；;、—·｜|]/;
const CLAUSE_MAX = 9;
const textWidth = (s: string) =>
  [...s].reduce((w, ch) => w + (ch.codePointAt(0)! > 0x2E80 ? 1 : 0.55), 0);

const starName = (title: string, lod: number, compact = false) => {
  const full = title.trim();
  const max = compact ? 3 : LABEL_MAX[lod] ?? Infinity;
  if (textWidth(full) <= max) return full;

  const head = full.split(CLAUSE_END)[0].trim();
  if (head && textWidth(head) <= (compact ? max : CLAUSE_MAX)) return head;

  const out: string[] = [];
  let w = 0;
  for (const ch of full) {
    w += ch.codePointAt(0)! > 0x2E80 ? 1 : 0.55;
    if (w > max) break;
    out.push(ch);
  }
  // 绝不停在标点上；剩不到三个字就干脆不写，交回给碰撞去省这块地方。
  while (out.length && CLAUSE_END.test(out[out.length - 1])) out.pop();
  return textWidth(out.join('')) >= 3 ? `${out.join('')}…` : '';
};

// lead：这次落位取自后四个候选，名字离星已经远到读者未必连得上，补一根引线。
// 引线是海图的语法，一个 <line> 换回一批本来放不下的名字。
interface Placed {
  x: number;
  y: number;
  anchor: 'start' | 'end';
  elbowX: number;
  elbowY: number;
  text: string;
}
interface Box { x1: number; y1: number; x2: number; y2: number }

const overlaps = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

// 屏幕 px → viewBox 单位。它是 write() 正变换的严格逆运算；改相机公式时两处必须同步。
const screenToView = (box: DOMRect, rect: DOMRect, view: View): Box => {
  const k = baseK(rect) * view.scale;
  const point = (x: number, y: number) => ({
    x: (x - rect.left - rect.width / 2 - view.x) / k + VW / 2,
    y: (y - rect.top - rect.height / 2 - view.y) / k + VH / 2,
  });
  const a = point(box.left, box.top), b = point(box.right, box.bottom);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
};

// 题记、工具条、顶部 chrome 与 Dock 都用同一属性自报障碍；Miku 也读取同一集合。
const obstacleBoxes = (rect: DOMRect, view: View) =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-oasis-avoid]'))
    .map(element => element.getBoundingClientRect())
    .filter(box => box.width > 0 && box.height > 0)
    .map(box => screenToView(box, rect, view));

interface LabelCandidate { node: GNode; y: number; text: string }

// 年轮盘的名字全部出圈。中文保持水平，左右各做一次一维松弛；容量不足时由星等和新近度
// 决定谁拥有常驻名字，未入选者仍可在 hover / focus 时从星旁浮出。
const placeAnnulusLabels = (
  nodes: GNode[], lod: number, scale: number, obstacles: Box[], promoted: Set<string>, compact: boolean,
) => {
  // 字号在屏幕上恒定；窄屏全图倍率较小，22 viewBox 单位不足一行，需按当前倍率抬高下限。
  const rowGap = Math.max(MIN_LABEL_GAP, 18 / Math.max(scale, .01));
  const perSideCapacity = Math.floor((VH - 2 * PAD) / rowGap);
  const priority = (a: GNode, b: GNode) =>
    Number(promoted.has(b.post!.id)) - Number(promoted.has(a.post!.id))
    || (b.magnitude ?? 3) - (a.magnitude ?? 3)
    || b.post!.createdAt - a.post!.createdAt;
  const out = new Map<string, Placed>();

  (['left', 'right'] as const).forEach(side => {
    const onSide = nodes.filter(node => (node.x < CENTER.x ? 'left' : 'right') === side);
    const chosen = [...onSide].sort(priority).slice(0, perSideCapacity);
    const labelX = CENTER.x + (side === 'right' ? 1 : -1) * (SKY_RADIUS + 44);
    const anchor: Placed['anchor'] = side === 'right' ? 'start' : 'end';
    const em = 13 / Math.max(scale, 0.01);

    // 障碍所在的行先从可用槽位里剔除，再把按角度排序的名字映射进去。
    const slots: number[] = [];
    for (let y = PAD; y <= VH - PAD; y += rowGap) {
      const probe: Box = side === 'right'
        ? { x1: labelX - 4, y1: y - em * .65, x2: CENTER.x + SKY_RADIUS + LABEL_GUTTER, y2: y + em * .65 }
        : { x1: CENTER.x - SKY_RADIUS - LABEL_GUTTER, y1: y - em * .65, x2: labelX + 4, y2: y + em * .65 };
      if (!obstacles.some(obstacle => overlaps(probe, obstacle))) slots.push(y);
    }

    const candidates: LabelCandidate[] = chosen
      .slice(0, slots.length)
      .map(node => ({
        node,
        text: starName(node.post!.title, lod, compact),
        y: CENTER.y + Math.sin(Math.atan2(node.y - CENTER.y, node.x - CENTER.x)) * (SKY_RADIUS + 44),
      }))
      .filter(candidate => candidate.text)
      .sort((a, b) => a.y - b.y);
    const relaxed = relaxColumn(candidates, rowGap, PAD, VH - PAD);

    let slotFrom = 0;
    relaxed.forEach((candidate, index) => {
      const maxSlot = slots.length - (relaxed.length - index);
      let best = slotFrom;
      for (let i = slotFrom; i <= maxSlot; i++) {
        if (Math.abs(slots[i] - candidate.y) < Math.abs(slots[best] - candidate.y)) best = i;
      }
      const angle = Math.atan2(candidate.node.y - CENTER.y, candidate.node.x - CENTER.x);
      const elbowR = SKY_RADIUS + 28;
      out.set(candidate.node.post!.id, {
        x: labelX,
        y: slots[best],
        anchor,
        elbowX: CENTER.x + Math.cos(angle) * elbowR,
        elbowY: CENTER.y + Math.sin(angle) * elbowR,
        text: candidate.text,
      });
      slotFrom = best + 1;
    });
  });
  return out;
};

// ══ 星卡 ══════════════════════════════════════════════════════════════
const excerptOf = (post: BlogPost) => {
  if (post.excerpt?.trim()) return post.excerpt.trim();
  return post.content
    .replace(/```[\s\S]*?```/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/[#>*_`~-]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, 84);
};

export const OasisOrchard: React.FC<OasisOrchardProps> = ({ isAdmin, itemId, onNavigate, onCreatePost }) => {
  const reduceMotion = !!useReducedMotion();
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, narrowServerSnapshot);
  const { posts: rawPosts, uprootSeed } = useGarden();
  const posts = useMemo(() => filterVisible(rawPosts, isAdmin), [rawPosts, isAdmin]);
  const { metaOf } = useCategories();
  const typeColor = useCallback((p: BlogPost) => metaOf(p.type || 'thought').color, [metaOf]);
  const graph = useMemo(() => buildGraph(posts, typeColor), [posts, typeColor]);

  // —— 会触发渲染的状态。hover 完全交给 CSS，相机完全交给 ref ——
  const [localId, setLocalId] = useState<string | null>(itemId ?? null);
  const [cam, setCam] = useState<Cam>({ lod: 0, scale: 1 });
  const [spotlight, setSpotlight] = useState<SkySignal | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [termHover, setTermHover] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [seriesFocus, setSeriesFocus] = useState<string | null>(null);
  const [labelObstacles, setLabelObstacles] = useState<Box[]>([]);
  // 关系线是查询图层，不是底图。默认关闭；同一次浏览会话里记住读者的选择。
  const [showLinks, setShowLinks] = useState(() => {
    try { return sessionStorage.getItem('oasis_sky_links') === '1'; } catch { return false; }
  });
  const [meteor, setMeteor] = useState<{ key: number; x: number; y: number; dx: number; dy: number } | null>(null);
  const [hintOn, setHintOn] = useState(() => {
    try { return !localStorage.getItem(HINT_KEY); } catch { return false; }
  });

  const selectedId = onNavigate ? itemId ?? null : localId;
  const selected = selectedId ? graph.postNodes.get(selectedId)?.post ?? null : null;

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cardTitleRef = useRef<HTMLHeadingElement>(null);
  const starRefs = useRef(new Map<string, SVGGElement>());
  const viewRef = useRef<View>({ scale: 1, x: 0, y: 0 });
  const rectRef = useRef<DOMRect | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const dragFrom = useRef<{ p: Point; v: View } | null>(null);
  const pinchFrom = useRef<{ d: number; mid: Point; v: View } | null>(null);
  const moved = useRef(false);     // 本次手势是否算「拖动」——拖过就不当点击
  const touched = useRef(false);   // 用户是否手动动过相机——动过就不再自动 fit
  const fitted = useRef(false);    // 是否成功摆正过一次（尺寸有效 + 画布已挂载）
  const fitScale = useRef(1);      // 「全图」时的倍率，LOD 以它为基准
  const selNode = useRef<GNode | null>(null);   // 星卡跟随的目标，不进 React

  const [now] = useState(() => Date.now());

  const refreshLabelObstacles = useCallback(() => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    rectRef.current = rect;
    setLabelObstacles(obstacleBoxes(rect, viewRef.current));
  }, []);

  const dismissHint = useCallback(() => {
    setHintOn(prev => {
      if (prev) { try { localStorage.setItem(HINT_KEY, '1'); } catch { /* private mode */ } }
      return false;
    });
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem('oasis_sky_links', showLinks ? '1' : '0'); } catch { /* private mode */ }
  }, [showLinks]);

  // 移动端的图注只出现一次，既可主动关闭，也会在 4.5 秒后自己退场。
  useEffect(() => {
    if (!narrow || !hintOn) return;
    const timer = window.setTimeout(dismissHint, 4500);
    return () => window.clearTimeout(timer);
  }, [dismissHint, hintOn, narrow]);

  useEffect(() => {
    const frame = requestAnimationFrame(refreshLabelObstacles);
    return () => cancelAnimationFrame(frame);
  }, [hintOn, narrow, refreshLabelObstacles, selectedId]);

  // ══ 分类带 ══════════════════════════════════════════════════════════
  // 让「半径 = 分类」这条规则在画面上看得见，而不是只有我们自己知道。
  // ⚠️ 次序直接取自数据层的 bandsFor()，不在这里抄第二遍排序——上一版抄了一份，
  //    并且用 skyWindow() 的边算带名坐标，而相机 fit 到的是 starBounds()：两套取景，
  //    于是 3.8 倍下「学习笔记」被右边缘切掉，只剩「学习笔」。
  const bands = useMemo(() => {
    const b = bandsFor(posts);
    const span = Math.max(1, b.order.length - 1);
    const width = (SKY_OUTER - SKY_INNER) / Math.max(1, b.order.length);
    return b.order.map((id, i) => ({
      id,
      zh: metaOf(id).zh,
      center: b.center.get(id) ?? SKY_INNER + width * (i + 0.5),
      divider: i < b.order.length - 1 ? SKY_INNER + width * (i + 1) : null,
      // 带名旁边那一点色 = 这条带上的星色（取最亮档），于是 gutter 本身就是图例。
      fill: starFill(b.order.length < 2 ? 0.5 : i / span, 5),
    }));
  }, [metaOf, posts]);

  // ══ 相机 ══════════════════════════════════════════════════════════
  // 星卡贴着星走：和 transform 写在同一个函数里，于是拖动/缩放时卡片零延迟跟随，
  // 且整个过程没有一次 setState。这是「相机不进 React」那条规矩的延伸，不是例外。
  const positionCard = useCallback((v: View) => {
    const el = cardRef.current, node = selNode.current, rect = rectRef.current;
    if (!el || !node || !rect || narrow) return;
    const k = baseK(rect);
    const sx = rect.width / 2 + v.x + v.scale * k * (node.x - VW / 2);
    const sy = rect.height / 2 + v.y + v.scale * k * (node.y - VH / 2);
    const w = el.offsetWidth || CARD_W;
    const h = el.offsetHeight || 240;
    // 默认摆在星的右边；右边放不下就翻到左边。这是信息窗的通行做法，
    // 比固定在屏幕一侧更能保住「这张卡说的是这颗星」的因果关系。
    let left = sx + 24;
    if (left + w > rect.width - PAD) left = sx - 24 - w;
    // ⚠️ 用 left/top，不用 transform。
    //    transform 属于 framer：它做入场动画，收尾时会把 transform 写成 none，
    //    于是这里写的 translate3d 被抹掉，卡片永远停在左上角压着题记
    //    （老 bug，「这张卡说的是这颗星」这层因果关系一直是断的）。
    //    代价是每帧一次这一个绝对定位元素的重排——它不影响任何兄弟节点，
    //    而且只在开着卡片拖动时发生，换回来的是位置真的生效。
    el.style.left = `${Math.round(clamp(left, PAD / 2, Math.max(PAD / 2, rect.width - w - PAD / 2)))}px`;
    el.style.top = `${Math.round(clamp(sy - h / 2, PAD / 2, Math.max(PAD / 2, rect.height - h - 88)))}px`;
  }, [narrow]);

  const write = useCallback((v: View, animate: boolean) => {
    viewRef.current = v;
    const el = canvasRef.current;
    if (!el) return;
    el.style.transition = animate && !reduceMotion ? 'transform 420ms cubic-bezier(.22,1,.36,1)' : 'none';
    el.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.scale})`;
    // ⚠️ 补偿量必须是「viewBox 单位 → 屏幕 px」的完整倍率，即 scale × baseK，不是 scale。
    //    只除 scale 的话，字号会变成 13 × baseK px——同一份代码在 1440 宽的屏上是 19px、
    //    在窄屏上是 13px，「字号 5 档」这条刻度当场作废。乘上 baseK 之后它恒等于 13px。
    const screen = v.scale * (rectRef.current ? baseK(rectRef.current) : 1);
    el.style.setProperty('--sky-scale', String(screen));
    positionCard(v);
    // 标注的显隐分三档，门限取「相对全图放大了多少」而不是绝对倍率——
    // 手机和桌面的全图倍率差一倍多，用绝对值会让两边落在不同档位。
    //
    // React 只在两件事上被惊动：跨了档，或者倍率变化超过 1.4×（标注的避让是在
    // 当前倍率下算的，倍率漂太远那份排版就不作数了）。连续捏合最多几次渲染。
    const rel = v.scale / (fitScale.current || 1);
    const lod: Cam['lod'] = rel < 1.2 ? 0 : rel < 2 ? 1 : 2;
    setCam(prev => (
      prev.lod === lod && Math.abs(Math.log(screen / prev.scale)) < 0.34
        ? prev : { lod, scale: screen }
    ));
  }, [positionCard, reduceMotion]);

  // 把 viewBox 里的一点摆到舞台的某个位置
  const place = useCallback((p: Point, target: Point, scale: number, rect: DOMRect): View => {
    const k = baseK(rect);
    return {
      scale,
      x: target.x - rect.width / 2 - scale * k * (p.x - VW / 2),
      y: target.y - rect.height / 2 - scale * k * (p.y - VH / 2),
    };
  }, []);

  // 可用版心。选中一颗星时把画面重心左移，给右侧的星卡腾地方——
  // 不是把星推到边上（旧版的 bug），是让「星 + 卡」这一组居中。
  const viewport = useCallback((rect: DOMRect, withCard: boolean) => {
    // 窄屏的星卡是从底部升起的纸卷，占去 62vh：可用的天只剩上面那一条，
    // 相机得把星摆进那一条里。按整屏居中的话，选中的星正好被自己的卡片盖住。
    const bottom = narrow ? (withCard ? rect.height * 0.62 + 24 : 108) : 84;
    const shift = !narrow && withCard ? Math.min(CARD_W + 40, rect.width * 0.3) / 2 : 0;
    // 重心不是几何中心。题记占着左上，那一栏该让给它；而取景里收了一段年轮，
    // 那段弧是画面的地平线，得压在下方靠近边沿的位置——摆在正中的话，
    // 弧以下（圆之外）会留一整条什么都填不进去的空带，读起来就是「这个板块没东西」。
    const gutter = narrow ? 0 : GUTTER_X;
    return {
      w: rect.width - PAD * 2 - shift * 2 - gutter,
      h: rect.height - PAD - bottom,
      cx: gutter + (rect.width - gutter) * (narrow ? 0.5 : 0.54) - shift,
      cy: PAD + (rect.height - bottom - PAD) * (narrow ? 0.5 : 0.64),
    };
  }, [narrow]);

  // 年轮盘的主体就是完整的圆；把环外标注 gutter 一起收进画面，四周留 6% 呼吸。
  // 旧星图态在「收星群」和「收一段年轮」间摇摆，窄屏还要另一套规则；密度弧填满整圈后，
  // 取景只剩这一种正确答案。
  const ringBounds = useCallback(() => {
    const half = (SKY_RADIUS + LABEL_GUTTER) * 1.06;
    return { x: CENTER.x - half, y: CENTER.y - half, width: half * 2, height: half * 2 };
  }, []);

  const fit = useCallback((animate: boolean, withCard: boolean) => {
    const rect = stageRef.current?.getBoundingClientRect();
    // 尺寸还没落定（入场动画期间、或 posts 尚未到达时画布根本没挂载）就先不算：
    // 这时候量到的 rect 会算出一个错的倍率，而且 write() 因为 canvasRef 为空写不进 DOM，
    // 结果是「viewRef 是对的、屏幕上是错的」。fitted 记录是否真正成功过一次。
    if (!rect || !rect.width || !canvasRef.current) return;
    rectRef.current = rect;
    const b = ringBounds();
    const k = baseK(rect);
    const vp = viewport(rect, withCard);
    // 不需要给自动取景另设倍率上限：宽屏的包围盒里已经含着那段年轮，取景自然就把它留在画内；
    // 窄屏不含年轮，而星体半径已经与相机脱钩，放得再大也只是把星摊开、让更多名字写得下。
    const scale = clamp(
      Math.min(vp.w / (b.width * k), vp.h / (b.height * k)),
      MIN_SCALE, MAX_SCALE,
    );
    fitScale.current = scale;
    fitted.current = true;
    write(place({ x: b.x + b.width / 2, y: b.y + b.height / 2 }, { x: vp.cx, y: vp.cy }, scale, rect), animate);
  }, [place, ringBounds, viewport, write]);

  const centerOn = useCallback((node: GNode, withCard: boolean) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    rectRef.current = rect;
    const vp = viewport(rect, withCard);
    const scale = Math.max(viewRef.current.scale, fitScale.current * 1.35);
    write(place({ x: node.x, y: node.y }, { x: vp.cx, y: vp.cy }, scale, rect), true);
  }, [place, viewport, write]);

  // 首次进入与尺寸变化时自动摆正；用户动过相机之后不再打扰——
  // 但只要还没成功摆正过一次（fitted），就仍然要试，否则会永远停在那个错倍率上。
  const autoFit = useCallback((animate: boolean) => {
    if (touched.current && fitted.current) return;
    fit(animate, !!selectedId);
  }, [fit, selectedId]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      autoFit(false);
      requestAnimationFrame(refreshLabelObstacles);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [autoFit, refreshLabelObstacles]);

  // 入场动画期间量到的尺寸不可信，下一帧再补一次。
  useEffect(() => {
    autoFit(false);
    const raf = requestAnimationFrame(() => autoFit(false));
    return () => cancelAnimationFrame(raf);
  }, [autoFit, posts.length]);

  const resetView = useCallback(() => {
    touched.current = false;
    setSpotlight(null);
    setSeriesFocus(null);
    fit(true, !!selectedId);
  }, [fit, selectedId]);

  // ══ 选择 ════════════════════════════════════════════════════════════
  const open = useCallback((post: BlogPost) => {
    dismissHint();
    setLocalId(post.id);
    setSpotlight(null);
    onNavigate?.(post.id);
    const node = graph.postNodes.get(post.id);
    // 选星就是一次「用户驱动的取景」：此后不再自动摆正，除非他自己按「全图」。
    if (node) { touched.current = true; selNode.current = node; centerOn(node, true); }
    window.setTimeout(() => cardTitleRef.current?.focus(), reduceMotion ? 0 : 240);
  }, [centerOn, dismissHint, graph.postNodes, onNavigate, reduceMotion]);

  const close = useCallback(() => {
    const id = selectedId;
    selNode.current = null;
    setLocalId(null);
    setSeriesFocus(null);
    onNavigate?.();
    window.setTimeout(() => id && starRefs.current.get(id)?.focus(), 0);
  }, [onNavigate, selectedId]);

  // L2：读全文永远发生在为阅读设计的界面里。星图只负责把人送到门口。
  const read = useCallback((id: string) => {
    window.location.hash = formatHash('garden', id);
  }, []);

  // 选中项来自路由（分享链接、后退）时，也要让相机跟上。
  useEffect(() => {
    const node = selectedId ? graph.postNodes.get(selectedId) : null;
    selNode.current = node ?? null;
    if (node) { positionCard(viewRef.current); if (!touched.current) centerOn(node, true); }
  }, [centerOn, graph.postNodes, positionCard, selectedId]);

  // ══ 指针：拖动与捏合都不经过 React；点击走最近邻拾取 ══════════════════
  const localPt = (e: React.PointerEvent): Point => {
    const r = rectRef.current ?? stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const beginPinch = () => {
    const pts = [...pointers.current.values()];
    pinchFrom.current = pts.length < 2 ? null : {
      d: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1,
      mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
      v: viewRef.current,
    };
  };

  // 屏幕坐标 → viewBox 坐标 → 最近的那颗星。命中区互不相交（数据层保证），
  // 所以「最近且在命中区内」是唯一解，不存在旧版那种「点最大的星却开了别的」。
  const pickAt = useCallback((p: Point): GNode | null => {
    const rect = rectRef.current;
    if (!rect) return null;
    const v = viewRef.current;
    const k = baseK(rect) * v.scale;
    const vx = (p.x - rect.width / 2 - v.x) / k + VW / 2;
    const vy = (p.y - rect.height / 2 - v.y) / k + VH / 2;
    let best: GNode | null = null;
    let bestD = Infinity;
    const consider = (node: GNode) => {
      const d = Math.hypot(node.x - vx, node.y - vy);
      // 命中区随缩放一起放大，所以缩得越近越好点；同时给触屏一个不小于 11px 的下限。
      const reach = Math.max(node.hitR, 11 / k);
      if (d <= reach && d < bestD) { bestD = d; best = node; }
    };
    graph.postNodes.forEach(consider);
    graph.pendingNodes.forEach(consider);
    return best;
  }, [graph.pendingNodes, graph.postNodes]);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('[data-sky-ui]')) return;
    rectRef.current = stageRef.current!.getBoundingClientRect();   // 整段手势只量这一次
    pointers.current.set(e.pointerId, localPt(e));
    e.currentTarget.setPointerCapture(e.pointerId);
    moved.current = false;
    if (pointers.current.size === 1) dragFrom.current = { p: localPt(e), v: viewRef.current };
    else { dragFrom.current = null; beginPinch(); }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = localPt(e);
    pointers.current.set(e.pointerId, p);
    const rect = rectRef.current!;

    if (pointers.current.size >= 2 && pinchFrom.current) {
      moved.current = true;
      touched.current = true;
      const pts = [...pointers.current.values()];
      const d = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const from = pinchFrom.current;
      const scale = clamp(from.v.scale * d / from.d, MIN_SCALE, MAX_SCALE);
      const ratio = scale / from.v.scale;
      write({
        scale,
        x: mid.x - rect.width / 2 - ratio * (from.mid.x - rect.width / 2 - from.v.x),
        y: mid.y - rect.height / 2 - ratio * (from.mid.y - rect.height / 2 - from.v.y),
      }, false);
      return;
    }
    const from = dragFrom.current;
    if (!from) return;
    // 4px 的死区：手指按在星上难免抖一下，抖动不该被算成拖动而吃掉这次点击。
    if (!moved.current && Math.hypot(p.x - from.p.x, p.y - from.p.y) < 4) return;
    moved.current = true;
    touched.current = true;
    write({ ...from.v, x: from.v.x + p.x - from.p.x, y: from.v.y + p.y - from.p.y }, false);
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    const was = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    const rest = [...pointers.current.values()];
    dragFrom.current = rest.length === 1 ? { p: rest[0], v: viewRef.current } : null;
    beginPinch();
    if (moved.current) { requestAnimationFrame(refreshLabelObstacles); return; }
    if (!was || rest.length) return;
    const hit = pickAt(was);
    if (hit?.post) open(hit.post);
    else if (hit?.kind === 'pending' && isAdmin) onCreatePost?.(hit.pendingTitle!);
    else if (selectedId) close();
    else dismissHint();
  };

  // ⚠️ 滚轮必须自己 addEventListener 并显式 passive:false。
  //    React 的 onWheel 走的是根节点上的被动监听器，里面 preventDefault() 无效——
  //    控制台会刷「Unable to preventDefault inside passive event listener」，
  //    缩放虽然还生效，但页面同时会跟着滚。
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !posts.length) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      rectRef.current = rect;
      touched.current = true;
      const v = viewRef.current;
      const scale = clamp(v.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), MIN_SCALE, MAX_SCALE);
      const ratio = scale / v.scale;
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      write({
        scale,
        x: px - rect.width / 2 - ratio * (px - rect.width / 2 - v.x),
        y: py - rect.height / 2 - ratio * (py - rect.height / 2 - v.y),
      }, false);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [posts.length, write]);

  // ══ 派生 ════════════════════════════════════════════════════════════
  const ranked = useMemo(
    () => [...graph.postNodes.values()].sort((a, b) => (b.magnitude ?? 0) - (a.magnitude ?? 0)),
    [graph.postNodes],
  );

  const seriesOf = selected?.series ? graph.series.find(s => s.name === selected.series) : undefined;
  const focusSeries = seriesFocus ? graph.series.find(s => s.name === seriesFocus) : undefined;
  const searching = searchOpen ? query.trim().toLocaleLowerCase() : '';

  // 环外 gutter 容量有限：常驻名字按星等 / 新近度分级，选中与搜索命中项强制晋级。
  // UI 障碍统一从 data-oasis-avoid 读取，并通过相机逆变换送进同一套 viewBox 排字。
  const labels = useMemo(() => {
    const promoted = new Set<string>();
    if (selectedId) promoted.add(selectedId);
    if (searching) posts.forEach(post => {
      if (`${post.title} ${post.tags.join(' ')}`.toLocaleLowerCase().includes(searching)) promoted.add(post.id);
    });
    return placeAnnulusLabels(ranked, cam.lod, cam.scale, labelObstacles, promoted, narrow);
  }, [cam.lod, cam.scale, labelObstacles, narrow, posts, ranked, searching, selectedId]);

  // 搜索时边打边亮：命中的星就地亮起、其余压暗，这是地图能做而列表不能做的事。
  // 复用同一套 dimmed 机制，一行都不用新加。
  const dimmed = useMemo(() => {
    if (searching) {
      return new Set(posts
        .filter(p => `${p.title} ${p.tags.join(' ')}`.toLocaleLowerCase().includes(searching))
        .map(p => p.id));
    }
    if (spotlight) return new Set(spotlight.postIds);
    if (focusSeries) return new Set(focusSeries.posts.map(p => p.id));
    if (termHover) {
      return new Set(posts
        .filter(p => currentSolarTerm(new Date(p.createdAt)).name === termHover)
        .map(p => p.id));
    }
    return null;
  }, [focusSeries, posts, searching, spotlight, termHover]);

  const term = currentSolarTerm(new Date(now));
  const today = new Date(now);
  const solarYear = today.getFullYear() - (today.getMonth() === 0 || (today.getMonth() === 1 && today.getDate() < 4) ? 1 : 0);

  // 节气环 = 二十四个扇区。每个扇区攒着那半个月写的星，于是「角度 = 日期」这条规则
  // 终于有了回报：外圈一条浓淡不匀的弧，一眼读出「七月很满、四月是空的」。
  // 没有这条弧，日期轴的信息量在画面上等于零——读者无从比较疏密。
  const terms = useMemo(() => {
    const density = densityByTerm(posts);
    const raw = SOLAR_TERMS.map((t, i) => ({
      t, i,
      a: angleForDate(Date.UTC(t.month === 1 ? solarYear + 1 : solarYear, t.month - 1, t.day)),
      count: density[i].count,
      a0: density[i].a0,
      a1: density[i].a1,
    }));
    const peak = Math.max(1, ...raw.map(s => s.count));
    return raw.map(s => ({ ...s, density: s.count / peak }));
  }, [posts, solarYear]);

  // 题记里那句「读图」。8 颗星 · 花园第 26 天是个统计量；这一句才是这张天自己的读数。
  const reading = useMemo(() => {
    if (!posts.length) return '';
    const dense = terms.reduce((best, s) => (s.count > best.count ? s : best), terms[0]);
    if (!dense.count) return '';
    const head = `最密的是${dense.t.name}前后，${dense.count} 篇`;
    // 花园还没满一季时不谈「空白」：三个空扇区里有两个是还没到的日子，说了是错的。
    const span = (now - Math.min(...posts.map(p => p.createdAt))) / DAY;
    if (span < 120) return head;
    // 环上最长的一段空白。绕两圈才能抓到跨立春的那种缺口。
    let best = { from: 0, len: 0 }, run = 0;
    for (let i = 0; i < terms.length * 2; i++) {
      if (terms[i % terms.length].count) { run = 0; continue; }
      run++;
      if (run > best.len && run <= terms.length) best = { from: (i - run + 1) % terms.length, len: run };
    }
    if (best.len < 3) return head;
    return `${head}；${terms[best.from].t.name}到${terms[(best.from + best.len - 1) % terms.length].t.name}还空着`;
  }, [now, posts, terms]);

  const todayAngle = angleForDate(now);
  const gardenAge = posts.length
    ? Math.floor((now - Math.min(...posts.map(p => p.createdAt))) / DAY) + 1
    : 0;

  const neighbors = selectedId
    ? [...(graph.neighbors.get(selectedId) ?? [])].map(id => graph.postNodes.get(id)?.post).filter(Boolean) as BlogPost[]
    : [];

  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return posts.slice(0, 6);
    return posts.filter(p => `${p.title} ${p.tags.join(' ')}`.toLocaleLowerCase().includes(q)).slice(0, 8);
  }, [posts, query]);

  // ══ 漫游与手记 ══════════════════════════════════════════════════════
  // 权重偏向久未照料的星：访客顺手的好奇心，替站主浇了最渴的那一棵。
  const wander = useCallback(() => {
    if (!posts.length) return;
    dismissHint();
    const weighted = posts.map(p => ({
      post: p, w: 1 + Math.min(180, (now - p.updatedAt) / DAY) / 30,
    }));
    const total = weighted.reduce((sum, item) => sum + item.w, 0);
    let roll = Math.random() * total;
    const target = weighted.find(item => (roll -= item.w) <= 0)?.post ?? posts[0];
    const node = graph.postNodes.get(target.id);
    if (node && !reduceMotion) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      setMeteor({ key: Date.now(), x: node.x, y: node.y, dx: 150 * dir, dy: -110 });
      window.setTimeout(() => setMeteor(null), 950);
    }
    touched.current = true;
    open(target);
  }, [dismissHint, graph.postNodes, now, open, posts, reduceMotion]);

  const onSignal = (signal: SkySignal) => {
    if (spotlight?.id === signal.id) { setSpotlight(null); return; }
    setSpotlight(signal);
    setSeriesFocus(null);
    const first = graph.postNodes.get(signal.postIds[0]);
    if (first) { touched.current = true; centerOn(first, !!selectedId); }
  };

  const remove = () => {
    if (!selected || !window.confirm(`拔除《${selected.title}》？`)) return;
    uprootSeed(selected.id);
    close();
  };

  // ══ 键盘 ════════════════════════════════════════════════════════════
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable) {
        if (e.key === 'Escape') { setSearchOpen(false); setQuery(''); }
        return;
      }
      if (e.key === '/') { e.preventDefault(); setSearchOpen(true); return; }
      if (e.key === 'Escape') {
        if (searchOpen) setSearchOpen(false);
        else if (notesOpen) setNotesOpen(false);
        else if (selectedId) close();
        else { setSpotlight(null); setSeriesFocus(null); }
        return;
      }
      if (e.key === 'Enter' && selected && !searchOpen) { e.preventDefault(); read(selected.id); return; }
      // ←/→ 在同一个星座里前后翻，这是合集唯一值得占用方向键的理由
      const group = (focusSeries ?? seriesOf)?.posts ?? [];
      if (group.length < 2 || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      const at = group.findIndex(p => p.id === selectedId);
      const next = e.key === 'ArrowLeft' ? group[at - 1] : group[at + 1] ?? (at < 0 ? group[0] : undefined);
      if (next) { e.preventDefault(); open(next); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, focusSeries, notesOpen, open, read, searchOpen, selected, selectedId, seriesOf]);

  // ══ 星卡内容 ════════════════════════════════════════════════════════
  const chapter = seriesOf ? seriesOf.posts.findIndex(p => p.id === selected?.id) + 1 : 0;
  const cardBody = selected && (
    <>
      <p className="font-mono text-[10px] tracking-[.2em] text-[var(--sky-accent-text)]">
        {seriesOf
          ? `星座 ${seriesOf.name}${chapter ? ` · 第${cnNum(chapter)}章` : ''}`
          : metaOf(selected.type).zh}
      </p>
      <h2 ref={cardTitleRef} tabIndex={-1}
        className="mt-2 outline-none font-serif text-[16px] leading-snug text-[var(--sky-ink)]">
        {selected.title}
      </h2>
      <p className="mt-2 font-serif text-[13px] leading-relaxed text-[var(--sky-ink)]/[.62]">
        {excerptOf(selected)}
      </p>
      <p className="mt-3 font-mono text-[10px] tracking-[.08em] text-[var(--sky-ink)]/[.38]">
        {selected.date} · {growthLabel[selected.growth]} · {readingMinutes(selected.content)} 分钟 · {tendedLabel(selected.updatedAt, now)}
      </p>

      {(focusSeries ?? seriesOf) && (focusSeries ?? seriesOf)!.posts.length > 1 && (
        <nav className="mt-4 pt-4 border-t border-[var(--sky-ink)]/[.16]">
          <p className="font-mono text-[10px] tracking-[.2em] text-[var(--sky-ink)]/[.38]">目录</p>
          <ol className="mt-1 max-h-[9rem] overflow-y-auto no-scrollbar">
            {(focusSeries ?? seriesOf)!.posts.map((p, i) => (
              <li key={p.id}>
                <button onClick={() => open(p)}
                  className={`w-full text-left py-1 font-serif text-[13px] transition-colors ${p.id === selected.id ? 'text-[var(--sky-accent-text)]' : 'text-[var(--sky-ink)]/[.62] hover:text-[var(--sky-ink)]'}`}>
                  <span className="font-mono text-[10px] mr-2 opacity-60">{String(i + 1).padStart(2, '0')}</span>{p.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {neighbors.filter(p => p.id !== selected.id).length > 0 && (
        <nav className="mt-4 pt-4 border-t border-[var(--sky-ink)]/[.16]">
          <p className="font-mono text-[10px] tracking-[.2em] text-[var(--sky-ink)]/[.38]">邻星</p>
          <div className="mt-1 flex flex-wrap gap-x-4">
            {neighbors.filter(p => p.id !== selected.id).slice(0, 4).map(p => (
              <button key={p.id} onClick={() => open(p)}
                className="py-1 font-serif text-[13px] text-[var(--sky-ink)]/[.62] hover:text-[var(--sky-ink)] transition-colors">{p.title}</button>
            ))}
          </div>
        </nav>
      )}

      <div className="mt-4 pt-4 border-t border-[var(--sky-ink)]/[.16] flex items-center justify-between gap-4">
        <button onClick={() => read(selected.id)}
          className="font-mono text-[11px] tracking-[.14em] text-[var(--sky-accent-text)] hover:opacity-70 transition-opacity">
          进入阅读 →
        </button>
        {isAdmin && (
          <button onClick={remove}
            className="font-mono text-[10px] tracking-[.14em] text-[var(--sky-ink)]/[.38] hover:text-[#C2566B] transition-colors">拔除</button>
        )}
      </div>
    </>
  );

  const cardClass = 'bg-[var(--sky-lo)]/95 backdrop-blur-[2px] border border-[var(--sky-ink)]/[.16] shadow-[0_18px_60px_rgba(8,18,25,.14)]';

  return (
    <section className="oasis-sky absolute inset-0 z-10 overflow-hidden [-webkit-tap-highlight-color:transparent]" aria-label="知识星图">
      <div className="absolute inset-x-0 top-0 bottom-[var(--oasis-bottom-safe-space)]">

        {/* ── 题记：整屏唯一的大字。 ──
            第三行以前写的是「8 颗星 · 花园第 26 天」——一个统计量，还用最不可读的墨度写着。
            现在它先报数、再读图：「最密的是大暑前后，5 篇」。
            一句话就答了「这是干什么的」，而它答的正是列表答不了的那件事。 */}
        {/* 窄屏一旦升起纸卷，可用的天只剩上面一条，题记会和星挤在一起——让它退场，
            关掉卡片再回来。宽屏空间够，题记始终在。 */}
        <header data-oasis-avoid className={`pointer-events-none absolute left-9 top-[5.5rem] md:left-14 md:top-24 z-30 flex items-start gap-4 transition-opacity duration-200 ${narrow && selected ? 'opacity-0' : 'opacity-100'}`}>
          <img src="/avatar.jpg" alt="" aria-hidden
            className="mt-1 w-11 h-11 rounded-full object-cover opacity-90 ring-1 ring-[var(--sky-ink)]/[.16]" />
          <div>
            <h1 className="font-serif text-[var(--sky-ink)] leading-none flex gap-2" style={{ fontSize: 44 }}>
              {[...term.name].map((ch, i) => <span key={i}>{ch}</span>)}
            </h1>
            <p className="mt-3 font-mono text-[11px] tracking-[.16em] text-[var(--sky-ink)]/[.62]">
              {today.getFullYear()} · {cnNum(today.getMonth() + 1)}月{cnNum(today.getDate())}
            </p>
            <p className="mt-1 font-mono text-[11px] tracking-[.16em] text-[var(--sky-ink)]/[.62]">
              {posts.length} 处亮着 · 花园第 {gardenAge} 天
            </p>
            {!narrow && reading && (
              <p className="mt-2 max-w-[15rem] font-serif text-[13px] leading-relaxed text-[var(--sky-ink)]/[.62]">
                {reading}
              </p>
            )}
            {/* 桌面题记是站主块常规流的一部分，不再作为一层文字压在图版上。 */}
            {!narrow && hintOn && posts.length > 0 && !selected && (
              <p className="mt-4 max-w-[15rem] font-serif text-[13px] leading-relaxed text-[var(--sky-ink)]/[.38]">
                外圈是一年的节气，星落在它写下那天的方位上；离圆心越远，是越晚开垦的分类。
                {graph.pendingNodes.size > 0 && <><br />粉色的空位是我提过、还没写的东西。</>}
              </p>
            )}
          </div>
        </header>

        {/* 移动端图注不进入画布：首次进入显示 4.5 秒，也可点按提前收起。 */}
        <AnimatePresence>
          {narrow && hintOn && posts.length > 0 && !selected && (
            <motion.button key="mobile-hint" data-oasis-avoid data-sky-ui onClick={dismissHint}
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              transition={{ duration: reduceMotion ? 0 : .28 }}
              className="absolute left-5 right-5 top-[9.25rem] z-40 border-y border-[var(--sky-ink)]/[.16] bg-[var(--sky-lo)]/90 px-4 py-3 text-left font-serif text-[13px] leading-relaxed text-[var(--sky-ink)]/[.62]">
              外圈是节气与写作密度，星落在写下那天的方向；轻触一颗星，或拖动年轮漫游。
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── 天区 ── */}
        <div
          ref={stageRef}
          className="absolute inset-0 touch-none select-none overflow-hidden"
          style={{ cursor: posts.length ? 'grab' : 'default' }}
          onPointerDown={posts.length ? onPointerDown : undefined}
          onPointerMove={posts.length ? onPointerMove : undefined}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          {!posts.length ? (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <p className="font-serif text-[16px] text-[var(--sky-ink)]/[.62]">这片天还没有星。</p>
            </div>
          ) : (
            <div ref={canvasRef} className="oasis-sky-canvas absolute inset-0 will-change-transform" style={{ transformOrigin: '50% 50%' }}>
              <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet"
                className="absolute inset-0 w-full h-full" style={{ color: 'var(--sky-ink)' }}>

                <defs>
                  {/* 星晕。白天 --sky-halo 是 0，这层等于不存在；夜里它就是「星在发光」的全部实现。
                      用预定义的径向渐变而不是 filter:blur——几十颗星开滤镜是移动端的帧率杀手。
                      ⚠️ 颜色是固定的 --sky-bloom（冷白），不是 currentColor：跟着星色走的彩色光晕
                         是游戏 HUD 的做法，而且会把好不容易压下去的色度又放大一圈。 */}
                  <radialGradient id="skyHalo">
                    <stop offset="0%" stopColor="var(--sky-bloom)" stopOpacity=".55" />
                    <stop offset="45%" stopColor="var(--sky-bloom)" stopOpacity=".16" />
                    <stop offset="100%" stopColor="var(--sky-bloom)" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="skyNebula">
                    <stop offset="0%" stopColor="currentColor" stopOpacity=".9" />
                    <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                  </radialGradient>
                  <linearGradient id="skyMeteor" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--sky-accent)" stopOpacity="0" />
                    <stop offset="100%" stopColor="var(--sky-accent)" stopOpacity=".9" />
                  </linearGradient>
                </defs>

                {/* 写作密度向年轮内侧生长。长度编码数量，墨度保持同一档；因而「立秋连写了几篇」
                    不看题记也能从轮廓直接读出，文章少与文章多时使用的是同一种视觉语法。 */}
                <g aria-hidden>
                  {terms.map(({ t, a0, a1, density }) => {
                    const outer = SKY_RADIUS - 14;
                    const inner = outer - 40 * density;
                    return <path key={`density:${t.name}`}
                      d={annularSector(a0 + .006, a1 - .006, inner, outer)}
                      fill={termHover === t.name ? 'var(--sky-accent)' : 'currentColor'}
                      opacity={termHover === t.name ? 'var(--sky-o4)' : 'var(--sky-o2)'} />;
                  })}
                </g>

                {/* 半径 = 分类带。参考环让编码成为坐标系，带名沿弧排布，不再漂在左侧充当图例。 */}
                <g aria-hidden>
                  {bands.map((band, index) => (
                    <g key={band.id} className="oasis-sky-band">
                      <circle cx={CENTER.x} cy={CENTER.y} r={band.center} fill="none"
                        stroke="var(--sky-ink)" strokeOpacity="var(--sky-o1)" strokeWidth="var(--sky-w1)"
                        vectorEffect="non-scaling-stroke" />
                      <path id={`sky-band-${index}`} d={arcPath(band.center, -Math.PI * .62, -Math.PI * .38)} fill="none" />
                      <text className="oasis-sky-label" fill="var(--sky-ink)" fillOpacity="var(--sky-o3)"
                        style={{ fontSize: 'var(--sky-name)', letterSpacing: '.12em' }}>
                        <textPath href={`#sky-band-${index}`} startOffset="50%" textAnchor="middle">{band.zh}</textPath>
                      </text>
                    </g>
                  ))}
                </g>

                {/* 节气环与刻度。 */}
                <g fill="none" stroke="currentColor" aria-hidden>
                  {bands.map(b => b.divider && (
                    <circle key={`band:${b.id}`} cx={CENTER.x} cy={CENTER.y} r={b.divider}
                      strokeWidth="var(--sky-w1)" opacity="var(--sky-o2)" vectorEffect="non-scaling-stroke" />
                  ))}
                  <circle cx={CENTER.x} cy={CENTER.y} r={SKY_RADIUS}
                    strokeWidth="var(--sky-w1)" opacity="var(--sky-o1)" vectorEffect="non-scaling-stroke" />
                  {terms.map(({ t, a }) => {
                    const principal = PRINCIPAL_TERMS.has(t.name);
                    return (
                      <line key={t.name}
                        x1={CENTER.x + Math.cos(a) * (SKY_RADIUS - (principal ? 12 : 7))}
                        y1={CENTER.y + Math.sin(a) * (SKY_RADIUS - (principal ? 12 : 7))}
                        x2={CENTER.x + Math.cos(a) * SKY_RADIUS} y2={CENTER.y + Math.sin(a) * SKY_RADIUS}
                        strokeWidth={principal ? 'var(--sky-w2)' : 'var(--sky-w1)'}
                        opacity={termHover === t.name ? 'var(--sky-o4)' : 'var(--sky-o2)'}
                        vectorEffect="non-scaling-stroke" />
                    );
                  })}
                  {/* 日晷针从观测点贯穿到环外，是全图的方位基准。 */}
                  <line
                    x1={CENTER.x} y1={CENTER.y}
                    x2={CENTER.x + Math.cos(todayAngle) * (SKY_RADIUS + 8)} y2={CENTER.y + Math.sin(todayAngle) * (SKY_RADIUS + 8)}
                    stroke="var(--sky-accent)" strokeWidth="var(--sky-w1)" opacity="var(--sky-o3)" vectorEffect="non-scaling-stroke" />
                </g>
                {/* 当前节气是年轮上唯一的一段强调色，而不是再添一个 UI 徽标。 */}
                {terms.filter(item => item.t.name === term.name).map(item => (
                  <path key="current-term" aria-hidden
                    d={annularSector(item.a0 + .006, item.a1 - .006, SKY_RADIUS - 4, SKY_RADIUS + 4)}
                    fill="var(--sky-accent)" opacity="var(--sky-o4)" />
                ))}
                <text aria-hidden
                  x={CENTER.x + Math.cos(todayAngle) * (SKY_RADIUS - 42)}
                  y={CENTER.y + Math.sin(todayAngle) * (SKY_RADIUS - 42)}
                  textAnchor="middle" dominantBaseline="middle"
                  className="font-mono oasis-sky-label" fill="var(--sky-accent-text)" opacity="var(--sky-o4)"
                  style={{ fontSize: 'var(--sky-micro)', letterSpacing: '.16em' }}>今天</text>

                {/* 节气名沿外环排布。它不是装饰：一颗星的角度就是它写下那天的角度，
                    指到「立秋」，那期间写的星会亮起来——这条对应关系用手一摸就验证了。
                    L0 只写八个「四立二分二至」，够当罗盘用；凑近了才补全二十四个。 */}
                {terms.map(({ t, a }) => {
                  const on = t.name === term.name;
                  if (cam.lod < 1 && !PRINCIPAL_TERMS.has(t.name) && !on) return null;
                  return (
                    <text key={t.name} data-sky-ui
                      x={CENTER.x + Math.cos(a) * (SKY_RADIUS + 22)} y={CENTER.y + Math.sin(a) * (SKY_RADIUS + 22)}
                      textAnchor="middle" dominantBaseline="middle"
                      className="font-serif oasis-sky-label cursor-default"
                      fill={on || termHover === t.name ? 'var(--sky-accent-text)' : 'currentColor'}
                      opacity={on || termHover === t.name ? 'var(--sky-o5)' : 'var(--sky-o3)'}
                      style={{ fontSize: 'var(--sky-meta)' }}
                      onMouseEnter={() => setTermHover(t.name)}
                      onMouseLeave={() => setTermHover(prev => (prev === t.name ? null : prev))}>{t.name}</text>
                  );
                })}

                {/* 观测点：天顶留一个空心圆，不放脸 */}
                <circle cx={CENTER.x} cy={CENTER.y} r="4" style={{ r: 'var(--sky-r-obs)' }}
                  fill="none" stroke="currentColor"
                  strokeWidth="var(--sky-w2)" opacity="var(--sky-o3)" vectorEffect="non-scaling-stroke" aria-hidden />

                {/* 星云：一个大标签就是一团星云。极淡的晕染 + 一个小环 + 名字，
                    这样那些汇向它的细线才有落点——上一版画了线却没画星云，线收束于虚空。
                    雾要么给足要么别画：.12 配 r×6 在屏幕上根本看不见，却每帧都在画，
                    现在收窄到 4.2× 并把浓度提到 .2，它才真的是一团雾。
                    环的大小编码「几篇汇进来」，所以也得是屏幕恒定的，否则又是一颗随相机长大的球。 */}
                {[...graph.tagNodes.values()].map(node => {
                  const hubPx = 4 + Math.sqrt(node.count ?? 1) * 1.1;
                  const hubR = `calc(${hubPx.toFixed(2)}px / var(--sky-scale))`;
                  return (
                    <g key={node.key} aria-hidden style={{ color: 'var(--sky-accent)' }}>
                      <circle cx={node.x} cy={node.y} r={hubPx * 4.2} fill="url(#skyNebula)"
                        style={{ r: `calc(${hubR} * 4.2)`, opacity: 'var(--sky-nebula)' }} />
                      <circle cx={node.x} cy={node.y} r={hubPx} style={{ r: hubR }}
                        fill="none" stroke="currentColor"
                        strokeWidth="var(--sky-w1)" opacity="var(--sky-o2)" vectorEffect="non-scaling-stroke" />
                      {/* dy 用 em：字号本身已经做过缩放补偿，于是这段偏移也自动是屏幕恒定的。 */}
                      {cam.lod >= 1 && (
                        <text x={node.x} y={node.y} dy="-1.7em" textAnchor="middle"
                          className="font-mono oasis-sky-label" fill="var(--sky-ink)" opacity="var(--sky-o4)"
                          style={{ fontSize: 'var(--sky-micro)', letterSpacing: '.12em' }}>
                          #{node.tag}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* 关系是查询图层，不是底图：默认只回答「这颗星直接连到谁」，打开后才补全
                    合集 / 双链；共享标签与星云仍只显示选中项的一跳，避免再次长成毛线团。 */}
                <g fill="none" aria-hidden>
                  {graph.links.map(l => {
                    const s = LINK_INK[l.kind];
                    const touchesSel = !!selectedId
                      && (l.a.post?.id === selectedId || l.b.post?.id === selectedId);
                    const structural = l.kind === 'series' || l.kind === 'wikilink';
                    const contextual = l.kind === 'shared-tag' || l.kind === 'nebula';
                    if (structural && !showLinks && !touchesSel) return null;
                    if (contextual && (!showLinks || !touchesSel)) return null;
                    const off = dimmed && ![l.a.post?.id, l.b.post?.id].some(id => id && dimmed.has(id));
                    return (
                      <line key={l.key} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y}
                        data-link-kind={l.kind}
                        stroke="currentColor" strokeWidth={s.w} strokeDasharray={s.dash} strokeLinecap="round"
                        opacity={off ? 'var(--sky-o1)' : touchesSel ? 'var(--sky-link-hot)' : s.o}
                        vectorEffect="non-scaling-stroke">
                        <title>{l.reason}</title>
                      </line>
                    );
                  })}
                </g>

                {/* 星座名：写在这条 asterism 的重心上方。点它进入星座模式（相机取景整条，卡片换成目录）。 */}
                {graph.series.filter(s => s.posts.length > 1 && (showLinks || s.name === seriesOf?.name || s.name === focusSeries?.name)).map(s => {
                  const ns = s.posts.map(p => graph.postNodes.get(p.id)!);
                  const cx = ns.reduce((t, n) => t + n.x, 0) / ns.length;
                  const top = Math.min(...ns.map(n => n.y - n.r));
                  const on = focusSeries?.name === s.name;
                  return (
                    <text key={s.name} data-sky-ui
                      x={cx} y={top} dy="-1.8em" textAnchor="middle"
                      className="font-mono oasis-sky-label cursor-pointer"
                      fill={on ? 'var(--sky-accent-text)' : 'currentColor'}
                      opacity={on ? 'var(--sky-o5)' : 'var(--sky-o4)'}
                      style={{ fontSize: 'var(--sky-micro)', letterSpacing: '.16em' }}
                      onClick={() => {
                        setSeriesFocus(prev => (prev === s.name ? null : s.name));
                        setSpotlight(null);
                        touched.current = true;
                        open(s.posts[0]);
                      }}>{s.name}</text>
                  );
                })}

                {/* ── 星：晕 / 体 / 核 / 芒 / 名 ──
                    四层不是为了热闹，是因为真实点光源有结构，而结构是分档给的：
                      · 晕  半径 3.2×，浓度按星等，最暗两档完全不发光 → 这才有远近
                      · 体  星等半径，填光谱色
                      · 核  近白 1.1px，只给最亮两档 → 「亮」的来源
                      · 芒  四道衍射十字，只给最亮那一档 → 最像照片的一笔，成本两根线
                    ⚠️ 芒以前派给了 growth === 'evergreen'。芒是亮度线索，拿去编码分类学状态，
                       于是天上没有一颗星看起来是亮的。growth 撤回星卡里说，天上不留它。
                    半径全部走 --sky-r* 令牌（CSS 的 r 属性，已做缩放补偿），r 属性只是兜底。 */}
                {ranked.map((node, i) => {
                  const post = node.post!;
                  const on = post.id === selectedId;
                  const off = dimmed && !dimmed.has(post.id);
                  const label = labels.get(post.id);
                  const mag = magOf(node);
                  const r = rToken(node);
                  const bloom = BLOOM_O[mag - 1];
                  // 只有最亮的一小撮在夜里明灭，且相位各不相同。
                  const twinkles = !reduceMotion && i < 12 && mag >= 4;
                  return (
                    <g key={node.key}
                      ref={el => { if (el) starRefs.current.set(post.id, el); else starRefs.current.delete(post.id); }}
                      className="oasis-sky-star"
                      data-named={label ? '1' : '0'} data-selected={on ? '1' : '0'}
                      role="button" tabIndex={0}
                      aria-label={`${post.title}，${metaOf(post.type).zh}，${growthLabel[post.growth]}，${tendedLabel(post.updatedAt, now)}`}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(post); } }}
                      opacity={off ? 'var(--sky-o2)' : 'var(--sky-o5)'}
                      style={{ cursor: 'pointer', color: starFill(node.band, mag) }}
                    >
                      {/* 命中区：手指按的是这个透明圆。半径由数据层给出，保证两两不相交。
                          ⚠️ 它继续留在 viewBox 单位里——凑近了本来就该更好点，而
                             hitR ≤ MIN_SEP/2 是「命中区永不相交」那条几何保证的全部依据。
                             看得见的半径脱离相机，摸得到的半径跟着相机，两者本来就该分开。 */}
                      <circle cx={node.x} cy={node.y} r={node.hitR} fill="transparent" />

                      <g className="oasis-sky-star-body">
                        {bloom > 0 && (
                          <circle className={twinkles ? 'oasis-sky-twinkle' : undefined}
                            cx={node.x} cy={node.y} r={rPx(node) * 3.2} fill="url(#skyHalo)"
                            style={{
                              r: `calc(${r} * 3.2)`,
                              ['--bloom-o' as string]: `calc(var(--sky-halo) * ${bloom})`,
                              opacity: 'var(--bloom-o)',
                              animationDelay: `${-i * 1.7}s`,
                            } as React.CSSProperties} />
                        )}

                        {/* 芒：只给最亮那一档，全图最多三五颗有。 */}
                        {mag >= 5 && (
                          <path aria-hidden
                            d={`M${node.x - rPx(node) * 3.6} ${node.y}H${node.x + rPx(node) * 3.6}`
                              + `M${node.x} ${node.y - rPx(node) * 3.6}V${node.y + rPx(node) * 3.6}`}
                            stroke="currentColor" strokeWidth="var(--sky-w1)" strokeLinecap="round"
                            opacity="var(--sky-o3)" vectorEffect="non-scaling-stroke" />
                        )}

                        {/* 未发布的星是空心的：草稿虚线、不列出实线 */}
                        {post.status !== 'published' ? (
                          <circle cx={node.x} cy={node.y} r={rPx(node)} style={{ r }}
                            fill="none" stroke="currentColor"
                            strokeWidth="var(--sky-w2)" strokeDasharray={post.status === 'draft' ? '2 3' : undefined}
                            opacity="var(--sky-o4)" vectorEffect="non-scaling-stroke" />
                        ) : (
                          <>
                            <circle cx={node.x} cy={node.y} r={rPx(node)} style={{ r }} fill="currentColor" />
                            {mag >= 4 && (
                              <circle cx={node.x} cy={node.y} r={rPx(node) * 0.42}
                                style={{ r: `min(var(--sky-r-core), calc(${r} * .42))` }}
                                fill="var(--sky-star-base)" opacity="var(--sky-o4)" />
                            )}
                          </>
                        )}
                      </g>

                      <circle className="oasis-sky-star-ring" cx={node.x} cy={node.y}
                        r={rPx(node) + 7} style={{ r: `calc(${r} + var(--sky-r-ring))` }}
                        fill="none"
                        stroke="currentColor" strokeWidth="var(--sky-w2)" vectorEffect="non-scaling-stroke" />

                      {label && (
                        <g className="oasis-sky-star-name" aria-hidden>
                          {/* 两段折线先沿半径出圈，再水平接到名字；中文本身始终不旋转。 */}
                          <polyline
                            points={`${node.x},${node.y} ${label.elbowX},${label.elbowY} ${label.anchor === 'start' ? label.x - 8 : label.x + 8},${label.y}`}
                            fill="none" stroke="currentColor" strokeWidth="var(--sky-w1)"
                            opacity="var(--sky-o2)" vectorEffect="non-scaling-stroke" />
                          <text x={label.x} y={label.y}
                            textAnchor={label.anchor} dominantBaseline="middle"
                            className="font-serif oasis-sky-label" fill="var(--sky-ink)"
                            opacity="var(--sky-o5)" style={{ fontSize: narrow ? 'var(--sky-micro)' : 'var(--sky-name)' }}>{label.text}</text>
                        </g>
                      )}
                      {!label && (
                        <text x={node.x} y={node.y} dy="-1.6em" textAnchor="middle" aria-hidden
                          className="oasis-sky-hover-name font-serif oasis-sky-label" fill="var(--sky-ink)"
                          style={{ fontSize: narrow ? 'var(--sky-micro)' : 'var(--sky-name)' }}>{starName(post.title, cam.lod, narrow)}</text>
                      )}
                    </g>
                  );
                })}

                {/* 还没种下的星位：正文里写了 [[标题]]，但那颗星还不存在。
                    全图唯一的樱粉——欠着的稿子是温柔的粉，不是红色警告。 */}
                {[...graph.pendingNodes.values()].map(node => (
                  <g key={node.key}
                    role={isAdmin ? 'button' : undefined} tabIndex={isAdmin ? 0 : undefined}
                    aria-label={isAdmin ? `种下《${node.pendingTitle}》` : undefined}
                    className="oasis-sky-hit"
                    onKeyDown={e => { if (isAdmin && (e.key === 'Enter' || e.key === ' ')) onCreatePost?.(node.pendingTitle!); }}
                    style={{ cursor: isAdmin ? 'pointer' : 'default' }}>
                    <circle cx={node.x} cy={node.y} r={node.hitR} fill="transparent" />
                    <circle cx={node.x} cy={node.y} r="3.2" style={{ r: 'var(--sky-r-pending)' }}
                      fill="none" stroke="var(--sky-pending)"
                      strokeWidth="var(--sky-w2)" strokeDasharray="2 4" opacity="var(--sky-o4)"
                      vectorEffect="non-scaling-stroke" />
                    {cam.lod >= 1 && (
                      <text x={node.x} y={node.y} dy="-1.6em" textAnchor="middle"
                        className="font-serif oasis-sky-label" fill="var(--sky-pending)" opacity="var(--sky-o4)"
                        style={{ fontSize: 'var(--sky-micro)' }}>{node.pendingTitle}</text>
                    )}
                  </g>
                ))}

                {/* 流星：漫游的那一下。一次性动画，只动 transform/opacity。 */}
                {meteor && (
                  <g key={meteor.key} className="oasis-sky-meteor" aria-hidden
                    style={{ ['--mx' as string]: `${meteor.dx}px`, ['--my' as string]: `${meteor.dy}px` } as React.CSSProperties}>
                    <line x1={meteor.x - meteor.dx * 0.22} y1={meteor.y - meteor.dy * 0.22} x2={meteor.x} y2={meteor.y}
                      stroke="url(#skyMeteor)" strokeWidth="var(--sky-w2)" strokeLinecap="round"
                      vectorEffect="non-scaling-stroke" />
                  </g>
                )}
              </svg>
            </div>
          )}
        </div>

        {/* ── 星卡：L1 的全部。桌面贴着星走，窄屏从底部升起 ── */}
        <AnimatePresence>
          {selected && (narrow ? (
            <motion.aside data-sky-ui key="sheet"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={reduceMotion ? { duration: 0 } : { duration: .26, ease: [.22, 1, .36, 1] }}
              drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: .4 }}
              onDragEnd={(_, info) => { if (info.offset.y > 90) close(); }}
              className={`absolute inset-x-0 bottom-0 z-50 max-h-[62vh] ${cardClass} border-x-0 border-b-0`}
              aria-label="星卡">
              <div className="flex justify-center pt-3 pb-1"><span className="w-9 h-[3px] rounded-[2px] bg-[var(--sky-ink)]/[.16]" /></div>
              <div className="max-h-[calc(62vh-2rem)] overflow-y-auto no-scrollbar px-7 pb-10 pt-2">{cardBody}</div>
            </motion.aside>
          ) : (
            // transform 归 framer（入场缩放），left/top 归 positionCard——见 positionCard 里的注记。
            <motion.aside ref={cardRef} data-sky-ui key="card"
              initial={{ opacity: 0, scale: .97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .97 }}
              transition={reduceMotion ? { duration: 0 } : { duration: .18, ease: [.22, 1, .36, 1] }}
              className={`absolute z-50 ${cardClass}`}
              style={{ width: CARD_W, left: 0, top: 0, transformOrigin: 'center left' }}
              aria-label="星卡">
              <button onClick={close} data-sky-ui aria-label="关闭"
                className="absolute right-4 top-4 z-10 text-[var(--sky-ink)]/[.38] hover:text-[var(--sky-ink)] transition-colors"><Icon d="close" /></button>
              <div className="max-h-[62vh] overflow-y-auto no-scrollbar px-6 py-6 pr-10">{cardBody}</div>
            </motion.aside>
          ))}
        </AnimatePresence>

        {/* ── 观测手记：家务不给客人看，只有站主有这一叠 ── */}
        {isAdmin && graph.signals.length > 0 && (
          <div data-sky-ui className="absolute right-9 top-[5.5rem] md:right-14 md:top-24 z-40 flex flex-col items-end">
            <button onClick={() => setNotesOpen(o => !o)}
              className={`font-mono text-[10px] tracking-[.16em] transition-colors ${notesOpen ? 'text-[var(--sky-accent-text)]' : 'text-[var(--sky-ink)]/[.38] hover:text-[var(--sky-ink)]'}`}>
              观测手记 {graph.signals.length}
            </button>
            <AnimatePresence>
              {notesOpen && (
                <motion.ul key="notes"
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: reduceMotion ? 0 : .18 }}
                  className={`mt-3 w-[17rem] max-h-[42vh] overflow-y-auto no-scrollbar ${cardClass} p-4`}>
                  {graph.signals.slice(0, 12).map(s => (
                    <li key={s.id} className="py-2 first:pt-0 last:pb-0 border-b last:border-b-0 border-[var(--sky-ink)]/[.16]">
                      <button onClick={() => onSignal(s)}
                        className={`text-left font-serif text-[13px] leading-snug transition-colors ${spotlight?.id === s.id ? 'text-[var(--sky-accent-text)]' : 'text-[var(--sky-ink)]/[.62] hover:text-[var(--sky-ink)]'}`}>
                        {s.title}
                      </button>
                      {s.kind === 'pending' && (
                        <button onClick={() => onCreatePost?.(s.pendingTitle!)}
                          className="mt-1 block font-mono text-[10px] tracking-[.12em] text-[var(--sky-accent-text)] hover:opacity-70 transition-opacity">
                          去种下 →
                        </button>
                      )}
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ── 版脚：三枚动作。没有仪表盘，也不再有图例 ──
            图例搬去了左沿的带 gutter：那里既说了分类的名字、也说了它是哪一圈，
            版脚那一份是同样三个词写第二遍。
            ⚠️ 10px 等宽字配 .38 的墨在夜空上实测只有 3.2:1，AA 要 4.5:1。
               升到 .62 得 6.6:1；.38 那一档只留给 13px 以上。 */}
        <div data-sky-ui data-oasis-avoid className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-9 md:px-14 pb-8">
          <div className="flex items-end justify-end gap-6">
            <div className="pointer-events-auto flex items-center gap-5 shrink-0">
              <button onClick={() => setShowLinks(value => !value)} aria-pressed={showLinks}
                className={`flex items-center gap-2 font-mono text-[10px] tracking-[.16em] transition-colors ${showLinks ? 'text-[var(--sky-accent-text)]' : 'text-[var(--sky-ink)]/[.62] hover:text-[var(--sky-ink)]'}`}>
                <span aria-hidden>{showLinks ? '◎' : '○'}</span>关联
              </button>
              <button onClick={wander} title="权重偏向久未照料的星"
                className="flex items-center gap-2 font-mono text-[10px] tracking-[.16em] text-[var(--sky-ink)]/[.62] hover:text-[var(--sky-ink)] transition-colors">
                <Icon d="wander" />最久没人来的
              </button>
              <button onClick={resetView}
                className="flex items-center gap-2 font-mono text-[10px] tracking-[.16em] text-[var(--sky-ink)]/[.62] hover:text-[var(--sky-ink)] transition-colors">
                <Icon d="fit" />全图
              </button>
              <button onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2 font-mono text-[10px] tracking-[.16em] text-[var(--sky-ink)]/[.62] hover:text-[var(--sky-ink)] transition-colors">
                <Icon d="search" />搜索<span className="opacity-70">/</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── 搜索：边打边亮 ──
            以前它是一块 80% 的幕布加一份结果列表——又一个列表，而列表这件事博客那边做得更好。
            现在幕布撤掉、面板上移：输入的同时命中的星就地亮起、其余压暗（走同一套 dimmed），
            回车才落位。这是地图能做而列表不能做的事。 */}
        <AnimatePresence>
          {searchOpen && (
            // 幕布撤掉之后，面板自己得让开题记那一栏，落在题记与星群之间的那条空带上。
            <motion.div data-sky-ui className="absolute inset-0 z-[80] flex items-start justify-center pt-[24vh]"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : .14 }}
              onMouseDown={e => { if (e.target === e.currentTarget) { setSearchOpen(false); setQuery(''); } }}>
              <div className={`w-[min(92vw,440px)] ${cardClass}`}>
                <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="寻找一颗星"
                  className="w-full px-6 py-4 bg-transparent outline-none font-serif text-[16px] text-[var(--sky-ink)] placeholder:text-[var(--sky-ink)]/[.38]" />
                <div className="border-t border-[var(--sky-ink)]/[.16] max-h-[32vh] overflow-y-auto no-scrollbar">
                  {results.map(p => (
                    <button key={p.id} onClick={() => { setSearchOpen(false); setQuery(''); touched.current = true; open(p); }}
                      className="w-full flex items-baseline justify-between gap-6 px-6 py-2.5 text-left hover:bg-[var(--sky-ink)]/[.06] transition-colors">
                      <span className="truncate font-serif text-[13px] text-[var(--sky-ink)]">{p.title}</span>
                      <span className="shrink-0 font-mono text-[10px] text-[var(--sky-ink)]/[.62]">{p.date}</span>
                    </button>
                  ))}
                  {!results.length && <p className="px-6 py-8 font-serif text-[13px] text-[var(--sky-ink)]/[.62]">天上没有这颗星。</p>}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="sr-only" aria-live="polite">{selected ? `已选择：${selected.title}` : ''}</div>
      </div>
    </section>
  );
};
