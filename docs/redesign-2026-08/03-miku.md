# 03 · Miku：运动学三修 + 台词配比

先说清楚：**这一块的底子已经很专业了**，不要推翻重写。
眨眼是对数正态分布 + 12% 连眨 + 快闭慢开（[blink.ts](../../src/components/OasisMiku/brain/blink.ts)），
呼吸用互质周期（[breath.ts](../../src/components/OasisMiku/brain/breath.ts)），
手臂是拿 `__miku` 逐帧采样校准过的整段 override，动作让位有 180ms 的淡变
（[motionDirector.ts](../../src/components/OasisMiku/brain/motionDirector.ts)）。
缺的不是"更多动作"，是下面三件运动学的事——**其中前两件是实测出来的 bug，不是审美问题。**

---

## 0. 关键前提：pixi-live2d-display 的更新顺序

从 `node_modules/pixi-live2d-display/dist/cubism4.es.js`（`Cubism4InternalModel.update()`）读出来的真实顺序：

```
1  emit('beforeMotionUpdate')
2  motionManager.update()                 ← model3.json 的动作曲线
3  emit('afterMotionUpdate')              ← ★ 本项目的 offsetsRef 在这里施加
4  coreModel.saveParameters()
5  expressionManager.update()
6  eyeBlink.updateParameters()            ← 本项目已置 undefined（Live2DStage.tsx:267）
7  updateFocus()                          ← ★ focusController 在这里写 5 个参数
8  updateNaturalMovements() → breath      ← ★ 库自带的 CubismBreath，本项目没关
9  physics.evaluate()
10 pose.updateParameters()
```

**第 3 步之后还有第 7、8 步。** 这意味着本项目所谓"绝对接管"的 `overrideParam`，
对第 7、8 步碰到的那些参数其实是接管不住的——它们会在之后被再加一遍。

---

## M1 · 库自带的呼吸在和我们的呼吸叠加（一行修复 + 一次重新定标）

### 病因

第 8 步的 `this.breath` 从来没被关掉。它的默认参数（同一个文件里读出来的）是：

| 参数 | peak | weight | 有效幅度 | 周期 | 本项目 `breath.ts` 的幅度 |
|---|---|---|---|---|---|
| `ParamAngleX` | 15 | 0.5 | **±7.5** | 6.5345 | ±1.0 |
| `ParamAngleY` | 8 | 0.5 | **±4.0** | 3.5345 | ±0.6 |
| `ParamAngleZ` | 10 | 0.5 | **±5.0** | 5.5345 | ±0.7 |
| `ParamBodyAngleX` | 4 | 0.5 | **±2.0** | 15.5345 | ±0.3 |
| `ParamBreath` | 0.5 | 0.5 | ±0.25（相加） | 3.2345 | 0–1（override） |

**周期完全一致**（本项目就是照抄 CubismBreath 的互质周期），所以两套呼吸严格同相、直接相加。
结果：`breath.ts` 顶上那句"把角度幅度压到动作曲线的 6%~8%"从来没有生效过——
屏幕上真正的呼吸幅度是 ±8.5，其中 88% 来自库的默认值。

更糟的是 `ParamBreath`：本项目 `overrideParam` 成 `0.5 + 0.5·sin`（0–1），库再**加**上
`±0.25`，于是范围变成 −0.25–1.25，**两端都被钳位**——胸口的起伏在最高最低处各"平顶"一段。
这就是它看起来像在憋气的原因。

### 修

[Live2DStage.tsx:267](../../src/components/OasisMiku/Live2DStage.tsx#L267) 那行 `eyeBlink = undefined` 旁边加一行：

```ts
// 库自带的 CubismBreath 在 afterMotionUpdate 之后才跑（见 updateNaturalMovements），
// 我们的 BreathEngine 拦不住它，而两者周期完全一致 → 严格同相叠加。
// 库的默认幅度是我们的 7~8 倍，ParamBreath 还会把 0–1 的区间顶出钳位。关掉，呼吸只留一套。
(model.internalModel as Cubism4InternalModel).breath = undefined;
```

### 重新定标（必做，不然她会突然变成一根木头）

`breath.ts` 现有的幅度是**在库的呼吸垫底的前提下**调出来的。关掉之后必须往上抬。起手值：

| 参数 | 现在 | 改成 | 依据 |
|---|---|---|---|
| `ParamAngleX` | 1.0 | **3.0** | 约为库默认有效值的 40%——看得见在呼吸，但不再是"摇头" |
| `ParamAngleY` | 0.6 | **1.6** | 同上 |
| `ParamAngleZ` | 0.7 | **2.0** | 同上 |
| `ParamBodyAngleX` | 0.3 | **0.8** | 躯干比头钝，本来就该更小 |
| `ParamBreath` | 0.5 ± 0.5 | 不动 | 关掉库的叠加之后它自然回到干净的 0–1 |

**判据**：静止不动、不放音乐、不碰她，盯 30 秒。要能看出她在呼吸，但说不出"她在动"。
如果你的视线会被牵着走，就是大了。周期一个字都不要改——互质是对的。

---

## M2 · 眼要比头快：接管视线，不再用 focusController

### 病因

第 7 步的 `updateFocus()` 是这么写的（原样抄自库）：

```js
addParameterValueById(ParamEyeBallX,   focus.x);
addParameterValueById(ParamEyeBallY,   focus.y);
addParameterValueById(ParamAngleX,     focus.x * 30);
addParameterValueById(ParamAngleY,     focus.y * 30);
addParameterValueById(ParamAngleZ,     focus.x * focus.y * -30);
addParameterValueById(ParamBodyAngleX, focus.x * 10);
```

眼球和头**共用同一个 `focus.x`，比例锁死在 1:30，同一帧同时到达**。
真人不是这样：眼跳（saccade）30–80ms 就完成，头随后 100–200ms 才跟上，
并且头转过去的同时眼球会反向回中（前庭眼反射）——因为眼睛盯的是**世界里的那个点**，
不是脑袋前方。这个时序差是人眼最敏感的"活着"的线索，锁死比例就等于把它抹掉。

### 修

**① 停止调用 focusController。** 删掉 [useMikuBrain.ts:363](../../src/components/OasisMiku/useMikuBrain.ts#L363)
的 `stage.focus(...)` 与 [:368](../../src/components/OasisMiku/useMikuBrain.ts#L368) 的
`stage.focusNormalized(...)`，并把这两个方法**从 `MikuStageHandle` 里删掉**
（[Live2DStage.tsx:53-56](../../src/components/OasisMiku/Live2DStage.tsx#L53) 与对应实现）。
只要没人调用，`focusController` 恒为 (0,0)，第 7 步加的全是 0，等于不存在——
不需要去覆盖 `updateFocus`。删掉方法是为了防止以后有人把耦合又加回来。

**② 新建 `src/components/OasisMiku/brain/gaze.ts`。**

```ts
// 👀 视线：眼、头、躯干三条不同时间常数的一阶滤波，外加两级幅度门限。
//
// 时序：眼跳 30–80ms 完成，头 100–200ms 后才跟上（所以 τ 差 4 倍）。
// 门限：眼跳幅度小于约 15° 时人只动眼不转头（Guitton & Volle 1987）；再大才带躯干。
//       三级门限 = 三种「注意的程度」，这是免费的表演层次。
// VOR：眼球的目标不是「看向哪」，是「看向哪 减去 头已经转过去多少」——
//      于是眼睛先到位、头追上来时眼球自动回中，一行代码换一整套前庭眼反射。
const EYE_TAU_S  = 0.055;
const HEAD_TAU_S = 0.22;
const BODY_TAU_S = 0.65;
const HEAD_ON = 0.28;   // 归一化幅度超过这里才启动头（≈15°）
const BODY_ON = 0.62;
const VOR = 0.85;       // 1 = 完全代偿；留一点欠补，读起来更「盯着」

/** 软门限：只把超出阈值的那一部分交给下一级，阈值处不跳变 */
const gate = (v: number, on: number) =>
  Math.sign(v) * Math.max(0, Math.abs(v) - on) / (1 - on);

export class GazeEngine {
  private tx = 0; private ty = 0;
  private ex = 0; private ey = 0;
  private hx = 0; private hy = 0;
  private bx = 0; private by = 0;
  private lastBigAt = 0;

  /** 归一化坐标，-1..1，(0,0) 是正前方 */
  look(x: number, y: number) { /* clamp 后写 tx/ty；若 |Δ| > 0.35 记一次「大幅眼跳」 */ }

  /** @returns saccade 是否刚跨过大幅门限——调用方据此决定要不要顺带眨一次眼 */
  update(stage: MikuStageHandle, dtSec: number): { bigSaccade: boolean } {
    const k = (tau: number) => 1 - Math.exp(-dtSec / tau);
    this.hx += (gate(this.tx, HEAD_ON) - this.hx) * k(HEAD_TAU_S);
    this.hy += (gate(this.ty, HEAD_ON) - this.hy) * k(HEAD_TAU_S);
    this.bx += (gate(this.tx, BODY_ON) - this.bx) * k(BODY_TAU_S);
    this.by += (gate(this.ty, BODY_ON) - this.by) * k(BODY_TAU_S);
    this.ex += ((this.tx - this.hx * VOR) - this.ex) * k(EYE_TAU_S);
    this.ey += ((this.ty - this.hy * VOR) - this.ey) * k(EYE_TAU_S);

    stage.overrideParam('ParamEyeBallX', clamp(this.ex, -1, 1), 0.2);
    stage.overrideParam('ParamEyeBallY', clamp(this.ey, -1, 1), 0.2);
    stage.addParam('ParamAngleX', this.hx * 26);
    stage.addParam('ParamAngleY', this.hy * 26);
    stage.addParam('ParamAngleZ', this.hx * this.hy * -22);
    stage.addParam('ParamBodyAngleX', this.bx * 8);
    stage.addParam('ParamBodyAngleY', this.by * 5);
    return { bigSaccade: /* 本帧刚跨门限 */ false };
  }
}
```

**③ 屏幕坐标 → 归一化。** 原来这一步藏在 `stage.focus()` 里（它拿 canvas 的 rect 做换算）。
现在要在 `useMikuBrain` 里做：拿 Live2D canvas 的 `getBoundingClientRect()`，
`nx = (px - rect.left - rect.width/2) / (rect.width/2)`，`ny` 同理并**取负**
（屏幕 y 向下，模型 y 向上）。桌面端指针可能在整个视口任何位置，所以 `nx/ny` 要
`clamp(-1.6, 1.6)` 之后再压回 −1..1（远处的东西不该让她把脖子拧断）。
`Live2DStage` 需要新增一个 `getCanvasRect(): DOMRect | null` 给出这个 rect。

**④ 眼跳带眨眼。** `BlinkEngine` 加一个 `trigger()`（把 `phase` 直接推到 `'closing'`，
`wait` 清零）。`useMikuBrain` 收到 `bigSaccade` 时以 **30%** 概率调用它。
大幅眼跳伴随一次眨眼是真人行为（saccadic suppression），几乎零成本。

**⑤ 触屏的自主张望**不变，只是把 `stage.focusNormalized(...)` 换成 `gaze.look(...)`。

### 判据

指针从她的左边缓慢划到右边：**眼睛先到，头后到，头到位的过程中眼球慢慢回中。**
录屏逐帧看，眼球到位应当比头早 3–6 帧（50–100ms）。做不到就是 `EYE_TAU_S` 太大或
`HEAD_ON` 太小。指针在她脸周围小范围抖动时，**头应当基本不动**，只有眼球在追。

---

## M3 · 重心：站着的人不会一直用同一条腿承重

新建 `src/components/OasisMiku/brain/posture.ts`。这是纯加法，风险最低的一条。

```ts
// 🧍 重心漂移（contrapposto）：周期 30–50s，与呼吸的 3.2/3.5/5.5/6.5/15.5 s 互质。
// 关键是「头反向代偿」——身体往左靠时头微微往右，脊柱才是 S 形而不是一根棍子。
// 这一条比任何新增动作都更能去掉「摆件感」，因为它慢到你不会注意到它在动，
// 只会注意到「她刚才好像换了个站姿」。
const CYCLE_A = 31.7;
const CYCLE_B = 47.3;

export class PostureEngine {
  private t = 0;
  update(stage: MikuStageHandle, dtSec: number) {
    this.t += dtSec;
    const a = Math.sin((this.t * Math.PI * 2) / CYCLE_A);
    const b = Math.sin((this.t * Math.PI * 2) / CYCLE_B + 1.1);
    const w = a * 0.7 + b * 0.3;                    // −1..1，重心在左右之间
    stage.addParam('ParamBodyAngleZ', w * 1.1);
    stage.addParam('ParamBodyAngleX', w * 0.5);
    stage.addParam('ParamAngleZ', -w * 0.6);        // 头反向：脊柱的 S 形
  }
}
```

在 `animateMiku` 里 `breathRef.current.update()` 之后调用。**不让位**——
换重心和呼吸一样，是本底生命噪声，Tap 播放时也不该停。

### 二次运动（试；读不出来就撤，不要硬留）

动作片段是烘焙好的 motion3，**预备动作（anticipation）加不进去**，
而且 `config.motionFadingDuration` 默认 500ms 的交叉淡入会把 90ms 的预备吃掉大半。
更划算的是**收尾的余韵（follow-through）**：`MotionDirector.update()` 里
检测到"动作刚播完、正在交还 Idle"的那一帧，往 `ParamBodyAngleZ` 打一个
`0.8 → 0` 的指数衰减（τ ≈ 0.35s），让身体在动作结束后还晃一下才停。
判据：摸完头之后她"停下来"这件事本身要有个尾巴，不是急刹。

---

## M4 · 两处近乎免费的微动

- **眉毛粉噪**：`ParamBrowLY` / `ParamBrowRY` 现在只由 `MOOD_TARGETS` 驱动，静止时完全不动。
  叠一层三正弦合成的低频噪声（周期 8.3 / 11.7 / 13.1 s，总幅度 **0.03**，左右眉相位差 0.6），
  用 `addParam`。脸就不"僵"了。幅度千万别超过 0.05——那会变成挑眉。
- **视线的落点偏好**：自主张望时不要均匀随机。给三个加权落点：曲库/唱片区（她在听）、
  正在滚动的正文区（她在看你读）、以及正前方（发呆）。权重随 `isPlaying` / `readingRef` 变。
  这一条让"她在看什么"变得有意义，成本只是把 `focusNormalized` 的两个 `Math.random()` 换成一张表。

---

## L · 台词：真正的"腻"不在语气词，在**没有一句具体的话**

### 实测基线

用 `node scripts/check-miku-lines.mjs`（见下）跑 [mikuLines.ts](../../src/data/mikuLines.ts)，
187 句：

| 指标 | 现状 | 目标 | 说明 |
|---|---|---|---|
| **含具体名词/数字** | **2.7%**（5 句） | **≥ 20%** | ← 这是主因 |
| **≤10 字的短句** | **2.7%**（5 句） | **≥ 25%** | ← 这是第二主因 |
| 自嘲/吐槽 | 4.8% | ≥ 15% | |
| 含「你」 | 33.2% | ≤ 25% | 三分之一的句子在直接对你说话 |
| 句末语气助词 | 23.0% | ≤ 18% | 不是主因，但可以再收一点 |
| 承诺/守候句式 | 6 句 | ≤ 2 句 | |
| 句长中位数 | 17 字 | 12–14 字 | |

**诊断**：187 句里只有 5 句在 10 字以内，中位数 17 字，每一句都是**完整、温软、指向"你"的
陈述句**。俏皮的节奏来自长短交错和突然的具体，现在两样都没有——所有句子长得一样、
软得一样、都在关心你。这就是"腻"的机制，不是"啦"字太多。

（顺带：`MIKU_LONGPRESS_HEAD_LINES` 整池写成了缠绵——「别停呀……这样摸着，好舒服。」
这不是俏皮，是另一个类型的内容。这池必须重写。）

### 改写规则

1. **每 10 句的配比**：4 句纯观察（不带助词，只陈述一个具体的东西）／3 句自嘲或吐槽
   （**对象是她自己或这个网站，绝不是用户**）／2 句关心（**不含承诺**）／1 句留白
   （半句话、一个拟声、或者干脆一个词）。
2. **具体名词清单**（她是虚拟歌姬，让她说自己的东西）：39 / A4=440Hz / BPM / 采样率 /
   VOCALOID / 2007 年 8 月 31 日（她的发售日，`MIKU_DATE_LINES` 里已有这一条）/ 双马尾 /
   葱 / 像素 / 缓存 / 电流 / 服务器 / 这个站上真实存在的东西（唱片、灯笼、星图、节气）。
   **不要编设定**，只用公认事实和这个站里真的有的东西。
3. **砍承诺**。"我一直都在""我陪着你""别太勉强自己"是 emotional labor，不是俏皮。
   全库最多留 2 句，且只能出现在最高亲密度池里当稀有掉落。
4. **`_CLOSE` / `_DEEP` 两档的方向从"更依恋"改成"更放松、更敢开玩笑"。**
   真正的熟人是敢损你的。现在这两档的注释里写着"近乎依恋"——那句注释也要改掉。
5. **长短交错**。每个池子里至少有一句 ≤8 字。

### 六个具体的改写样例

| 现在 | 改成 | 改了什么 |
|---|---|---|
| 别停呀……这样摸着，好舒服。 | 手停了。……我没催。 | 去 ASMR，加自嘲，8 字 |
| 轻一点啦……我的心跳，好像被你数到了。 | 我的心跳是采样率，别乱数。 | 加具体，去撒娇 |
| 这样的温柔，隔着屏幕也一点没凉掉。 | 隔着一层玻璃还有温度，物理上说不通。 | 加吐槽，保留原意 |
| 今晚也辛苦啦，我在这儿呢。 | 辛苦了。要吵的还是安静的？ | 去承诺，换成一个真实的选择 |
| 喝过水了吗？我在这陪你一会儿。 | 喝水了没。 | 5 字。留白就是关心 |
| 早上好呀，今天也要元气满满哦！ | 早。我今天调子偏高，你担待。 | 去口号，加具体（音高） |

### 校验脚本（新建 `scripts/check-miku-lines.mjs`）

把上面那张表的目标写成阈值，不达标 `process.exit(1)`。这样 Codex 改完能自己知道够不够，
不用靠"感觉"。要点：

- **只解析数组字面量里的字符串**，不要像草稿版那样正则扫全文——注释里的中文会被算进去
  （草稿版 187 句里混进了 3 句注释）。用 `//` 与 `/* */` 先剥注释，或直接
  `import('../src/data/mikuLines.ts')` 走 tsx/vite-node。
- 输出每项指标的当前值、目标值、以及**不达标时列出反例句子**——只报数字没法改。
- 挂进 `package.json` 的 `scripts` 里叫 `check:miku`。**不要挂进 CI 拦提交**，
  这是写作辅助，不是门禁。

---

## 不许动的东西

- `blink.ts` 的分布与三段时长（`CLOSING_S` / `CLOSED_S` / `OPENING_S`）。只加 `trigger()`。
- `breath.ts` 的五个周期。只改幅度。
- `MotionDirector` 的让位淡变常数 `YIELD_TAU_S = 0.18`。
- `overrideParam` 的 `EMOTION_YIELD_FLOOR` 机制——摸头当下就要看到脸红，这条是对的。
- 手臂那段 `override`（`useMikuBrain.ts:426-435`）与它上面那段注释。那是实测校准过的。

## 验收清单

- [ ] `npm run lint` / `npm run build` / `npx vitest run`（含 `blink.test.ts`）全过
- [ ] 关掉库呼吸后重新定标：静止 30 秒，看得出在呼吸、但视线不被牵走
- [ ] `ParamBreath` 用 `__miku` 采样一段，确认 0–1 之间是干净的正弦，两端不再平顶
- [ ] 视线：录屏逐帧，眼球比头早 3–6 帧到位；小幅移动时头基本不动
- [ ] 重心：静置 2 分钟录屏，能看到至少一次左右换重心，且过程中察觉不到"它在动"
- [ ] 移动端（390×844，触屏）帧率不低于改动前——新增的三个引擎都是纯算术，不应有影响
- [ ] `prefers-reduced-motion: reduce` 下 Live2D 舞台的既有降级路径没被破坏
- [ ] `node scripts/check-miku-lines.mjs` 六项指标全部达标
- [ ] **通读一遍全库**：不能有任何一句读起来像在跟恋人说话

## 提交

```
improve miku motion naturalness and dialogue tone
```
