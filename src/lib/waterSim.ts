// 💧 水琴窟的水面（docs/music-ripple-notes-demo.html 演示二）：经典的两缓冲波动方程
// （Hugo Elias, "2D Water"）。纯数据，不碰 DOM/GL，便于测试。
//
//   next = (左 + 右 + 上 + 下) / 2 − prev，再乘阻尼；边缘一圈海绵层吸收反射。
//   固定步长推进：帧率高低只影响画面，不影响水的快慢。

export interface WaterSimOptions {
  size: number;
  /** 每步的整体阻尼：0.989 约 1 秒衰减一半 */
  damping?: number;
  /** 海绵层宽度（格） */
  sponge?: number;
}

export class WaterSim {
  readonly size: number;
  /** 当前高度场（行优先，第 0 行在上） */
  current: Float32Array;
  private previous: Float32Array;
  private readonly damping: number;
  private readonly absorb: Float32Array;

  constructor({ size, damping = 0.989, sponge = 12 }: WaterSimOptions) {
    this.size = size;
    this.damping = damping;
    this.current = new Float32Array(size * size);
    this.previous = new Float32Array(size * size);
    this.absorb = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
        this.absorb[y * size + x] = edge < sponge ? 1 - 0.08 * (1 - edge / sponge) ** 2 : 1;
      }
    }
  }

  step() {
    const { size, current, previous, damping, absorb } = this;
    for (let y = 1; y < size - 1; y += 1) {
      let index = y * size + 1;
      for (let x = 1; x < size - 1; x += 1, index += 1) {
        previous[index] =
          ((current[index - 1] + current[index + 1] + current[index - size] + current[index + size]) * 0.5 -
            previous[index]) *
          damping *
          absorb[index];
      }
    }
    this.previous = current;
    this.current = previous;
  }

  /** 落一滴：余弦形的小坑（向下为负），x/y 以格为单位 */
  drop(x: number, y: number, radius: number, strength: number) {
    const { size, current } = this;
    const reach = Math.ceil(radius);
    for (let dy = -reach; dy <= reach; dy += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        const distance = Math.hypot(dx, dy);
        if (distance > radius) continue;
        const cx = Math.round(x + dx);
        const cy = Math.round(y + dy);
        if (cx < 1 || cy < 1 || cx >= size - 1 || cy >= size - 1) continue;
        current[cy * size + cx] -= strength * (Math.cos((Math.PI * distance) / radius) + 1) * 0.5;
      }
    }
  }

  /** 水面还剩多少起伏（最大绝对高度），用来判断能否停笔 */
  restlessness() {
    let peak = 0;
    const { current } = this;
    for (let index = 0; index < current.length; index += 1) {
      const value = Math.abs(current[index]);
      if (value > peak) peak = value;
    }
    return peak;
  }

  clear() {
    this.current.fill(0);
    this.previous.fill(0);
  }
}

/** 黄金角螺线上的第 n 个落点（0–1 坐标，半径不超过 spread）：滴子铺开、不扎堆 */
export const goldenDrop = (n: number, jitter: number, spread = 0.34) => {
  const angle = n * 2.399963229728653;
  const radius = Math.sqrt(jitter) * spread;
  return { x: 0.5 + Math.cos(angle) * radius, y: 0.5 + Math.sin(angle) * radius };
};

/**
 * 鼓点检测：beat 包络上穿 high 记一拍，回落到 low 以下才重新上膛；两拍至少隔 minGapMs。
 * 返回一个闭包，每帧喂 (beat, now)，命中时返回 true。
 */
export const createBeatGate = (high = 0.45, low = 0.2, minGapMs = 180) => {
  let armed = true;
  let last = -Infinity;
  return (beat: number, now: number) => {
    if (armed && beat >= high && now - last >= minGapMs) {
      armed = false;
      last = now;
      return true;
    }
    if (beat < low) armed = true;
    return false;
  };
};
