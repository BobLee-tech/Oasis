// ✦ 砂与星 —— 花园的俯瞰。昼为砂庭，夜为星池。
//
// 它回答的问题和博客列表不一样：列表回答「最近写了什么」（时间轴），
// 这里回答「这里长着什么、彼此如何连接、从哪进去」（地形图）。核心阅读路径：
//   浏览庭记或点一块石 → 看标题、摘要、关系 → 进阅读舱（#/garden/<id>）→ 返回原来的位置。
// 星图内不做长文阅读，它只做入口。
//
// 分工（规矩：相机的平移缩放永远不进 React）：
//   · orchard/sandScene.ts —— 地图本身：石 / 星、砂纹、小径、桥、注记、相机、拾取，全部直写 DOM；
//   · lib/sandGarden.ts    —— 纯数据：落座（出生时择邻，此后终生不迁）、关系推导、砂纹几何；
//   · 本文件              —— 版面之外的东西：页头、庭记目录、星卡、时光拨盘、工具条。
// 视觉基准 docs/sandprototype-v5.1.html，取舍见 docs/constellation-v5.1-refinement.md。
// 已拍板去掉的：星等依据切换器、「未种下的星」、手机版（窄屏只给一块告示）、待照料模式。
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useGarden, filterVisible } from '../hooks/useGarden';
import { useCategories } from '../hooks/useCategories';
import { formatHash } from '../lib/route';
import {
  DAY, cnNum, layoutGarden, neighborsOf, tagFrequency, termOf, termsBetween, toSandPosts,
  PRINCIPAL_TERMS, type Stone,
} from '../lib/sandGarden';
import {
  EASE_IO, SandScene, buildDefs, drawGlyph, drawLantern, matchesQuery, type CatMeta,
} from './orchard/sandScene';
import { Moon } from './orchard/Moon';
import './orchard/sand.css';

interface OasisOrchardProps {
  isAdmin: boolean;
  itemId?: string;
  onNavigate?: (itemId?: string) => void;
}

const GROW: Record<string, string> = { seedling: '种子', growing: '生长中', evergreen: '常青' };

// —— 媒体查询与昼夜：都是外部状态，用 useSyncExternalStore 订阅 ——
const mq = (q: string) => ({
  sub: (n: () => void) => { const m = window.matchMedia(q); m.addEventListener('change', n); return () => m.removeEventListener('change', n); },
  get: () => window.matchMedia(q).matches,
});
const NARROW = mq('(max-width: 767px)');
const COMPACT = mq('(max-width: 1399px)');
const serverFalse = () => false;
const subscribeDark = (n: () => void) => {
  const o = new MutationObserver(n);
  o.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => o.disconnect();
};
const isDark = () => document.documentElement.classList.contains('dark');

const LanternIcon = () => (
  <svg width="10" height="15" viewBox="-5 -15 10 15" aria-hidden>
    <g fill="currentColor">
      <rect x="-3.2" y="-1.3" width="6.4" height="1.3" rx=".35" /><rect x="-.9" y="-6.3" width="1.8" height="5.2" />
      <rect x="-3" y="-7.5" width="6" height="1.3" rx=".35" /><rect x="-2.3" y="-10.9" width="4.6" height="3.5" rx=".3" />
      <path d="M-4.8 -10.7C-3.2 -11.4 -1.5 -12.6 0 -13.3C1.5 -12.6 3.2 -11.4 4.8 -10.7Z" /><circle cy="-14.1" r=".95" />
    </g>
    <rect x="-1.2" y="-10.2" width="2.4" height="2.1" fill="var(--ln-win)" />
  </svg>
);

/** 图例：用与地图同一支笔画（drawGlyph / drawLantern），所以图例不会说谎。 */
const Sketch: React.FC<{ draw: (g: SVGGElement) => void; color: string }> = ({ draw, color }) => {
  const ref = useRef<SVGGElement | null>(null);
  useEffect(() => { const g = ref.current; if (!g) return; g.replaceChildren(); draw(g); }, [draw]);
  return <svg width="40" height="20" viewBox="-6 -10 50 20" aria-hidden><g ref={ref} style={{ ['--c' as string]: color }} /></svg>;
};

export const OasisOrchard: React.FC<OasisOrchardProps> = ({ isAdmin, itemId, onNavigate }) => {
  const reduce = !!useReducedMotion();
  const narrow = useSyncExternalStore(NARROW.sub, NARROW.get, serverFalse);
  const compact = useSyncExternalStore(COMPACT.sub, COMPACT.get, serverFalse);
  const night = useSyncExternalStore(subscribeDark, isDark, serverFalse);
  const { posts: rawPosts } = useGarden();
  const { metaOf } = useCategories();

  // ══ 数据 ═══════════════════════════════════════════════════════════════
  const garden = useMemo(() => layoutGarden(toSandPosts(filterVisible(rawPosts, isAdmin))), [rawPosts, isAdmin]);
  const cats = useMemo(() => {
    const m = new Map<string, CatMeta>();
    garden.islands.forEach((isl, i) => {
      const c = metaOf(isl.cat);
      m.set(isl.cat, { zh: c.zh, en: c.label, color: c.color, gid: String(i) });
    });
    return m;
  }, [garden, metaOf]);
  const tf = useMemo(() => tagFrequency(garden), [garden]);
  const islands = useMemo(() => [...garden.islands].sort((a, b) => b.stars.length - a.stars.length), [garden]);

  // ══ 状态 ═══════════════════════════════════════════════════════════════
  const [selId, setSelId] = useState<string | null>(itemId ?? null);
  // 路由 → 选中态：渲染期调整（外部值变了就把派生状态跟上），不走 effect 多渲染一轮
  const [seenItemId, setSeenItemId] = useState(itemId);
  if (itemId !== seenItemId) { setSeenItemId(itemId); setSelId(itemId ?? null); }
  const [hovId, setHovId] = useState<string | null>(null);
  const [hotCat, setHotCat] = useState<string | null>(null);
  const [hotSer, setHotSer] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<string | null>(null);
  const [pinTopic, setPinTopic] = useState(false);
  const [railOn, setRailOn] = useState(true);
  const [timeOn, setTimeOn] = useState(false);
  const [cutoff, setCutoff] = useState(Infinity);
  const [playing, setPlaying] = useState(false);
  const [unfolded, setUnfolded] = useState<Set<string>>(() => new Set());
  const [now] = useState(() => Date.now());

  const selected = selId ? garden.byId.get(selId) ?? null : null;
  const cardOn = !!selected;
  const q = query.trim().toLowerCase();

  const svgRef = useRef<SVGSVGElement | null>(null);
  const skyRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<SandScene | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const sliderRef = useRef<HTMLInputElement | null>(null);
  const timeBtnRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const enteredRef = useRef(false);
  const lastSelRef = useRef<string | null>(null);

  const pick = useCallback((id: string | null) => {
    setSelId(id);
    onNavigate?.(id ?? undefined);
  }, [onNavigate]);

  // ══ 场景：挂载一次，卸载销毁 ══════════════════════════════════════════
  const pickRef = useRef(pick);
  useEffect(() => { pickRef.current = pick; }, [pick]);
  useEffect(() => {
    if (narrow || !svgRef.current) return;
    const scene = new SandScene(svgRef.current, skyRef.current, {
      onHover: id => setHovId(id),
      onPick: id => pickRef.current(id),
    }, reduce);
    sceneRef.current = scene;
    enteredRef.current = false;
    lastSelRef.current = null;
    let t = 0;
    const onResize = () => { clearTimeout(t); t = window.setTimeout(() => scene.resize(), 120); };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(t);
      scene.destroy();
      sceneRef.current = null;
    };
  }, [narrow, reduce]);

  // 数据到位（本地缓存先到、云端随后覆盖）：第一次有石的那一版走完整进场编排，之后原地重建
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const entrance = !enteredRef.current && garden.stars.length > 0;
    if (garden.stars.length) enteredRef.current = true;
    scene.setData(garden, cats, entrance);
    // 字体晚到时字宽会量错：等 webfont 就位再排一次注记
    let alive = true;
    document.fonts?.ready.then(() => { if (alive) scene.labels(); });
    return () => { alive = false; };
  }, [garden, cats, narrow, reduce]);

  useEffect(() => {
    sceneRef.current?.setFocus({ selId, hovId, hotCat, hotSer, topic, query: q });
  }, [selId, hovId, hotCat, hotSer, topic, q, garden, narrow]);

  // 选中变化：涟漪 + 相机让位（第一次挂载时的深链接由场景推迟到相机落定后）
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || selId === lastSelRef.current) return;
    lastSelRef.current = selId;
    scene.select(selId, true);
    if (selId) {
      const row = railRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(selId)}"]`);
      row?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    }
  }, [selId, garden, narrow, reduce]);

  // 版面让位：庭记开合、时光拨盘升降时，地图同步重新取景
  const flagsRef = useRef({ railOn, timeOn });
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const prev = flagsRef.current;
    const refit = prev.railOn !== railOn || prev.timeOn !== timeOn;
    flagsRef.current = { railOn, timeOn };
    scene.setFlags({ railOn, cardOn, timeOn }, refit);
  }, [railOn, cardOn, timeOn, narrow]);

  // ══ 时光拨盘 ═══════════════════════════════════════════════════════════
  const span = useMemo<[number, number]>(() => {
    const t = garden.stars.map(s => s.p.createdAt);
    return [t.length ? Math.min(...t) - 7 * DAY : now - 30 * DAY, now];
  }, [garden, now]);
  const hist = useMemo(() => {
    const [a, b] = span, months: number[] = [];
    for (let d = new Date(new Date(a).getFullYear(), new Date(a).getMonth(), 1); d.getTime() < b; d.setMonth(d.getMonth() + 1)) months.push(d.getTime());
    const counts = months.map((m, i) => garden.stars.filter(s => s.p.createdAt >= m && s.p.createdAt < (months[i + 1] ?? b + 1)).length);
    return { months, counts, max: Math.max(1, ...counts), terms: termsBetween(a, b) };
  }, [span, garden]);
  const histW = 400;
  const X = (t: number) => (t - span[0]) / (span[1] - span[0]) * histW;

  const reactCutT = useRef(0);
  const applyCut = useCallback((c: number, live: boolean) => {
    sceneRef.current?.setCut(c, live);
    // React 这边（庭记、统计、节气标签）不必每帧跟：100ms 一拍足够
    const t = performance.now();
    if (!live || t - reactCutT.current > 100) { reactCutT.current = t; setCutoff(c); }
  }, []);
  const cutFromSlider = useCallback(() => {
    const v = Number(sliderRef.current?.value ?? 1000);
    return span[0] + (span[1] - span[0]) * v / 1000;
  }, [span]);

  const playId = useRef(0);
  const stopPlay = useCallback(() => { playId.current++; setPlaying(false); }, []);
  const play = useCallback(() => {
    const [a, b] = span;
    let from = cutFromSlider();
    if (from >= b - DAY) from = a;
    const id = ++playId.current, t0 = performance.now(), D = reduce ? 1 : 7000 * (b - from) / (b - a);
    setPlaying(true);
    const tick = (t: number) => {
      if (id !== playId.current) return;
      const e = EASE_IO(Math.min(1, (t - t0) / D)), c = from + (b - from) * e;
      if (sliderRef.current) sliderRef.current.value = String(Math.round((c - a) / (b - a) * 1000));
      applyCut(c, true);
      if (e < 1) requestAnimationFrame(tick);
      else { setCutoff(c); setPlaying(false); }
    };
    requestAnimationFrame(tick);
  }, [span, cutFromSlider, applyCut, reduce]);

  const openTime = () => {
    setTimeOn(true);
    window.setTimeout(() => sliderRef.current?.focus({ preventScroll: true }), 200);
  };
  // 收起就是收起：不再先「快进回今天」再沉下去，未来的石直接淡回原处
  const closeTime = useCallback(() => {
    stopPlay();
    setTimeOn(false);
    if (sliderRef.current) sliderRef.current.value = '1000';
    sceneRef.current?.setCut(Infinity);
    setCutoff(Infinity);
    timeBtnRef.current?.focus({ preventScroll: true });
  }, [stopPlay]);

  // 截止时刻之后的选中失效
  if (selected && selected.p.createdAt > cutoff) { setSelId(null); }

  // ══ 键盘 ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (narrow) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'TEXTAREA' || t.isContentEditable || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range'));
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/' && !typing) { e.preventDefault(); setRailOn(true); if (compact && selId) pick(null); searchRef.current?.focus(); return; }
      if (e.key === 'Escape') {
        if (typing && t === searchRef.current) { setQuery(''); searchRef.current?.blur(); }
        else if (timeOn) closeTime();
        else if (selId) {
          const prev = selId;
          pick(null);
          window.setTimeout(() => railRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(prev)}"]`)?.focus({ preventScroll: true }), 30);
        }
        return;
      }
      if (typing) return;
      if (timeOn && e.key === ' ') { e.preventDefault(); if (playing) stopPlay(); else play(); return; }
      if (timeOn && t === sliderRef.current) return;
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && selected) {
        const line = selected.series
          ? neighborsOf(garden, selected.p.id, cutoff, tf).path
          : garden.stars.filter(x => x.p.cat === selected.p.cat && !x.series && x.p.createdAt <= cutoff).sort((a, b) => a.p.createdAt - b.p.createdAt);
        const next = line[line.indexOf(selected) + (e.key === 'ArrowRight' ? 1 : -1)];
        if (next) pick(next.p.id);
      }
      if (e.key === 'Enter' && selected && t?.tagName !== 'BUTTON' && t?.tagName !== 'A') window.location.hash = formatHash('garden', selected.p.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [narrow, compact, selId, selected, timeOn, playing, garden, cutoff, tf, pick, play, stopPlay, closeTime]);

  // 选中后把焦点交给星卡的关闭键：键盘用户不必再从页首 Tab 过来
  useEffect(() => { if (selId) closeRef.current?.focus({ preventScroll: true }); }, [selId]);

  // ══ 派生 ═══════════════════════════════════════════════════════════════
  const vis = useMemo(() => garden.stars.filter(s => s.p.createdAt <= cutoff), [garden, cutoff]);
  const stat = useMemo(() => {
    const isl = new Set(vis.map(s => s.p.cat)).size;
    const ser = garden.series.filter(s => s.stars.filter(x => x.p.createdAt <= cutoff).length > 1).length;
    const br = vis.reduce((a, s) => a + s.p.links.filter(t => (garden.byId.get(t)?.p.createdAt ?? Infinity) <= cutoff).length, 0);
    return `${vis.length} 石 · ${isl} 庭 · ${ser} 径 · ${br} 桥`;
  }, [vis, garden, cutoff]);
  const topTags = useMemo(() => [...tf].sort((a, b) => b[1] - a[1]).slice(0, 14), [tf]);
  const legendCat = cats.values().next().value as CatMeta | undefined;
  const big = garden.stars.length > 40;
  const nb = selected ? neighborsOf(garden, selected.p.id, cutoff, tf) : null;

  const hoverRow = (id: string | null, ser: string | null, cat: string | null) => {
    setHovId(id); setHotSer(ser); setHotCat(cat);
  };
  const toggleTopic = (t: string) => {
    const pin = !(pinTopic && topic === t);
    setPinTopic(pin); setTopic(pin ? t : null);
  };
  const flyToStars = (list: Stone[]) => sceneRef.current?.flyTo(list.map(s => s.p.id));
  const rowCls = (id: string) => `row post${id === selId ? ' sel' : ''}${id === hovId ? ' hot' : ''}${q ? (garden.byId.get(id) && matchesQuery(garden.byId.get(id)!, q) ? ' hit' : ' miss') : ''}`;

  // 图例的笔：必须是稳定引用，否则 Sketch 每次渲染都重画
  const legend = useMemo(() => {
    const gid = legendCat?.gid ?? '0';
    return [
      { text: '大小=篇幅', draw: (g: SVGGElement) => [1, 3, 5].forEach((m, i) => { const t = document.createElementNS('http://www.w3.org/2000/svg', 'g'); t.setAttribute('transform', `translate(${i * 16 + 2} 0)`); g.appendChild(t); drawGlyph(t, { id: 'lg' + m, growth: 'growing' }, m, gid, .4, false); }) },
      { text: '种子→常青', draw: (g: SVGGElement) => ([['seedling', 0], ['growing', 15], ['evergreen', 31]] as const).forEach(([gw, x]) => { const t = document.createElementNS('http://www.w3.org/2000/svg', 'g'); t.setAttribute('transform', `translate(${x} 0)`); g.appendChild(t); drawGlyph(t, { id: 'lg' + gw, growth: gw }, 3, gid, .4, false); }) },
      { text: '小径=合集', draw: (g: SVGGElement) => { ['M-2 -3.2C8 -5.6 18 -.8 30 -3.2', 'M-2 3.2C8 .8 18 5.6 30 3.2'].forEach(d => { const e = document.createElementNS('http://www.w3.org/2000/svg', 'path'); e.setAttribute('class', 'lg-stream'); e.setAttribute('d', d); g.appendChild(e); }); const t = document.createElementNS('http://www.w3.org/2000/svg', 'g'); t.setAttribute('transform', 'translate(38 7) scale(.9)'); g.appendChild(t); drawLantern(t); } },
      { text: '桥=双链', draw: (g: SVGGElement) => ['br-a', 'br-b', 'br-n'].forEach(k => { const e = document.createElementNS('http://www.w3.org/2000/svg', 'path'); e.setAttribute('class', k); e.setAttribute('d', 'M-2 5Q18 -12 38 5'); g.appendChild(e); }) },
    ];
  }, [legendCat?.gid]);
  // 图例放在目录的折叠区里，自己带一份渐变（与地图同名同值，谁先挂载都一样）
  const legendDefsRef = useRef<SVGDefsElement | null>(null);
  useEffect(() => { if (legendDefsRef.current) buildDefs(legendDefsRef.current, [...cats.values()]); }, [cats]);

  if (narrow) {
    // 窄屏不做星图（已拍板）：竖屏上这片庭只会缩成一条带，字反而压过石。
    return (
      <section className="oasis-sand absolute inset-0 z-10" aria-label="知识星图">
        <div className="narrow-note">
          <div>
            <div className="eyebrow">Constellation · 星图</div>
            <h1>砂与星</h1>
            <p>这片庭院是给宽屏的。<br />请到电脑上慢慢走，或回花园按时间读。</p>
            <a href={formatHash('garden')} className="pill">← 回花园</a>
          </div>
        </div>
      </section>
    );
  }

  const C = selected ? cats.get(selected.p.cat) : undefined;
  let ci = 0;
  const ciStyle = () => ({ ['--i' as string]: ci++ }) as React.CSSProperties;
  const idx = selected && nb ? nb.path.indexOf(selected) : -1;
  const days = selected ? Math.floor((now - selected.p.updatedAt) / DAY) : 0;
  const cNow = Number.isFinite(cutoff) ? Math.min(cutoff, now) : now;

  return (
    <section
      className="oasis-sand absolute inset-0 z-10 overflow-hidden"
      aria-label="知识星图 · 砂与星"
      data-rail={railOn ? 'on' : 'off'} data-card={cardOn ? 'on' : 'off'} data-time={timeOn ? 'on' : 'off'}
    >
      <div className="paper" aria-hidden />
      <canvas ref={skyRef} className="sky" aria-hidden />

      <header className={`place-head${reduce ? '' : ' in-head'}`}>
        <div className="eyebrow">Constellation · 星图</div>
        <h1 aria-label="砂与星">{[...'砂与星'].map((c, i) => <span key={c} aria-hidden style={{ ['--i' as string]: i } as React.CSSProperties}>{c}</span>)}</h1>
        <p key={night ? 'n' : 'd'}>{night ? '池水静下来，星便落进来了。' : '白砂上的每一块石，都是写下的字。'}</p>
      </header>

      <Moon now={now} />

      <svg ref={svgRef} className="stage" role="img" aria-label="砂庭地图：每块石是一篇文章，拖动平移，滚轮缩放，点击打开" />

      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden><defs ref={legendDefsRef} /></svg>

      <aside ref={railRef} className={`rail glass${reduce ? '' : ' in-rail'}`} aria-label="庭记 · 目录" inert={cardOn && compact}>
        <div className="rail-head">
          <div className="eyebrow">Index · 庭记</div>
          <h3>循着小径，慢慢读</h3>
          <div className="stat">{stat}</div>
          <label className="search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input
              ref={searchRef} value={query} aria-label="搜索文章、合集或话题" placeholder="寻一篇文章" autoComplete="off"
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key !== 'Enter') return;
                const s = vis.find(x => matchesQuery(x, q));
                if (s) { pick(s.p.id); e.currentTarget.blur(); }
              }}
            />
            <kbd>/</kbd>
          </label>
        </div>
        <div className="rail-body" onMouseLeave={() => hoverRow(null, null, null)}>
          {!vis.length && <p className="empty">庭里还没有石。等第一篇文章写下，这里就会有第一块石落定。</p>}
          {islands.map(isl => {
            const st = isl.stars.filter(s => s.p.createdAt <= cutoff);
            if (!st.length) return null;
            const M = cats.get(isl.cat)!;
            // 合集按庭列：跨了分类的合集，在每片庭里只列落在这片庭的那几章（章号仍按整条小径）
            const paths = garden.series.filter(s => s.stars.some(x => x.isl === isl && x.p.createdAt <= cutoff));
            const loose = st.filter(s => !s.series).sort((a, b) => b.p.createdAt - a.p.createdAt);
            return (
              <section key={isl.cat} className="cat" style={{ ['--c' as string]: M.color } as React.CSSProperties}>
                <button className="row cat-h" onMouseEnter={() => hoverRow(null, null, isl.cat)} onClick={() => flyToStars(st)}>
                  <i className="sq" /><span className="zh">{M.zh}</span><span className="en">{M.en}</span><span className="n">{st.length}</span>
                </button>
                {paths.map(s => {
                  const ss = s.stars.filter(x => x.p.createdAt <= cutoff);
                  const here = ss.filter(x => x.isl === isl);
                  const folded = big && !here.some(x => x.p.id === selId) && !unfolded.has(s.name);
                  return (
                    <div key={s.name} className="ser">
                      <button className="row ser-h" aria-expanded={!folded}
                        onMouseEnter={() => hoverRow(null, s.name, null)}
                        onClick={() => {
                          setUnfolded(u => { const n = new Set(u); if (n.has(s.name)) n.delete(s.name); else n.add(s.name); return n; });
                          flyToStars(ss);
                        }}>
                        <LanternIcon />{s.name}<span className="n">{here.length}</span>
                      </button>
                      {!folded && (
                        <ol>
                          {here.map(x => (
                            <li key={x.p.id}>
                              <button className={rowCls(x.p.id)} data-id={x.p.id} onMouseEnter={() => hoverRow(x.p.id, null, null)} onClick={() => pick(x.p.id)}>
                                <span className="no">{ss.indexOf(x) + 1}</span><span className="t">{x.p.title}</span><span className="m">{x.p.minutes}′</span>
                              </button>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  );
                })}
                {loose.length > 0 && (
                  <ul className="loose">
                    {loose.map(x => (
                      <li key={x.p.id}>
                        <button className={rowCls(x.p.id)} data-id={x.p.id} onMouseEnter={() => hoverRow(x.p.id, null, null)} onClick={() => pick(x.p.id)}>
                          <span className="no">·</span><span className="t">{x.p.title}</span><span className="m">{x.p.minutes}′</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
        <div className="rail-foot">
          <details onToggle={() => sceneRef.current?.labels()}>
            <summary>话题与图例</summary>
            {topTags.length > 0 && (
              <>
                <div className="eyebrow">Topics · 话题</div>
                <div className="tags" onMouseLeave={() => { if (!pinTopic) setTopic(null); }}>
                  {topTags.map(([t, n]) => (
                    <button key={t} className={`tag${pinTopic && topic === t ? ' on' : ''}`} aria-pressed={pinTopic && topic === t}
                      onMouseEnter={() => { if (!pinTopic) setTopic(t); }} onClick={() => toggleTopic(t)}>#{t} {n}</button>
                  ))}
                </div>
              </>
            )}
            <div className="legend">
              {legend.map(l => (
                <React.Fragment key={l.text}><Sketch draw={l.draw} color={legendCat?.color ?? '#60A5FA'} /><span>{l.text}</span></React.Fragment>
              ))}
            </div>
          </details>
        </div>
      </aside>
      {!railOn && <button className="pill rail-toggle" onClick={() => setRailOn(true)}>☰ 庭记</button>}

      <aside className={`card glass${cardOn ? ' on' : ''}`} aria-label="星卡" aria-live="polite" inert={!cardOn}
        style={C ? ({ ['--c' as string]: C.color } as React.CSSProperties) : undefined}>
        {selected && nb && C && (
          <div key={selected.p.id}>
            <button ref={closeRef} className="x" aria-label="关闭星卡" onClick={() => pick(null)}>×</button>
            <div className="ci" style={ciStyle()}>
              <div className="chips">
                <span className="chip"><i />{C.zh} · {C.en}</span>
                {selected.series && idx >= 0 && <span className="chip chip-ser">{selected.series} · 第{cnNum(idx + 1)}章</span>}
              </div>
            </div>
            <h2 className="ci" style={ciStyle()}>{selected.p.title}</h2>
            <div className="ci meta" style={ciStyle()}>
              {new Date(selected.p.createdAt).toLocaleDateString('zh-CN')} · {termOf(selected.p.createdAt)} · {selected.p.minutes} 分钟 · {GROW[selected.p.growth] ?? selected.p.growth} · {days ? `${days} 天前照料` : '今日照料'}
            </div>
            {selected.p.excerpt && <p className="ci ex" style={ciStyle()}>{selected.p.excerpt}</p>}
            <a className="ci cta" style={ciStyle()} href={formatHash('garden', selected.p.id)}>进入阅读舱 →</a>
            {nb.path.length > 1 && (
              <div className="ci" style={ciStyle()}>
                <div className="relh">小径 <b>{selected.series}</b></div>
                {/* 与地图同一种语言：灯笼是源头，一条耙出来的窄溪，各章是溪里的石；水只流到当前这一章 */}
                <div className="pathbar">
                  <span className="lnic"><LanternIcon /></span>
                  <div className="stream" style={{ ['--prog' as string]: nb.path.length > 1 ? idx / (nb.path.length - 1) : 0 } as React.CSSProperties}>
                    {nb.path.map((x, i) => (
                      <button key={x.p.id} className={x === selected ? 'cur' : i < idx ? 'past' : ''} title={x.p.title} aria-label={x.p.title} onClick={() => pick(x.p.id)}><i /></button>
                    ))}
                  </div>
                </div>
                <div className="pnav">
                  <button disabled={idx <= 0} onClick={() => idx > 0 && pick(nb.path[idx - 1].p.id)}>{idx > 0 ? `← ${nb.path[idx - 1].p.title}` : ''}</button>
                  <button disabled={idx >= nb.path.length - 1} onClick={() => idx < nb.path.length - 1 && pick(nb.path[idx + 1].p.id)}>{idx < nb.path.length - 1 ? `${nb.path[idx + 1].p.title} →` : ''}</button>
                </div>
              </div>
            )}
            {nb.bridges.length > 0 && (
              <div className="ci" style={ciStyle()}>
                <div className="relh">桥 <b>双链</b></div>
                <ul className="rlist">
                  {nb.bridges.map(b => (
                    <li key={b.s.p.id}><button onClick={() => pick(b.s.p.id)}>{b.dir === 'out' ? '→' : '←'} {b.s.p.title}<span className="why">{b.dir === 'out' ? '引用了它' : '引用了这篇'}</span></button></li>
                  ))}
                </ul>
              </div>
            )}
            <div className="ci" style={ciStyle()}>
              <div className="relh">同话题 <b>砂纹相邻</b></div>
              {nb.kin.length ? (
                <ul className="rlist">
                  {nb.kin.map(k => (
                    <li key={k.s.p.id}><button onClick={() => pick(k.s.p.id)}>{k.s.p.title}<span className="why">{k.tags.map(t => '#' + t).join(' ')}</span></button></li>
                  ))}
                </ul>
              ) : (
                <div className="muted">{nb.path.length > 1 ? '同话题的都已在这条小径上。' : '这篇文章暂时独自成景。'}</div>
              )}
            </div>
          </div>
        )}
      </aside>

      <div className={`tools${reduce ? '' : ' in-tools'}`} inert={timeOn}>
        <button className="pill" aria-pressed={railOn} onClick={() => setRailOn(v => !v)}>☰ 庭记</button>
        <button ref={timeBtnRef} className="pill" aria-pressed={timeOn} onClick={() => (timeOn ? closeTime() : openTime())}>◴ 时光</button>
        <button className="pill" onClick={() => { pick(null); sceneRef.current?.fit(); }}>⤢ 全图</button>
      </div>

      <div className="time glass" role="group" aria-label="时光拨盘" inert={!timeOn}>
        <button className="tplay" aria-label={playing ? '暂停' : '播放花园生长'} onClick={() => (playing ? stopPlay() : play())}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d={playing ? 'M3 1.5h2.2v9H3zM6.8 1.5H9v9H6.8z' : 'M3 1.5v9l7.5-4.5z'} fill="currentColor" /></svg>
        </button>
        <div className="ttrack">
          <svg className="thist" viewBox={`0 0 ${histW} 48`} preserveAspectRatio="none" aria-hidden>
            {hist.months.map((m, i) => {
              const x0 = Math.max(0, X(m)), x1 = Math.min(histW, X(hist.months[i + 1] ?? span[1]));
              const h = hist.counts[i] ? 3 + 15 * hist.counts[i] / hist.max : 0;
              if (!h) return null;
              const end = hist.months[i + 1] ?? span[1];
              return <rect key={m} className={`hb${end - 31 * DAY <= cNow ? ' past' : ''}`} x={x0 + 1} y={26 - h} width={Math.max(1.5, x1 - x0 - 2)} height={h} rx={1} style={{ ['--i' as string]: i } as React.CSSProperties} />;
            })}
            {hist.terms.map(t => (
              <line key={t.t} className={`tick${PRINCIPAL_TERMS.has(t.name) ? ' p' : ''}`} x1={X(t.t)} x2={X(t.t)} y1={30} y2={PRINCIPAL_TERMS.has(t.name) ? 36 : 33} />
            ))}
          </svg>
          <input
            ref={sliderRef} type="range" className="trange" min={0} max={1000} defaultValue={1000} aria-label="时光"
            aria-valuetext={`${termOf(cNow)} · ${new Date(cNow).toLocaleDateString('zh-CN')}`}
            onInput={() => { stopPlay(); requestAnimationFrame(() => applyCut(cutFromSlider(), true)); }}
            onChange={() => applyCut(cutFromSlider(), false)}
          />
        </div>
        <div className="tlabel">
          <b>{termOf(cNow)}</b>
          <span>{new Date(cNow).toLocaleDateString('zh-CN')}</span>
          <span>{vis.length} 石</span>
        </div>
        <button className="tclose" aria-label="收起时光" onClick={closeTime}>
          <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" /></svg>
        </button>
      </div>
    </section>
  );
};
