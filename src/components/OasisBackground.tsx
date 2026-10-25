// src/components/OasisBackground.tsx
// 🌸 全站背景的樱瓣 / 夏叶 / 秋枫 / 冬雪（夜里是星萤）。
//   画法的四条规矩（docs/site-next.html「外壳 · 樱瓣」）：
//   · 画布按 devicePixelRatio 建（上限 2），Retina 上花瓣不糊；
//   · 渐变只在启动时画进精灵，帧里只有 drawImage——不再每帧每瓣新建渐变对象；
//   · 运动按秒积分（现网的「每帧像素」× 60），60 Hz 与 120 Hz 屏上一样快；
//   · 场所有自己不透明的地（尺牍、园图）时 covered：画布淡出后停画，回来接着飘；
//   · 真的翻面：取向是「绕长轴翻 × 绕宽轴微俯仰 × 平面内自旋」，局部 x / y 轴的正交投影就是 setTransform 的
//     六个数（仍是 2D 画布）。法线朝外看见正面、朝里看见背面（浅一些、有一道主脉），受光按法线与窗
//     （左上，与尺牍同向）的夹角选四档之一；光从背后来时那一面透亮。
import React, { useEffect, useRef } from 'react';
import type { BgPhase } from '../types/auth';
import { currentSeason, type Season } from '../lib/solarTerms';
import { breath, gust } from '../lib/wind';

interface OasisBackgroundProps {
  phase: BgPhase;
  isDark: boolean;
  /** 当前场所自带不透明的地，樱瓣一瓣也看不见：淡出后停画 */
  covered?: boolean;
}

type Tone = { light: string; deep: string };

// 🍃 季节流转：春樱 / 夏叶 / 秋枫 / 冬雪，各有色板与飘落性格，复用同一套翻飞物理。
const SEASON_PALETTES: Record<Season, Tone[]> = {
  // 🌸 春：樱白到深粉
  spring: [
    { light: '255, 228, 235', deep: '255, 170, 190' },
    { light: '255, 218, 228', deep: '255, 150, 175' },
    { light: '255, 235, 240', deep: '255, 190, 205' },
  ],
  // 🌿 夏：嫩绿到薄荷
  summer: [
    { light: '209, 250, 229', deep: '110, 231, 183' },
    { light: '187, 247, 208', deep: '74, 222, 165' },
    { light: '220, 252, 231', deep: '134, 239, 172' },
  ],
  // 🍁 秋：琥珀到枫红
  autumn: [
    { light: '254, 215, 170', deep: '234, 122, 40' },
    { light: '253, 200, 150', deep: '220, 88, 42' },
    { light: '250, 208, 160', deep: '200, 70, 50' },
  ],
  // ❄️ 冬：雪白到冷青白
  winter: [
    { light: '255, 255, 255', deep: '226, 238, 240' },
    { light: '248, 252, 253', deep: '210, 228, 232' },
    { light: '255, 255, 255', deep: '224, 242, 241' },
  ],
};

// 经典五瓣樱花的单片花瓣：圆润基部 + 顶端浅凹槽
const tracePetal = (ctx: CanvasRenderingContext2D, s: number) => {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.bezierCurveTo(s * 0.85, -s * 0.55, s * 0.65, s * 0.45, s * 0.18, s * 0.82);
  ctx.lineTo(0, s * 0.62); // 顶端凹槽
  ctx.lineTo(-s * 0.18, s * 0.82);
  ctx.bezierCurveTo(-s * 0.65, s * 0.45, -s * 0.85, -s * 0.55, 0, -s);
  ctx.closePath();
};

/* ── 精灵：启动时画一次。花瓣半长 PS 画在 SP×SP 的离屏画布中央；光斑类的渐变半径就是半边长 ── */
const SP = 64, PS = 28;
const sprite = (draw: (c: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas'); c.width = c.height = SP;
  const x = c.getContext('2d')!; x.translate(SP / 2, SP / 2); draw(x);
  return c;
};
const radial = (stops: [number, string][]) => sprite((x) => {
  const g = x.createRadialGradient(0, 0, 0, 0, 0, SP / 2);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, SP / 2, 0, Math.PI * 2); x.fill();
});

export const OasisBackground: React.FC<OasisBackgroundProps> = ({ phase, isDark, covered = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const isDarkRef = useRef(isDark);
  const coveredRef = useRef(covered);
  const isRunningRef = useRef(false);
  const renderRef = useRef<(now?: number) => void>(undefined);

  useEffect(() => {
    phaseRef.current = phase; isDarkRef.current = isDark; coveredRef.current = covered;
    if (renderRef.current && !isRunningRef.current && !document.hidden) renderRef.current();
  }, [phase, isDark, covered]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true }); if (!ctx) return;

    let animationFrameId: number;
    let isPaused = document.hidden;
    isRunningRef.current = false;

    // ♿ 晕动症友好：偏好减少动效时只渲染一帧静态画面
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let globalNightFactor = isDarkRef.current ? 1 : 0;
    let time = 0, last = 0, coveredSince = 0;
    let W = window.innerWidth, H = window.innerHeight, dpr = 1;

    const resizeCanvas = () => {
      W = window.innerWidth; H = window.innerHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    };
    resizeCanvas(); window.addEventListener('resize', resizeCanvas);

    const season: Season = currentSeason();
    const PETAL_TONES = SEASON_PALETTES[season];
    // 冬雪为柔软圆点（无花瓣翻转），其余季节为翻飞的花瓣 / 叶片
    const roundParticles = season === 'winter';
    // 飘落速度性格：雪最缓、樱瓣轻盈、秋叶稍沉
    const fallScale = season === 'winter' ? 0.55 : season === 'autumn' ? 1.15 : 1;

    // 每个色调一套：花瓣正面 / 背面各四档受光（正面满档就是现网那片：浅→深的纵向渐变，下端 0.9）、远景光斑、雪粒
    const LEVELS = [0.6, 0.76, 0.9, 1];
    const petalSide = (t: Tone, back: boolean) => LEVELS.map((lv) => sprite((x) => {
      const g = x.createLinearGradient(0, -PS, 0, PS);
      if (back) { g.addColorStop(0, `rgba(${t.light}, 0.95)`); g.addColorStop(1, `rgba(${t.deep}, 0.62)`); }
      else { g.addColorStop(0, `rgba(${t.light}, 1)`); g.addColorStop(1, `rgba(${t.deep}, 0.9)`); }
      tracePetal(x, PS); x.fillStyle = g; x.fill();
      if (back) {   // 背面：一道淡淡的主脉
        x.save(); tracePetal(x, PS); x.clip();
        x.strokeStyle = `rgba(${t.deep}, 0.35)`; x.lineWidth = 1.1;
        x.beginPath(); x.moveTo(0, -PS * 0.78); x.quadraticCurveTo(PS * 0.06, 0, 0, PS * 0.6); x.stroke();
        x.restore();
      }
      if (lv < 1) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = `rgba(90, 40, 40, ${((1 - lv) * 1.05).toFixed(3)})`; x.fillRect(-SP / 2, -SP / 2, SP, SP); }
    }));
    // 窗在左上、朝外（屏幕坐标 y 朝下）
    const LIGHT = (() => { const v = [-0.5, -0.56, 0.66], n = Math.hypot(v[0], v[1], v[2]); return v.map((c) => c / n); })();
    const SPRITES = PETAL_TONES.map((t) => ({
      front: petalSide(t, false),
      back: petalSide(t, true),
      bokeh: radial([[0, `rgba(${t.deep}, 0.8)`], [1, `rgba(${t.deep}, 0)`]]),
      snow: radial([[0, `rgba(${t.light}, 1)`], [0.6, `rgba(${t.deep}, 0.75)`], [1, `rgba(${t.deep}, 0)`]]),
    }));
    // 🌌 夜：星萤（白核青晕）与远景青光斑
    const FIREFLY = radial([[0, 'rgba(255, 255, 255, 1)'], [0.2, 'rgba(57, 197, 187, 0.6)'], [1, 'rgba(57, 197, 187, 0)']]);
    const FIRE_BOKEH = radial([[0, 'rgba(57, 197, 187, 0.5)'], [1, 'rgba(57, 197, 187, 0)']]);

    // 现网的手感是按 60 Hz「每帧」调出来的：速度 ×60 换成每秒，每帧趋近率换成与帧率无关的形式
    const ease = (rate: number, k60: number) => 1 - Math.pow(1 - rate, k60);

    class Particle {
      x = 0; y = 0;
      z: number;                 // 景深 0.2~1
      baseSize: number; size: number;
      vx = 0; vy = 0;            // px/s
      opacity = 0; targetOpacity: number;
      offset: number;
      isBokeh: boolean;          // 远景虚化光斑
      // 花瓣形态参数
      angle: number;             // 朝向
      spin: number;              // 自旋速度（rad / 60Hz 帧）
      tumbleSpeed: number;       // 翻飞频率（绕长轴翻转）
      tone: number;

      constructor(scatter = true) {
        this.z = Math.random() * 0.8 + 0.2;
        // 约 1/3 是远景虚化光斑，其余是实体花瓣/星萤
        this.isBokeh = Math.random() < 0.34;
        this.baseSize = this.isBokeh ? Math.random() * 38 + 22 : Math.random() * 5 + 4.5;
        this.size = this.baseSize * this.z;

        this.targetOpacity = this.isBokeh ? (Math.random() * 0.14 + 0.05) : (Math.random() * 0.35 + 0.4);
        this.offset = Math.random() * 10000;

        this.angle = Math.random() * Math.PI * 2;
        this.spin = (Math.random() - 0.5) * 0.01;
        this.tumbleSpeed = Math.random() * 0.0012 + 0.0006;
        this.tone = Math.floor(Math.random() * PETAL_TONES.length);

        this.respawn(scatter);
      }

      respawn(scatter: boolean) {
        this.x = Math.random() * W;
        this.opacity = 0;
        if (scatter) {
          // 初始铺满全屏，避免开场一片空白
          this.y = Math.random() * H;
        } else if (globalNightFactor > 0.5) {
          this.y = H + 40;                     // 夜晚星萤自下而上
        } else {
          this.y = -40 - Math.random() * 80;   // 白天花瓣自上而下
        }
        this.vx = 0;
        this.vy = (globalNightFactor > 0.5 ? -(Math.random() * 0.12 + 0.06) : (Math.random() * 0.2 + 0.15)) * 60;
      }

      update(nightFactor: number, wind: number, dt: number, k60: number) {
        const t = time + this.offset;

        if (nightFactor < 0.5) {
          // 🌸 白天：落叶式翻飞物理
          // 翻转相位：花瓣绕长轴翻转，翻转到侧面时下落加快、正面时受风兜住变慢
          const tumble = Math.sin(t * this.tumbleSpeed);
          const fallBase = (this.isBokeh ? 0.08 : (0.22 + 0.1 * this.z)) * fallScale * 60;
          // 雪缓缓飘、少翻飞；花瓣 / 叶片保留原有的翻飞节奏
          const targetVy = roundParticles ? fallBase : fallBase * (0.65 + 0.35 * Math.abs(tumble));
          // 横向：全局风 + 个体摇曳（与翻转联动，飘出 S 形轨迹）
          const sway = Math.sin(t * 0.0006) * 0.35 * this.z;
          const targetVx = (wind * (0.6 + this.z) + sway) * (this.isBokeh ? 0.3 : 1) * 60;

          const e = ease(0.02, k60);
          this.vx += (targetVx - this.vx) * e;
          this.vy += (targetVy - this.vy) * e;
          this.angle += (this.spin + tumble * 0.004) * k60;
        } else {
          // 🌌 夜晚：星萤极缓上浮 + 微弱布朗漂移
          const drift = Math.sin(t * 0.0004) * 0.06 * this.z;
          const rise = -(0.05 + 0.06 * this.z);
          const e = ease(0.015, k60);
          this.vx += ((wind * 0.3 * this.z + drift) * 60 - this.vx) * e;
          this.vy += (rise * 60 - this.vy) * e;
        }

        this.x += this.vx * dt; this.y += this.vy * dt;

        const m = 120;
        if (this.y > H + m || this.y < -m) {
          this.z = Math.random() * 0.8 + 0.2;
          this.size = this.baseSize * this.z;
          this.respawn(false);
        }
        // 左右出界：从另一侧温柔回卷，而不是凭空消失
        if (this.x > W + m) this.x = -m;
        else if (this.x < -m) this.x = W + m;

        this.opacity += (this.targetOpacity - this.opacity) * ease(0.012, k60);
      }

      draw(ctx: CanvasRenderingContext2D, nightFactor: number) {
        if (this.opacity < 0.01) return;

        const dayOp = (1 - nightFactor) * this.opacity;
        const nightOp = nightFactor * this.opacity;
        const t = time + this.offset;
        const X = this.x * dpr, Y = this.y * dpr;
        const S = SPRITES[this.tone];

        if (dayOp > 0.01) {
          ctx.globalAlpha = Math.min(1, dayOp);
          if (this.isBokeh) {
            // 远景：水蜜桃柔光斑
            const k = (this.size * 2 * dpr) / SP;
            ctx.setTransform(k, 0, 0, k, X, Y);
            ctx.drawImage(S.bokeh, -SP / 2, -SP / 2);
          } else if (roundParticles) {
            // ❄️ 冬雪：柔软的圆形雪粒，中心亮、边缘化开
            const k = (this.size * 2 * dpr) / SP;
            ctx.setTransform(k, 0, 0, k, X, Y);
            ctx.drawImage(S.snow, -SP / 2, -SP / 2);
          } else {
            // 实体花瓣 / 叶片：绕长轴翻（节奏同现网的 tumble）× 绕宽轴微微俯仰 × 平面内自旋
            const th = t * this.tumbleSpeed, ph = 0.35 * Math.sin(th * 0.7 + this.offset);
            const ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
            const c = Math.cos(this.angle), s = Math.sin(this.angle);
            // 翻转后的宽轴 ax、长轴 ay、法线 n（再转平面内的 angle）；正交投影取 x / y 分量
            const axx = ct * c, axy = ct * s;
            const ayx = sp * st * c - cp * s, ayy = sp * st * s + cp * c;
            const nx = cp * st * c + sp * s, ny = cp * st * s - sp * c, nz = cp * ct;
            const back = nz < 0 ? 1 : 0, f = back ? -1 : 1;
            const lit = f * (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
            // 光从背后来（这一面背光）时花瓣是透亮的：取上档，而不是最暗那档
            const lv = lit < -0.15 ? 2 : Math.max(0, Math.min(3, Math.round((lit * 0.5 + 0.5) * 3.2)));
            const k = (this.size * dpr) / PS;
            ctx.setTransform(axx * k, axy * k, ayx * k, ayy * k, X, Y);
            ctx.drawImage(back ? S.back[lv] : S.front[lv], -SP / 2, -SP / 2);
          }
        }

        if (nightOp > 0.01) {
          const pulse = (Math.sin(t * 0.001) + 1) / 2;
          const currentSize = (this.isBokeh ? this.size : this.size * 0.8) * (0.8 + 0.4 * pulse);
          ctx.globalAlpha = Math.min(1, this.isBokeh ? nightOp : nightOp * (0.6 + 0.4 * pulse));
          const k = (currentSize * 2 * dpr) / SP;
          ctx.setTransform(k, 0, 0, k, X, Y);
          ctx.drawImage(this.isBokeh ? FIRE_BOKEH : FIREFLY, -SP / 2, -SP / 2);
        }
      }
    }

    // 🌸 数量随视口面积自适应：小屏不挤，大屏不空
    // 下限 20：手机小视口按面积算只有十几颗，旧下限 42 反而让小屏画得比例最重
    const particleCount = Math.min(85, Math.max(20, Math.round((W * H) / 26000)));
    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) particles.push(new Particle(true));

    const render = (now = performance.now()) => {
      if (isPaused) { isRunningRef.current = false; return; }
      // 🧱 被场所的地盖住：等画布淡出（1.5s 过渡）后停画；uncover 时 effect 会再叫醒
      if (coveredRef.current) {
        if (!coveredSince) coveredSince = now;
        if (now - coveredSince > 1600) { isRunningRef.current = false; last = 0; return; }
      } else coveredSince = 0;
      isRunningRef.current = true;
      time = now;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      const k60 = dt * 60;
      last = now;

      const targetNight = isDarkRef.current ? 1 : 0;
      if (reduceMotion) {
        // 静态模式：直接定格到目标状态，只画一帧
        globalNightFactor = targetNight;
        particles.forEach(p => { p.opacity = p.targetOpacity; });
      } else {
        globalNightFactor += (targetNight - globalNightFactor) * ease(0.02, k60);
      }

      // 🍃 双频叠加的呼吸风 + 偶发的温柔阵风；读全站同一只风钟（lib/wind.ts）——
      //   尺牍里竹影摇得最狠的那一阵，这里的樱瓣也正被吹偏。取立方：只有最强的几阵推得动花瓣
      const t = time / 1000;
      const globalWind = breath(t) + gust(t) ** 3 * 0.45;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = globalNightFactor > 0.5 ? 'screen' : 'source-over';

      particles.forEach(p => { p.update(globalNightFactor, globalWind, dt, k60); p.draw(ctx, globalNightFactor); });

      if (reduceMotion) { isRunningRef.current = false; return; }
      animationFrameId = requestAnimationFrame(render);
    };

    renderRef.current = render;
    if (!isPaused) render();

    const handleVisibilityChange = () => {
      if (document.hidden) { isPaused = true; cancelAnimationFrame(animationFrameId); isRunningRef.current = false; }
      else { isPaused = false; last = 0; if (!isRunningRef.current) render(); }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      isPaused = true; cancelAnimationFrame(animationFrameId); isRunningRef.current = false;
    };
  }, []);

  return <canvas ref={canvasRef} className={`absolute inset-0 z-0 w-full h-full pointer-events-none transition-opacity duration-[1500ms] ${covered ? 'opacity-0' : 'opacity-80'}`} />;
};
