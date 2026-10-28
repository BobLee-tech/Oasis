// ✉️ 尺牍引擎：一位邻居一封信，信封、封舌、对折的八行笺都是 three.js 里的实物。
//   全程不进 React（与 orchard/sandScene.ts、yuantu/scrollScene.ts 同一种做法）：信的位姿、烛、竹影每帧直写；
//   可点之物是 React 渲染的 DOM（热区、展读按钮），引擎只写它们的位置、在上面挂事件。
//   移植自演示稿 docs/chidu-demo.html，效果一致。规矩：
//   · 世界单位在桌面处约等于 CSS 像素；+z 朝上（HemisphereLight 的「天」因此要摆到 +z）。
//   · 封舌：立起来之前铰链高于口袋面（早落会陷进去）；翻到底就停、不回弹（笺躺在它上面）；
//     封舌没躺平之前笺顶不许越过封口——这三条一起保证开合不穿模。
//   · 昼＝窗下天光 + 雪窗《风竹图》竹影（SpotLight.map 作遮光片）；夜＝秉烛，烛跟指针，读信时挪到信边。
//   · 软影要用 PCFShadowMap（PCFSoft 不认 radius）；笺举到眼前就不再往桌上投影。
//   · 画布每次自建自拆：React 开发模式会挂载两次，复用画布会拿到已丢失的上下文。
//   · 省：阴影图 1024；骑缝印的下半是各封共用的一小块贴花；笺不随信封一起画（材质先挂占位贴图，换图不重编着色器）：
//     桌面上开画后趁空闲一封封画好、传进显卡，手机等第一次点开才画。
//   · 不卡：信封一封一帧地摆；开画前贴图分帧上传、着色器（画布 / 离屏 / 阴影图三套）并行编好；慢机器自动降像素比（lib/paper/pace.ts）。
//     没人动、也没有补间时只画 30 帧、阴影图 15 次/秒（竹影、烛闪是背景里的动，30 帧够），一有动静当帧回满。
//     验收数字与对照见 docs/chidu-next.html 的实验台。
//   · 纸会弯：笺的截面在顶点着色器里按弧长积分（BEND），折痕是小圆弧、摊开时边角滞后再回弹、拿在手里整张微拱；
//     同一段挂到 customDepthMaterial，影子也跟着弯。笺还有一截在封里时不许弯（拱起的边会顶穿口袋面）。
//   · 洒金会闪：金箔单成一层（金属度 1、每片法线随机偏），环境是离屏摆的一间左上开窗的屋（与竹影的天光同向），不下载 HDR。
//   · 一阵风：同一个 gust 摇竹影、掀没封口的封舌（封了口、或笺正躺在上面的不动）、吹偏烛焰、让手里的笺微颤。
//   · 读信景深：桌面渲到离屏、两遍可分离高斯、略压暗，手里的笺（layer 1）另画在上面；合上就还离屏。
//   · 信多了（超过四封、非手机）品字形两排：上少下多、上排嵌在下排的缝上，越新越在上（一封比左邻高 STACK_DZ）；
//     镜头尽量近，整组中轴尽量对着屏幕中线，只在上排碰到页头的字时往右让；七封以内不互压，再多至多压两成；
//     行距容得下一只敞开的封舌；移近一封，同排压着它的左右分开让。口袋面这时也投影，上下才分得清。
//     演示与各屏数字见 docs/chidu-many.html。
import * as THREE from 'three';
import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import type { Letter } from './letters';
import { ctx2d, loadImg, mk, paperFill as fillPaper, printOf, withTimeout, type PaperOpts } from '../../lib/paper/canvas';
import { hash, rnd, type Rand } from '../../lib/paper/rand';
import { bendify, type BendU } from '../../lib/paper/bend';
import { dprGovernor, nextFrame, texturesOf, uploadSpread, warmPrograms, whenIdle } from '../../lib/paper/pace';
import { playPaper } from '../../lib/paperSound';
import { gust as windGust } from '../../lib/wind';
import { pyramid, type HeadBox } from './pyramid';

gsap.registerPlugin(CustomEase);
// 纸的手感：封舌先被纸的硬挺拖住一下再翻；笺摊开时回一点
CustomEase.create('paperFlip', 'M0,0 C0.32,0 0.22,1.08 0.56,1.035 0.7,1.012 0.84,1 1,1');
CustomEase.create('unfold', 'M0,0 C0.22,0 0.28,1.07 0.6,1.03 0.72,1.012 0.86,1 1,1');

export interface LetterSceneOptions {
  root: HTMLElement;
  /** 画布挂在这里 */
  stage: HTMLElement;
  /** 页头：手机上第一行信要让开它 */
  head: HTMLElement;
  letters: Letter[];
  /** 每封信的热区（与 letters 同序）：<a>（邻居）或 <button>（虚席） */
  hits: HTMLElement[];
  /** 展读时笺下的按钮组、左右换一封 */
  acts: HTMLElement;
  prev: HTMLElement;
  next: HTMLElement;
  /** 素材根（默认 /lights）与园图的素材根（纸色、纸面法线与园图同一份） */
  base: string;
  yuantuBase: string;
  night: boolean;
  reduce: boolean;
  coarse: boolean;
  /** 开始展读某一封（-1：收好了） */
  onRead: (i: number) => void;
  /** 笺摊开了、按钮可以出现了 */
  onShown: (shown: boolean) => void;
  onReady?: () => void;
}

export interface LetterScene {
  setNight(night: boolean): void;
  open(i: number): void;
  close(): void;
  destroy(): void;
}

export const hasWebGL = (): boolean => {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
};

/* ───── 尺寸（世界单位） ───── */
const W = 220, H = 330, FH = 118;                 // 信封、封舌
const LW = 196, LH = 300;                         // 八行笺对折后的一页
const Z_POCKET = 1.2, Z_LETTER = 0.6;
const Y_IN = -H / 2 + 10 + LH / 2;                // 笺在封里的中心
const PEEK = LH * 0.42;                           // 窥信时抽出的长度
const OUT = H / 2 + 10 - (Y_IN - LH / 2) - PEEK;  // 再抽多少才整张离封
const EK = 512 / W;                               // 信封贴图 px/单位
const CW = 1280, CH = Math.round(CW * LH / (LW * 2));   // 整张笺（摊开），版面坐标
const SS = 1.6;                                    // 笺贴图按版面坐标的几倍画：展读时笺放得比 1280 宽，字才不糊
const LM = { x: 54, top: 118, bottom: 72 };       // 笺的天头地脚

/* 信上的字：尺牍多是行书（志莽行书）；西文跟同一支笔（Homemade Apple）；地址是「印上去」的，用 Fell 斜体 */
const HAND = { gap: 1.06, size: 1.16, latStyle: '400', latSize: 0.62 };
const KAI = '"Zhi Mang Xing", "LXGW WenKai Screen", "Kaiti SC", "STKaiti", serif';
const LAT = '"Homemade Apple", "IM Fell English", Georgia, serif';
const PRINT_LAT = '"IM Fell English", Georgia, serif';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mixHex = (a: string, b: string, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

// 叠放时一封比左邻高多少。合着的封舌离信封底 1.7（Z_POCKET + 0.5）、敞着的只离 0.1，
// 差不过 1.6 时，互压的左邻的封舌会从虚席敞开的封舌中间穿出来
const STACK_DZ = 2.2;

/* 竖排一列：汉字直立、西文整段侧躺（同 vertical-rl），句读挪到右上 */
const PUNC_TR = '，。、；：';
/** 一个记号：汉字（ch）或一整段西文（lat） */
interface Tok { ch: string; lat: string | null }
const tokens = (str: string): Tok[] => {
  const out: Tok[] = []; let lat = '';
  for (const ch of str) {
    if (/[\x20-\x7E·]/.test(ch) && !(ch === '·' && !lat)) { lat += ch; continue; }
    if (lat.trim()) out.push({ ch: '', lat: lat.trim() });
    lat = '';
    out.push({ ch, lat: null });
  }
  if (lat.trim()) out.push({ ch: '', lat: lat.trim() });
  return out;
};
interface ColOpts { size: number; color: string; at?: 'start' | 'end'; gap?: number; rand?: Rand; print?: boolean }
const vcol = (x: CanvasRenderingContext2D, str: string, cx: number, y0: number, y1: number, o: ColOpts) => {
  const size = o.size * HAND.size, gap = o.gap ?? HAND.gap, rand = o.rand;
  const latFont = o.print ? `italic 400 ${size * 0.92}px ${PRINT_LAT}` : `${HAND.latStyle} ${size * HAND.latSize}px ${LAT}`;
  const toks = tokens(str);
  const adv = toks.map((t) => {
    if (t.lat !== null) { x.font = latFont; return x.measureText(t.lat).width + size * 0.3; }
    return PUNC_TR.includes(t.ch) ? size * 0.7 : size * gap;
  });
  const total = adv.reduce((a, b) => a + b, 0);
  let y = o.at === 'end' ? y1 - total : y0;
  x.save(); x.fillStyle = o.color; x.textBaseline = 'middle';
  toks.forEach((t, i) => {
    const jx = rand ? (rand() - 0.5) * size * 0.05 : 0, jr = rand ? (rand() - 0.5) * 0.035 : 0;
    x.globalAlpha = rand ? 0.94 + rand() * 0.06 : 1;   // 墨色略有浓淡，但不淡到看不清
    if (t.lat !== null) {
      x.font = latFont; x.textAlign = 'left';
      x.save(); x.translate(cx + jx - size * 0.04, y + size * 0.12); x.rotate(Math.PI / 2); x.fillText(t.lat, 0, 0); x.restore();
    } else {
      x.font = `400 ${size}px ${KAI}`; x.textAlign = 'center';
      const tr = PUNC_TR.includes(t.ch);
      x.save(); x.translate(tr ? cx + size * 0.32 : cx + jx, tr ? y + size * 0.12 : y + adv[i] / 2); x.rotate(jr);
      x.shadowColor = o.color; x.shadowBlur = size * 0.03;   // 墨在纸上略洇
      x.fillText(t.ch, 0, 0); x.restore();
    }
    y += adv[i];
  });
  x.restore();
};

interface Item extends Letter {
  idx: number;
  el: HTMLElement;
  rot: number; enterRot: number;
  x: number; y: number; s: number;
  st: { enter: number; lift: number; flap: number; peek: number; out: number; fly: number; unfold: number };
  tilt: { x: number; y: number; tx: number; ty: number };
  tl?: gsap.core.Timeline;
  env: THREE.Group; flapPivot: THREE.Group; letter: THREE.Group; sheet: THREE.Group; hinge: THREE.Group;
  panels: THREE.Mesh[]; blob: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  cast: boolean;
  /** 笺的正面（右、左半页弯法不同，各一份）；paper 是留给笺的那支随机，笺画好就清掉 */
  fronts: THREE.MeshStandardMaterial[]; paper?: Rand;
  /** 纸会弯的参数，与边角滞后、整张微拱两根弹簧 */
  U: BendU; bend: { prev: number; lag: number; lagV: number; k: number; kV: number };
  /** 洒金那一层（只有邻居的信有） */
  gold?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  pocket: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  /** 错落叠放：自己的歪法、第几排、与右邻的间距（信封单位）、叠的高度、让开的位移；px/py/pr 是此刻的位姿 */
  rotS: number; row: number; stepW: number; stackZ: number; sp: { x: number };
  px: number; py: number; pr: number;
}

export const createLetterScene = (o: LetterSceneOptions): LetterScene => {
  const { root, stage, base, yuantuBase } = o;
  const RM = o.reduce, K = RM ? 0.35 : 1;   // reduced-motion：不演进场、竹影不摇、烛不闪，动作都短
  let alive = true, started = false;

  /* ───── 渲染器：画布自建自拆 ───── */
  const canvas = document.createElement('canvas');
  canvas.className = 'lt-gl';
  stage.appendChild(canvas);
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (err) { canvas.remove(); throw err; }
  const DPR = Math.min(devicePixelRatio, o.coarse ? 1.75 : 2);
  renderer.setPixelRatio(DPR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;   // PCF 才认 radius：烛焰有大小，影边是软的
  // 线上不查着色器报错：每个程序第一次用时 getProgramInfoLog 会同步等编译收尾，二十来个程序叠起来卡第一帧 60 多 ms
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
  const ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // 2048 时一盏灯的阴影图（颜色＋深度）约 33 MB；影边本来就靠 PCF 半径做虚，1024 只要 8 MB
  const SHADOW = 1024;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 40, 9000);
  const owned: { dispose(): void }[] = [];   // 拆时一并释放的贴图、几何、材质
  const own = <T extends { dispose(): void }>(x: T) => { owned.push(x); return x; };

  const ctex = (src: HTMLCanvasElement | HTMLImageElement, srgb = true, repeat?: [number, number]) => {
    const t = own(src instanceof HTMLCanvasElement ? new THREE.CanvasTexture(src) : new THREE.Texture(src));
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = ANISO;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
    t.needsUpdate = true;
    return t;
  };

  /* ───── 状态 ───── */
  const V = { w: 1, h: 1, D: 1, phone: false, tilt: 0.15, enterDY: 0 };
  const READ = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1 };
  const MODE = { n: o.night ? 1 : 0 };
  const VEIL = { o: 0 };
  const WIND = { g: 0, flap: 0 };
  const FOCUS = new THREE.Vector3();
  const PTR = { on: false, p: new THREE.Vector3(), t: 0 };
  const CANDLE = new THREE.Vector3(), CT = new THREE.Vector3();
  let hover = -1, reading = -1, lastPointer = 'mouse', busy: gsap.core.Timeline | null = null, tPrev = 0;
  let lastActive = 0, lastRender = -1, lastShadow = -1;
  const items: Item[] = [];
  let drawSheet: (it: Item) => void = () => {};   // 素材到齐后 boot 换成真的

  const ray = new THREE.Raycaster(), PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const _v = new THREE.Vector3(), _n = new THREE.Vector2();
  const toDesk = (sx: number, sy: number, out = new THREE.Vector3()) => {
    _n.set((sx / V.w) * 2 - 1, -(sy / V.h) * 2 + 1); ray.setFromCamera(_n, camera); ray.ray.intersectPlane(PLANE, out); return out;
  };
  const toScreen = (v: THREE.Vector3) => { _v.copy(v).project(camera); return { x: ((_v.x + 1) / 2) * V.w, y: ((1 - _v.y) / 2) * V.h }; };

  /* ───── 灯 ───── */
  const hemi = new THREE.HemisphereLight('#F7F5EF', '#DCD6CA', 1.2);
  hemi.position.set(0, -0.25, 1);   // 本场景 +z 朝上
  const sun = new THREE.SpotLight('#FFF6EA', 2.6, 0, 0.4, 0.55, 0);
  sun.castShadow = true; sun.shadow.mapSize.set(SHADOW, SHADOW); sun.shadow.camera.near = 2000; sun.shadow.camera.far = 5200;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.8; sun.shadow.focus = 1; sun.shadow.radius = 2.5;
  const candle = new THREE.SpotLight('#FFC690', 0, 0, 1.1, 1, 2);
  candle.castShadow = true; candle.shadow.mapSize.set(SHADOW, SHADOW); candle.shadow.camera.near = 20; candle.shadow.camera.far = 2400;
  candle.shadow.bias = -0.0006; candle.shadow.normalBias = 0.8; candle.shadow.focus = 1; candle.shadow.radius = 7;
  scene.add(hemi, sun, sun.target, candle, candle.target);
  for (const l of [hemi, sun, candle]) l.layers.enable(1);   // 读信时手里的笺在 layer 1 另画，灯要照得到
  const C_DAY = { sky: new THREE.Color('#F7F5EF'), ground: new THREE.Color('#DCD6CA'), veil: new THREE.Color('#EDE6D6') };
  const C_NIGHT = { sky: new THREE.Color('#25304A'), ground: new THREE.Color('#0B0B0C'), veil: new THREE.Color('#050506') };
  let ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> | null = null;

  /* ───── 读信景深：桌面离屏 → 两遍可分离高斯 → 合成（略压暗），笺另画在上面 ───── */
  const DOF: { rt: THREE.WebGLRenderTarget | null; a: THREE.WebGLRenderTarget | null; b: THREE.WebGLRenderTarget | null; w: number; h: number } = { rt: null, a: null, b: null, w: 0, h: 0 };
  const HDR = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const freeDof = () => { DOF.rt?.dispose(); DOF.a?.dispose(); DOF.b?.dispose(); DOF.rt = DOF.a = DOF.b = null; DOF.w = DOF.h = 0; };
  const dofTargets = () => {
    // 1× 分辨率就够：桌面马上要糊掉；烛的高光会过 1，能用半浮点就用（不然色调映射前就削平了）
    const w = Math.max(2, Math.round(V.w)), h = Math.max(2, Math.round(V.h));
    if (DOF.rt && DOF.w === w && DOF.h === h) return;
    freeDof();
    const type = HDR ? THREE.HalfFloatType : THREE.UnsignedByteType;
    DOF.rt = new THREE.WebGLRenderTarget(w, h, { type });
    DOF.a = new THREE.WebGLRenderTarget(w >> 1, h >> 1, { type, depthBuffer: false });
    DOF.b = new THREE.WebGLRenderTarget(w >> 1, h >> 1, { type, depthBuffer: false });
    DOF.w = w; DOF.h = h;
  };
  const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(own(new THREE.PlaneGeometry(2, 2))); quad.frustumCulled = false; quadScene.add(quad);
  const VQ = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const blurMat = own(new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: VQ, depthTest: false, depthWrite: false, toneMapped: false,
    fragmentShader: /* glsl */ `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tSrc, vUv) * 0.2270270270;
        vec2 o1 = uDir * 1.3846153846, o2 = uDir * 3.2307692308;
        c += (texture2D(tSrc, vUv + o1) + texture2D(tSrc, vUv - o1)) * 0.3162162162;
        c += (texture2D(tSrc, vUv + o2) + texture2D(tSrc, vUv - o2)) * 0.0702702703;
        gl_FragColor = c;
      }`,
  }));
  const compMat = own(new THREE.ShaderMaterial({
    uniforms: { tSharp: { value: null }, tBlur: { value: null }, uMix: { value: 0 }, uDim: { value: 0 }, uDimColor: { value: new THREE.Color() } }, vertexShader: VQ, depthTest: false, depthWrite: false,
    fragmentShader: /* glsl */ `uniform sampler2D tSharp, tBlur; uniform float uMix, uDim; uniform vec3 uDimColor; varying vec2 vUv;
      void main() {
        vec3 c = mix(texture2D(tSharp, vUv).rgb, texture2D(tBlur, vUv).rgb, uMix);
        gl_FragColor = vec4(mix(c, uDimColor, uDim), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const pass = (m: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); };
  const draw = () => {
    const it = reading >= 0 ? items[reading] : null, dof = it ? VEIL.o : 0;
    if (!it || dof < 0.003) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
    dofTargets();
    const { rt, a, b } = DOF as { rt: THREE.WebGLRenderTarget; a: THREE.WebGLRenderTarget; b: THREE.WebGLRenderTarget };
    it.letter.traverse((x) => x.layers.set(1));
    renderer.setRenderTarget(rt); renderer.render(scene, camera);   // 桌面（阴影图在这一遍更新）
    const auto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
    const r = 0.6 + dof * 2.6, iw = 1 / a.width, ih = 1 / a.height, B = blurMat.uniforms;
    B.tSrc.value = rt.texture; B.uDir.value.set(r * iw, 0); pass(blurMat, a);
    B.tSrc.value = a.texture; B.uDir.value.set(0, r * ih); pass(blurMat, b);
    B.tSrc.value = b.texture; B.uDir.value.set(r * 2 * iw, 0); pass(blurMat, a);
    B.tSrc.value = a.texture; B.uDir.value.set(0, r * 2 * ih); pass(blurMat, b);
    const C = compMat.uniforms;
    C.tSharp.value = rt.texture; C.tBlur.value = b.texture;
    C.uMix.value = Math.min(1, dof * 1.6); C.uDim.value = dof * lerp(0.2, 0.4, MODE.n);
    C.uDimColor.value.lerpColors(C_DAY.veil, C_NIGHT.veil, MODE.n);
    pass(compMat, null);
    renderer.autoClear = false; renderer.clearDepth();
    camera.layers.set(1); renderer.render(scene, camera);   // 手里的笺
    renderer.autoClear = true; camera.layers.set(0);
    renderer.shadowMap.autoUpdate = auto;
    it.letter.traverse((x) => x.layers.set(0));
  };

  /* ───── 版面：屏幕像素里排，再落到桌面 ───── */
  const layout = () => {
    V.w = Math.max(1, root.clientWidth); V.h = Math.max(1, root.clientHeight); V.phone = V.w < 700;
    renderer.setSize(V.w, V.h, false);
    camera.aspect = V.w / V.h;
    V.tilt = V.phone ? 0.07 : 0.15;
    V.D = V.h / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(0, -V.D * Math.sin(V.tilt), V.D * Math.cos(V.tilt)); camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();

    const n = items.length, sc = scatterOn(), rootTop = root.getBoundingClientRect().top;
    const headBottom = o.head.getBoundingClientRect().bottom - rootTop;
    let hs: number, y0: number, bandH: number, cx = V.w / 2;
    const P = sc ? pyramid({ W, H, FH }, items.map((it) => it.name), V.w, V.h, headBox(rootTop)) : null;
    if (P) {   // 品字形
      ({ hs, y0, bandH, cx } = P);
      const s = hs / H;
      items.forEach((it, i) => {
        const p = toDesk(P.pos[i].sx, P.pos[i].sy); it.x = p.x; it.y = p.y; it.s = s;
        it.row = P.pos[i].row; it.stepW = P.step / s; it.stackZ = i * STACK_DZ;   // 越新（越靠后）越在上
      });
    } else if (sc) {
      // 品字形摆不下（屏太小、或十几封）时的老办法：两行（十四封以上三行）错落，第一排让开页头
      const rows = n > 14 ? 3 : 2, per = Math.ceil(n / rows), GY = (FH / H) * 0.95;
      const top = Math.max(V.h * 0.3, 250, headBottom + 28), availH = V.h - 120 - top;
      hs = Math.min(clamp(V.h * 0.4, 240, 380), availH / (rows + GY * (rows - 1)));
      const ws = (hs * W) / H, gy = hs * GY, maxSpan = V.w - 2 * Math.max(40, V.w * 0.06);
      // 宽裕时留缝，挤了才互压，压到三分之一为止
      const step = Math.min(ws * 1.22, Math.max(ws * 0.66, (maxSpan - ws) / Math.max(1, per - 1)));
      bandH = rows * hs + (rows - 1) * gy; y0 = top + Math.max(0, (availH - bandH) / 2);
      const s = hs / H;
      items.forEach((it, i) => {
        const row = Math.floor(i / per), col = i % per, inRow = Math.min(per, n - row * per);
        const rowW = ws + (inRow - 1) * step, r = rnd(hash(it.name) + 5);
        const sx = (V.w - rowW) / 2 + ws / 2 + col * step + (row % 2 ? 1 : -1) * step * 0.16 + (r() - 0.5) * 14;
        const sy = y0 + row * (hs + gy) + hs / 2 + (r() - 0.5) * 16;
        const p = toDesk(sx, sy); it.x = p.x; it.y = p.y; it.s = s;
        it.row = row; it.stepW = step / s; it.stackZ = i * STACK_DZ;
      });
    } else {
      const cols = V.phone ? 2 : Math.min(n, 4), rows = Math.ceil(n / cols);
      let gx: number, gy: number, top: number;
      if (V.phone) {   // 两列；行距给开着的封舌（约 0.36 个信封高）留地方，第一行让开页头
        gx = 22; const ws0 = (V.w - 32 - gx) / 2;
        top = headBottom + 64;
        hs = Math.min((ws0 * H) / W, (V.h - 104 - top - 18 * (rows - 1)) / (rows + ((rows - 1) * FH) / H));
        gy = (hs * FH) / H + 18;
      } else {
        hs = clamp(V.h * 0.4, 240, 380); const ws = (hs * W) / H; gx = ws * 0.5;
        const span = cols * ws + (cols - 1) * gx, maxSpan = V.w - 2 * Math.max(40, V.w * 0.06);
        if (span > maxSpan) { const k = maxSpan / span; hs *= k; gx *= k; }
        gy = hs * 0.3;
        top = Math.max(V.h * 0.3, 250);
      }
      const ws = (hs * W) / H, s = hs / H;
      bandH = rows * hs + (rows - 1) * gy; const availBottom = V.h - (V.phone ? 104 : 120);
      y0 = V.phone ? top + Math.max(0, (availBottom - top - bandH) / 2) : Math.min(top + Math.max(0, (availBottom - top - bandH) / 2), availBottom - bandH);
      items.forEach((it, i) => {
        const row = Math.floor(i / cols), col = i % cols, inRow = Math.min(cols, n - row * cols);
        const rowW = inRow * ws + (inRow - 1) * gx, r = rnd(hash(it.name) + 3);
        const sx = (V.w - rowW) / 2 + col * (ws + gx) + ws / 2 + (r() - 0.5) * 10, sy = y0 + row * (hs + gy) + hs / 2 + (r() - 0.5) * 10;
        const p = toDesk(sx, sy); it.x = p.x; it.y = p.y; it.s = s;
        it.row = row; it.stepW = W * 2; it.stackZ = 0;
      });
    }
    for (const it of items) {
      gsap.killTweensOf(it.sp); it.sp.x = 0;
      it.px = it.x; it.py = it.y; it.pr = sc ? it.rotS : it.rot;
      it.pocket.material.shadowSide = sc ? THREE.FrontSide : null;   // 叠起来才要口袋面投影（three 默认往阴影图里画背面，单面纸就没了）
    }
    toDesk(cx, y0 + bandH / 2, FOCUS);
    V.enterDY = toDesk(cx, -V.h * 0.15).y - FOCUS.y + hs;

    // 展读的位姿：笺正对相机，高约屏高一半多
    const d = 0.6 * V.D, sheetAR = (2 * LW) / LH;
    const targetH = Math.min(V.h * (V.phone ? 0.4 : 0.56), (V.w * (V.phone ? 0.92 : 0.72)) / sheetAR);
    _n.set(0, V.phone ? 0.22 : 0.12); ray.setFromCamera(_n, camera);
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    READ.pos.copy(camera.position).addScaledVector(ray.ray.direction, d / ray.ray.direction.dot(fwd));
    READ.quat.copy(camera.quaternion); READ.scale = (targetH * d) / (LH * V.D);
    placeHits(); placeActs();
  };
  const scatterOn = () => !V.phone && items.length > 4;
  // 页头的字实际占到哪儿（相对 root）：max-width 是 36em，字通常没那么宽
  const headBox = (rootTop: number): HeadBox => {
    const rg = document.createRange(); rg.selectNodeContents(o.head);
    const rs = [...rg.getClientRects()].filter((b) => b.width > 0), hb = o.head.getBoundingClientRect(), rootLeft = root.getBoundingClientRect().left;
    if (!rs.length) return { top: hb.top - rootTop, bottom: hb.bottom - rootTop, right: hb.right - rootLeft };
    return { top: Math.min(...rs.map((b) => b.top)) - rootTop, bottom: Math.max(...rs.map((b) => b.bottom)) - rootTop, right: Math.max(...rs.map((b) => b.right)) - rootLeft };
  };

  /* ───── 热区（DOM）：按信封此刻的投影摆，拆封时往上让出窥信与封舌的地方 ───── */
  const placeHits = () => {
    for (const it of items) {
      const c = Math.cos(it.pr), sn = Math.sin(it.pr), pts: { x: number; y: number }[] = [];
      const ext = H / 2 + (it.st.peek > 0.01 || hover === it.idx ? PEEK + 10 : 0) + (it.st.flap > 0.5 ? FH : 0);
      for (const [ax, ay] of [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, ext], [-W / 2, ext]]) {
        const lx = ax * it.s, ly = ay * it.s;
        pts.push(toScreen(new THREE.Vector3(it.px + lx * c - ly * sn, it.py + lx * sn + ly * c, 2)));
      }
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      Object.assign(it.el.style, {
        left: `${Math.min(...xs)}px`, top: `${Math.min(...ys)}px`,
        width: `${Math.max(...xs) - Math.min(...xs)}px`, height: `${Math.max(...ys) - Math.min(...ys)}px`,
      });
    }
  };
  const placeActs = () => {
    if (reading < 0) return;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(READ.quat), right = new THREE.Vector3(1, 0, 0).applyQuaternion(READ.quat);
    const b = toScreen(READ.pos.clone().addScaledVector(up, (-LH / 2) * READ.scale)), c = toScreen(READ.pos);
    const l = toScreen(READ.pos.clone().addScaledVector(right, -LW * READ.scale)), r = toScreen(READ.pos.clone().addScaledVector(right, LW * READ.scale));
    Object.assign(o.acts.style, { left: `${c.x}px`, top: `${b.y + (V.phone ? 20 : 26)}px` });
    // 换一封：桌面放在笺的左右两侧；手机横排在按钮下面两角
    const rootTop = root.getBoundingClientRect().top;
    const sideY = V.phone ? o.acts.getBoundingClientRect().bottom - rootTop + 22 : c.y, inset = V.phone ? 36 : -34;
    Object.assign(o.prev.style, { left: `${l.x + inset}px`, top: `${sideY}px` });
    Object.assign(o.next.style, { left: `${r.x - inset}px`, top: `${sideY}px` });
  };

  /* ───── 窥信 / 展读 / 收回 ───── */
  const setHover = (i: number) => {
    if (reading >= 0 || busy) return;
    const prev = hover; hover = i;
    if (i >= 0) drawSheet(items[i]);
    const sc = scatterOn();
    items.forEach((it, j) => {
      if (sc) {   // 错落：同排压着它的让开，像摊开一手牌（不压着才不用让）；左右各让一半，免得整组贴右时右边那几封挪出屏
        const ov = W - it.stepW, k = j > i ? 0.5 : -0.5;
        const x = i >= 0 && it.row === items[i].row && ov > -12 ? (ov + 18) * it.s * k : 0;
        gsap.to(it.sp, { x, duration: 0.55 * K, ease: 'power3.out', overwrite: true });
      }
      it.el.style.zIndex = j === i ? '1' : '';   // 拿起来的那封，热区也在最上
      const on = j === i, was = j === prev;
      if (on === was) return;
      it.tl?.kill();
      it.tl = gsap.timeline();
      if (on) {
        it.tl.to(it.st, { lift: 1, duration: 0.6 * K, ease: 'power3.out' }, 0);
        if (it.kind === 'friend') it.tl.to(it.st, { flap: 1, duration: 0.75 * K, ease: 'paperFlip' }, 0);
        it.tl.to(it.st, { peek: 1, duration: 0.8 * K, ease: 'expo.out' }, it.kind === 'friend' ? 0.42 * K : 0);
        if (it.kind === 'friend') playPaper('flap');
        it.tl.call(() => playPaper('slide', 0.5), undefined, it.kind === 'friend' ? 0.42 * K : 0);   // 纸声最后挂，免得挪动上面的相对位置
      } else {
        it.tl.to(it.st, { peek: 0, duration: 0.45 * K, ease: 'power2.in' }, 0);
        if (it.kind === 'friend') it.tl.to(it.st, { flap: 0, duration: 0.6 * K, ease: 'power2.inOut' }, 0.42 * K);
        it.tl.to(it.st, { lift: 0, duration: 0.7 * K, ease: 'power2.out' }, 0.35 * K);
        it.tilt.tx = it.tilt.ty = 0;
      }
    });
    placeHits();
  };

  const open = (i: number) => {
    if (busy || !items[i]) return;
    if (reading >= 0) { if (reading !== i) close(() => open(i), true); return; }
    const it = items[i]; reading = i; hover = -1;
    drawSheet(it);
    items.forEach((x) => {
      if (x === it) return;
      x.tl?.kill();
      x.tl = gsap.timeline().to(x.st, { peek: 0, flap: x.kind === 'vacant' ? 1 : 0, lift: 0, duration: 0.5 * K, ease: 'power2.inOut' });
      gsap.to(x.sp, { x: 0, duration: 0.5 * K, ease: 'power2.inOut', overwrite: true });
    });
    o.onRead(i);
    it.tl?.kill();
    const tl = gsap.timeline({ onComplete: () => { busy = null; o.onShown(true); requestAnimationFrame(placeActs); } });
    busy = it.tl = tl;
    tl.to(it.st, { lift: 1, flap: 1, duration: 0.5 * K, ease: 'power2.out' }, 0)
      .to(it.st, { peek: 1, duration: 0.45 * K, ease: 'power2.out' }, 0.4 * K)
      .to(it.st, { out: 1, duration: 0.62 * K, ease: 'power2.inOut' }, '>-.06')
      .to(it.st, { fly: 1, duration: 1.05 * K, ease: 'expo.inOut' }, '>-.28')
      .to(it.st, { lift: 0, duration: 0.8 * K, ease: 'power2.out' }, '<.25')
      .to(VEIL, { o: 1, duration: 0.9 * K, ease: 'power2.out' }, '<-.25')
      .addLabel('uf', '>-.4')
      .to(it.st, { unfold: 1, duration: 1.05 * K, ease: 'unfold' }, 'uf')
      // 纸声最后挂：'>' 指最近加入的一段，插在中间会挪动后面的相对位置
      .call(() => playPaper('slide', 0.9), undefined, 0.4 * K)
      .call(() => playPaper('unfold'), undefined, 'uf');
  };
  const close = (after?: () => void, quick = false) => {
    if (reading < 0 || (busy && !quick)) return;
    const it = items[reading], k = (quick ? 0.6 : 1) * K;
    o.onShown(false);
    busy?.kill();
    const tl = gsap.timeline({
      onComplete: () => {
        busy = null; reading = -1; o.onRead(-1); freeDof();
        it.el.dataset.quiet = '1'; it.el.focus({ preventScroll: true }); delete it.el.dataset.quiet;
        placeHits(); after?.();
      },
    });
    busy = it.tl = tl;
    playPaper('tuck');
    tl.to(it.st, { unfold: 0, duration: 0.6 * k, ease: 'power2.inOut' }, 0)
      .to(VEIL, { o: 0, duration: 0.8 * k, ease: 'power2.inOut' }, 0.3 * k)
      .to(it.st, { fly: 0, duration: 0.95 * k, ease: 'expo.inOut' }, 0.45 * k)
      .to(it.st, { lift: 1, duration: 0.4 * k, ease: 'power2.out' }, '<.4')
      .addLabel('in', '>-.15')
      .to(it.st, { out: 0, duration: 0.55 * k, ease: 'power2.inOut' }, 'in')
      .to(it.st, { peek: 0, duration: 0.4 * k, ease: 'power2.in' }, '>-.05')
      .to(it.st, { flap: it.kind === 'vacant' ? 1 : 0, duration: 0.6 * k, ease: 'power2.inOut' }, '>.02')
      .to(it.st, { lift: 0, duration: 0.6 * k, ease: 'power2.out' }, '<.2')
      .call(() => playPaper('slide', 0.5), undefined, 'in');
  };

  /* ───── 事件 ───── */
  const offs: (() => void)[] = [];
  const on = <E extends Event>(t: EventTarget, type: string, fn: (e: E) => void) => {
    t.addEventListener(type, fn as EventListener); offs.push(() => t.removeEventListener(type, fn as EventListener));
  };
  const bindHit = (it: Item) => {
    const el = it.el, i = it.idx;
    on<PointerEvent>(el, 'pointerenter', (e) => { lastPointer = e.pointerType; if (e.pointerType === 'mouse') setHover(i); });
    on<PointerEvent>(el, 'pointerleave', (e) => { if (e.pointerType === 'mouse' && hover === i) setHover(-1); });
    on<PointerEvent>(el, 'pointerdown', (e) => { lastPointer = e.pointerType; });
    on<PointerEvent>(el, 'pointermove', (e) => {
      const r = el.getBoundingClientRect();
      it.tilt.tx = -((e.clientY - r.top) / r.height - 0.5); it.tilt.ty = (e.clientX - r.left) / r.width - 0.5;
    });
    on(el, 'focus', () => { if (lastPointer !== 'touch' && !el.dataset.quiet) setHover(i); });
    on(el, 'blur', () => { if (hover === i && reading < 0) setHover(-1); });
    on<MouseEvent>(el, 'click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;   // 熟客：普通链接，直接登门
      e.preventDefault();
      if (lastPointer === 'touch' && hover !== i) { setHover(i); return; }   // 触屏：先拆封
      open(i);
    });
  };
  on<KeyboardEvent>(window, 'keydown', (e) => {
    if (reading < 0) return;
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (busy) return;
    if (e.key === 'ArrowLeft' && reading > 0) open(reading - 1);
    if (e.key === 'ArrowRight' && reading < items.length - 1) open(reading + 1);
  });
  on<PointerEvent>(root, 'pointerdown', (e) => {
    if (e.pointerType === 'touch' && hover >= 0 && !(e.target as Element).closest?.('.lt-hits')) setHover(-1);
  });
  on<PointerEvent>(root, 'pointermove', (e) => {
    PTR.t = performance.now();
    if (e.pointerType !== 'mouse') return;
    const r = root.getBoundingClientRect();
    PTR.on = true; toDesk(e.clientX - r.left, e.clientY - r.top, PTR.p);
  });
  on(root, 'pointerleave', () => { PTR.on = false; });
  const ro = new ResizeObserver(() => { if (started) layout(); });

  /* ───── 每帧 ───── */
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  const camRight = new THREE.Vector3(), camUp = new THREE.Vector3(), camBack = new THREE.Vector3();
  const pose = (it: Item, t: number, dt: number) => {
    const st = it.st, s = it.s, e = st.enter;
    const arc = Math.sin(clamp(e, 0, 1) * Math.PI) * 60 * s;
    it.tilt.x += (it.tilt.tx * st.lift - it.tilt.x) * 0.12; it.tilt.y += (it.tilt.ty * st.lift - it.tilt.y) * 0.12;
    const sc = scatterOn(), liftH = 16 + (sc ? items.length * STACK_DZ + 6 : 0);   // 叠着时要抬过上面那几封
    it.px = it.x + it.sp.x; it.py = it.y; it.pr = sc ? it.rotS : it.rot;
    it.env.position.set(it.px, it.py + (1 - e) * V.enterDY, it.stackZ * s + st.lift * liftH * s + arc);
    it.env.rotation.set(it.tilt.x * 0.07, it.tilt.y * 0.09, it.pr + (1 - e) * it.enterRot);
    it.env.scale.setScalar(s);
    // 封舌：0 盖在口袋面上 … 1 平躺在信封上方（比笺低）；不回弹，尖一翘就戳穿躺在上面的笺
    const a = Math.PI * clamp(st.flap, 0, 1);
    // 一阵风只掀没封口、上面也没躺着笺的封舌（虚席那只）
    const free = !RM && st.flap > 0.97 && st.peek < 0.02 && st.out <= 0 && st.fly <= 0;
    it.flapPivot.rotation.x = -a + (free ? WIND.flap * (0.62 + 0.38 * Math.sin(t * 5.3 + it.idx * 1.7)) : 0);
    // 铰链：立起来之前高于口袋面，过了竖直才落到笺下面（早落会让封舌根部陷进口袋面）
    const fall = clamp((a / Math.PI - 0.5) / 0.5, 0, 1);
    it.flapPivot.position.z = lerp(Z_POCKET + 0.5, 0.1, fall * fall * (3 - 2 * fall));

    // 笺：先在封里按 peek/out 抽出（封舌没躺平之前笺顶不许越过封口），再按 fly 飞到展读位
    it.env.updateMatrixWorld();
    let rise = PEEK * st.peek + OUT * st.out;
    if (st.fly <= 0) {
      const room = H / 2 - (Y_IN + LH / 2) - 2, flat = clamp((a / Math.PI - 0.86) / 0.12, 0, 1);
      rise = Math.min(rise, room + flat * (PEEK + OUT));
    }
    _m.makeTranslation(0, Y_IN + rise, Z_LETTER).premultiply(it.env.matrixWorld);
    _m.decompose(_p, _q, _s);
    if (st.fly > 0) {
      const f = clamp(st.fly, 0, 1);
      _p.lerp(READ.pos, f); _p.z += Math.sin(f * Math.PI) * 50;
      _q.slerp(READ.quat, f); _s.setScalar(lerp(s, READ.scale, f));
    }
    it.letter.position.copy(_p); it.letter.quaternion.copy(_q); it.letter.scale.copy(_s);
    const u = st.unfold, uc = clamp(u, 0, 1), f = clamp(st.fly, 0, 1);
    it.sheet.position.x = (LW / 2) * clamp(u, 0, 1.05);
    // 纸会弯：折角 θ 与原先的铰链同（摊开后中缝留一点折角），怎么弯交给着色器
    const theta = -Math.PI * (1 - u) - 0.07 * uc, B = it.bend;
    const vTh = dt > 0 ? (theta - B.prev) / dt : 0; B.prev = theta;
    B.lagV += (110 * (clamp(-vTh * 0.085, -0.7, 0.7) - B.lag) - 12 * B.lagV) * dt; B.lag += B.lagV * dt;   // 边角跟着角速度慢半拍，停下回弹
    const kT = 0.001 * Math.sin(Math.PI * f) + 0.00045 * uc + (RM ? 0 : WIND.g * 0.00024 * Math.sin(t * 1.9) * f);   // 飞起时兜风、读时微拱、风来微颤
    B.kV += (140 * (kT - B.k) - 7 * B.kV) * dt; B.k += B.kV * dt;
    const clear = clamp((f - 0.04) / 0.2, 0, 1);   // 还有一截在封里时不许弯：拱起的边会顶穿口袋面（弹簧余振一并压住）
    it.U.uTheta.value = theta; it.U.uW.value = lerp(1.2, 24, Math.sin(Math.PI * uc));
    it.U.uLag.value = RM ? 0 : B.lag * clear; it.U.uKappa.value = B.k * clear;
    if (it.gold) it.gold.material.envMapIntensity = lerp(1.15, 0.1, MODE.n);   // 夜里屋子暗了，金点只认烛
    it.letter.visible = st.peek > 0.001 || st.out > 0 || st.fly > 0;
    const cast = st.fly < 0.4;   // 举到眼前时不再往桌上投影（烛太近，影子会铺满半张桌）
    if (it.cast !== cast) { it.cast = cast; for (const m of it.panels) m.castShadow = cast; }

    // 影子垫：抬起越高越淡越散
    const h = st.lift * liftH + arc / s;
    const dirX = lerp(0.55, (it.px - CANDLE.x) / 600, MODE.n), dirY = lerp(-0.62, (it.py - CANDLE.y) / 600, MODE.n);
    it.blob.position.set(it.px + dirX * h * s * 0.9, it.py + (1 - e) * V.enterDY + dirY * h * s * 0.9, 0.25 + it.stackZ * s * 0.5);
    it.blob.rotation.z = it.pr + (1 - e) * it.enterRot;
    it.blob.scale.set(W * s * 1.12 * (1 + h * 0.006), H * s * 1.1 * (1 + h * 0.005), 1);
    it.blob.material.opacity = lerp(0.34, 0.42, MODE.n) * (1 - 0.45 * clamp(h / 24, 0, 1)) * e * e;
  };

  // 慢机器（或 5K 屏）连着画都赶不上 42 帧，就一档档降像素比（见 lib/paper/pace.ts）
  const gov = dprGovernor(DPR, (d) => { renderer.setPixelRatio(d); layout(); });
  const tick = (time: number, dms: number) => {
    if (!started || !ground) return;
    const dt = Math.min(dms / 1000, 0.05), t = time, n = MODE.n;
    // 风有阵：同一阵风摇竹影、掀封舌、吹烛、让手里的笺微颤；夜里关了窗，封舌只掀四成
    const gust = RM ? 0 : windGust();   // 全站同一只风钟（lib/wind.ts）：从这里切去花园，樱瓣还在同一阵风里
    WIND.g = gust; WIND.flap = Math.pow(gust, 1.6) * 0.2 * lerp(1, 0.4, n);
    const sway = RM ? 0 : Math.sin(t * 0.9) * (6 + 12 * gust) + Math.sin(t * 2.3 + 1) * 3 * gust;
    sun.position.set(FOCUS.x - 1500, FOCUS.y + 1750, 2600);
    sun.target.position.set(FOCUS.x + sway, FOCUS.y + sway * 0.4, 0);
    sun.intensity = 3.1 * (1 - n);
    hemi.color.lerpColors(C_DAY.sky, C_NIGHT.sky, n); hemi.groundColor.lerpColors(C_DAY.ground, C_NIGHT.ground, n);
    hemi.intensity = lerp(1.25, 0.42, n);
    // 烛：跟指针（略在左上，好斜照），读信时挪到信边；指针跑到 Dock 上，烛停在一排信的边上
    const readingNear = reading >= 0 && items[reading].st.fly > 0.3;
    if (readingNear) {
      camRight.set(1, 0, 0).applyQuaternion(READ.quat); camUp.set(0, 1, 0).applyQuaternion(READ.quat); camBack.set(0, 0, 1).applyQuaternion(READ.quat);
      CT.copy(READ.pos).addScaledVector(camRight, -LW * READ.scale * 1.1).addScaledVector(camUp, LH * READ.scale * 0.45).addScaledVector(camBack, 300);
    } else if (PTR.on) {
      const dx = PTR.p.x - FOCUS.x, dy = PTR.p.y - FOCUS.y, k = Math.min(1, 1 / Math.hypot(dx / (V.w * 0.42), dy / (V.h * 0.3)));
      CT.set(FOCUS.x + dx * k - 60, FOCUS.y + dy * k + 90, 430);
    } else CT.set(FOCUS.x - 260, FOCUS.y + 220, 430);
    if (!tPrev) CANDLE.copy(CT);
    CANDLE.lerp(CT, 1 - Math.exp(-dt * 3.2)); tPrev = t;
    const amp = 0.55 + 1.1 * gust;   // 风来烛焰摇得勤、也往下风偏一点
    const fl = RM ? 1 : 1 + amp * (0.05 * Math.sin(t * 9.1 + Math.sin(t * 2.3) * 2) + 0.03 * Math.sin(t * 23.7) + 0.02 * Math.sin(t * 4.1 + 1.3));
    const jit = RM ? 0 : 1.6, lean = gust * 16;
    candle.position.set(CANDLE.x + Math.sin(t * 7.3) * jit + lean, CANDLE.y + Math.sin(t * 5.1 + 1) * jit - lean * 0.3, CANDLE.z);
    if (readingNear) candle.target.position.copy(READ.pos);
    else candle.target.position.set(CANDLE.x + 40, CANDLE.y - 60, 0);
    candle.intensity = 5.6e5 * n * fl * (reading >= 0 ? lerp(1, 0.72, items[reading].st.fly) : 1);
    sun.shadow.autoUpdate = n < 0.995; candle.shadow.autoUpdate = n > 0.005;
    renderer.toneMappingExposure = lerp(1, 1.12, n);
    ground.material.color.setScalar(lerp(1, 0.9, n));

    for (const it of items) pose(it, t, dt);
    const spreading = items.some((it) => gsap.isTweening(it.sp));
    if (spreading) placeHits();   // 让开的信，热区跟着走
    // 闲时降帧：指针 1.2 s 没动、也没有补间在走，就只画 30 帧、阴影图 15 次/秒；一有动静当帧回满
    const now = performance.now();
    if (busy || spreading || now - PTR.t < 1200 || gsap.isTweening(MODE) || gsap.isTweening(VEIL) || items.some((it) => gsap.isTweening(it.st) || Math.abs(it.bend.lagV) > 0.01 || Math.abs(it.bend.kV) > 1e-5)) lastActive = now;
    const idle = now - lastActive > 600;
    if (idle && t - lastRender < 1 / 30 - 0.003) { gov.skip(); return; }
    if (idle) gov.skip(); else gov.frame(now);   // 只拿连着画的帧量快慢
    renderer.shadowMap.autoUpdate = !idle;
    if (idle && t - lastShadow >= 1 / 15 - 0.003) renderer.shadowMap.needsUpdate = true;
    if (renderer.shadowMap.autoUpdate || renderer.shadowMap.needsUpdate) lastShadow = t;
    lastRender = t;
    draw();
  };

  /* ───── 启动：素材与字到齐再画 ───── */
  const boot = async () => {
    const SRC = {
      yinshou: `${yuantuBase}/tex/yinshou-paper.webp`, paperN: `${yuantuBase}/tex/paper-n.webp`,
      laidN: `${base}/tex/laid-n.webp`, fleck: `${base}/tex/fleck.webp`, bamboo: `${base}/tex/bamboo-shadow.webp`,
      seal: `${base}/seal.webp`, specks: '/textures/inkpad-specks.webp',
      bird: `${base}/motif/bird.webp`, spray: `${base}/motif/spray.webp`, blossom: `${base}/motif/blossom.webp`,
    };
    type Key = keyof typeof SRC;
    const IMG = {} as Record<Key, HTMLImageElement>;
    const allText = o.letters.flatMap((l) => l.cols.map((c) => c.t ?? '')).join('') + '寄自缄虚席以待';
    const latText = allText.replace(/[^\x20-\x7E]/g, '') + o.letters.map((l) => l.host).join(' ');
    await Promise.all([
      ...(Object.keys(SRC) as Key[]).map((k) => loadImg(SRC[k]).then((im) => { IMG[k] = im; })),
      withTimeout(Promise.all([
        document.fonts.load(`400 52px ${KAI}`, allText),
        document.fonts.load(`400 40px ${LAT}`, latText),
        document.fonts.load(`italic 400 40px ${PRINT_LAT}`, latText),
      ]), 4000),
    ]);
    if (!alive) return;

    /* 纸：底色 × 引首纸纹 × 纸屑；四边做旧 */
    const paperFill = (x: CanvasRenderingContext2D, w: number, h: number, baseCol: string, p: PaperOpts = {}) => fillPaper(x, w, h, baseCol, { paper: IMG.yinshou, fleck: IMG.fleck }, p);

    /* 信封正面（口袋面）：纸、洒金红签、名字、寄自 */
    const drawPocket = (it: Letter, r: Rand) => {
      const w = 512, h = 768, c = mk(w, h), x = ctx2d(c);
      const rc = mk(256, 384), rx = ctx2d(rc);   // 粗糙度：纸 .92，红签 .7，金点 .24
      paperFill(x, w, h, '#EFE3C8', { alpha: 0.55, scale: 0.9, edge: 0.16 });
      rx.fillStyle = 'rgb(235,235,235)'; rx.fillRect(0, 0, 256, 384);
      x.strokeStyle = 'rgba(110,84,48,.38)'; x.lineWidth = 2; x.strokeRect(1, 1, w - 2, h - 2);   // 纸边一圈略深，显出厚度
      const lw = 58 * EK, lx = (w - lw) / 2, ly = 146 * EK, lh = (H - 22 - 146) * EK;
      const flakes: { x: number; y: number; s: number; a: number }[] = [];   // 记下每片金箔，洒金那层照着画
      if (it.kind === 'friend') {
        x.save();
        x.fillStyle = '#A3322A'; x.fillRect(lx, ly, lw, lh);
        x.globalCompositeOperation = 'multiply'; x.globalAlpha = 0.35; x.drawImage(IMG.specks, lx, ly, lw, lh);   // 印泥般的斑驳
        x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
        x.strokeStyle = 'rgba(247,236,218,.5)'; x.lineWidth = 1.6; x.strokeRect(lx + 7, ly + 7, lw - 14, lh - 14);
        rx.fillStyle = 'rgb(178,178,178)'; rx.fillRect(lx / 2, ly / 2, lw / 2, lh / 2);
        for (let i = 0; i < 110; i++) {   // 洒金：金箔碎点，大小不一、方向不一
          const fx = lx + r() * lw, fy = ly + r() * lh, s = 0.7 + r() * r() * 3, a = r() * Math.PI;
          flakes.push({ x: fx, y: fy, s, a });
          x.save(); x.translate(fx, fy); x.rotate(a); x.fillStyle = `hsla(${38 + r() * 8},${48 + r() * 16}%,${52 + r() * 16}%,${0.7 + r() * 0.25})`;
          x.beginPath(); x.moveTo(-s, -s * 0.6); x.lineTo(s * 0.9, -s * 0.8); x.lineTo(s, s * 0.7); x.lineTo(-s * 0.7, s); x.closePath(); x.fill(); x.restore();
          rx.fillStyle = 'rgb(55,55,55)'; rx.fillRect(fx / 2 - s * 0.5, fy / 2 - s * 0.5, s, s);
        }
        x.restore();
        vcol(x, it.name, w / 2, ly + 30, ly + lh - 70, { size: 46, color: '#F6EBD6' });
        vcol(x, '缄', w / 2, ly + lh - 64, ly + lh - 18, { size: 26, color: 'rgba(246,235,214,.82)', at: 'end' });
        vcol(x, `寄自 ${it.host}`, 30 * EK, H * 0.6 * EK, (H - 18) * EK, { size: 24, color: '#6F6250', at: 'end', rand: r, print: true });
      } else {   // 空信封：红签只有一道朱框
        x.save(); x.setLineDash([7, 6]); x.strokeStyle = 'rgba(168,53,42,.7)'; x.lineWidth = 2; x.strokeRect(lx + 2, ly + 2, lw - 4, lh - 4); x.restore();
        vcol(x, '虚席以待', w / 2, ly + 40, ly + lh - 30, { size: 32, color: 'rgba(168,53,42,.85)', gap: 1.4 });
      }
      return { map: ctex(c), rough: ctex(rc, false), flakes, label: { lx, ly, lw, lh } };
    };

    /* 洒金的环境：离屏摆一间屋，左上一扇窗（与竹影的天光同向；+z 朝上），近处桌沿一点暖反光。
       PMREM 一张约 6 MB，全桌共用；夜里压暗，金点只剩烛的高光 */
    const goldEnv = (() => {
      const s = new THREE.Scene(), junk: { dispose(): void }[] = [];
      const add = (geo: THREE.BufferGeometry, col: string, k: number, side: THREE.Side) => {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side }));
        junk.push(geo, m.material); s.add(m); return m;
      };
      add(new THREE.BoxGeometry(10, 10, 10), '#5A5044', 1, THREE.BackSide);
      const win = add(new THREE.PlaneGeometry(3.2, 2.4), '#FFF3E0', 9, THREE.DoubleSide); win.position.set(-2.2, 2.6, 4.6); win.lookAt(0, 0, 0);
      const sill = add(new THREE.PlaneGeometry(6, 1.2), '#FFE2B8', 1.3, THREE.DoubleSide); sill.position.set(0, -4.6, 2.2); sill.lookAt(0, 0, 0);
      const lamp = add(new THREE.PlaneGeometry(1.4, 1.4), '#FFF1DE', 2.4, THREE.DoubleSide); lamp.position.set(3.5, 1, 4.5); lamp.lookAt(0, 0, 0);
      const pm = new THREE.PMREMGenerator(renderer), rt = own(pm.fromScene(s, 0.035));
      pm.dispose(); junk.forEach((x) => x.dispose());
      return rt.texture;
    })();
    /* 洒金那一层：只盖红签那一条，每片金箔金属度 1、法线随机偏 ±25°（金箔本来就皱），挪烛就一粒粒亮 */
    const goldLayer = (name: string, flakes: { x: number; y: number; s: number; a: number }[], L: { lx: number; ly: number; lw: number; lh: number }) => {
      const r = rnd(hash(name) + 91), w = Math.ceil(L.lw), h = Math.ceil(L.lh);
      const c = mk(w, h), x = ctx2d(c), nc = mk(w, h), nx = ctx2d(nc);
      nx.fillStyle = 'rgb(128,128,255)'; nx.fillRect(0, 0, w, h);
      for (const f of flakes) {
        const tx = (r() - 0.5) * 0.95, ty = (r() - 0.5) * 0.95, tz = Math.sqrt(Math.max(0.1, 1 - tx * tx - ty * ty));
        const path = (g: CanvasRenderingContext2D) => {
          const s = f.s * 1.15;
          g.save(); g.translate(f.x - L.lx, f.y - L.ly); g.rotate(f.a);
          g.beginPath(); g.moveTo(-s, -s * 0.6); g.lineTo(s * 0.9, -s * 0.8); g.lineTo(s, s * 0.7); g.lineTo(-s * 0.7, s); g.closePath(); g.fill(); g.restore();
        };
        x.fillStyle = `hsl(${40 + r() * 10},${45 + r() * 20}%,${70 + r() * 16}%)`; path(x);
        nx.fillStyle = `rgb(${Math.round((tx * 0.5 + 0.5) * 255)},${Math.round((ty * 0.5 + 0.5) * 255)},${Math.round((tz * 0.5 + 0.5) * 255)})`; path(nx);
      }
      const m = new THREE.Mesh(own(new THREE.PlaneGeometry(w / EK, h / EK)), own(new THREE.MeshStandardMaterial({
        map: ctex(c), normalMap: ctex(nc, false), color: '#EBC77E', metalness: 1, roughness: 0.3, envMap: goldEnv,
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      })));
      m.position.set(((L.lx + w / 2) / 512 - 0.5) * W, (0.5 - (L.ly + h / 2) / 768) * H, Z_POCKET + 0.08);
      m.renderOrder = 2; m.receiveShadow = true;
      return m;
    };

    /* 骑缝印：封舌与口袋面各一份，口袋面挖掉封舌盖住的三角——拆开时一分为二 */
    const SEAL = { h: 42 * EK, w: (42 * EK * IMG.seal.width) / IMG.seal.height };
    const sealLayer = (w: number, h: number, apexY: number) => {   // 上半：画进封舌那张贴图
      const c = mk(w, h), x = ctx2d(c);
      x.globalAlpha = 0.9; x.drawImage(IMG.seal, w / 2 - SEAL.w / 2, apexY - SEAL.h * 0.52, SEAL.w, SEAL.h);
      return c;
    };
    /* 下半：只取印周围一小块当贴花，各封共用一份（原先为一方 77×98 px 的印，每封挂一张 512×768 的透明层）。
       坐标是口袋面贴图（512×768）上的像素；挖三角那一刀与原先同，连 0.9 的不透明度一起（三角里留一成，像印泥渗下去） */
    const sealDecal = (() => {
      const apexY = FH * EK, ox = 256 - SEAL.w / 2 - 2, oy = apexY - SEAL.h * 0.52 - 2;
      const w = Math.ceil(SEAL.w + 4), h = Math.ceil(SEAL.h + 4), c = mk(w, h), x = ctx2d(c);
      x.globalAlpha = 0.9; x.drawImage(IMG.seal, 2, 2, SEAL.w, SEAL.h);
      x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.moveTo(-ox, -oy); x.lineTo(512 - ox, -oy); x.lineTo(256 - ox, apexY - oy); x.closePath(); x.fill();
      return {
        geo: own(new THREE.PlaneGeometry(w / EK, h / EK)),
        mat: own(new THREE.MeshStandardMaterial({ map: ctex(c), transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })),
        x: ((ox + w / 2) / 512 - 0.5) * W, y: (0.5 - (oy + h / 2) / 768) * H,
      };
    })();

    /* 封舌：外面（纸 + 印的上半）与里子 */
    const drawFlap = (it: Letter, inner: boolean) => {
      const w = 512, h = Math.round((512 * FH) / W), c = mk(w, h), x = ctx2d(c);
      if (inner) {
        paperFill(x, w, h, '#DFD0AE', { alpha: 0.55, scale: 0.9, edge: 0 });
        const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(70,50,25,.22)'); g.addColorStop(0.5, 'rgba(70,50,25,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
      } else {
        paperFill(x, w, h, '#F1E6CC', { alpha: 0.55, scale: 0.9, edge: 0.08 });
        if (it.kind === 'friend') x.drawImage(sealLayer(w, h + 60, h), 0, 0);
      }
      x.strokeStyle = inner ? 'rgba(90,66,36,.35)' : 'rgba(110,84,48,.42)'; x.lineWidth = 2.2;   // 两道斜边：纸的切口
      x.beginPath(); x.moveTo(0, 1); x.lineTo(w / 2, h - 1); x.lineTo(w, 1); x.stroke();
      return ctex(c);
    };

    /* 八行笺：笺色、花笺淡印、朱丝栏、字 */
    const MOTIF_AT = { bird: [30, 70, 600, 480], spray: [24, 110, 620, 505], blossom: [40, 60, 560, 553] } as const;   // 淡印落在左半，避开落款
    const drawLetter = (it: Letter, r: Rand) => {
      const c = mk(Math.round(CW * SS), Math.round(CH * SS)), x = ctx2d(c);
      x.scale(SS, SS);
      paperFill(x, CW, CH, mixHex('#FDFAF3', it.color, 0.11), { alpha: 0.12, scale: 1.3, fleck: 0.07, edge: 0.06 });
      const [px, py, pw, ph] = MOTIF_AT[it.motif];
      x.save(); x.globalCompositeOperation = 'multiply'; x.globalAlpha = 0.3;
      x.drawImage(printOf(IMG[it.motif], mixHex(it.color, '#5D5041', 0.45)), px, py, pw, ph); x.restore();
      const cw = (CW - LM.x * 2) / 8, top = LM.top, bot = CH - LM.bottom;
      const line = (x0: number, y0: number, x1: number, y1: number, wdt: number, a: number) => {   // 朱丝栏：木版印的线，深浅不匀
        const n = 26;
        for (let i = 0; i < n; i++) {
          const t0 = i / n, t1 = (i + 1) / n;
          x.strokeStyle = `rgba(168,56,42,${a * (0.72 + r() * 0.28)})`; x.lineWidth = wdt * (0.85 + r() * 0.3);
          x.beginPath(); x.moveTo(lerp(x0, x1, t0) + (r() - 0.5) * 0.8, lerp(y0, y1, t0)); x.lineTo(lerp(x0, x1, t1) + (r() - 0.5) * 0.8, lerp(y0, y1, t1)); x.stroke();
        }
      };
      for (let j = 0; j <= 8; j++) line(LM.x + cw * j, top, LM.x + cw * j, bot, j === 0 || j === 8 ? 3 : 1.8, 0.62);
      line(LM.x - 2, top, CW - LM.x + 2, top, 3, 0.62); line(LM.x - 2, bot, CW - LM.x + 2, bot, 3, 0.62);
      line(LM.x - 12, top - 10, CW - LM.x + 12, top - 10, 1.2, 0.45); line(LM.x - 12, bot + 10, CW - LM.x + 12, bot + 10, 1.2, 0.45);
      it.cols.forEach((col, i) => {   // 第一行在最右
        if (!col.t) return;
        vcol(x, col.t, CW - LM.x - cw * (i + 0.5), top + 30, bot - 26, { size: col.small ? 38 : 52, color: col.small ? '#54493C' : '#211B14', at: col.at ?? 'start', rand: r });
      });
      return c;
    };

    /* 法线：纸面起伏 + 木刻墨版压出的拱花 + 中缝折痕 */
    const letterNormal = (it: Letter) => {
      const w = CW / 2, h = CH / 2, c = mk(w, h), x = ctx2d(c, true);
      const pat = x.createPattern(IMG.paperN, 'repeat')!; pat.setTransform(new DOMMatrix().scale(0.6)); x.fillStyle = pat; x.fillRect(0, 0, w, h);
      const N = x.getImageData(0, 0, w, h), n = N.data;
      const hc = mk(w, h), hx = ctx2d(hc, true);
      hx.fillStyle = '#000'; hx.fillRect(0, 0, w, h); hx.filter = 'blur(2.2px)';
      const [px, py, pw, ph] = MOTIF_AT[it.motif]; hx.drawImage(IMG[it.motif], px / 2, py / 2, pw / 2, ph / 2);
      const hd = hx.getImageData(0, 0, w, h).data, H8 = (i: number, j: number) => hd[(clamp(j, 0, h - 1) * w + clamp(i, 0, w - 1)) * 4];
      const KN = 1.05 / 255, mid = w / 2;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const q = (j * w + i) * 4;
        let nx = n[q] / 127.5 - 1, ny = n[q + 1] / 127.5 - 1;
        const nz = n[q + 2] / 127.5 - 1;
        nx += -(H8(i + 1, j) - H8(i - 1, j)) * KN;   // 拱花凸起
        ny += (H8(i, j + 1) - H8(i, j - 1)) * KN;
        const dc = i - mid; if (Math.abs(dc) < 9) nx += -Math.sign(dc) * 0.14 * (1 - Math.abs(dc) / 9);   // 折痕是一道浅谷
        const l = Math.hypot(nx, ny, nz) || 1;
        n[q] = (nx / l + 1) * 127.5; n[q + 1] = (ny / l + 1) * 127.5; n[q + 2] = (nz / l + 1) * 127.5;
      }
      x.putImageData(N, 0, 0);
      return ctex(c, false);
    };

    /* 影子垫：信封贴桌的那圈柔影 */
    const blobTex = (() => { const c = mk(256, 320), x = ctx2d(c); x.filter = 'blur(16px)'; x.fillStyle = 'rgba(40,26,10,1)'; x.fillRect(34, 34, 188, 252); return ctex(c); })();
    /* 竹影：窗外的竹子投在桌上，作为天光的遮光片 */
    sun.map = (() => {
      const s = 1024, c = mk(s, s), x = ctx2d(c);
      x.fillStyle = '#fff'; x.fillRect(0, 0, s, s);
      const b = IMG.bamboo, t = mk(b.width, b.height), tx = ctx2d(t);
      tx.drawImage(b, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = 'rgb(58,66,86)'; tx.fillRect(0, 0, b.width, b.height);
      x.filter = 'blur(2.5px)'; x.globalAlpha = 0.74;
      x.drawImage(t, 150, 120, b.width * 1.05, b.height * 1.05);
      x.save(); x.translate(s - 60, 60); x.scale(-1, 1); x.globalAlpha = 0.45; x.drawImage(t, 0, 0, b.width * 0.8, b.height * 0.8); x.restore();
      return ctex(c);
    })();

    /* 桌面：园图同一张引首纸，调淡 */
    const groundPaper = (() => { const c = mk(1024, 1024), x = ctx2d(c); x.fillStyle = '#F3F0E9'; x.fillRect(0, 0, 1024, 1024); x.globalCompositeOperation = 'multiply'; x.globalAlpha = 0.42; x.drawImage(IMG.yinshou, 0, 0); return c; })();
    const T = {
      ground: ctex(groundPaper, true, [11, 7.5]), paperN: ctex(IMG.paperN, false, [32, 22]), back: ctex(IMG.yinshou),
      laidN: ctex(IMG.laidN, false, [2, 3]), laidN2: ctex(IMG.laidN, false, [2, 1]),
    };
    ground = new THREE.Mesh(own(new THREE.PlaneGeometry(9000, 6000)), own(new THREE.MeshStandardMaterial({ map: T.ground, normalMap: T.paperN, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 1 })));
    ground.receiveShadow = true; scene.add(ground);

    const triGeo = own(new THREE.BufferGeometry());   // 封舌：铰链在原点，尖朝 -y；逆时针，正面朝 +z
    triGeo.setAttribute('position', new THREE.Float32BufferAttribute([-W / 2, 0, 0, 0, -FH, 0, W / 2, 0, 0], 3));
    triGeo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    triGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0.5, 0, 1, 1], 2));
    // 笺的半页：正面 uv 只取整张贴图的一半；横向分段给弯纸用（折痕与边角滞后都在左半页上，分得细些）
    const panelGeo = (half: 'R' | 'L' | null, segs: number) => {
      const g = own(new THREE.PlaneGeometry(LW, LH, segs, 1)), uv = g.attributes.uv;
      if (half) for (let i = 0; i < uv.count; i++) uv.setX(i, half === 'R' ? 0.5 + uv.getX(i) * 0.5 : uv.getX(i) * 0.5);
      return g;
    };
    const GEO = { pocket: own(new THREE.PlaneGeometry(W, H)), R: panelGeo('R', 24), L: panelGeo('L', 64), bR: panelGeo(null, 24), bL: panelGeo(null, 64), blob: own(new THREE.PlaneGeometry(1, 1)) };
    const mat = <M extends THREE.Material>(m: M) => own(m);
    /* 占位贴图：笺画好之前先挂上（笺这时藏在封里看不见），换真图时着色器不用重编 */
    const solid = (col: string) => { const c = mk(2, 2), x = ctx2d(c); x.fillStyle = col; x.fillRect(0, 0, 2, 2); return c; };
    const PH = { map: ctex(solid('#FBF8F1')), normal: ctex(solid('rgb(128,128,255)'), false) };

    const build = async (L0: Letter, idx: number): Promise<Item> => {
      const r = rnd(hash(L0.name) + 17);
      const rot = (r() - 0.5) * 0.07, enterRot = (idx % 2 ? 1 : -1) * (0.18 + r() * 0.14);
      const pocket = drawPocket(L0, r);
      const env = new THREE.Group(); scene.add(env);
      const gold = L0.kind === 'friend' ? goldLayer(L0.name, pocket.flakes, pocket.label) : undefined;
      if (gold) env.add(gold);
      const pm = new THREE.Mesh(GEO.pocket, mat(new THREE.MeshStandardMaterial({ map: pocket.map, roughnessMap: pocket.rough, roughness: 1, normalMap: T.laidN, normalScale: new THREE.Vector2(0.7, 0.7) })));
      pm.position.z = Z_POCKET; pm.castShadow = pm.receiveShadow = true; env.add(pm);
      if (L0.kind === 'friend') {   // 印的下半盖在口袋面上
        const sm = new THREE.Mesh(sealDecal.geo, sealDecal.mat);
        sm.position.set(sealDecal.x, sealDecal.y, Z_POCKET + 0.05); sm.receiveShadow = true; env.add(sm);
      }
      const flapPivot = new THREE.Group(); flapPivot.position.y = H / 2; env.add(flapPivot);
      await nextFrame();   // 口袋面、洒金画完先让一帧，再画封舌
      const fo = new THREE.Mesh(triGeo, mat(new THREE.MeshStandardMaterial({ map: drawFlap(L0, false), normalMap: T.laidN2, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.92 })));
      const fi = new THREE.Mesh(triGeo, mat(new THREE.MeshStandardMaterial({ map: drawFlap(L0, true), roughness: 0.95, side: THREE.BackSide })));
      fo.castShadow = fo.receiveShadow = fi.castShadow = true;   // 里子不接影：笺贴着它滑出，偏置会把影子描成一道黑边
      flapPivot.add(fo, fi);

      // 笺：letter（整体位姿）→ sheet（摊开时整体右移半页，让中缝居中）→ 右半页 R ＋ 铰链 → 左半页 L
      // 笺第一次移近才画（drawSheet）：先挂占位贴图，r 在这里分一支留给它，画出来与当场画一模一样
      //   弯纸的参数各封一份，所以正面、背面、投影的材质都按封、按半页各建一份（着色器同一套，只编一次）
      const paper = r.fork();
      const U: BendU = { uTheta: { value: -Math.PI }, uW: { value: 0 }, uLag: { value: 0 }, uKappa: { value: 0 }, uLW: { value: LW } };
      const front = (role: 0 | 1) => mat(bendify(new THREE.MeshStandardMaterial({ map: PH.map, normalMap: PH.normal, roughness: 0.9 }), U, role));
      const back = (role: 0 | 1) => mat(bendify(new THREE.MeshStandardMaterial({ map: T.back, color: '#F2EADB', roughness: 0.95, side: THREE.BackSide }), U, role));
      const depth = (role: 0 | 1) => mat(bendify(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), U, role));
      const fronts = [front(0), front(1)], dR = depth(0), dL = depth(1);
      const letter = new THREE.Group(), sheet = new THREE.Group(); letter.add(sheet); scene.add(letter);
      const R = new THREE.Mesh(GEO.R, fronts[0]), Rb = new THREE.Mesh(GEO.bR, back(0));
      const hinge = new THREE.Group(); hinge.position.set(-LW / 2, 0, -0.2);   // 铰链不再转：折由着色器算
      const Lm = new THREE.Mesh(GEO.L, fronts[1]), Lb = new THREE.Mesh(GEO.bL, back(1));
      Lm.position.x = Lb.position.x = -LW / 2;
      R.customDepthMaterial = Rb.customDepthMaterial = dR; Lm.customDepthMaterial = Lb.customDepthMaterial = dL;
      const panels = [R, Rb, Lm, Lb];
      for (const m of panels) m.castShadow = m.receiveShadow = true;
      sheet.add(R, Rb, hinge); hinge.add(Lm, Lb);
      letter.visible = false;

      const blob = new THREE.Mesh(GEO.blob, mat(new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.3 })));
      blob.position.z = 0.25; blob.renderOrder = 1; scene.add(blob);

      return {
        ...L0, idx, el: o.hits[idx], rot, enterRot, x: 0, y: 0, s: 1,
        st: { enter: RM ? 1 : 0, lift: 0, flap: L0.kind === 'vacant' ? 1 : 0, peek: 0, out: 0, fly: 0, unfold: 0 },
        tilt: { x: 0, y: 0, tx: 0, ty: 0 },
        env, flapPivot, letter, sheet, hinge, panels, blob, cast: true, fronts, paper,
        U, bend: { prev: -Math.PI, lag: 0, lagV: 0, k: 0, kV: 0 }, gold, pocket: pm,
        rotS: (rnd(hash(L0.name) + 29)() - 0.5) * 0.17, row: 0, stepW: W * 2, stackZ: 0, sp: { x: 0 }, px: 0, py: 0, pr: rot,
      };
    };
    // 一封一帧地摆：每封信封要画好几张纸，一口气画完正好卡住转场
    for (const [idx, L0] of o.letters.entries()) {
      await nextFrame(); if (!alive) return;
      items.push(await build(L0, idx));
    }
    if (!alive) return;
    // 笺的正面可以先画好搁着（桌面上趁空闲），法线与上贴图留到下一次空闲；用 fork 画，先画后画都是同一张
    const sheetFront = new Map<Item, HTMLCanvasElement>();
    drawSheet = (it) => {
      if (!it.paper) return;
      const map = ctex(sheetFront.get(it) ?? drawLetter(it, it.paper.fork())), normal = letterNormal(it);
      for (const m of it.fronts) { m.map = map; m.normalMap = normal; }
      it.paper = undefined; sheetFront.delete(it);
    };
    items.forEach(bindHit);

    layout();
    ro.observe(root);
    // 开画前把功夫做在前头：贴图分帧传进显卡；着色器按三套目标并行编好——画布、读信景深的离屏（线性、不做色调映射）、
    //   阴影图（弯纸与 three 自己的深度材质；PCF 画背面，正反两面都要）。第一帧、第一次展读都不再同步等编译
    await uploadSpread(renderer, [...texturesOf(scene), sun.map], () => alive);
    if (!alive) return;
    {
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: HDR ? THREE.HalfFloatType : THREE.UnsignedByteType });
      const geo = new THREE.PlaneGeometry(1, 1), depth = new THREE.Scene(), mats: THREE.Material[] = [];
      const U0: BendU = { uTheta: { value: 0 }, uW: { value: 0 }, uLag: { value: 0 }, uKappa: { value: 0 }, uLW: { value: LW } };
      for (const side of [THREE.FrontSide, THREE.BackSide]) {
        mats.push(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side }));
        mats.push(bendify(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side }), U0, 0));
      }
      for (const m of mats) depth.add(new THREE.Mesh(geo, m));
      const pass = (m: THREE.Material) => new THREE.Scene().add(new THREE.Mesh(geo, m));
      await warmPrograms(renderer, [
        { scene, camera }, { scene, camera, target: rt }, { scene: depth, camera, target: rt, lights: scene },
        { scene: pass(blurMat), camera: quadCam, target: rt }, { scene: pass(compMat), camera: quadCam },
      ]);
      rt.dispose(); geo.dispose(); mats.forEach(own);   // 材质留到拆时再放：放早了，编好的程序跟着被回收
      if (!alive) return;
    }
    started = true;
    gsap.ticker.add(tick);
    o.onReady?.();
    // 笺本来第一次移近才画（~60 ms，移近那一下会顿）；桌面上等信落定、趁空闲分三步画好传进显卡。手机省显存，仍等点开再画
    if (!o.coarse) void (async () => {
      await new Promise((r) => setTimeout(r, RM ? 300 : 1800 + items.length * 140));
      for (const it of items) {
        await whenIdle(); if (!alive) return;
        if (!it.paper) continue;
        if (!sheetFront.has(it)) sheetFront.set(it, drawLetter(it, it.paper.fork()));
        await whenIdle(); if (!alive) return;
        drawSheet(it);
        await whenIdle(); if (!alive) return;
        await uploadSpread(renderer, [it.fronts[0].map, it.fronts[0].normalMap], () => alive);
      }
    })();
    // 进场：信一封封落到桌上（每次进来都演；reduced-motion 直接摆好）
    if (!RM) items.forEach((it, i) => { gsap.to(it.st, { enter: 1, duration: 1.25, delay: 0.25 + i * 0.14, ease: 'expo.out' }); });
  };
  boot().catch((err) => { console.warn('[lights] 尺牍没能摆上桌', err); });

  return {
    setNight(night) { gsap.to(MODE, { n: night ? 1 : 0, duration: 1.6, ease: 'power2.inOut', overwrite: true }); },
    open,
    close: () => close(),
    destroy() {
      alive = false; started = false;
      gsap.ticker.remove(tick);
      for (const it of items) { it.tl?.kill(); gsap.killTweensOf([it.st, it.sp]); }
      gsap.killTweensOf([MODE, VEIL]);
      freeDof();
      busy = null;
      ro.disconnect();
      offs.forEach((f) => f());
      owned.forEach((x) => x.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
};
