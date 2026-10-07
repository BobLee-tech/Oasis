// 🔬 逐帧瞬移探针（仅开发环境）：docs/music-design.md §B2 P0 的验收工具。
//
// 每帧记录视口内所有可见元素的位置，找两类问题：
//   · 瞬移：前后两帧都静止，中间一帧突然跳 > 18px（错位、首尾帧跳）；
//   · 错位：pairs 里成对的两个元素中心不重合（高亮块与它所属的按钮）。
// 用法（浏览器控制台）：
//   await __uiProbe.run(() => document.querySelector('[aria-label="下一首"]').click())
//   await __uiProbe.run(act, { ms: 1500, pairs: [['button[aria-pressed="true"] > span.absolute', 'button[aria-pressed="true"]']] })

type Rect = [number, number, number, number];

interface ProbeOptions {
  ms?: number;
  /** [子选择器, 父选择器]：每帧比较两者的中心。 */
  pairs?: [string, string][];
  /** 单帧位移超过多少 px 算瞬移。 */
  threshold?: number;
}

interface ProbeReport {
  frames: number;
  /** 点击后第一次有元素位置或透明度变化的时间（ms）。 */
  firstChangeMs: number | null;
  teleports: string[];
  misaligned: { pair: string; fromMs: number; toMs: number; maxPx: number }[];
}

const label = (element: Element) => {
  const aria = element.getAttribute('aria-label');
  const text = (element.textContent ?? '').trim().slice(0, 12);
  return `${element.tagName.toLowerCase()}${aria ? `[${aria}]` : ''}:${text}`;
};

const distance = (a: Rect, b: Rect) =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]), Math.abs(a[3] - b[3]));

const snapshot = () => {
  const map = new Map<Element, Rect & { 4?: number }>();
  for (const element of document.querySelectorAll('body *')) {
    const r = element.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > window.innerHeight) continue;
    map.set(element, [r.x, r.y, r.width, r.height]);
  }
  return map;
};

const center = (selector: string) => {
  const element = document.querySelector(selector);
  if (!element) return null;
  const r = element.getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2] as const;
};

const run = async (act: () => void, options: ProbeOptions = {}): Promise<ProbeReport> => {
  const { ms = 1500, pairs = [], threshold = 18 } = options;
  const frames: { t: number; rects: Map<Element, Rect>; pairs: (readonly [number, number] | null)[] }[] = [];
  let running = true;
  let actedAt = 0;
  const t0 = performance.now();

  await new Promise<void>(resolve => {
    const loop = () => {
      frames.push({
        t: performance.now() - t0,
        rects: snapshot(),
        pairs: pairs.map(([a, b]) => {
          const ca = center(a);
          const cb = center(b);
          return ca && cb ? [ca[0] - cb[0], ca[1] - cb[1]] as const : null;
        }),
      });
      if (running) requestAnimationFrame(loop);
      else resolve();
    };
    requestAnimationFrame(loop);
    window.setTimeout(() => { actedAt = performance.now() - t0; act(); }, 80);
    window.setTimeout(() => { running = false; }, 80 + ms);
  });

  const teleports = new Map<string, string>();
  let firstChangeMs: number | null = null;
  for (let i = 1; i < frames.length; i += 1) {
    const current = frames[i];
    const previous = frames[i - 1];
    for (const [element, rect] of current.rects) {
      const before = previous.rects.get(element);
      if (!before) continue;
      const moved = distance(rect, before);
      if (firstChangeMs === null && current.t > actedAt && moved > 0.5) firstChangeMs = Math.round(current.t - actedAt);
      if (i < 2 || i >= frames.length - 1 || moved <= threshold) continue;
      const beforeBefore = frames[i - 2].rects.get(element);
      const after = frames[i + 1].rects.get(element);
      if (!beforeBefore || !after) continue;
      if (distance(before, beforeBefore) < 4 && distance(after, rect) < 4) {
        const key = label(element);
        if (!teleports.has(key)) {
          teleports.set(key, `${Math.round(current.t - actedAt)}ms 瞬移 ${Math.round(moved)}px`);
        }
      }
    }
  }

  const misaligned = pairs.map(([a, b], index) => {
    const off = frames
      .map(frame => ({ t: frame.t - actedAt, d: frame.pairs[index] }))
      .filter(entry => entry.t > 0 && entry.d && Math.hypot(entry.d[0], entry.d[1]) > 2);
    if (!off.length) return null;
    return {
      pair: `${a} ↔ ${b}`,
      fromMs: Math.round(off[0].t),
      toMs: Math.round(off[off.length - 1].t),
      maxPx: Math.round(Math.max(...off.map(entry => Math.hypot(entry.d![0], entry.d![1])))),
    };
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return {
    frames: frames.length,
    firstChangeMs,
    teleports: [...teleports.entries()].map(([key, value]) => `${key} ${value}`),
    misaligned,
  };
};

export const installUiProbe = () => {
  (window as unknown as { __uiProbe: { run: typeof run } }).__uiProbe = { run };
};
