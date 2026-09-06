# 2026-08 改造 · 总纲

给实现方（Codex）的交接文件。四个独立的改造，**分四次提交**，互不依赖，可以任意顺序做，
但建议按编号来——01 风险最低、收益最直观，03 最需要反复目视。

| # | 规格 | 范围 | 提交信息 |
|---|---|---|---|
| 01 | [01-annulus.md](01-annulus.md) | 知识星图年轮盘：取景、墨度、字体、贴图 | `refine constellation annulus: framing, ink ladder, paper grain` |
| 02 | [02-negi.md](02-negi.md) | 等待态大葱 + 间奏扫弧优化 + 动画性能三修 | `add negi loader for audio buffering and lyric fetch` |
| 03 | [03-miku.md](03-miku.md) | Miku 运动学（呼吸/视线/重心）与台词配比 | `improve miku motion naturalness and dialogue tone` |
| **04** | [04-sky-ye.md](04-sky-ye.md) | **星野：星图第三轮重做**（星座版面取代年轮盘） | `rebuild constellation as an engraved sky chart` |

## 每次提交都必须守住的东西

1. **星图五条规矩**（[OasisOrchard.tsx](../../src/components/OasisOrchard.tsx) 文件头）。01 全程受它约束；
   **04 明确取代其中第 5 条**（年轮盘是唯一底图），其余四条继续有效，理由见 04 §2。01 原文：
   字号只有 44/16/13/11/10，墨度只有 `--sky-o1..o5` 五档，线宽只有 `--sky-w1..w3`，圆角只有 2px 和 0。
   **本次改造不新增任何一档。** 所有"提高对比度"的动作都是在既有五档之间换档，不是造新值。
2. **测试**。`src/lib/constellation.test.ts` 守着两条不变量（新增文章不移动旧星、任意两星间距 ≥ `MIN_SEP`）。
   01 不碰 `src/lib/constellation.ts` 的落座算法，所以这两条自然成立；跑一遍确认，别改测试。
   `npm run build`（tsc -b + vite build）与 `npm run lint` 每次提交前都要过。
3. **移动端性能**。噪点/纹理层一律 `hidden md:block`；动画只用 `opacity` / `transform`；
   触屏走轻量分支（`pointer: coarse`）。本次新增的任何一条动画都不许动 `width/height/top/left/filter`。
4. **`prefers-reduced-motion`**。[index.css](../../src/index.css) 底部那条全局规则会把所有 CSS 动画
   压成 0.01ms 并只播一次。**这意味着任何"用 CSS 动画表达进度"的方案在 reduce 下会瞬间跳到终点**，
   02 里的间奏扫弧改造必须为此单开一条 JS 回退路径（规格里已写明）。
5. **JSX 里 `{cond && (` 之后的第一行不能放 `{/* */}` 注释**，要用 `//`。这个仓库踩过三次。

## 已经拍板的设计决定（实现方不必再问）

- **"贴图"取纸纹 + 闲章**（01 的 E、F 两节），不做二十四节气小图元——24 枚图元要画得同质极难，
  且贴着"昼夜是同一张天、不为某一态加形状"那条规矩的边。
- **缓冲进度读真实的 `audio.buffered`**，不做假的不确定动画。读不到就退到"只摇不长"的静态态。
- **间奏扫弧不换成葱。** 那个弧已经在做正确的事（它读出了"还剩多久"），02 只优化它的驱动方式。
- **台词库全库 162 句过一遍配比，但真正重写约 40 句**，其余只做删减和去助词。

## 验收的总口径

每次提交都要在 `1280×720` / `1440×900` / `390×844`（iPhone 14 Pro 宽）三个尺寸下、
日夜两态各看一遍。截图留档。只在自己机器上"看着挺好"不算验收。

## 参考与出处

不是用来"致敬"的，是每一条设计决定背后真实的依据。改的时候如果拿不准，回去看这一列。

**年轮盘（01）**
- **杉浦康平**的曼荼罗式圆形信息图——年轮盘的直系祖宗，"一图之内多重同心编码"这个范式就是他立的。
  半径编一层意思、角度编另一层、外环再编第三层，正是这里在做的事。
- **苏州石刻天文图（1247）** 与 **Urania's Mirror（1824）**——星图的注记语法：
  主星写名、次星只留一个点、刻度线分主次两档。"不为每颗星都写字"那条规矩来自这里。
- **原研哉《白》**——"白不是没有东西，是被边界定义的空"。01-A 那条取景修复的全部理由。
- **Nadieh Bremer** 的径向数据可视化（Data Sketches 系列）——密度弧、径向标注避让的现代实践。
- WCAG 2.2 **1.4.11 Non-text Contrast**（3:1）——01-B 换档的硬下限。

**等待态与动效（02）**
- **中村勇吾 / tha ltd.** 的克制动效：动画只在"有事情发生"时出现，不做常驻装饰。
  02-E 把 6 个常驻无限循环压成 0 就是这条。
- Web Almanac / Chrome 团队关于 **compositor-friendly properties** 的老结论：
  只动 `transform` / `opacity`；`height` 触发 layout，`filter` 上动 `scale` 触发重栅格化。
- **Loituma / 甩葱歌**是这根葱的出处，但**只取形不取梗**——不旋转。

**Miku（03）**
- **迪士尼动画十二法则**里的 anticipation / follow-through / secondary action。
- **Guitton & Volle (1987)**，头眼协同的幅度阈值（约 15° 以内只动眼不转头）——M2 门限的出处。
- **前庭眼反射（VOR）**——M2 里"眼球目标 = 注视点 − 头已转过的量"那一行的物理依据。
- **Live2D Cubism SDK** 官方 `CubismBreath` / `CubismEyeBlink` 的默认参数——
  本项目照抄了它的互质周期（对的），但没关掉它本人（M1 要修的 bug）。
- **对比参照**：`live2d-widget` 那类挂件的做法是"鼠标动 → 头跟着转"，那正是要摆脱的东西。

## 顺手可看的东西

- [negi-preview.html](negi-preview.html)：02-B 那组大葱坐标的验证页，
  丢进 `public/` 或用任意静态服务器打开即可，三个尺寸 × 三种进度并排。
