// 🌊 涟漪揭页（docs/music-ripple-notes-demo.html）：内页一直在水下，涟漪只是让它被看见。
//
//   · 波前半径由共用 ticker 推进，直接写 clip-path 与各块 transform（规矩 3：不进 framer）
//   · 每块 [data-ripple] 在波前越过它后才浮出、沿离心方向落定；scope 里的 [data-ripple-push]
//     在波前到达前被推开一下
//   · 波的明暗由一个全屏三角形的着色器画：主波列 + 跑在前面的毛细细纹，光从左上来
//   · 中途再点从当前半径原路折返；收回走完在原点溅一小圈；最后一帧 = 静止态（规矩 4）
//   · plain（氛围关 / 减弱动态）：只做 200ms 交叉淡化
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { subscribeTicker } from '../../lib/ticker';
import {
  RIPPLE,
  advance,
  easeOpen,
  pushOf,
  reachOf,
  retarget,
  revealOf,
  waveAmplitude,
  type RippleMotion,
} from '../../lib/ripple';
import { createFullscreenProgram, hexToRgb, type FullscreenProgram } from '../../lib/gl';

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uSize;
uniform float uScale;
uniform vec2 uO;
uniform float uR, uA, uDir, uR2, uA2;
uniform vec3 uTint;
uniform float uDark;
out vec4 o;

float train(float r, float R, float dir, float lam) {
  float d = (r - R) * dir;                        // d > 0：波前前方
  float behind = exp(-pow((d + lam * 0.6) / (lam * 0.95), 2.0)) * cos(6.2831853 * d / lam);
  float ahead = smoothstep(-lam * 0.25, 0.0, d) * exp(-max(d, 0.0) / (lam * 0.5))
              * 0.3 * cos(6.2831853 * d / (lam * 0.32));
  return behind + ahead;                          // 主波列 + 毛细细纹（短波更快，跑在外圈）
}

float height(vec2 p) {
  float r = length(p - uO);
  return uA * train(r, uR, uDir, ${RIPPLE.lambda.toFixed(1)}) + uA2 * train(r, uR2, 1.0, ${RIPPLE.splashLambda.toFixed(1)});
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uScale;
  float r = length(p - uO);
  if ((uA < 0.002 || abs(r - uR) > 150.0) && (uA2 < 0.002 || abs(r - uR2) > 70.0)) { o = vec4(0.0); return; }
  vec2 g = vec2(height(p + vec2(1, 0)) - height(p - vec2(1, 0)), height(p + vec2(0, 1)) - height(p - vec2(0, 1))) * 0.5;
  vec3 n = normalize(vec3(-g * 7.0, 1.0));
  vec3 L = normalize(vec3(-0.55, -0.7, 0.6));     // 左上光，与全站一致
  float s = dot(n, L) - L.z;
  float spec = pow(max(dot(reflect(-L, n), vec3(0, 0, 1)), 0.0), 60.0);
  float hi = clamp(max(s, 0.0) * mix(1.4, 2.2, uDark) + spec * mix(0.5, 0.9, uDark), 0.0, 1.0);
  float sh = clamp(max(-s, 0.0) * mix(1.5, 1.7, uDark), 0.0, 1.0);
  vec3 hc = mix(vec3(1.0), uTint, 0.35);
  vec3 sc = mix(vec3(0.04, 0.06, 0.14), uTint * 0.2, 0.25);
  float a = hi + sh * (1.0 - hi);
  o = vec4((hc * hi + sc * sh * (1.0 - hi)) * 0.92, a * 0.92);
}`;

interface Piece {
  el: HTMLElement;
  d: number;
  ux: number;
  uy: number;
}

interface RippleRevealProps {
  open: boolean;
  /** 波从这个元素的中心起；收回回到同一个点。父组件在切换 open 之前写好它 */
  originRef: React.RefObject<HTMLElement | null>;
  color: string;
  /** 动态氛围关 / 减弱动态：只做交叉淡化 */
  plain: boolean;
  onClose: () => void;
  /** 被波前推开的旧内容在这里找 [data-ripple-push] */
  scopeRef?: React.RefObject<HTMLElement | null>;
  className?: string;
  fxClassName?: string;
  children: React.ReactNode;
}

export const RippleReveal: React.FC<RippleRevealProps> = ({
  open,
  originRef,
  color,
  plain,
  onClose,
  scopeRef,
  className = '',
  fxClassName = '',
  children,
}) => {
  const layerRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const programRef = useRef<FullscreenProgram | null | undefined>(undefined);
  const colorRef = useRef(color);
  useEffect(() => { colorRef.current = color; }, [color]);

  const state = useRef({
    motion: { p: 0, from: 0, to: 0, startedAt: 0, durationMs: 1 } as RippleMotion,
    running: false,
    ox: 0,
    oy: 0,
    reach: 1,
    width: 0,
    height: 0,
    pieces: [] as Piece[],
    pushes: [] as Piece[],
    splashAt: -1,
    unsubscribe: null as (() => void) | null,
    fadeTimer: 0,
    mounted: false,
  });

  const drawFx = (r: number, a1: number, r2: number, a2: number, opening: boolean) => {
    const canvas = fxRef.current;
    const program = programRef.current;
    if (!canvas || !program) return;
    const { gl, uniforms: u } = program;
    if (a1 < 0.002 && a2 < 0.002) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    const s = state.current;
    gl.uniform2f(u.uSize, canvas.width, canvas.height);
    gl.uniform1f(u.uScale, canvas.width / Math.max(1, s.width));
    gl.uniform2f(u.uO, s.ox, s.oy);
    gl.uniform1f(u.uR, r);
    gl.uniform1f(u.uA, a1);
    gl.uniform1f(u.uDir, opening ? 1 : -1);
    gl.uniform1f(u.uR2, r2);
    gl.uniform1f(u.uA2, a2);
    gl.uniform3f(u.uTint, ...hexToRgb(colorRef.current));
    gl.uniform1f(u.uDark, document.documentElement.classList.contains('dark') ? 1 : 0);
    program.draw();
  };

  const measure = () => {
    const s = state.current;
    const layer = layerRef.current;
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    s.width = rect.width;
    s.height = rect.height;
    const origin = originRef.current?.getBoundingClientRect();
    s.ox = origin ? origin.left + origin.width / 2 - rect.left : rect.width / 2;
    s.oy = origin ? origin.top + origin.height / 2 - rect.top : rect.height / 2;
    s.reach = reachOf(s.ox, s.oy, rect.width, rect.height);
    const toPiece = (el: HTMLElement): Piece => {
      const box = el.getBoundingClientRect();
      const dx = box.left + box.width / 2 - rect.left - s.ox;
      const dy = box.top + box.height / 2 - rect.top - s.oy;
      const d = Math.hypot(dx, dy) || 1;
      return { el, d, ux: dx / d, uy: dy / d };
    };
    s.pieces = Array.from(layer.querySelectorAll<HTMLElement>('[data-ripple]')).map(toPiece);
    s.pushes = Array.from(scopeRef?.current?.querySelectorAll<HTMLElement>('[data-ripple-push]') ?? []).map(toPiece);

    const canvas = fxRef.current;
    if (canvas) {
      const dpr = Math.min(window.matchMedia('(pointer: coarse)').matches ? 1.5 : 2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      if (programRef.current === undefined) programRef.current = createFullscreenProgram(canvas, FRAGMENT);
    }
  };

  const settle = (opened: boolean) => {
    const s = state.current;
    const layer = layerRef.current;
    s.pieces.forEach(piece => { piece.el.style.opacity = ''; piece.el.style.transform = ''; });
    s.pushes.forEach(piece => { piece.el.style.transform = ''; });
    if (!layer) return;
    if (opened) {
      layer.style.clipPath = 'none';
    } else {
      layer.style.visibility = 'hidden';
      layer.style.clipPath = 'circle(0px at 0px 0px)';
    }
  };

  const tick = (now: number) => {
    const s = state.current;
    const layer = layerRef.current;
    let r = 0;
    let a1 = 0;
    const opening = s.motion.to === 1;
    if (s.running && layer) {
      const step = advance(s.motion, now);
      s.motion.p = step.p;
      r = step.p * s.reach;
      layer.style.clipPath = `circle(${Math.max(0, r - RIPPLE.clipLag).toFixed(1)}px at ${s.ox.toFixed(1)}px ${s.oy.toFixed(1)}px)`;
      for (const piece of s.pieces) {
        const k = revealOf(r, piece.d);
        const drift = (1 - k) * RIPPLE.contentDrift;
        piece.el.style.opacity = k.toFixed(3);
        piece.el.style.transform = `translate3d(${(piece.ux * drift).toFixed(2)}px,${(piece.uy * drift).toFixed(2)}px,0)`;
      }
      for (const piece of s.pushes) {
        const k = pushOf(r, piece.d);
        piece.el.style.transform = k > 0.002
          ? `translate3d(${(piece.ux * k * RIPPLE.push).toFixed(2)}px,${(piece.uy * k * RIPPLE.push).toFixed(2)}px,0)`
          : '';
      }
      a1 = waveAmplitude(r, step.u, opening);
      if (step.done) {
        s.running = false;
        settle(opening);
        if (!opening) s.splashAt = now;
      }
    }
    let r2 = 0;
    let a2 = 0;
    if (s.splashAt >= 0) {
      const v = Math.min(1, (now - s.splashAt) / RIPPLE.splashMs);
      r2 = 12 + 110 * easeOpen(v);
      a2 = 0.55 * (1 - v);
      if (v >= 1) s.splashAt = -1;
    }
    drawFx(r, a1, r2, a2, opening);
    if (!s.running && s.splashAt < 0) {
      s.unsubscribe?.();
      s.unsubscribe = null;
    }
  };

  useLayoutEffect(() => {
    const s = state.current;
    const layer = layerRef.current;
    if (!layer) return;
    if (!s.mounted) {
      s.mounted = true;
      layer.style.visibility = open ? 'visible' : 'hidden';
      layer.style.clipPath = open ? 'none' : 'circle(0px at 0px 0px)';
      s.motion.p = open ? 1 : 0;
      return;
    }
    // 已经停在目标状态就什么都不做（开发模式 StrictMode 会把这个 effect 多跑一遍，
    // 否则会对着空原点“合上”一次，在舞台中央溅一圈水）
    if (!s.running && s.motion.p === (open ? 1 : 0)) return;
    window.clearTimeout(s.fadeTimer);

    if (plain) {
      s.unsubscribe?.();
      s.unsubscribe = null;
      s.running = false;
      settle(true);
      layer.style.visibility = 'visible';
      layer.style.transition = 'opacity 200ms cubic-bezier(.2,0,0,1)';
      layer.style.opacity = open ? '0' : '1';
      void layer.offsetWidth;
      layer.style.opacity = open ? '1' : '0';
      s.motion.p = open ? 1 : 0;
      if (!open) {
        s.fadeTimer = window.setTimeout(() => {
          layer.style.visibility = 'hidden';
          layer.style.transition = '';
        }, 220);
      }
      return;
    }

    layer.style.transition = '';
    layer.style.opacity = '';
    // 静止时测量（此刻各块没有 transform）；折返时沿用起步时的测量与原点
    if (!s.running) {
      layer.style.visibility = 'visible';
      const wasOpen = s.motion.p >= 1;
      if (!wasOpen) layer.style.clipPath = 'circle(0px at 0px 0px)';
      measure();
    }
    s.motion = retarget(s.motion, open, performance.now());
    s.running = true;
    s.splashAt = -1;
    if (!s.unsubscribe) s.unsubscribe = subscribeTicker(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只响应开合；其余都从 ref 读
  }, [open]);

  // 打开：焦点落到内页的「合上」控件；合上：焦点若还在内页里，交还给起点
  useEffect(() => {
    const layer = layerRef.current;
    if (open) {
      layer?.querySelector<HTMLElement>('[data-ripple-focus]')?.focus({ preventScroll: true });
      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
    if (layer?.contains(document.activeElement)) originRef.current?.focus({ preventScroll: true });
    return undefined;
  }, [open, onClose, originRef]);

  useEffect(() => () => {
    const s = state.current;
    s.unsubscribe?.();
    window.clearTimeout(s.fadeTimer);
    programRef.current?.dispose();
  }, []);

  return (
    <>
      <div ref={layerRef} className={className} inert={!open}>
        {children}
      </div>
      <canvas ref={fxRef} aria-hidden className={`pointer-events-none ${fxClassName}`} />
    </>
  );
};
