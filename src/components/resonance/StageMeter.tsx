import React, { useEffect, useMemo, useRef } from 'react';
import { getBands, getEnergy, BAND_RESOLUTION } from '../../hooks/useSoundscape';
import { useTicker } from '../../lib/ticker';

interface StageMeterProps {
  color: string;
  isPlaying: boolean;
  /** 采样点数：曲线的控制点密度，不再是 DOM 条的数量 */
  bars?: number;
  active?: boolean;
  compact?: boolean;
}

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** #RRGGBB → [r,g,b]，解析不出来就退回初音绿，绝不让画布变透明。 */
const parseHex = (hex: string): [number, number, number] => {
  const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(hex.trim());
  if (!match) return [0x39, 0xc5, 0xbb];
  const raw = match[1];
  const full = raw.length === 3 ? raw.replace(/./g, c => c + c) : raw;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
};

/** 平滑穿过所有控制点的 Catmull-Rom 曲线，转成 canvas 的三次贝塞尔。 */
const curveThrough = (
  ctx: CanvasRenderingContext2D,
  xs: Float32Array,
  ys: Float32Array,
  count: number,
) => {
  ctx.moveTo(xs[0], ys[0]);
  for (let i = 0; i < count - 1; i += 1) {
    const back = i > 0 ? i - 1 : 0;
    const ahead = i + 2 < count ? i + 2 : count - 1;
    ctx.bezierCurveTo(
      xs[i] + (xs[i + 1] - xs[back]) / 6,
      ys[i] + (ys[i + 1] - ys[back]) / 6,
      xs[i + 1] - (xs[ahead] - xs[i]) / 6,
      ys[i + 1] - (ys[ahead] - ys[i]) / 6,
      xs[i + 1],
      ys[i + 1],
    );
  }
};

/**
 * 🌊 水纹缎带：一条连续曲线取代离散柱条。
 *
 * 隐喻链上的中段——唱片旋转（声源）→ 水面起伏（声形）→ 词句浮出（声痕）。
 * 单个 canvas 绘制：没有布局属性动画、没有 44 次 style 写入，
 * 每帧只有一条路径；连续曲线也天然不会有柱条的阶梯感。
 */
export const StageMeter: React.FC<StageMeterProps> = ({
  color,
  isPlaying,
  bars = 44,
  active = true,
  compact = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const phaseRef = useRef(0);
  const playingRef = useRef(isPlaying);
  const rgb = useMemo(() => parseHex(color), [color]);
  const rgbRef = useRef(rgb);

  const count = Math.max(20, Math.min(BAND_RESOLUTION, bars));
  // 逐帧写入的绘制缓冲，按定义就是可变的——放 ref 而非 useMemo
  const buffersRef = useRef<{
    xs: Float32Array;
    ys: Float32Array;
    mirror: Float32Array;
    count: number;
  } | null>(null);

  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    rgbRef.current = rgb;
  }, [rgb]);

  // 画布像素尺寸跟随 CSS 尺寸与设备像素比，避免高分屏上发虚
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (!rect.width || !rect.height) return;
      sizeRef.current = { width: rect.width, height: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useTicker((_now, dt) => {
    const canvas = canvasRef.current;
    const { width, height, dpr } = sizeRef.current;
    if (!canvas || !width || !height) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const still =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const spectrum = getBands();
    if (!buffersRef.current || buffersRef.current.count !== count) {
      buffersRef.current = {
        xs: new Float32Array(count),
        ys: new Float32Array(count),
        mirror: new Float32Array(count),
        count,
      };
    }
    const { xs, ys, mirror } = buffersRef.current;
    const surface = height * 0.6;      // 静水面
    const ceiling = height * 0.5;      // 波峰可用的最大振幅
    const [r, g, b] = rgbRef.current;
    const tint = (alpha: number) => `rgba(${r},${g},${b},${alpha})`;

    if (!still) phaseRef.current += dt * 0.55;
    const phase = phaseRef.current;

    // 频带 → 控制点：重采样 + 边缘收束 + 无声时的静水微澜
    let sum = 0;
    for (let i = 0; i < count; i += 1) {
      const t = count > 1 ? i / (count - 1) : 0;
      const at = t * (BAND_RESOLUTION - 1);
      const index = Math.floor(at);
      const a = spectrum[index] ?? 0;
      const level = a + ((spectrum[index + 1] ?? a) - a) * (at - index);
      sum += level;

      // 两端收束，缎带不会被容器边缘硬生生切断
      const edge = Math.min(t, 1 - t) / 0.16;
      const taper = edge >= 1 ? 1 : edge * edge * (3 - 2 * edge);

      xs[i] = t * width;
      mirror[i] = Math.pow(clamp01(level), 0.85) * taper;
    }

    // 相邻频带做一次 1-2-1 平滑：没有它，曲线是一把梳齿；有了它才是一片水面
    let previous = mirror[0];
    for (let i = 1; i < count - 1; i += 1) {
      const current = mirror[i];
      mirror[i] = (previous + current * 2 + mirror[i + 1]) * 0.25;
      previous = current;
    }

    // 整体安静时叠一层极缓的驻波：暂停不等于死寂
    const quiet = 1 - clamp01((sum / count) * 6);
    if (quiet > 0.01 && !still) {
      for (let i = 0; i < count; i += 1) {
        const t = count > 1 ? i / (count - 1) : 0;
        const edge = Math.min(t, 1 - t) / 0.16;
        const taper = edge >= 1 ? 1 : edge * edge * (3 - 2 * edge);
        const wave =
          Math.sin(t * Math.PI * 3 + phase) * 0.5 + Math.sin(t * Math.PI * 5.3 - phase * 0.7) * 0.5;
        mirror[i] += quiet * 0.05 * wave * taper;
      }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // 水面线：两端淡出，作为整条缎带的基准
    const rule = ctx.createLinearGradient(0, 0, width, 0);
    rule.addColorStop(0, tint(0));
    rule.addColorStop(0.5, tint(0.16));
    rule.addColorStop(1, tint(0));
    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, surface + 0.5);
    ctx.lineTo(width, surface + 0.5);
    ctx.stroke();

    // 倒影：镜像到水面下方，压扁并淡化
    ctx.beginPath();
    for (let i = 0; i < count; i += 1) ys[i] = surface + mirror[i] * ceiling * 0.34;
    curveThrough(ctx, xs, ys, count);
    ctx.lineTo(width, surface);
    ctx.lineTo(0, surface);
    ctx.closePath();
    const echo = ctx.createLinearGradient(0, surface, 0, height);
    echo.addColorStop(0, tint(0.14));
    echo.addColorStop(1, tint(0));
    ctx.fillStyle = echo;
    ctx.fill();

    // 主体：水面之上的缎带
    for (let i = 0; i < count; i += 1) ys[i] = surface - mirror[i] * ceiling;
    ctx.beginPath();
    curveThrough(ctx, xs, ys, count);
    ctx.lineTo(width, surface);
    ctx.lineTo(0, surface);
    ctx.closePath();
    const body = ctx.createLinearGradient(0, surface - ceiling, 0, surface);
    body.addColorStop(0, tint(0.34));
    body.addColorStop(1, tint(0.04));
    ctx.fillStyle = body;
    ctx.fill();

    // 波峰的那道亮边：鼓点上轻轻发光
    const beat = playingRef.current ? getEnergy().beat : 0;
    ctx.beginPath();
    curveThrough(ctx, xs, ys, count);
    ctx.strokeStyle = tint(playingRef.current ? 0.9 : 0.42);
    ctx.lineWidth = compact ? 1.3 : 1.6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (!still && beat > 0.02) {
      ctx.shadowBlur = 4 + beat * 12;
      ctx.shadowColor = tint(0.55);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, active);

  return (
    <div className={`relative w-full ${compact ? 'h-9' : 'h-20'}`}>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="block h-full w-full"
        style={{ transition: 'opacity 600ms ease' }}
      />
    </div>
  );
};
