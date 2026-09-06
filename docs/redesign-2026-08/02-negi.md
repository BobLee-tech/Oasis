# 02 · 大葱等待态 + 间奏扫弧优化 + 动画性能三修

三件事在同一次提交里，因为它们改的是同一批文件、解决的是同一个问题：
**这个播放器在"什么都还没发生"的时候，要么什么都不说，要么用一个通用转圈敷衍。**

涉及文件：
`src/hooks/useSoundscape.ts` · `src/components/resonance/NegiLoader.tsx`（新建） ·
`src/components/resonance/LyricPanel.tsx` · `src/components/resonance/Interlude.tsx` ·
`src/components/resonance/LyricField.tsx` · `src/lib/lyricTiming.ts` ·
`src/components/OasisResonance.tsx` · `src/index.css`

---

## 0. 现状

三处"等待"，语法各不相同，而且最关键的那处根本没有指示：

| 处 | 位置 | 现状 |
|---|---|---|
| 歌词拉取 | [LyricPanel.tsx:27](../../src/components/resonance/LyricPanel.tsx#L27) `LyricLoading` | 一个通用转圈。全站唯一的 generic spinner，而且用 framer 的 rAF 驱动一个纯装饰动画 |
| 间奏 | [Interlude.tsx](../../src/components/resonance/Interlude.tsx) | 设计是对的——它读出了"还剩多久"。但 `--g` 每帧从 JS 写进一个**继承的**自定义属性，整棵子树每帧失效 |
| **音频缓冲** | 无 | [useSoundscape.ts](../../src/hooks/useSoundscape.ts) 只有 `play().catch()`，没有 `waiting` / `canplay` / `stalled` 监听。弱网下唱针在转、按钮显示"暂停"、但没有声音 |

另外 `OasisResonance.tsx` 里有 **6 个 `repeat: Infinity`** 的 framer 动画，
其中两处动的是 `height`（每帧触发 layout），一处在 `filter: blur()` 的元素上动 `scale`（每帧重栅格化）。

---

## A. 音频就绪状态：先让"等待"成为一个真实存在的状态

在 [useSoundscape.ts](../../src/hooks/useSoundscape.ts) 的全局单例区（`listeners` 定义之后，
`advanceTrack` 之前）加一段。**遵循这个文件既有的纪律**：状态量走 `notifyListeners()`，
连续量走命令式 getter（和现有的 `getPlaybackTime()` / `getEnergy()` 同款），不进 React。

```ts
// ⏳ 缓冲：换曲与弱网下音频真的会等，而以前这段等待在界面上完全不存在——
//    唱针照转、按钮显示「暂停」，用户只能认为坏了。
//    布尔量少且稀疏，走 notifyListeners；已缓冲比例每秒变几十次，走命令式读取。
let globalBuffering = false;

export const isBuffering = () => globalBuffering;

const setBuffering = (v: boolean) => {
  if (globalBuffering === v) return;
  globalBuffering = v;
  notifyListeners();
};

/** 覆盖当前播放头的那一段已缓冲到哪儿，归一化到 0–1。取不到返回 0。 */
export const getBufferedRatio = () => {
  const d = globalAudio.duration;
  if (!d || !Number.isFinite(d)) return 0;
  const b = globalAudio.buffered;
  const t = globalAudio.currentTime;
  for (let i = 0; i < b.length; i += 1) {
    if (t >= b.start(i) - 0.25 && t <= b.end(i) + 0.25) return Math.min(1, b.end(i) / d);
  }
  return b.length ? Math.min(1, b.end(b.length - 1) / d) : 0;
};

globalAudio.addEventListener('loadstart', () => setBuffering(true));
globalAudio.addEventListener('waiting', () => setBuffering(true));
globalAudio.addEventListener('stalled', () => setBuffering(true));
globalAudio.addEventListener('canplay', () => setBuffering(false));
globalAudio.addEventListener('playing', () => setBuffering(false));
globalAudio.addEventListener('error', () => setBuffering(false));
globalAudio.addEventListener('emptied', () => setBuffering(false));
```

`useSoundscape()` 的 `updateState` 里加 `setBuffering(globalBuffering)` 与对应的 `useState`，
返回值里多一个 `buffering: boolean`。

> ⚠️ **`progress` 事件不要接进 `notifyListeners`**。它一秒能烧几十次，接进去就是一场
> setState 风暴。已缓冲比例由 `NegiLoader` 在自己的 rAF 里读 `getBufferedRatio()`。

### 防闪烁

本地缓存命中时 `loadstart → canplay` 可能只有 20ms，闪一下比不闪更糟。加一个共用小 hook：

```ts
// src/hooks/useDelayedFlag.ts
/** flag 变 true 后延迟 delay 才对外为 true；变 false 立即生效。用来给「短得看不见的等待」消抖。 */
export const useDelayedFlag = (flag: boolean, delay = 250) => { /* setTimeout + clear */ };
```

---

## B. `NegiLoader`：一根葱，两种时长，同一套语法

新建 `src/components/resonance/NegiLoader.tsx`。

### 造型规格

`viewBox="0 0 24 48"`，竖直的一根大葱。**不旋转**——甩葱是梗，梗不克制。

下面这组坐标**已经在浏览器里画出来验证过**（150px / 52px / 24px 三个尺寸、p=0/0.4/1 三种进度），
直接抄，不用重画：

```js
const STALK = "M9.4 23 C10.6 21.2 13.4 21.2 14.6 23 L14.9 41.4 C14.9 44.6 9.1 44.6 9.1 41.4 Z";
const BLADE_L = "M9.6 25.4 C9.0 18 6.9 11 4.3 4.0 C8.1 11.4 11.4 18.6 12.6 25.4 Z";
const BLADE_C = "M10.7 23.6 C10.9 15.4 11.4 8.2 12.4 1.6 C13.9 8.4 14.3 15.6 14.1 23.6 Z";
const BLADE_R = "M12.4 24.8 C14.1 17.8 16.8 11.2 19.7 5.8 C18.0 12.6 16.2 18.8 15.2 24.8 Z";
const ROOTS = "M12 43.6 L8.8 47.2 M12 43.6 L10.6 47.8 M12 43.6 L13.5 47.8 M12 43.6 L15.3 47.2";
```

几个不是随便定的细节，改的时候别改掉：

- **三片叶子，不是两片。** 两片是 V 形，读起来像兔子耳朵；三片才是葱。
- **三片的基点 y 各不相同**（25.4 / 23.6 / 24.8），叶尖高度也不同（4.0 / 1.6 / 5.8）。
  对称的扇形是图标，不对称的才像植物。
- **绘制顺序是「先叶后葱白」**：葱白最后画、盖住三片叶子的基部，
  于是白绿交界是叶子从叶鞘里长出来，而不是一条平切线。
- 葱白顶端是一段浅浅的上凸弧（`C10.6 21.2 13.4 21.2 14.6 23`），那是叶鞘。
- **最小渲染宽度 26px。** 再小三片叶子会糊成一团——那时候去掉中间那片和根须。

### 进度编码

整条葱画两遍，**同一组 path，不同的墨**：

1. **底稿**：`opacity: .18`，只有描边（`stroke: currentColor`, `stroke-width: .8`, `fill: none`）。
2. **实色**：葱白 `fill: var(--negi-pale)`、葱叶 `fill: currentColor`（`currentColor` = 传进来的
   曲目情绪色 `track.color`），整组套一个从下往上开口的 `clipPath`。

```tsx
<clipPath id={clipId}>
  {/* 已缓冲的部分从底部往上"上色"。y/height 走 CSS 几何属性 + calc()，
      让浏览器自己算——和 .oasis-sky-canvas 里 r: calc(...) 是同一条路子，一次 setState 都不必有。 */}
  <rect x="0" width="24"
        style={{ y: 'calc(48px * (1 - var(--p, 0)))', height: 'calc(48px * var(--p, 0))' }} />
</clipPath>
```

`--p` 由组件自己的 rAF 每帧写在根 `<svg>` 上（`svgRef.current.style.setProperty('--p', …)`），
数据源是 props 传进来的 `progress?: () => number`。**没有 `progress` 就完全不跑 rAF**，
此时 `--p` 恒为 0，只剩底稿 + 叶子摆动——这就是"读不到就退到只摇不长"。

### 摆动

```css
@keyframes negi-sway {
    from { transform: rotate(-2.2deg); }
    to   { transform: rotate(2.2deg); }
}
.negi-blade {
    transform-box: fill-box;
    transform-origin: 50% 100%;   /* 叶根不动，只有叶尖摆 */
    animation: negi-sway 2.1s cubic-bezier(.45, 0, .55, 1) infinite alternate;
}
.negi-blade-b { animation-duration: 2.6s; animation-delay: -.7s; }  /* 两片叶子互质，别同步 */
@media (prefers-reduced-motion: reduce) { .negi-blade { animation: none; } }
```

纯 CSS，零 JS 每帧。`transform` 在合成器上，`fill-box` 让 `transform-origin` 落在路径自身的
包围盒上而不是整个 SVG。**只有叶子动，葱白纹丝不动**——这是它看起来"活着但不聒噪"的全部原因。

### Props

```ts
interface NegiLoaderProps {
  /** 叶子的颜色。传曲目情绪色。 */
  color: string;
  /** 每帧读一次的进度 0–1；不传则不跑 rAF，只摇不长。 */
  progress?: () => number;
  /** 渲染宽度 px。26（歌词态）| 30（缓冲态），不得小于 26 */
  size?: number;
  label: string;         // aria-label
}
```

根元素 `role="status"` + `aria-label={label}`，SVG 本身 `aria-hidden`。

---

## C. 两处接入

### C-1 歌词拉取

[LyricPanel.tsx:27-42](../../src/components/resonance/LyricPanel.tsx#L27) 的 `LyricLoading` 整个替换：
转圈删掉，换 `<NegiLoader color={color} size={26} label="歌词载入中" />`，
文案 **「寻觅词迹」保留**（它写得好），字号字距不动。

外面套 `useDelayedFlag(isLoading, 250)`：250ms 内拉到的歌词根本不出现加载态。

### C-2 音频缓冲

[OasisResonance.tsx](../../src/components/OasisResonance.tsx) 的唱片中心。放在**不随唱片旋转**
的那一层（唱片的旋转由 `oasis-spin` 加在碟片元素上，葱要挂在它的兄弟层），
`size={30}`，`progress={getBufferedRatio}`，`label="正在把这段音搬过来"`。

同时把转速指示灯的文案联动：`33⅓ RPM` / `STANDBY` 之外加第三态 **`CUEING`**
（[OasisResonance.tsx:528](../../src/components/OasisResonance.tsx#L528)）。
"CUEING" 是唱机术语里"对轨待放"的意思，和这台机器的语言是一致的，比 "LOADING" 好。

同样套 250ms 消抖。缓冲结束时葱做一次 220ms 的 `opacity → 0`，不要硬切。

---

## D. 间奏扫弧：不换成葱，改掉它的驱动方式

### 病因

```ts
// LyricField.tsx:393-396 —— 每帧两次 setProperty
interludeRef.current.style.setProperty('--g', String(interlude.progress));
interludeRef.current.style.setProperty('--e', String(getEnergy().beat));
```

`--g` / `--e` 是**会继承**的未注册自定义属性，写在容器上、由两个后代的 `calc()` 读
（`stroke-dashoffset: calc(1 - var(--g))`、`transform: scale(calc(.7 + var(--e) * .5))`）。
每帧两次写入 = 每帧让整棵子树的样式失效并重算。而 `--g` **是时间的线性函数**——
它根本不需要每帧算，浏览器自己就会插值。

### D-1 `--g` → 一次性 CSS 动画（整段间奏零 JS）

先给 `InterludeState` 补两个字段（[lyricTiming.ts:130](../../src/lib/lyricTiming.ts#L130)），
两个值在函数里本来就有，只是没往外传：

```ts
export interface InterludeState {
  active: boolean;
  progress: number;
  /** 本段间奏总时长（ms）。active 为 false 时为 0。 */
  durationMs: number;
  /** 已经过去多久（ms）。 */
  elapsedMs: number;
}
```

`src/lib/lyricTiming.test.ts` 补一条断言：前奏分支 `durationMs === firstStart`，
正常分支 `durationMs === line.gapMs`。

CSS：

```css
@keyframes interlude-sweep {
    from { stroke-dashoffset: 1; }
    to   { stroke-dashoffset: 0; }
}
.lyric-interlude-arc {
    stroke: var(--accent);
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: interlude-sweep var(--dur, 4s) linear both paused;
}
.lyric-interlude[data-running='1'] .lyric-interlude-arc { animation-play-state: running; }
```

LyricField 在**只有两种时刻**重新绑定，不是每帧：

1. `interlude.active` 由 false 翻成 true；
2. 检测到跳转——`|(now − bindAt) − (elapsedMs − boundElapsedMs)| > 250ms`。

绑定动作就三行：

```ts
el.style.setProperty('--dur', `${interlude.durationMs}ms`);
el.style.animationDelay = `-${interlude.elapsedMs}ms`;   // 负延迟 = 直接落到当前进度
el.dataset.running = isPlaying ? '1' : '0';
```

暂停时把 `data-running` 置 0（`animation-play-state: paused`），恢复时置 1。
**这一段间奏期间的每帧 JS 开销归零。**

> ⚠️ **`prefers-reduced-motion: reduce` 会把这个动画压成 0.01ms 并只播一次**
> （[index.css](../../src/index.css) 底部那条全局规则），弧会瞬间跑到头。
> 所以 reduce 下必须保留旧的 JS 写入路径：`if (reduce) { 每帧写 strokeDashoffset }`。
> 进度是信息不是装饰，不能因为用户关了动效就骗他。

### D-2 `--e` → 直接写在 core 元素上

`--e` 是真的每帧量（鼓点能量），留着。但不要经由继承的自定义属性——
拿到 core 元素的引用，直接写它自己的 `transform`：

```ts
coreRef.current.style.transform = `scale(${(0.7 + getEnergy().beat * 0.5).toFixed(3)})`;
```

`Interlude` 改成 `useImperativeHandle` 暴露 `{ root, core }`，或者在 `LyricField` 里
`querySelector('.lyric-interlude-core')` 一次并缓存。样式表里删掉那条 `transform: scale(calc(...))`。

### D-3 一处克制的视觉升级（可选）

弧头加一枚"针尖"：同心再放一个 `<circle>`，`stroke-dasharray="0 1"` + `stroke-linecap="round"`
（零长度虚线配圆头 = 一个点），共用同一条 `interlude-sweep` 动画。
于是"还剩多久"除了弧长，还有一个正在走的点。零额外 JS，四行 SVG。

**这是本条的上限。** 不要再加光晕、拖尾、粒子。

---

## E. 动画性能三修

### E-1 均衡器条：`height` → `scaleY`（这是本节最重要的一条）

[OasisResonance.tsx:389](../../src/components/OasisResonance.tsx#L389) 与
[:818](../../src/components/OasisResonance.tsx#L818)：

```tsx
animate={{ height: ['28%', '100%', '28%'] }}   // ❌ 每帧触发 layout
```

改成纯 CSS：

```css
@keyframes oasis-eq { 0%, 100% { transform: scaleY(.28); } 50% { transform: scaleY(1); } }
.oasis-eq-bar {
    width: 2px; height: 100%; border-radius: 9999px;
    transform-origin: bottom;
    animation: oasis-eq .7s ease-in-out infinite;
}
```

```tsx
{[0, .2, .4].map((d, k) => (
  <span key={k} className="oasis-eq-bar"
        style={{ backgroundColor: track.color, animationDelay: `${d}s` }} />
))}
```

额外白赚一笔：曲库行有 `content-visibility: auto`（[index.css:117](../../src/index.css#L117)），
CSS 动画在视口外的行里根本不会跑；framer 的 rAF 不认这个。

### E-2 落针微光：别在 `filter` 上动 `scale`

[OasisResonance.tsx:511-517](../../src/components/OasisResonance.tsx#L511) 现在是
`blur-md` 的元素 + 无限 `scale` 循环，等于每帧重做一次高斯模糊的栅格化。
把模糊换成 `radial-gradient`（没有 filter，scale 就是纯合成）：

```css
.oasis-stylus-glow {
    background: radial-gradient(circle, color-mix(in srgb, var(--glow) 70%, transparent) 0%, transparent 70%);
    transition: opacity .6s ease;
}
@media (prefers-reduced-motion: no-preference) {
    .oasis-stylus-glow { animation: oasis-stylus 2.4s ease-in-out infinite; }
}
@keyframes oasis-stylus { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.25); } }
```

### E-3 三处呼吸点 → 一个共用 CSS 类

[:521](../../src/components/OasisResonance.tsx#L521)（转速灯）、
[:668](../../src/components/OasisResonance.tsx#L668)（艺人点）、
[:770](../../src/components/OasisResonance.tsx#L770)（歌名点）三处都是
"`opacity` 在 1 和 0.4 之间无限循环"。合并成一个 `.oasis-pulse-slow`：

```css
@keyframes oasis-pulse-slow { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
.oasis-pulse-slow { animation: oasis-pulse-slow 2.2s ease-in-out infinite; }
```

转速灯那处还顺带在 framer 里动 `backgroundColor` 与 `boxShadow`
（[:525](../../src/components/OasisResonance.tsx#L525)）——那两个不该是关键帧，
应该是状态类上的 `transition`。

### 目标

`grep -c "repeat: Infinity" src/components/OasisResonance.tsx src/components/resonance/*.tsx`
从 `6 + 1` 降到 **0**。framer 只留给有起止、有交互的动画（入场、layout、AnimatePresence）。

---

## 验收清单

- [ ] `npm run lint` / `npm run build` / `npx vitest run` 全过；`lyricTiming.test.ts` 补了新断言
- [ ] `repeat: Infinity` 在 resonance 相关文件里归零
- [ ] Chrome DevTools Performance 录 10s 播放中的时间线：**Layout 事件不应出现在稳态帧里**
      （改之前均衡器每帧都有）
- [ ] 弱网模拟（DevTools → Network → Slow 4G）切一首没听过的歌：葱出现、随缓冲上色、消失
- [ ] 本地已缓存的歌来回切：葱**不出现**（250ms 消抖生效）
- [ ] 间奏期间 Performance 面板里 `LyricField` 的每帧 `setProperty` 从 2 次降到 1 次
- [ ] `prefers-reduced-motion: reduce` 下：葱不摆、间奏弧仍然正确地走进度（走 JS 回退路径）
- [ ] 葱在日夜两态、在最深与最浅的两首曲目情绪色下各看一眼，白绿分界都读得出来
- [ ] 390×844 窄屏下葱不与任何控件重叠

## 提交

```
add negi loader for audio buffering and lyric fetch
```
