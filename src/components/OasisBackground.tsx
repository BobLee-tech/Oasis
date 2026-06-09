// src/components/OasisBackground.tsx
import React, { useEffect, useRef } from 'react';
import type { BgPhase } from '../types/auth';

interface OasisBackgroundProps {
  phase: BgPhase;
  isDark: boolean; 
}

export const OasisBackground: React.FC<OasisBackgroundProps> = ({ phase, isDark }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const isDarkRef = useRef(isDark); 
  const hasBursted = useRef(false);
  const isRunningRef = useRef(false);
  const renderRef = useRef<() => void>(undefined);

  useEffect(() => {
    phaseRef.current = phase;
    isDarkRef.current = isDark;
    if (renderRef.current && !isRunningRef.current && !document.hidden) {
      renderRef.current();
    }
  }, [phase, isDark]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    hasBursted.current = false;
    let animationFrameId: number;
    let particles: Particle[] = [];
    let ripples: Ripple[] = [];
    let isPaused = document.hidden;
    isRunningRef.current = false;

    const mouse = { x: -1000, y: -1000 };
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    class Particle {
      x: number; y: number; size: number;
      vx: number; vy: number;
      mode: 'dust' | 'sakura';
      opacity: number; targetOpacity: number;
      angle: number; angularVelocity: number; offset: number;

      constructor() {
        this.x = Math.random() * canvas!.width;
        this.y = Math.random() * canvas!.height;
        this.mode = 'dust';
        this.size = Math.random() * 3 + 2;
        this.vx = (Math.random() - 0.5) * 0.3;
        this.vy = (Math.random() - 0.5) * 0.3 - 0.1;
        this.targetOpacity = Math.random() * 0.3 + 0.1;
        this.opacity = this.targetOpacity;
        this.angle = 0;
        this.angularVelocity = 0;
        this.offset = Math.random() * 100;
      }

      burst() {
        this.mode = 'sakura';
        const isNight = isDarkRef.current;
        this.size = Math.random() * 6 + 6;
        this.targetOpacity = Math.random() * 0.4 + 0.3;
        this.opacity = 0; // 渐入
        this.angle = Math.random() * Math.PI;
        this.angularVelocity = (Math.random() - 0.5) * 0.02;
        
        // ✨ 根据昼夜初始化不同的爆发生命力
        if (isNight) {
            this.vx = (Math.random() - 0.5) * 0.5;
            this.vy = -(Math.random() * 0.2 + 0.05); // 极轻微的上升力
        } else {
            this.vx = (Math.random() - 0.5) * 1.5;
            this.vy = Math.random() * 1 + 0.5; // 轻缓下落
        }
      }

      update() {
        const isNight = isDarkRef.current; 

        if (this.mode === 'dust') {
          const dx = mouse.x - this.x;
          const dy = mouse.y - this.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            const force = (150 - dist) / 150;
            this.x -= (dx / dist) * force * 1.5;
            this.y -= (dy / dist) * force * 1.5;
          }
          this.x += Math.sin(Date.now() * 0.0005 + this.offset) * 0.1;
        }

        if (this.mode === 'sakura') {
          if (isNight) {
            // ✨ 流萤/星光模式：极其舒缓的向上漂浮与横向正弦摇摆
            this.vx *= 0.98; // 阻力
            this.vy -= 0.001; // 极小的浮力叠加
            if (this.vy < -0.3) this.vy = -0.3; // 限制最大上升速度
            
            // 缓慢的横向摇摆，如同萤火虫探路
            this.x += Math.sin(Date.now() * 0.0003 + this.offset) * 0.15; 
          } else {
            // ✨ 樱花模式：传统的缓落与旋转
            this.vx *= 0.98;
            if (this.vy < 0) this.vy += 0.02; // 重力加速度
            if (this.vy > 0 && this.vy < 0.6) this.vy += 0.005; // 限制下落极速
            this.x += Math.sin(Date.now() * 0.001 + this.offset) * 0.3;
            this.angle += this.angularVelocity;
          }
        }

        this.x += this.vx;
        this.y += this.vy;

        // 边缘循环重置
        if (this.y > canvas!.height + 50 || this.y < -50 || this.x > canvas!.width + 50 || this.x < -50) {
          this.x = Math.random() * canvas!.width;
          if (this.mode === 'sakura') {
            if (isNight) {
              this.y = canvas!.height + 20; 
              this.vx = (Math.random() - 0.5) * 0.5;
              this.vy = -(Math.random() * 0.1 + 0.05); 
            } else {
              this.y = -20; 
              this.vx = 0;
              this.vy = Math.random() * 0.3 + 0.2; 
            }
          } else {
            this.y = Math.random() * canvas!.height;
          }
        }

        this.opacity += (this.targetOpacity - this.opacity) * 0.02;
      }

      draw(ctx: CanvasRenderingContext2D) {
        const isNight = isDarkRef.current;

        if (this.mode === 'dust') {
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
          ctx.fillStyle = isNight ? `rgba(57, 197, 187, ${this.opacity * 0.3})` : `rgba(57, 197, 187, ${this.opacity})`;
          ctx.fill();
        } else {
          if (isNight) {
            // ✨ 手绘双层流萤：性能远超 shadowBlur，视觉却更通透
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(57, 197, 187, ${this.opacity * 0.15})`; // 外层弥散光
            ctx.fill();

            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * 0.3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity * 0.8})`; // 内核高光
            ctx.fill();
          } else {
            // ✨ 白日樱花
            ctx.fillStyle = `rgba(255, 183, 197, ${this.opacity})`;
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle);
            ctx.beginPath();
            ctx.ellipse(0, 0, this.size / 2, this.size / 4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      }
    }

    // 涟漪类保持精简
    class Ripple {
      x: number; y: number; radius: number; opacity: number; active: boolean;
      constructor(x: number, y: number) {
        this.x = x; this.y = y; this.radius = 0; this.opacity = 0.4; this.active = true;
      }
      update() {
        this.radius += 0.8;
        this.opacity -= 0.005;
        if (this.opacity <= 0) this.active = false;
      }
      draw(ctx: CanvasRenderingContext2D) {
        if (!this.active) return;
        const color = isDarkRef.current ? '57, 197, 187' : '57, 197, 187'; 
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${color}, ${this.opacity})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    for (let i = 0; i < 70; i++) particles.push(new Particle()); // 略微减少粒子数，追求呼吸感

    const render = () => {
      if (isPaused) {
        isRunningRef.current = false;
        return;
      }
      isRunningRef.current = true;
      const currentPhase = phaseRef.current;

      if (currentPhase === 'blooming' && !hasBursted.current) {
        particles.forEach(p => p.burst());
        hasBursted.current = true;
      } else if (currentPhase === 'zen' && !hasBursted.current) {
        particles.forEach(p => p.burst());
        hasBursted.current = true;
      }

      if (['cyber'].includes(currentPhase)) {
        ctx.fillStyle = 'rgba(5, 5, 5, 0.2)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      particles.forEach(p => { p.update(); p.draw(ctx); });
      ripples.forEach(r => { r.update(); r.draw(ctx); });
      ripples = ripples.filter(r => r.active);

      animationFrameId = requestAnimationFrame(render);
    };

    renderRef.current = render;
    if (!isPaused) render();

    const handleMouseMove = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const handleClick = (e: MouseEvent) => {
      if (['blooming', 'zen'].includes(phaseRef.current)) ripples.push(new Ripple(e.clientX, e.clientY));
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        isPaused = true;
        cancelAnimationFrame(animationFrameId);
        isRunningRef.current = false;
      } else {
        isPaused = false;
        if (!isRunningRef.current) render();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      isPaused = true;
      cancelAnimationFrame(animationFrameId);
      isRunningRef.current = false;
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none filter blur-[0.5px] transition-all duration-1000" />;
};