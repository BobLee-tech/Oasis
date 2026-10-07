// 🖼 预渲染精灵：每种「形状 × 颜色」只在第一次用到时画一次到离屏 canvas，之后逐帧只做 drawImage。
//   不逐帧画路径、不用 shadowBlur——光晕在这里一次性画成径向渐变烘进贴图。
import type { SpriteShape } from './sim';

/** 精灵的栅格边长（CSS px）；绘制时按粒子尺寸缩放，再乘 DPR 保证高分屏清晰。 */
const BASE = 32;
const cache = new Map<string, HTMLCanvasElement>();

const HEART = new Path2D('M8 12.8C3.6 9.4 1.4 7 1.4 4.6C1.4 2.7 2.9 1.4 4.6 1.4C5.8 1.4 7 2.1 8 3.6C9 2.1 10.2 1.4 11.4 1.4C13.1 1.4 14.6 2.7 14.6 4.6C14.6 7 12.4 9.4 8 12.8Z');
const STAR = new Path2D('M6 0 L7.2 4.8 L12 6 L7.2 7.2 L6 12 L4.8 7.2 L0 6 L4.8 4.8 Z');
const PETAL = new Path2D('M6 0 C9.5 2 11 6 8.5 10 C7.5 11.5 4.5 11.5 3.5 10 C1 6 2.5 2 6 0 Z');

const draw = (ctx: CanvasRenderingContext2D, shape: SpriteShape, color: string) => {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (shape) {
    case 'heart':
      // 线条爱心：与挂坠图标同一支「只描边、不填色」的语言
      ctx.translate(2, 3);
      ctx.scale(1.75, 1.75);
      ctx.lineWidth = 1.4;
      ctx.stroke(HEART);
      break;
    case 'note': {
      ctx.translate(7, 2);
      ctx.scale(2, 2);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(3.2, 12, 2.2, 0, Math.PI * 2);
      ctx.moveTo(5.3, 12); ctx.lineTo(5.3, 2);
      ctx.moveTo(5.3, 2); ctx.quadraticCurveTo(9, 3, 8.6, 6.5);
      ctx.stroke();
      break;
    }
    case 'star':
      // 四角星屑：唯一填色的常规粒子，标记高光瞬间；中心再叠一点白，像真的在闪
      ctx.translate(4, 4);
      ctx.scale(2, 2);
      ctx.fill(STAR);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(6, 6, 1.1, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'petal':
      ctx.translate(4, 3);
      ctx.scale(2, 2.1);
      ctx.globalAlpha = 0.6;
      ctx.fill(PETAL);
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 0.5;
      ctx.stroke(PETAL);
      break;
    case 'ring':
      // 细环 + 一圈烘进去的柔光：落在她青绿色的头发上也看得清（白芯描边与发色拉开明度）
      ctx.beginPath();
      ctx.arc(BASE / 2, BASE / 2, BASE / 2 - 3, 0, Math.PI * 2);
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.6;
      ctx.stroke();
      break;
    case 'glow':
    case 'flake': {
      // 光点：先用白色画出「实心核 + 软外圈」的透明度轮廓，再 source-in 整体染色——
      // 颜色均匀、边缘不发灰；最后补一颗小白芯，像真的在发光。替代运行时 shadowBlur。
      const c = BASE / 2;
      const g = ctx.createRadialGradient(c, c, 0, c, c, c);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.28, 'rgba(255,255,255,0.8)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, BASE, BASE);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, BASE, BASE);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = shape === 'flake' ? 0.9 : 0.55;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(c, c, shape === 'flake' ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'z':
      ctx.font = `italic 26px Georgia, 'Times New Roman', serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('z', BASE / 2, BASE / 2 + 1);
      break;
  }
};

export const spriteFor = (shape: SpriteShape, color: string, dpr: number) => {
  const key = `${shape}|${color}|${dpr}`;
  let sprite = cache.get(key);
  if (sprite) return sprite;
  sprite = document.createElement('canvas');
  sprite.width = sprite.height = Math.ceil(BASE * dpr);
  const ctx = sprite.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
    draw(ctx, shape, color);
  }
  // 曲目色是开放集合，防止长时间听歌把缓存撑大
  if (cache.size > 96) cache.delete(cache.keys().next().value as string);
  cache.set(key, sprite);
  return sprite;
};

/** 精灵的 CSS 边长；粒子 size 是「图形本身」的像素大小，绘制时以此换算缩放。 */
export const SPRITE_BASE = BASE;
