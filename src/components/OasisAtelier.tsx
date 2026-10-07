// src/components/OasisAtelier.tsx
// 🪵 工坊 Atelier：做过的东西，每件留一页。
//   L0 册页：报头题签 → 获奖年表 → 每件作品一本摊开的册页（左画心、右题跋，逐开对调）→ 书签。
//   L1 项目页：点画心 / 标题 / 「展开全页」，画面从册页原位展开成项目页（FLIP），印章最后落下。
//   控件一律用印刷品的语言，不用 App 式药丸 / 图标砖 / 光晕：目录带引线、出处用中文序号、决策用「按」、
//   图下有「图一」题注、档案式表格、〔〕标注、文字按钮加一道细墨线。材质取自博物馆 CC0 藏品（见 atelier.css 文件头）。
//   地址 #/atelier/<projectId> 可直达、可分享、后退可关闭（与 garden 阅读舱同一套）。
//   数据：src/data/projects.ts（静态）。样式与全部规矩：./atelier/atelier.css 文件头。
//   动效分工：滚动编排全在 CSS 滚动时间线里；JS 只管「只播一次」的事——设色、溪上光点、宣传片、FLIP。
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from 'framer-motion';
import { PROJECTS, ganzhiYear, leafOrdinal, type Project, type Stone, type StoneKind, type ProjectLink } from '../data/projects';
import { currentSolarTerm } from '../lib/solarTerms';
import { useHashRoute } from '../lib/route';
import { emitMikuSignal } from '../lib/mikuSignal';
import './atelier/atelier.css';

type CSSVars = React.CSSProperties & Record<`--${string}`, string | number>;

const parseDay = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
// 落款：干支年 + 节气 + 地点，例如「丙午年立夏 于悉尼」
const kuanOf = (p: Project) => {
  const d = parseDay(p.kuanDate);
  return `${ganzhiYear(d.getFullYear())}年${currentSolarTerm(d).name} 于${p.place}`;
};
const BOOK_YEAR = ganzhiYear(Math.max(...PROJECTS.map((p) => parseDay(p.kuanDate).getFullYear())));
const STONE_LABEL: Record<StoneKind, string> = { h: '人', m: '模型', r: '规则' };
const NUMS = '一二三四五六七八九十';
const SEC_NUMS = '壹贰叁肆伍陆柒捌玖拾';
const fmtTime = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const fineHover = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

// ———————————————————— 小器物 ————————————————————

// 奖项印：白文，噪声位移让印边轻微啃蚀
const Seal: React.FC<{ text: [string, string] }> = ({ text }) => (
  <svg className="seal" viewBox="0 0 60 60" role="img" aria-label={`印：${text.join('')}`}>
    <rect className="bg" x="2" y="2" width="56" height="56" rx="4" filter="url(#atl-inkpad)" />
    <rect className="edge" x="6" y="6" width="48" height="48" rx="2" />
    <text x="31" y="27" textAnchor="middle">{text[0]}</text>
    <text x="31" y="49" textAnchor="middle">{text[1]}</text>
    <rect className="skip" x="2" y="2" width="56" height="56" rx="4" mask="url(#atl-ink-skip)" />
  </svg>
);
// 名章：朱文闲章「绿洲」，用站名代替真名
const NameChop = () => (
  <svg className="namechop" viewBox="0 0 24 24" role="img" aria-label="闲章：绿洲">
    <rect x="1.5" y="1.5" width="21" height="21" rx="2" />
    <text x="12" y="11" textAnchor="middle">绿</text>
    <text x="12" y="20.5" textAnchor="middle">洲</text>
    <rect className="skip" x="0" y="0" width="24" height="24" mask="url(#atl-ink-skip)" />
  </svg>
);
const StoneSym: React.FC<{ kind: StoneKind; className?: string }> = ({ kind, className = 'sym' }) => (
  <svg className={className} viewBox="0 0 36 28" aria-hidden><use href={`#atl-stone-${kind}`} /></svg>
);

// 一份 <defs>：三种石头、渐变、印泥滤镜。挂在 L0 根内，项目页（portal）同文档引用。
const AtelierDefs = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
    <defs>
      <radialGradient id="atl-g-peb" cx="38%" cy="32%" r="75%"><stop offset="0" style={{ stopColor: 'var(--peb-hi)' }} /><stop offset=".55" style={{ stopColor: 'var(--peb)' }} /><stop offset="1" style={{ stopColor: 'var(--peb-lo)' }} /></radialGradient>
      <radialGradient id="atl-g-jade" cx="38%" cy="34%" r="70%"><stop offset="0" style={{ stopColor: 'var(--jade-hi)' }} /><stop offset=".5" style={{ stopColor: 'var(--jade)' }} /><stop offset="1" style={{ stopColor: 'var(--jade-lo)' }} /></radialGradient>
      <radialGradient id="atl-g-halo" cx="50%" cy="50%" r="50%"><stop offset=".45" style={{ stopColor: 'var(--jade)', stopOpacity: 0 }} /><stop offset=".62" style={{ stopColor: 'var(--jade)', stopOpacity: 0.32 }} /><stop offset="1" style={{ stopColor: 'var(--jade)', stopOpacity: 0 }} /></radialGradient>
      <linearGradient id="atl-g-top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: 'var(--stone-hi)' }} /><stop offset="1" style={{ stopColor: 'var(--stone-mid)' }} /></linearGradient>
      {/* 人：空心卵石，樱粉描边，一道高光 */}
      <symbol id="atl-stone-h" viewBox="0 0 36 28">
        <ellipse cx="18" cy="21.5" rx="12.5" ry="3" style={{ fill: 'var(--stone-shadow)' }} />
        <path d="M6.2 15.4c-.4-5.6 4.8-9.6 11.6-9.7 6.9-.1 12.4 3.3 12.2 8.6-.2 5.4-5.6 8.4-12.4 8.3-6.6-.1-11-2.4-11.4-7.2Z" fill="url(#atl-g-peb)" style={{ stroke: 'var(--sakura-ink)' }} strokeWidth="1.1" />
        <path d="M10.5 11.2c1.8-1.6 4.4-2.4 7.2-2.4" fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="1.3" strokeLinecap="round" />
      </symbol>
      {/* 模型：一颗发光的青玉 */}
      <symbol id="atl-stone-m" viewBox="0 0 36 28">
        <circle cx="18" cy="14" r="13.5" fill="url(#atl-g-halo)" />
        <circle cx="18" cy="14" r="11" fill="none" style={{ stroke: 'var(--jade)' }} strokeOpacity=".28" strokeWidth=".8" />
        <circle cx="18" cy="14" r="7.4" fill="url(#atl-g-jade)" />
        <circle cx="18" cy="14" r="7.4" fill="none" style={{ stroke: 'var(--jade-lo)' }} strokeWidth=".8" strokeOpacity=".7" />
        <ellipse cx="15.6" cy="11.4" rx="2.6" ry="1.5" fill="#fff" fillOpacity=".7" transform="rotate(-24 15.6 11.4)" />
      </symbol>
      {/* 规则：切面分明的方石 */}
      <symbol id="atl-stone-r" viewBox="0 0 36 28">
        <ellipse cx="18" cy="23" rx="12" ry="2.6" style={{ fill: 'var(--stone-shadow)' }} />
        <path d="M7.5 9.6 17.6 5.4l10.9 4.1-10.2 4.4Z" fill="url(#atl-g-top)" style={{ stroke: 'var(--stone-line)' }} strokeWidth=".8" strokeLinejoin="round" />
        <path d="M7.5 9.6l10.8 4.3v8.3L7.5 18Z" style={{ fill: 'var(--stone-mid)', stroke: 'var(--stone-line)' }} strokeWidth=".8" strokeLinejoin="round" />
        <path d="M18.3 13.9l10.2-4.4V18l-10.2 4.2Z" style={{ fill: 'var(--stone-lo)', stroke: 'var(--stone-line)' }} strokeWidth=".8" strokeLinejoin="round" />
        <g style={{ fill: 'var(--stone-line)' }} fillOpacity=".55">
          <circle cx="11" cy="14.2" r=".45" /><circle cx="14.4" cy="17.6" r=".4" /><circle cx="22.4" cy="16.8" r=".45" />
          <circle cx="25.6" cy="13.4" r=".35" /><circle cx="16.6" cy="8.6" r=".4" /><circle cx="21.5" cy="9.4" r=".35" />
        </g>
      </symbol>
      {/* 印泥漏白：取自倪瓒《虞山林壑图》上乾隆「鉴赏」印里的细小漏墨斑（Met 1973.120.8，CC0），只取小斑不取字口 */}
      <mask id="atl-ink-skip" maskContentUnits="objectBoundingBox">
        <image href="/textures/inkpad-specks.webp" x="0" y="0" width="1" height="1" preserveAspectRatio="none" />
      </mask>
      <filter id="atl-inkpad" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" />
      </filter>
    </defs>
  </svg>
);

// 溪上光点：重新挂 class 让它再走一遍（只走一次，走完摘掉）
const runSpark = (brook: HTMLElement | null) => {
  if (!brook) return;
  brook.classList.remove('flowing');
  void brook.offsetWidth;
  brook.classList.add('flowing');
  brook.addEventListener('animationend', () => brook.classList.remove('flowing'), { once: true });
};

// —— 分工条：人 / 模型 / 规则 三种石头，溪水穿过；降级路径是从主流分出的支流 ——
const Stream = React.forwardRef<HTMLDivElement, { p: Project; fig: number; onEnter?: () => void }>(({ p, fig, onEnter }, brookRef) => {
  const n = p.stones.length;
  const kinds: StoneKind[] = ['h', 'm', 'r'];
  return (
    <figure className="stream" onPointerEnter={onEnter}>
      <div className="brook" ref={brookRef} style={{ '--n': n } as CSSVars}>
        <span className="water" aria-hidden><i className="bank t" /><i className="bank b" /><i className="ripple" /></span>
        <span className="thread" aria-hidden />
        <span className="spark" aria-hidden />
        {p.stones.map((s: Stone, j) => (
          <div key={j} className={`stone k-${s.kind}`} style={{ '--j': j } as CSSVars}>
            <StoneSym kind={s.kind} />
            <span className="nm"><span className="sr-only">{STONE_LABEL[s.kind]}：</span>{s.name}</span>
            {s.sub && <span className="sub">{s.sub}</span>}
          </div>
        ))}
      </div>
      {p.branch && (
        <div className="branch" style={{ '--n': n, '--at': p.branch.at } as CSSVars}>
          <svg className="trib" viewBox="0 0 40 30" aria-hidden>
            <path className="w" d="M3 -2 C3 16 14 22 38 22" /><path className="c" d="M3 -2 C3 16 14 22 38 22" />
          </svg>
          <span className="why">{p.branch.why}</span>
          <StoneSym kind={p.branch.stone.kind} className="sym sm" />
          <span className="nm">{p.branch.stone.name}</span>
        </div>
      )}
      <figcaption>
        <span className="fig">图{NUMS[fig]}</span>人、模型与规则的分工
        <span className="legend">
          {kinds.map((k) => <span key={k}><StoneSym kind={k} className="" />{STONE_LABEL[k]}</span>)}
        </span>
      </figcaption>
    </figure>
  );
});
Stream.displayName = 'Stream';

// 出处：像书后的「参见」，一行一条：序号、名目、引线、去处
const LinkRow: React.FC<{ l: ProjectLink; i: number }> = ({ l, i }) => {
  const inner = (
    <>
      <span className="no">{NUMS[i]}</span>
      <span className="lb">{l.label}{l.live && <em className="live">在线</em>}</span>
      <span className="lead" aria-hidden />
      <span className="nt">{l.note}</span>
      <span className="ext" aria-hidden>{l.href ? '↗' : ''}</span>
    </>
  );
  return l.href
    ? <a className="lnk" href={l.href} target="_blank" rel="noopener noreferrer">{inner}</a>
    : <div className="lnk mute">{inner}</div>;
};

// 画心：墨稿 / 中心设色 / 全幅设色 三层同图叠放 + 宣传片
const Canvas: React.FC<{ p: Project; videoRef?: React.Ref<HTMLVideoElement>; autoSrc?: boolean }> = ({ p, videoRef, autoSrc }) => (
  <div className="canvas">
    <div className="layer ink" aria-hidden><img src={p.still} alt="" width={1200} height={900} loading="lazy" decoding="async" /></div>
    <div className="layer core" aria-hidden><img src={p.still} alt="" width={1200} height={900} loading="lazy" decoding="async" /></div>
    <div className="layer full"><img src={p.still} alt={`${p.title} 界面`} width={1200} height={900} loading="lazy" decoding="async" /></div>
    <video
      ref={videoRef}
      className="promo"
      muted loop playsInline
      preload="none"
      poster={p.still}
      src={autoSrc ? p.promo : undefined}
      aria-hidden={!autoSrc}
      aria-label={autoSrc ? `${p.title} 宣传片，12 秒，无声` : undefined}
    />
  </div>
);

// ———————————————————— L0 一开册页 ————————————————————

interface OpenFrom { id: string; rect: DOMRect; x: number | null; y: number | null }
type OpenFn = (id: string, e: React.MouseEvent, mountEl: HTMLElement | null) => void;

const Spread: React.FC<{ p: Project; index: number; rootRef: React.RefObject<HTMLDivElement | null>; reduce: boolean; onOpen: OpenFn }> = ({ p, index, rootRef, reduce, onOpen }) => {
  const spreadRef = useRef<HTMLElement>(null);
  const mountRef = useRef<HTMLButtonElement>(null);
  const brookRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const tintedRef = useRef(false);

  // 设色只播一次：进入视野（或指针先到）时色从画心透出，随后一粒光沿溪走一遍
  const tint = useCallback(() => {
    if (tintedRef.current || !spreadRef.current) return;
    tintedRef.current = true;
    spreadRef.current.classList.add('tinted');
    if (!reduce) window.setTimeout(() => runSpark(brookRef.current), 900);
  }, [reduce]);

  useEffect(() => {
    const el = spreadRef.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) { tint(); return; }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { tint(); io.disconnect(); }
    }, { root: rootRef.current, threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [rootRef, tint]);

  // 宣传片：桌面端悬停才加载并播放，移开即停；触屏与 reduced-motion 只显示主图
  const hoverTimer = useRef(0);
  const onMountEnter = () => {
    tint();
    const v = videoRef.current, m = mountRef.current;
    if (!v || !m || reduce || !fineHover()) return;
    window.clearTimeout(hoverTimer.current);
    if (!v.src) v.src = p.promo;
    v.play().then(() => m.classList.add('playing')).catch(() => {});
  };
  const onMountLeave = () => {
    const v = videoRef.current, m = mountRef.current;
    if (!v || !m) return;
    m.classList.remove('playing');
    hoverTimer.current = window.setTimeout(() => { if (!m.classList.contains('playing')) v.pause(); }, 600);
  };
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const open = (e: React.MouseEvent) => {
    videoRef.current?.pause();
    mountRef.current?.classList.remove('playing');
    onOpen(p.id, e, mountRef.current);
  };
  const flip = index % 2 === 1;

  return (
    <section className="leaf-slot" id={`leaf-${p.id}`} data-id={p.id} style={{ scrollMarginTop: 72 }}>
      <article ref={spreadRef} className={`spread${flip ? ' flip' : ''}`} style={{ '--c': p.color } as CSSVars} aria-labelledby={`leaf-title-${p.id}`}>
        <div className="tex-paper" aria-hidden />
        <div className="page pg-art">
          <svg className="imprint" viewBox="0 0 60 60" aria-hidden>
            <rect x="2" y="2" width="56" height="56" rx="4" />
            <text x="31" y="27" textAnchor="middle">{p.seal[0]}</text>
            <text x="31" y="49" textAnchor="middle">{p.seal[1]}</text>
          </svg>
          <button ref={mountRef} className="mount" type="button" onClick={open} onPointerEnter={onMountEnter} onPointerLeave={onMountLeave} aria-label={`打开 ${p.title} 项目页`}>
            <Canvas p={p} videoRef={videoRef} />
          </button>
          <div className="mount-cap">
            <span className="kind">{p.capture}</span>
            <button className="cap-play" type="button" onClick={open}>看宣传片<span className="num">0:12</span></button>
          </div>
        </div>
        <div className="page pg-text">
          <div className="ins-top">
            <div>
              <div className="eyebrow"><span className="ord">{leafOrdinal(index)}</span><i /><span>{p.kind}</span></div>
              <h2 className="ins-title" id={`leaf-title-${p.id}`}><button type="button" onClick={open}>{p.title}</button></h2>
            </div>
            <Seal text={p.seal} />
          </div>
          <p className="ins-line">{p.line}</p>
          <p className="award"><b>{p.award[0]}</b><span className="sep">·</span>{p.award[1]}</p>
          <dl className="meta">
            <dt>角色</dt><dd>{p.role}</dd>
            <dt>团队</dt><dd>{p.team}</dd>
            <dt>时间</dt><dd><span className="num">{p.when}</span>{p.whenNote && <small>{p.whenNote}</small>}</dd>
            <dt>介质</dt><dd>{p.stack}</dd>
          </dl>
          <Stream ref={brookRef} p={p} fig={index} onEnter={() => { if (tintedRef.current && !reduce) runSpark(brookRef.current); }} />
          <p className="decision"><span className="an">按</span><span className="sr-only">：</span>{p.decision}</p>
          <div className="links">{p.links.slice(0, 2).map((l, i) => <LinkRow key={l.label} l={l} i={i} />)}</div>
          <div className="ins-foot">
            <button className="go-page" type="button" onClick={open}>展开全页<span className="arw" aria-hidden>⟶</span></button>
            <div className="kuan"><p>{kuanOf(p)}</p><NameChop /></div>
          </div>
        </div>
      </article>
    </section>
  );
};

// ———————————————————— L1 项目页 ————————————————————

const ProjectSheet: React.FC<{
  p: Project; from: OpenFrom | null; reduce: boolean; closing: boolean;
  onClose: () => void; onStep: (d: number) => void;
}> = ({ p, from, reduce, closing, onClose, onStep }) => {
  const paintRef = useRef<HTMLDivElement>(null);
  const brookRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(true);

  // FLIP：画面从册页里的原位置直接放大成项目页的画面；其余内容随后逐段浮出
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    closeRef.current?.focus({ preventScroll: true });
    const el = paintRef.current;
    if (!el || !from || reduce || !el.animate) return;
    const to = el.getBoundingClientRect();
    if (to.width <= 0) return;
    const s = from.rect.width / to.width;
    el.style.transformOrigin = '0 0';
    el.animate([
      { transform: `translate(${from.rect.left - to.left}px, ${from.rect.top - to.top}px) scale(${s})` },
      { transform: 'translate(0, 0) scale(1)' },
    ], { duration: 680, easing: 'cubic-bezier(.22,1,.36,1)' });
  }, [p.id, from, reduce]);

  // 宣传片自动静音循环；光点在画面落定后走一遍
  useEffect(() => {
    const v = videoRef.current;
    const t1 = reduce ? 0 : window.setTimeout(() => { v?.play().catch(() => setPaused(true)); }, 700);
    const t2 = reduce ? 0 : window.setTimeout(() => runSpark(brookRef.current), 700);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); v?.pause(); };
  }, [p.id, reduce]);
  useEffect(() => { if (closing) videoRef.current?.pause(); }, [closing]);

  const onTime = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (barRef.current) barRef.current.style.transform = `scaleX(${v.currentTime / (v.duration || 12)})`;
    if (timeRef.current) timeRef.current.textContent = fmtTime(v.currentTime);
  }, []);
  const toggleVideo = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  };

  let d = 0;
  const stagger = () => ({ '--d': `${(d++) * 55}ms` } as CSSVars);
  const idx = PROJECTS.findIndex((x) => x.id === p.id);

  return (
    <div
      ref={scrollRef}
      className={`atl overlay${closing ? ' closing' : ''}`}
      role="dialog" aria-modal="true" aria-labelledby="atl-sheet-title"
      style={{ '--c': p.color } as CSSVars}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="scrim" onClick={onClose} />
      <article key={p.id} className={`sheet${from && !reduce ? ' flying' : ''}`}>
        <div className="sheet-bg"><div className="tex-paper" aria-hidden /></div>
        <div className="sheet-bar" style={stagger()}>
          <div className="eyebrow"><span className="ord">{leafOrdinal(idx)}</span><i /><span>{p.kind}</span></div>
          <div className="nav">
            <button className="tx" type="button" onClick={() => onStep(-1)}><span aria-hidden>‹ </span>上一件</button>
            <button className="tx" type="button" onClick={() => onStep(1)}>下一件<span aria-hidden> ›</span></button>
            <span className="nav-sep" aria-hidden />
            <button ref={closeRef} className="tx" type="button" onClick={onClose}>合上</button>
          </div>
        </div>
        <div className="sheet-head" style={stagger()}>
          <div>
            <h2 id="atl-sheet-title">{p.title}</h2>
            <p className="ins-line">{p.line}</p>
            <p className="award"><b>{p.award[0]}</b><span className="sep">·</span>{p.award[1]}</p>
          </div>
          <div className="sealbox"><Seal text={p.seal} /></div>
        </div>
        <dl className="meta" style={stagger()}>
          <dt>角色</dt><dd>{p.role}</dd>
          <dt>团队</dt><dd>{p.team}</dd>
          <dt>时间</dt><dd><span className="num">{p.when}</span>{p.whenNote && <small>{p.whenNote}</small>}</dd>
          <dt>介质</dt><dd>{p.stack}</dd>
        </dl>
        <div className="sheet-paint tinted" ref={paintRef} style={stagger()}>
          <div className="mount">
            <Canvas p={p} videoRef={videoRef} autoSrc />
            {/* 片长超过 5 秒必须能停（WCAG 2.2.2）：一枚小签条 + 画心底边一道放映进度细线 */}
            <i className="vbar" ref={barRef} aria-hidden />
            <button className="vctl" type="button" onClick={toggleVideo} aria-label={paused ? '放映宣传片' : '暂停宣传片'}>
              {paused ? '放映' : '暂停'}<span className="num"><span ref={timeRef}>0:00</span> / 0:12</span>
            </button>
          </div>
        </div>
        {/* 宣传片的事件挂在这里：video 由 Canvas 渲染，监听用 ref 绑定 */}
        <VideoEvents videoRef={videoRef} onTime={onTime} onPlayState={setPaused} />
        <div style={stagger()}><Stream ref={brookRef} p={p} fig={0} onEnter={() => { if (!reduce) runSpark(brookRef.current); }} /></div>
        <div className="sec" style={stagger()}><h3><span className="no">{SEC_NUMS[0]}</span>问题</h3><p>{p.problem}</p></div>
        <div className="sec" style={stagger()}>
          <h3><span className="no">{SEC_NUMS[1]}</span>我做了什么</h3>
          <ul>{p.did.map(([k, v]) => <li key={k}><b>{k}</b><span>{v}</span></li>)}</ul>
        </div>
        <div className="sec" style={stagger()}>
          <h3><span className="no">{SEC_NUMS[2]}</span>一条决策</h3>
          <div className="adr">
            <div className="h"><b>{p.adr.title}</b></div>
            <dl>
              <dt>背景</dt><dd>{p.adr.ctx}</dd>
              <dt>决定</dt><dd>{p.adr.dec}</dd>
              <dt>代价</dt><dd>{p.adr.cost}</dd>
            </dl>
          </div>
        </div>
        <div className="sec" style={stagger()}>
          <h3><span className="no">{SEC_NUMS[3]}</span>结果与复盘{p.resultFlag && <span className="flag warn">〔{p.resultFlag}〕</span>}</h3>
          <p>{p.result}</p>
        </div>
        <div className="ins-foot" style={stagger()}>
          <div className="links"><h3><span className="no">{SEC_NUMS[4]}</span>出处</h3>{p.links.map((l, i) => <LinkRow key={l.label} l={l} i={i} />)}</div>
          <div className="kuan"><p>{kuanOf(p)}</p><NameChop /></div>
        </div>
      </article>
    </div>
  );
};

const VideoEvents: React.FC<{ videoRef: React.RefObject<HTMLVideoElement | null>; onTime: () => void; onPlayState: (paused: boolean) => void }> = ({ videoRef, onTime, onPlayState }) => {
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sync = () => onPlayState(v.paused);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', sync);
    v.addEventListener('pause', sync);
    return () => { v.removeEventListener('timeupdate', onTime); v.removeEventListener('play', sync); v.removeEventListener('pause', sync); };
  }, [videoRef, onTime, onPlayState]);
  return null;
};

// ———————————————————— 场所 ————————————————————

export const OasisAtelier: React.FC = () => {
  const reduce = !!useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const [railOn, setRailOn] = useState<string>(PROJECTS[0]?.id ?? '');
  const [from, setFrom] = useState<OpenFrom | null>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  // 打开哪一件只看地址：#/atelier/<id> 可直达、可分享、浏览器后退即关闭；无效 id 当作没开
  const { route, navigate } = useHashRoute();
  const active = useMemo(
    () => (route.view === 'atelier' && route.itemId ? PROJECTS.find((p) => p.id === route.itemId) ?? null : null),
    [route.view, route.itemId],
  );
  const activeId = active?.id ?? null;

  const open: OpenFn = useCallback((id, e, mountEl) => {
    const keyboard = e.detail === 0;
    lastFocus.current = document.activeElement as HTMLElement | null;
    setFrom(mountEl
      ? { id, rect: mountEl.getBoundingClientRect(), x: keyboard ? null : e.clientX, y: keyboard ? null : e.clientY }
      : null);
    setClosing(false);
    navigate('atelier', id);
  }, [navigate]);

  const closeTimer = useRef(0);
  const close = useCallback(() => {
    if (!activeId || closing) return;
    const finish = () => {
      setClosing(false);
      setFrom(null);
      navigate('atelier');
      lastFocus.current?.focus({ preventScroll: true });
    };
    if (reduce) { finish(); return; }
    setClosing(true);
    closeTimer.current = window.setTimeout(finish, 320);
  }, [activeId, closing, reduce, navigate]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const step = useCallback((delta: number) => {
    if (!activeId) return;
    const i = PROJECTS.findIndex((p) => p.id === activeId);
    setFrom(null); // 翻页没有点击落点：主色光居中晕开，不做 FLIP
    navigate('atelier', PROJECTS[(i + delta + PROJECTS.length) % PROJECTS.length].id);
  }, [activeId, navigate]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, close, step]);

  useEffect(() => {
    emitMikuSignal({ type: active ? 'focus-open' : 'focus-close', source: 'atelier-sheet' });
    return () => emitMikuSignal({ type: 'focus-close', source: 'atelier-sheet' });
  }, [active]);

  // 书签：视口中线落在哪一开，就点亮哪一枚
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) setRailOn((e.target as HTMLElement).dataset.id ?? '');
    }), { root, rootMargin: '-48% 0px -48% 0px' });
    root.querySelectorAll('.leaf-slot').forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  // 年表 / 书签跳转：不改 hash（hash 归路由），直接滚到那一开（滚未变换的 .leaf-slot，落点才准）
  const goLeaf = (id: string) => {
    document.getElementById(`leaf-${id}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div ref={rootRef} className="atl atl-stage oasis-bottom-scroll-safe absolute inset-0 w-full h-full overflow-y-auto no-scrollbar z-10 pt-20 md:pt-28">
      <AtelierDefs />
      <div className="inner">
        {/* 封面：云纹缎裱的册板，左上贴一条纸题签 */}
        <header className="masthead">
          <div className="cover">
            <div className="tiqian"><div className="tex-paper" aria-hidden /><b>工坊</b><span>作品册 · {BOOK_YEAR}</span></div>
          </div>
          <p className="s">做过的东西，每件留一页。</p>
        </header>

        <nav className="annals" aria-labelledby="atl-toc">
          <h2 className="annals-h" id="atl-toc">目录</h2>
          {PROJECTS.map((p, i) => (
            <button key={p.id} type="button" className="annal" onClick={() => goLeaf(p.id)}>
              <span className="ord">{leafOrdinal(i)}</span>
              <span className="who"><b>{p.title}</b><span className="v">{p.venue}</span></span>
              <span className="lead" aria-hidden />
              <span className="what">{p.honor}</span>
              <span className="when num">{p.when}</span>
            </button>
          ))}
        </nav>

        {PROJECTS.map((p, i) => (
          <Spread key={p.id} p={p} index={i} rootRef={rootRef} reduce={reduce} onOpen={open} />
        ))}

        <nav className="rail" aria-label="翻到某一开">
          <span className="rail-line" aria-hidden><i /></span>
          {PROJECTS.map((p, i) => (
            <button key={p.id} type="button" className={railOn === p.id ? 'on' : ''} onClick={() => goLeaf(p.id)} aria-label={`${leafOrdinal(i)} · ${p.title}`}>
              <b /><span>{leafOrdinal(i)} · {p.title}</span>
            </button>
          ))}
        </nav>

        <p className="coda">还有你此刻所在的这座花园，<a href="#/garden">它的手记在花园里</a>。</p>
      </div>
      <div className="oasis-bottom-spacer" aria-hidden />

      {active && createPortal(
        <ProjectSheet p={active} from={from?.id === active.id ? from : null} reduce={reduce} closing={closing} onClose={close} onStep={step} />,
        document.body,
      )}
    </div>
  );
};
