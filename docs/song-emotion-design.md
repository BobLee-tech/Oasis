# 曲目情绪的多维标注，以及 Miku 怎么用它（方案 v1，2026-10-08）

> **状态**：§9 已拍板（维度名照用；felt 走方案 A；段落弧线做）。**P0、P1 已落地**（2026-10-08），**P2、P3、P4 已落地**（2026-10-09），**P5 已落地**（2026-10-10，§15）：
> 推导核心在 `scripts/lib/mood-core.mjs`（类型 `mood-core.d.mts`），构建脚本与前端 `trackMood.ts` 共用同一份。

> 范围：`music-data/tracks/<id>.json` 的 `mood`、曲目工坊的标注页、`src/lib/trackMood.ts`、
> Miku 的情感模型（`brain/affect.ts`）、粒子、律动与台词规则。
> 与 [miku-design.md](miku-design.md) A2/A3 和 [music-design.md](music-design.md) 的关系：本文替换
> A2.2 里 `feel` 这一行与 A2.4，扩展 A3。A2.1 的四条原则不变，**尤其是「每个字段都必须有读它的模块」**，
> 所以下面每个新字段都写明了谁读它。

---

## 0. 现状的问题（都有出处）

| # | 问题 | 证据 |
|---|---|---|
| 1 | **一个标签装了五种情绪。** `tense` 成了「负面且有劲」的垃圾桶 | 110 份草稿里 tense 18 首：夜紛い、僕は音楽を辞めた（愤怒）、昼鳶（嫉妒）、踊ろうぜ（自嘲）、神様のダンス（倔强）、思想犯（冷硬）、ピアス（反驳）。Miku 对它们一律说「绷得很紧，鼓点一下一下的」、放火花 |
| 2 | **缺「燃」这一类** | `trackMood.ts` 的注释自己写了：没标的燃歌按 VA 最近邻「会全落到紧绷，满屏火花」，于是只能把缺省效价抬到 +0.15 来绕开 |
| 3 | **词和曲说的不是一回事，单个 valence 装不下** | 踊ろうぜ 的草稿依据原文：「歌词自嘲与放弃；曲风轻快」。最后只能给 −0.3 一个数 |
| 4 | **整首一个值，副歌和主歌同一个心境** | `sections` 已经 105/110 首有了，但只用来放大律动（`rhythmGain`）；心境目标整首不变 |
| 5 | **她的脸做不出混合情绪** | `faceFor` 是 VA 四角双线性插值，「嘴角上扬 + 八字眉」（切ない）在这个平面上不存在 |
| 6 | **标注几乎是空的** | 110 首里人标 mood 的只有 1 首；草稿 110 首。新方案如果更贵，只会更空 |

第 6 条决定了整个方案的约束：**维度可以变多，但标一首的成本必须比现在低**。

---

## 1. 参照了什么，取什么，不取什么

| 参照 | 它的做法 | 这里取 | 不取 |
|---|---|---|---|
| **GEMS-9**（Zentner 等 2008，音乐诱发情绪量表） | 9 类，每类 1–5 打强度，可同时多类 | 从「单选」改成「多选 + 强度」；补上原 7 类缺的 **力量 power** 与 **超然 transcendence** | 1–5 太细，改 0–3 |
| **Cowen 等 2020《What music makes us feel》**（PNAS）与配套的交互情绪地图 | 13 维；情绪是**连续混合**而不是互斥的桶，地图上每首按混合比例着色、类与类之间是渐变 | 混合向量；**不甘 / 挑衅（defiant）** 这一维——它在 Cowen 的 13 维里叫 indignant/defiant，正好接住问题 1；工坊里用混合色预览 | 情色、恐怖、滑稽等与这个曲库无关的维 |
| **Plutchik 情绪轮** | 强度分三档；相邻两类组合有名字（dyad） | **复合情绪命名**：两类同时够强时有个名字（切ない、释然…），给台词和曲目卡用 | 八基本情绪本身（为面部识别设计，不为音乐） |
| **Gabrielsson 2002：感知情绪 vs 诱发情绪** | 歌「表达」的情绪和它「让你感到」的情绪是两回事（悲伤的歌常让人平静） | 分两层：`feels`（歌表达的，公开）和 `felt`（它让你怎样，私密、只给站主模式） | — |
| **MediaEval / DEAM 连续情绪标注** | 逐秒标 VA，情绪随时间走 | **段落弧线**：情绪随段落变 | 逐秒标注（太贵）；只按段落标「增量」 |
| **Musicovery 情绪板** | 一块 2D 板，拖一个点就是心境 | 工坊里 valence/arousal 用 2D 板代替滑条；词/曲两个点可以拉开 | — |
| **歌词 + 音频双模态情绪识别**（Hu & Downie 2010 等 MIREX 研究） | 音频对唤醒度贡献大，歌词对效价贡献大 | 拆 `lyricValence` / `soundValence`，与 A2.1「arousal 自动算、valence 人标」一脉相承 | — |
| **Spotify Audio Features**（energy / danceability / acousticness…，2024 年底对新应用关闭） | 可算的情绪相关量全部自动算 | 思路已在用（arousal、contrast） | 不再加新的自动量：现有两个已经够驱动身体 |

---

## 2. 新的 `mood` 结构

### 2.1 情绪维度：10 个，强度 0–3

| key | 中文 | 来源 | 典型（来自现有草稿与专辑注记） |
|---|---|---|---|
| `tender` | 温柔 | GEMS | — |
| `nostalgic` | 怀念 | GEMS | エルマ 整张 |
| `sad` | 哀伤 | GEMS | — |
| `peaceful` | 宁静 | GEMS | — |
| `joyful` | 雀跃 | GEMS | — |
| `tense` | 不安 | GEMS（收窄为「悬着、焦躁」，不再兼任愤怒） | 罪と罰、心懐サミット |
| `wonder` | 奇妙 | GEMS | 飛行 |
| `power` | 燃 | GEMS，新增 | Miku 的高能量曲、老人と海 |
| `transcendence` | 空灵 | GEMS，新增 | 纯器乐、ノーチラス 一类 |
| `defiant` | 不甘 | Cowen，新增 | 僕は音楽を辞めた、夜紛い、負け犬にアンコールはいらない、思想犯 |

**规矩**：一首最多 3 个非零（工坊与 lint 警告，不硬拒）。0 = 没有，1 = 有一点，2 = 明显，3 = 就是它。

### 2.2 schema

```jsonc
"mood": {
  "feels": { "nostalgic": 3, "tender": 2, "sad": 1 },  // 新：替代单个 feel
  "valence": -0.2,          // 保留：整体（不填时 = 两个分量的平均）
  "lyricValence": -0.6,     // 新，可选：词
  "soundValence": 0.4,      // 新，可选：曲；不填 = valence
  "arc": [                  // 新，可选：按段落写「这一段多了什么」，只写增量
    { "at": "chorus", "feels": { "power": 2 }, "da": 0.3 },
    { "at": "outro",  "feels": { "peaceful": 2 }, "dv": 0.2 }
  ],
  "imagery": ["rain", "letter"],  // 新：自动 + 可修
  "sure": false,                  // 新，可选：「我自己也说不准」
  "arousal": …, "bpm": …, "sections": …, "contrast": …, "season": …, "time": …   // 不变
}
```

**向后兼容**：`resolveTrackMood` 派生 `feel = argmax(feels)`（并列取表里靠前的），旧档案里的 `feel: "x"` 读作
`feels: { x: 3 }`。现有 164 条规则、`RHYTHM_BY_FEEL`、`particleForFeel` 一行不改照样能跑——新能力是叠上去的。

`felt`（它让你怎样）**不写进档案**：档案进 git、生成文件是公开 chunk。它存 Supabase（§6 方案 A），
档案里出现 `felt` 会被构建校验拦下。

`arc.at` 取 `intro | verse | pre | chorus | bridge | outro` 或 `chorus#2`（第几次）。`sections` 现在只有副歌区段，
P3 里把它扩成带标签的段落（歌词重复块 = chorus，块前 2 行 = pre，末段副歌后 = outro，其余 verse；纯器乐只有 intro/outro）。

### 2.3 复合情绪（派生，不存）

两类都 ≥ 2 时命名；只在 `sure !== false` 且来源是人标或专辑时对外说：

| id | 名字 | 条件 | 曲目卡 | Miku 的身体 |
|---|---|---|---|---|
| `setsunai` | 切ない | sad + tender | 切ない | 嘴角上、眉成八字 |
| `release` | 释然 | sad + peaceful | 释然 | 先垂眼，副歌后慢慢抬眼 |
| `fired` | 燃 | power + joyful | 燃 | 点头加重、音符 |
| `youth` | 青春 | joyful + nostalgic | 青春 | 晃得轻快、偶尔抬头远望 |
| `hollow` | 空 | nostalgic + transcendence | 空 | 视线放远、眨眼变慢 |
| `smolder` | 憋着火 | tense + defiant | — | 下巴微抬、少笑 |
| （`split`） | 笑着说丧气话 | `|soundValence − lyricValence| ≥ 0.6` | 曲亮词暗 / 曲暗词亮 | 身体跟着晃，眉头是皱的（§3.4） |

多个复合同时成立时取两维强度和最大的，再并列取表里靠前的。`split` 是独立的布尔量，不占 `blend`。
复合情绪只认写出来的向量（人标或专辑），VA 猜的单维不会凑出组合。

---

## 3. Miku 怎么用（算法）

### 3.1 心境从「一个 VA 点」变成「VA 点 + 情绪向量」

```
m  : VA 点（不变，τ = 40s）
E  : 10 维向量，每维 0..1（新，τ = 25s，比 VA 快——情绪色调先变，底色后变）
目标 E* = 播放中 ? normalize(feels ⊕ arc[当前段]) × r : 性格基线（温柔 0.2、宁静 0.15，其余 0）
dE/dt = (E* − E) / τ
```

`r` 是共鸣系数（§3.5）。交互冲量照旧推 `m`；被摸头额外往 `tender` 推 0.1。

### 3.2 心境目标随段落走

```
target_music(t) = (valence + Σ arc.dv, arousal + Σ arc.da)   ——只取当前段的 arc 项
```
进副歌前 1.2s 的 `chorusState === 'soon'` 已经有了，`arc` 让「副歌预备」不只是身体收一下，而是情绪真的转向
（释然的歌在尾段慢慢抬眼，就是这条）。段落切换且 `|ΔE| > 0.4` 时发一个新事件 `arc-turn` 给台词和粒子。

### 3.3 脸：VA 底色 ⊕ 情绪偏移

```
face = bilinear(VA 四角)            ——现有
     ⊕ Σ_k E_k · OFFSET[k]          ——新：每维一组小偏移，单项 ≤ 0.15，总和再夹到 ±0.25
     ⊕ emotion（秒级事件，floor 0.8） ——现有
```

| 维 | 偏移（只列非零项） | 视线 / 眨眼 |
|---|---|---|
| tender | eyeSmile +0.1，cheek +0.05 | 眨眼略慢 |
| nostalgic | browAngle +0.1（微八字） | 每 20–40s 一次「上方远望」1.5s |
| sad | mouthForm −0.1，browAngle +0.15 | 视线基线下移（现有 `gazeBiasY`） |
| power | browY +0.1，mouthForm +0.1 | 点头加重（见 3.6） |
| transcendence | eyeOpen −0.1 | 微扫视减半，眨眼变慢 |
| defiant | browAngle −0.15，eyeSmile −0.1 | 头部 pitch 微抬 2° |
| tense | browForm −0.1 | 微扫视加快 |
| joyful / peaceful / wonder | 现有四角已覆盖，只加 wonder：browY +0.12、eyeOpen +0.05 | — |

切ない 不再需要专门做：sad 的八字眉 + tender 的眼笑同时叠上去，它自己就出来了。

### 3.4 词曲分治：身体跟曲，脸和嘴跟词

| 出口 | 读哪个效价 |
|---|---|
| 律动幅度、粒子发射率、粒子色温 | `soundValence` |
| 脸的 VA 底色、视线基线、台词正负向 | `lyricValence`（没有就用 valence） |

于是 踊ろうぜ 上她会跟着晃，但眉头是皱的——这正是那首歌。

### 3.5 共情策略：镜像还是陪着

现在是固定把 65% 的目标交给歌（`lerp(time, music, 0.65)`）。改成共鸣系数 `r`：

```
r = 0.65                                          ——缺省，同现在
站主模式，深夜，且本会话连续 ≥3 首 sad/defiant ≥2 听完 ：r → 0.35，并把 E* 的 tender 抬到 ≥0.5
站主跳过一首 sad ≥2 的歌                          ：r 本会话内 −0.1（他不想沉下去）
访客                                              ：r 固定 0.65
```

她不再跟着你一起沉到底，而是往「温柔」靠——情绪感染与情绪调节的分别。这条只改目标，不加台词；
要不要开口仍由 care 规则和话量调控决定。

### 3.6 律动与粒子：从查表变成按权重混合

- **律动风格** = `Σ w_k · RHYTHM_BY_FEEL[k]`（w = E 归一化）。新三维的预设：power `{amp 1.9, freq 0.38, accent 0.95}`、
  transcendence `{1.0, 0.2, 0.1}`、defiant `{1.5, 0.36, 0.85}`。
- **粒子种类**：每次发射按 E 的权重抽一种（现有 `particleForFeel` 变成每维的映射：power→notes 加速、
  transcendence→motes-up 慢、defiant→sparks 少而大）。一首「怀念 3 + 温柔 2」的歌就会是下沉光尘里夹着上浮光点。
- **意象粒子**：`imagery` 覆盖季节粒子——`rain` 雨丝、`sea` 气泡、`flower` 花瓣、`moon`/`night` 萤火、`snow` 雪。
  季语计数（A2.7）扩成意象计数，同一套「歌题 ×3 + 歌词 ×1，≥3 且占比 ≥0.6」。只收有粒子能画的意象，
  `letter` 这类没有粒子的只给台词用，所以表里明确标出消费者再收。

### 3.7 台词：条件变丰富，规则引擎不用改

Valve 式「条件越多越优先」天然奖励更细的事实。`Facts` 新增：

```ts
feels: Partial<Record<Feel, 0|1|2|3>>;   // 只在 feelSure 时填
blend?: 'setsunai' | 'release' | 'fired' | 'youth' | 'hollow' | 'smolder';
split: boolean;                          // 曲亮词暗（或反过来）
section?: 'intro'|'verse'|'pre'|'chorus'|'bridge'|'outro';
imagery: string[];
felt?: Partial<Record<Feel, 0|1|2|3>>;   // 只在站主模式
sessionLean?: Feel;                      // 本会话听歌倾向（站主、本机，见 §3.8）
```

`Criteria` 支持 `feels: { sad: '>=2' }`、`blend`、`split: true`；新事件 `arc-turn`。
示例（照 [[miku-voice-feedback]] 的七条写，P4 时再整批过目）：

```ts
{ id: 'split', on: 'track-change', who: 'any', when: { split: true, feelSure: true }, chance: 0.5,
  say: ['调子这么轻快，词怎么这么丧啊。'] },
{ id: 'blend.setsunai.owner', on: 'track-change', who: 'owner', when: { blend: 'setsunai' }, chance: 0.4,
  say: ['唔，这首听着心里有点揪。'] },
{ id: 'arc.power', on: 'arc-turn', who: 'any', when: { section: 'chorus', feels: { power: '>=2' } },
  say: [], face: 'happy', particles: 'bloom' },   // 不说话，只是眼睛一亮
{ id: 'felt.calm.owner', on: 'track-change', who: 'owner', when: { feels: { sad: '>=2' }, felt: { peaceful: '>=2' } },
  chance: 0.3, say: ['你说过这首听了反而会安静下来，对吧。'] },
```

`mikuRules.test.ts` 加一条：`felt` / `sessionLean` 只能出现在 `who: 'owner'` 的规则里。

### 3.8 听歌倾向（站主、本机）

会话内 `L = EMA(本首 feels × 听完比例)`，跳过的歌以 −0.5 权重计入。`sessionLean = argmax(L)`（L 最大值 ≥ 0.5 才给）。
读它的只有 §3.5 的共鸣系数和少量 care 规则；**不念出来**（「你今晚听了 5 首哀伤的歌」正是第 5 条毛病），
只用来决定她往哪边靠、选哪句。存在记忆层（A6）的会话摘要里，不上云。

---

## 4. 工坊标注页：让标一首变得更快

目标：草稿采纳后**每首 ≤ 30 秒**。

1. **情绪花（替代 7 个单选 chip）**：10 个花瓣排成一圈，相邻摆放 GEMS 里相近的维（宁静–温柔–怀念–哀伤–不安–不甘–燃–雀跃–奇妙–空灵，
   首尾相接）。点一个花瓣强度 +1（3 之后回 0），Shift 点 −1；花瓣长度 = 强度，中心是按强度混出来的颜色（Cowen 地图式）。
   超过 3 个非零时外圈变成虚线提示。复合情绪名在中心下方实时出现。
2. **情绪板（替代效价滑条）**：Musicovery 式 2D 板，横轴效价、纵轴唤醒度（唤醒度显示自动值，可拖覆盖）。
   默认一个点；按住 ⌥ 拖会把点拆成「词 / 曲」两个点，连线即反差。
3. **段落条**：在已有的歌词时间轴副歌色块上，每段一个小花苞，点开是缩小版情绪花，只标增量。90% 的歌只需要标副歌一处或不标。
4. **键盘**：`1`–`0` 对应十个花瓣，`⇧+数字` 减，`⌘⏎` 保存并跳下一首未标的。
5. **草稿升级**：`sources.draft` 由 `{ valence, feel }` 改为 `{ feels, lyricValence, soundValence, imagery, arc? }`，仍附 basis 与 refs。
   重新起草时优先处理 §0 表里那 18 首 tense（多数会变成 defiant / power）。专辑默认 `moodDefaults` 同样改成向量。
6. **对照表**：标注页底部列出「草稿 vs 你的」差异；人标值继续当校准数据（A2.1 第 4 条），积累 20 首以后打印一次草稿的命中率，
   低的维说明起草提示要改。

## 5. 公开面：曲目卡

`LinerNotes` 现在显示一个感受词。改为：有复合名时显示复合名，否则前两个维（强度 ≥2）；`split` 时加一个小标「曲亮词暗」。
`felt` 永不出现在曲目卡上。

## 6. 隐私：`felt` 放哪

生成文件 `trackProfiles.generated.json` 是公开 chunk。`felt` 是「这首歌让我怎样」，与 `notePrivate` 同级敏感，
**不能进生成文件**。三个选择：

| 方案 | 做法 | 代价 |
|---|---|---|
| **A（已选）** | `felt` 存 Supabase 一张 `track_felt` 表，RLS 仅 `is_gardener()` 可读；站主登录后 Miku 拉一次 | 一张新表；访客永远拿不到 |
| B | 只在 `npm run dev` 下生效（工坊与本地 Miku 读原始档案） | 线上站主模式用不到 |
| C | 不做 `felt`，只做 `feels` | 丢掉 §3.5 里最有人情味的一半 |

## 7. 分期

| 阶段 | 内容 | 估时 |
|---|---|---|
| P0 schema ✅ | `Feel` 扩到 10 维；`feels` / split / arc / imagery / sure 的解析与派生 `feel`；`blendOf()`；`music:build` 透传与校验；旧档案兼容；`mood-core.test.mjs` + `trackMood.test.ts` | 0.5 天 |
| P1 工坊 ✅ | 情绪花、情绪板、键盘；草稿结构升级与重新起草（先 18 首 tense） | 1 天 |
| P2 身体 ✅ | 情绪向量 E；脸部偏移表；律动加权；粒子按权重；调试面板显示 E 的十根条 | 1 天 |
| P3 时间 ✅ | 段落标签扩展；arc 驱动心境目标；`arc-turn` 事件；词曲分治的出口分配；意象计数与雨/海粒子 | 1 天 |
| P4 台词 ✅ | Facts / Criteria 扩展；复合情绪、反差、段落、意象的台词（整批交你过目） | 1 天 |
| P5 陪伴 ✅ | `felt`（按 §6 选定方案）；共鸣系数；听歌倾向 | 1 天 |

P0–P2 做完就能看到区别；人工活集中在 P1 之后的标注，按草稿采纳估计 110 首约 1 小时。

## 8. 风险

| 风险 | 对策 |
|---|---|
| 维度多了标不动，又是 1/110 | 上限 3 个非零；草稿预填；专辑默认向量；键盘流 |
| 偏移叠加让脸「做表情」 | 单项 ≤0.15、总和 ±0.25；心境是底色不是表演（A3 原则） |
| 复合情绪说错比不说更出戏 | 只在 `sure` 且人标/专辑来源时说；草稿来源只驱动身体，不驱动台词（与现在 `feelSure` 同规矩） |
| 共鸣系数让她显得「不跟歌」 | 只在站主、深夜、连续低落时触发；调试面板显示 r |
| 新 Feel 值让旧测试失配 | P0 先跑全量 `vitest`；`RHYTHM_BY_FEEL` 等 Record 加新键是编译期强制的，漏不了 |

## 9. 已拍板（2026-10-08）

1. 10 个维度与中文名照用（`tense` 的中文名由「紧绷」改为「不安」）。
2. `felt` 走方案 A：Supabase `track_felt` 表，仅 `is_gardener()` 可读（P5）。
3. 段落弧线做（P3）。

## 10. P0 落地记录

- `scripts/lib/mood-core.mjs`：维度表、VA 锚点、`nearestFeel`（只在 8 个 VA 可分的维里猜：空灵、不甘必须人标）、
  `normalizeFeels` / `feelsOfLayer`（旧 `feel` → `{ feel: 3 }`）/ `dominantFeel` / `blendOf` / `overallValenceOfLayer` /
  `isSplit` / `normalizeArc` / `normalizeImagery` / `checkMood`（problems 拦构建，warnings 只打印）。
- `profile-merge.mjs`：生成文件的 `mood` 新增 `feels`、`lyricValence`、`soundValence`、`arc`、`imagery`、`sure:false`，
  各带出处；`feel` 改由 `feels` 派生。顺手修了一处不一致：VA 猜 `feel` 时脚本原先把 0..1 的 arousal
  直接放进 −1..1 的锚点里比，现在与前端同一换算。
- `trackMood.ts`：`ResolvedTrackMood` 新增 `feels`（恒非空）、`lyricValence` / `soundValence`（恒有值）、`split`、`blend`、
  `arc`、`imagery`、`sure`；`facts.feelSure` 额外要求 `sure !== false`。
- `RHYTHM_BY_FEEL` 补了三维的预设；`particleForFeel`：燃→音符，不甘→火花，空灵→上浮光点。
- 工坊：专辑保存可写 `feels` / 词曲效价；标注页 UI 仍是单选，P1 换成情绪花。在那之前，若档案里已有 `feels`，
  单选改 `feel` 不会生效（feels 优先）。
- 重新构建后生成文件只多了 7 首的 `feels`（来自已有的专辑默认与那 1 首人标），其余字段一个没变。


## 参考

- Zentner, Grandjean & Scherer (2008). Emotions evoked by the sound of music: characterization, classification, and measurement. *Emotion* 8(4). —— GEMS
- Cowen, Fang, Sauter & Keltner (2020). What music makes us feel: At least 13 dimensions organize subjective experiences associated with music across different cultures. *PNAS* 117(4).
- Gabrielsson (2002). Emotion perceived and emotion felt: Same or different? *Musicae Scientiae*.
- Plutchik (1980/2001). The nature of emotions. —— 强度分档与二元组合
- Aljanaki, Yang & Soleymani (2017). Developing a benchmark for emotional analysis of music (DEAM). *PLOS ONE*.
- Hu & Downie (2010). Improving mood classification in music digital libraries by combining lyrics and audio. *JCDL*.
- Musicovery 情绪板；Spotify Web API Audio Features（2024-11 起对新应用停用）。

## 11. P1 落地记录

- 工坊标注页（`src/dev/studio/AnnotateTab.tsx`）：专辑与本曲都换成「情绪花 + 情绪板」。
  - `EmotionFlower.tsx`：十瓣，顺时针 宁静–温柔–怀念–哀伤–不安–不甘–燃–雀跃–奇妙–空灵；点 +1（3 后归零），⇧ 点 / 右键 −1；
    花心是线性 RGB 里按强度混的颜色；复合情绪名实时出现；超过 3 维外圈变虚线。跟随专辑时花瓣是虚线。
  - `EmotionPad.tsx`：横轴效价、纵轴唤醒度，底上淡标各维锚点；⌥ 拖拆成「词 / 曲」两点（差 ≥ 0.6 标出「曲亮词暗」），
    「合成一个点」取平均合回。唤醒度显示自动值，纵向偏离不到 0.08 不算改。专辑那块板不管唤醒度。
  - 「我自己也说不准」写 `sure: false`。
  - 键盘：`1`–`0` 对应花瓣（`⇧` 减），`⌘⏎` 保存并跳到下一首你没亲手标过情绪的（输入框里也认）。
  - 保存时旧的单个 `feel` 被 `feels` 取代；拆成词 / 曲时不再单写整体 `valence`。
- 工坊服务端：草稿字段改为 `intro / valence / lyricValence / soundValence / feels / imagery`，旧草稿的 `feel` 采纳时读作 `{ feel: 3 }`；
  曲库行新增 `have.feelsMine`；`have.feel` 改为「情绪向量是写出来的（你或专辑）」，不再算 VA 猜的；单曲详情带 `autoArousal`。
  **改了 `scripts/music-studio/api.mjs`，开发服务器要重启才生效。**
- 重新起草了 18 首原 `tense` 草稿：多数落到「不甘」，与「不安 / 燃 / 哀伤」组合；词曲反差的 7 首拆了词 / 曲效价
  （心懐サミット、罪と罰、負け犬にアンコールはいらない、爆弾魔 ×2、八月、某、月明かり、踊ろうぜ）；
  レプリカント 改读作「不安 + 空灵 + 奇妙」；八月、某、月明かり 与 月に吠える 标了 `moon` 意象。依据写在各自 `basis` 开头。
- 还没做：§4.6 的「草稿 vs 你的」对照表；其余 92 首草稿仍是单个 `feel`（采纳时是强度 3 的单维）。

## 12. P2 落地记录

- `brain/affect.ts`：`Affect.tone` 是 10 维情绪色调（0..1），τ = 25s；目标 `toneTarget(feels, r)` =
  底色 ×(1−r) + 强度/3 × r，r = `MUSIC_RESONANCE` 0.65（P5 换成共鸣系数）；不放歌回到底色（温柔 0.2、宁静 0.15）。
  摸头 / 拍头额外 `nudgeTone('tender', 0.1)`。曲目档案没标时，`feels` 是 VA 猜的单维 ×2，身体照样用它。
- 脸：`faceFor(m, emotion, tone)` = VA 四角插值 + `toneFaceOffset`（§3.3 的表，每参数夹 ±0.25）⊕ 情绪叠加。
  单测验证了「哀伤 3 + 温柔 3」同时抬高眼笑与八字眉。
- 视线与眨眼：怀念 → 自主张望时 20–40s 一次往上方远望 1.5s（概率 = 1.4 × 怀念）；空灵 → 微扫视间隔 ×(1+空灵)、眨眼间隔 ×(1+0.6 空灵)；
  不安 → 微扫视间隔 ×(1−0.4 不安)；温柔 → 眨眼间隔 ×(1+0.25 温柔)；不甘 → 头部 pitch 抬 2°×不甘。
- 律动：`blendRhythm(tone)` 按权重混合十种预设；强拍点头改为「雀跃 + 奇妙 + 燃」权重 > 0.4。
- 粒子：`sampleTone(tone, rand)` 按权重抽一维再映射种类。
- 调试面板（Alt+M）：十根色调条，粉色刻度是这首歌标的强度 ÷3；曲目行显示 feels 与复合情绪。
- 注：预览面板在后台时 rAF 被节流到约 1fps，而 ticker 每帧 dt 最多 0.05s，所以在面板里看色调涨得很慢；正常前台 60fps 下就是 25s 的时间常数。

## 13. P3 落地记录

- **段落标签**（`scripts/lib/track-features.mjs`）：`segmentsFromLyrics` 把整首切成首尾相接的 `[标签, fromMs, toMs]`——
  第一句前 ≥1.5s 是 intro；副歌 = 歌词重复块（与 `sections` 同一次检出，保证对得上）；副歌前那段 ≥4 行时末 2 行是 pre；
  副歌 ≥3 次时最后一次前那段是 bridge；最后一次副歌后的一切（含尾奏 ≥3s）是 outro；其余 verse。间奏归前一段。
  没有歌词时 `segmentsFromSections` 按能量法副歌切（intro / chorus / verse / outro）。
  与 §2.2 的一处不同：纯器乐只要能量法找得到高能段，那段仍叫 chorus（与 `chorusState` 和副歌绽放一致），不只有 intro/outro。
- **意象计数**：`imageryOf` 与季语同一套（歌题 ×3 + 歌词 ×1，≥3 且占比 ≥0.6），只出一个；排除词先挖掉再数
  （花火≠花，八月 / 十一月 / 月曜 ≠ 月，電波≠波）。
- `analyze-tracks.mjs`：只靠歌词的量（歌词法副歌、段落、季语、意象、时段）每次都对全体重算，不解码音频；
  补了歌词后直接 `npm run song:analyze` 即刷新。本次重算：段落 106/110 首（intro 81 · verse 173 · pre 113 · chorus 240 · bridge 11 · outro 103），
  意象 25 首（花 13、月 4、雨 4、海 3、信 1）；愛言葉II（m_31）的副歌由能量法换成了歌词法；季节、时段、arousal 一个没变。
- **合并**：`trackFeatures.generated.json` 新增 `segments`、`imagery`；`resolveTrackMood` 的 `imagery` 为 人标 > 自动，
  新增 `segments`；`music:build` 的生成档案也带上自动意象（出处 auto），工坊看得到。
- **弧线 → 心境**（`mood-core.mjs` 的 `arcAt` / `addFeels`，`trackMood.ts` 的 `segmentAt` / `moodNow`）：
  `chorus` 对每次副歌生效、`chorus#2` 只对第 2 次，同时命中就叠加；feels 逐维相加钳到 3，dv 加到词与曲两个效价上，da 加到唤醒度（0..1）。
  Miku 每帧用「整首底色 ⊕ 当前段」喂情感模型，所以色调目标与心境目标都随段落走。
- **`arc-turn`**：同一首里换段，且前后两段的色调目标欧氏距离 > 0.4（`ARC_TURN_MIN`；弧线给一维加 2 级就够，加 1 级不够）时发，
  带 `section` 事实（`Facts.section`，P4 的规则用）。换歌、暂停后恢复只记不发；拖动进度跨段也会发。优先级 ambient。
  规则留给 P4，所以眼下它还不会让她说话或放粒子。
- **顺手接上了 `chorus` 事件**：`mikuRules.ts` 里两条副歌规则（`chorus.note.owner`、`p7.chorus.bright`）此前从没被触发过——
  `useMikuBrain` 里没有 `speak('chorus')`。现在进副歌首拍会试一次（同一刻 arc-turn 若已开口就让位）。
- **词曲分治**（§3.4）：心境点 m 的效价目标改读词的效价（脸、视线、台词）；`Facts.trackValence` 写了词效价时用它。
  身体读曲的效价：律动摆幅与粒子发射率 × `soundLift`（0.85..1.15），播放中粒子的色温改用曲效价。
- **意象粒子**：`imageryParticle` 雨 → 雨丝（新 `rain`，斜落的细线）、海 → 气泡（新 `bubbles`）、花 → 花瓣、月 → 萤火、雪 → 雪；
  信没有粒子，退回季节。播放中意象覆盖季节，间隔 4.5–8s（季节是 7–13s）；雨一次 4 丝、气泡 2 个，触屏减半。
- 调试面板：段落（标签#第几次 · 第几段/共几段）、命中的弧线、词 / 曲效价（含弧线）与反差、意象；色调条上黄色刻度 = 叠上弧线后的强度。
- 实测（预览，六月は雨上がりの街を書く）：段落 chorus#1、意象 rain · auto，雨丝按色值 #A5CFE0 落在画布上。
  在内存里给 踊ろうぜ 临时加上「副歌 +燃2、da +0.2」与词 −0.6 / 曲 +0.5：pre → chorus 时发出 arc-turn（section=chorus），
  面板显示 词/曲 −0.60 / 0.50 · 反差，律动增益 0.65 → 0.73。
- 段落质量受歌词法副歌检出所限（例：踊ろうぜ 的副歌只认出 8 秒的两行，主歌因此偏长）。

## 14. P4 落地记录（含 §4.3 段落条、§5 曲目卡）

**工坊**
- 段落条（`src/dev/studio/ArcBar.tsx`，标注页右栏「段落弧线」）：自动段落（详情接口新带 `autoSegments` / `autoImagery`）按段着色，
  点一段 = 跳到那里并打开编辑：缩小版情绪花标增量、效价 / 唤醒度偏移（±0.6）；「每一次副歌」写 `chorus`，「只这一次」写 `chorus#2`。
  有增量的段落上有花苞（增量的混色），下面列出全部弧线。随「保存本曲标注」写进 `mood.arc`。
- 意象 chip：六个意象，虚线 = 自动计出来的，点了就变成你的；「改回自动」。全部点掉会写 `imagery: []`，
  意思是「这首没有意象」，构建和运行时都会压住自动的（以前空数组会被当成没写）。
- 改了 `scripts/music-studio/api.mjs`，开发服务器要重启。

**曲目卡**（§5，`LinerNotes.tsx`）：有复合情绪就显示复合名（没标「说不准」时），否则强度 ≥2 的前两维用「而」连（「怀念而温柔」），
都没有时退回最强的一维；词曲反差时加「曲亮词暗 / 曲暗词亮」。现在只有 夏陰、ピアノを弾く 一首会变（显示「空」），其余 6 首专辑默认仍是「怀念」。

**事实**（`brain/facts.ts`）：`feels`（只在 feelSure 时给，已叠上当前段的弧线）、`blend`（同）、`split` 与 `splitWay`（sound = 曲亮词暗）、
`section`、`imagery` / `imageryName`。`trackValence` 改为写了词效价就用它。条件用点路径写：`'feels.power': '>=2'`——引擎原本就支持，没改 `Criterion`。
`felt` / `sessionLean` 留给 P5。

**规则**（`mikuRules.ts` 的「P4 多维情绪」组，**待过目**）：
- 复合 ×6（站主 2–3 句、访客 1 句，weight 5，胜过单维 feel）；反差（曲亮词暗 / 曲暗词亮，三个条件，最优先）；
  新三维 燃 / 空灵 / 不甘 的站主与访客句；副歌 `p4.chorus.fired`。
- `arc-turn`：副歌里燃起来 → 不说话，眼睛一亮、冒音符；不甘 → 火花；空灵 → 上浮光点（这三条 60s 冷却）；
  副歌里雀跃 → 偶尔「♪ 就是这里！」；尾声里宁静 → 「……嗯，落下来了。」；哀伤加深 → 站主安慰场域一句。
- 意象 ×6（站主 / 访客）：雨、海、花、雪会提到她身边正在落的粒子；信只有台词。不靠 feelSure（意象是数出来的事实），weight 4 排在季节前面。
- 口吻按 [[miku-voice-feedback]]：保留意象与语气词，避开「像」「适合」「这首」开头的堆叠；规则库的口吻测试全部通过。

**引擎**：只用表情 / 粒子回应的规则（`say: []`）不再受话量调控、也不占话量——眼睛亮一下不该让下一句话等 90 秒。
目前只有 P4 的三条 arc-turn 规则是这种。

**测试**：`facts.test.ts`（事实的门槛、弧线叠加、反差方向；规则优先顺序：反差 > 复合 > 单维；说不准时情绪规则一条不选）；
`mikuRules.test.ts` 加「按情绪开口的规则都带 feelSure」与「复合 / 新三维站主访客都有话」；`voice.test.ts` 加静默回应不占话量。

**没能在预览里实测的**：P4 的台词在浏览器里没跑通——预览面板被收起时页面 `document.hidden`，全站 ticker 按设计停摆，Miku 的大脑不走帧。
规则选择由单测覆盖；P3 的 arc-turn 触发链此前已在预览里实测过。

## 15. P5 落地记录

**felt**（§6 方案 A）
- 表：`supabase/track_felt.sql`（`track_id` 主键、`felt` jsonb、`updated_at`）；RLS 一条 `for all to authenticated using/with check is_gardener()`——
  没有公开读，访客的请求只拿到空表。形状约束：必须是对象、≤ 512 字节。**要在 Supabase SQL Editor 手动执行一次。**
- 读写：`src/lib/trackFelt.ts`。`loadTrackFelt` 拉全表进内存（10 分钟过期、5s 超时、失败静默回落为空），`getTrackFelt` 同步取，
  `forgetTrackFelt` 在离开站主模式时清掉，`saveTrackFelt` 空向量即删行，出错时返回给人看的原因（没建表 / 没登录）。
- 工坊：标注页「它让你怎样（只给自己）」（`src/dev/studio/FeltPanel.tsx`），一朵独立的情绪花，点了 0.7s 后自动存云端，
  不走「保存本曲标注」、不进 music-data。工坊与主站同源，主站登录过就带着会话；没登录时只显示提示。
- Miku：站主模式下 `loadTrackFelt(true)`，回到前台时过期了再拉（工坊刚标的能跟上）；访客与 `[VISITOR : ON]` 预览不拉，且清掉副本。

**共鸣系数**（§3.5，`brain/resonance.ts` 的 `SessionListening.resonance`）
- 缺省 0.65；站主、深夜、连续听完（≥ 八成）≥ 3 首低落的歌 → r = 0.35 且情绪色调的温柔 ≥ 0.5（`toneTarget` 的 `tenderFloor`）；
  站主跳过一首低落的歌 → 本会话 r −0.1，最低 0.35；访客固定 0.65。
- r 同时作用于心境点的目标（原先写死的 0.65）和情绪色调的目标；陪着时即使暂停了，温柔的下限也还在。
- 「低落」= 哀伤或不甘 ≥ 2，只认写出来的向量（人标或专辑；`sure:false` 也算——这条只动身体与目标，不开口）。
  **与 §3.5 原文的一处补充**：站主给这首标过 felt 时按 felt 判断——他说这首听了会安静下来，它就不算往下拽（反过来也成立）。
- 连续的规矩：听完一首不低落的、或跳过任何一首，连续归零；听了 30s 以上但不到八成，不加也不断。

**听歌倾向**（§3.8）
- 每一遍结束时（换歌，或单曲循环从尾巴跳回开头）`L += (feels/3 × 听完比例 − L) × 0.4`，跳过的按 −0.5；同样 felt 优先。
  没写情绪的歌不进 L。最大一维 ≥ 0.5 才有 `sessionLean`——一首不够，同一类连着两三首才有。
- 存在本机记忆的 `session-end.data.listening`（L、低落连听、跳过扣分），30 分钟内回来（含刷新）接着算，离开更久就是新会话、清零。不上云。
- 顺手修的：单曲循环时 `listen` 只记一次（换歌才重置），`care.loop`「今晚放了好几遍」在单曲循环下永远凑不够；现在每一遍都会记。

**事实与规则**
- `Facts.felt`（站主且在播放）、`Facts.sessionLean`（站主）；访客即使调用方误传，`buildFacts` 也不给。
- `mikuRules.ts` 的「P5 陪伴」组，**待过目**：felt ×6（`p5.felt.calm` 是 §3.7 的原例：歌哀伤 ≥2、你标的宁静 ≥2；其余五条按你标的那一维，
  weight 12，胜过单维 feel、输给复合与反差；每首每周至多一次）；听歌倾向 ×2（低落的一晚换了首亮的歌 → 一句「换首亮一点的也好」，
  每会话一次；深夜第一次催睡时换一套不点破的说法）。共鸣系数本身不加台词。
- 测试：`resonance.test.ts`（r 的四条规矩、连续的断与续、felt 优先、倾向的 EMA 与跳过、快照恢复与坏数据钳制）；
  `affect.test.ts` 加「r 决定目标里歌占多少」「陪着时温柔 ≥ 0.5」；`mikuRules.test.ts` 加
  「felt / sessionLean 只出现在 owner 规则里」「访客事实里没有它们」「倾向的台词不念数字和维度名」。
- 调试面板（Alt+M）：共鸣（r · 陪着）、倾向与低落连听（站主）、本曲 felt。

**没能在预览里实测的**：预览面板收起时 `document.hidden`，Miku 的大脑不走帧（同 P4）；登录后的工坊读写也没测——不替你输密码。
工坊未登录态在预览里看过；逻辑由单测覆盖。

## 16. 草稿生效与补齐（2026-10-17）

- 草稿层生效（详见 docs/music-design.md「补充：草稿生效」）：人标 > 草稿 > 专辑默认；复合情绪与 Miku 的「写出来的」都认草稿。
- §12 里「其余 92 首草稿仍是单个 feel」已补齐：110 首草稿全是向量，每首 ≤ 3 维非零；词曲反差拆分共 15 首（原 7 + 新 8：
  藍二乗、言って。、あの夏に咲け、ヒッチコック、ただ君に晴れ、二息歩行、サイハテ、そばかす）。
- 《夏草》有你写的专辑默认（明亮、怀念为底）；这 7 首的草稿按它对齐，明快曲子配悼亡或丧气的词时拆成曲亮词暗，不和专辑判断对着干。
- 器乐与查不到解读的曲目只凭标题与位置起草，置信度不提；《タイムリミット -Endless-》查明是初音体验版的印象曲，置信度 low → medium。
