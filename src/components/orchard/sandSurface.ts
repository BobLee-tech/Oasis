// ✦ 砂面：垫在砂庭 SVG 底下的一块片元着色器。演示与取舍见 docs/site-next.html「星图 · 砂」。
//   · 同一张距离场（sandField，世界坐标）上传成半精度浮点贴图：三圈等值线（LV 9/17/25，按 kT 换算）耙成沟，
//     远处 7/kT 一道的直纹耙成直沟，再叠细砂粒——几何一笔不改，只是让它受光。
//   · 光从悉尼的太阳来（lib/sun.ts，每分钟重算一次）：南半球正午太阳在北，影子朝下；早上影子朝西拖长。
//     石影按石高（RH，文章越长越高）与太阳高度解析地算（每块石一个胶囊），不进贴图。夜里光换成右上的月，
//     地色压到夜底色，只剩垄脊上一线冷光，星池的倒影与星仍由 SVG / sky 画布负责。
//   · 只在有变化时画：相机、光、距离场变了才排一帧；静着零开销。
//   · 画布由引擎自建自拆（React 开发模式挂载两次，复用画布会拿到已丢失的上下文）；建不起就返回 null，SVG 照旧。
import { sunAt } from '../../lib/sun';
import type { Field } from '../../lib/sandGarden';

export interface SurfaceStone { x: number; y: number; R: number; H: number; seed: boolean }
export interface SandSurface {
  setField(F: Field | null, kT: number): void;
  setStones(list: SurfaceStone[]): void;
  /** 直纹的范围（世界坐标），与 SVG 直纹同一个矩形 */
  setRake(x0: number, y0: number, x1: number, y1: number): void;
  setView(k: number, x: number, y: number): void;
  /** 进场耙纹演完才显出浮雕（耙出来的线先在，再沉成沟） */
  setShown(shown: boolean): void;
  destroy(): void;
}
/** 光向（屏幕坐标、y 朝下、指向光源）变了时回调：SVG 的石色渐变跟着转 */
export type LightFn = (lx: number, ly: number) => void;

const MAX_STONES = 96;

const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes, uF0, uFn;
uniform vec3 uView;                 // k, x, y（相机）
uniform vec4 uRakeR;                // 直纹的范围（世界坐标 x0 y0 x1 y1），与现网 sand-fade 蒙版同：内 55% 满、到边缘淡尽
uniform float uKT, uFg, uDpr, uNight;
uniform vec3 uL, uLcol, uAmb, uPaper;
uniform sampler2D uField, uTex;
uniform vec4 uSt[${MAX_STONES}];    // 世界 x, y；屏幕 R, H（px）
uniform float uSeed[${MAX_STONES}];
uniform int uN;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
// 距离场（世界单位）× kT = 「档位像素」：LV 就是按这个量定的
float tierD(vec2 w){
  vec2 uv = ((w - uF0) / uFg + .5) / uFn;
  if (any(lessThan(uv, vec2(0))) || any(greaterThan(uv, vec2(1)))) return 1e3;
  return texture(uField, uv).r * uKT;
}
float sandH(vec2 sp){
  vec2 w = (sp - uView.yz) / uView.x;
  float d = tierD(w);
  float rings = -cos(6.2831853 * (d - 9.) / 8.);                  // 9 / 17 / 25 是沟，13 / 21 是垄
  float wr = smoothstep(3.5, 6.5, d) * (1. - smoothstep(27., 31., d));
  float rake = -cos(6.2831853 * w.y * uKT / 7.);                    // 远处的直沟（现网 gap = 7 / kT）
  vec2 rc = (uRakeR.xy + uRakeR.zw) * .5, rh = max((uRakeR.zw - uRakeR.xy) * .5, vec2(1.));
  float fade = 1. - smoothstep(.55, 1., length((w - rc) / rh));
  float wk = smoothstep(29., 35., d) * fade * mix(1., .3, uNight);
  float g = (vn(sp * .85) - .5) * .3 + (vn(sp * 2.7) - .5) * .1;
  return .62 * rings * wr + .4 * rake * wk + g;
}
void main(){
  vec2 sp = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;   // 屏幕 CSS px，y 朝下
  float hx = sandH(sp + vec2(1, 0)) - sandH(sp - vec2(1, 0));
  float hy = sandH(sp + vec2(0, 1)) - sandH(sp - vec2(0, 1));
  vec3 n = normalize(vec3(-hx * .5, -hy * .5, 1.));
  vec3 L = normalize(uL);
  vec2 dir = normalize(L.xy + 1e-5);
  float tanE = L.z / max(length(L.xy), 1e-3);
  // 石影：每块石一个从石心朝背光方向拖出的胶囊，长 = 石高 / tan(太阳高度)；石根一圈压暗
  float sh = 0., ao = 0.;
  for (int i = 0; i < ${MAX_STONES}; i++) {
    if (i >= uN) break;
    vec4 s = uSt[i];
    vec2 c = s.xy * uView.x + uView.yz;
    vec2 v = sp - c;
    float len = min(90., s.w / max(tanE, .06));
    if (dot(v, v) > (len + s.z + 8.) * (len + s.z + 8.)) continue;
    float t = clamp(dot(v, -dir), 0., len);
    float dist = length(v + dir * t) - s.z * .92;
    float fade = 1. - .55 * t / max(len, 1.);
    sh = max(sh, (1. - smoothstep(-1.5, 2.5 + t * .06, dist)) * fade * (1. - uSeed[i]));
    ao = max(ao, (1. - smoothstep(s.z, s.z + 6., length(v))) * (1. - uSeed[i] * .6));
  }
  float diff = max(dot(n, L), 0.);
  float rim = pow(max(dot(n, normalize(L + vec3(0, 0, 1))), 0.), 24.);
  vec3 tex = texture(uTex, sp / 640.).rgb;
  vec3 paper = mix(uPaper, tex, .32 * (1. - uNight));
  float grain = step(.985, h21(floor(sp * uDpr))) * .5;
  // 昼：平处保持现网纸色（正午为准），沟的明暗来自法线；夜：平处就是夜底色，只有垄脊一线冷光
  float flat0 = uAmb.x + uLcol.x * .93;
  vec3 lit = (uAmb + uLcol * diff * (1. - sh * .78)) / max(flat0, .05);
  lit = mix(vec3(1.), lit, mix(.62, 1., uNight));
  vec3 col = pow(paper, vec3(2.2)) * lit * (1. - ao * .18);
  col += uLcol * (rim * mix(.04, .1, uNight) + grain * diff * mix(.06, .08, uNight)) * (1. - sh);
  o = vec4(pow(max(col, 0.), vec3(1. / 2.2)), 1.);
}`;

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];

export const createSandSurface = (host: HTMLElement, before: Element | null, onLight?: LightFn): SandSurface | null => {
  const canvas = document.createElement('canvas');
  canvas.className = 'sand-gl';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false });
  if (!gl) return null;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { if (import.meta.env.DEV) console.warn('[sand]', gl.getShaderInfoLog(s)); return null; }
    return s;
  };
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { if (import.meta.env.DEV) console.warn('[sand]', gl.getProgramInfoLog(prog)); return null; }
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (n: string) => gl.getUniformLocation(prog, n);
  const mkTex = (unit: number, wrap: number) => {
    const t = gl.createTexture()!; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
  };
  const texField = mkTex(0, gl.CLAMP_TO_EDGE), texPaper = mkTex(1, gl.REPEAT);
  gl.uniform1i(U('uField'), 0); gl.uniform1i(U('uTex'), 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([250, 248, 243, 255]));
  host.insertBefore(canvas, before);

  let raf = 0, dead = false, dpr = 1, W = 0, H = 0;
  let night = document.documentElement.classList.contains('dark');
  const view = { k: 1, x: 0, y: 0 };
  let kT = 1, hasField = false;
  const stoneBuf = new Float32Array(MAX_STONES * 4), seedBuf = new Float32Array(MAX_STONES);
  let nStones = 0;
  let light = { L: [0, 0, 1] as number[], col: [1, 1, 1], amb: [0.4, 0.4, 0.4] };

  const computeLight = () => {
    if (night) return { L: [0.5, -0.5, 0.7], col: [0.3, 0.4, 0.52], amb: [0.02, 0.03, 0.055] };
    const { az, el } = sunAt(new Date());
    // 天还没亮 / 已经落了但主题仍是昼（手动选了昼）：给一束很低的晨昏光，不让砂面全黑
    const e = Math.max(5, el) * Math.PI / 180, a = az * Math.PI / 180;
    const warm = Math.max(0, 1 - Math.max(0, el) / 35);
    return {
      L: [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)],
      col: [1.0, 0.95 - 0.12 * warm, 0.88 - 0.3 * warm].map((v) => v * 0.6),
      amb: [0.47, 0.48, 0.52],
    };
  };
  const relight = () => {
    light = computeLight();
    const n = Math.hypot(light.L[0], light.L[1]) || 1;
    onLight?.(light.L[0] / n, light.L[1] / n);
    invalidate();
  };

  const draw = () => {
    raf = 0;
    if (dead || !hasField) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(U('uRes'), canvas.width, canvas.height);
    gl.uniform1f(U('uDpr'), dpr);
    gl.uniform3f(U('uView'), view.k, view.x, view.y);
    gl.uniform1f(U('uKT'), kT);
    gl.uniform1f(U('uNight'), night ? 1 : 0);
    gl.uniform3f(U('uL'), light.L[0], light.L[1], light.L[2]);
    gl.uniform3f(U('uLcol'), light.col[0], light.col[1], light.col[2]);
    gl.uniform3f(U('uAmb'), light.amb[0], light.amb[1], light.amb[2]);
    gl.uniform3f(U('uPaper'), ...hex(night ? '#0A0F1D' : '#FAF8F3'));
    gl.uniform4fv(U('uSt'), stoneBuf); gl.uniform1fv(U('uSeed'), seedBuf); gl.uniform1i(U('uN'), nStones);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texField);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texPaper);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const invalidate = () => { if (!raf && !dead) raf = requestAnimationFrame(draw); };

  // 砂沟是低频的东西：最多 1.5 倍像素就够细，相机移动时每帧画的量也压得住
  const resize = () => {
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    W = host.clientWidth; H = host.clientHeight;
    canvas.width = Math.max(2, Math.round(W * dpr)); canvas.height = Math.max(2, Math.round(H * dpr));
    invalidate();
  };
  const ro = new ResizeObserver(resize); ro.observe(host); resize();
  const mo = new MutationObserver(() => {
    const n = document.documentElement.classList.contains('dark');
    if (n !== night) { night = n; relight(); }
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  const sunTimer = window.setInterval(relight, 60_000);
  const paper = new Image();
  paper.onload = () => {
    if (dead) return;
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texPaper);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paper);
    invalidate();
  };
  paper.src = '/textures/paper-cotton.webp';
  relight();

  return {
    setField(F, k) {
      kT = k;
      if (!F) { hasField = false; return; }
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texField);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, F.nx, F.ny, 0, gl.RED, gl.FLOAT, F.v);
      gl.uniform2f(U('uF0'), F.x0, F.y0); gl.uniform1f(U('uFg'), F.g); gl.uniform2f(U('uFn'), F.nx, F.ny);
      hasField = true; invalidate();
    },
    setStones(list) {
      nStones = Math.min(MAX_STONES, list.length);
      for (let i = 0; i < nStones; i++) {
        const s = list[i];
        stoneBuf.set([s.x, s.y, s.R, s.H], i * 4); seedBuf[i] = s.seed ? 1 : 0;
      }
      invalidate();
    },
    setRake(x0, y0, x1, y1) { gl.uniform4f(U('uRakeR'), x0, y0, x1, y1); invalidate(); },
    setView(k, x, y) {
      if (k === view.k && x === view.x && y === view.y) return;
      view.k = k; view.x = x; view.y = y; invalidate();
    },
    setShown(shown) { canvas.classList.toggle('on', shown); if (shown) invalidate(); },
    destroy() {
      dead = true; cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); clearInterval(sunTimer);
      gl.deleteBuffer(buf); gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs);
      gl.deleteTexture(texField); gl.deleteTexture(texPaper);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    },
  };
};
