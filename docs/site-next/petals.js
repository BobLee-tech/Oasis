// 标本 · 外壳的樱瓣。
//   现网：OasisBackground.tsx 的粒子原样移植（画布按 CSS 像素、每帧每瓣新建渐变、按帧积分、压扁假翻面）。
//   提案：同一块 2D 画布——按 DPR 建、精灵预渲、四元数取向（正交投影 = setTransform 六个数）、
//         正背两面 × 四档受光、按 dt 积分、风从风钟取（「吹一阵」）。
import { currentSeason } from '/src/lib/solarTerms.ts';

const PALETTES = {
  spring: [{ light: '255, 228, 235', deep: '255, 170, 190' }, { light: '255, 218, 228', deep: '255, 150, 175' }, { light: '255, 235, 240', deep: '255, 190, 205' }],
  summer: [{ light: '209, 250, 229', deep: '110, 231, 183' }, { light: '187, 247, 208', deep: '74, 222, 165' }, { light: '220, 252, 231', deep: '134, 239, 172' }],
  autumn: [{ light: '254, 215, 170', deep: '234, 122, 40' }, { light: '253, 200, 150', deep: '220, 88, 42' }, { light: '250, 208, 160', deep: '200, 70, 50' }],
  winter: [{ light: '255, 255, 255', deep: '226, 238, 240' }, { light: '248, 252, 253', deep: '210, 228, 232' }, { light: '255, 255, 255', deep: '224, 242, 241' }],
};
const SEASONS = [['spring', '春'], ['summer', '夏'], ['autumn', '秋'], ['winter', '冬']];

const tracePetal = (ctx, s) => {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.bezierCurveTo(s * 0.85, -s * 0.55, s * 0.65, s * 0.45, s * 0.18, s * 0.82);
  ctx.lineTo(0, s * 0.62);
  ctx.lineTo(-s * 0.18, s * 0.82);
  ctx.bezierCurveTo(-s * 0.65, s * 0.45, -s * 0.85, -s * 0.55, 0, -s);
  ctx.closePath();
};

/* ── 风钟：现网的双频呼吸风 + 偶发阵风，外加手动的一阵（落地后樱瓣、竹影、封舌同取这一个） ── */
const windClock = () => {
  let kick = 0, kickAt = -1e9;
  return {
    at(ms) {
      const gust = Math.max(0, Math.sin(ms * 0.000037)) ** 3 * 0.45;
      const k = kick * Math.exp(-(ms - kickAt) / 900) * Math.min(1, (ms - kickAt) / 180);
      return Math.sin(ms * 0.0001) * 0.15 + Math.sin(ms * 0.00023 + 2) * 0.1 + gust + Math.max(0, k);
    },
    blow(ms) { kick = 1.9; kickAt = ms; },
    kickNow(ms) { return Math.max(0, kick * Math.exp(-(ms - kickAt) / 900)); },
  };
};

export function mount(host, ctx) {
  host.style.background = 'var(--bg)';
  host.innerHTML = `
    <div style="position:absolute;inset:0;background:radial-gradient(60% 50% at 30% 30%, color-mix(in srgb, var(--teal) 7%, transparent), transparent 70%), radial-gradient(50% 45% at 78% 72%, color-mix(in srgb, var(--sakura) 12%, transparent), transparent 70%)"></div>
    <canvas style="position:absolute;inset:0;width:100%;height:100%;opacity:.8"></canvas>
    <div style="position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);width:min(380px,80%);border-radius:24px;overflow:hidden;background:color-mix(in srgb, var(--panel-solid) 82%, transparent);border:1px solid var(--line);box-shadow:0 1px 2px rgba(30,41,59,.04),0 10px 28px -14px rgba(30,41,59,.12);z-index:2">
      <div style="height:88px;background:linear-gradient(135deg, #39C5BB29, #39C5BB0a 55%, transparent)"></div>
      <div style="padding:20px 26px 24px"><div style="font:10px/1 var(--mono);letter-spacing:.2em;color:var(--ink3)">OCT 5, 2026 · 2 MIN READ</div>
      <div style="font:500 22px/1.4 var(--zh);margin:12px 0 8px">建筑杂谈</div><div style="font-size:13px;color:var(--ink2);line-height:1.8">说起建筑，最初是在玩我的世界……樱瓣在卡片后面，与现网层次相同。</div></div>
    </div>`;
  const canvas = host.querySelector('canvas');
  const g = canvas.getContext('2d', { alpha: true });
  let mode = ctx.v, night = ctx.night ? 1 : 0, targetNight = night, season = currentSeason();
  let W = 0, H = 0, dpr = 1, raf = 0, dead = false, zoom = 1;
  const stats = { live: null, next: null };
  const wind = windClock();

  /* ── 控件 ── */
  ctx.bar.innerHTML = `${SEASONS.map(([k, n]) => `<button class="b" data-s="${k}">${n}</button>`).join('')}<span class="sep"></span><button class="b" data-blow>吹一阵</button><button class="b" data-zoom aria-pressed="false">近看 ×3</button>`;
  const sync = () => ctx.bar.querySelectorAll('[data-s]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.s === season)));
  ctx.bar.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.s) { season = b.dataset.s; sync(); build(); }
    if ('blow' in b.dataset) wind.blow(performance.now());
    if ('zoom' in b.dataset) { zoom = zoom === 1 ? 3 : 1; b.setAttribute('aria-pressed', String(zoom > 1)); build(); }
  });
  sync();

  /* ══ 现网：原样移植 ══ */
  let live = [];
  const liveParticle = (scatter) => {
    const tones = PALETTES[season], round = season === 'winter';
    const p = { x: 0, y: 0, z: zoom > 1 ? Math.random() * 0.3 + 0.7 : Math.random() * 0.8 + 0.2, vx: 0, vy: 0, opacity: 0, offset: Math.random() * 10000 };
    p.isBokeh = Math.random() < 0.34;
    p.baseSize = (p.isBokeh ? Math.random() * 38 + 22 : Math.random() * 5 + 4.5) * (p.isBokeh ? 1 : zoom);
    p.size = p.baseSize * p.z;
    p.targetOpacity = p.isBokeh ? Math.random() * 0.14 + 0.05 : zoom > 1 ? 0.9 : Math.random() * 0.35 + 0.4;
    p.angle = Math.random() * Math.PI * 2; p.spin = (Math.random() - 0.5) * 0.01;
    p.tumbleSpeed = Math.random() * 0.0012 + 0.0006; p.tone = tones[Math.floor(Math.random() * tones.length)];
    p.round = round;
    p.respawn = (sc) => {
      p.x = Math.random() * W; p.opacity = 0;
      if (sc) p.y = Math.random() * H; else if (night > 0.5) p.y = H + 40; else p.y = -40 - Math.random() * 80;
      p.vx = 0; p.vy = night > 0.5 ? -(Math.random() * 0.12 + 0.06) : (Math.random() * 0.2 + 0.15);
    };
    p.respawn(scatter);
    return p;
  };
  const liveStep = (time, w) => {
    const fallScale = season === 'winter' ? 0.55 : season === 'autumn' ? 1.15 : 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.globalCompositeOperation = night > 0.5 ? 'screen' : 'source-over';
    for (const p of live) {
      const t = time + p.offset;
      if (night < 0.5) {
        const tumble = Math.sin(t * p.tumbleSpeed);
        const fallBase = (p.isBokeh ? 0.08 : (0.22 + 0.1 * p.z)) * fallScale;
        const targetVy = p.round ? fallBase : fallBase * (0.65 + 0.35 * Math.abs(tumble));
        const sway = Math.sin(t * 0.0006) * 0.35 * p.z;
        const targetVx = (w * (0.6 + p.z) + sway) * (p.isBokeh ? 0.3 : 1);
        p.vx += (targetVx - p.vx) * 0.02; p.vy += (targetVy - p.vy) * 0.02;
        p.angle += p.spin + tumble * 0.004;
      } else {
        const drift = Math.sin(t * 0.0004) * 0.06 * p.z, rise = -(0.05 + 0.06 * p.z);
        p.vx += (w * 0.3 * p.z + drift - p.vx) * 0.015; p.vy += (rise - p.vy) * 0.015;
      }
      p.x += p.vx; p.y += p.vy;                       // 按帧积分：120 Hz 屏上快一倍
      if (p.y > H + 120 || p.y < -120) { p.z = Math.random() * 0.8 + 0.2; p.size = p.baseSize * p.z; p.respawn(false); }
      if (p.x > W + 120) p.x = -120; else if (p.x < -120) p.x = W + 120;
      p.opacity += (p.targetOpacity - p.opacity) * 0.02;
      if (p.opacity < 0.01) continue;
      const dayOp = (1 - night) * p.opacity, nightOp = night * p.opacity;
      if (dayOp > 0.01) {
        if (p.isBokeh) {
          const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          grad.addColorStop(0, `rgba(${p.tone.deep}, ${dayOp * 0.8})`); grad.addColorStop(1, `rgba(${p.tone.deep}, 0)`);
          g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fillStyle = grad; g.fill();
        } else if (p.round) {
          const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          grad.addColorStop(0, `rgba(${p.tone.light}, ${dayOp})`); grad.addColorStop(0.6, `rgba(${p.tone.deep}, ${dayOp * 0.75})`); grad.addColorStop(1, `rgba(${p.tone.deep}, 0)`);
          g.beginPath(); g.arc(p.x, p.y, p.size * 0.9, 0, Math.PI * 2); g.fillStyle = grad; g.fill();
        } else {
          const squash = 0.45 + 0.55 * Math.abs(Math.cos(t * p.tumbleSpeed));
          g.save(); g.translate(p.x, p.y); g.rotate(p.angle); g.scale(squash, 1);
          const grad = g.createLinearGradient(0, -p.size, 0, p.size);
          grad.addColorStop(0, `rgba(${p.tone.light}, ${dayOp})`); grad.addColorStop(1, `rgba(${p.tone.deep}, ${dayOp * 0.9})`);
          tracePetal(g, p.size); g.fillStyle = grad; g.fill(); g.restore();
        }
      }
      if (nightOp > 0.01) {
        const pulse = (Math.sin(t * 0.001) + 1) / 2;
        const cs = (p.isBokeh ? p.size : p.size * 0.8) * (0.8 + 0.4 * pulse);
        const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, cs);
        if (p.isBokeh) { grad.addColorStop(0, `rgba(57, 197, 187, ${nightOp * 0.5})`); grad.addColorStop(1, 'rgba(57, 197, 187, 0)'); }
        else { grad.addColorStop(0, `rgba(255, 255, 255, ${nightOp * (0.6 + 0.4 * pulse)})`); grad.addColorStop(0.2, `rgba(57, 197, 187, ${nightOp * (0.4 + 0.2 * pulse)})`); grad.addColorStop(1, 'rgba(57, 197, 187, 0)'); }
        g.beginPath(); g.arc(p.x, p.y, cs, 0, Math.PI * 2); g.fillStyle = grad; g.fill();
      }
    }
  };

  /* ══ 提案 ══ */
  const SP = 64, PS = 26;                       // 精灵边长、精灵里花瓣的半长
  const LEVELS = [0.6, 0.76, 0.9, 1.0];          // 四档受光（1 = 原色，不再提亮，免得发白）
  let sprites = null;                            // [tone][side][level]
  const L = (() => { const v = [-0.5, -0.56, 0.66], n = Math.hypot(...v); return v.map((x) => x / n); })();   // 窗在左上、朝外
  const mkc = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const buildSprites = () => {
    const tones = PALETTES[season], round = season === 'winter';
    sprites = tones.map((tone) => {
      const side = (back) => LEVELS.map((lv) => {
        const c = mkc(SP, SP), x = c.getContext('2d'); x.translate(SP / 2, SP / 2);
        if (round) {
          const gr = x.createRadialGradient(0, 0, 0, 0, 0, PS * 0.9);
          gr.addColorStop(0, `rgba(${tone.light},1)`); gr.addColorStop(0.6, `rgba(${tone.deep},.75)`); gr.addColorStop(1, `rgba(${tone.deep},0)`);
          x.fillStyle = gr; x.beginPath(); x.arc(0, 0, PS * 0.9, 0, Math.PI * 2); x.fill();
        } else {
          const gr = x.createLinearGradient(0, -PS, 0, PS);
          if (back) { gr.addColorStop(0, `rgba(${tone.light},.95)`); gr.addColorStop(1, `rgba(${tone.deep},.62)`); }
          else { gr.addColorStop(0, `rgba(${tone.light},1)`); gr.addColorStop(1, `rgba(${tone.deep},.9)`); }
          tracePetal(x, PS); x.fillStyle = gr; x.fill();
          // 背面一条淡淡的主脉；正面边缘一点更深的色
          x.save(); tracePetal(x, PS); x.clip();
          if (back) { x.strokeStyle = `rgba(${tone.deep},.35)`; x.lineWidth = 1.1; x.beginPath(); x.moveTo(0, -PS * 0.78); x.quadraticCurveTo(PS * 0.06, 0, 0, PS * 0.6); x.stroke(); }
          else { x.strokeStyle = `rgba(${tone.deep},.4)`; x.lineWidth = 3; tracePetal(x, PS); x.stroke(); }
          x.restore();
        }
        // 受光：source-atop 压暗或提亮，只落在花瓣本身
        x.globalCompositeOperation = 'source-atop';
        if (lv < 1) { x.fillStyle = `rgba(90,40,40,${(1 - lv) * 1.05})`; x.fillRect(-SP / 2, -SP / 2, SP, SP); }
        return c;
      });
      return [side(false), side(true)];
    });
    const glow = (rgb, a0, mid) => { const c = mkc(SP, SP), x = c.getContext('2d'); const gr = x.createRadialGradient(SP / 2, SP / 2, 0, SP / 2, SP / 2, SP / 2); gr.addColorStop(0, `rgba(${rgb},${a0})`); if (mid) gr.addColorStop(0.2, mid); gr.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = gr; x.fillRect(0, 0, SP, SP); return c; };
    sprites.bokeh = tones.map((t) => glow(t.deep, 0.8));
    sprites.firefly = glow('255,255,255', 1, 'rgba(57,197,187,.5)');
    sprites.fireBokeh = glow('57,197,187', 0.5);
  };
  const qmul = (a, b) => [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
  const qrot = (q, v) => {               // q·v·q*
    const [w, x, y, z] = q, [vx, vy, vz] = v;
    const ix = w * vx + y * vz - z * vy, iy = w * vy + z * vx - x * vz, iz = w * vz + x * vy - y * vx, iw = -x * vx - y * vy - z * vz;
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
  };
  const randQ = () => { const u = Math.random(), v = Math.random() * 2 * Math.PI, w = Math.random() * 2 * Math.PI; return [Math.sqrt(1 - u) * Math.sin(v), Math.sqrt(1 - u) * Math.cos(v), Math.sqrt(u) * Math.sin(w), Math.sqrt(u) * Math.cos(w)]; };
  let next = [];
  const nextParticle = (scatter) => {
    const p = liveParticle(scatter);
    p.q = randQ();
    p.w = [(Math.random() - 0.5) * 0.5, (Math.random() * 1.2 + 0.6) * (Math.random() < 0.5 ? -1 : 1), (Math.random() - 0.5) * 0.6];   // 机体角速度：绕长轴翻为主
    p.ti = Math.floor(Math.random() * 3);
    // 现网的速度是「每帧像素」（60 Hz 下）；这里改成每秒
    p.vx *= 60; p.vy *= 60;
    const res = p.respawn; p.respawn = (sc) => { res(sc); p.vx *= 60; p.vy *= 60; };
    return p;
  };
  let lastT = 0;
  const nextStep = (time, w) => {
    const dt = Math.min(0.05, (time - (lastT || time)) / 1000); lastT = time;
    const fallScale = season === 'winter' ? 0.55 : season === 'autumn' ? 1.15 : 1, round = season === 'winter';
    const kick = wind.kickNow(time);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.globalCompositeOperation = night > 0.5 ? 'screen' : 'source-over';
    const ease = (k) => 1 - Math.exp(-k * dt * 60);   // 现网每帧 0.02 的趋近，换成与帧率无关
    for (const p of next) {
      const t = time + p.offset;
      if (night < 0.5) {
        let edge = 0;
        if (!p.isBokeh && !round) {
          const wb = [p.w[0], p.w[1] * (1 + kick * 1.6), p.w[2] + Math.sin(t * 0.0009) * 0.3];
          const m = Math.hypot(...wb), a = m * dt;
          if (a > 1e-6) {
            const s = Math.sin(a / 2) / m;
            const q = qmul(p.q, [Math.cos(a / 2), wb[0] * s, wb[1] * s, wb[2] * s]), qn = Math.hypot(...q);
            p.q = q.map((c) => c / qn);
          }
          const n = qrot(p.q, [0, 0, 1]); edge = 1 - Math.abs(n[2]);
        }
        const fallBase = (p.isBokeh ? 0.08 : (0.22 + 0.1 * p.z)) * fallScale * 60;
        const targetVy = round ? fallBase : fallBase * (0.65 + 0.35 * edge);
        const sway = Math.sin(t * 0.0006) * 0.35 * p.z * 60;
        const targetVx = (w * (0.6 + p.z) * 60 + sway) * (p.isBokeh ? 0.3 : 1);
        p.vx += (targetVx - p.vx) * ease(0.02); p.vy += (targetVy - p.vy) * ease(0.02);
      } else {
        const drift = Math.sin(t * 0.0004) * 0.06 * p.z * 60, rise = -(0.05 + 0.06 * p.z) * 60;
        p.vx += (w * 0.3 * p.z * 60 + drift - p.vx) * ease(0.015); p.vy += (rise - p.vy) * ease(0.015);
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y > H + 120 || p.y < -120) { p.z = Math.random() * 0.8 + 0.2; p.size = p.baseSize * p.z; p.respawn(false); }
      if (p.x > W + 120) p.x = -120; else if (p.x < -120) p.x = W + 120;
      p.opacity += (p.targetOpacity - p.opacity) * ease(0.02);
      if (p.opacity < 0.01) continue;
      const dayOp = (1 - night) * p.opacity, nightOp = night * p.opacity;
      const X = p.x * dpr, Y = p.y * dpr;
      if (dayOp > 0.01) {
        g.globalAlpha = Math.min(1, dayOp);
        if (p.isBokeh) {
          const s = (p.size * 2 * dpr) / SP; g.setTransform(s, 0, 0, s, X, Y); g.drawImage(sprites.bokeh[p.ti], -SP / 2, -SP / 2);
        } else {
          const ax = qrot(p.q, [1, 0, 0]), ay = qrot(p.q, [0, 1, 0]), n = qrot(p.q, [0, 0, 1]);
          const back = !round && n[2] < 0 ? 1 : 0;
          const nf = back ? [-n[0], -n[1], -n[2]] : n;
          const sh = round ? 0.6 : nf[0] * L[0] + nf[1] * L[1] + nf[2] * L[2];
          // 背光（光从花瓣背后来）时，透过来的那面反而亮：取上档
          const lit = sh < -0.15 ? 2 : Math.max(0, Math.min(3, Math.round((sh * 0.5 + 0.5) * 3.2)));
          const k = (p.size * dpr) / PS;
          if (round) g.setTransform(k, 0, 0, k, X, Y);
          else g.setTransform(ax[0] * k, ax[1] * k, ay[0] * k, ay[1] * k, X, Y);
          g.drawImage(sprites[p.ti][back][lit], -SP / 2, -SP / 2);
        }
      }
      if (nightOp > 0.01) {
        const pulse = (Math.sin(t * 0.001) + 1) / 2;
        const cs = (p.isBokeh ? p.size : p.size * 0.8) * (0.8 + 0.4 * pulse);
        g.globalAlpha = Math.min(1, nightOp * (p.isBokeh ? 1 : 0.6 + 0.4 * pulse));
        const s = (cs * 2 * dpr) / SP; g.setTransform(s, 0, 0, s, X, Y);
        g.drawImage(p.isBokeh ? sprites.fireBokeh : sprites.firefly, -SP / 2, -SP / 2);
      }
    }
    g.globalAlpha = 1;
  };

  /* ── 建 / 量 ── */
  const build = () => {
    const r = host.getBoundingClientRect(); W = r.width; H = r.height;
    dpr = mode === 'next' ? Math.min(2, devicePixelRatio || 1) : 1;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const n = Math.round(Math.min(85, Math.max(20, Math.round((W * H) / 26000))) / (zoom > 1 ? 2 : 1));
    if (mode === 'next') { buildSprites(); next = Array.from({ length: n }, () => nextParticle(true)); next.forEach((p) => { p.opacity = p.targetOpacity * Math.random(); }); lastT = 0; }
    else { live = Array.from({ length: n }, () => liveParticle(true)); live.forEach((p) => { p.opacity = p.targetOpacity * Math.random(); }); }
  };
  const ms = [];
  const frame = () => {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const now = performance.now();
    night += (targetNight - night) * 0.05;
    if (Math.abs(targetNight - night) < 0.002) night = targetNight;
    const w = wind.at(now);
    const t0 = performance.now();
    if (mode === 'next') nextStep(now, w); else liveStep(now, w);
    ms.push(performance.now() - t0); if (ms.length > 90) ms.shift();
    if (ms.length % 15 === 0 || ms.length === 90) {
      const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
      stats[mode] = avg;
      const f = (k) => (stats[k] == null ? '—' : stats[k].toFixed(2) + ' ms');
      ctx.perf(`每帧耗时　现网 ${f('live')}　提案 ${f('next')}\n画布 ${canvas.width}×${canvas.height}（${mode === 'next' ? 'DPR ' + dpr : '按 CSS 像素'}）· ${(mode === 'next' ? next : live).length} 粒\n${mode === 'next' ? '每帧新建渐变 0 个' : '每帧新建渐变约 ' + (mode === 'live' ? live.length : 0) + ' 个'}`);
    }
  };
  build();
  if (ctx.reduce) { night = targetNight; (mode === 'next' ? nextStep : liveStep)(performance.now(), 0); }
  else frame();
  const ro = new ResizeObserver(() => build()); ro.observe(host);

  return {
    setMode(v) { mode = v; ms.length = 0; build(); },
    setNight(n) { targetNight = n ? 1 : 0; },
    destroy() { dead = true; cancelAnimationFrame(raf); ro.disconnect(); },
  };
}
