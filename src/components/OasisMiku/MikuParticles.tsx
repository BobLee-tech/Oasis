// 🎐 摸摸头冒爱心、唱歌飘音符——纯 DOM 粒子层，刻意不进 Pixi 画布：
//   画布只有 176×272，爱心飘出头顶就被裁掉了。与站内点击涟漪同栈（Framer Motion + 绝对定位），
//   只动 opacity/transform，合成器友好；由 useMikuBrain 通过 ref 调用 emit() 发射，自己不猜时机。
//
//   每颗粒子的运动路径统一是「起点 → 中段 → 终点」三个关键帧（正弦漂移/重力弧线，不是直线位移），
//   配一条自己的 times 分段；opacity 另外单独给一条更长尾的溶解曲线，而不是均匀渐隐——真实的烟/
//   花瓣/泡泡消失都是「快显、慢隐」，不是对称的。
//
//   缓动特意没有沿用站内 UI 转场那条 [0.16,1,0.3,1]（前段冲刺、后段长尾的 easeOutExpo）——那适合
//   按钮/弹窗这类「响应要快」的交互反馈，但粒子是漂浮物，用它会显得「嗖地弹出去、然后愣在半空」。
//   这里换成对称的 easeInOutSine 型曲线，起落都慢，读起来是「悠悠地浮起、悠悠地隐去」；时长也整体
//   拉长了一截，别让人还没看清就已经飞走。
import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ParticleEvent, ParticleKind } from './particleTypes';

export interface MikuParticlesHandle {
  emit: (event: ParticleEvent) => void;
}

interface Particle {
  id: number;
  kind: ParticleKind;
  left: number; // 出生点，% of 容器宽
  top: number; // 出生点，% of 容器高
  x: [number, number, number]; // 三关键帧水平位移，px（相对出生点）
  y: [number, number, number]; // 三关键帧垂直位移，px（负数 = 向上）
  rotate: [number, number, number]; // 三关键帧旋转角，deg
  scale: [number, number, number]; // 三关键帧缩放
  times: [number, number, number]; // 上面四条曲线共用的时间分段（0..1）
  size: number; // px
  hue: 0 | 1; // burst 双色交替用
  delay: number; // s
  duration: number; // s
}

// 同屏粒子硬上限：命中时直接丢弃这一次新发射（不排队、不挤掉正在飞的旧粒子），
// 避免连续摸头/连续切歌时糊成一片，也保住移动端的帧率。12 是给单次最大批次
// （burst 10 颗）留出常态余量，不是「所有批次加起来绝不超过 12」的硬保证——
// 一次里程碑级 burst 撞上残留的旧粒子会短暂溢出几颗，无伤大雅
const MAX_PARTICLES = 12;
// 溶解曲线：前 10% 内淡入到底，中段大段停留，最后 50% 慢慢溶掉——比对称淡入淡出更像「消散」，
// 尾段拉得比第一版更长，溶解得更从容
const DISSOLVE_TIMES: number[] = [0, 0.1, 0.5, 1];
// 对称、起落都慢的缓动——悠悠地浮起，悠悠地隐去，不是「嗖地弹出去再愣住」
const EASE_DRIFT = [0.37, 0, 0.63, 1] as const;
let uid = 0;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

// 线条爱心：与站内 PendantIcon 同一支「只描边、不填色」的极简语言
const HeartGlyph = () => (
  <path d="M8 12.8C3.6 9.4 1.4 7 1.4 4.6C1.4 2.7 2.9 1.4 4.6 1.4C5.8 1.4 7 2.1 8 3.6C9 2.1 10.2 1.4 11.4 1.4C13.1 1.4 14.6 2.7 14.6 4.6C14.6 7 12.4 9.4 8 12.8Z" />
);

// 线条八分音符：符头（描边圆）+ 符干 + 符尾
const NoteGlyph = () => (
  <>
    <circle cx="3.2" cy="12" r="2.2" />
    <line x1="5.3" y1="12" x2="5.3" y2="2" />
    <path d="M5.3 2 Q9 3 8.6 6.5" />
  </>
);

// 四角星尘：唯一一个走「填色」而非描边的常规粒子，标记它是里程碑级的高光瞬间，与日常反馈拉开区分度
const SparkleGlyph = () => (
  <path d="M6 0 L7.2 4.8 L12 6 L7.2 7.2 L6 12 L4.8 7.2 L0 6 L4.8 4.8 Z" />
);

// 樱瓣：唯一会「翻面」的粒子（靠 scale 关键帧模拟），半透明填色，专留给拍满百次这一档最郑重的里程碑，
// 与四角星尘的「爆」区分开——花瓣是「落下来」的那种郑重，不是「炸开」
const PetalGlyph = () => (
  <path
    d="M6 0 C9.5 2 11 6 8.5 10 C7.5 11.5 4.5 11.5 3.5 10 C1 6 2.5 2 6 0 Z"
    fill="#FFB7C5" fillOpacity="0.55" stroke="#FFB7C5" strokeOpacity="0.35" strokeWidth="0.6"
  />
);

const makeHearts = (count: number): Particle[] =>
  Array.from({ length: count }, (_, i) => {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const a = rand(6, 10) * dir;
    const dyFinal = -rand(56, 76);
    const r = rand(8, 14) * dir;
    return {
      id: uid++, kind: 'hearts' as const, left: rand(30, 70), top: 8,
      x: [0, a, rand(-6, 6)], y: [0, dyFinal * 0.6, dyFinal], rotate: [0, r, r * 0.3],
      scale: [0.4, 1, 0.92], times: [0, 0.4, 1],
      size: rand(10, 14), hue: 0, delay: i * 0.18, duration: rand(4.5, 6),
    };
  });

// notes：从头部两侧冒出，往外侧漂
const makeNotes = (count: number): Particle[] =>
  Array.from({ length: count }, (_, i) => {
    const fromLeft = Math.random() < 0.5;
    const dir = fromLeft ? -1 : 1;
    const dyFinal = -rand(48, 64);
    return {
      id: uid++, kind: 'notes' as const, left: fromLeft ? rand(10, 20) : rand(80, 90), top: 18,
      x: [0, dir * rand(4, 7), dir * rand(8, 14)], y: [0, dyFinal * 0.6, dyFinal],
      rotate: [0, dir * 8, dir * 4], scale: [0.5, 1, 0.9], times: [0, 0.4, 1],
      size: rand(11, 15), hue: 0, delay: i * 0.22, duration: rand(5, 6.5),
    };
  });

const GOLDEN_ANGLE_DEG = 137.50776; // 黄金角：任意前缀子集都分布均匀，比等分圆周更少「排队感」
const BURST_COUNT = 8;

const makeBurst = (): Particle[] =>
  Array.from({ length: BURST_COUNT }, (_, i) => {
    const angle = ((i * GOLDEN_ANGLE_DEG + rand(-6, 6)) * Math.PI) / 180;
    const radius = rand(34, 64);
    const dxFinal = Math.cos(angle) * radius;
    const dyPeak = Math.sin(angle) * radius * 0.7; // 压扁成椭圆轨迹，贴合挂坠容器的宽高比
    const fall = rand(8, 14); // 升起后再微坠一点，是重力，不是纯粹的径向飞散
    const rot = (angle * 180) / Math.PI;
    return {
      id: uid++, kind: 'burst' as const, left: 50, top: 40,
      x: [0, dxFinal * 0.85, dxFinal], y: [0, dyPeak, dyPeak + fall],
      rotate: [0, rot * 0.5, rot], scale: [0.3, 1, 0.7], times: [0, 0.6, 1],
      size: rand(5, 10), hue: (i % 2) as 0 | 1,
      // 最后两颗故意迟到，打破「一齐炸开」的整齐队形
      delay: i < BURST_COUNT - 2 ? i * 0.03 : i === BURST_COUNT - 2 ? 0.35 : 0.55,
      duration: rand(1.8, 2.4),
    };
  });

const PETAL_COUNT = 5;

const makePetals = (): Particle[] =>
  Array.from({ length: PETAL_COUNT }, (_, i) => {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const a = rand(10, 16) * dir;
    const dyFinal = rand(60, 90); // 正数：花瓣是往下落的，不是往上飘
    const rot = rand(70, 160) * dir;
    return {
      id: uid++, kind: 'petal' as const, left: rand(20, 80), top: -2,
      x: [0, a, -a * 0.6], y: [0, dyFinal * 0.5, dyFinal],
      rotate: [0, rot * 0.5, rot], scale: [1, 0.6, 0.85], // 中段收窄模拟翻面时的侧影
      times: [0, 0.5, 1],
      size: rand(9, 13), hue: 0, delay: i * 0.32, duration: rand(6.5, 8.5),
    };
  });

const makeZzz = (): Particle[] =>
  [9, 12, 15].map((size, i) => {
    const dyFinal = -(14 + i * 6);
    return {
      id: uid++, kind: 'zzz' as const, left: 72, top: 6,
      x: [0, 3, 10 + i * 4], y: [0, dyFinal * 0.5, dyFinal], rotate: [0, 0, 0], scale: [1, 1, 1],
      times: [0, 0.5, 1], size, hue: 0, delay: i * 0.4, duration: rand(3.4, 3.8),
    };
  });

const VIEWBOX: Record<Exclude<ParticleKind, 'zzz'>, string> = {
  hearts: '0 0 16 14', notes: '0 0 12 14', burst: '0 0 12 12', petal: '0 0 12 12',
};

export const MikuParticles = forwardRef<MikuParticlesHandle, { reduceMotion: boolean; coarsePointer: boolean }>(
  function MikuParticles({ reduceMotion, coarsePointer }, ref) {
    const [particles, setParticles] = useState<Particle[]>([]);

    const remove = useCallback((id: number) => {
      setParticles((prev) => prev.filter((p) => p.id !== id));
    }, []);

    useImperativeHandle(ref, () => ({
      emit: (event) => {
        if (reduceMotion) return;
        setParticles((prev) => {
          if (prev.length >= MAX_PARTICLES) return prev;
          if (event.kind === 'zzz') return [...prev, ...makeZzz()];
          if (event.kind === 'burst') return [...prev, ...makeBurst()];
          if (event.kind === 'petal') return [...prev, ...makePetals()];
          // 触屏屏幕更窄，粒子数量对半，别喧宾夺主
          const count = Math.min(event.count ?? 2, coarsePointer ? 2 : 4);
          return [...prev, ...(event.kind === 'hearts' ? makeHearts(count) : makeNotes(count))];
        });
      },
    }), [reduceMotion, coarsePointer]);

    if (reduceMotion) return null;

    return (
      <div className="absolute inset-0 pointer-events-none overflow-visible">
        <AnimatePresence>
          {particles.map((p) => (
            <motion.div
              key={p.id}
              className="absolute"
              style={{ left: `${p.left}%`, top: `${p.top}%` }}
              initial={{ opacity: 0, x: 0, y: 0, rotate: 0, scale: p.scale[0] }}
              animate={{ opacity: [0, 1, 1, 0], x: p.x, y: p.y, rotate: p.rotate, scale: p.scale }}
              transition={{
                duration: p.duration, delay: p.delay, ease: EASE_DRIFT,
                times: p.times, opacity: { times: DISSOLVE_TIMES },
              }}
              onAnimationComplete={() => remove(p.id)}
            >
              {p.kind === 'zzz' ? (
                <span className="font-serif italic text-slate-400/70 select-none" style={{ fontSize: p.size }}>z</span>
              ) : (
                <svg
                  width={p.size} height={p.size} viewBox={VIEWBOX[p.kind]}
                  fill={p.kind === 'burst' ? (p.hue === 0 ? '#39C5BB' : '#FFB7C5') : 'none'}
                  stroke={p.kind === 'hearts' ? '#FFB7C5' : p.kind === 'notes' ? '#39C5BB' : 'none'}
                  strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"
                >
                  {p.kind === 'hearts' ? <HeartGlyph /> : p.kind === 'notes' ? <NoteGlyph /> : p.kind === 'petal' ? <PetalGlyph /> : <SparkleGlyph />}
                </svg>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    );
  }
);
