// 标本 · 共鸣的唱片。
//   现网：OasisResonance.tsx 的 CSS 盘原样（声槽 5px 径向渐变、两层反光弧与贴纸都在会转的那层里）。
//   提案：盘面一块片元着色器（现网 lib/gl.ts，与涟漪内页、水琴窟同一套封装）——
//         高光按声槽切线算，钉在光源那边；七首歌按真实时长排成七条带，带里的粗糙度取自 trackPeaks；
//         贴纸是染色的宣纸；针落在当前曲目那条带里；影子随光。
import { createFullscreenProgram } from '/src/lib/gl.ts';

const ALBUM = {
  artist: 'Atarayo', title: '夜明け前', year: 2021, color: '#818CF8',
  // id、曲名，时长取自 trackFeatures.generated.json 的段落终点（毫秒）
  tracks: [['a_01', '10月無口な君を忘れる', 332000], ['a_02', '夏霞', 229000], ['a_03', '晴るる', 290000], ['a_04', '祥月', 257000],
    ['a_05', '8.8', 354000], ['a_06', 'ピアス', 274000], ['a_07', '嘘つき', 297000]],
};
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';
const decode = (s) => Array.from(s, (c) => Math.max(0, ALPHABET.indexOf(c)) / 63);
// 现网 OasisResonance.tsx:124–128
const ARM_REST = -14, ARM_START = 16, ARM_SWEEP = 13, ARM_K = 45 / 1.2, ARM_D = 13 / 1.2;
const R_LABEL = 0.38, R_IN = 0.5, R_OUT = 0.955, GAP = 0.0075;
const fmt = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform float uRot, uNight, uPx, uWarp, uDev;
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
  vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);       // 盘自己的坐标（顺时针转，与现网同向）

  // 光：昼＝窗（平行光），夜＝烛（点光，随指针）
  vec3 P = vec3(p, 0.);
  vec3 Lc = uCandle - P; float dc = length(Lc); Lc /= dc;
  vec3 L = normalize(mix(normalize(uSun), Lc, uNight));
  float Li = mix(1.0, 2.2 / (1. + dc * dc * .55), uNight);
  vec3 Lcol = mix(vec3(1., .975, .94), vec3(1., .72, .45), uNight);
  vec3 H = normalize(L + vec3(0., 0., 1.));
  vec2 hxy = H.xy + uWarp * vec2(cos(uRot * 1.0), sin(uRot * 1.0)) * r;     // 翘曲：每圈晃一下
  float hl = length(hxy); vec2 hn = hxy / max(hl, 1e-4);
  float a = dot(T, hn), s2 = max(0., 1. - a * a);
  float amp = smoothstep(.02, .4, hl);

  vec3 col;
  if (r < R_LABEL) {
    if (r < .022) {                                            // 中轴
      vec3 n = normalize(vec3(p / .022 * .8, 1.));
      col = vec3(.62, .63, .66) * (.35 + .65 * max(dot(n, L), 0.)) * Li * Lcol + Lcol * Li * pow(max(dot(n, H), 0.), 60.) * .9;
    } else {
      vec2 luv = q / R_LABEL * .5 + .5; luv.y = 1. - luv.y;
      vec4 lab = texture(uLabel, luv);
      vec3 alb = pow(lab.rgb, vec3(2.2));
      float ink = lab.a;                                       // 字＝压进纸里的一层，背光一侧略暗
      vec2 e = vec2(1.5 / 512., 0.);
      float dx = texture(uLabel, luv + e.xy).a - texture(uLabel, luv - e.xy).a;
      float dy = texture(uLabel, luv - e.yx).a - texture(uLabel, luv + e.yx).a;
      vec2 gq = vec2(dx, dy); vec2 gs = vec2(c * gq.x + s * gq.y, -s * gq.x + c * gq.y);
      vec3 n = normalize(vec3(gs * 1.6, 1.));                 // 字是压进纸里的（凹）
      float rim = smoothstep(R_LABEL - .012, R_LABEL, r);
      col = alb * (.28 + .82 * max(dot(n, L), 0.)) * Li * Lcol * (1. - rim * .45)
          + Lcol * Li * pow(max(dot(n, H), 0.), 30.) * .05 * (1. - ink);
    }
  } else {
    float u = clamp((r - .4) / .6, 0., 1.);
    vec2 bt = texture(uBands, vec2(u, .5)).rg;
    float loud = bt.r, gap = bt.g;
    float leadIn = smoothstep(R_OUT, R_OUT + .004, r) * (1. - smoothstep(.984, .987, r));
    float runOut = 1. - smoothstep(R_IN - .004, R_IN, r);
    float rimZ = smoothstep(.985, .995, r);
    float gloss = clamp(max(gap, max(leadIn, runOut)), 0., 1.);
    float g1 = n1(r / uPx * .85), g2 = n1(r * 220.);
    float nexp = mix(mix(1100., 34., loud), 3200., gloss);
    float lobe = pow(s2, nexp), skirt = pow(s2, nexp * .06);
    float spec = amp * (lobe * mix(.7, 1.15, g1) + skirt * mix(.035, .2, loud) * (1. - gloss));
    vec3 base = vec3(.012, .012, .015) * (.8 + .4 * g2);
    // 锁定槽（跑出区里的一圈）、灰尘与一道发丝划痕：在盘自己的坐标里，跟着转
    float lock = 1. - smoothstep(0., uPx * .9, abs(r - .415));
    spec += lock * amp * pow(s2, 600.) * .8;
    vec2 cell = floor(q * 70.); vec2 f = fract(q * 70.) - .5;
    float dust = step(.9965, h21(cell)) * (1. - smoothstep(.25, .5, length(f) / (uPx * 70. * 1.1)));
    float scr = 1. - smoothstep(0., uPx * .7, segD(q, vec2(.52, .22), vec2(.74, .4)));
    vec2 sd = normalize(vec2(.22, .18)); vec2 sdS = vec2(c * sd.x + s * sd.y, -s * sd.x + c * sd.y);
    float scrG = scr * pow(max(0., 1. - pow(dot(sdS, hn), 2.)), 18.) * amp;
    col = base * (.45 + .55 * max(L.z, 0.)) * Li + Lcol * Li * (spec * .95 + dust * .16 + scrG * .7);
    // 外缘倒角：受光一侧一条细亮边
    vec3 nr = normalize(vec3(p / r * .9, .45));
    col = mix(col, base * 3. + Lcol * Li * (pow(max(dot(nr, H), 0.), 30.) * .8 + .02), rimZ);
    // 贴纸边缘的压制台阶
    float step0 = 1. - smoothstep(0., uPx * 1.2, abs(r - (R_LABEL + .014)));
    col += Lcol * Li * step0 * pow(s2, 40.) * amp * .35;
  }
  col = pow(col, vec3(1. / 2.2));
  o = vec4(col * cover, cover);
}`.replaceAll('R_LABEL', R_LABEL.toFixed(3)).replaceAll('R_IN', R_IN.toFixed(3)).replaceAll('R_OUT', R_OUT.toFixed(3));

export async function mount(host, ctx) {
  host.innerHTML = `
  <style>
    .vn { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; gap:34px; padding:40px 24px 92px; }
    .vn-plinth { position:relative; flex:none; border-radius:2.5rem; background:rgba(255,255,255,.45); border:1px solid rgba(255,255,255,.6); backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px); box-shadow:0 36px 90px rgba(0,0,0,.14); }
    body.night .vn-plinth { background:rgba(255,255,255,.04); border-color:rgba(255,255,255,.1); box-shadow:0 36px 90px rgba(0,0,0,.6); }
    .vn-plinth::before { content:""; position:absolute; inset:0; border-radius:inherit; background:linear-gradient(to bottom right, rgba(255,255,255,.35), transparent, rgba(255,255,255,.05)); pointer-events:none; }
    body.night .vn-plinth::before { background:linear-gradient(to bottom right, rgba(255,255,255,.07), transparent); }
    .vn-deck { position:absolute; left:6%; top:50%; width:71%; aspect-ratio:1; transform:translateY(-50%); cursor:pointer; }
    .vn-platter { position:absolute; inset:-4.5%; border-radius:50%; background:linear-gradient(to bottom right, rgba(226,232,240,.7), rgba(203,213,225,.45), rgba(148,163,184,.4)); box-shadow:inset 0 2px 10px rgba(0,0,0,.18); border:1px solid rgba(255,255,255,.5); }
    body.night .vn-platter { background:linear-gradient(to bottom right, rgba(255,255,255,.07), rgba(0,0,0,.3), rgba(0,0,0,.5)); border-color:rgba(255,255,255,.06); }
    .vn-shadow { position:absolute; inset:0; border-radius:50%; box-shadow:var(--dsx,0) var(--dsy,18px) 45px rgba(0,0,0,.25); }
    body.night .vn-shadow { box-shadow:var(--dsx,0) var(--dsy,18px) 45px rgba(0,0,0,.7); }
    .vn-live { position:absolute; inset:0; border-radius:50%; overflow:hidden; border:1px solid rgba(100,116,139,.2); will-change:transform; }
    body.night .vn-live { border-color:rgba(255,255,255,.1); }
    .vn-live i { position:absolute; inset:0; }
    .vn-live .gr { background:repeating-radial-gradient(circle at 50% 50%, #111 0px, #111 3px, #1b1b1f 4px, #111 5px); }
    .vn-live .s1 { background:linear-gradient(to top right, rgba(255,255,255,.1), transparent, transparent); mix-blend-mode:overlay; }
    .vn-live .s2 { background:linear-gradient(to bottom left, transparent, transparent, rgba(255,255,255,.05)); mix-blend-mode:overlay; }
    .vn-live .lb { inset:31%; border-radius:50%; display:grid; place-items:center; box-shadow:inset 0 2px 4px rgba(0,0,0,.05); overflow:hidden; }
    .vn-live .lb::after { content:""; position:absolute; inset:0; background:rgba(0,0,0,.1); mix-blend-mode:overlay; }
    .vn-live .lb span { font:7px/1.6 var(--mono); letter-spacing:.3em; text-transform:uppercase; color:rgba(255,255,255,.8); transform:rotate(-12deg); }
    .vn-live .hub { inset:auto; left:50%; top:50%; width:4.5%; height:4.5%; transform:translate(-50%,-50%); border-radius:50%; background:#FAF8F3; box-shadow:inset 0 2px 5px rgba(0,0,0,.5); }
    body.night .vn-live .hub { background:#0A0F1D; }
    .vn-gl { position:absolute; inset:0; width:100%; height:100%; border-radius:50%; }
    .vn-ring { position:absolute; inset:-.5%; border-radius:50%; border:1px solid rgba(255,255,255,.25); pointer-events:none; }
    .vn-arm { position:absolute; right:9%; top:13%; height:62%; z-index:3; pointer-events:none; }
    .vn-arm .base { position:absolute; top:-4px; left:50%; transform:translateX(-50%); width:15%; min-width:36px; aspect-ratio:1; border-radius:50%; background:linear-gradient(to bottom right, #F1F5F9, #CBD5E1); box-shadow:0 4px 12px rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.6); z-index:2; }
    body.night .vn-arm .base { background:linear-gradient(to bottom right, #475569, #1E293B); border-color:rgba(255,255,255,.1); }
    .vn-arm .rod { position:relative; height:100%; width:8px; transform-origin:top; will-change:transform; }
    .vn-arm .cw { position:absolute; top:-9%; left:50%; transform:translateX(-50%); width:16px; height:10%; border-radius:6px; background:linear-gradient(#CBD5E1, #94A3B8); box-shadow:0 4px 6px -1px rgba(0,0,0,.1); }
    .vn-arm .bar { position:absolute; top:0; left:50%; transform:translateX(-50%); width:4px; height:88%; border-radius:999px; background:linear-gradient(#CBD5E1, #E2E8F0, #CBD5E1); }
    body.night .vn-arm .bar { background:linear-gradient(#64748B, #94A3B8, #64748B); }
    body.night .vn-arm .cw { background:linear-gradient(#64748B, #334155); }
    .vn-arm .hs { position:absolute; bottom:2%; left:50%; display:flex; flex-direction:column; align-items:center; transform:translateX(-50%) rotate(14deg); }
    .vn-arm .hs b { width:12px; height:24px; border-radius:3px; background:linear-gradient(#94A3B8, #475569); }
    .vn-arm .hs i { width:3px; height:7px; margin-top:-1px; border-radius:0 0 999px 999px; background:var(--mood); }
    .vn[data-v="live"] .vn-arm .bar { box-shadow:1px 2px 4px rgba(0,0,0,.2); }
    .vn[data-v="live"] .vn-arm .hs b { box-shadow:0 4px 6px -1px rgba(0,0,0,.1); }
    .vn[data-v="next"] .vn-arm .rod { filter:drop-shadow(var(--asx,2px) var(--asy,3px) 2.5px rgba(15,23,42,.28)); }
    body.night .vn[data-v="next"] .vn-arm .rod { filter:drop-shadow(var(--asx,2px) var(--asy,3px) 3px rgba(0,0,0,.6)); }
    .vn-rpm { position:absolute; right:7%; bottom:7%; display:flex; align-items:center; gap:10px; font:8px/1 var(--mono); letter-spacing:.25em; color:#94A3B8; text-transform:uppercase; }
    .vn-rpm i { width:8px; height:8px; border-radius:50%; background:rgba(148,163,184,.4); transition:background-color .3s, box-shadow .3s; }
    .vn.playing .vn-rpm i { background:var(--mood); box-shadow:0 0 8px var(--mood); }
    .vn-cap { width:min(250px, 30vw); }
    .vn-cap .t { font:500 40px/1.15 "Klee One", var(--zh); letter-spacing:.02em; }
    .vn-cap .m { margin-top:14px; font:11px/1.6 var(--mono); letter-spacing:.22em; color:var(--ink3); text-transform:uppercase; }
    .vn-cap .m b { font-weight:400; color:var(--ink2); }
    .vn-read { margin-top:22px; font-size:12.5px; line-height:1.9; color:var(--ink2); border-left:2px solid color-mix(in srgb, var(--mood) 60%, transparent); padding-left:12px; min-height:7em; }
    .vn-read .k { font:10px/1 var(--mono); letter-spacing:.24em; color:var(--ink3); text-transform:uppercase; display:block; margin-bottom:6px; }
    .vn-strip { margin-top:10px; height:22px; position:relative; border-radius:4px; overflow:hidden; background:var(--sunk); }
    .vn-strip canvas { position:absolute; inset:0; width:100%; height:100%; }
    .vn-strip em { position:absolute; top:0; bottom:0; width:2px; background:var(--mood); }
    @media (max-width: 1100px) { .vn { flex-direction:column; justify-content:flex-start; gap:12px; padding:58px 12px 150px; } .vn-cap { width:min(420px, 92%); text-align:center; } .vn-cap .t { font-size:28px; } .vn-read { display:none; } }
  </style>
  <div class="vn" style="--mood:${ALBUM.color}">
    <div class="vn-plinth"><div class="vn-deck" role="button" aria-label="播放或暂停">
      <div class="vn-platter"></div><div class="vn-shadow"></div>
      <div class="vn-live"><i class="gr"></i><i class="s1"></i><i class="s2"></i><i class="lb" style="background:${ALBUM.color}"><span>${ALBUM.artist}</span></i><i class="hub"></i></div>
      <canvas class="vn-gl"></canvas><div class="vn-ring"></div>
    </div>
    <div class="vn-arm"><div class="base"></div><div class="rod"><div class="cw"></div><div class="bar"></div><div class="hs"><b></b><i></i></div></div></div>
    <div class="vn-rpm"><i></i><span>STANDBY</span></div></div>
    <div class="vn-cap"><div class="t"></div><div class="m"><b>${ALBUM.artist}</b> · ${ALBUM.title} · ${ALBUM.year}</div>
      <div class="vn-read"></div></div>
  </div>`;
  const root = host.querySelector('.vn'), plinth = root.querySelector('.vn-plinth'), deck = root.querySelector('.vn-deck');
  const liveDisc = root.querySelector('.vn-live'), canvas = root.querySelector('.vn-gl'), rod = root.querySelector('.rod');
  const shadow = root.querySelector('.vn-shadow'), rpm = root.querySelector('.vn-rpm span'), cap = root.querySelector('.vn-cap .t'), read = root.querySelector('.vn-read');

  /* ── 数据：七条带 ── */
  let peaks = {};
  try { peaks = (await (await fetch('/src/data/trackPeaks.generated.json')).json()).tracks ?? {}; } catch { /* 没有峰值就平的 */ }
  const total = ALBUM.tracks.reduce((a, t) => a + t[2], 0);
  const avail = (R_OUT - R_IN) - GAP * (ALBUM.tracks.length - 1);
  let rr = R_OUT;
  const bands = ALBUM.tracks.map(([id, title, dur]) => {
    const w = avail * dur / total, b = { id, title, dur, r0: rr, r1: rr - w, pk: peaks[id] ? decode(peaks[id]) : null };
    rr -= w + GAP; return b;
  });
  const loudAt = (b, x) => {                     // x：曲内进度 0..1
    if (!b.pk) return .55;
    const f = x * (b.pk.length - 1), i = Math.floor(f), k = f - i;
    const v = (j) => b.pk[Math.max(0, Math.min(b.pk.length - 1, j))];
    return (v(i - 1) + v(i) * 2 + v(i + 1)) / 4 * (1 - k) + (v(i) + v(i + 1) * 2 + v(i + 2)) / 4 * k;
  };
  const N = 1024;
  const bandTex = (reveal) => {
    const data = new Uint8Array(N * 4);
    for (let i = 0; i < N; i++) {
      const r = .4 + .6 * i / (N - 1);
      let loud = .5, gap = 0;
      if (r <= R_OUT && r >= R_IN) {
        if (!reveal) loud = .55;
        else {
          const b = bands.find((x) => r <= x.r0 && r >= x.r1);
          if (b) loud = Math.pow(loudAt(b, (b.r0 - r) / (b.r0 - b.r1)), 1.3); else gap = 1;
        }
      }
      data[i * 4] = Math.round(loud * 255); data[i * 4 + 1] = Math.round(gap * 255); data[i * 4 + 3] = 255;
    }
    return data;
  };

  /* ── 贴纸：染色的宣纸 + 印上去的字（字在 alpha 里，着色器拿来做压痕） ── */
  const fiber = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = '/textures/xuan-fiber.webp'; });
  await document.fonts.load('400 40px "Klee One"').catch(() => {});
  await document.fonts.load('400 20px "IM Fell English SC"').catch(() => {});
  const labelCanvas = (() => {
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');
    x.fillStyle = ALBUM.color; x.fillRect(0, 0, S, S);
    if (fiber) { x.globalCompositeOperation = 'multiply'; x.globalAlpha = .55; const pat = x.createPattern(fiber, 'repeat'); x.fillStyle = pat; x.fillRect(0, 0, S, S); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; }
    const vg = x.createRadialGradient(S / 2, S / 2, S * .3, S / 2, S / 2, S * .5); vg.addColorStop(0, 'rgba(255,255,255,0)'); vg.addColorStop(1, 'rgba(20,20,60,.18)');
    x.fillStyle = vg; x.fillRect(0, 0, S, S);
    // 字：先在单独一层画白字，拿它做 alpha（压痕），再叠到纸上
    const ink = document.createElement('canvas'); ink.width = ink.height = S; const y = ink.getContext('2d');
    y.fillStyle = '#fff'; y.textAlign = 'center'; y.textBaseline = 'middle';
    y.font = '400 22px "IM Fell English SC", Georgia, serif';
    const word = ALBUM.artist.toUpperCase().split('').join(' '), R = S * .38, span = .95;
    [...word].forEach((ch, i, arr) => { const a = -Math.PI / 2 - span / 2 + span * i / (arr.length - 1); y.save(); y.translate(S / 2 + Math.cos(a) * R, S / 2 + Math.sin(a) * R); y.rotate(a + Math.PI / 2); y.fillText(ch, 0, 0); y.restore(); });
    y.font = '400 50px "Klee One", serif'; y.fillText(ALBUM.title, S / 2, S * .33);
    y.font = '400 15px "IM Fell English SC", Georgia, serif'; y.fillText('SIDE A  ·  33⅓ R.P.M.', S / 2, S * .66);
    y.fillText(String(ALBUM.year), S / 2, S * .73);
    y.fillRect(S * .34, S * .6, S * .32, 1.2);
    x.globalAlpha = .86; x.drawImage(ink, 0, 0); x.globalAlpha = 1;
    // alpha 通道 = 字（1 − 字）留给着色器；画布本身不透明
    const img = x.getImageData(0, 0, S, S), m = y.getImageData(0, 0, S, S);
    for (let i = 0; i < img.data.length; i += 4) img.data[i + 3] = m.data[i + 3];
    return img;
  })();

  /* ── GL ── */
  const prog = createFullscreenProgram(canvas, FRAG);
  let texBands = null, texLabel = null;
  if (prog) {
    const { gl } = prog;
    texBands = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texBands);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    texLabel = gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texLabel);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 512, 512, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(labelCanvas.data.buffer));
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(prog.uniforms.uBands, 0); gl.uniform1i(prog.uniforms.uLabel, 1);
  }
  let reveal = true;
  const uploadBands = () => {
    if (!prog) return; const { gl } = prog;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texBands);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, bandTex(reveal));
  };
  uploadBands();

  /* ── 状态 ── */
  let mode = ctx.v, nightT = ctx.night ? 1 : 0, night = nightT;
  let playing = false, track = 2, pos = 0;          // 默认第三首「晴るる」，与现网截图同一首
  const spin = { angle: 0, vel: 0 }, arm = { angle: ARM_REST, vel: 0 };
  let raf = 0, dead = false, last = performance.now(), frames = 0, fpsT = last, fps = 0, dirty = true;
  const geo = { size: 0, plW: 0, plH: 0 };

  /* ── 控件 ── */
  ctx.bar.innerHTML = `<button class="b" data-play>▶ 播放</button><span class="sep"></span>${ALBUM.tracks.map((t, i) => `<button class="b" data-t="${i}" title="${t[1]}">${i + 1}</button>`).join('')}
    <span class="sep"></span><label>进度 <input type="range" min="0" max="1000" value="0" data-pos><span class="num" data-time></span></label>
    <button class="b" data-reveal aria-pressed="true">声槽显影</button>`;
  const bPlay = ctx.bar.querySelector('[data-play]'), inPos = ctx.bar.querySelector('[data-pos]'), tTime = ctx.bar.querySelector('[data-time]'), bReveal = ctx.bar.querySelector('[data-reveal]');
  const syncBar = () => {
    bPlay.textContent = playing ? '❚❚ 暂停' : '▶ 播放';
    ctx.bar.querySelectorAll('[data-t]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.t === track)));
    inPos.value = String(Math.round(pos / bands[track].dur * 1000));
    tTime.textContent = `${fmt(pos)} / ${fmt(bands[track].dur)}`;
    bReveal.style.display = mode === 'next' ? '' : 'none';
    root.classList.toggle('playing', playing); rpm.textContent = playing ? '33⅓ RPM' : 'STANDBY';
    cap.textContent = bands[track].title;
  };
  ctx.bar.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if ('play' in b.dataset) playing = !playing;
    if (b.dataset.t) { track = +b.dataset.t; pos = 0; }
    if ('reveal' in b.dataset) { reveal = !reveal; b.setAttribute('aria-pressed', String(reveal)); uploadBands(); }
    dirty = true; syncBar(); kick();
  });
  inPos.addEventListener('input', () => { pos = +inPos.value / 1000 * bands[track].dur; dirty = true; syncBar(); kick(); });
  deck.addEventListener('click', () => { playing = !playing; syncBar(); kick(); });

  /* ── 版面 ── */
  const layout = () => {
    const r = host.getBoundingClientRect();
    const narrow = r.width < 760;
    const W = Math.max(260, Math.min(580, narrow ? r.width - 40 : r.width - 330, (r.height - 150) / .879));
    plinth.style.width = `${W}px`; plinth.style.height = `${W * .879}px`;
    geo.plW = W; geo.plH = W * .879; geo.size = W * .71;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = canvas.height = Math.round(geo.size * dpr);
    dirty = true;
  };
  // 唱针：给定半径（盘半径的倍数）求唱臂角度。几何与现网同：轴在 right 9% / top 13%，臂长 62% 台高
  const armFor = (rTarget) => {
    const px = geo.plW * .91 - 4, py = geo.plH * .13, Lr = geo.plH * .62 * .97;
    const cx = geo.plW * .06 + geo.size / 2, cy = geo.plH / 2, R = geo.size / 2;
    const dist = (deg) => { const a = deg * Math.PI / 180; return Math.hypot(px - Lr * Math.sin(a) - cx, py + Lr * Math.cos(a) - cy) / R; };
    let lo = 0, hi = 60;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (dist(m) > rTarget) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };

  /* ── 光 ── */
  const lightVec = () => {
    const sun = [-.52, .6, .61];
    const r = deck.getBoundingClientRect(), s = ctx.stage.getBoundingClientRect();
    let cx = -1.5, cy = 1.25;
    if (ctx.pointer.inside) { cx = (ctx.pointer.x + s.left - (r.left + r.width / 2)) / (r.width / 2); cy = -(ctx.pointer.y + s.top - (r.top + r.height / 2)) / (r.height / 2); }
    return { sun, candle: [cx, cy, 1.15] };
  };
  const shadows = (Lv) => {
    // 影子方向：昼＝窗的反方向；夜＝离烛而去
    let dx, dy;
    if (night > .5) { const n = Math.hypot(Lv.candle[0], Lv.candle[1]) || 1; dx = -Lv.candle[0] / n; dy = Lv.candle[1] / n; }
    else { dx = .52; dy = .6; }
    const k = mode === 'next' ? 1 : 0;
    shadow.style.setProperty('--dsx', `${(dx * 16 * k).toFixed(1)}px`); shadow.style.setProperty('--dsy', `${(k ? dy * 16 : 18).toFixed(1)}px`);
    root.style.setProperty('--asx', `${(dx * 5).toFixed(1)}px`); root.style.setProperty('--asy', `${(dy * 5).toFixed(1)}px`);
  };

  const draw = () => {
    if (!prog || mode !== 'next') return;
    const { gl, uniforms: u } = prog, Lv = lightVec();
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform1f(u.uRot, spin.angle * Math.PI / 180);
    gl.uniform1f(u.uNight, night); gl.uniform1f(u.uPx, 2 / canvas.width);
    gl.uniform1f(u.uWarp, .045);
    gl.uniform3f(u.uSun, ...Lv.sun); gl.uniform3f(u.uCandle, ...Lv.candle);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texBands);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texLabel);
    prog.draw(); frames++;
  };
  const readout = () => {
    const b = bands[track], x = pos / b.dur;
    if (mode === 'live') {
      read.innerHTML = `<span class="k">现网</span>反光弧在会转的那层里，跟着盘转（盯着左上那一抹）。唱针随一首歌的进度扫过半张盘：第 ${track + 1} 首也从最外圈起。`;
      return;
    }
    const lv = reveal ? loudAt(b, x) : null;
    read.innerHTML = `<span class="k">提案 · 声槽读数</span>唱针在第 <b>${track + 1}</b> 条带（共 7 条、6 道空槽），${fmt(pos)} / ${fmt(b.dur)}${lv == null ? '' : `，此处响度 <b>${lv.toFixed(2)}</b>`}。<br>盘在转，那道高光不动；${night > .5 ? '移动指针，高光转过去对着烛。' : '转动看贴纸的字、灰尘与一道划痕。'}
      <div class="vn-strip"><canvas width="600" height="44"></canvas><em style="left:${(x * 100).toFixed(1)}%"></em></div>`;
    const cv = read.querySelector('canvas'), g = cv.getContext('2d');
    g.fillStyle = ALBUM.color; g.globalAlpha = .55;
    for (let i = 0; i < 120; i++) { const v = loudAt(b, i / 119); const h = Math.max(2, v * 40); g.fillRect(i * 5, 22 - h / 2, 3, h); }
  };

  let readT = 0;
  const tick = () => {
    if (dead) return;
    const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now;
    night += (nightT - night) * (1 - Math.exp(-dt / .35)); if (Math.abs(nightT - night) < .002) night = nightT;
    const target = playing && !ctx.reduce ? 20 : 0;
    spin.vel += (target - spin.vel) * (1 - Math.exp(-dt / 1.4)); if (!playing && spin.vel < .02) spin.vel = 0;
    spin.angle = (spin.angle + spin.vel * dt) % 360;
    if (playing) { pos += dt * 1000; if (pos >= bands[track].dur) { pos = 0; track = (track + 1) % bands.length; } }
    const b = bands[track], x = pos / b.dur;
    const armT = !playing ? ARM_REST : mode === 'next' ? armFor(b.r0 - (b.r0 - b.r1) * x) : ARM_START + x * ARM_SWEEP;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / steps;
    for (let i = 0; i < steps; i++) { arm.vel += (ARM_K * (armT - arm.angle) - ARM_D * arm.vel) * h; arm.angle += arm.vel * h; }
    rod.style.transform = `rotate(${arm.angle.toFixed(3)}deg)`;
    liveDisc.style.transform = `rotate(${spin.angle}deg)`;
    const Lv = lightVec(); shadows(Lv);
    const moving = spin.vel > 0 || Math.abs(arm.vel) > .01 || Math.abs(nightT - night) > 0 || night > .5 && ctx.pointer.inside;
    if (moving || dirty) { draw(); dirty = false; }
    if (now - readT > 250) { readT = now; if (playing) syncBar(); readout(); }
    if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now;
      ctx.perf(mode === 'next' ? (prog ? `盘面画布 ${canvas.width}×${canvas.height}\n${fps} 帧/秒${fps === 0 ? '（停着就不画）' : ''}` : 'WebGL2 不可用：退回 CSS 盘') : 'CSS 盘：每帧写一次 rotate'); }
    raf = requestAnimationFrame(tick);
  };
  const kick = () => { dirty = true; };
  const setMode = (v) => {
    mode = v; root.dataset.v = v;
    canvas.style.display = v === 'next' && prog ? '' : 'none';
    liveDisc.style.display = v === 'next' && prog ? 'none' : '';
    dirty = true; syncBar(); readout();
  };
  layout(); setMode(mode); syncBar();
  const ro = new ResizeObserver(layout); ro.observe(host);
  raf = requestAnimationFrame(tick);
  return {
    setMode,
    setNight(n) { nightT = n ? 1 : 0; dirty = true; },
    destroy() { dead = true; cancelAnimationFrame(raf); ro.disconnect(); prog?.dispose(); },
  };
}
