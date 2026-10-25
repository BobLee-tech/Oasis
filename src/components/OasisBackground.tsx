// src/components/OasisBackground.tsx
import React, { useEffect, useRef } from 'react';
import type { BgPhase } from '../types/auth';
import { currentSeason, type Season } from '../lib/solarTerms';
import { breath, gust } from '../lib/wind';

interface OasisBackgroundProps { phase: BgPhase; isDark: boolean; }

export const OasisBackground: React.FC<OasisBackgroundProps> = ({ phase, isDark }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const isDarkRef = useRef(isDark);
  const isRunningRef = useRef(false);
  const renderRef = useRef<() => void>(undefined);

  useEffect(() => {
    phaseRef.current = phase; isDarkRef.current = isDark;
    if (renderRef.current && !isRunningRef.current && !document.hidden) renderRef.current();
  }, [phase, isDark]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true }); if (!ctx) return;

    let animationFrameId: number;
    let isPaused = document.hidden;
    isRunningRef.current = false;

    // ♿ 晕动症友好：偏好减少动效时只渲染一帧静态画面
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let globalNightFactor = isDarkRef.current ? 1 : 0;
    let time = 0;

    const resizeCanvas = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resizeCanvas(); window.addEventListener('resize', resizeCanvas);

    // 🍃 季节流转：春樱 / 夏叶 / 秋枫 / 冬雪，各有色板与飘落性格，复用同一套翻飞物理。
    const season: Season = currentSeason();
    const SEASON_PALETTES: Record<Season, { light: string; deep: string }[]> = {
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
    const PETAL_TONES = SEASON_PALETTES[season];
    // 冬雪为柔软圆点（无花瓣翻转），其余季节为翻飞的花瓣 / 叶片
    const roundParticles = season === 'winter';
    // 飘落速度性格：雪最缓、樱瓣轻盈、秋叶稍沉
    const fallScale = season === 'winter' ? 0.55 : season === 'autumn' ? 1.15 : 1;

    class Particle {
      x = 0; y = 0;
      z: number;                 // 景深 0.2~1
      baseSize: number; size: number;
      vx = 0; vy = 0;
      opacity = 0; targetOpacity: number;
      offset: number;
      isBokeh: boolean;          // 远景虚化光斑
      // 花瓣形态参数
      angle: number;             // 朝向
      spin: number;              // 自旋速度
      tumbleSpeed: number;       // 翻飞频率（绕长轴翻转）
      tone: { light: string; deep: string };

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
        this.tone = PETAL_TONES[Math.floor(Math.random() * PETAL_TONES.length)];

        this.respawn(scatter);
      }

      respawn(scatter: boolean) {
        this.x = Math.random() * canvas!.width;
        this.opacity = 0;
        if (scatter) {
          // 初始铺满全屏，避免开场一片空白
          this.y = Math.random() * canvas!.height;
        } else if (globalNightFactor > 0.5) {
          this.y = canvas!.height + 40;        // 夜晚星萤自下而上
        } else {
          this.y = -40 - Math.random() * 80;   // 白天花瓣自上而下
        }
        this.vx = 0;
        this.vy = globalNightFactor > 0.5 ? -(Math.random() * 0.12 + 0.06) : (Math.random() * 0.2 + 0.15);
      }

      update(nightFactor: number, wind: number) {
        const t = time + this.offset;

        if (nightFactor < 0.5) {
          // 🌸 白天：落叶式翻飞物理
          // 翻转相位：花瓣绕长轴翻转，翻转到侧面时下落加快、正面时受风兜住变慢
          const tumble = Math.sin(t * this.tumbleSpeed);
          const fallBase = (this.isBokeh ? 0.08 : (0.22 + 0.1 * this.z)) * fallScale;
          // 雪缓缓飘、少翻飞；花瓣 / 叶片保留原有的翻飞节奏
          const targetVy = roundParticles ? fallBase : fallBase * (0.65 + 0.35 * Math.abs(tumble));
          // 横向：全局风 + 个体摇曳（与翻转联动，飘出 S 形轨迹）
          const sway = Math.sin(t * 0.0006) * 0.35 * this.z;
          const targetVx = (wind * (0.6 + this.z) + sway) * (this.isBokeh ? 0.3 : 1);

          this.vx += (targetVx - this.vx) * 0.02;
          this.vy += (targetVy - this.vy) * 0.02;
          this.angle += this.spin + tumble * 0.004;
        } else {
          // 🌌 夜晚：星萤极缓上浮 + 微弱布朗漂移
          const drift = Math.sin(t * 0.0004) * 0.06 * this.z;
          const rise = -(0.05 + 0.06 * this.z);
          this.vx += (wind * 0.3 * this.z + drift - this.vx) * 0.015;
          this.vy += (rise - this.vy) * 0.015;
        }

        this.x += this.vx; this.y += this.vy;

        const m = 120;
        if (this.y > canvas!.height + m || this.y < -m) {
          this.z = Math.random() * 0.8 + 0.2;
          this.size = this.baseSize * this.z;
          this.respawn(false);
        }
        // 左右出界：从另一侧温柔回卷，而不是凭空消失
        if (this.x > canvas!.width + m) this.x = -m;
        else if (this.x < -m) this.x = canvas!.width + m;

        this.opacity += (this.targetOpacity - this.opacity) * 0.012;
      }

      // 经典五瓣樱花的单片花瓣：圆润基部 + 顶端浅凹槽
      tracePetal(ctx: CanvasRenderingContext2D, s: number) {
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.bezierCurveTo(s * 0.85, -s * 0.55, s * 0.65, s * 0.45, s * 0.18, s * 0.82);
        ctx.lineTo(0, s * 0.62); // 顶端凹槽
        ctx.lineTo(-s * 0.18, s * 0.82);
        ctx.bezierCurveTo(-s * 0.65, s * 0.45, -s * 0.85, -s * 0.55, 0, -s);
        ctx.closePath();
      }

      draw(ctx: CanvasRenderingContext2D, nightFactor: number) {
        if (this.opacity < 0.01) return;

        const dayOp = (1 - nightFactor) * this.opacity;
        const nightOp = nightFactor * this.opacity;
        const t = time + this.offset;

        if (dayOp > 0.01) {
          if (this.isBokeh) {
            // 远景：水蜜桃柔光斑
            const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
            grad.addColorStop(0, `rgba(${this.tone.deep}, ${dayOp * 0.8})`);
            grad.addColorStop(1, `rgba(${this.tone.deep}, 0)`);
            ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = grad; ctx.fill();
          } else if (roundParticles) {
            // ❄️ 冬雪：柔软的圆形雪粒，中心亮、边缘化开
            const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
            grad.addColorStop(0, `rgba(${this.tone.light}, ${dayOp})`);
            grad.addColorStop(0.6, `rgba(${this.tone.deep}, ${dayOp * 0.75})`);
            grad.addColorStop(1, `rgba(${this.tone.deep}, 0)`);
            ctx.beginPath(); ctx.arc(this.x, this.y, this.size * 0.9, 0, Math.PI * 2);
            ctx.fillStyle = grad; ctx.fill();
          } else {
            // 实体花瓣 / 叶片：随翻转压扁横轴，模拟三维翻飞
            const tumble = Math.cos(t * this.tumbleSpeed);
            const squash = 0.45 + 0.55 * Math.abs(tumble);
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle);
            ctx.scale(squash, 1);
            const grad = ctx.createLinearGradient(0, -this.size, 0, this.size);
            grad.addColorStop(0, `rgba(${this.tone.light}, ${dayOp})`);
            grad.addColorStop(1, `rgba(${this.tone.deep}, ${dayOp * 0.9})`);
            this.tracePetal(ctx, this.size);
            ctx.fillStyle = grad; ctx.fill();
            ctx.restore();
          }
        }

        if (nightOp > 0.01) {
          const pulse = (Math.sin(t * 0.001) + 1) / 2;
          const currentSize = (this.isBokeh ? this.size : this.size * 0.8) * (0.8 + 0.4 * pulse);
          const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, currentSize);
          if (this.isBokeh) {
            grad.addColorStop(0, `rgba(57, 197, 187, ${nightOp * 0.5})`);
            grad.addColorStop(1, 'rgba(57, 197, 187, 0)');
          } else {
            grad.addColorStop(0, `rgba(255, 255, 255, ${nightOp * (0.6 + 0.4 * pulse)})`);
            grad.addColorStop(0.2, `rgba(57, 197, 187, ${nightOp * (0.4 + 0.2 * pulse)})`);
            grad.addColorStop(1, 'rgba(57, 197, 187, 0)');
          }
          ctx.beginPath(); ctx.arc(this.x, this.y, currentSize, 0, Math.PI * 2);
          ctx.fillStyle = grad; ctx.fill();
        }
      }
    }

    // 🌸 数量随视口面积自适应：小屏不挤，大屏不空
    // 下限 20：手机小视口按面积算只有十几颗，旧下限 42 反而让小屏画得比例最重
    const particleCount = Math.min(85, Math.max(20, Math.round((canvas.width * canvas.height) / 26000)));
    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) particles.push(new Particle(true));

    const render = () => {
      if (isPaused) { isRunningRef.current = false; return; }
      isRunningRef.current = true;
      time = performance.now();

      const targetNight = isDarkRef.current ? 1 : 0;
      if (reduceMotion) {
        // 静态模式：直接定格到目标状态，只画一帧
        globalNightFactor = targetNight;
        particles.forEach(p => { p.opacity = p.targetOpacity; });
      } else {
        globalNightFactor += (targetNight - globalNightFactor) * 0.02;
      }

      // 🍃 双频叠加的呼吸风 + 偶发的温柔阵风；读全站同一只风钟（lib/wind.ts）——
      //   尺牍里竹影摇得最狠的那一阵，这里的樱瓣也正被吹偏。取立方：只有最强的几阵推得动花瓣
      const t = time / 1000;
      const globalWind = breath(t) + gust(t) ** 3 * 0.45;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = globalNightFactor > 0.5 ? 'screen' : 'source-over';

      particles.forEach(p => { p.update(globalNightFactor, globalWind); p.draw(ctx, globalNightFactor); });

      if (reduceMotion) { isRunningRef.current = false; return; }
      animationFrameId = requestAnimationFrame(render);
    };

    renderRef.current = render;
    if (!isPaused) render();

    const handleVisibilityChange = () => {
      if (document.hidden) { isPaused = true; cancelAnimationFrame(animationFrameId); isRunningRef.current = false; }
      else { isPaused = false; if (!isRunningRef.current) render(); }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      isPaused = true; cancelAnimationFrame(animationFrameId); isRunningRef.current = false;
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-[1500ms] opacity-80" />;
};
