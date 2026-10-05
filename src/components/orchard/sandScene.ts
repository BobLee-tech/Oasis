// ✦ 砂与星 · 场景引擎。
//
// 地图部分全程不进 React：相机每帧直写 transform，节点的明暗、注记的择位都是直接改 DOM。
// React 只管版面之外的东西（庭记目录、星卡、时光拨盘），两边通过 setFocus / select /
// setCut 这几个方法对话。这是星图一直守着的规矩 3：「相机的平移缩放永远不进 React」。
//
// 视觉基准是 docs/sandprototype-v5.1.html，本文件是它的生产移植：
//   · 石 / 星是同一个节点的两种光，几何不变只换光（CSS 变量 --stone-o / --star-o）；
//   · 所有屏幕尺寸恒定的东西（石、灯笼、飞石、注记）放在 scale(1/k) 的子组里，
//     定位写在父组的 transform 特性上——CSS transform 会整个覆盖 SVG 的 transform 特性，
//     所以「定位」与「CSS 动画」永远分两层 g，这个坑踩过两次；
//   · 注记择位在屏幕空间做，量真实字宽（canvas measureText），全局不重叠。
import {
  ARCH, DAY, LV, MIN_SEP, RC, RH, RS, cnNum, iso, mossPath, neighborsOf, sandField, seeded, smooth,
  stonePath, tagFrequency, type Garden, type Neighbors, type Seg, type Stone,
} from '../../lib/sandGarden';
import { BSC5 } from '../../data/bsc5';

const NS = 'http://www.w3.org/2000/svg';
type Attrs = Record<string, string | number | null | undefined>;
const el = <K extends keyof SVGElementTagNameMap>(n: K, a: Attrs = {}, p?: Element): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, n);
  for (const k in a) { const v = a[k]; if (v != null) e.setAttribute(k, String(v)); }
  if (p) p.appendChild(e);
  return e;
};
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const deg = (r: number) => r * 180 / Math.PI;

const bezier = (x1: number, y1: number, x2: number, y2: number) => {
  const cx = (t: number) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3;
  const cy = (t: number) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
  return (x: number) => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (cx(m) < x) lo = m; else hi = m; }
    return cy((lo + hi) / 2);
  };
};
export const EASE_OUT = bezier(.16, 1, .3, 1);      // 全站 customEase：进场
export const EASE_IO = bezier(.65, 0, .35, 1);      // 播放 / 收拢

// 四角尖芒。内半径 .15——再大成菱形，再小成十字线。
const SPARK = 'M0,-1C.06,-.34 .34,-.06 1,0C.34,.06 .06,.34 0,1C-.06,.34 -.34,.06 -1,0C-.34,-.06 -.06,-.34 0,-1Z';
const FZH = '"LXGW WenKai Screen","Songti SC","Noto Serif SC",serif';
const FMO = '"JetBrains Mono",ui-monospace,monospace';

export interface CatMeta { zh: string; en: string; color: string; gid: string }
export interface Flags { railOn: boolean; cardOn: boolean; timeOn: boolean }
export interface FocusState {
  selId: string | null; hovId: string | null; hotCat: string | null; hotSer: string | null;
  topic: string | null; query: string;
}
interface Callbacks { onHover: (id: string | null) => void; onPick: (id: string | null) => void }

/** R 是屏幕半径（已乘字形倍率），r0 是 sym 内部的本地半径——画在 sym 里的环一律用 r0。 */
interface NodeRef { el: SVGGElement; sym: SVGGElement; R: number; r0: number; ed: number }
interface PathRef { el: SVGGElement; bed: SVGPathElement; chain: SVGPathElement; hit: SVGPathElement }
type Box = { x: number; y: number; w: number; h: number };

export const matchesQuery = (s: Stone, q: string) => !q
  || s.p.title.toLowerCase().includes(q) || s.p.tags.some(t => t.toLowerCase().includes(q))
  || (s.p.series ?? '').toLowerCase().includes(q);

/** 石灯笼（春日灯籠的剪影）：高 15px，底座在 (0,0)。立在每条小径的入口——也就是第一章。 */
export const drawLantern = (g: Element) => {
  el('ellipse', { class: 'ln-sh', cx: 2.2, cy: .6, rx: 4.6, ry: 1.4 }, g);
  el('circle', { class: 'ln-glow', cx: 0, cy: -9, r: 11, fill: 'url(#sand-lantern-glow)' }, g);
  el('rect', { class: 'ln-body', x: -3.2, y: -1.3, width: 6.4, height: 1.3, rx: .35 }, g);
  el('rect', { class: 'ln-body', x: -.9, y: -6.3, width: 1.8, height: 5.2 }, g);
  el('rect', { class: 'ln-body', x: -3, y: -7.5, width: 6, height: 1.3, rx: .35 }, g);
  el('rect', { class: 'ln-body', x: -2.3, y: -10.9, width: 4.6, height: 3.5, rx: .3 }, g);
  el('rect', { class: 'ln-win', x: -1.2, y: -10.2, width: 2.4, height: 2.1, rx: .2 }, g);
  el('path', { class: 'ln-body', d: 'M-4.8 -10.7C-3.2 -11.4 -1.5 -12.6 0 -13.3C1.5 -12.6 3.2 -11.4 4.8 -10.7Z' }, g);
  el('circle', { class: 'ln-body', cx: 0, cy: -14.1, r: .95 }, g);
};

/** 一块石 + 一颗星：同一个节点两种光。返回屏幕半径。图例也调用它，所以图例不会说谎。 */
export const drawGlyph = (
  parent: Element, p: { id: string; growth: string }, mag: number, gid: string, rot: number, twinkle = true,
) => {
  const R = RS[mag - 1], H = RH[mag - 1], rc = RC[mag - 1], A = ARCH[mag - 1], seed = p.growth === 'seedling';
  // 影子留在 lift 外面：石被悬停抬起时影子不跟着走，这才像「抬起」
  const sh = el('g', { class: 'stone st-sh' }, parent);
  if (!seed) el('ellipse', {
    cx: H * .75, cy: H * .95, rx: R * 1.08, ry: R * A.sq * 1.06, fill: 'url(#sand-shadow)',
    transform: `rotate(${deg(rot).toFixed(1)} ${H * .75} ${H * .95})`,
  }, sh);
  el('circle', { class: 'land', r: R + 2 }, parent);
  const lift = el('g', { class: 'lift' }, parent);
  const sg = el('g', { class: 'stone' }, lift);
  const body = stonePath(p.id, R, A, rot);
  el('path', {
    class: 'st-body' + (seed ? ' seed' : ''), d: body,
    fill: seed ? null : `url(#sand-st-${gid})`,
  }, sg);
  // 种子石：一块刚放下的浅色卵石——实线细边、淡淡一抹高光，没有斑晶与皴笔，也还没「坐实」出影子
  if (seed) el('ellipse', {
    class: 'st-hi seed', cx: -R * .28, cy: -R * .28 * A.sq, rx: R * .36, ry: R * .2 * A.sq + .3,
    transform: `rotate(-28 ${-R * .28} ${-R * .28 * A.sq})`,
  }, sg);
  if (!seed) {
    // 花岗岩的斑晶：四张纹样按 id 轮换，同尺寸的石不会长着同一张脸
    el('path', { class: 'st-grain', d: body, fill: `url(#sand-grain-${Math.floor(seeded('gr' + p.id) * GRAIN_N)})` }, sg);
    el('ellipse', {
      class: 'st-hi', cx: -R * .32, cy: -R * .3 * A.sq, rx: R * .34, ry: R * .18 * A.sq + .4,
      transform: `rotate(-28 ${-R * .32} ${-R * .3 * A.sq})`,
    }, sg);
    const cr = `rotate(${(deg(rot) * .3).toFixed(1)})`;
    if (mag >= 3) el('path', { class: 'st-cun', d: `M${-R * .2} ${R * .24 * A.sq}Q${R * .1} ${R * .04} ${R * .46} ${-R * .2 * A.sq}`, transform: cr }, sg);
    if (mag >= 4) el('path', { class: 'st-cun', d: `M${R * .02} ${R * .52 * A.sq}Q${R * .28} ${R * .34 * A.sq} ${R * .54} ${R * .16 * A.sq}`, transform: cr }, sg);
    if (p.growth === 'evergreen') {
      const m = mossPath(p.id, R, A);
      el('path', { class: 'st-moss', d: m.d }, sg);
      m.dots.forEach(d => el('circle', { class: 'st-moss-dot', ...d }, sg));
    }
  }
  const ng = el('g', { class: 'star' }, lift);
  if (!seed) {
    el('circle', { r: rc * 4.4, fill: `url(#sand-halo-${gid})` }, ng);
    // 只有五等星保留自动微闪：一个操作只突出一个变化，不让所有节点同时呼吸
    el('circle', {
      class: 'sr-glow' + (mag === 5 && twinkle ? ' tw' : ''), r: rc * 2, fill: 'url(#sand-glow)',
      style: `--tw:${(3.2 + seeded('tw' + p.id) * 2.8).toFixed(2)}s;--twd:${(-seeded('td' + p.id) * 6).toFixed(2)}s`,
    }, ng);
    if (mag === 5) el('path', { class: 'sr-spike', d: `M${-rc * 7} 0H${rc * 7}M0 ${-rc * 7}V${rc * 7}` }, ng);
  }
  el('circle', { class: 'sr-core' + (seed ? ' seed' : ''), r: rc }, ng);
  if (seed) el('circle', { class: 'sr-seedring', r: rc + 2.2 }, ng);
  if (p.growth === 'evergreen') el('path', { class: 'sr-spark', d: SPARK, transform: `scale(${(rc * 3.3).toFixed(2)})` }, ng);
  return R;
};

/** 石面斑晶的纹样张数。纹样在屏幕像素空间里（石画在 scale(1/k) 的子组内），缩放时颗粒不变粗。 */
const GRAIN_N = 4;
const grainTile = (defs: Element, i: number) => {
  const T = 30;
  const pt = el('pattern', {
    id: `sand-grain-${i}`, patternUnits: 'userSpaceOnUse', width: T, height: T,
    patternTransform: `rotate(${i * 67}) translate(${i * 11} ${i * 7})`,
  }, defs);
  // 暗斑（黑云母、角闪石）细而多，亮斑（长石）稀而略大——比例照着真的白花岗岩调
  for (let j = 0; j < 72; j++) {
    const r = .16 + seeded(`gd${i}r${j}`) * .3;
    el('circle', {
      cx: (seeded(`gd${i}x${j}`) * T).toFixed(2), cy: (seeded(`gd${i}y${j}`) * T).toFixed(2), r: r.toFixed(2),
      class: 'gr-d', 'fill-opacity': (.25 + seeded(`gd${i}o${j}`) * .35).toFixed(2),
    }, pt);
  }
  for (let j = 0; j < 16; j++) {
    el('ellipse', {
      cx: (seeded(`gl${i}x${j}`) * T).toFixed(2), cy: (seeded(`gl${i}y${j}`) * T).toFixed(2),
      rx: (.35 + seeded(`gl${i}r${j}`) * .4).toFixed(2), ry: (.25 + seeded(`gl${i}q${j}`) * .25).toFixed(2),
      class: 'gr-l', 'fill-opacity': (.4 + seeded(`gl${i}o${j}`) * .35).toFixed(2),
    }, pt);
  }
};

/** 共享渐变：每个分类一套石色（白練高光 → 本色 → 鈍色背光）与星晕。 */
export const buildDefs = (defs: Element, cats: CatMeta[]) => {
  defs.replaceChildren();
  for (const C of cats) {
    // stop-color 只能走 CSS：SVG 表现属性里 color-mix() 不解析，会静默变黑
    const lg = el('linearGradient', { id: `sand-st-${C.gid}`, x1: 0, y1: 0, x2: 1, y2: 1, style: `--c:${C.color}` }, defs);
    el('stop', { class: 'sg0', offset: 0 }, lg);
    el('stop', { class: 'sg1', offset: .52 }, lg);
    el('stop', { class: 'sg2', offset: 1 }, lg);
    const rg = el('radialGradient', { id: `sand-halo-${C.gid}` }, defs);
    ([[0, .42], [.35, .12], [1, 0]] as const).forEach(([o, a]) => el('stop', { offset: o, 'stop-color': C.color, 'stop-opacity': a }, rg));
  }
  const grad = (id: string, stops: [number, number][], color: string) => {
    const g = el('radialGradient', { id }, defs);
    stops.forEach(([o, a]) => el('stop', { offset: o, 'stop-color': color, 'stop-opacity': a }, g));
  };
  for (let i = 0; i < GRAIN_N; i++) grainTile(defs, i);
  grad('sand-glow', [[0, .62], [1, 0]], '#fff');
  grad('sand-shadow', [[0, .22], [.6, .1], [1, 0]], '#1E293B');
  grad('sand-lantern-glow', [[0, .55], [.4, .16], [1, 0]], '#FDBA74');
  const fade = el('radialGradient', { id: 'sand-fade' }, defs);
  el('stop', { offset: .55, 'stop-color': '#fff' }, fade);
  el('stop', { offset: 1, 'stop-color': '#000' }, fade);
};

export class SandScene {
  private svg: SVGSVGElement;
  private sky: HTMLCanvasElement | null;
  private cb: Callbacks;
  private reduce: boolean;
  private G!: {
    defs: SVGDefsElement; mask: SVGMaskElement; maskBase: SVGRectElement; maskHole: SVGGElement;
    cam: SVGGElement; rake: SVGPathElement; pool: SVGGElement; ringsOld: SVGGElement; rings: SVGGElement; topic: SVGGElement;
    rel: SVGGElement; spokes: SVGGElement; lanterns: SVGGElement; nodes: SVGGElement; labels: SVGGElement;
  };
  private g: Garden | null = null;
  private cats = new Map<string, CatMeta>();
  private nodes = new Map<string, NodeRef>();
  private paths = new Map<string, PathRef>();
  private bridges: { el: SVGGElement; a: Stone; b: Stone; c: { x: number; y: number } }[] = [];
  /** 每条小径入口的灯笼位置（单篇合集也有灯笼：它是一条刚开头的路）。 */
  private lanternAt = new Map<string, { x: number; y: number }>();
  private tf = new Map<string, number>();
  private symEls: SVGGElement[] = [];
  private lanternSyms: SVGGElement[] = [];
  /** 注记按 key 常驻：同一条注记在重排时复用同一个节点，只有真正新出现 / 退场的才淡入淡出。 */
  private lab = new Map<string, { g: SVGGElement; sym: SVGGElement; inner: SVGGElement; sig: string }>();
  private leaving = new Set<SVGGElement>();
  /** 注记的「记忆」：上次落在哪个候选位（星名 / 小径名）或哪个世界坐标（庭名）。还站得住就不挪。 */
  private place = new Map<string, number | { x: number; y: number; v: boolean }>();
  private zoomT: { k: number; px: number; py: number } | null = null;
  private zoomRaf = 0;
  /** 字形倍率：篇数少、石与石隔得开时，石与星整体放大，免得一整屏只剩几粒芝麻。 */
  private gs = 1;
  private view = { k: 1, x: 0, y: 0 };
  private fitK = 1;
  private tierK = 0;
  private cutoff = Infinity;
  private f: FocusState = { selId: null, hovId: null, hotCat: null, hotSer: null, topic: null, query: '' };
  private flags: Flags = { railOn: true, cardOn: false, timeOn: false };
  private W = 0; private H = 0; private rect = { left: 0, top: 0 };
  private flyId = 0;
  private timers = new Set<number>();
  private settleT = 0; private heavyT = 0; private ringT = 0; private lastHeavy = 0; private themeT = 0;
  private ptrs = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; vx: number; vy: number } | null = null;
  private pinch: { d: number; k: number; cx: number; cy: number; vx: number; vy: number } | null = null;
  private moved = 0;
  private entering = false;
  private enterUntil = 0;
  /** 进场时间线的零点：数据中途换版时，新节点按「已经过去多久」接着演（负的 animation-delay）。 */
  private enterT0 = 0;
  private enterEndT = 0;
  private enterTarget: { k: number; x: number; y: number } | null = null;
  private ctx = document.createElement('canvas').getContext('2d');
  private themeObs: MutationObserver;
  private night: boolean;
  private off: (() => void)[] = [];

  constructor(svg: SVGSVGElement, sky: HTMLCanvasElement | null, cb: Callbacks, reduce: boolean) {
    this.svg = svg; this.sky = sky; this.cb = cb; this.reduce = reduce;
    this.skeleton();
    this.measure();
    this.night = document.documentElement.classList.contains('dark');
    this.themeObs = new MutationObserver(() => {
      const n = document.documentElement.classList.contains('dark');
      if (n !== this.night) { this.night = n; this.themeSwap(); }
    });
    this.themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    this.bindInput();
  }

  destroy() {
    this.flyId++;
    this.stopGlide();
    this.timers.forEach(t => clearTimeout(t));
    clearTimeout(this.settleT); clearTimeout(this.heavyT); clearTimeout(this.themeT); clearTimeout(this.ringT);
    this.themeObs.disconnect();
    this.off.forEach(f => f());
  }

  private later(fn: () => void, ms: number) {
    const t = window.setTimeout(() => { this.timers.delete(t); fn(); }, ms);
    this.timers.add(t);
    return t;
  }

  private skeleton() {
    const svg = this.svg;
    svg.replaceChildren();
    const defs = el('defs', {}, svg);
    const mask = el('mask', { id: 'sand-rake-mask', maskUnits: 'userSpaceOnUse' }, svg);
    const maskBase = el('rect', { fill: 'url(#sand-fade)' }, mask);
    const maskHole = el('g', {}, mask);
    const cam = el('g', {}, svg);
    this.G = {
      defs, mask, maskBase, maskHole, cam,
      rake: el('path', { class: 'rk', mask: 'url(#sand-rake-mask)' }, cam),
      pool: el('g', {}, cam),
      ringsOld: el('g', { class: 'rings-old' }, cam),
      rings: el('g', { class: 'rings' }, cam),
      topic: el('g', {}, cam),
      rel: el('g', { class: 'relg' }, cam),
      spokes: el('g', {}, cam),
      lanterns: el('g', { class: 'lanterng' }, cam),
      nodes: el('g', {}, cam),
      labels: el('g', { class: 'labels' }, cam),
    };
  }

  measure() {
    const r = this.svg.getBoundingClientRect();
    this.W = r.width || window.innerWidth; this.H = r.height || window.innerHeight;
    this.rect = { left: r.left, top: r.top };
  }

  // ══ 构建 ════════════════════════════════════════════════════════════════
  // 进场编排（仅 entrance=true 且不减弱动效）：
  //   相机从稍远处「俯身」落定（1300ms 减速）→ 石按种下先后逐块落定、落地时砂面荡一圈 →
  //   每片庭的砂纹像被耙出来一样一圈圈画出 → 小径与灯笼 → 注记淡入。
  setData(g: Garden, cats: Map<string, CatMeta>, entrance: boolean) {
    this.flyId++;
    this.g = g; this.cats = cats; this.tf = tagFrequency(g);
    buildDefs(this.G.defs, [...cats.values()]);
    const G = this.G;
    for (const k of ['rel', 'nodes', 'lanterns', 'spokes', 'topic'] as const) G[k].replaceChildren();
    this.nodes.clear(); this.paths.clear(); this.bridges = [];

    g.series.filter(s => s.stars.length > 1).forEach(s => {
      const pg = el('g', { class: 'path', 'data-series': s.name }, G.rel);
      // 河床：平时不可见，悬停 / 选中这条小径时，溪底泛一层极淡的青
      const bed = el('path', { class: 'bed' }, pg);
      const chain = el('path', { class: 'chain' }, pg);
      const hit = el('path', { class: 'hitline' }, pg);
      el('title', {}, hit).textContent = `小径 · ${s.name}：同一合集，按写作先后`;
      this.paths.set(s.name, { el: pg, bed, chain, hit });
    });
    g.stars.forEach(s => s.p.links.forEach(tid => {
      const t = g.byId.get(tid);
      if (!t) return;
      const bg = el('g', { class: 'bridge' }, G.rel);
      const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2, dx = t.x - s.x, dy = t.y - s.y;
      const bend = (seeded(s.p.id + tid) > .5 ? 1 : -1) * .22;
      const c = { x: mx - dy * bend, y: my + dx * bend };
      const d = `M${s.x} ${s.y}Q${c.x} ${c.y} ${t.x} ${t.y}`;
      for (const c of ['br-a', 'br-b', 'br-n']) el('path', { class: c, d }, bg);
      el('title', {}, el('path', { class: 'hitline', d }, bg)).textContent = `桥 · 《${s.p.title}》引用了《${t.p.title}》`;
      this.bridges.push({ el: bg, a: s, b: t, c });
    }));

    // 数据会来两版：本地缓存先到、云端几百毫秒后覆盖（实时订阅也会再来）。
    // 若第二版恰好落在进场途中，不能撤掉 entering 让石「啪」地全部现身——
    // 沿用同一条时间线，按已过去的时长给新节点负的延迟，看上去就是一场没被打断的进场。
    const t = performance.now();
    const cont = this.entering && !this.reduce;
    const doEnter = cont || (entrance && !this.reduce);
    if (doEnter && !cont) this.enterT0 = t;
    const elapsed = doEnter ? t - this.enterT0 : 0;

    // 石按种下先后逐块落定：间隔拉开到能被看出「一块、又一块」，但总长封顶 1.1s，篇数多时自动变密
    this.measure();
    const target = this.fitView();
    this.gs = target ? this.glyphScale(target.k, g.stars.length) : 1;

    const order = [...g.stars].sort((a, b) => a.p.createdAt - b.p.createdAt);
    const stepMs = Math.min(110, 1100 / Math.max(1, order.length));
    const now = Date.now();
    order.forEach((s, i) => {
      const C = cats.get(s.p.cat)!;
      const ed = 360 + i * stepMs - elapsed;
      const ng = el('g', {
        class: 'node', transform: `translate(${s.x} ${s.y})`, 'data-id': s.p.id,
        style: `--c:${C.color};--ed:${ed.toFixed(0)}ms`,
      }, G.nodes);
      const sym = el('g', {}, ng);
      const R = drawGlyph(sym, s.p, s.mag, C.gid, s.rot, !this.reduce);
      el('circle', { class: 'sel-ring', r: R + 5 / this.gs, pathLength: 1 }, sym);
      // 近三周照料过：选中时才荡一圈水纹（不再有「待照料」模式）
      if (now - s.p.updatedAt < 21 * DAY) {
        const fr = el('circle', { class: 'fresh', r: R + 1 }, sym);
        fr.style.animationDelay = `${-seeded('f' + s.p.id) * 5}s`;
      }
      this.nodes.set(s.p.id, { el: ng, sym, R: R * this.gs, r0: R, ed });
    });
    this.symEls = [...this.nodes.values()].map(n => n.sym);

    this.entering = doEnter;
    this.svg.classList.toggle('entering', doEnter);
    if (doEnter) {
      const orderEnd = 360 + order.length * stepMs;
      // 注记必须等相机落定再出：它们按落定后的倍率择位，早出来会先错位再跳。
      // 续演时不改：labels / relg 这几个组没被重建，它们身上的动画还在原来的时间线上跑
      if (!cont) this.svg.style.setProperty('--ld', `${Math.max(orderEnd + 380, 1500).toFixed(0)}ms`);
      if (target && !cont) {
        // 俯身：从 0.8 倍、略低处起，像人走进庭院时目光由远及近地落到石上
        const cx = this.W / 2, cy = this.H * .55, k0 = target.k * .8;
        this.view = { k: k0, x: cx - (cx - target.x) * .8, y: cy - (cy - target.y) * .8 + 26 };
        this.write();
        this.fly(target, true, 1300);
        this.enterUntil = t + 1300;
      } else if (target) {
        // 续演：取景没变就别碰正在「俯身」的相机；变了（多了几块石）就用剩下的时长改道
        const e = this.enterTarget, left = this.enterUntil - t;
        const same = !!e && Math.abs(e.k - target.k) < 1e-3 && Math.hypot(e.x - target.x, e.y - target.y) < .5;
        if (!same) {
          if (left > 60) this.fly(target, true, Math.max(420, left));
          else { this.view = target; this.write(); }
        }
      }
      this.enterTarget = target;
      clearTimeout(this.enterEndT);
      this.timers.delete(this.enterEndT);
      this.enterEndT = this.later(() => {
        this.entering = false;
        this.svg.classList.remove('entering');
        G.rings.querySelectorAll('[pathLength]').forEach(p => p.removeAttribute('pathLength'));
        this.labels();
      }, Math.max(orderEnd + 1900, 2400) - elapsed);
    } else if (target) {
      this.view = target; this.write();
    }
    this.sand();
    this.drawPaths();
    this.labels();
    this.focus();
    this.drawSky();
  }

  setFlags(fl: Flags, refit: boolean) {
    const changed = fl.railOn !== this.flags.railOn || fl.cardOn !== this.flags.cardOn || fl.timeOn !== this.flags.timeOn;
    this.flags = fl;
    if (changed && refit) this.fit(true, 480);
    else if (changed) this.labels();
  }

  setFocus(next: Partial<FocusState>) {
    const prev = this.f;
    const f = { ...prev, ...next };
    if (f.selId === prev.selId && f.hovId === prev.hovId && f.hotCat === prev.hotCat
      && f.hotSer === prev.hotSer && f.topic === prev.topic && f.query === prev.query) return;
    this.f = f;
    if (f.topic !== prev.topic) this.showTopic();
    this.focus();
    if (!this.entering) this.labels();
  }

  // ══ 相机 ═══════════════════════════════════════════════════════════════
  private write() {
    const v = this.view;
    this.G.cam.setAttribute('transform', `translate(${v.x.toFixed(2)} ${v.y.toFixed(2)}) scale(${v.k.toFixed(5)})`);
    const inv = `scale(${(1 / v.k).toFixed(5)})`, gly = `scale(${(this.gs / v.k).toFixed(5)})`;
    const lan = `scale(${((1 + (this.gs - 1) * .6) / v.k).toFixed(5)})`;
    for (const e of this.symEls) e.setAttribute('transform', gly);
    for (const L of this.lab.values()) L.sym.setAttribute('transform', inv);
    for (const e of this.leaving) e.setAttribute('transform', inv);
    for (const e of this.lanternSyms) e.setAttribute('transform', lan);
  }

  private avail() {
    const { W, H, flags } = this;
    const top = 170, bottom = 116 + (flags.timeOn ? 84 : 0);
    const left = flags.railOn || flags.cardOn ? 32 + 304 + 28 : 40;
    const right = W >= 1400 && flags.cardOn ? 32 + 344 + 24 : 40;
    return { x: left, y: top, w: Math.max(120, W - left - right), h: Math.max(120, H - top - bottom) };
  }

  private visible() { return this.g ? this.g.stars.filter(s => s.p.createdAt <= this.cutoff) : []; }

  private bbox(list: { x: number; y: number }[]) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of list) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); }
    return { x0, y0, x1, y1 };
  }

  private fitView() {
    const vis = this.visible();
    if (!vis.length) return null;
    const b = this.bbox(vis), A = this.avail(), pad = 72;
    const bw = Math.max(b.x1 - b.x0, 180), bh = Math.max(b.y1 - b.y0, 120);
    const k = clamp(Math.min((A.w - pad * 2) / bw, (A.h - pad * 2) / bh), .25, 2.2);
    this.fitK = k;
    // 先按包围盒居中（视觉中心比几何中心高 2%），再把「重心」往画面光学中心拉一半：
    // 石有大有小、庭有疏有密，只按外框居中时，大石扎堆的一角会把整幅画压歪。
    // 质量取石面积；拉动受限于外框仍留 40px 边，所以只是校正，不会把哪片庭推出画面。
    let x = A.x + A.w / 2 - (b.x0 + b.x1) / 2 * k, y = A.y + A.h * .48 - (b.y0 + b.y1) / 2 * k;
    let M = 0, mx = 0, my = 0;
    for (const s of vis) { const w = RS[s.mag - 1] ** 2; M += w; mx += s.x * w; my += s.y * w; }
    mx /= M; my /= M;
    const tx = A.x + A.w / 2 - mx * k, ty = A.y + A.h * .46 - my * k, m = 40;
    const cl = (v: number, lo: number, hi: number) => lo > hi ? (lo + hi) / 2 : clamp(v, lo, hi);
    x = cl(x + (tx - x) * .5, A.x + m - b.x0 * k, A.x + A.w - m - b.x1 * k);
    y = cl(y + (ty - y) * .5, A.y + m - b.y0 * k, A.y + A.h - m - b.y1 * k);
    return { k, x, y };
  }

  /** 稀疏时放大、密时回到原尺寸；上限还受最小石距约束，放大后相邻两块最大的石也留得出缝。 */
  private glyphScale(k: number, n: number) {
    const cap = n <= 16 ? 1.4 : n >= 64 ? 1 : 1.4 - .4 * (n - 16) / 48;
    return clamp(MIN_SEP * k / 38, 1, cap);
  }

  fit(anim = true, D = 640) {
    this.measure();
    const t = this.fitView();
    if (t) this.fly(t, anim, D);
  }

  private fly(to: { k: number; x: number; y: number }, anim = true, D = 640, ease = EASE_OUT) {
    this.stopGlide();
    const from = { ...this.view }, id = ++this.flyId;
    if (!anim || this.reduce) { this.view = to; this.write(); this.settle(); return; }
    const t0 = performance.now();
    const tick = (t: number) => {
      if (id !== this.flyId) return;
      const e = ease(Math.min(1, (t - t0) / D));
      this.view = { k: from.k + (to.k - from.k) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
      this.write();
      if (e < 1) requestAnimationFrame(tick); else this.settle();
    };
    requestAnimationFrame(tick);
  }

  private settle() {
    clearTimeout(this.settleT);
    this.settleT = window.setTimeout(() => {
      const tier = Math.round(clamp(Math.log2(this.view.k / this.fitK) / .8, 0, 3));
      if (tier !== this.tierK) { this.tierK = tier; this.sand(true); }
      this.drawPaths(); this.labels();
    }, 110);
  }

  flyTo(ids: string[]) {
    if (!this.g) return;
    const list = ids.map(id => this.g!.byId.get(id)).filter((s): s is Stone => !!s && s.p.createdAt <= this.cutoff);
    if (!list.length) return;
    const b = this.bbox(list), A = this.avail();
    const k = clamp(Math.min((A.w - 200) / Math.max(b.x1 - b.x0, 60), (A.h - 200) / Math.max(b.y1 - b.y0, 60)), this.fitK, this.fitK * 3.2);
    this.fly({ k, x: A.x + A.w / 2 - (b.x0 + b.x1) / 2 * k, y: A.y + A.h / 2 - (b.y0 + b.y1) / 2 * k });
  }

  /** 滚轮缩放的一帧：返回 true 表示还没到，继续下一帧。 */
  private glide(dt: number) {
    const T = this.zoomT;
    if (!T) return false;
    const e = 1 - Math.exp(-Math.min(dt, 64) / 90), w = this.toWorld(T.px, T.py);
    let k = this.view.k * Math.pow(T.k / this.view.k, e);
    const done = Math.abs(Math.log(T.k / k)) < .002;
    if (done) k = T.k;
    this.view = { k, x: T.px - w.x * k, y: T.py - w.y * k };
    this.write();
    if (done) { this.zoomT = null; this.settle(); }
    return !done;
  }

  private stopGlide() { this.zoomT = null; cancelAnimationFrame(this.zoomRaf); this.zoomRaf = 0; }

  private toWorld(cx: number, cy: number) { return { x: (cx - this.view.x) / this.view.k, y: (cy - this.view.y) / this.view.k }; }
  private toScreen(s: { x: number; y: number }) { return { x: s.x * this.view.k + this.view.x, y: s.y * this.view.k + this.view.y }; }

  // ══ 选中：两圈涟漪 → 选中环画出 → 相机让位（星卡在 React 里） ═══════════════════
  select(id: string | null, anim = true) {
    this.setFocus({ selId: id });
    if (!id || !this.g) return;
    // 深链接进场：相机还在「俯身」，等它落定再荡涟漪、再让位，不然两段飞行互相打断
    const wait = this.enterUntil - performance.now();
    if (wait > 0) { this.later(() => { if (this.f.selId === id) this.select(id, anim); }, wait + 80); return; }
    const s = this.g.byId.get(id), n = this.nodes.get(id);
    if (!s || !n) return;
    if (anim && !this.reduce) for (const c of ['bloom', 'bloom b2']) {
      const r = el('circle', { class: c, r: n.r0 + 2 }, n.sym);
      this.later(() => r.remove(), 1900);
    }
    const p = this.toScreen(s), A = this.avail();
    const safeR = this.W - (this.W >= 1400 ? 32 + 344 + 48 : 40);
    if (p.x > safeR || p.x < A.x + 20 || p.y > this.H - 140 || p.y < A.y + 10)
      this.fly({ k: this.view.k, x: this.view.x + ((A.x + safeR) / 2 - p.x), y: this.view.y + (A.y + A.h / 2 - p.y) }, anim);
  }

  // ══ 时光：截止时刻之后种下的石先隐去；拖动时新生的石「砰」地落下 ═══════════════
  setCut(c: number, live = false) {
    const prev = this.cutoff;
    this.cutoff = c;
    if (!this.g) return;
    this.g.stars.forEach(s => {
      const was = s.p.createdAt <= prev, now = s.p.createdAt <= c, n = this.nodes.get(s.p.id)!;
      if (!was && now && live && !this.reduce) {
        n.el.classList.remove('born'); void n.el.getBBox(); n.el.classList.add('born');
        const r = el('circle', { class: 'bornring', r: n.r0 + 2 }, n.sym);
        this.later(() => { r.remove(); n.el.classList.remove('born'); }, 950);
      }
    });
    this.focus();
    const heavy = () => { this.lastHeavy = performance.now(); this.sand(); this.drawPaths(); this.labels(); };
    clearTimeout(this.heavyT);
    if (!live || performance.now() - this.lastHeavy > 140) heavy();
    else this.heavyT = window.setTimeout(heavy, 140);
  }

  // ══ 砂纹：每片庭各算一套；最外一圈同时是直纹的蒙版洞与夜间水面 ═══════════════════
  private sand(fade = false) {
    const G = this.G, g = this.g;
    // 缩放换档时砂纹要按新倍率重耙：旧的一层留着淡出、新的一层淡入，而不是「啪」地换掉一整片线
    if (fade && !this.entering && !this.reduce && G.rings.childElementCount) {
      G.ringsOld.replaceChildren(...G.rings.childNodes);
      G.ringsOld.classList.remove('go'); void G.ringsOld.getBBox(); G.ringsOld.classList.add('go');
      G.rings.classList.remove('xin'); void G.rings.getBBox(); G.rings.classList.add('xin');
      clearTimeout(this.ringT);
      this.ringT = window.setTimeout(() => G.ringsOld.replaceChildren(), 420);
    }
    // 进场途中重算（数据换版、缩放换档）也接着耙：延迟扣掉已过去的时长，不从头再画一遍
    const rakeIn = this.entering, off = rakeIn ? performance.now() - this.enterT0 : 0;
    const kT = this.fitK * [1, 1.8, 3.2, 5.6][this.tierK];
    for (const x of [G.rings, G.pool, G.maskHole]) x.replaceChildren();
    const vis = this.visible();
    if (!g || !vis.length) { G.rake.setAttribute('d', ''); return; }
    const dp = kT > 2 ? 2 : 1;
    // 整座庭一张距离场：石是圆，合集相邻两章之间是一段线段（枯流れ的河床）。
    // 河床 r=-12：河心的场值恒大于最内一圈的 9（留 3px 余量，免得在石边鼓出一个尖），所以沿河只耙出外两圈——两道岸夹一条窄溪，
    // 到了石边又自然并回绕石的三圈里。不另画任何「连接线」，关系就长在砂纹里。
    const segs: Seg[] = [];
    g.series.forEach(se => {
      const pts = se.stars.filter(q => q.p.createdAt <= this.cutoff);
      for (let i = 1; i < pts.length; i++) segs.push({ x1: pts[i - 1].x, y1: pts[i - 1].y, x2: pts[i].x, y2: pts[i].y, r: -12 });
    });
    const F = sandField(vis.map(s => ({ x: s.x, y: s.y, r: RS[s.mag - 1] * this.gs })), kT, undefined, undefined, segs)!;
    const levels = LV.map(l => iso(F, l / kT).filter(p => p.length > 3));
    // 进场时一段段耙出来：从左往右，像耙子走过砂面；内圈先、外圈后
    let lo = Infinity, hi = -Infinity;
    const cxOf = (p: [number, number][]) => p.reduce((a, q) => a + q[0], 0) / p.length;
    levels.forEach(ls => ls.forEach(p => { const c = cxOf(p); lo = Math.min(lo, c); hi = Math.max(hi, c); }));
    levels.forEach((ls, i) => ls.forEach(p => el('path', {
      class: 'rg' + (i === 0 ? ' in' : ''), d: smooth(p, dp),
      style: `--rd:${(520 + ((cxOf(p) - lo) / (hi - lo || 1)) * 520 + i * 140 - off).toFixed(0)}ms`,
      pathLength: rakeIn ? 1 : null,
    }, G.rings)));
    const outer = levels[2].map(p => smooth(p, dp)).join('');
    el('path', { class: 'poolfill', d: outer, 'fill-rule': 'evenodd' }, G.pool);
    el('path', { d: outer, fill: '#000', 'fill-rule': 'evenodd' }, G.maskHole);
    // 远处的直纹：一张耙过的白砂地，绕石处由蒙版挖空，边缘径向渐隐
    const b = this.bbox(vis), padW = 240 / kT;
    const x0 = b.x0 - padW, x1 = b.x1 + padW, y0 = b.y0 - padW * .8, y1 = b.y1 + padW * .8, gap = 7 / kT;
    let d = '';
    for (let y = y0; y <= y1; y += gap) d += `M${x0.toFixed(1)} ${y.toFixed(1)}H${x1.toFixed(1)}`;
    G.rake.setAttribute('d', d);
    for (const [k, v] of Object.entries({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 })) {
      G.maskBase.setAttribute(k, String(v)); G.mask.setAttribute(k, String(v));
    }
    if (this.f.topic) this.showTopic();
  }

  // ══ 小径：昼是砂里的枯流れ（砂纹本身，在 sand() 里）；夜是星座连线。入口一盏石灯笼 ══
  private drawPaths() {
    const g = this.g;
    this.lanternSyms = [];
    this.G.lanterns.replaceChildren();
    this.lanternAt.clear();
    if (!g) return;
    const k = this.view.k;
    g.series.forEach(s => {
      const pts = s.stars.filter(q => q.p.createdAt <= this.cutoff);
      const ref = this.paths.get(s.name);
      if (ref) {
        let chain = '';
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          const ra = this.nodes.get(a.p.id)!.R, rb = this.nodes.get(b.p.id)!.R;
          const Lw = Math.hypot(b.x - a.x, b.y - a.y) || 1, Ls = Lw * k, ux = (b.x - a.x) / Lw, uy = (b.y - a.y) / Lw;
          const s0 = ra + 7, s1 = Ls - rb - 7;
          if (s1 - s0 < 4) continue;
          chain += `M${(a.x + ux * s0 / k).toFixed(1)} ${(a.y + uy * s0 / k).toFixed(1)}L${(a.x + ux * s1 / k).toFixed(1)} ${(a.y + uy * s1 / k).toFixed(1)}`;
        }
        const line = pts.length > 1 ? 'M' + pts.map(q => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join('L') : '';
        ref.chain.setAttribute('d', chain);
        ref.bed.setAttribute('d', line);
        ref.hit.setAttribute('d', line);
      }
      if (!pts.length) return;
      // 灯笼立在第一章之前，沿小径的反方向退一步
      const h0 = pts[0], h1 = pts[1], dx = h1 ? h1.x - h0.x : 1, dy = h1 ? h1.y - h0.y : 0, dl = Math.hypot(dx, dy) || 1;
      const gp = (this.nodes.get(h0.p.id)!.R + 15) / k, lx = h0.x - dx / dl * gp, ly = h0.y - dy / dl * gp + 6 / k;
      const lg = el('g', { transform: `translate(${lx.toFixed(2)} ${ly.toFixed(2)})`, 'data-series': s.name }, this.G.lanterns);
      const sym = el('g', {}, lg);
      this.lanternSyms.push(sym);
      drawLantern(sym);
      this.lanternAt.set(s.name, { x: lx, y: ly });
    });
    this.write();
    this.focus();
  }

  // ══ 注记（Imhof：面状名跟随区域、点状名贴点右上、线状名随线）════════════════════
  // 庭名竖排（像庭园入口的木札），星名横排——方向本身就是层级。全局不重叠。
  private tw(t: string, font: string) {
    if (!this.ctx) return t.length * 13;
    this.ctx.font = font;
    return this.ctx.measureText(t).width;
  }

  labels() {
    const G = this.G, g = this.g, used = new Set<string>();
    // 收尾：这一轮没再出现的注记淡出后再摘掉；淡出期间仍跟着相机缩放
    const sweep = () => {
      for (const [key, L] of this.lab) {
        if (used.has(key)) continue;
        this.lab.delete(key);
        this.leaving.add(L.sym);
        L.g.classList.add('lab-out');
        this.later(() => { L.g.remove(); this.leaving.delete(L.sym); }, 240);
      }
    };
    if (!g) { sweep(); return; }
    const vis = this.visible();
    if (!vis.length) { sweep(); return; }
    const { W, H, flags } = this, f = this.f, taken: Box[] = [];
    const discs: Box[] = vis.map(s => {
      const p = this.toScreen(s), r = this.nodes.get(s.p.id)!.R + 3;
      return { x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 };
    });
    const lk = 1 + (this.gs - 1) * .6;
    this.lanternAt.forEach(at => {
      const p = this.toScreen(at);
      discs.push({ x: p.x - 6 * lk, y: p.y - 16 * lk, w: 12 * lk, h: 17 * lk });
    });
    // 夜里右上角挂着月亮：月与它的注记也算障碍，庭名、星名都绕开
    const mw = this.night ? this.svg.parentElement?.querySelector('.moon-wrap') : null;
    if (mw) {
      const r = mw.getBoundingClientRect();
      discs.push({ x: r.left - this.rect.left, y: r.top - this.rect.top, w: r.width, h: r.height + 8 });
    }
    // 小径与桥也算障碍：字压在线上，读起来像被划掉了。先避线找位，实在放不下才退回只避石
    const lines: Box[] = [];
    const along = (pts: { x: number; y: number }[]) => {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.y - a.y);
        for (let d = 0; d <= L; d += 8) lines.push({ x: a.x + (b.x - a.x) * d / L - 3, y: a.y + (b.y - a.y) * d / L - 3, w: 6, h: 6 });
      }
    };
    g.series.forEach(s => {
      const pts = s.stars.filter(q => q.p.createdAt <= this.cutoff).map(q => this.toScreen(q));
      if (pts.length > 1) along(pts);
    });
    this.bridges.forEach(({ a, b, c }) => {
      if (a.p.createdAt > this.cutoff || b.p.createdAt > this.cutoff) return;
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16, u = 1 - t;
        pts.push(this.toScreen({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y }));
      }
      along(pts);
    });
    const over = (b: Box, list: Box[], pad: number) => list.some(o =>
      b.x < o.x + o.w + pad && o.x < b.x + b.w + pad && b.y < o.y + o.h + pad && o.y < b.y + b.h + pad);
    const hit = (b: Box, pad = 3, strict = false) => over(b, discs, pad) || over(b, taken, pad) || (strict && over(b, lines, 1));
    // 注记只能落在地图的可用区里：不压页头、不钻进庭记 / 星卡 / Dock 底下
    const A = this.avail(), cardRight = W >= 1400 && flags.cardOn;
    const left = A.x - 20, right = W - (cardRight ? 32 + 344 + 16 : 24), ceil = 164;
    const floor = H - (flags.timeOn ? 196 : 108);
    const onScreen = (b: Box) => b.x > left && b.y > ceil && b.x + b.w < right && b.y + b.h < floor;
    // 同 key、同内容、同偏移：原节点只改锚点，不重建、不闪；内容或偏移变了才换新节点淡入
    const put = (key: string, sig: string, wx: number, wy: number, dx: number, dy: number, kids: () => Element[]) => {
      used.add(key);
      let L = this.lab.get(key);
      const full = `${sig}|${dx.toFixed(1)},${dy.toFixed(1)}`;
      if (L && L.sig !== full) {
        const old = L;
        this.leaving.add(old.sym); old.g.classList.add('lab-out');
        this.later(() => { old.g.remove(); this.leaving.delete(old.sym); }, 240);
        L = undefined;
      }
      if (!L) {
        const pg = el('g', { class: 'lab' + (this.entering ? '' : ' lab-in') }, G.labels);
        const sym = el('g', { transform: `scale(${1 / this.view.k})` }, pg);
        const inner = el('g', { transform: `translate(${dx} ${dy})` }, sym);
        inner.append(...kids());
        L = { g: pg, sym, inner, sig: full };
        this.lab.set(key, L);
      }
      L.g.setAttribute('transform', `translate(${wx} ${wy})`);
      return L.inner;
    };
    const txt = (t: string, cls: string, x: number, y: number, anchor = 'start') => {
      const e = el('text', { class: 'lbl ' + cls, x, y, 'text-anchor': anchor });
      e.textContent = t;
      return e;
    };
    const focusSet = new Set<string>(), fid = f.selId ?? f.hovId;
    if (fid) {
      const nb = neighborsOf(g, fid, this.cutoff, this.tf);
      focusSet.add(fid);
      nb.path.forEach(q => focusSet.add(q.p.id));
      nb.bridges.forEach(b => focusSet.add(b.s.p.id));
      if (f.selId) nb.kin.forEach(kk => focusSet.add(kk.s.p.id));
    }
    const med = (a: number[]) => { const q = [...a].sort((x, y) => x - y); return q[Math.floor(q.length / 2)]; };

    // ① 庭名：目录的一级标题，常驻。竖排（木札）：方块 + 竖排中文 + 侧排英文 + 篇数
    [...g.islands].sort((a, b) => b.stars.length - a.stars.length).forEach(isl => {
      const st = isl.stars.filter(s => s.p.createdAt <= this.cutoff);
      if (!st.length) return;
      const pts = st.map(s => this.toScreen(s)), cx = med(pts.map(p => p.x)), cy = med(pts.map(p => p.y));
      const rr = Math.max(16, med(pts.map(p => Math.hypot(p.x - cx, p.y - cy))) * 1.1);
      const bx = cx - rr, by = cy - rr, ex = cx + rr, ey = cy + rr;
      const C = this.cats.get(isl.cat)!, n = String(st.length);
      const zhW = this.tw(C.zh, `16px ${FZH}`) + C.zh.length * 2.24;
      const V = { w: 30, h: 16 + C.zh.length * 20.2 + 16 };
      const Hh = { w: 14 + zhW + 10 + this.tw(`${C.en} · ${n}`.toUpperCase(), `9.5px ${FMO}`) + 20, h: 20 };
      // 名字得离自己的庭最近，不然读起来像在给隔壁那片庭命名
      const own = (b: Box) => {
        let best: Stone | null = null, bd = Infinity;
        const mx = b.x + b.w / 2, my = b.y + b.h / 2;
        for (const q of vis) {
          const p = this.toScreen(q);
          const d = Math.hypot(Math.max(Math.abs(p.x - mx) - b.w / 2, 0), Math.max(Math.abs(p.y - my) - b.h / 2, 0));
          if (d < bd) { bd = d; best = q; }
        }
        return !!best && best.isl === isl;
      };
      type Try = { c: [number, number]; v: boolean; w: number; h: number };
      const tries: Try[] = [];
      {
        const { w, h } = V;
        ([[bx - w - 10, by - 4], [bx - w - 10, cy - h / 2], [bx - w - 6, by - h * .45], [ex + 10, by - 4], [ex + 10, cy - h / 2],
          [cx - w / 2, by - h - 10], [cx - w / 2, ey + 12]] as [number, number][])
          .forEach(c => tries.push({ c, v: true, w, h }));
      }
      {
        const { w, h } = Hh;
        ([[bx - 8, by - 34], [cx - w / 2, by - 34], [ex - w + 8, by - 34], [bx - w - 16, cy - 10], [ex + 16, cy - 10],
          [bx - 8, ey + 22], [cx - w / 2, ey + 22]] as [number, number][])
          .forEach(c => tries.push({ c, v: false, w, h }));
      }
      const box = (t: Try): Box => ({ x: t.c[0], y: t.c[1], w: t.w, h: t.h });
      // 打分而不是先到先得：离庭心越近越好；木札立在庭的入口——左、上优先，压在庭下方像掉下去了，重罚；
      // 竖排是庭名的本色，横排只在竖排放不下时替补
      const score = (t: Try) => {
        const b = box(t), mx = b.x + b.w / 2, my = b.y + b.h / 2;
        return Math.hypot(mx - cx, my - cy) / rr + (my > ey ? 1.4 : my > cy + rr * .35 ? .5 : 0)
          + (mx > cx + rr * .5 ? .2 : 0) + (t.v ? 0 : .35);
      };
      // 压线只扣分不淘汰：否则唯一不压线的位置（常常是庭的正下方）会把所有更好的位置挤掉
      const cost = (t: Try) => score(t) + (hit(box(t), 1, true) ? .9 : 0);
      const best = (ok: (b: Box) => boolean) => tries.filter(t => ok(box(t))).sort((a, b2) => cost(a) - cost(b2))[0];
      // 记忆优先：上次的位置（世界坐标）只要还不压石、不出界、仍离自己的庭最近，就原地不动——
      // 缩放时庭名跟着地图走，停下后也不会「跳」到另一个更高分的位置去
      const key = 'i:' + isl.cat, mem = this.place.get(key);
      let pick: Try | undefined;
      if (mem && typeof mem === 'object') {
        const sp = this.toScreen(mem), sz = mem.v ? V : Hh, t: Try = { c: [sp.x, sp.y], v: mem.v, w: sz.w, h: sz.h };
        if (!hit(box(t)) && onScreen(box(t)) && own(box(t))) pick = t;
      }
      pick ??= best(b => !hit(b) && onScreen(b) && own(b))
        ?? best(b => !hit(b) && onScreen(b) && Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy) < rr + 120);
      if (!pick) return;
      taken.push(box(pick));
      const wp = this.toWorld(pick.c[0], pick.c[1]);
      this.place.set(key, { x: wp.x, y: wp.y, v: pick.v });
      const sq = (x: number, y: number) => el('rect', { class: 'isl-sq', x, y, width: 7, height: 7, rx: 1.8, style: `--c:${C.color}` });
      const v = pick.v;
      const inner = put(key, `${v ? 'v' : 'h'}|${C.zh}|${C.en}|${n}|${C.color}`, wp.x, wp.y, 0, 0, () => v
        ? [sq(4.5, 0), txt(C.zh, 'l-isl', 8, 15), txt(C.en.toUpperCase(), 'l-isl-en v', 24, 15), txt(n, 'l-isl-n', 8, 16 + C.zh.length * 20.2 + 12, 'middle')]
        : [sq(0, 7), txt(C.zh, 'l-isl-h', 14, 16), txt(`${C.en} · ${n}`, 'l-isl-en', 14 + zhW + 10, 15)]);
      // 竖排字的实际高度随字体而变：渲染后量一次，把篇数放在最后一个字下面
      if (pick.v) {
        const zt = inner.querySelector<SVGTextElement>('.l-isl'), nt = inner.querySelector('.l-isl-n');
        if (zt && nt) { const zb = zt.getBBox(); if (zb.height) nt.setAttribute('y', (zb.y + zb.height + 12).toFixed(1)); }
      }
    });

    // ② 小径名：写在入口的石灯笼旁
    const budgetSer = [8, 14, 30, 99][this.tierK];
    [...g.series].filter(s => this.lanternAt.has(s.name) && s.stars.some(q => q.p.createdAt <= this.cutoff))
      .sort((a, b) => b.stars.length - a.stars.length).slice(0, budgetSer)
      .sort((a, b) => +this.lab.has('r:' + b.name) - +this.lab.has('r:' + a.name)).forEach(s => {
        const n = s.stars.filter(q => q.p.createdAt <= this.cutoff).length;
        const zh = /[一-鿿]/.test(s.name), font = zh ? `12px ${FZH}` : `11px ${FMO}`;
        const w1 = this.tw(s.name, font) + s.name.length * (zh ? 1.9 : 2.2), w = w1 + 8 + this.tw(`${cnNum(n)}章`, `10px ${FZH}`) + 6, h = 14;
        const lp = this.toScreen(this.lanternAt.get(s.name)!);
        let pick: Box | null = null, pi = -1;
        const C6 = [[10, -14], [-w - 10, -14], [-w / 2, 6], [-w / 2, -34], [10, 0], [-w - 10, 0]];
        const key = 'r:' + s.name, mem = this.place.get(key);
        // 记住的位置只要不压石、不压字就留下（压线也忍了——不挪比完美更要紧）；站不住才重新找
        if (typeof mem === 'number') {
          const b = { x: lp.x + C6[mem][0], y: lp.y + C6[mem][1], w, h };
          if (!hit(b, 3) && onScreen(b)) { pick = b; pi = mem; }
        }
        for (const strict of pick ? [] : [true, false]) {
          for (let i = 0; i < C6.length; i++) {
            const b = { x: lp.x + C6[i][0], y: lp.y + C6[i][1], w, h };
            if (!hit(b, 3, strict) && onScreen(b)) { pick = b; pi = i; break; }
          }
          if (pick) break;
        }
        if (!pick) return;
        taken.push(pick);
        this.place.set(key, pi);
        const at = this.lanternAt.get(s.name)!;
        put(key, `${s.name}|${n}`, at.x, at.y, C6[pi][0], C6[pi][1], () => [txt(s.name, 'l-ser' + (zh ? ' zh' : ''), 0, 11), txt(`${cnNum(n)}章`, 'l-ser-n', w1 + 8, 11)]);
      });

    // ③ 星名：焦点与邻里 > 小庭里仅有的一两篇 > 星等配额
    const q = f.query;
    const want = vis.filter(s => vis.length <= 12 || focusSet.has(s.p.id)
      || s.isl.stars.filter(x => x.p.createdAt <= this.cutoff).length <= 2
      || s.mag >= [5, 4, 3, 1][this.tierK] || (!!q && matchesQuery(s, q)));
    // 已在场的注记先落座、新来的绕着它们找位：否则一条新注记就可能把老注记挤到另一侧去
    const shown = (s: Stone) => +this.lab.has('s:' + s.p.id);
    want.sort((a, b) => (+focusSet.has(b.p.id) - +focusSet.has(a.p.id)) || (+(b.p.id === fid) - +(a.p.id === fid)) || b.mag - a.mag);
    want.slice(0, [10, 22, 48, 999][this.tierK] + focusSet.size)
      .sort((a, b) => (+focusSet.has(b.p.id) - +focusSet.has(a.p.id)) || shown(b) - shown(a)).forEach(s => {
      const p = this.toScreen(s), w = this.tw(s.p.title, `13px ${FZH}`) + s.p.title.length * .8, h = 16;
      const gp = this.nodes.get(s.p.id)!.R + 6;
      const C8: [number, number][] = [[gp, -gp - h + 4], [-gp - w, -gp - h + 4], [gp, gp - 2], [-gp - w, gp - 2], [-w / 2, -gp - h - 2], [-w / 2, gp + 2], [gp + 2, -h / 2], [-gp - 2 - w, -h / 2]];
      // 上次的候选位排在最前：还站得住就留在原侧，缩放停下后字不会左右横跳
      const key = 's:' + s.p.id, mem = this.place.get(key);
      let pi = -1;
      if (typeof mem === 'number') {
        const b = { x: p.x + C8[mem][0], y: p.y + C8[mem][1], w, h };
        if (!hit(b, 2) && onScreen(b)) pi = mem;
      }
      for (const strict of pi >= 0 ? [] : [true, false]) {
        for (let i = 0; i < C8.length; i++) { const b = { x: p.x + C8[i][0], y: p.y + C8[i][1], w, h }; if (!hit(b, 2, strict) && onScreen(b)) { pi = i; break; } }
        if (pi >= 0) break;
      }
      if (pi < 0 && s.p.id === fid) pi = typeof mem === 'number' ? mem : 0;
      if (pi < 0) return;
      const pick = C8[pi];
      taken.push({ x: p.x + pick[0], y: p.y + pick[1], w, h });
      this.place.set(key, pi);
      const inner = put(key, s.p.title, s.x, s.y, pick[0], pick[1], () => [txt(s.p.title, 'l-star', 0, 13)]);
      inner.firstElementChild?.classList.toggle('on', s.p.id === f.selId);
    });
    sweep();
  }

  // ══ 焦点：悬停或选中时，邻里亮、其余暗 ════════════════════════════════════════
  private focus() {
    const g = this.g;
    if (!g) return;
    const f = this.f, fid = f.selId ?? f.hovId, lit = new Set<string>();
    let nb: Neighbors | null = null;
    if (fid && g.byId.has(fid)) {
      nb = neighborsOf(g, fid, this.cutoff, this.tf);
      lit.add(fid);
      nb.path.forEach(q => lit.add(q.p.id));
      nb.bridges.forEach(b => lit.add(b.s.p.id));
      nb.kin.forEach(kk => lit.add(kk.s.p.id));
    }
    const fs = fid ? g.byId.get(fid) : undefined;
    const { hotCat: cat, hotSer: ser, topic: tp, query } = f, filt = !!(cat || tp || query);
    g.stars.forEach(s => {
      const n = this.nodes.get(s.p.id)!;
      let dim = false;
      if (nb) dim = !lit.has(s.p.id);
      else if (cat) dim = s.p.cat !== cat;
      else if (ser) dim = s.series !== ser;
      else if (tp) dim = !s.p.tags.includes(tp);
      else if (query) dim = !matchesQuery(s, query);
      const c = n.el.classList;
      c.toggle('dim', dim); c.toggle('future', s.p.createdAt > this.cutoff);
      c.toggle('sel', s.p.id === f.selId); c.toggle('hov', s.p.id === f.hovId);
    });
    g.series.forEach(s => {
      const ref = this.paths.get(s.name);
      if (!ref) return;
      const mine = !!fs && fs.series === s.name;
      ref.el.classList.toggle('lit', mine || ser === s.name);
      ref.el.style.opacity = String(fs ? (mine ? 1 : .2) : ser ? (ser === s.name ? 1 : .25) : cat ? (s.cat === cat ? 1 : .25) : filt ? .35 : 1);
    });
    this.G.lanterns.querySelectorAll<SVGGElement>('[data-series]').forEach(l => {
      const s = g.series.find(x => x.name === l.dataset.series);
      if (!s) return;
      l.style.opacity = String(fs ? (fs.series === s.name ? 1 : .25) : ser ? (ser === s.name ? 1 : .3) : cat ? (s.cat === cat ? 1 : .3) : 1);
    });
    this.bridges.forEach(({ el: b, a, b: t }) => {
      b.style.opacity = String((a.p.createdAt > this.cutoff || t.p.createdAt > this.cutoff) ? 0
        : fs ? (a === fs || t === fs ? 1 : .1) : (filt || ser) ? .18 : .32);
    });
    this.G.spokes.replaceChildren();
    if (f.selId && nb && fs) nb.kin.forEach(kk => {
      const d = `M${fs.x} ${fs.y}L${kk.s.x} ${kk.s.y}`;
      const sg = el('g', {}, this.G.spokes);
      el('path', { class: 'spoke', d }, sg);
      el('title', {}, el('path', { class: 'hitline', d }, sg)).textContent = `同话题 · ${kk.tags.map(t => '#' + t).join(' ')}`;
    });
  }

  // ══ 话题圈：Bubble Sets；离得远就退成生成树点线（Kelp） ═══════════════════════════
  private showTopic() {
    const G = this.G, g = this.g, t = this.f.topic;
    G.topic.replaceChildren();
    if (!t || !g) return;
    const mem = g.stars.filter(s => s.p.tags.includes(t) && s.p.createdAt <= this.cutoff);
    if (!mem.length) return;
    const kT = this.view.k;
    const F = sandField(mem.map(s => ({ x: s.x, y: s.y, r: this.nodes.get(s.p.id)!.R })), kT, 60, 12)!;
    el('path', { class: 'topic', d: iso(F, 30 / kT).map(p => smooth(p, 2)).join('') }, G.topic);
    const inT = [mem[0]], rest = mem.slice(1), edges: [Stone, Stone][] = [];
    while (rest.length) {
      let bi = 0, bj = 0, bd = Infinity;
      inT.forEach((a, i) => rest.forEach((b, j) => { const dd = Math.hypot(a.x - b.x, a.y - b.y); if (dd < bd) { bd = dd; bi = i; bj = j; } }));
      const b = rest.splice(bj, 1)[0];
      if (bd * kT > 60) edges.push([inT[bi], b]);
      inT.push(b);
    }
    edges.forEach(([a, b]) => el('path', { class: 'kelp', d: `M${a.x} ${a.y}L${b.x} ${b.y}` }, G.topic));
  }

  // ══ 昼夜：从月亮的方向（右上）一路换过去，520ms 的波，石与星交叉淡入 ════════════════
  private themeSwap() {
    if (this.g && !this.reduce) {
      const ks = this.g.stars.map(s => { const p = this.toScreen(s); return (this.W - p.x) + p.y; });
      const lo = Math.min(...ks), hi = Math.max(...ks);
      this.g.stars.forEach((s, i) => this.nodes.get(s.p.id)!.el.style.setProperty('--wd', `${(((ks[i] - lo) / (hi - lo || 1)) * 520).toFixed(0)}ms`));
    }
    // 注记先隐去再显现：字色与描边若跟着底色一起渐变，中段会糊成一团灰
    this.svg.classList.add('theme-swap');
    clearTimeout(this.themeT);
    // 全站底色换光要 1500ms：等底色过了大半再让注记回来，免得深描边先落在浅纸上
    // 注记隐着的时候顺手重排一次：夜里要给月亮让位，昼里月亮落下、位置又空出来了
    this.themeT = window.setTimeout(() => { this.labels(); this.svg.classList.remove('theme-swap'); }, 1150);
  }

  // ══ 池面倒影：今夜悉尼上空的亮星（BSC5，≤5 等），镜像。材质不是数据 ═══════════════
  // 最大半径 1.4px，恒小于最暗的数据星核（1.6px）——层级不许倒挂；不参与拾取。
  drawSky() {
    const cv = this.sky;
    if (!cv) return;
    const d = Math.min(2, window.devicePixelRatio || 1), W = this.W, H = this.H;
    cv.width = W * d; cv.height = H * d;
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, W, H);
    const lat = -33.87 * Math.PI / 180, lon = 151.21, JD = Date.now() / DAY + 2440587.5;
    const lst = ((280.46061837 + 360.98564736629 * (JD - 2451545) + lon) % 360 + 360) % 360;
    const Rr = Math.hypot(W, H) * .56, cx = W * .58, cy = H * .5;
    // 赤道坐标 → 地平坐标 → 天顶为心的球极投影；取负号 = 池面的镜像
    const project = (raDeg: number, dec: number) => {
      const Hh = ((lst - raDeg) % 360) * Math.PI / 180;
      const alt = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(Hh));
      const az = Math.atan2(-Math.cos(dec) * Math.sin(Hh), Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(Hh));
      const rho = Math.tan((Math.PI / 2 - alt) / 2) * Rr;
      return { alt, x: cx - rho * Math.sin(az), y: cy - rho * Math.cos(az) };
    };

    // 银河：沿真实的银道面（J2000 银道极 α 192.86° δ 27.13°）铺一条极淡的光带，
    // 人马座方向的银心最亮最宽，天鹅座一带再鼓起一点——南半球看得见的那条河。
    // 与星一样是池面的材质：叠加后画布峰值约 .09，乘上 .sky 的 .62 落到屏上约 .06，永远不抢数据星的光。
    const aG = 192.85948, dG = 27.12825 * Math.PI / 180, lN = 122.93192;
    const band = (l: number) => {
      const w = (x: number, c: number, s: number) => Math.exp(-(((x - c + 540) % 360 - 180) ** 2) / (2 * s * s));
      return .28 + .72 * w(l, 0, 38) + .3 * w(l, 80, 22) + .18 * w(l, 285, 26);
    };
    g.globalCompositeOperation = 'lighter';
    for (let l = 0; l < 360; l += 2.5) {
      const L = (lN - l) * Math.PI / 180;
      for (const b of [-4, 0, 4]) {
        const B = b * Math.PI / 180;
        const dec = Math.asin(Math.sin(B) * Math.sin(dG) + Math.cos(B) * Math.cos(dG) * Math.cos(L));
        const ra = aG + Math.atan2(Math.cos(B) * Math.sin(L), Math.sin(B) * Math.cos(dG) - Math.cos(B) * Math.sin(dG) * Math.cos(L)) * 180 / Math.PI;
        const p = project(ra, dec);
        if (p.alt < -.08) continue;
        const k = band(l), r = Rr * (.05 + .05 * k) * (b ? .75 : 1);
        const a = (b ? .01 : .016) * k * Math.min(1, (p.alt + .08) / .25);
        const warm = l < 40 || l > 330;
        const rg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        rg.addColorStop(0, `rgba(${warm ? '236,228,255' : '208,222,255'},${a.toFixed(4)})`);
        rg.addColorStop(1, 'rgba(208,222,255,0)');
        g.fillStyle = rg;
        g.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      }
    }
    g.globalCompositeOperation = 'source-over';

    const tint = (K: number) => K < 4000 ? '255,214,170' : K < 5500 ? '255,232,205' : K < 7000 ? '255,246,236' : K < 10000 ? '234,240,255' : '206,222,255';
    for (let i = 0; i < BSC5.length; i += 4) {
      const ra = BSC5[i] / 10, dec = BSC5[i + 1] / 10 * Math.PI / 180, V = BSC5[i + 2] / 10, K = BSC5[i + 3] * 100;
      const p = project(ra, dec);
      if (p.alt < 0) continue;
      const r = clamp(.28 * (5.3 - V), .35, 1.4), a = Math.min(.55, .1 + .085 * (5.3 - V));
      g.fillStyle = `rgba(${tint(K)},${a.toFixed(3)})`;
      g.beginPath(); g.arc(p.x, p.y, r, 0, 6.2832); g.fill();
    }
  }

  resize() {
    this.measure();
    this.drawSky();
    this.fit(false);
  }

  // ══ 输入：最近邻拾取（屏幕空间），拖动平移，滚轮 / 双指缩放 ═══════════════════════
  private nearest(cx: number, cy: number) {
    let best: Stone | null = null, bd = Infinity;
    for (const s of this.visible()) {
      const p = this.toScreen(s), d = Math.hypot(p.x - cx, p.y - cy);
      if (d < bd) { bd = d; best = s; }
    }
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    return best && bd < Math.max(this.nodes.get(best.p.id)!.R + 10, coarse ? 22 : 18) ? best : null;
  }

  private bindInput() {
    const svg = this.svg;
    const local = (e: PointerEvent | WheelEvent) => ({ x: e.clientX - this.rect.left, y: e.clientY - this.rect.top });
    const down = (e: PointerEvent) => {
      const p = local(e);
      this.ptrs.set(e.pointerId, p);
      svg.setPointerCapture(e.pointerId);
      if (this.ptrs.size === 1) { this.stopGlide(); this.drag = { x: p.x, y: p.y, vx: this.view.x, vy: this.view.y }; this.moved = 0; this.flyId++; }
      if (this.ptrs.size === 2) {
        const [a, b] = [...this.ptrs.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.view.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vx: this.view.x, vy: this.view.y };
        this.drag = null;
      }
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      if (this.ptrs.has(e.pointerId)) this.ptrs.set(e.pointerId, p);
      const pn = this.pinch;
      if (pn && this.ptrs.size === 2) {
        const [a, b] = [...this.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        const k = clamp(pn.k * d / pn.d, this.fitK * .6, this.fitK * 8), w = { x: (pn.cx - pn.vx) / pn.k, y: (pn.cy - pn.vy) / pn.k };
        this.view = { k, x: pn.cx - w.x * k, y: pn.cy - w.y * k }; this.write(); this.moved = 99;
        return;
      }
      const dr = this.drag;
      if (dr) {
        const dx = p.x - dr.x, dy = p.y - dr.y;
        this.moved = Math.max(this.moved, Math.abs(dx) + Math.abs(dy));
        if (this.moved > 4) { svg.classList.add('dragging'); this.view.x = dr.vx + dx; this.view.y = dr.vy + dy; this.write(); }
        return;
      }
      const h = this.nearest(p.x, p.y), id = h ? h.p.id : null;
      if (id !== this.f.hovId) {
        svg.style.cursor = id ? 'pointer' : '';
        this.setFocus({ hovId: id });
        this.cb.onHover(id);
      }
    };
    const up = (e: PointerEvent) => {
      this.ptrs.delete(e.pointerId);
      svg.classList.remove('dragging');
      if (this.pinch && this.ptrs.size < 2) { this.pinch = null; this.settle(); return; }
      if (this.drag) {
        const wasTap = this.moved <= 4;
        this.drag = null;
        if (!wasTap) { this.settle(); return; }
        const p = local(e), h = this.nearest(p.x, p.y);
        this.cb.onPick(h ? h.p.id : null);
      }
    };
    const leave = () => {
      if (this.f.hovId && !this.drag) { this.setFocus({ hovId: null }); this.cb.onHover(null); }
    };
    // 缩放：触控板 / 双指捏合本身就是连续的，照手势直写；鼠标滚轮一格一跳，改成朝目标倍率滑过去——
    // 在对数空间里按时间常数 90ms 逼近，光标下那一点始终钉住不动。连续滚动只推远目标，不重启动画。
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.flyId++;
      const p = local(e), lim = (k: number) => clamp(k, this.fitK * .6, this.fitK * 8);
      const precise = e.deltaMode === 0 && (e.ctrlKey || Math.abs(e.deltaY) < 40);
      const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? .05 : .0016) * (e.ctrlKey ? 3 : 1));
      if (precise && !this.zoomT) {
        const k = lim(this.view.k * f), w = this.toWorld(p.x, p.y);
        this.view = { k, x: p.x - w.x * k, y: p.y - w.y * k };
        this.write(); this.settle();
        return;
      }
      this.zoomT = { k: lim((this.zoomT?.k ?? this.view.k) * f), px: p.x, py: p.y };
      if (this.reduce) { this.glide(1e9); return; }
      if (!this.zoomRaf) { let t0 = performance.now(); const step = (t: number) => { const dt = t - t0; t0 = t; this.zoomRaf = 0; if (this.glide(dt)) this.zoomRaf = requestAnimationFrame(step); }; this.zoomRaf = requestAnimationFrame(step); }
    };
    svg.addEventListener('pointerdown', down);
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('pointerleave', leave);
    svg.addEventListener('wheel', wheel, { passive: false });
    this.off.push(() => {
      svg.removeEventListener('pointerdown', down);
      svg.removeEventListener('pointermove', move);
      svg.removeEventListener('pointerup', up);
      svg.removeEventListener('pointercancel', up);
      svg.removeEventListener('pointerleave', leave);
      svg.removeEventListener('wheel', wheel);
    });
  }
}
