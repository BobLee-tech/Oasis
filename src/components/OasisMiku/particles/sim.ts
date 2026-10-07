// ✨ 粒子的纯数据层：对象池 + 逐帧积分 + 各种发射配方。不碰 DOM、不碰 canvas，随机数可注入，
//   所以能在单测里按帧跑（见 sim.test.ts）。绘制交给 ParticleCanvas，精灵交给 sprites。
//
//   运动模型统一是「初速度 + 恒定加速度 + 线性阻尼 + 横向摆动」：
//     v += a·dt；v *= exp(−drag·dt)；x += v·dt + 摆动项
//   摆动是位置上的正弦偏移（不进速度），所以不会因为帧率不同积出不同轨迹。
//   透明度走「快显、慢隐」：fadeIn 内线性升到 1，最后 fadeOut 比例内按 smoothstep 溶掉。

export type SpriteShape = 'heart' | 'note' | 'star' | 'petal' | 'ring' | 'glow' | 'z' | 'flake';

export interface Particle {
  alive: boolean;
  shape: SpriteShape;
  color: string;
  x: number; y: number;
  vx: number; vy: number;
  ax: number; ay: number;
  /** 线性阻尼（1/s）：越大越快停下 */
  drag: number;
  age: number; life: number;
  /** 出生尺寸与终了尺寸（px），中间按 sizeCurve 插值 */
  size0: number; size1: number;
  sizeCurve: 'pop' | 'linear' | 'ease-out';
  rot: number; vrot: number;
  /** 横向摆动：振幅 px、频率 Hz、相位 */
  wobA: number; wobF: number; wobP: number;
  /** 樱瓣翻面：scaleX 以这个频率在 [-1, 1] 之间翻（0 = 不翻） */
  flipF: number;
  alpha: number;
  fadeIn: number; fadeOut: number;
  /** 被池子挤占时的优先级：越大越不舍得丢（涟漪是对触碰的直接回应，最高） */
  priority: number;
}

export type Rng = () => number;

export const POOL_SIZE = 48;

const blank = (): Particle => ({
  alive: false, shape: 'glow', color: '#39C5BB',
  x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, drag: 0,
  age: 0, life: 1, size0: 8, size1: 8, sizeCurve: 'linear',
  rot: 0, vrot: 0, wobA: 0, wobF: 0, wobP: 0, flipF: 0,
  alpha: 1, fadeIn: 0.1, fadeOut: 0.5, priority: 1,
});

export type Spawn = Partial<Omit<Particle, 'alive' | 'age'>> & Pick<Particle, 'shape' | 'x' | 'y' | 'life'>;

const smooth = (t: number) => t * t * (3 - 2 * t);
const easeOutBack = (u: number) => 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2;

export class ParticlePool {
  readonly items: Particle[] = Array.from({ length: POOL_SIZE }, blank);
  private liveCount = 0;

  get count() { return this.liveCount; }

  spawn(s: Spawn) {
    let slot = this.items.find(p => !p.alive);
    if (!slot) {
      // 满了：挤掉「最不重要、且最接近寿终」的那颗，而不是丢掉这次新发射——
      // 新的触碰反馈永远比一颗快要消散的旧光尘更值得被看见
      const priority = s.priority ?? 1;
      let worst: Particle | null = null;
      let worstScore = Infinity;
      for (const p of this.items) {
        if (p.priority > priority) continue;
        const score = p.priority * 10 - p.age / p.life;
        if (score < worstScore) { worstScore = score; worst = p; }
      }
      if (!worst) return null;
      slot = worst;
      this.liveCount -= 1;
    }
    Object.assign(slot, blank(), s, { alive: true, age: 0 });
    this.liveCount += 1;
    return slot;
  }

  step(dt: number) {
    if (this.liveCount === 0) return;
    for (const p of this.items) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) { p.alive = false; this.liveCount -= 1; continue; }
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
    }
  }

  clear() {
    for (const p of this.items) p.alive = false;
    this.liveCount = 0;
  }
}

/** 这一刻该画成什么样：位置（含摆动）、尺寸、透明度、翻面系数。 */
export const renderState = (p: Particle) => {
  const t = Math.min(1, p.age / p.life);
  const sizeT = p.sizeCurve === 'pop'
    // 前 20% 寿命内 easeOutBack 长到位（冲过头约 10% 再回落）：「啵」地出现，而不是匀速长大
    ? easeOutBack(Math.min(1, t / 0.2))
    : p.sizeCurve === 'ease-out' ? 1 - (1 - t) * (1 - t) : t;
  const size = p.size0 + (p.size1 - p.size0) * sizeT;
  let a = 1;
  if (t < p.fadeIn) a = t / p.fadeIn;
  const outStart = 1 - p.fadeOut;
  if (t > outStart) a *= 1 - smooth((t - outStart) / p.fadeOut);
  return {
    x: p.x + p.wobA * Math.sin(2 * Math.PI * p.wobF * p.age + p.wobP),
    y: p.y,
    size,
    alpha: a * p.alpha,
    flip: p.flipF ? Math.cos(2 * Math.PI * p.flipF * p.age) : 1,
  };
};

// ───────────────────────── 发射配方 ─────────────────────────

export const TEAL = '#39C5BB';
export const PINK = '#FFB7C5';

/** 心境色温：V 高偏樱粉、V 低偏初音绿（P4 的效价接进来之前，调用方传 0 即中性）。 */
export const toneColor = (valence: number) => {
  const t = Math.max(0, Math.min(1, (valence + 1) / 2));
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  // 初音绿 (57,197,187) → 樱粉 (255,183,197)
  return `rgb(${mix(57, 255)},${mix(197, 183)},${mix(187, 197)})`;
};

const range = (rng: Rng, min: number, max: number) => min + rng() * (max - min);
const sign = (rng: Rng) => (rng() < 0.5 ? -1 : 1);
const GOLDEN = 2.399963; // 黄金角（弧度）：任意前缀都分布均匀，比等分圆周少一点「排队感」

export interface EmitContext {
  x: number; y: number;
  /** 0..1：发射速度、数量随之放大 */
  energy?: number;
  /** −1..1：色温（见 toneColor） */
  valence?: number;
  /** 覆盖颜色（播放中取曲目 color） */
  color?: string;
  /** 头部半径（px），决定「从头顶两侧」之类的偏移量 */
  r?: number;
  count?: number;
}

export type EmitKind =
  | 'ripple' | 'dust' | 'hearts' | 'notes' | 'burst' | 'petals' | 'zzz'
  | 'motes-up' | 'motes-down' | 'sparks' | 'bloom' | 'firefly' | 'snow';

/** 每种发射 → 一组出生参数。纯函数，rng 可注入。 */
export const recipe = (kind: EmitKind, c: EmitContext, rng: Rng = Math.random): Spawn[] => {
  const e = c.energy ?? 0.5;
  const r = c.r ?? 16;
  const n = c.count;
  switch (kind) {
    case 'ripple':
      // 触点处一圈细环：0.6s 从 8px 扩到 38px（ease-out，先快后慢），后 60% 溶掉
      return [{ shape: 'ring', color: c.color ?? TEAL, x: c.x, y: c.y, life: 0.6, size0: 8, size1: 38, sizeCurve: 'ease-out', fadeIn: 0.05, fadeOut: 0.6, alpha: 0.95, priority: 3 }];
    case 'dust':
      // 光尘：沿抚摸轨迹落下的一粒，几乎不动，微微上浮
      return Array.from({ length: n ?? 1 }, () => ({
        shape: 'glow' as const, color: c.color ?? toneColor(c.valence ?? 0.3), x: c.x + range(rng, -3, 3), y: c.y + range(rng, -3, 3),
        vx: range(rng, -6, 6), vy: range(rng, -18, -8), drag: 1.2, life: range(rng, 0.9, 1.4),
        size0: range(rng, 9, 13), size1: 4, sizeCurve: 'linear' as const, fadeIn: 0.08, fadeOut: 0.7, priority: 1,
      }));
    case 'hearts':
      return Array.from({ length: n ?? 3 }, (_, i) => {
        const d = sign(rng);
        return {
          shape: 'heart' as const, color: c.color ?? PINK,
          x: c.x + range(rng, -0.6, 0.6) * r, y: c.y - r * 0.6,
          vx: d * range(rng, 6, 14), vy: -range(rng, 26, 38) * (0.8 + e * 0.4), drag: 0.35,
          ay: 0, life: range(rng, 2.2, 2.8) + i * 0.15, size0: 4, size1: range(rng, 10, 13), sizeCurve: 'pop' as const,
          rot: d * 0.1, vrot: -d * 0.12, wobA: range(rng, 2, 4), wobF: range(rng, 0.5, 0.8), wobP: rng() * 6.28,
          fadeIn: 0.06, fadeOut: 0.45, priority: 2,
        };
      });
    case 'notes':
      // 从头部两侧冒出，往外侧漂；能量越高越活泼
      return Array.from({ length: n ?? 1 }, () => {
        const d = sign(rng);
        return {
          shape: 'note' as const, color: c.color ?? TEAL,
          x: c.x + d * r * range(rng, 0.9, 1.3), y: c.y - r * range(rng, 0.2, 0.6),
          vx: d * range(rng, 8, 16) * (0.7 + e * 0.6), vy: -range(rng, 22, 32) * (0.7 + e * 0.6), drag: 0.4,
          life: range(rng, 2.4, 3.2), size0: 5, size1: range(rng, 11, 14), sizeCurve: 'pop' as const,
          rot: d * 0.15, vrot: d * 0.25, wobA: range(rng, 1.5, 3), wobF: range(rng, 0.7, 1.1), wobP: rng() * 6.28,
          fadeIn: 0.05, fadeOut: 0.5, priority: 2,
        };
      });
    case 'burst':
    case 'bloom': {
      // burst：里程碑星屑，八颗沿黄金角炸开、带重力回落；bloom：副歌首拍的小绽放（更轻、更少）
      const big = kind === 'burst';
      const count = n ?? (big ? 10 : 6);
      const base = rng() * 6.28;
      return Array.from({ length: count }, (_, i) => {
        const a = base + i * GOLDEN;
        const speed = (big ? range(rng, 70, 120) : range(rng, 40, 70)) * (0.8 + e * 0.4);
        return {
          shape: 'star' as const, color: c.color ?? (i % 2 ? PINK : TEAL), x: c.x, y: c.y,
          vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * 0.8 - (big ? 20 : 10), ay: big ? 70 : 40, drag: 2.2,
          life: range(rng, 1.1, 1.6) + (big && i >= count - 2 ? 0.4 : 0), size0: 3, size1: range(rng, 6, big ? 11 : 8), sizeCurve: 'pop' as const,
          vrot: range(rng, -3, 3), fadeIn: 0.04, fadeOut: 0.55, priority: 2,
        };
      });
    }
    case 'petals':
      // 樱瓣：从头顶上方落下，左右飘、会翻面——是「落下来」的郑重，不是炸开
      return Array.from({ length: n ?? 5 }, () => {
        const d = sign(rng);
        return {
          shape: 'petal' as const, color: PINK,
          x: c.x + range(rng, -2.2, 2.2) * r, y: c.y - r * range(rng, 1.8, 2.6),
          vx: d * range(rng, 4, 10), vy: range(rng, 8, 16), ay: 6, drag: 0.6,
          life: range(rng, 4.2, 5.6), size0: range(rng, 8, 10), size1: range(rng, 9, 12), sizeCurve: 'linear' as const,
          rot: rng() * 6.28, vrot: d * range(rng, 0.6, 1.4), wobA: range(rng, 6, 12), wobF: range(rng, 0.25, 0.4), wobP: rng() * 6.28,
          flipF: range(rng, 0.3, 0.6), fadeIn: 0.1, fadeOut: 0.35, priority: 2,
        };
      });
    case 'zzz':
      // 漂浮的缓动：三个 z 依次变大、往右上斜着飘，慢慢淡掉
      return [0, 1, 2].map((i) => ({
        shape: 'z' as const, color: '#94A3B8', x: c.x + r * 0.8 + i * 3, y: c.y - r * 0.9 - i * 4,
        vx: range(rng, 5, 8), vy: -range(rng, 7, 10), drag: 0.2,
        life: 3.2 + i * 0.5, size0: 7 + i * 3, size1: 9 + i * 3, sizeCurve: 'linear' as const,
        wobA: 2, wobF: 0.35, wobP: i * 1.3, fadeIn: 0.15 + i * 0.12, fadeOut: 0.5, alpha: 0.75, priority: 1,
      }));
    case 'motes-up':
      // 温柔/宁静：稀疏的光点慢慢上浮
      return Array.from({ length: n ?? 1 }, () => ({
        shape: 'glow' as const, color: c.color ?? toneColor(c.valence ?? 0.3),
        x: c.x + range(rng, -1.6, 1.6) * r, y: c.y + range(rng, -0.4, 1.2) * r,
        vx: range(rng, -3, 3), vy: -range(rng, 10, 18), drag: 0.1,
        life: range(rng, 2.8, 3.8), size0: range(rng, 5, 8), size1: 3, sizeCurve: 'linear' as const,
        wobA: range(rng, 3, 6), wobF: range(rng, 0.2, 0.35), wobP: rng() * 6.28, fadeIn: 0.25, fadeOut: 0.5, alpha: 0.8, priority: 1,
      }));
    case 'motes-down':
      // 哀伤/怀念：半透明光尘缓缓下沉
      return Array.from({ length: n ?? 1 }, () => ({
        shape: 'glow' as const, color: c.color ?? toneColor(c.valence ?? -0.4),
        x: c.x + range(rng, -1.8, 1.8) * r, y: c.y - range(rng, 0.6, 1.4) * r,
        vx: range(rng, -2, 2), vy: range(rng, 6, 11), drag: 0.1,
        life: range(rng, 3.2, 4.2), size0: range(rng, 4, 7), size1: 3, sizeCurve: 'linear' as const,
        wobA: range(rng, 3, 5), wobF: range(rng, 0.15, 0.25), wobP: rng() * 6.28, fadeIn: 0.3, fadeOut: 0.5, alpha: 0.55, priority: 1,
      }));
    case 'sparks':
      // 紧绷：短促的火花，快出快灭
      return Array.from({ length: n ?? 3 }, () => {
        const a = -Math.PI / 2 + range(rng, -1.1, 1.1);
        const speed = range(rng, 60, 110) * (0.8 + e * 0.5);
        return {
          shape: 'star' as const, color: c.color ?? TEAL, x: c.x + range(rng, -1, 1) * r, y: c.y - r * 0.4,
          vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, ay: 120, drag: 4,
          life: range(rng, 0.35, 0.55), size0: range(rng, 4, 6), size1: 1.5, sizeCurve: 'linear' as const,
          vrot: range(rng, -6, 6), fadeIn: 0.02, fadeOut: 0.5, priority: 1,
        };
      });
    case 'firefly':
      // 夏夜萤光：慢飞、忽明忽暗（摆动大，透明度由 alpha 低起）
      return Array.from({ length: n ?? 1 }, () => ({
        shape: 'glow' as const, color: '#D9F99D', x: c.x + range(rng, -2.4, 2.4) * r, y: c.y + range(rng, 0, 4) * r,
        vx: range(rng, -6, 6), vy: -range(rng, 2, 7), drag: 0.05,
        life: range(rng, 4, 6), size0: 7, size1: 5, sizeCurve: 'linear' as const,
        wobA: range(rng, 6, 12), wobF: range(rng, 0.12, 0.25), wobP: rng() * 6.28, fadeIn: 0.3, fadeOut: 0.4, alpha: 0.85, priority: 0,
      }));
    case 'snow':
      return Array.from({ length: n ?? 1 }, () => ({
        shape: 'flake' as const, color: '#E2E8F0', x: c.x + range(rng, -2.6, 2.6) * r, y: c.y - r * range(rng, 1.4, 2.4),
        vx: range(rng, -3, 3), vy: range(rng, 8, 14), drag: 0.1,
        life: range(rng, 4.5, 6), size0: range(rng, 3, 5), size1: 3, sizeCurve: 'linear' as const,
        wobA: range(rng, 4, 8), wobF: range(rng, 0.15, 0.3), wobP: rng() * 6.28, fadeIn: 0.15, fadeOut: 0.35, alpha: 0.8, priority: 0,
      }));
  }
};
