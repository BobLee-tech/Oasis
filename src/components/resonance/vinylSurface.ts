// 💿 唱片盘面：一块片元着色器（lib/gl.ts，与涟漪内页、水琴窟同一套封装，不引 three）。
//   演示与取舍见 docs/site-next.html「共鸣 · 唱片」。三条规矩：
//   · 盘转，光不转：各向异性高光按声槽切线算（Kajiya–Kay），钉在光源那边——昼是左上的窗（与尺牍同向），
//     夜是烛，跟着指针；转动的提示交给该动的东西：贴纸的字、几粒灰尘、一道发丝划痕、一点翘曲。
//   · 声槽显影：同一张专辑按真实时长（trackPeaks.generated.json 的 durations）排成几条带，曲间是更亮的空槽；
//     带里的粗糙度取自这首的声波峰值——响的段落高光散开发灰，静的段落黑而锐。
//   · 只在有变化时画：转着时每帧一次全屏三角形；停着、光也没挪就一帧不画。拿不到 WebGL2 返回 null，调用方留 CSS 盘。
//   · 画布由引擎自建自拆：React 开发模式会挂载两次，复用同一块画布会拿到已经 loseContext 的上下文。
import { createFullscreenProgram } from '../../lib/gl';
import { durationOf, loadTrackPeaks, onTrackPeaksReady, peaksOf } from '../../lib/trackPeaks';

export interface VinylAlbum {
  key: string;
  artist: string;
  title: string;
  year: string;
  color: string;
  tracks: { id: string }[];
}

export interface VinylSurface {
  setAlbum(album: VinylAlbum): void;
  /** 盘的转角（度，顺时针），由音乐页的 ticker 写 */
  setAngle(deg: number): void;
  /** 第 index 首、曲内进度 progress 时唱针该落的半径（盘半径的倍数） */
  needleRadius(index: number, progress: number): number;
  destroy(): void;
}

/** 影子方向（单位向量，屏幕坐标、y 朝下）：昼＝窗的反方向，夜＝离烛而去 */
export type ShadowFn = (dx: number, dy: number) => void;

// 盘面分区（盘半径的倍数）：贴纸 0.38（现网 inset 31%）、跑出区到 0.5、声槽到 0.955、导入槽、外缘倒角
const R_LABEL = 0.38, R_IN = 0.5, R_OUT = 0.955, GAP = 0.0075;
const BANDS = 1024;
const SUN: [number, number, number] = [-0.52, 0.6, 0.61];      // 左上的窗，与尺牍同向（GL 坐标，y 朝上）

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform float uRot, uNight, uPx, uWarp;
uniform vec3 uSun, uCandle;
uniform sampler2D uBands, uLabel;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n1(float x){ float i = floor(x), f = fract(x); return mix(h21(vec2(i, 1.7)), h21(vec2(i + 1., 1.7)), f * f * (3. - 2. * f)); }
float segD(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h); }
void main(){
  vec2 p = gl_FragCoord.xy / uRes * 2. - 1.;
  float r = length(p);
  float cover = 1. - smoothstep(1. - uPx * 1.5, 1., r);
  if (cover <= 0.) { o = vec4(0.); return; }
  vec2 T = r > 1e-4 ? vec2(-p.y, p.x) / r : vec2(1., 0.);
  float c = cos(uRot), s = sin(uRot);
  vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);         // 盘自己的坐标（顺时针转）

  vec3 Lc = uCandle - vec3(p, 0.); float dc = length(Lc); Lc /= dc;
  vec3 L = normalize(mix(normalize(uSun), Lc, uNight));
  float Li = mix(1.0, 2.2 / (1. + dc * dc * .55), uNight);
  vec3 Lcol = mix(vec3(1., .975, .94), vec3(1., .72, .45), uNight);
  vec3 H = normalize(L + vec3(0., 0., 1.));
  vec2 hxy = H.xy + uWarp * vec2(cos(uRot), sin(uRot)) * r;     // 翘曲：每圈晃一下
  float hl = length(hxy); vec2 hn = hxy / max(hl, 1e-4);
  float a = dot(T, hn), s2 = max(0., 1. - a * a);
  float amp = smoothstep(.02, .4, hl);

  vec3 col;
  if (r < ${R_LABEL.toFixed(3)}) {
    if (r < .022) {                                              // 中轴
      vec3 n = normalize(vec3(p / .022 * .8, 1.));
      col = vec3(.62, .63, .66) * (.35 + .65 * max(dot(n, L), 0.)) * Li * Lcol + Lcol * Li * pow(max(dot(n, H), 0.), 60.) * .9;
    } else {
      vec2 luv = q / ${R_LABEL.toFixed(3)} * .5 + .5; luv.y = 1. - luv.y;
      vec4 lab = texture(uLabel, luv);
      vec3 alb = pow(lab.rgb, vec3(2.2));
      float ink = lab.a;                                         // 字：压进纸里的一层
      vec2 e = vec2(1.5 / 512., 0.);
      float dx = texture(uLabel, luv + e.xy).a - texture(uLabel, luv - e.xy).a;
      float dy = texture(uLabel, luv - e.yx).a - texture(uLabel, luv + e.yx).a;
      vec2 gs = vec2(c * dx + s * dy, -s * dx + c * dy);
      vec3 n = normalize(vec3(gs * 1.6, 1.));
      float rim = smoothstep(${R_LABEL.toFixed(3)} - .012, ${R_LABEL.toFixed(3)}, r);
      col = alb * (.28 + .82 * max(dot(n, L), 0.)) * Li * Lcol * (1. - rim * .45)
          + Lcol * Li * pow(max(dot(n, H), 0.), 30.) * .05 * (1. - ink);
    }
  } else {
    vec2 bt = texture(uBands, vec2(clamp((r - .4) / .6, 0., 1.), .5)).rg;
    float loud = bt.r, gap = bt.g;
    float leadIn = smoothstep(${R_OUT.toFixed(3)}, ${(R_OUT + 0.004).toFixed(3)}, r) * (1. - smoothstep(.984, .987, r));
    float runOut = 1. - smoothstep(${(R_IN - 0.004).toFixed(3)}, ${R_IN.toFixed(3)}, r);
    float rimZ = smoothstep(.985, .995, r);
    float gloss = clamp(max(gap, max(leadIn, runOut)), 0., 1.);
    float g1 = n1(r / uPx * .85), g2 = n1(r * 220.);
    float nexp = mix(mix(1100., 34., loud), 3200., gloss);
    float spec = amp * (pow(s2, nexp) * mix(.7, 1.15, g1) + pow(s2, nexp * .06) * mix(.035, .2, loud) * (1. - gloss));
    vec3 base = vec3(.012, .012, .015) * (.8 + .4 * g2);
    float lock = 1. - smoothstep(0., uPx * .9, abs(r - .415));     // 跑出区的锁定槽
    spec += lock * amp * pow(s2, 600.) * .8;
    vec2 cell = floor(q * 70.), f = fract(q * 70.) - .5;
    float dust = step(.9965, h21(cell)) * (1. - smoothstep(.25, .5, length(f) / (uPx * 70. * 1.1)));
    float scr = 1. - smoothstep(0., uPx * .7, segD(q, vec2(.52, .22), vec2(.74, .4)));
    vec2 sd = normalize(vec2(.22, .18)), sdS = vec2(c * sd.x + s * sd.y, -s * sd.x + c * sd.y);
    float scrG = scr * pow(max(0., 1. - pow(dot(sdS, hn), 2.)), 18.) * amp;
    col = base * (.45 + .55 * max(L.z, 0.)) * Li + Lcol * Li * (spec * .95 + dust * .16 + scrG * .7);
    vec3 nr = normalize(vec3(p / r * .9, .45));                    // 外缘倒角：受光一侧一条细亮边
    col = mix(col, base * 3. + Lcol * Li * (pow(max(dot(nr, H), 0.), 30.) * .8 + .02), rimZ);
    float step0 = 1. - smoothstep(0., uPx * 1.2, abs(r - ${(R_LABEL + 0.014).toFixed(3)}));   // 贴纸边的压制台阶
    col += Lcol * Li * step0 * pow(s2, 40.) * amp * .35;
  }
  o = vec4(pow(col, vec3(1. / 2.2)) * cover, cover);
}`;

const loadImg = (src: string) => new Promise<HTMLImageElement | null>((res) => {
  const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src;
});

export const createVinylSurface = (host: HTMLElement, onShadow?: ShadowFn): VinylSurface | null => {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border-radius:9999px;display:block';
  const prog = createFullscreenProgram(canvas, FRAG);
  if (!prog) return null;
  host.prepend(canvas);
  const { gl, uniforms: u } = prog;

  const tex = (unit: number) => {
    const t = gl.createTexture()!; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const texBands = tex(0), texLabel = tex(1);
  gl.uniform1i(u.uBands, 0); gl.uniform1i(u.uLabel, 1);

  let album: VinylAlbum | null = null;
  let bands: { r0: number; r1: number; pk: number[] | undefined }[] = [];
  let angle = 0, dead = false, raf = 0;
  let night = document.documentElement.classList.contains('dark') ? 1 : 0, nightT = night;
  const candle = { x: -1.5, y: 1.25 }, candleT = { x: -1.5, y: 1.25 };
  let fiber: HTMLImageElement | null = null;

  /* ── 声槽带 ── */
  const loudAt = (pk: number[] | undefined, x: number) => {
    if (!pk) return 0.55;
    const f = x * (pk.length - 1), i = Math.floor(f), k = f - i;
    const v = (j: number) => pk[Math.max(0, Math.min(pk.length - 1, j))];
    return (v(i - 1) + v(i) * 2 + v(i + 1)) / 4 * (1 - k) + (v(i) + v(i + 1) * 2 + v(i + 2)) / 4 * k;
  };
  const buildBands = () => {
    const tracks = album?.tracks ?? [];
    const durs = tracks.map((t) => durationOf(t.id) ?? 270);
    const total = durs.reduce((a, b) => a + b, 0) || 1;
    const avail = (R_OUT - R_IN) - GAP * Math.max(0, tracks.length - 1);
    let r = R_OUT;
    bands = tracks.map((t, i) => { const w = avail * durs[i] / total, b = { r0: r, r1: r - w, pk: peaksOf(t.id) }; r -= w + GAP; return b; });
    const data = new Uint8Array(BANDS * 4);
    for (let i = 0; i < BANDS; i++) {
      const rr = 0.4 + 0.6 * i / (BANDS - 1);
      let loud = 0.5, gap = 0;
      if (rr <= R_OUT && rr >= R_IN && bands.length) {
        const b = bands.find((x) => rr <= x.r0 && rr >= x.r1);
        if (b) loud = Math.pow(loudAt(b.pk, (b.r0 - rr) / (b.r0 - b.r1)), 1.3); else gap = 1;
      }
      data[i * 4] = Math.round(loud * 255); data[i * 4 + 1] = Math.round(gap * 255); data[i * 4 + 3] = 255;
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texBands);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, BANDS, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  };

  /* ── 贴纸：染色的纸 + 压进去的字（字放在 alpha 里，着色器拿来做压痕） ── */
  const buildLabel = () => {
    if (!album) return;
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.fillStyle = album.color; x.fillRect(0, 0, S, S);
    if (fiber) { x.globalCompositeOperation = 'multiply'; x.globalAlpha = 0.55; x.fillStyle = x.createPattern(fiber, 'repeat')!; x.fillRect(0, 0, S, S); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; }
    const vg = x.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.5);
    vg.addColorStop(0, 'rgba(255,255,255,0)'); vg.addColorStop(1, 'rgba(20,20,60,.18)');
    x.fillStyle = vg; x.fillRect(0, 0, S, S);
    const ink = document.createElement('canvas'); ink.width = ink.height = S;
    const y = ink.getContext('2d', { willReadFrequently: true })!;
    y.fillStyle = '#fff'; y.textAlign = 'center'; y.textBaseline = 'middle';
    // 艺术家沿上缘排成一弧（EB Garamond 大写、字距拉开），专辑名居中（Klee One，随音乐页 chunk 到）
    y.font = '500 24px "EB Garamond", Georgia, serif';
    const word = album.artist.toUpperCase().split('').join(' '), R = S * 0.38, span = Math.min(1.5, 0.08 * word.length);
    [...word].forEach((ch, i, arr) => {
      const a = -Math.PI / 2 - span / 2 + span * i / Math.max(1, arr.length - 1);
      y.save(); y.translate(S / 2 + Math.cos(a) * R, S / 2 + Math.sin(a) * R); y.rotate(a + Math.PI / 2); y.fillText(ch, 0, 0); y.restore();
    });
    let size = 52; y.font = `400 ${size}px "Klee One", "EB Garamond", serif`;
    while (y.measureText(album.title).width > S * 0.62 && size > 22) { size -= 2; y.font = `400 ${size}px "Klee One", "EB Garamond", serif`; }
    y.fillText(album.title, S / 2, S * 0.33);
    y.font = '400 16px "EB Garamond", Georgia, serif';
    y.fillText('SIDE A  ·  33⅓ R.P.M.', S / 2, S * 0.66);
    if (album.year) y.fillText(album.year, S / 2, S * 0.73);
    y.fillRect(S * 0.34, S * 0.6, S * 0.32, 1.2);
    x.globalAlpha = 0.86; x.drawImage(ink, 0, 0); x.globalAlpha = 1;
    const img = x.getImageData(0, 0, S, S), m = y.getImageData(0, 0, S, S);
    for (let i = 0; i < img.data.length; i += 4) img.data[i + 3] = m.data[i + 3];
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texLabel);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(img.data.buffer));
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  };

  /* ── 画：有变化才排一帧；烛与昼夜在收敛前接着排 ── */
  const draw = () => {
    raf = 0;
    if (dead) return;
    night += (nightT - night) * 0.18; if (Math.abs(nightT - night) < 0.003) night = nightT;
    candle.x += (candleT.x - candle.x) * 0.2; candle.y += (candleT.y - candle.y) * 0.2;
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform1f(u.uRot, angle * Math.PI / 180);
    gl.uniform1f(u.uNight, night); gl.uniform1f(u.uPx, 2 / Math.max(1, canvas.width)); gl.uniform1f(u.uWarp, 0.045);
    gl.uniform3f(u.uSun, ...SUN); gl.uniform3f(u.uCandle, candle.x, candle.y, 1.15);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texBands);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texLabel);
    prog.draw();
    if (onShadow) {
      if (night > 0.5) { const n = Math.hypot(candle.x, candle.y) || 1; onShadow(-candle.x / n, candle.y / n); }
      else onShadow(0.52, 0.6);
    }
    if (night !== nightT || Math.abs(candleT.x - candle.x) + Math.abs(candleT.y - candle.y) > 0.004) invalidate();
  };
  const invalidate = () => { if (!raf && !dead) raf = requestAnimationFrame(draw); };

  const resize = () => {
    // 按布局尺寸量（不含 transform）；歌词近景时盘放大 1.4 倍，多给一点分辨率免得发软
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.min(2048, Math.round(canvas.offsetWidth * dpr * 1.25)));
    if (canvas.width !== w) { canvas.width = canvas.height = w; invalidate(); }
  };
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
  const mo = new MutationObserver(() => { nightT = document.documentElement.classList.contains('dark') ? 1 : 0; invalidate(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  // 夜里烛跟指针（坐标换成盘半径）；指针离开就回到左上
  const onMove = (e: PointerEvent) => {
    if (nightT < 0.5) return;
    const r = canvas.getBoundingClientRect();
    candleT.x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    candleT.y = -(e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    invalidate();
  };
  const onLeave = () => { candleT.x = -1.5; candleT.y = 1.25; invalidate(); };
  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);

  void loadImg('/textures/xuan-fiber.webp').then((im) => { fiber = im; buildLabel(); invalidate(); });
  void loadTrackPeaks();
  const unready = onTrackPeaksReady(() => { buildBands(); invalidate(); });
  void document.fonts?.ready.then(() => { buildLabel(); invalidate(); });
  buildBands();

  return {
    setAlbum(next) {
      const same = album && album.key === next.key && album.color === next.color && album.title === next.title;
      album = next;
      if (same) return;
      buildBands(); buildLabel(); invalidate();
    },
    setAngle(deg) { if (deg !== angle) { angle = deg; invalidate(); } },
    needleRadius(index, progress) {
      const b = bands[index];
      if (!b) return R_OUT - (R_OUT - R_IN) * progress;
      return b.r0 - (b.r0 - b.r1) * Math.min(1, Math.max(0, progress));
    },
    destroy() {
      dead = true; cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); unready();
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      prog.dispose();
      canvas.remove();
    },
  };
};
