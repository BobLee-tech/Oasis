// ✨ Miku 的粒子画布：Canvas2D + 对象池（上限 48）+ 预渲染精灵。
//   画布比舞台四周各外扩一圈（头顶多留，爱心与樱瓣要飞出头顶），pointer-events 关闭。
//   只在有活粒子时才订阅全站 ticker，最后一颗消散后清屏并退订——安静时零开销。
//   emit 接收屏幕坐标（clientX/Y），发射方不必关心画布在哪、舞台此刻缩放了多少。
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { subscribeTicker } from '../../../lib/ticker';
import { ParticlePool, recipe, renderState, type EmitContext, type EmitKind } from './sim';
import { SPRITE_BASE, spriteFor } from './sprites';

export interface ParticleCanvasHandle {
  /** x/y 是屏幕坐标 */
  emit: (kind: EmitKind, ctx: EmitContext) => void;
  clear: () => void;
}

// 外扩边距（px）：头顶的爱心/樱瓣/星屑最远会飞出 ~70px
const PAD = { top: 76, side: 52, bottom: 28 };

// 触屏只发一半：屏幕窄，别喧宾夺主；涟漪与单颗反馈不减
const HALVABLE = new Set<EmitKind>(['hearts', 'notes', 'burst', 'bloom', 'petals', 'sparks', 'dust', 'rain', 'bubbles']);

interface Props {
  width: number;
  height: number;
  reduceMotion: boolean;
  coarsePointer: boolean;
}

export const ParticleCanvas = forwardRef<ParticleCanvasHandle, Props>(function ParticleCanvas(
  { width, height, reduceMotion, coarsePointer },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poolRef = useRef<ParticlePool | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const dprRef = useRef(1);
  const cssW = width + PAD.side * 2;
  const cssH = height + PAD.top + PAD.bottom;
  const sizeRef = useRef({ cssW, cssH });
  sizeRef.current = { cssW, cssH };
  const optsRef = useRef({ reduceMotion, coarsePointer });
  optsRef.current = { reduceMotion, coarsePointer };

  const pool = () => (poolRef.current ??= new ParticlePool());

  const frame = useCallback((_now: number, dt: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const p = pool();
    if (!canvas || !ctx) return;
    const t0 = import.meta.env.DEV ? performance.now() : 0;
    p.step(dt);
    const dpr = dprRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const item of p.items) {
      if (!item.alive) continue;
      const s = renderState(item);
      if (s.alpha <= 0.01 || s.size <= 0.2) continue;
      const k = (s.size / SPRITE_BASE) * dpr;
      const cos = Math.cos(item.rot) * k;
      const sin = Math.sin(item.rot) * k;
      ctx.globalAlpha = s.alpha;
      // 旋转 + 缩放 + 翻面（只缩 x 轴）一次写进变换矩阵
      ctx.setTransform(cos * s.flip, sin * s.flip, -sin, cos, s.x * dpr, s.y * dpr);
      const sprite = spriteFor(item.shape, item.color, dpr);
      // 矩阵已含缩放 k：精灵按 BASE 个单位画，落到屏幕上正好是 size × dpr 个设备像素
      ctx.drawImage(sprite, -SPRITE_BASE / 2, -SPRITE_BASE / 2, SPRITE_BASE, SPRITE_BASE);
    }
    ctx.globalAlpha = 1;
    if (import.meta.env.DEV) {
      const probe = window as unknown as { __mikuParticles?: { ms: number; live: number } };
      probe.__mikuParticles = { ms: performance.now() - t0, live: p.count };
    }
    if (p.count === 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      unsubRef.current?.();
      unsubRef.current = null;
    }
  }, []);

  const wake = useCallback(() => {
    if (!unsubRef.current) unsubRef.current = subscribeTicker(frame);
  }, [frame]);

  useImperativeHandle(ref, () => ({
    emit: (kind, c) => {
      const canvas = canvasRef.current;
      if (!canvas || optsRef.current.reduceMotion) return;
      // 屏幕坐标 → 画布 CSS 坐标；收放缩放动画期间按实际比例换算
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      const k = sizeRef.current.cssW / rect.width;
      const local: EmitContext = { ...c, x: (c.x - rect.left) * k, y: (c.y - rect.top) * k, r: c.r !== undefined ? c.r * k : undefined };
      let spawns = recipe(kind, local);
      if (optsRef.current.coarsePointer && HALVABLE.has(kind) && spawns.length > 1) {
        spawns = spawns.slice(0, Math.ceil(spawns.length / 2));
      }
      const p = pool();
      for (const s of spawns) p.spawn(s);
      wake();
    },
    clear: () => {
      pool().clear();
      const canvas = canvasRef.current;
      canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    },
  }), [wake]);

  // 尺寸 / DPR 变化：只改后备缓冲大小，精灵按 DPR 另有缓存
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    dprRef.current = dpr;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }, [cssW, cssH]);

  useEffect(() => () => { unsubRef.current?.(); unsubRef.current = null; }, []);

  useEffect(() => {
    if (reduceMotion) pool().clear();
  }, [reduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="absolute pointer-events-none"
      style={{ left: -PAD.side, top: -PAD.top, width: cssW, height: cssH }}
    />
  );
});
