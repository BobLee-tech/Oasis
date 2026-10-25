// 标本 · 星图的砂。
//   数据与几何全是现网的：Supabase 真文章 → toSandPosts → layoutGarden → sandField / iso / smooth / stonePath。
//   现网：SVG 描线（三圈等值线 + 7px 直纹）、平的砂面、固定偏移的石影（sandScene.ts:85）。
//   提案：同一张距离场上传成贴图，着色器把等值线耙成沟；光从悉尼的太阳来（按日期与时刻），夜里换成右上的月；
//         石影长短按 RH（文章越长越高）与太阳高度；只在光变时画一帧。
import { toSandPosts, layoutGarden, sandField, iso, smooth, stonePath, mossPath, LV, RS, RH, RC, ARCH } from '/src/lib/sandGarden.ts';
import { supabase } from '/src/lib/supabase.ts';

const CAT = { thought: ['随笔', '#39C5BB', 'THOUGHTS'], note: ['学习笔记', '#60A5FA', 'NOTES'], project: ['项目复盘', '#A78BFA', 'PROJECTS'], weekly: ['周报', '#FFB7C5', 'WEEKLY'], growth: ['成长', '#A7F3D0', 'GROWTH'] };
const GS = 1.4;                       // 现网 glyphScale：16 块石以内取 1.4
const HMAX = 18;                      // 石高贴图的满量程（px）
const NS = 'http://www.w3.org/2000/svg';
const esc = (t) => String(t ?? '').replace(/[<>&"]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[m]));

/* ── 悉尼的太阳（NOAA 近似式）：返回方位（自北顺时针）与高度，度 ── */
const sydneySun = (date, hour) => {
  const lat = -33.87 * Math.PI / 180, lon = 151.21, tz = 11;              // 10 月下旬是夏令时 AEDT
  const start = new Date(date.getFullYear(), 0, 0), N = Math.floor((date - start) / 864e5);
  const gm = 2 * Math.PI / 365 * (N - 1 + (hour - 12) / 24);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(gm) - 0.032077 * Math.sin(gm) - 0.014615 * Math.cos(2 * gm) - 0.040849 * Math.sin(2 * gm));
  const dec = 0.006918 - 0.399912 * Math.cos(gm) + 0.070257 * Math.sin(gm) - 0.006758 * Math.cos(2 * gm) + 0.000907 * Math.sin(2 * gm) - 0.002697 * Math.cos(3 * gm) + 0.00148 * Math.sin(3 * gm);
  const tst = hour * 60 + eq + 4 * lon - 60 * tz, ha = (tst / 4 - 180) * Math.PI / 180;
  const cz = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha);
  const el = 90 - Math.acos(Math.max(-1, Math.min(1, cz))) * 180 / Math.PI;
  const az = (Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) * 180 / Math.PI + 180 + 360) % 360;
  return { az, el };
};

async function loadPosts() {
  try {
    const { data, error } = await supabase.from('garden_posts').select('*');
    if (error || !data?.length) throw error;
    return data.filter((r) => r.status !== 'draft').map((r) => {
      const createdAt = Number(r.created_at);
      return { id: r.id, title: r.title, excerpt: r.excerpt, date: r.date, createdAt, updatedAt: Number(r.updated_at) || createdAt,
        growth: r.growth || 'seedling', status: r.status || 'published', type: r.type, tags: Array.isArray(r.tags) ? r.tags : [], color: r.color, content: r.content || '', series: r.series || undefined };
    });
  } catch {
    const t0 = Date.UTC(2026, 6, 18);
    const mk = (i, title, type, mins, series, growth = 'budding') => ({ id: 'demo' + i, title, excerpt: '', date: '', createdAt: t0 + i * 6 * 864e5, updatedAt: t0 + i * 6 * 864e5, growth, status: 'published', type, tags: [], color: '#39C5BB', content: '字'.repeat(mins * 400), series });
    return [mk(0, '天行健，君子以自强不息', 'thought', 6), mk(1, '给我一颗可以反悔的心', 'note', 13, 'COMP3121'), mk(2, '貌虽不一，却有她三分骨气', 'note', 23, 'COMP3121'),
      mk(3, '来日方长', 'project', 9), mk(4, '以史为鉴，不泥于史', 'note', 25, 'COMP3121'), mk(5, '树下的分开又重逢', 'note', 18, 'COMP3121'), mk(6, '下雨了，去我家吧', 'thought', 5, null, 'seedling'),
      mk(7, '见招拆招，逢水架桥', 'note', 25, 'COMP3121'), mk(8, '贪恋有你的未来', 'thought', 21, 'COMP3121'), mk(9, '建筑杂谈', 'thought', 2, null, 'seedling')];
  }
}

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes, uOff, uF0, uFn;
uniform float uK, uFg, uDpr, uNight, uGrain, uRake;
uniform vec3 uL;           // 指向光源，屏幕坐标（x 右、y 下、z 朝外）
uniform vec3 uLcol, uAmb;
uniform sampler2D uField, uHM, uAlb, uPaper;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fieldPx(vec2 sp){
  vec2 w = (sp - uOff) / uK;
  vec2 uv = ((w - uF0) / uFg + .5) / uFn;
  if (any(lessThan(uv, vec2(0))) || any(greaterThan(uv, vec2(1)))) return 1e3;
  return texture(uField, uv).r * uK;
}
vec2 toUV(vec2 sp){ return vec2(sp.x * uDpr, uRes.y - sp.y * uDpr) / uRes; }
float stoneH(vec2 sp){ vec4 t = texture(uHM, toUV(sp)); return t.r * ${HMAX.toFixed(1)} * t.g; }
float sandH(vec2 sp){
  float d = fieldPx(sp);
  float rings = -cos(6.2831853 * (d - 9.) / 8.);                 // 9 / 17 / 25 px 是沟，13 / 21 是垄（现网 LV）
  float wr = smoothstep(3.5, 6.5, d) * (1. - smoothstep(27., 31., d));
  float rake = -cos(6.2831853 * sp.y / 7.);                       // 远处 7px 一道直沟（现网 gap = 7）
  float wk = smoothstep(29., 35., d) * mix(1., 1. - smoothstep(60., 220., d), uNight);   // 夜里远处的直纹隐去，像池面
  float g = (vn(sp * .85) - .5) * .32 + (vn(sp * 2.7) - .5) * .12;
  return .62 * rings * wr + uRake * rake * wk + g * uGrain;
}
void main(){
  vec2 sp = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec4 hm = texture(uHM, gl_FragCoord.xy / uRes);
  float m = hm.g;
  // 法线：砂用解析高度场，石用石高贴图；都按 1 px 差分
  float e = 1.;
  float hx = sandH(sp + vec2(e, 0)) - sandH(sp - vec2(e, 0));
  float hy = sandH(sp + vec2(0, e)) - sandH(sp - vec2(0, e));
  vec3 nS = normalize(vec3(-hx * .5, -hy * .5, 1.));
  float sx = stoneH(sp + vec2(e, 0)) - stoneH(sp - vec2(e, 0));
  float sy = stoneH(sp + vec2(0, e)) - stoneH(sp - vec2(0, e));
  vec3 nT = normalize(vec3(-sx * .5, -sy * .5, 1.));
  vec3 n = normalize(mix(nS, nT, m));
  // 影：向光源方向走，看路上的石是否高过这条光线
  vec3 L = normalize(uL);
  float tanE = L.z / max(length(L.xy), 1e-3);
  vec2 dir = normalize(L.xy + 1e-6);
  float h0 = mix(0., stoneH(sp), m) + .3;
  float sh = 0.;
  float maxT = min(90., ${HMAX.toFixed(1)} / max(tanE, .05));
  for (int i = 1; i <= 26; i++) {
    float t = maxT * float(i) / 26.;
    float hq = stoneH(sp + dir * t);
    sh = max(sh, smoothstep(-.6, 1.4, hq - (h0 + t * tanE)) * (1. - .45 * float(i) / 26.));
  }
  // 砂沟的自影：斜阳时背光一侧更深
  float diff = max(dot(n, L), 0.);
  float rim = pow(max(dot(n, normalize(L + vec3(0, 0, 1))), 0.), 24.);
  vec3 paper = texture(uPaper, sp / 640.).rgb;
  vec3 sandA = pow(mix(vec3(.955, .94, .905) * mix(vec3(1.), paper * 1.04, .45), vec3(.2, .25, .36), uNight), vec3(2.2));
  vec3 alb = mix(sandA, pow(texture(uAlb, gl_FragCoord.xy / uRes).rgb, vec3(2.2)) * mix(1., .55, uNight), m);
  float grainSpark = step(.985, h21(floor(sp * uDpr))) * .5 * (1. - m);
  vec3 col = alb * (uAmb + uLcol * diff * (1. - sh * .82)) + uLcol * (rim * mix(.05, .22, uNight) * (1. - m * .5) + grainSpark * diff * mix(.08, .12, uNight)) * (1. - sh);
  o = vec4(pow(col, vec3(1. / 2.2)), 1.);
}`;

export async function mount(host, ctx) {
  host.innerHTML = `
  <style>
    .sd { position:absolute; inset:0; background:#FAF8F3; overflow:hidden; --ink:#34463F; }
    body.night .sd { background:#0A0F1D; --ink:#E5ECE8; }
    .sd-paper { position:absolute; inset:0; background:url(/textures/paper-cotton.webp) repeat; background-size:640px; opacity:.32; pointer-events:none; }
    body.night .sd-paper { opacity:0; }
    .sd canvas, .sd svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
    .sd-lab { position:absolute; inset:0; pointer-events:none; }
    .sd-lab span { position:absolute; white-space:nowrap; font:13px/1 var(--zh); letter-spacing:.06em; color:var(--ink); text-shadow:0 0 3px #FAF8F3, 0 0 6px #FAF8F3; }
    body.night .sd-lab span { text-shadow:0 0 3px #0A0F1D, 0 0 6px #0A0F1D; }
    .sd-lab .isl { transform:translateX(-50%); display:flex; align-items:center; gap:8px; font-size:15px; letter-spacing:.3em; }
    .sd-lab .isl small { font:9px/1 var(--mono); letter-spacing:.28em; opacity:.6; }
    .sd-lab .isl i { width:7px; height:7px; border-radius:2px; }
    .sd-head { position:absolute; left:0; right:0; top:40px; text-align:center; pointer-events:none; }
    .sd-head .k { font:10px/1 var(--mono); letter-spacing:.35em; color:#19736C; }
    body.night .sd-head .k { color:#66DED5; }
    .sd-head h3 { margin:12px 0 6px; font:500 26px/1.2 var(--zh); letter-spacing:.3em; color:var(--ink); }
    .sd-head p { margin:0; font-size:12.5px; color:#64756D; letter-spacing:.08em; }
  </style>
  <div class="sd"><div class="sd-paper"></div><canvas></canvas><svg></svg><div class="sd-lab"></div>
    <div class="sd-head"><span class="k">CONSTELLATION · 星图</span><h3>砂与星</h3><p>白砂上的每一块石，都是写下的字。</p></div></div>`;
  const root = host.querySelector('.sd'), canvas = root.querySelector('canvas'), svg = root.querySelector('svg'), lab = root.querySelector('.sd-lab'), paperDiv = root.querySelector('.sd-paper');
  const posts = await loadPosts();
  const real = !String(posts[0]?.id).startsWith('demo');
  const g = layoutGarden(toSandPosts(posts));
  let mode = ctx.v, night = ctx.night, W = 0, H = 0, dpr = 1, k = 1, ox = 0, oy = 0, F = null, frames = 0, lastDraw = 0;
  const now = new Date();
  // 默认时刻：此刻悉尼在白天就用此刻，否则 16:30（斜阳最好看）
  const sydH = (() => { const f = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now); const h = +f.find((p) => p.type === 'hour').value, mi = +f.find((p) => p.type === 'minute').value; return h + mi / 60; })();
  let hour = 17.3;                       // 默认斜阳（影子最长、沟最深）；「此刻」按悉尼真实时刻

  /* ── GL ── */
  const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: true });
  let prog = null, tex = {};
  if (gl) {
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(x)); return x; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); prog = null; }
    else {
      gl.useProgram(prog);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      for (const [name, unit] of [['uField', 0], ['uHM', 1], ['uAlb', 2], ['uPaper', 3]]) {
        const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        const wrap = name === 'uPaper' ? gl.REPEAT : gl.CLAMP_TO_EDGE;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        gl.uniform1i(gl.getUniformLocation(prog, name), unit); tex[name] = t;
      }
      const im = new Image(); im.onload = () => { gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, tex.uPaper); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); draw(); }; im.src = '/textures/paper-cotton.webp';
      gl.activeTexture(gl.TEXTURE3); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([250, 248, 243, 255]));
    }
  }
  const U = (n) => gl.getUniformLocation(prog, n);

  /* ── 版面：把整座庭放进舞台 ── */
  const stoneR = (s) => RS[s.mag - 1] * GS;
  const layout = () => {
    const r = host.getBoundingClientRect(); W = r.width; H = r.height; dpr = Math.min(2, devicePixelRatio || 1);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of g.stars) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); }
    const padX = 150, padTop = 170, padBot = 140;
    k = Math.max(.5, Math.min(3.2, (W - padX * 2) / Math.max(1, x1 - x0), (H - padTop - padBot) / Math.max(1, y1 - y0)));
    ox = (W - (x1 - x0) * k) / 2 - x0 * k; oy = padTop + ((H - padTop - padBot) - (y1 - y0) * k) / 2 - y0 * k;
    const segs = [];
    g.series.forEach((se) => { for (let i = 1; i < se.stars.length; i++) segs.push({ x1: se.stars[i - 1].x, y1: se.stars[i - 1].y, x2: se.stars[i].x, y2: se.stars[i].y, r: -12 }); });
    F = sandField(g.stars.map((s) => ({ x: s.x, y: s.y, r: stoneR(s) })), k, undefined, undefined, segs);
    buildSvg(); buildLabels(); buildGL(); draw();
  };
  const scr = (s) => [s.x * k + ox, s.y * k + oy];
  const catOf = (s) => CAT[s.p.cat] ?? ['未分类', '#39C5BB', s.p.cat?.toUpperCase?.() ?? ''];

  /* ── 现网：同一套 iso / smooth / stonePath 画出来的 SVG ── */
  const buildSvg = () => {
    const levels = F ? LV.map((l) => iso(F, l / k).filter((p) => p.length > 3)) : [[], [], []];
    const dp = k > 2 ? 2 : 1;
    const outer = levels[2].map((p) => smooth(p, dp)).join('');
    let rake = ''; for (let y = 0; y <= H; y += 7) rake += `M0 ${y}H${W}`;
    const stones = g.stars.map((s) => {
      const [x, y] = scr(s), R = stoneR(s), A = ARCH[s.mag - 1], Hh = RH[s.mag - 1], seed = s.p.growth === 'seedling', c = catOf(s)[1];
      const deg = (s.rot * 180 / Math.PI).toFixed(1);
      return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" style="--c:${c}">
        <g class="st">${seed ? '' : `<ellipse cx="${Hh * .75}" cy="${Hh * .95}" rx="${R * 1.08}" ry="${R * A.sq * 1.06}" fill="url(#sd-sh)" transform="rotate(${deg} ${Hh * .75} ${Hh * .95})"/>`}
        <circle r="${R + 2}" class="land"/>
        <path d="${stonePath(s.p.id, R, A, s.rot)}" class="${seed ? 'body seed' : 'body'}" ${seed ? '' : 'fill="url(#sd-st)"'}/>
        ${s.p.growth === 'evergreen' ? (() => { const m = mossPath(s.p.id, R, A); return `<path d="${m.d}" fill="#869457"/>${m.dots.map((d) => `<circle cx="${d.cx}" cy="${d.cy}" r="${d.r}" fill="#5F6B3A"/>`).join('')}`; })() : ''}
        <ellipse cx="${-R * .32}" cy="${-R * .3 * A.sq}" rx="${R * .34}" ry="${R * .18 * A.sq + .4}" class="hi" transform="rotate(-28 ${-R * .32} ${-R * .3 * A.sq})"/></g>
        <g class="star"><circle r="${RC[s.mag - 1] * GS * 4.4}" fill="url(#sd-halo)" opacity=".55"/><circle r="${RC[s.mag - 1] * GS}" fill="color-mix(in oklab, ${c} 16%, #fff)"/></g></g>`;
    }).join('');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = `<defs>
        <radialGradient id="sd-sh"><stop offset="0" stop-color="#1E293B" stop-opacity=".22"/><stop offset=".6" stop-color="#1E293B" stop-opacity=".1"/><stop offset="1" stop-color="#1E293B" stop-opacity="0"/></radialGradient>
        <linearGradient id="sd-st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D3D5D0"/><stop offset=".52" stop-color="#A9ADAC"/><stop offset="1" stop-color="#83878A"/></linearGradient>
        <radialGradient id="sd-halo"><stop offset="0" stop-color="#E6FFFB" stop-opacity=".9"/><stop offset="1" stop-color="#66DED5" stop-opacity="0"/></radialGradient>
        <mask id="sd-mask"><rect width="${W}" height="${H}" fill="#fff"/><path d="${outer}" fill="#000" fill-rule="evenodd" transform="translate(${ox} ${oy}) scale(${k})"/></mask></defs>
      <style>
        .rk { fill:none; stroke:rgba(100,116,139,.085); stroke-width:1; }
        .rg { fill:none; stroke:color-mix(in oklab, #39C5BB 34%, #64748B); stroke-opacity:.2; stroke-width:1; vector-effect:non-scaling-stroke; }
        .rg.in { stroke-opacity:.32; }
        body.night .rk { stroke:rgba(102,222,213,.018); } body.night .rg { stroke:#66DED5; stroke-opacity:.09; } body.night .rg.in { stroke-opacity:.17; }
        .land { fill:#FAF8F3; } body.night .land { fill:transparent; }
        .body { stroke:rgba(71,85,105,.26); stroke-width:.6; }
        .body.seed { fill:color-mix(in oklab, color-mix(in oklab, var(--c) 20%, #A9ADAC) 26%, #FCFAF2); stroke:color-mix(in oklab, var(--c) 30%, #91989F); stroke-width:.8; stroke-opacity:.75; }
        .hi { fill:#FCFAF2; opacity:.55; }
        .star { opacity:0; } body.night .star { opacity:1; } body.night .st { opacity:0; }
      </style>
      <g class="live-only"><path class="rk" d="${rake}" mask="url(#sd-mask)"/>
        <g transform="translate(${ox} ${oy}) scale(${k})">${levels.map((ls, i) => ls.map((p) => `<path class="rg${i === 0 ? ' in' : ''}" d="${smooth(p, dp)}"/>`).join('')).join('')}</g></g>
      <g class="stones">${stones}</g>`;
    applyMode();
  };
  const buildLabels = () => {
    // 注记择位：右、左、右上、右下、左上、左下依次试，避开别的注记与所有石（现网在屏幕空间择位，这里是简化版）
    const boxes = [], stonesS = g.stars.map((s) => { const [x, y] = scr(s); return [x, y, stoneR(s) + 3]; });
    const hit = (b) => boxes.some((q) => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1])
      || stonesS.some(([x, y, r]) => x + r > b[0] && x - r < b[2] && y + r > b[1] && y - r < b[3])
      || b[0] < 8 || b[2] > W - 8;
    const spans = [...g.stars].sort((p, q) => q.mag - p.mag).map((s) => {
      const [x, y] = scr(s), R = stoneR(s), w = s.p.title.length * 13.6 + 4, h = 15;
      const cand = [[x + R + 7, y - h / 2], [x - R - 7 - w, y - h / 2], [x + R * .6, y - R - h - 2], [x + R * .6, y + R + 2], [x - R * .6 - w, y - R - h - 2], [x - R * .6 - w, y + R + 2],
        [x - w / 2, y - R - h - 6], [x - w / 2, y + R + 6]];
      let pick = cand.find(([lx, ly]) => !hit([lx, ly, lx + w, ly + h]));
      if (!pick) return '';
      boxes.push([pick[0], pick[1], pick[0] + w, pick[1] + h]);
      return `<span style="left:${pick[0].toFixed(0)}px;top:${pick[1].toFixed(0)}px">${esc(s.p.title)}</span>`;
    });
    const isl = g.islands.map((I) => {
      const pts = I.stars.map(scr), cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, by = Math.max(...pts.map((p) => p[1]));
      const [zh, c, en] = CAT[I.cat] ?? ['未分类', '#39C5BB', I.cat];
      let ly = by + 40; const w = 150;
      while (boxes.some((q) => cx - w / 2 < q[2] && cx + w / 2 > q[0] && ly < q[3] && ly + 18 > q[1])) ly += 18;
      boxes.push([cx - w / 2, ly, cx + w / 2, ly + 18]);
      return `<span class="isl" style="left:${cx.toFixed(0)}px;top:${ly.toFixed(0)}px"><i style="background:${c}"></i>${zh}<small>${en} · ${I.stars.length}</small></span>`;
    });
    lab.innerHTML = spans.join('') + isl.join('');
  };

  /* ── 提案：石高与石色两张屏幕贴图（用的是同一个 stonePath） ── */
  const buildGL = () => {
    if (!prog) return;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const mk = () => { const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height; return c; };
    const hm = mk(), al = mk(), hx = hm.getContext('2d'), ax = al.getContext('2d');
    hx.fillStyle = '#000'; hx.fillRect(0, 0, hm.width, hm.height);
    ax.fillStyle = '#A9ADAC'; ax.fillRect(0, 0, al.width, al.height);
    for (const s of g.stars) {
      const [x, y] = scr(s), R = stoneR(s), A = ARCH[s.mag - 1], seed = s.p.growth === 'seedling', c = catOf(s)[1];
      const path = new Path2D(stonePath(s.p.id, R, A, s.rot));
      // 石高：穹顶 × 本石的高（RH，文章越长越高），满量程 HMAX
      const top = seed ? .12 : Math.min(1, (RH[s.mag - 1] * 2.6 + R * .32) / HMAX);
      hx.save(); hx.setTransform(dpr, 0, 0, dpr, x * dpr, y * dpr); ax.save(); ax.setTransform(dpr, 0, 0, dpr, x * dpr, y * dpr);
      const gr = hx.createRadialGradient(-R * .12, -R * .14, 0, 0, 0, R * 1.08);
      [[0, 1], [.45, .9], [.7, .72], [.85, .52], [.95, .3], [1, .12]].forEach(([o, v]) => gr.addColorStop(o, `rgb(${Math.round(v * top * 255)},255,${seed ? 255 : 0})`));
      hx.fillStyle = gr; hx.fill(path);
      // 石色：现网 sg1 的配方（石基色 80% + 庭色 20%），种子更浅
      const tint = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));
      const cc = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
      const base = tint([169, 173, 172], cc, .2), col = seed ? tint(base, [252, 250, 242], .74) : base;
      ax.fillStyle = `rgb(${col.join(',')})`; ax.fill(path);
      if (!seed) { for (let i = 0; i < R * 3; i++) { const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * R * .85; ax.fillStyle = Math.random() < .5 ? 'rgba(47,54,59,.35)' : 'rgba(252,250,242,.45)'; ax.fillRect(Math.cos(a) * rr, Math.sin(a) * rr, .7, .7); } }
      if (s.p.growth === 'evergreen') { const m = mossPath(s.p.id, R, A); ax.fillStyle = '#869457'; ax.fill(new Path2D(m.d)); ax.fillStyle = '#5F6B3A'; m.dots.forEach((d) => { ax.beginPath(); ax.arc(d.cx, d.cy, d.r, 0, 6.2832); ax.fill(); }); }
      if (seed) { ax.strokeStyle = `rgba(${tint([145, 152, 159], cc, .3).join(',')},.75)`; ax.lineWidth = .8; ax.stroke(path); }
      hx.restore(); ax.restore();
    }
    const up = (unit, src) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, unit === 1 ? tex.uHM : tex.uAlb); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); };
    up(1, hm); up(2, al);
    // 距离场：sandField 的格点（世界单位），半精度浮点贴图，可线性过滤
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.uField);
    if (F) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, F.nx, F.ny, 0, gl.RED, gl.FLOAT, F.v);
    gl.uniform2f(U('uF0'), F?.x0 ?? 0, F?.y0 ?? 0); gl.uniform1f(U('uFg'), F?.g ?? 1); gl.uniform2f(U('uFn'), F?.nx ?? 1, F?.ny ?? 1);
  };

  const light = () => {
    if (night) return { L: [.5, -.5, .7], col: [.3, .4, .52], amb: [.03, .04, .065], txt: '月在右上（与 Moon.tsx 同位）' };
    const { az, el } = sydneySun(now, hour), e = Math.max(4, el) * Math.PI / 180, a = az * Math.PI / 180;
    const warm = Math.max(0, 1 - el / 35);
    return { L: [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)],
      col: [1.0, .95 - .12 * warm, .88 - .3 * warm].map((v) => v * .6), amb: [.47, .48, .52],
      txt: `悉尼 ${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round(hour % 1 * 60)).padStart(2, '0')} · 方位 ${az.toFixed(0)}° · 高度 ${el.toFixed(0)}°`, el };
  };
  function draw() {
    if (!prog || mode !== 'next') return;
    const l = light();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(U('uRes'), canvas.width, canvas.height); gl.uniform2f(U('uOff'), ox, oy);
    gl.uniform1f(U('uK'), k); gl.uniform1f(U('uDpr'), dpr); gl.uniform1f(U('uNight'), night ? 1 : 0); gl.uniform1f(U('uGrain'), 1); gl.uniform1f(U('uRake'), night ? .16 : .4);
    gl.uniform3f(U('uL'), ...l.L); gl.uniform3f(U('uLcol'), ...l.col); gl.uniform3f(U('uAmb'), ...l.amb);
    for (const [n, u] of [['uField', 0], ['uHM', 1], ['uAlb', 2], ['uPaper', 3]]) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, tex[n]); }
    const t0 = performance.now();
    gl.drawArrays(gl.TRIANGLES, 0, 3); frames++; lastDraw = performance.now() - t0;
    ctx.perf(`${l.txt}\n画了 ${frames} 帧（只在光变时画）\n${real ? `${g.stars.length} 块石 · Supabase 真文章` : '示例文章（取不到 Supabase）'}`);
  }
  const applyMode = () => {
    const next = mode === 'next' && prog;
    canvas.style.display = next ? '' : 'none';
    paperDiv.style.display = next ? 'none' : '';
    svg.querySelector('.live-only')?.setAttribute('display', next ? 'none' : 'inline');
    // 提案：昼里石由 WebGL 画（受同一束光）；夜里 SVG 只留星
    const st = svg.querySelectorAll('.st'); st.forEach((x) => x.setAttribute('display', next ? 'none' : 'inline'));
    if (!next) ctx.perf(`现网：SVG 描线 + 固定偏移的石影\n${real ? `${g.stars.length} 块石 · Supabase 真文章` : '示例文章'}`);
  };

  /* ── 控件 ── */
  const fmtH = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round(h % 1 * 60) % 60).padStart(2, '0')}`;
  ctx.bar.innerHTML = `<label>时辰 <input type="range" min="${5.75 * 60}" max="${19.5 * 60}" step="5" value="${Math.round(hour * 60)}" data-h><span class="num" data-hv>${fmtH(hour)}</span></label>
    <button class="b" data-now>此刻</button><button class="b" data-h0="7.2">朝</button><button class="b" data-h0="12.9">午</button><button class="b" data-h0="18.1">暮</button>`;
  const inH = ctx.bar.querySelector('[data-h]'), hv = ctx.bar.querySelector('[data-hv]');
  const setHour = (h) => { hour = h; inH.value = String(Math.round(h * 60)); hv.textContent = fmtH(h); requestAnimationFrame(draw); };
  inH.addEventListener('input', () => setHour(+inH.value / 60));
  ctx.bar.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if ('now' in b.dataset) setHour(Math.min(19.5, Math.max(5.75, sydH))); else if (b.dataset.h0) setHour(+b.dataset.h0); });
  const syncBar = () => { ctx.bar.style.opacity = mode === 'next' && !night ? '1' : '.45'; inH.disabled = !(mode === 'next' && !night); };

  layout(); syncBar();
  let rt = 0; const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(layout, 120); }); ro.observe(host);
  return {
    setMode(v) { mode = v; applyMode(); syncBar(); draw(); },
    setNight(n) { night = n; syncBar(); draw(); },
    destroy() { ro.disconnect(); clearTimeout(rt); gl?.getExtension('WEBGL_lose_context')?.loseContext(); },
  };
}
