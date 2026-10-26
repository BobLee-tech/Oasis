// 📜 园图引擎：仇英《独乐园图》卷做成一件 WebGL 实物——左轴右杆两端随展读一粗一细，
//   绢有织纹、夜里被烛光照出来；解带展卷（只给第一次来的人）、签条阻尼摆、走到哪一景那一景的签条就落下来。
//   全程不进 React（与星图 orchard/sandScene.ts 同一种做法）：卷的位置、签条的摆、缩略窗每帧直写 uniform / DOM，
//   React 只接四种回调：焦点景变了、主按钮的字变了、开合状态变了、要进某一处。
//   移植自书斋六版演示稿 docs/shuzhai-v6.html 的「庭」；去掉了室、展读、精修记与演示稿里虚构的访客数。
//   规矩：
//   · 输入只改目标值（P.tp），位置按指数追随（时间常数约 140ms），滚轮、拖动、键盘、缩略条手感一致。
//   · 卷的纸坐标 P（切片像素，高 1100）：[0, TUO) 拖尾纸（我们自己的，画题跋）→ [TUO, TOT) 原卷切片（左起《七咏》，右止包首）。
//   · 坑：GLSL 里 pow(负数, 2.) 在部分 GPU 出 NaN（卷筒整片发黑），一律用 sq()；if 分支里采样带 mipmap 会出贴图边框线。
//   · 切片优先读 KTX2（Basis ETC1S，scripts/yuantu-ktx2.mjs 生成）：显卡里一片约 1.5 MB，webp 解开是 12 MB；
//     转码器在 public/yuantu/basis/（three 自带那份）。读不到、建不起转码器，就退回 webp。卷首两片要在画布上题字，仍走 webp。
import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { SCENES, yStore, type Scene } from './scenes';
import { loadImg, mk } from '../../lib/paper/canvas';   // 纸的工具箱：与尺牍共用
import { dprGovernor, nextFrame, texturesOf, uploadSpread, warmPrograms } from '../../lib/paper/pace';
import { playPaper } from '../../lib/paperSound';
import { gust } from '../../lib/wind';

export type RollState = 'closed' | 'opening' | 'open' | 'closing';

export interface ScrollSceneOptions {
  root: HTMLElement;
  dust: HTMLCanvasElement;
  band: HTMLElement;
  track: HTMLElement;
  mini: HTMLElement;
  miniWin: HTMLElement;
  /** 素材根（默认 /yuantu，可由 VITE_YUANTU_BASE 换到 R2） */
  base: string;
  night: boolean;
  reduce: boolean;
  coarse: boolean;
  /** 开卷后展到哪一景 */
  start?: string;
  /** 「你在这里」：从哪一处进来的 */
  here?: string;
  /** 场所名；未开的景返回 null */
  placeName: (s: Scene) => string | null;
  onFocus: (id: string | null) => void;
  onPrimary: (label: string) => void;
  onState: (s: RollState) => void;
  onEnter: (s: Scene) => void;
  onToast: (text: string) => void;
  /** 素材到齐、第一帧排上了：画布可以淡入 */
  onReady?: () => void;
}

export interface ScrollScene {
  setNight(night: boolean): void;
  unroll(): void;
  primary(): void;
  goToScene(id: string): void;
  destroy(): void;
}

export const hasWebGL2 = (): boolean => {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
};

/* ───── 卷的几何 ───── */
const SC = { w: 40677, h: 1100, tiles: [...Array<number>(19).fill(2048), 1765] };
const F2T = (f: number) => (f - 15000) * 0.388144;   // 原图全分辨率 x → 切片 x
const TUO = 2600, TOT = TUO + SC.w, WRAP = 1400;      // WRAP：最外一圈包首锦的长度
const MT = 72, MB = 47;                               // 原卷天地绫边的高度（切片像素）
const YIN = 36400;                                    // 引首「绿洲」的位置（切片 x）
const FRONT_DECOR: [number, number] = [35600, 37150];
const TB_ACT = { Pt: 1240, ty: 560 }, TB_SEAL = { Pt: 1740, ty: 470 };

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ───── 缓动 ───── */
type Ease = (t: number) => number;
const power2InOut: Ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const power3InOut: Ease = (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);
const power2Out: Ease = (t) => 1 - (1 - t) ** 3;
// 展卷：起得慢、收得长（两段贝塞尔，与六版的 CustomEase 同一条）
type Pt2 = [number, number];
const bezier = (p0: Pt2, p1: Pt2, p2: Pt2, p3: Pt2) => (t: number): Pt2 => {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
};
const solveX = (f: (t: number) => Pt2, x: number) => {
  let lo = 0, hi = 1;
  for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (f(m)[0] < x) lo = m; else hi = m; }
  return f((lo + hi) / 2)[1];
};
const UNROLL_A = bezier([0, 0], [0.38, 0], [0.24, 0.74], [0.52, 0.9]);
const UNROLL_B = bezier([0.52, 0.9], [0.7, 1], [0.84, 1], [1, 1]);
const unrollEase: Ease = (x) => (x <= 0.52 ? solveX(UNROLL_A, x) : solveX(UNROLL_B, x));

/* ═════════════ 着色器 ═════════════ */
const STRIP_V = /* glsl */`
uniform float uL, uR, urL, urR, uhL, uhR, uTop, uH, uTrackX, uK;
attribute float aSeg; attribute float aT; attribute float aV;
varying vec3 vW; varying vec3 vN; varying float vP; varying float vY; varying float vSeg;
const float PI = 3.14159265;
void main() {
  float y = -(uTop + aV * uH);
  float u; vec3 p; vec3 n;
  if (aSeg < .5) {            // 左轴：纸从卷筒底下接出来，看得见的是上半圈
    float th = mix(PI * .5, PI * 1.5, aT);
    u = uL - th * urL;
    p = vec3(uL - urL * sin(th), y, uhL - urL * cos(th)); n = vec3(-sin(th), 0., -cos(th));
  } else if (aSeg < 1.5) {    // 平铺在桌上的一段
    u = mix(uL, uR, aT); p = vec3(u, y, 0.); n = vec3(0., 0., 1.);
  } else {                    // 右杆
    float th = mix(PI * .5, PI * 1.5, aT);
    u = uR + th * urR;
    p = vec3(uR + urR * sin(th), y, uhR - urR * cos(th)); n = vec3(sin(th), 0., -cos(th));
  }
  vW = p; vN = n; vP = (u - uTrackX) / uK; vY = aV * 1100.; vSeg = aSeg;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
}`;
const LIGHT_GLSL = /* glsl */`
uniform float uNight, uFlick, uLRad; uniform vec3 uLight; uniform vec4 uHi;
vec3 shade(vec3 alb, vec3 N, vec3 W, float specAmt, float ao) {
  vec3 V = vec3(0., 0., 1.);
  vec3 Ld = normalize(vec3(-.45, .55, .7));
  float dif = max(dot(N, Ld), 0.);
  vec3 Hd = normalize(Ld + V);
  vec3 day = alb * (.78 + .3 * dif) * ao + vec3(1., .98, .94) * pow(max(dot(N, Hd), 0.), 30.) * .07 * specAmt;
  vec3 Lv = uLight - W; float d = length(Lv); vec3 Lp = Lv / d;
  float nd = max(dot(N, Lp), 0.);
  float att = 1. / (1. + d * d / (uLRad * uLRad));
  vec3 candle = vec3(1., .72, .45) * uFlick;
  vec3 Hn = normalize(Lp + V);
  float sp = pow(max(dot(N, Hn), 0.), 22.) * .26 * att * specAmt;
  vec3 amb = vec3(.12, .14, .18) + vec3(.05, .06, .08) * max(dot(N, normalize(vec3(.5, .6, .6))), 0.);
  vec3 night = alb * (amb + candle * nd * att * 1.55) * ao + candle * sp;
  vec3 col = mix(day, night, uNight);
  float hd = length(W.xy - uHi.xy) / uHi.z;
  return col * (1. + uHi.w * exp(-hd * hd * 2.) * mix(.06, .55, uNight));
}`;
const STRIP_F = /* glsl */`
uniform sampler2D uT0, uT1, uT2, uT3, uMini, uTail, uBack, uSilkN, uPaperN, uPaperC;
uniform vec4 uSlotI, uSlotW, uSlotOn;
uniform float uTUO, uSCW, uTOT, uWRAP, uCord, uTime, uL, uR, urL, urR;
varying vec3 vW; varying vec3 vN; varying float vP; varying float vY; varying float vSeg;
${LIGHT_GLSL}
float sq(float x) { return x * x; }
vec4 slot(sampler2D t, float i, float w, float on, float q) {
  float x = (q - i * 2048.) / w;
  float m = on * step(0., x) * step(x, 1.);
  return vec4(texture2D(t, vec2(clamp(x, 0., 1.), vY / 1100.)).rgb, m);
}
void main() {
  float v = vY / 1100.;
  float isBack = step(.5, abs(vSeg - 1.));
  // 正面：拖尾纸 | 原卷切片（四个槽位，没到的用缩略垫着）
  float q = vP - uTUO;
  vec3 pa = texture2D(uMini, vec2(clamp(q / uSCW, 0., 1.), v)).rgb;
  vec4 s;
  s = slot(uT0, uSlotI.x, uSlotW.x, uSlotOn.x, q); pa = mix(pa, s.rgb, s.a);
  s = slot(uT1, uSlotI.y, uSlotW.y, uSlotOn.y, q); pa = mix(pa, s.rgb, s.a);
  s = slot(uT2, uSlotI.z, uSlotW.z, uSlotOn.z, q); pa = mix(pa, s.rgb, s.a);
  s = slot(uT3, uSlotI.w, uSlotW.w, uSlotOn.w, q); pa = mix(pa, s.rgb, s.a);
  vec3 tail = texture2D(uTail, vec2(clamp(vP / uTUO, 0., 1.), v)).rgb;
  float isTail = step(vP, uTUO);
  vec3 front = mix(pa, tail, isTail);
  // 背面：背纸 | 最外一圈包首锦
  vec3 bp = mix(texture2D(uPaperC, vec2(vP, vY) / 760.).rgb, vec3(.91, .87, .79), .45);
  float wr = (vP - (uTOT - uWRAP)) / uWRAP;
  vec3 brocade = texture2D(uBack, vec2(clamp(wr, 0., 1.), v)).rgb;
  float isBro = step(0., wr);
  vec3 back = mix(bp, brocade, isBro);
  back *= 1. - .1 * (1. - smoothstep(0., 6., vY)) - .1 * (1. - smoothstep(0., 6., 1100. - vY));
  vec3 alb = mix(front, back, isBack);
  // 系带：只在左轴合卷时，绕卷筒一圈，丝绳的捻纹是斜的
  float cy = 640. - (1. - uCord) * 90.;
  float cw = 15. * smoothstep(0., .35, uCord);
  float cm = (1. - smoothstep(cw - 2., cw, abs(vY - cy))) * (1. - step(.5, vSeg)) * step(.001, uCord);
  vec3 cordC = vec3(.16, .2, .3) * (.78 + .34 * sin(vP * .42 + vY * .9)) + vec3(.06, .05, .02) * smoothstep(.6, 1., sin(vP * .42 + vY * .9));
  alb = mix(alb, cordC, cm);
  // 细部法线：画心用绢、其余用纸
  vec3 ns = texture2D(uSilkN, vec2(vP, vY) / 520.).xyz * 2. - 1.;
  vec3 np = texture2D(uPaperN, vec2(vP, vY) / 900.).xyz * 2. - 1.;
  vec3 dn = mix(ns, np, max(isBack * (1. - isBro * .3), isTail));
  dn.xy *= mix(.35, .9, uNight) * (1. - cm * .6); dn.y = -dn.y;
  vec3 N = normalize(vN);
  vec3 T = normalize(vec3(N.z, 0., -N.x));
  N = normalize(T * dn.x + vec3(0., 1., 0.) * dn.y + N * dn.z);
  // 卷筒与平纸相接处的暗（AO），昼里左轴投在画上的一道影
  float dl = vW.x - (uL + urL), dr = (uR - urR) - vW.x;
  float ao = 1. - (1. - isBack) * (.16 * (1. - smoothstep(0., urL * .9, dl)) + .12 * (1. - smoothstep(0., urR * .9, dr)));
  ao *= 1. - (1. - isBack) * (1. - uNight) * .12 * (1. - smoothstep(0., urL * 1.6 + 8., dl));
  ao *= 1. - isBack * .18 * pow(abs(vN.x), 3.);
  float specAmt = mix(1., .5, isBack) * (1. + cm * 1.5);
  vec3 col = shade(alb, N, vW, specAmt, ao);
  // 卷筒：昼里左上来光，迎光一侧亮、背光一侧沉，中线偏左一道柔和的高光
  float nx = vN.x;
  float cyl = mix(1., (.9 + .16 * (1. - smoothstep(-.9, .2, nx))) * (1. - .3 * smoothstep(.15, 1., nx)), isBack * (1. - uNight));
  // 夜里卷筒的弧面多半背着烛，给卷背补一层暖的室内反光，留住纸的颜色
  col += isBack * uNight * alb * vec3(.30, .24, .17) * (.55 + .45 * max(N.z, 0.));
  col = col * cyl + isBack * (1. - uNight) * vec3(1., .98, .93) * .07 * exp(-sq((nx + .35) / .22));
  gl_FragColor = vec4(col, 1.);
}`;
const KNOB_V = /* glsl */`
varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main() { vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vUv = uv; gl_Position = projectionMatrix * viewMatrix * w; }`;
const KNOB_F = /* glsl */`
uniform sampler2D uJade; uniform float uTime;
varying vec3 vN; varying vec3 vW; varying vec2 vUv;
${LIGHT_GLSL}
void main() {
  vec3 j = texture2D(uJade, vec2(vUv.x * 1.4, vUv.y * .5 + vW.y * .002)).rgb;
  vec3 alb = mix(vec3(.80, .85, .74), j * vec3(.88, .97, .84), .5);
  float ring = 1. - .22 * (1. - smoothstep(.0, .035, abs(vUv.y - .28))) - .18 * (1. - smoothstep(.0, .05, abs(vUv.y - .9)));
  vec3 N = normalize(vN);
  vec3 c = shade(alb * ring, N, vW, 4.5, 1.);
  float rim = pow(1. - max(N.z, 0.), 2.);
  c += mix(vec3(.10, .12, .08), vec3(.22, .13, .05) * uFlick, uNight) * rim;
  c += uNight * alb * vec3(.26, .22, .16);
  gl_FragColor = vec4(c, 1.);
}`;
const SHADOW_V = /* glsl */`varying vec3 vW2; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW2 = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SHADOW_F = /* glsl */`
uniform vec4 uRL, uRR, uFlat; uniform float uKnobH, uKnobR;
uniform vec3 uLight; uniform float uNight;
varying vec3 vW2;
float sdBox(vec2 p, vec2 c, vec2 h) { vec2 d = abs(p - c) - h; return length(max(d, 0.)) + min(max(d.x, d.y), 0.); }
vec2 off(float h, vec2 c) { vec2 dd = vec2(.64, -.79) * h; vec2 nn = (c - uLight.xy) * h / max(uLight.z - h, 40.); return mix(dd, nn, uNight); }
float soft(float sd, float b) { return 1. - smoothstep(-b, b, sd); }
void main() {
  vec2 p = vW2.xy;
  float midY = (uFlat.z + uFlat.w) * .5, hy = (uFlat.z - uFlat.w) * .5;
  vec2 fc = vec2((uFlat.x + uFlat.y) * .5, midY), fh = vec2((uFlat.y - uFlat.x) * .5, hy);
  float a0 = soft(sdBox(p, fc + off(14., fc) + vec2(0., -10.), fh), 46.) * .10;
  float a1 = soft(sdBox(p, fc + off(2.5, fc), fh), 5.) * .24;
  vec2 cl = vec2(uRL.x, midY); float hl = uRL.z + uRL.y;
  float a2 = soft(sdBox(p, cl + off(hl * .85, cl), vec2(uRL.y * .9, hy + uKnobH * .9)), 4. + hl * .5) * .34;
  float a3 = soft(sdBox(p, cl, vec2(uRL.y * .75, hy + uKnobH)), 3. + uRL.y * .35) * .22;
  vec2 cr = vec2(uRR.x, midY); float hr = uRR.z + uRR.y;
  float a4 = soft(sdBox(p, cr + off(hr * .85, cr), vec2(uRR.y * .9, hy)), 4. + hr * .5) * .3;
  float a = 1. - (1. - a0) * (1. - a1) * (1. - a2) * (1. - a3) * (1. - a4);
  a *= mix(1., 1.35, uNight);
  gl_FragColor = vec4(0., 0., 0., a);
}`;

/* ═════════════ 引擎 ═════════════ */
interface Tile { i: number; x: number; w: number; tex: THREE.Texture | null; st: 0 | 1 | 2; used: number }
interface Overlay { el: HTMLElement; Pt: number; ty: number; tw?: number; th?: number }
interface SlipPhys { phi: number; w: number; drop: number; dv: number }
interface SceneRig { s: Scene; slip: Overlay; sw: HTMLElement; str: HTMLElement; card: HTMLElement; ph: SlipPhys; open: boolean }
interface Tween { get: () => number; set: (v: number) => void; to: number; from: number | null; t0: number; dur: number; ease: Ease; done: () => void }

export const createScrollScene = (o: ScrollSceneOptions): ScrollScene => {
  const { root, dust, band, track, mini, miniWin, base, reduce: RM, coarse } = o;
  // 画的节制：卷静止、没有补间、烛没挪时不 render（frame() 末尾比一串状态签名）；尺寸变了就记一笔
  let dirty = true;
  const written = new WeakMap<HTMLElement, Record<string, string>>();
  /** 值没变就不写：静止时每帧几十次同值写入会让样式整棵重算（--lx 挂在根上） */
  const put = (el: HTMLElement, k: string, v: string) => {
    let w = written.get(el); if (!w) written.set(el, (w = {}));
    if (w[k] === v) return; w[k] = v;
    if (k.startsWith('--')) el.style.setProperty(k, v); else (el.style as unknown as Record<string, string>)[k] = v;
  };
  // 画布每次建卷都新开一块、拆卷时连同上下文一起丢掉：React 开发模式会「挂载 → 卸载 → 再挂载」，
  //   复用同一块画布会拿到已经 forceContextLoss 的上下文（three 读 precision 时直接崩）
  const canvas = document.createElement('canvas');
  canvas.className = 'yt-gl'; canvas.setAttribute('aria-hidden', 'true');
  root.appendChild(canvas);
  const A = {
    paper: `${base}/tex/yinshou-paper.webp`, mount: `${base}/tex/mount-silk.webp`, cloud: `${base}/tex/cloud-ling.webp`,
    inkmask: `${base}/tex/ink-mask.webp`, specks: '/textures/inkpad-specks.webp', s00: `${base}/seals/s00.webp`, s07: `${base}/seals/s07.webp`,
  };
  const IMG: Partial<Record<keyof typeof A, HTMLImageElement>> = {};
  let alive = true;

  /* ───── 纹理烘焙：卷面上的字与印都画进纹理，好跟着纸卷上卷筒 ───── */
  // 竖排一列：标点挪到字格右上
  const vcol = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, lh = 1.12) => {
    let yy = y;
    for (const ch of text) {
      if ('，。、；：'.includes(ch)) ctx.fillText(ch, x + size * 0.3, yy - size * 0.32); else ctx.fillText(ch, x, yy);
      yy += size * lh;
    }
  };
  // 墨：先画一层 3px 的晕，再画实字，最后用泼墨浓淡做遮罩；整层以正片叠底落到纸上
  //   span：dst 上有字的那一段横向范围——墨层只开这么宽（模糊与遮罩按面积算，整张切片开层是白花功夫）
  const inkLayer = (dst: CanvasRenderingContext2D, ox: number, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, span: [number, number] = [0, w], color = '#191510') => {
    const x0 = Math.max(0, Math.floor(span[0])), lw = Math.min(w, Math.ceil(span[1])) - x0;
    if (lw <= 0) return;
    const L = mk(lw, h), c = L.getContext('2d')!, dx = -ox - x0;
    c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.save(); c.translate(dx, 0); c.filter = 'blur(3px)'; c.globalAlpha = 0.32; draw(c); c.restore();
    c.save(); c.translate(dx, 0); c.filter = 'none'; c.globalAlpha = 1; draw(c); c.restore();
    if (IMG.inkmask) {
      const pat = c.createPattern(IMG.inkmask, 'repeat');
      if (pat) { pat.setTransform(new DOMMatrix().translate(dx, 0).scale(1.6)); c.globalCompositeOperation = 'destination-in'; c.fillStyle = pat; c.fillRect(0, 0, lw, h); }
    }
    dst.save(); dst.globalCompositeOperation = 'multiply'; dst.drawImage(L, x0, 0); dst.restore();
  };
  // 访客的「曾游」：先在小画布上刻好（白文：字处挖空），再整方钤到纸上，免得把纸也挖穿
  const drawSeal = (c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number) => {
    const n = Math.ceil(s * 1.1), cv = mk(n, n), k = cv.getContext('2d')!;
    k.translate(n / 2, n / 2);
    k.fillStyle = '#A8392B'; k.beginPath(); k.roundRect(-s / 2, -s / 2, s, s, s * 0.06); k.fill();
    k.globalCompositeOperation = 'destination-out'; k.fillStyle = '#000';
    k.font = `600 ${s * 0.36}px "Songti SC", "STSong", "Noto Serif SC", serif`; k.textAlign = 'center'; k.textBaseline = 'middle';
    k.fillText('曾', s * 0.2, -s * 0.19); k.fillText('游', s * 0.2, s * 0.21);   // 右起竖读
    if (IMG.specks) { k.globalAlpha = 0.55; k.drawImage(IMG.specks, -s / 2, -s / 2, s, s); }
    c.save(); c.translate(x, y); c.rotate(rot); c.globalCompositeOperation = 'multiply'; c.drawImage(cv, -n / 2, -n / 2); c.restore();
  };
  // 原卷切片上的引首题字：「绿洲」+ 款 + 真印
  const drawFront = (dst: CanvasRenderingContext2D, ox: number) => {
    inkLayer(dst, ox, dst.canvas.width, dst.canvas.height, (c) => {
      c.font = '400 560px "Qiji Ink"'; c.fillText('绿', 36780, 560); c.fillText('洲', 36150, 560);
      c.font = '400 44px "LXGW WenKai Screen"'; c.fillStyle = '#2B241B'; vcol(c, '丙午寒露　园丁题于南半球', 35770, 215, 44, 1.14);
    }, [FRONT_DECOR[0] - ox, FRONT_DECOR[1] - ox]);
    if (IMG.s00) { dst.save(); dst.globalCompositeOperation = 'multiply'; dst.globalAlpha = 0.92; dst.drawImage(IMG.s00, 35770 - ox - 44, 830, 88, 83); dst.restore(); }
  };
  // 拖尾纸：天地绫边、隔水、题跋与访客自己的印（只存在这台设备上，不编造别人的印）
  let tailCanvas: HTMLCanvasElement | null = null;
  const paintTail = () => {
    const W = TUO, H = SC.h, cv = tailCanvas || (tailCanvas = mk(W, H)), c = cv.getContext('2d')!;
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.fillStyle = '#EBE2CD'; c.fillRect(0, 0, W, H);
    if (IMG.paper) { c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.55; c.fillStyle = c.createPattern(IMG.paper, 'repeat')!; c.fillRect(0, 0, W, H); }
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    if (IMG.mount) for (let x = 0; x < W; x += 1024) { c.drawImage(IMG.mount, x, 0, 1024, MT); c.drawImage(IMG.mount, x, H - MB, 1024, MB); }
    const gx = W - 64;
    if (IMG.cloud) { c.save(); c.fillStyle = c.createPattern(IMG.cloud, 'repeat')!; c.globalAlpha = 0.9; c.fillRect(gx, MT, 64, H - MT - MB); c.restore(); }   // 隔水
    c.fillStyle = 'rgba(80,62,34,.35)'; c.fillRect(0, MT - 1, W, 1.5); c.fillRect(0, H - MB, W, 1.5); c.fillRect(gx, MT, 1.5, H - MT - MB);
    const eg = c.createLinearGradient(0, 0, 60, 0); eg.addColorStop(0, 'rgba(60,40,20,.28)'); eg.addColorStop(1, 'rgba(60,40,20,0)'); c.fillStyle = eg; c.fillRect(0, 0, 60, H);
    const stamped = yStore.get('stamped', false);
    inkLayer(c, 0, W, H, (cc) => {
      cc.font = '400 120px "Qiji Ink"'; vcol(cc, '题跋', 2380, 260, 120, 1.08);
      cc.font = '400 46px "LXGW WenKai Screen"'; cc.fillStyle = '#2B241B';
      vcol(cc, '走到卷尾的人，', 2230, 236, 46); vcol(cc, '在这里钤一方印。', 2160, 236, 46);
      if (stamped) vcol(cc, '这一方是你的。', 2090, 236, 46);
      cc.font = '400 36px "LXGW WenKai Screen"'; cc.fillStyle = '#6D5F49'; vcol(cc, '余纸虚以待跋', 700, 300, 36, 1.3);
    }, [600, 2500]);
    if (stamped) drawSeal(c, TB_SEAL.Pt, TB_SEAL.ty, 118, -0.06);
    return cv;
  };
  // 包首锦（卷背最外一圈）：青绿地、浅云纹，上贴题签「绿洲园图」
  const paintBack = () => {
    const W = WRAP, H = SC.h, cv = mk(W, H), c = cv.getContext('2d')!;
    c.fillStyle = '#2C4743'; c.fillRect(0, 0, W, H);
    if (IMG.cloud) { c.globalCompositeOperation = 'screen'; c.globalAlpha = 0.42; const p = c.createPattern(IMG.cloud, 'repeat')!; p.setTransform(new DOMMatrix().scale(0.7)); c.fillStyle = p; c.fillRect(0, 0, W, H); }
    if (IMG.paper) { c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.5; c.fillStyle = c.createPattern(IMG.paper, 'repeat')!; c.fillRect(0, 0, W, H); }
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    const sx = W - 387, sw = 104, y0 = 54, y1 = 520;   // 合卷时正好朝上
    c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 6; c.shadowOffsetY = 2; c.fillStyle = '#EFE6CF'; c.fillRect(sx - sw / 2, y0, sw, y1 - y0); c.restore();
    if (IMG.paper) { c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.6; c.fillStyle = c.createPattern(IMG.paper, 'repeat')!; c.fillRect(sx - sw / 2, y0, sw, y1 - y0); }
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.strokeStyle = 'rgba(90,70,40,.45)'; c.lineWidth = 1.5; c.strokeRect(sx - sw / 2 + 7, y0 + 7, sw - 14, y1 - y0 - 14);
    inkLayer(c, 0, W, H, (cc) => { cc.font = '400 76px "Qiji Ink"'; vcol(cc, '绿洲园图', sx, y0 + 74, 76, 1.04); }, [sx - 100, sx + 100]);
    if (IMG.s07) { c.save(); c.globalCompositeOperation = 'multiply'; c.drawImage(IMG.s07, sx - 24, y1 - 72, 48, 35); c.restore(); }
    return cv;
  };

  /* ───── GL ───── */
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    canvas.remove();   // 建不起来就别留一块空画布，调用方会退回七景列表
    throw err;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
  // 慢机器（或 5K 屏）卷动时连着画都赶不上 42 帧，就一档档降像素比（见 lib/paper/pace.ts）
  const gov = dprGovernor(renderer.getPixelRatio(), (d) => { renderer.setPixelRatio(d); renderer.setSize(S.vw, S.vh, false); dirty = true; });
  renderer.setClearColor(0x000000, 0);
  renderer.debug.checkShaderErrors = import.meta.env.DEV;   // 线上不查报错：第一次用时 getProgramInfoLog 会同步等编译收尾
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -4000, 4000);
  const MAXANISO = renderer.capabilities.getMaxAnisotropy();
  const blank = new THREE.DataTexture(new Uint8Array([217, 204, 175, 255]), 1, 1); blank.needsUpdate = true;
  const owned: THREE.Texture[] = [blank];
  const texOf = (src: TexImageSource, rep = false) => {
    const t = new THREE.Texture(src as HTMLImageElement);
    t.colorSpace = THREE.NoColorSpace; t.flipY = false; t.anisotropy = MAXANISO; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.wrapS = t.wrapT = rep ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.needsUpdate = true;
    owned.push(t); return t;
  };

  const U = {
    uL: { value: 0 }, uR: { value: 0 }, urL: { value: 10 }, urR: { value: 4 }, uhL: { value: 10 }, uhR: { value: 4 },
    uTop: { value: 0 }, uH: { value: 1 }, uTrackX: { value: 0 }, uK: { value: 1 },
    uT0: { value: blank as THREE.Texture }, uT1: { value: blank as THREE.Texture }, uT2: { value: blank as THREE.Texture }, uT3: { value: blank as THREE.Texture },
    uSlotI: { value: new THREE.Vector4() }, uSlotW: { value: new THREE.Vector4(2048, 2048, 2048, 2048) }, uSlotOn: { value: new THREE.Vector4() },
    uMini: { value: blank as THREE.Texture }, uTail: { value: blank as THREE.Texture }, uBack: { value: blank as THREE.Texture },
    uSilkN: { value: blank as THREE.Texture }, uPaperN: { value: blank as THREE.Texture }, uPaperC: { value: blank as THREE.Texture }, uJade: { value: blank as THREE.Texture },
    uTUO: { value: TUO }, uSCW: { value: SC.w }, uTOT: { value: TOT }, uWRAP: { value: WRAP },
    uNight: { value: o.night ? 1 : 0 }, uCord: { value: 1 }, uTime: { value: 0 }, uFlick: { value: 1 },
    uLight: { value: new THREE.Vector3() }, uLRad: { value: 400 }, uHi: { value: new THREE.Vector4(0, 0, 100, 0) },
  };

  // 纸带：三段（左轴半圈 / 平铺 / 右杆半圈），每段两行顶点，位置全在着色器里算
  const stripGeo = (() => {
    const segs: [number, number][] = [[0, 96], [1, 8], [2, 96]];
    const aSeg: number[] = [], aT: number[] = [], aV: number[] = [], idx: number[] = []; let b = 0;
    for (const [sg, n] of segs) {
      for (let c = 0; c <= n; c++) for (const v of [0, 1]) { aSeg.push(sg); aT.push(c / n); aV.push(v); }
      for (let c = 0; c < n; c++) { const a = b + c * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      b += (n + 1) * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(aSeg.length * 3), 3));
    g.setAttribute('aSeg', new THREE.Float32BufferAttribute(aSeg, 1));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
    g.setAttribute('aV', new THREE.Float32BufferAttribute(aV, 1));
    g.setIndex(idx); return g;
  })();
  const stripMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: STRIP_V, fragmentShader: STRIP_F, side: THREE.DoubleSide, transparent: true, blending: THREE.NoBlending });
  const strip = new THREE.Mesh(stripGeo, stripMat); strip.frustumCulled = false; strip.renderOrder = 1; scene.add(strip);
  // 三者都放进「透明」队列，才能按 renderOrder 先画影子、再画纸与轴头（输出 alpha 恒为 1，不会真透明）
  const knobMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: KNOB_V, fragmentShader: KNOB_F, transparent: true, blending: THREE.NoBlending });
  const knobGeo = new THREE.CylinderGeometry(1, 1, 1, 64, 1, false);
  const knobs = [new THREE.Mesh(knobGeo, knobMat), new THREE.Mesh(knobGeo, knobMat)];
  knobs.forEach((m) => { m.frustumCulled = false; m.renderOrder = 2; scene.add(m); });
  const SU = {
    uRL: { value: new THREE.Vector4() }, uRR: { value: new THREE.Vector4() }, uFlat: { value: new THREE.Vector4() },
    uKnobH: { value: 0 }, uKnobR: { value: 0 }, uLight: U.uLight, uNight: U.uNight,
  };
  const shadowMat = new THREE.ShaderMaterial({ uniforms: SU, transparent: true, depthWrite: false, depthTest: false, vertexShader: SHADOW_V, fragmentShader: SHADOW_F });
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat); shadow.renderOrder = -1; shadow.frustumCulled = false; scene.add(shadow);

  /* 切片管理：按视口远近加载，GPU 里最多留 9 张，着色器每帧绑 4 张 */
  const tiles: Tile[] = SC.tiles.map((w, i) => ({ i, x: i * 2048, w, tex: null, st: 0, used: 0 }));
  const needsDecor = (t: Tile) => t.x < FRONT_DECOR[1] && t.x + t.w > FRONT_DECOR[0];
  let fontsReady: Promise<unknown> = Promise.resolve();
  let ktx2: KTX2Loader | null = null;
  try { ktx2 = new KTX2Loader().setTranscoderPath(`${base}/basis/`).detectSupport(renderer); } catch { ktx2 = null; }
  const ktx2Tex = (url: string) => new Promise<THREE.Texture>((res, rej) => {
    if (!ktx2) { rej(new Error('no ktx2')); return; }
    ktx2.load(url, (t) => {
      // 与 webp 那条路一样把原值交给着色器（不让显卡按 sRGB 解码），方向也一样（首行在 v=0）
      t.colorSpace = THREE.NoColorSpace; t.anisotropy = MAXANISO; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
      res(t);
    }, undefined, rej);
  });
  const wantTile = (i: number) => {
    const t = tiles[i]; if (!t || t.st) return; t.st = 1;
    const stem = `${base}/scroll/t${String(i).padStart(2, '0')}`;
    // 压缩贴图的宽要是 4 的倍数：末片（1765 宽）传进显卡会报 GL_INVALID_OPERATION、整片是空的，走 webp
    const viaKtx2 = needsDecor(t) || t.w % 4 ? Promise.reject(new Error('decor')) : ktx2Tex(`${stem}.ktx2`);
    viaKtx2.then((tex) => {
      if (!alive) { tex.dispose(); return; }
      owned.push(tex); return tex;
    }, () => loadImg(`${stem}.webp`).then(async (im) => {
      if (!alive) return;
      let src: TexImageSource = im;
      if (needsDecor(t)) { await fontsReady; const cv = mk(t.w, SC.h), c = cv.getContext('2d')!; c.drawImage(im, 0, 0); drawFront(c, t.x); src = cv; }
      if (!alive) return;
      return texOf(src);
    })).then((tex) => {
      if (!alive || !tex) return;
      t.tex = tex; renderer.initTexture(t.tex); t.st = 2; t.used = performance.now();
      const live = tiles.filter((x) => x.st === 2);
      if (live.length > 9) {
        live.sort((a, b) => a.used - b.used);
        const ev = live[0]; ev.tex?.dispose(); ev.tex = null; ev.st = 0;
      }
    }).catch(() => { t.st = 0; });
  };

  /* ───── 卷的状态 ───── */
  const S = { mw: 0, open: 0, vw: 0, vh: 0, Hs: 0, Bt: 0, k: 1, trackW: 0, Lc: 0, Rc: 0, Lr: 0, Rr: 0, rmax: 0, r0L: 0, r0R: 0, rk: 0, hk: 0, L: 0, R: 0, rL: 0, rR: 0, trackX: 0 };
  const P = { p: 0, tp: 0, v: 0, max: 0, locked: false, drag: null as null | { x: number; p: number; t: number; lx: number; moved: number; vel: number } };
  let state: RollState = 'closed';
  let instantOpen = false;   // 解带只给第一次来的人：再来时直接展开
  let sceneStart = true;     // 展开后要不要再走到来处那一景（只走一次）
  const setState = (s: RollState) => { state = s; o.onState(s); };

  /* ───── 补间：由每帧推进（与卷同一个时钟） ───── */
  const tweens: Tween[] = [];
  const tween = (get: () => number, set: (v: number) => void, to: number, dur: number, delay = 0, ease: Ease = power2InOut) =>
    new Promise<void>((done) => {
      if (RM || dur <= 0) { set(to); done(); return; }
      tweens.push({ get, set, to, from: null, t0: performance.now() + delay * 1000, dur: dur * 1000, ease, done });
    });
  // 展卷途中再点一下：所有补间直接落到终点（六版里 ritualTl.progress(1) 的意思）
  const finishTweens = () => {
    for (const tw of tweens.splice(0)) { tw.set(tw.to); tw.done(); }
  };
  const stepTweens = (now: number) => {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      if (now < tw.t0) continue;
      if (tw.from === null) tw.from = tw.get();
      const k = clamp((now - tw.t0) / tw.dur, 0, 1);
      tw.set(tw.from + (tw.to - tw.from) * tw.ease(k));
      if (k >= 1) { tweens.splice(i, 1); tw.done(); }
    }
  };

  /* ───── 卷面上的可点之物（DOM，跟纸走） ───── */
  const ovs: Overlay[] = [];
  const addOv = (html: string, Pt: number, ty: number, cls = '', size?: { tw: number; th: number }) => {
    const el = document.createElement('div'); el.className = `yt-ov ${cls}`; el.innerHTML = html; track.appendChild(el);
    const ov: Overlay = { el, Pt, ty, ...size }; ovs.push(ov); return ov;
  };
  const placeOv = (ov: Overlay) => {
    const k = S.k; ov.el.style.left = `${ov.Pt * k}px`; ov.el.style.top = `${ov.ty * k}px`;
    if (ov.tw) ov.el.style.width = `${ov.tw * k}px`; if (ov.th) ov.el.style.height = `${ov.th * k}px`;
  };
  const rigs: SceneRig[] = SCENES.map((s) => {
    const name = o.placeName(s), open = !!(s.to && name);
    const [cw, ch] = s.calli;
    const slip = addOv(
      `<div class="sw"><i class="str"></i><div class="card${open ? '' : ' off'}"><img src="${base}/calli/${s.id}.webp" style="aspect-ratio:${cw}/${ch}" alt="${s.name}（文徵明书）" draggable="false" /><span class="rm">${open ? name : '未开'}</span>${open ? '<i>入</i>' : ''}${o.here === s.id ? '<b class="here">你在这里</b>' : ''}</div></div><span class="pin"></span>`,
      TUO + F2T(s.fx) + s.slip, MT * 0.45, 'yt-slip',
    );
    slip.el.dataset.id = s.id;
    if (open) addOv(`<div class="yt-hot" data-id="${s.id}" title="入${s.name} · ${name}" style="width:100%;height:100%"></div>`, TUO + F2T(s.fx) - 520, 170, '', { tw: 1040, th: 760 });
    addOv(`<div class="yt-qy" data-back="${s.id}" style="width:100%;height:100%"><span class="tip">回到${s.name}${open ? ` · ${name}` : ''}</span></div>`, TUO + F2T(s.qy) - 46, 300, '', { tw: 92, th: 300 });
    return { s, slip, open, sw: slip.el.querySelector<HTMLElement>('.sw')!, str: slip.el.querySelector<HTMLElement>('.str')!, card: slip.el.querySelector<HTMLElement>('.card')!, ph: { phi: 0, w: 0, drop: 0, dv: 0 } };
  });
  addOv('<div class="yt-tb"><button type="button" data-tb="stamp">钤印</button><button type="button" data-tb="roll">卷起</button></div>', TB_ACT.Pt, TB_ACT.ty);
  const sealOv = addOv('', TB_SEAL.Pt, TB_SEAL.ty);
  const rigOf = (id: string) => rigs.find((r) => r.s.id === id);

  /* ───── 布局 ───── */
  const markEls: HTMLElement[] = [];
  const layout = () => {
    const rr = root.getBoundingClientRect(), br = band.getBoundingClientRect();
    S.vw = rr.width; S.vh = rr.height; S.Hs = br.height; S.Bt = br.top - rr.top; S.k = S.Hs / SC.h;
    S.trackW = TOT * S.k;
    S.rmax = 0.085 * S.Hs; S.r0L = 0.03 * S.Hs; S.r0R = 0.014 * S.Hs; S.rk = 0.046 * S.Hs; S.hk = 0.07 * S.Hs;
    const side = clamp(S.vw * 0.03, 16, 56);
    S.Lr = side + S.rmax; S.Rr = S.vw - side - S.rmax * 0.7;
    S.Lc = S.vw / 2 - S.rmax * 0.45; S.Rc = S.Lc + S.rmax * 0.95;
    renderer.setSize(S.vw, S.vh, false); dirty = true;
    camera.left = 0; camera.right = S.vw; camera.top = 0; camera.bottom = -S.vh; camera.updateProjectionMatrix();
    U.uTop.value = S.Bt; U.uH.value = S.Hs; U.uK.value = S.k; U.uLRad.value = S.Hs * 0.95;
    shadow.scale.set(S.vw, S.Hs + S.hk * 2 + 300, 1); shadow.position.set(S.vw / 2, -(S.Bt + S.Hs / 2), -50);
    track.style.width = `${S.trackW}px`; track.style.setProperty('--k', String(S.k));
    // 窄屏把签条收近屋子，免得落到卷筒后面
    rigs.forEach((r) => { r.slip.Pt = TUO + F2T(r.s.fx) + Math.min(r.s.slip, (S.vw * 0.3) / S.k); });
    ovs.forEach(placeOv);
    const d = Math.min(devicePixelRatio, 2); dust.width = S.vw * d; dust.height = S.vh * d; dctx?.setTransform(d, 0, 0, d, 0, 0);
    S.mw = mini.clientWidth;
    focus = null;
  };
  const LR = () => { S.L = S.Lc + (S.Lr - S.Lc) * S.open; S.R = S.Rc + (S.Rr - S.Rc) * S.open; P.max = Math.max(0, S.trackW - (S.R - S.L)); };
  const radius = (r0: number, amt: number) => Math.sqrt(r0 * r0 + (S.rmax * S.rmax - r0 * r0) * clamp(amt / S.trackW, 0, 1));
  const viewC = () => (S.L + S.R) / 2;
  const centerT = () => (viewC() - S.trackX) / S.k - TUO;   // 视口中央对应的切片 x
  const pFor = (t: number, L = S.Lr, R = S.Rr) => clamp((L + R) / 2 - (TUO + t) * S.k - R + S.trackW, 0, Math.max(0, S.trackW - (R - L)));
  const goTo = (t: number, instant = false) => { P.tp = pFor(t, S.L, S.R); if (instant || RM) P.p = P.tp; };

  /* ───── 缩略条上的景名 ───── */
  SCENES.forEach((s) => {
    const m = document.createElement('span'); m.className = 'mk'; m.dataset.id = s.id; m.textContent = s.name;
    m.style.left = `${((TUO + F2T(s.fx)) / TOT) * 100}%`; mini.appendChild(m); markEls.push(m);
  });

  /* ───── 签条的物理 ───── */
  let lastTX = 0, vel = 0, acc = 0;
  let focus: SceneRig | null = null;
  const stepSlips = (dt: number) => {
    const k = S.k;
    for (const r of rigs) {
      const ph = r.ph, on = focus === r ? 1 : 0;
      if (RM) { ph.drop = on; ph.phi = 0; }
      else {
        const tilt = clamp(-vel * 0.00005, -0.14, 0.14);
        const a = -27 * (ph.phi - tilt) - 2.6 * ph.w - clamp(acc, -9000, 9000) * 0.00042;
        ph.w += a * dt; ph.phi = clamp(ph.phi + ph.w * dt, -0.38, 0.38);
        const da = 140 * (on - ph.drop) - 15 * ph.dv; ph.dv += da * dt; ph.drop += ph.dv * dt;
      }
      const len = (34 + 78 * ph.drop) * k * 2.2, sc = 0.5 + 0.5 * ph.drop;
      put(r.sw, 'transform', `rotate(${ph.phi.toFixed(4)}rad)`);
      put(r.str, 'transform', `scaleY(${(len / 100).toFixed(4)})`);
      put(r.card, 'transform', `translate(-50%, ${len.toFixed(2)}px) scale(${sc.toFixed(4)})`);
    }
  };
  const nudge = (r: SceneRig | null | undefined) => { if (!RM && r) r.ph.w += (Math.random() < 0.5 ? -1 : 1) * (1.1 + Math.random() * 0.6); };

  /* ───── 浮尘（昼）：左上一道很淡的天光里浮着几十粒尘 ───── */
  const dctx = dust.getContext('2d');
  const motes = Array.from({ length: coarse ? 18 : 46 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), s: Math.random() * 6.28, v: 0.2 + Math.random() * 0.8 }));
  let dustT = 0, dustOn = false;
  // 尘粒是同一团暖白的径向渐变：预渲成精灵、按透明度贴，不再每 30 帧新建几十个渐变（这一项占了静止时主线程的大头）
  const mote = (() => {
    const n = 64, c = mk(n, n), x = c.getContext('2d')!, g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, 'rgba(255,248,230,1)'); g.addColorStop(1, 'rgba(255,248,230,0)'); x.fillStyle = g; x.fillRect(0, 0, n, n);
    return c;
  })();
  const drawDust = (dt: number) => {
    if (!dctx) return;
    if (RM || U.uNight.value > 0.98) { if (dustOn) { dctx.clearRect(0, 0, S.vw, S.vh); dustOn = false; } return; }
    dustT += dt; if (dustT < 1 / 30) return; const step = dustT; dustT = 0; dustOn = true;
    const W = S.vw, H = S.vh, day = 1 - U.uNight.value; dctx.clearRect(0, 0, W, H);
    const ax = W * 0.18, ay = -H * 0.1, bx = W * 0.62, by = H * 1.1;
    const g = dctx.createLinearGradient(ax - 200, ay, ax + 260, ay + 120);
    dctx.save(); dctx.globalAlpha = 0.09 * day;
    dctx.beginPath(); dctx.moveTo(ax - 120, ay); dctx.lineTo(ax + 300, ay); dctx.lineTo(bx + 380, by); dctx.lineTo(bx - 140, by); dctx.closePath();
    g.addColorStop(0, 'rgba(255,246,220,0)'); g.addColorStop(0.5, 'rgba(255,246,220,1)'); g.addColorStop(1, 'rgba(255,246,220,0)');
    dctx.fillStyle = g; dctx.fill(); dctx.restore();
    const wg = gust();   // 全站同一只风钟：起风时光柱里的浮尘也往下风飘一点
    for (const m of motes) {
      m.s += step * (0.3 + m.v * 0.4);
      m.y -= step * (0.006 + m.z * 0.01) * m.v; m.x += step * (0.004 * Math.sin(m.s) + 0.002 + wg * wg * 0.012 * (0.4 + m.z));
      if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); } if (m.x > 1.05) m.x = -0.05;
      const X = m.x * W, Y = m.y * H;
      const tY = (Y - ay) / (by - ay), cx = ax + 90 + (bx + 120 - ax - 90) * tY, dd = Math.abs(X - cx) / 230;
      const vis = Math.max(0, 1 - dd * dd) * day;   // 只在光柱里看得见
      if (vis <= 0.01) continue;
      const r = 0.6 + m.z * 2.4, blur = m.z > 0.7 ? 3 : 1, R = r * blur + 1;
      dctx.globalAlpha = 0.55 * vis * (1.2 - m.z * 0.6); dctx.drawImage(mote, X - R, Y - R, R * 2, R * 2);
    }
    dctx.globalAlpha = 1;
  };

  /* ───── 主按钮的字 ───── */
  let primaryLabel = '';
  const goLabel = () => {
    const c = centerT();
    const label = state !== 'open' ? '解带展卷'
      : focus?.open ? `入${focus.s.name}`
        : c > 34000 ? '展卷' : c < -TUO + 2600 ? '卷起' : '前行';
    if (label !== primaryLabel) { primaryLabel = label; o.onPrimary(label); }
  };

  /* ───── 每帧 ───── */
  let raf = 0, last = performance.now(), LX = 0, LY = 0, lx = 0, ly = 0, flickN = 0;
  let lastSig = '', lastRender = 0;
  const hiT = { x: 0, y: 0, r: 100, w: 0 };
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    stepTweens(now);
    LR();
    if (!P.drag && !P.locked) { P.tp = clamp(P.tp + P.v, 0, P.max); P.v *= Math.pow(0.0018, dt); if (Math.abs(P.v) < 0.05) P.v = 0; }
    if (!P.locked) P.p += (P.tp - P.p) * (RM ? 1 : 1 - Math.exp(-dt * 7.2));
    P.p = clamp(P.p, 0, P.max);
    S.trackX = S.R - S.trackW + P.p;
    S.rL = radius(S.r0L, S.L - S.trackX); S.rR = radius(S.r0R, S.trackX + S.trackW - S.R);
    // 速度与加速度（低通），给签条
    const v = (S.trackX - lastTX) / Math.max(dt, 1e-3); lastTX = S.trackX;
    const a = (v - vel) / Math.max(dt, 1e-3); vel += (v - vel) * 0.35; acc += (a - acc) * 0.2;
    // 卷
    const hL = Math.max(S.rL, S.rk * 1.02);
    U.uL.value = S.L; U.uR.value = S.R; U.urL.value = S.rL; U.urR.value = S.rR; U.uhL.value = hL; U.uhR.value = S.rR; U.uTrackX.value = S.trackX;
    knobs[0].scale.set(S.rk, S.hk, S.rk); knobs[0].position.set(S.L, -(S.Bt - S.hk / 2 + 1), hL);
    knobs[1].scale.set(S.rk, S.hk, S.rk); knobs[1].position.set(S.L, -(S.Bt + S.Hs + S.hk / 2 - 1), hL);
    SU.uRL.value.set(S.L, S.rL, hL, 0); SU.uRR.value.set(S.R, S.rR, S.rR, 0); SU.uFlat.value.set(S.L, S.R, -S.Bt, -(S.Bt + S.Hs)); SU.uKnobH.value = S.hk; SU.uKnobR.value = S.rk;
    // 槽位：视窗内的切片
    const q0 = (S.L - S.trackX) / S.k - TUO, q1 = (S.R - S.trackX) / S.k - TUO;
    const i0 = clamp(Math.floor(q0 / 2048), 0, tiles.length - 1);
    const sl = [0, 1, 2, 3].map((j) => tiles[Math.min(tiles.length - 1, i0 + j)]);
    const slotU = [U.uT0, U.uT1, U.uT2, U.uT3];
    sl.forEach((t, j) => { slotU[j].value = t.tex || blank; if (t.tex) t.used = now; });
    U.uSlotI.value.set(sl[0].i, sl[1].i, sl[2].i, sl[3].i); U.uSlotW.value.set(sl[0].w, sl[1].w, sl[2].w, sl[3].w);
    U.uSlotOn.value.set(+!!sl[0].tex, +!!sl[1].tex, +!!sl[2].tex, +!!sl[3].tex);
    const dir = Math.sign(vel);
    for (let i = Math.floor(q0 / 2048) - 1; i <= Math.floor(q1 / 2048) + 1; i++) wantTile(i);
    if (dir) wantTile(dir < 0 ? Math.floor(q1 / 2048) + 2 : Math.floor(q0 / 2048) - 2);
    // 烛：跟着指针，三组频率叠出的闪烁
    lx += (LX - lx) * (1 - Math.exp(-dt * 6)); ly += (LY - ly) * (1 - Math.exp(-dt * 6));
    flickN += (Math.random() - 0.5) * dt * 6; flickN *= Math.pow(0.2, dt);
    const t = now / 1000; U.uTime.value = t;
    U.uFlick.value = 1 + 0.045 * Math.sin(t * 9.1) + 0.03 * Math.sin(t * 15.7 + 1.2) + 0.02 * Math.sin(t * 27.3 + 2.1) + flickN * 0.5;
    U.uLight.value.set(lx, -ly, S.Hs * 0.8);
    put(root, '--lx', `${lx.toFixed(1)}px`); put(root, '--ly', `${ly.toFixed(1)}px`);
    const hi = U.uHi.value; hi.x += (hiT.x - hi.x) * 0.2; hi.y += (hiT.y - hi.y) * 0.2; hi.z += (hiT.r - hi.z) * 0.2; hi.w += (hiT.w - hi.w) * (1 - Math.exp(-dt * 6));
    // 卷面 DOM
    put(track, 'transform', `translate3d(${S.trackX.toFixed(2)}px,0,0)`);
    put(band, '--wl', `${(S.L + S.rL).toFixed(1)}px`); put(band, '--wr', `${(S.R - S.rR).toFixed(1)}px`);
    // 焦点景：视口中央最近的那一景，签条落下来
    const c = centerT(); let best: SceneRig | null = null, bd = 1800;
    if (state === 'open') for (const r of rigs) { const d = Math.abs(F2T(r.s.fx) - c); if (d < bd) { bd = d; best = r; } }
    if (best !== focus) {
      focus = best;
      rigs.forEach((r) => r.slip.el.classList.toggle('on', r === best));
      markEls.forEach((e) => e.classList.toggle('on', !!best && e.dataset.id === best.s.id));
      if (best) { yStore.set('last', best.s.id); nudge(best); }
      o.onFocus(best ? best.s.id : null);
    }
    goLabel();
    stepSlips(dt);
    // 缩略窗
    const mw = S.mw;   // 在 layout 里量好：每帧读 clientWidth 会逼出一次同步布局
    put(miniWin, 'left', `${(((S.L + S.rL - S.trackX) / S.trackW) * mw).toFixed(1)}px`);
    put(miniWin, 'width', `${(((S.R - S.rR - S.L - S.rL) / S.trackW) * mw).toFixed(1)}px`);
    // 画的节制：卷、烛、高亮、切片都没变就不画——昼里静着是 0 帧；夜里烛闪降到 15 帧（看不出差别）
    const sig = [S.trackX, S.rL, S.rR, S.L, S.R, U.uCord.value, U.uNight.value, hi.x, hi.y, hi.z, hi.w, lx, ly,
      U.uSlotI.value.x, U.uSlotOn.value.x, U.uSlotOn.value.y, U.uSlotOn.value.z, U.uSlotOn.value.w].map((v) => v.toFixed(2)).join();
    const flickDue = U.uNight.value > 0.02 && now - lastRender > 1000 / 15;
    const moving = dirty || tweens.length > 0 || sig !== lastSig;
    if (moving || flickDue) { renderer.render(scene, camera); lastSig = sig; lastRender = now; dirty = false; }
    if (moving) gov.frame(now); else gov.skip();   // 夜里 15 帧的烛闪不算「连着画」
    drawDust(dt);
  };

  /* ───── 解带展卷 / 卷起 ───── */
  const afterOpen = () => {
    P.locked = false; P.tp = P.p; setState('open'); yStore.set('unrolled', true);
    LR();   // 跳过展卷时补间是一下子落到终点的，先按「已展开」重算两端，再去找那一景
    if (o.start && sceneStart) { const r = rigOf(o.start); if (r) goTo(F2T(r.s.fx)); }
    sceneStart = false;
  };
  const unroll = () => {
    if (state === 'opening') { finishTweens(); return; }
    if (state !== 'closed') return;
    const pY = pFor(YIN);
    const target = o.start && rigOf(o.start) ? pFor(F2T(rigOf(o.start)!.s.fx)) : pY;
    if (RM || instantOpen) {
      instantOpen = false; S.open = 1; U.uCord.value = 0; P.p = P.tp = target; sceneStart = false; afterOpen(); return;
    }
    setState('opening'); P.locked = true; P.v = 0;
    playPaper('unroll', 2.4);   // 纸声（默认关）：系带滑开、绢擦过纸
    // 系带先滑开，再两手往两边一分（起得慢、收得长），然后顺势展到引首
    void Promise.all([
      tween(() => U.uCord.value, (x) => { U.uCord.value = x; }, 0, 0.7, 0, power2InOut),
      tween(() => S.open, (x) => { S.open = x; }, 1, 2.3, 0.55, unrollEase),
      tween(() => P.p, (x) => { P.p = x; P.tp = x; }, pY, 2.6, 1.95, power2InOut),
    ]).then(() => { if (alive) afterOpen(); });
  };
  const rollUp = () => {
    if (state !== 'open') return;
    yStore.set('rolled', true); setState('closing'); P.v = 0; P.locked = true;
    playPaper('roll', 2.6);
    focus = null; rigs.forEach((r) => r.slip.el.classList.remove('on')); o.onFocus(null);
    void Promise.all([
      tween(() => P.p, (x) => { P.p = x; P.tp = x; }, 0, 2.2, 0, power3InOut),
      tween(() => S.open, (x) => { S.open = x; }, 0, 1.7, 1.9, power3InOut),
      tween(() => U.uCord.value, (x) => { U.uCord.value = x; }, 1, 0.6, 3.4, power2Out),
    ]).then(() => { if (!alive) return; P.locked = false; setState('closed'); });
  };

  /* ───── 题跋：钤印 ───── */
  const stamp = () => {
    if (yStore.get('stamped', false)) { o.onToast('你已经在这卷上留过印了。'); return; }
    yStore.set('stamped', true);
    window.setTimeout(() => playPaper('stamp'), RM ? 0 : 420);   // 印落到纸上那一下
    const s = 120 * S.k;
    sealOv.el.innerHTML = `<span class="yt-stamp" style="width:${s}px;height:${s}px;margin:${-s / 2}px 0 0 ${-s / 2}px;font-size:${s * 0.34}px">曾游</span>`;
    const finish = () => {
      sealOv.el.innerHTML = '';
      paintTail(); U.uTail.value.needsUpdate = true; dirty = true;
      o.onToast('印落在卷尾了。下次来，它还在。');
    };
    if (RM) finish(); else window.setTimeout(finish, 950);
  };

  /* ───── 主按钮 ───── */
  const primary = () => {
    if (state === 'closed' || state === 'opening') { unroll(); return; }
    if (state !== 'open') return;
    const c = centerT();
    if (focus?.open) { o.onEnter(focus.s); return; }
    if (c < -TUO + 2600) { rollUp(); return; }
    const next = SCENES.find((s) => F2T(s.fx) < c - 200);
    goTo(next ? F2T(next.fx) : -TUO + 1100);
  };

  /* ───── 输入：只改目标值 ───── */
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (state !== 'open') { if (state === 'closed' && Math.abs(e.deltaY) + Math.abs(e.deltaX) > 4) unroll(); return; }
    P.v = 0; P.tp = clamp(P.tp + (e.deltaY - e.deltaX) * (e.deltaMode === 1 ? 32 : 1) * 1.1, 0, P.max);
  };
  const local = (e: PointerEvent) => { const r = root.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || state !== 'open') return;
    P.drag = { x: e.clientX, p: P.tp, t: performance.now(), lx: e.clientX, moved: 0, vel: 0 }; P.v = 0;
    band.setPointerCapture(e.pointerId); band.classList.add('drag');
  };
  const onMove = (e: PointerEvent) => {
    [LX, LY] = local(e);
    const d = P.drag; if (!d) return;
    const dx = e.clientX - d.x; d.moved = Math.max(d.moved, Math.abs(dx));
    P.tp = clamp(d.p + dx, 0, P.max);
    const now = performance.now(); d.vel = ((e.clientX - d.lx) / Math.max(1, now - d.t)) * 16; d.lx = e.clientX; d.t = now;
  };
  const onUp = (e: PointerEvent) => {
    const d = P.drag;
    if (!d) { if ((state === 'closed' || state === 'opening') && e.type === 'pointerup') unroll(); return; }
    P.v = d.vel * 1.2; P.drag = null; band.classList.remove('drag');
    if (d.moved >= 6) return;
    // 当作点击：拖动捕获了指针，所以按坐标找被点的东西
    const tgt = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.matches('.yt-slip .card, .yt-slip .card *, .yt-hot, .yt-qy, .yt-qy *, .yt-tb button'));
    if (!tgt) return;
    const sl = tgt.closest<HTMLElement>('.yt-slip, .yt-hot');
    if (sl) { const r = rigOf(sl.dataset.id ?? ''); if (r?.open) o.onEnter(r.s); return; }
    const qy = tgt.closest<HTMLElement>('.yt-qy');
    if (qy) { const r = rigOf(qy.dataset.back ?? ''); if (r) goTo(F2T(r.s.fx)); return; }
    const tb = tgt.closest<HTMLElement>('[data-tb]');
    if (tb?.dataset.tb === 'stamp') stamp();
    if (tb?.dataset.tb === 'roll') rollUp();
  };
  const onLeave = () => { LX = S.vw / 2; LY = S.Bt + S.Hs * 0.5; };
  const onOver = (e: PointerEvent) => {
    const target = e.target as HTMLElement;
    const sl = target.closest<HTMLElement>('.yt-slip');
    if (sl && !sl.contains(e.relatedTarget as Node | null)) nudge(rigOf(sl.dataset.id ?? ''));
    const hot = target.closest<HTMLElement>('.yt-hot');
    if (hot) { const r = rigOf(hot.dataset.id ?? ''); if (r) Object.assign(hiT, { x: S.trackX + (TUO + F2T(r.s.fx)) * S.k, y: -(S.Bt + 560 * S.k), r: 420 * S.k, w: 1 }); }
  };
  const onOut = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.yt-hot') && !(e.relatedTarget as HTMLElement | null)?.closest?.('.yt-hot')) hiT.w = 0;
  };
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (e.metaKey || e.ctrlKey || e.altKey || (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable))) return;
    if (state === 'closed' || state === 'opening') { if (e.key === 'Enter' || e.key === ' ' || e.key.startsWith('Arrow')) { e.preventDefault(); unroll(); } return; }
    if (state !== 'open') return;
    if (e.key === 'ArrowLeft') { P.tp = clamp(P.tp + S.vw * 0.55, 0, P.max); e.preventDefault(); }
    if (e.key === 'ArrowRight') { P.tp = clamp(P.tp - S.vw * 0.55, 0, P.max); e.preventDefault(); }
    if (e.key === 'Enter' && focus?.open && (!t || t === document.body || t === band)) o.onEnter(focus.s);
  };
  // 卷尾两个按钮的键盘入口（鼠标与触屏走 onUp 的坐标拾取）
  const onKeyClick = (e: MouseEvent) => {
    if (e.detail !== 0) return;
    const tb = (e.target as HTMLElement).closest<HTMLElement>('[data-tb]');
    if (tb?.dataset.tb === 'stamp') stamp();
    if (tb?.dataset.tb === 'roll') rollUp();
  };
  const onMini = (e: PointerEvent) => {
    if (state !== 'open') return;
    const r = mini.getBoundingClientRect(), f = (e.clientX - r.left) / r.width;
    P.tp = clamp(viewC() - f * S.trackW - S.R + S.trackW, 0, P.max);
  };
  root.addEventListener('wheel', onWheel, { passive: false });
  band.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  band.addEventListener('pointerup', onUp); band.addEventListener('pointercancel', onUp);
  root.addEventListener('pointerleave', onLeave);
  track.addEventListener('pointerover', onOver); track.addEventListener('pointerout', onOut);
  window.addEventListener('keydown', onKey);
  track.addEventListener('click', onKeyClick);
  mini.addEventListener('pointerdown', onMini);
  const ro = new ResizeObserver(() => {
    const c = state === 'open' ? centerT() : null;
    layout(); LR(); if (c != null) goTo(c, true);
  });
  const miniRo = new ResizeObserver(() => { S.mw = mini.clientWidth; });

  /* ───── 启动 ───── */
  const boot = async () => {
    layout(); LR(); onLeave(); lx = LX; ly = LY;
    ro.observe(root); miniRo.observe(mini);
    const qiji = new FontFace('Qiji Ink', `url(${base}/fonts/qiji.woff2)`);
    fontsReady = Promise.race([
      Promise.all([
        qiji.load().then((f) => { document.fonts.add(f); }).catch(() => undefined),
        document.fonts.load('400 46px "LXGW WenKai Screen"', '走到卷尾的人在这里钤一方印这是你的丙午寒露园丁题于南半球余纸虚以待跋').catch(() => undefined),
      ]),
      sleep(3500),
    ]);
    await Promise.all((Object.keys(A) as (keyof typeof A)[]).map((k) => loadImg(A[k]).then((im) => { IMG[k] = im; }).catch(() => undefined)));
    const [miniIm, silkN, paperN, jade] = await Promise.all(
      [`${base}/scroll/mini.webp`, `${base}/tex/silk-n.webp`, `${base}/tex/paper-n.webp`, `${base}/tex/jade.webp`].map((s) => loadImg(s).catch(() => null)),
    );
    if (!alive) return;
    if (miniIm) U.uMini.value = texOf(miniIm);
    if (silkN) U.uSilkN.value = texOf(silkN, true);
    if (paperN) U.uPaperN.value = texOf(paperN, true);
    if (jade) U.uJade.value = texOf(jade, true);
    if (IMG.paper) U.uPaperC.value = texOf(IMG.paper, true);
    await fontsReady;
    if (!alive) return;
    // 拖尾纸、包首锦各占一帧画；贴图分帧传进显卡、着色器并行编好再开画——不然转场正卡在这几帧上
    await nextFrame(); if (!alive) return;
    U.uTail.value = texOf(paintTail());
    await nextFrame(); if (!alive) return;
    U.uBack.value = texOf(paintBack());
    [17, 18, 19].forEach(wantTile);
    await uploadSpread(renderer, texturesOf(scene), () => alive);
    if (!alive) return;
    await warmPrograms(renderer, [{ scene, camera }]);
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    o.onReady?.();
    // 解带只给第一次来的人；再来时卷已经展开
    if (RM || yStore.get('unrolled', false)) { instantOpen = true; unroll(); }
    else window.setTimeout(() => { if (alive && state === 'closed') unroll(); }, 1500);
  };
  void boot();

  return {
    setNight(night) { void tween(() => U.uNight.value, (x) => { U.uNight.value = x; }, night ? 1 : 0, 1.1); },
    unroll,
    primary,
    goToScene(id) { const r = rigOf(id); if (r && state === 'open') goTo(F2T(r.s.fx)); },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect(); miniRo.disconnect();
      root.removeEventListener('wheel', onWheel);
      band.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      band.removeEventListener('pointerup', onUp); band.removeEventListener('pointercancel', onUp);
      root.removeEventListener('pointerleave', onLeave);
      track.removeEventListener('pointerover', onOver); track.removeEventListener('pointerout', onOut);
      window.removeEventListener('keydown', onKey);
      track.removeEventListener('click', onKeyClick);
      mini.removeEventListener('pointerdown', onMini);
      track.innerHTML = '';
      markEls.forEach((m) => m.remove());
      tiles.forEach((t) => t.tex?.dispose());
      owned.forEach((t) => t.dispose());
      ktx2?.dispose();   // 转码器的 worker 一并收掉
      [stripGeo, knobGeo, shadowGeo].forEach((g) => g.dispose());
      [stripMat, knobMat, shadowMat].forEach((m) => m.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
};
