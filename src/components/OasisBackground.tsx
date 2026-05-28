import React, { useEffect, useRef } from 'react';
import type { BgPhase } from '../types/auth'; 

interface OasisBackgroundProps {
  phase: BgPhase;
}

export const OasisBackground: React.FC<OasisBackgroundProps> = ({ phase }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const hasBursted = useRef(false);
  
  // ✅ 新增：物理引擎的心电监护仪
  const isRunningRef = useRef(false);
  const renderRef = useRef<() => void>(undefined);

  // ✅ 修复 1：心脏起搏器。如果状态更新了但引擎被浏览器强行挂起了，主动唤醒它
  useEffect(() => {
    phaseRef.current = phase;
    if (renderRef.current && !isRunningRef.current && !document.hidden) {
      renderRef.current();
    }
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ✅ 修复 2：斩断幽灵缓存。每次 Canvas 挂载，绝对重置爆发状态
    hasBursted.current = false; 

    let animationFrameId: number;
    let particles: Particle[] = [];
    let ripples: Ripple[] = [];
    
    // 初始化时直接读取真实的页面可见性
    let isPaused = document.hidden; 
    isRunningRef.current = false;
    
    const mouse = { x: -1000, y: -1000 };

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // ================= 物理实体 =================

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
        this.opacity = this.targetOpacity; // 出生即拥有光芒
        
        this.angle = 0;
        this.angularVelocity = 0;
        this.offset = Math.random() * 100;
      }

      burst() {
        this.mode = 'sakura';
        const angle = Math.random() * Math.PI * 2;
        const force = Math.random() * 3 + 1; 
        this.vx = Math.cos(angle) * force;
        this.vy = Math.sin(angle) * force;
        this.size = Math.random() * 6 + 8; 
        this.targetOpacity = Math.random() * 0.4 + 0.3; 
        this.opacity = 0.8; // 爆发瞬间光学过曝
        this.angle = Math.random() * Math.PI;
        this.angularVelocity = (Math.random() - 0.5) * 0.05;
      }

      update() {
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
          this.vx *= 0.95; 
          if (this.vy < 0) this.vy += 0.06; 
          if (this.vy > 0 && this.vy < 0.8) this.vy += 0.01; 
          this.x += Math.sin(Date.now() * 0.001 + this.offset) * 0.3; 
          this.angle += this.angularVelocity;
        }

        this.x += this.vx;
        this.y += this.vy;

        if (this.y > canvas!.height + 30 || this.y < -30 || this.x > canvas!.width + 30 || this.x < -30) {
          this.y = this.mode === 'sakura' ? -20 : Math.random() * canvas!.height;
          this.x = Math.random() * canvas!.width;
          if (this.mode === 'sakura') {
            this.vx = 0;
            this.vy = Math.random() * 0.5 + 0.4;
          }
        }

        this.opacity += (this.targetOpacity - this.opacity) * 0.02;
      }

      draw(ctx: CanvasRenderingContext2D) {
        if (this.mode === 'dust') {
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(57, 197, 187, ${this.opacity})`;
          ctx.fill();
        } else {
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

    class Ripple {
      x: number; y: number; radius: number; opacity: number; active: boolean;
      constructor(x: number, y: number) {
        this.x = x; this.y = y; this.radius = 0; this.opacity = 0.5; this.active = true;
      }
      update() {
        this.radius += 0.5; 
        this.opacity -= 0.0025; 
        if (this.opacity <= 0) this.active = false;
      }
      draw(ctx: CanvasRenderingContext2D) {
        if (!this.active) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(57, 197, 187, ${this.opacity})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        if (this.radius > 20) {
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.radius * 0.8, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(57, 197, 187, ${this.opacity * 0.3})`;
          ctx.stroke();
        }
      }
    }

    for (let i = 0; i < 80; i++) particles.push(new Particle()); 

    // ================= 渲染引擎与绝对状态同步 =================
    const render = () => {
      // ✅ 修复 3：绝对防多开保险。如果被要求暂停，立刻标记死亡并退出
      if (isPaused) {
        isRunningRef.current = false;
        return;
      }
      // 标记引擎存活
      isRunningRef.current = true; 

      const currentPhase = phaseRef.current;
      
      if (currentPhase === 'blooming' && !hasBursted.current) {
        particles.forEach(p => p.burst());
        hasBursted.current = true;
      } 
      else if (currentPhase === 'zen' && !hasBursted.current) {
        particles.forEach(p => {
          p.mode = 'sakura';
          p.targetOpacity = Math.random() * 0.4 + 0.3;
          p.opacity = p.targetOpacity; 
          p.size = Math.random() * 6 + 8;
          p.angle = Math.random() * Math.PI;
          p.angularVelocity = (Math.random() - 0.5) * 0.05;
          p.vx = 0;
          p.vy = Math.random() * 0.5 + 0.4;
        });
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

    // 绑定指针，供外部起搏器使用
    renderRef.current = render;

    // 初始点火
    if (!isPaused) {
      render();
    }

    const handleMouseMove = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const handleClick = (e: MouseEvent) => {
      if (['blooming', 'zen'].includes(phaseRef.current)) ripples.push(new Ripple(e.clientX, e.clientY));
    };
    
    // ✅ 修复 4：安全的呼吸机制
    const handleVisibilityChange = () => {
      if (document.hidden) {
        isPaused = true;
        cancelAnimationFrame(animationFrameId);
        isRunningRef.current = false; // 明确宣告引擎休眠
      } else {
        isPaused = false;
        // 只有当引擎确实在休眠时，才重新点火，杜绝双重倍速 Bug
        if (!isRunningRef.current) {
          render();
        }
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

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 z-0 pointer-events-none filter blur-[1px]" 
    />
  );
};