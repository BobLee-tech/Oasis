# 01 · 年轮盘：取景、墨度、字体、贴图

只动 [`src/components/OasisOrchard.tsx`](../../src/components/OasisOrchard.tsx) 与
[`src/index.css`](../../src/index.css) 的 `.oasis-sky` 段，外加两个新素材文件。
**不动 [`src/lib/constellation.ts`](../../src/lib/constellation.ts)**，因此两条几何不变量自动成立。

---

## 0. 现状实测（2026-08-27，Chrome，1280×720，日间态，8 篇文章 / 处暑）

在页面里跑脚本量出来的，不是目测：

| 项 | 实测值 | 判断 |
|---|---|---|
| 星图内容占屏 | 内容包围盒 570×347，占 1280×720 的 **21.5%**，起点 x=435 | 主语只占五分之一，且偏右下 |
| `--sky-scale` | **0.4837** | 缩放补偿本身是对的：13/11/10px 在屏幕上确实是 13/11/10px |
| 年轮外环屏幕直径 | **311px**（2 × 322 × 0.4837） | 舞台高度 ~624px，环只占 50% |
| 节气名（非当前） | 11px，`o3`，对比度 **2.13:1** | 低于 WCAG 1.4.11 对非文本图形的 3:1 下限 |
| 带名 | 13px，`o3`，对比度 **2.13:1**，字体 **`ui-sans-serif`** | 全 SVG 唯一的无衬线，是漏字体不是风格 |
| 「今天」 | 10px mono，`o4`，对比度 **2.48:1** | 与晷针重复表达同一件事 |
| 星名 | 13px，`o5`，对比度 **12.48:1** | 与骨架差 **5.9 倍** |

**结论**：整张图只有两档墨——几乎看不见的骨架（2.1–2.5:1）和纯黑的名字（12.5:1），中间全空。
所以画面读起来是"几行黑色诗句浮在白纸上"，年轮盘退成了背景纹理。这不是"克制"，是"没安排"。

---

## A. 取景：`ringBounds` 改成各向异性（收益最大的一条）

### 病因

```ts
// OasisOrchard.tsx:462
const ringBounds = useCallback(() => {
  const half = (SKY_RADIUS + LABEL_GUTTER) * 1.06;
  return { x: CENTER.x - half, y: CENTER.y - half, width: half * 2, height: half * 2 };
}, []);
```

`LABEL_GUTTER = 150` 是**横向**星名栏的预算（见 `OasisOrchard.tsx:234-235`，星名走屏幕空间的
左右 gutter，引线从 `CENTER.x ± SKY_RADIUS ± LABEL_GUTTER` 出发）。**纵向根本没有星名栏**，
却也留了 150。而 `fit()` 里 `vp.h`（≈508）远小于 `vp.w`（≈1160），**纵向是瓶颈**——
于是每一侧多留的 `(150 − 34) × 1.06 ≈ 123` 个 viewBox 单位，直接从年轮的尺寸里扣掉了。

### 改法

```ts
// 节气名写在 SKY_RADIUS + 22，字高约 11px/scale ≈ 22 单位 → 半高 11，再留 12 单位余量。
// 纵向没有星名栏（星名走左右 gutter），不该按 LABEL_GUTTER 留白。
const TERM_GUTTER = 34;

const ringBounds = useCallback(() => {
  const halfX = (SKY_RADIUS + LABEL_GUTTER) * 1.06;
  const halfY = (SKY_RADIUS + TERM_GUTTER) * 1.06;
  return { x: CENTER.x - halfX, y: CENTER.y - halfY, width: halfX * 2, height: halfY * 2 };
}, []);
```

`place()` 仍把包围盒中心对准 `vp.cx/cy`，中心还是 `CENTER`，其余逻辑一行不动。

### 预期与验收

| | 现在 | 目标 |
|---|---|---|
| `--sky-scale` @1280×720 | 0.484 | **0.66 ± 0.04** |
| 年轮屏幕直径 | 311px | **420 ± 25px** |
| 内容占屏 | 21.5% | **38%–44%** |

用这段脚本量（在 `#/constellation` 页面的 console 里跑）：

```js
const c = document.querySelector('.oasis-sky-canvas');
const els = [...c.querySelectorAll('svg path, svg circle, svg text')];
let a=[1e9,1e9,-1e9,-1e9];
for (const el of els){const r=el.getBoundingClientRect(); if(!r.width&&!r.height)continue;
  a=[Math.min(a[0],r.left),Math.min(a[1],r.top),Math.max(a[2],r.right),Math.max(a[3],r.bottom)];}
console.log({skyScale:getComputedStyle(c).getPropertyValue('--sky-scale'),
  box:[(a[2]-a[0])|0,(a[3]-a[1])|0], fill:(((a[2]-a[0])*(a[3]-a[1]))/(innerWidth*innerHeight)).toFixed(3)});
```

**风险**：某些窗口比例下横向可能反过来成为瓶颈（`vp.w / (halfX*2*k) < vp.h / (halfY*2*k)`），
那时圆不会比现在大。四个尺寸都要看：1280×720、1440×900、1024×768、390×844。
窄屏（`narrow`）分支同样走这个 `ringBounds`，要确认年轮没有被底部星卡的 62vh 顶出画外。

---

## B. 墨度：把骨架从第 3 档抬到第 4 档

**不新增档位**，只换档。`--sky-o4 = .62` 在日间实测对比度 **3.88:1**——干净地越过 1.4.11 的
3:1 下限。它到不了正文 AA 的 4.5:1，这是刻意的：这些是**地图注记**不是正文，
推到 `o5` 会和星名同分量，等于把刚建立的层级又拆掉。当前节气/悬停节气本来就是
`accent-text` 实心（4.81:1），可读性的兜底在那里。

改动清单：

| 位置 | 现在 | 改成 |
|---|---|---|
| `OasisOrchard.tsx:1010-1012` 带名 `<text>` | `className="oasis-sky-label"`，`fillOpacity="var(--sky-o3)"` | `className="font-serif oasis-sky-label"`，`fillOpacity="var(--sky-o4)"`，`letterSpacing` `.12em → .18em` |
| `OasisOrchard.tsx:1067-1071` 节气名 `<text>` | 非当前：`opacity="var(--sky-o3)"` | `opacity="var(--sky-o4)"` |
| `OasisOrchard.tsx:1050-1056` 「今天」 | 10px mono 标注 | **整段删掉**（连同 `<text aria-hidden>` 元素） |
| `OasisOrchard.tsx:1013` 密度弧非悬停 | `opacity="var(--sky-o2)"` | 保持 `o2`——它是面不是线，面在 `.16` 已经够重 |

「今天」删掉的理由：晷针（`OasisOrchard.tsx:1040-1044`）已经从观测点贯穿到环外指向今日角度，
两个字在说同一件事，而且它是全图对比度最低的一处（2.48:1）。删掉之后画面少一处噪音，
"今天在哪"由那根针独占，读法反而更硬。**如果实现后觉得针太弱**，允许把针的
`opacity` 从 `o3` 提到 `o4`，但不许把字加回来。

改完重跑一次对比度脚本（把上一节的脚本换成读 `fill` + `fillOpacity` 那版），
确认没有任何一处 SVG 注记低于 3:1。

---

## C. 带名子午线：择位 + 补上那颗死掉的图例点

### C-1 死字段

`OasisOrchard.tsx:376` 的 `bands` memo 算了 `fill: starFill(...)`，注释写着
"带名旁边那一点色 = 这条带上的星色……于是 gutter 本身就是图例"，
**但 JSX 里从来没有渲染这颗点**（全文件搜不到 `band.fill` 的使用）。二选一：

- **推荐**：把它画出来。在带名 `<textPath>` 之前，沿同一条弧、在 `startOffset` 稍靠前的位置
  放一个 `r: var(--sky-r5)` 的小圆，`fill={band.fill}`。图例与坐标系合一，这正是注释想要的效果。
- 或者删掉 `fill` 字段与那三行注释。

### C-2 子午线择位

三条带名现在全排在 `arcPath(band.center, -Math.PI * .62, -Math.PI * .38)`，即正上方 12 点钟，
三行叠成一列。**同一条子午线上堆注记本身是正确的制图法**（等同于地图上一条经线写完所有纬度），
问题是这条子午线选得太随意——它可能正好压在写作最密的那段星群上。

改法：一次性（`useMemo`，依赖 `posts`）从 `densityByTerm` 里挑**写作密度最低**的那个节气所在角度，
量化到 8 个候选方位（`-π/2 + k·π/4`）之一，作为带名子午线的中心角，弧宽仍是 ±0.12π：

```ts
const bandMeridian = useMemo(() => {
  const cands = Array.from({ length: 8 }, (_, k) => -Math.PI / 2 + k * Math.PI / 4);
  // terms 里已有每个节气的 a 与 density；对每个候选角取最近的节气密度，选最小的那个
  let best = cands[0], bestD = Infinity;
  for (const a of cands) {
    const d = /* 最近节气的 density */;
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}, [terms]);
```

然后 `arcPath(band.center, bandMeridian - Math.PI * .12, bandMeridian + Math.PI * .12)`。

**注意**：弧的方向决定文字是正着还是倒着。子午线落到下半圆时要把弧的两个端点对调
（`arcPath(r, a1, a0)`），否则带名会上下颠倒。这一条必须目视四个方位都确认一遍。

---

## D. 空节气也要有刻度

现在 8 篇文章全挤在立秋/处暑，年轮 11/12 的密度弧是**不画**（`density = 0` → `inner === outer`，
路径退化）。读者看到的是"这块没画"，而不是"这段没写"。

在密度弧那个 `<g>` 里，给每个节气无条件先画一条基准弧——贴着 `SKY_RADIUS - 14` 往内 2 单位，
`opacity="var(--sky-o1)"`。有文章的地方基准弧被密度弧盖住，没文章的地方留下一道极淡的底。
代价：24 条短路径，静态，零动画。

```tsx
{terms.map(({ t, a0, a1 }) => (
  <path key={`floor:${t.name}`} d={annularSector(a0 + .006, a1 - .006, SKY_RADIUS - 16, SKY_RADIUS - 14)}
        fill="currentColor" opacity="var(--sky-o1)" />
))}
```

---

## E. 贴图之一：纸纹（本次"贴图"的主体）

### 定位

全站已经有一层 `.oasis-noise`（[App.tsx:36-43](../../src/App.tsx#L36)，`/textures/noise-128.png`，
3.5% 不透明度，`z-50`，`hidden md:block`）——那是**胶片颗粒**，铺在所有东西之上。
年轮要的是另一种东西：**这张图印在什么纸上**。所以它必须在 SVG 之下、只属于 `.oasis-sky`、
用 `multiply` 融进天色，而不是浮在上面。

### 素材

新增 `public/textures/paper-laid-256.png`：256×256 可平铺，灰度，模拟宣纸/和纸的**帘纹**——
一组间距约 3px 的极淡竖向条纹 + 一层低频纤维斑驳。参考对象是宣纸迎光时的 laid lines，
不是水彩纸的粗颗粒。文件应 < 12KB（灰度 PNG，8-bit，可以 `pngquant`）。

> 生成方式随实现方便：Photoshop/Procreate 手做，或用 SVG `feTurbulence`
> （`baseFrequency="0.9 0.02"`, `numOctaves="2"`）离线烘焙成 PNG。
> **不要在运行时用 SVG filter** ——那是每帧的 GPU 开销，而这层完全是静态的。

### 接法

```css
/* index.css，紧跟 .oasis-sky 的 background 定义之后 */
.oasis-sky::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image: url('/textures/paper-laid-256.png');
    background-repeat: repeat;
    mix-blend-mode: multiply;
    opacity: .05;
}
@media (max-width: 767px) { .oasis-sky::before { display: none; } }
.dark .oasis-sky::before { mix-blend-mode: screen; opacity: .035; }
```

夜间用 `screen` 而不是 `multiply`：深底上 multiply 等于什么都没有。这不违反
"昼夜是同一张天只换光"——纹理的**几何**两态完全一致，换的只是它怎么和底色合成。

`.oasis-sky` 需要 `position: relative`（当前它是 `absolute inset-0`，已经满足）。
`::before` 不参与命中（`pointer-events: none`），也不进 `.oasis-sky-canvas`，
因此**不随相机缩放**——纸不会被放大，这正是对的：纸是介质，不是内容。

### 验收

关掉这层与打开这层各截一张图对比。判据是：**关掉时画面"变干净了"而不是"变清楚了"**。
如果打开后任何一处注记的可读性下降，把 opacity 降到 .035 再试；还不行就说明纹理本身
频率太高，重做素材，不要靠继续降 opacity 抢救。

---

## F. 贴图之二：一枚闲章

右下角（版脚控件之上、不与之重叠）一枚朱红方印，边长 32px 屏幕恒定，`opacity: .06`，
内容取「绿洲」二字或数字「39」。这是中式版画的收尾语法——一整幅画的落款，一枚就够，
它同时解决"右下角那片空白没有收束"的问题。

实现要点：
- 放在 `.oasis-sky` 的 HTML 层（不是 SVG 画布层），`absolute right-14 bottom-24 z-20`，
  `pointer-events-none`，`aria-hidden`。**不随相机走**。
- 颜色用 `--sky-pending`（`#C2566B` / 夜间 `#F2A9BD`）——它已经是"全图唯一的第二色"，
  再引入一个真朱红会破坏色彩预算。
- 窄屏隐藏（`hidden md:block`）。
- 素材形式：内联 SVG 路径（篆书两字自己描一遍），或一张 64×64 的 PNG。**不要用字体渲染**——
  篆书字体不可控，且会引入一个新的字体依赖。

---

## G. 题记栏对齐（可选，做不动就跳过）

`<header>` 在 `left-9 top-[5.5rem] md:left-14 md:top-24`，而 `fit()` 里的
`GUTTER_X = 56` 是给这一栏留的版心。两个数字各写各的：`md:left-14` = 56px 是巧合对上的，
`top` 则完全没有对应关系。把 `GUTTER_X` 提成一个共享常量并让 header 用同一个值，
再把题记的最大宽度（`max-w-[15rem]`）也纳入 `viewport()` 的 `gutter` 计算
（`gutter = GUTTER_X + 240`），年轮才真的"避开"了题记而不是"碰巧没压上"。

做这条要重新量一遍 A 节的三个指标——它会让 `vp.w` 变小，可能把瓶颈从纵向切回横向。

---

## 不许动的东西

- `src/lib/constellation.ts` 的任何函数。角度=日期、半径=分类带、贪心落座，一行不改。
- `.oasis-sky-canvas` 上的 `--sky-name/-meta/-micro/-hair/-r1..5` 声明位置。
  自定义属性的 `var()` 在**声明它的元素**上就完成替换，挪到 `.oasis-sky` 会被固化成 `calc(13px / 1)`。
- 相机不进 React 那条规矩：`viewRef` + 直接写 `style.transform`，星卡跟随挂在 `write()` 末尾。
- `--sky-o1..o5` 的五个数值本身。

## 验收清单

- [ ] `npm run lint` 零报错，`npm run build` 通过，`constellation.test.ts` 全绿（不改测试）
- [ ] A 节脚本：`--sky-scale ≥ 0.62`，内容占屏 ≥ 0.38，四个尺寸各跑一次
- [ ] 对比度脚本：SVG 内所有注记 ≥ 3:1
- [ ] 带名字体是 `EB Garamond` 不是 `ui-sans-serif`
- [ ] 带名子午线在四个方位下文字都不倒置
- [ ] 日夜两态各截图；纸纹在夜间可见但不发灰
- [ ] `prefers-reduced-motion: reduce` 下页面无异常（本次改动全是静态的，应当零差异）

## 提交

```
refine constellation annulus: framing, ink ladder, paper grain
```
