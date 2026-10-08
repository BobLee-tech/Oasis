# Miku 重做：设计与落地方案 v2（2026-10-05）

> **一句话**：先算出「她此刻的心境」，再让台词、表情、律动、粒子四个出口同时由它驱动。
> 心境由四样东西合成：这首歌是什么样的歌、现在几点、你在站里做什么、你刚才怎么碰了她。
> 她对站主和对访客是两种关系：对站主亲昵、温柔、照顾、陪伴，称呼随场域变化，并且记得你；
> 对访客，她是替主人招待的朋友。

**已拍板**

| 问题 | 结论 |
|---|---|
| 站主与访客 | 分两套口吻。对站主更亲昵温柔，更照顾陪伴 |
| 标注字段 | 每个字段都要有算法来源和消费者 |
| 称呼 | 随场域变化：爱人 / 宝贝 / 你 / 小盆友 …（§A5） |
| 记忆 | 先存本机，架构为之后的 memory 功能预留（§A6） |
| `note` | 访客可见，以转述的口吻出现（§A2.5） |
| 曲目标注 | 与音乐页的「曲目档案」合并成一份数据，只标一次 |

---

# Part A 设计

## A0. 现状问题（有证据的）

| # | 问题 | 证据 | 阶段 |
|---|---|---|---|
| 1 | 关闭卡一下 | 实测：收起后首帧 139ms（平时 8ms）；舞台在不透明度为 1 时瞬移约 350px。原因：`collapse()` 把 x/y 直接归零（index.tsx:384）；同帧停 ticker，她在淡出时定格；气泡在 `backdrop-blur` 之上又动画 `filter: blur` | P0 |
| 2 | 呼吸叠了两层 | 库内置 `CubismBreath`（AngleX 峰值 15、权重 0.5，cubism4.es.js:5343）一直在跑，`BreathEngine` 又叠一层 | P0 |
| 3 | 不即时 | `handlePointerDown` 只记账（useMikuBrain.ts:489），所有反应都在 pointerup 才发 | P1 |
| 4 | 眼、头、身锁在同一条曲线上 | 库的 `updateFocus`（cubism4.es.js:5438）把同一个 focus 值同时乘给 EyeBall ×1、AngleX ×30、BodyAngleX ×10 | P1 |
| 5 | 粒子与触点、音乐无关 | 出生点写死在百分比坐标；三关键帧插值，没有物理；React 状态上限 12 颗 | P2 |
| 6 | 台词 AI 味 | 约 150 句里「呢/哦/呀/啦」出现 82 次，「……」18 次，「好像」13 次，「陪」13 次；全是静态池，没有一句引用真实信息 | P5/P7 |
| 7 | 不分站主与访客 | `OasisMiku` 只拿到 `view`，拿不到 `isAdmin` | P5 |

## A1. 总体架构

```
 ┌──────────────────── 输入 ────────────────────┐
 │ 曲目档案：离线特征（ffmpeg + 歌词） + 人工标注 │
 │ 运行时：时间/节气 · 视图/阅读/写作信号 · 文章缓存 │
 │ 交互：手势/触点/连击                           │
 │ 记忆：事件流 → 画像 → 珍藏（仅站主）            │
 └───────────────┬──────────────────────────────┘
                 ▼  事实黑板 Facts（每次决策前取快照）
 ┌──────────── 情感模型（ALMA 式三层）────────────┐
 │ 性格（常量，站主/访客两组） · 心境 VA（分钟） · 情绪（秒） │
 └───┬──────────┬──────────┬──────────┬───────────┘
     ▼          ▼          ▼          ▼
  台词引擎     表情映射     动作层叠      粒子发射器
 (规则+称呼)  (VA→面部)  (视线/冲量/律动) (种类/色/率)
```

为什么这样分层：真实的人，话、脸、身体是同一种情绪的不同出口。现在四样各管各的，组合起来就会出戏。

---

## A2. 曲目档案中的 `mood`：每个字段都有算法来源和消费者

### A2.1 原则

1. **能算的算，算不准的人标。** 音乐情绪识别研究的一致结论是：唤醒度从音频较好预测，效价很难
   （标准音频特征的准确率约 63% 对 35%）。所以 arousal 自动算加人工覆盖，valence 由人标。
2. **每个字段都必须有读它的模块**，否则不进 schema。
3. **来源可追溯**：解析结果带 provenance（manual / auto / album / default）。
4. **人标的值同时是校准数据**。

### A2.2 字段总表

| 字段 | 含义 | 来源与算法 | 谁读它（消费者） |
|---|---|---|---|
| `arousal` 0–1 | 激活度、能量感 | 自动（A2.3），可覆盖 | 律动摆幅与点头增益；粒子发射率与速度；眨眼与微扫视频率；台词句式 |
| `valence` −1..1 | 明亮 ↔ 低落 | 人标：专辑默认 → 逐曲覆盖 | 表情基线；视线基线（低效价时略向下）；粒子色温（樱粉 ↔ 初音绿）；台词正负向 |
| `feel` | GEMS 7 类：温柔 tender / 怀念 nostalgic / 哀伤 sad / 宁静 peaceful / 雀跃 joyful / 紧绷 tense / 奇妙 wonder | 人标；缺省时取 VA 最近邻（A2.4） | 台词池；粒子种类；律动风格预设；称呼场域判定（A5） |
| `bpm` | 速度 | 自动：通量自相关 + 感知先验 | 律动周期锁定 |
| `sections` | 副歌区段 | 自动：歌词重复块 → 能量新颖度 → 人工修正（A2.6） | 副歌预备、副歌放大、首拍粒子 |
| `contrast` | 动态对比 | 自动：ebur128 的 LRA，取百分位 | 主歌到副歌的放大系数 |
| `season` | 季节意象 | 自动：季语计数（A2.7） | 节气联动台词；粒子季节变体 |
| `time` | 适合的时段 | 自动：时段词计数，低唤醒偏夜 | 时段匹配时规则加分 |
| `note` | 你对这首的一句话 | 人写 | 站主模式当作共同记忆引用；访客模式转述（A2.5） |
| `noteVisitor?` | 给访客的另一种说法 | 人写，可选 | 有它时，访客模式优先用它 |
| `notePrivate?` | 不给访客看 | 人标，可选 | 访客规则跳过这首的 note |

运行时派生（存在记忆里，只对站主）：`playsToday` / `playsTotal` / `lastPlayedAt` / `skipRate` /
`writtenWith`（发布时当时在放的歌）。

### A2.3 arousal 自动算法（`scripts/analyze-tracks.mjs`，离线）

```
对每首歌（全曲解码）：
  L = ebur128 integrated loudness    R = ebur128 loudness range (LRA)
  C = aspectralstats centroid 中位数  O = 起音密度：flux 峰值 / 秒（阈值 = 局部均值 + 1.5σ）
  T = bpm
每项转为曲库内百分位 P(x)∈[0,1]（对母带响度差鲁棒；只关心「比你曲库里大多数歌更燃还是更静」）
arousal_auto = 0.35·P(L) + 0.25·P(O) + 0.20·P(C) + 0.20·P(T)
contrast     = P(R)
```

**校准**：`npm run song:calibrate` 用你标过 arousal 的歌（≥ 8 首）做非负最小二乘，重新拟合权重
（和为 1），并打印 Spearman 相关系数。≥ 0.7 才采用新权重。

**bpm**：onset 包络（hop 1024）→ 减去 1s 均值后半波整流 → 在 60–180 BPM 的 lag 范围做自相关
→ 乘以中心 110 BPM、σ 为一个八度的对数高斯先验 → 倍频纠错：若一半或两倍处的得分 ≥ 0.8 倍最大值，
取更靠近 110 的那个。

已验证：本机 ffmpeg 8.1 自带 `aspectralstats` 与 `ebur128`。

### A2.4 feel 缺省：VA 最近邻

| feel | V | A |  | feel | V | A |
|---|---|---|---|---|---|---|
| joyful | +0.7 | +0.6 | | peaceful | +0.3 | −0.6 |
| tense | −0.4 | +0.6 | | nostalgic | −0.1 | −0.3 |
| wonder | +0.4 | +0.3 | | sad | −0.6 | −0.4 |
| tender | +0.5 | −0.3 | | | | |

**分工**：连续量（VA）驱动连续输出；离散量（feel）驱动离散选择。人标的 feel 永远优先，
因为「怀念」和「哀伤」在 VA 上很近，只有你知道是哪个。

### A2.5 `note` 的转述

`note` 用你自己的口吻写就行（可以有「我」）。引擎**不做「我→他」的代词替换**，
因为中文里「我们」「自我」「我的」会被误伤。改用引号转述，引号本身就是转述的语法：

| 模式 | 模板示例 | 频率 |
|---|---|---|
| 访客 | `他说过这首：「{note}」` · `关于这首，他留了句话——「{note}」` | 每首每个会话最多一次 |
| 访客（有 `noteVisitor`） | 直接说 `{noteVisitor}` | 同上 |
| 站主 | `「{note}」——你写的。` · 副歌开始时只说 `「{note}」` | 每首每周最多一次（记得但不炫耀） |

台词质量测试会检查 `note` 的长度：超过 40 字给出警告，以免气泡放不下。

### A2.6 副歌区段

```
① 歌词法：行文本归一化（去空白和标点）→ 找连续 ≥2 行、整块出现 ≥2 次的重复块
   → 出现次数 × 块长 最大的块记为副歌 → 每次出现取 [首行 startMs, 末行 endMs]
② 能量法：0.5s RMS → 4s 平滑 → 高于 75 百分位且持续 ≥ 8s 的段为候选 → 取最高的 2–3 段
③ 人工：曲目档案里写 sections 直接覆盖
```

已验证：现有 86 份歌词，①一次通过 **58 首（67%）**。例如 祥月 53s/109s、晴るる 89s/163s/238s。
思路参考 Goto 的 RefraiD：副歌即被重复的段落。

### A2.7 season / time：季语计数

得分 = 3 × 歌题命中 + 1 × 歌词命中；总分 ≥ 3 且最高季占比 ≥ 0.6 才标，否则不标。
已验证：86 首中 24 首得到明确季节（19 夏、5 春）。季节意象是词汇层面的，用词表可靠；valence 不是。

**标注成本**：7–10 张专辑 × (valence + feel) ≈ 20 分钟，82 首就都有可用的心境。

---

## A3. 情感模型

| 层 | 尺度 | 表示 | 更新 |
|---|---|---|---|
| 性格 | 永久 | 增益：温暖度、活泼度、话量 | 站主一组、访客一组 |
| 心境 | 分钟 | VA 点 `m` | 被音乐目标和时间基线吸引，交互推它一下 |
| 情绪 | 秒 | `{kind, intensity}`，kind ∈ shy / happy / surprised / annoyed / sleepy / pained | 事件触发，半衰期 6–10s |

**心境动力学：**

```
target_time  = 昼夜曲线：A 在 3 点最低（−0.5）、15 点最高（+0.2）；V 基线 +0.1（站主在场再 +0.1）
target_music = (valence, mix(arousal, live.energy, 0.3))，仅在播放时生效
target       = 播放中 ? lerp(target_time, target_music, 0.65) : target_time
dm/dt        = (target − m) / τ，τ = 40s
交互冲量      ：摸头 +0.04V；连击 −0.08V +0.05A；发布 +0.2V +0.15A …
```

**输出映射：**
- **面部** = VA 四角预设的双线性插值 ⊕ 情绪叠加（floor 0.8，不被动作片段压掉）。
- **视线**：低 V 时视线基线略向下；高 A 时微扫视更频繁。
- **律动**：摆幅 = lerp(0.3, 1, A) × 副歌系数；风格由 feel 决定；周期锁 bpm。
- **粒子**：发射率 ∝ A，色温 ∝ V，种类由 feel 与 season 决定。
- **台词**：feel + A 决定语域，关系决定口吻，场域决定称呼。

---

## A4. 台词引擎：事实 + 规则

借鉴 Valve 的规则式动态对话：选条件最多、也就是最具体的那句，选不到逐级退回通用句。

### A4.1 事实黑板

```ts
interface Facts {
  hour; period; lateNight; solarTerm?; weekday;                        // 时间
  owner: boolean; visitorAlias?: string;                               // 关系
  playing; track?; mood?: ResolvedTrackMood; playsToday; inChorus; lyricZh?;   // 音乐
  view; reading?: { title; category; minutes; progress };             // 站点（访客只读 filterVisible 过的文章）
  editing?: { words; minutes }; latestPost?: { title; daysAgo }; postsThisMonth;
  zone?; gesture?; combo; patsToday; intimacy: 0|1|2|3;               // 交互
  memory: MemoryFacts;                                                 // 记忆派生（A6.4），访客模式为空
  feel?; arousal; valence; emotion?;                                   // 她的心境
}
```

### A4.2 规则

```ts
interface Rule {
  id: string;
  on: MikuEvent;                 // greet/return/track-change/chorus/lyric/idle/reading-*/editor-*/published/
                                 // tap/hold/stroke/swipe/pull/combo/care-*/milestone/date/recall
  who: 'owner' | 'visitor' | 'any';
  field?: Field;                 // 称呼场域（A5）；不写则由 inferField 推断
  when?: Criteria<Facts>;        // { feel: 'nostalgic', lateNight: true, playsToday: '>=3' }
  say: string[];                 // 可以是空数组 = 只用表情和粒子回应；称呼一律写 {呼，} 或 {，呼} 槽位
  face?; particles?; motion?;
  weight?; cooldown?; once?: 'ever' | 'day' | 'session'; priority?: 'care' | 'response' | 'ambient';
}
```

**选择算法：**
1. 筛出事件、关系、条件都匹配且不在冷却期的规则。
2. 得分 = 条件数 × 10 + weight，只取最高分档。
3. 档内按「最久没说过」挑一句（说过的记录在记忆里）。
4. 填事实槽位；任何一个槽位缺值就弃掉这句。
5. 交给称呼选择器（A5）填 `{呼}`。

### A4.3 话量调控

| 类别 | 规则 |
|---|---|
| care 照顾 | 可以插队；每种照顾有自己的「每晚/每日一次」上限 |
| response 回应 | 无视全局间隔，有 4s 回应冷却；轻拍约 50% 出字 |
| ambient 闲聊 | 最小间隔：站主 90s、访客 150s；每小时 ≤ 6 句；阅读时间隔 ×2；写作时静音 |
| recall 回忆 | 每个会话最多一句（记得但不炫耀） |

### A4.4 台词质量测试（`mikuRules.test.ts`）

- 槽位必须在 `Facts` 中存在。
- 句尾语气词 ≤ 30%；每个池子「……」≤ 1 句。
- 黑名单词（一段光、像素、数据、虚拟、隔着屏幕）全库 ≤ 2 句，且只能出现在 `once:'ever'` 的规则里。
- **模板里不得硬写称呼词**（爱人、宝贝、小盆友……），必须走 `{呼}` 槽位，场域逻辑才能集中管理。
- 访客规则不得引用 `editing`、`memory` 和听歌统计；`note` 必须带引号或使用 `noteVisitor`。

---

## A5. 称呼系统：场域决定叫你什么

### A5.1 依据

- 称呼承载关系语义。Brown & Gilman 的「权势与亲密」理论指出：称呼形式会随关系与场合切换，
  而不是固定的标签。
- 称呼在句中的位置决定语用功能。研究发现句末称呼在短句里占多数，起软化、增加亲密感的作用；
  句首称呼用于唤起注意。所以「该睡了，宝贝」和「宝贝，两点了」不是同一句话。
- 亲昵称呼要稀缺才有分量。每句都叫宝贝，就变成了口癖。

### A5.2 场域表（默认值，写在 `src/data/mikuAddress.ts` 里，你可以改）

| 场域 | 判定（按优先级从高到低） | 称呼分布 | 出现率 | 惯用位置 |
|---|---|---|---|---|
| 郑重 solemn | 发布、亲密里程碑、纪念日、认识整百天 | 爱人 0.7 · 你 0.3 | 0.5 | 句首，或独立成句 |
| 照顾 care | 深夜、久坐、长时间写作的照顾规则 | 宝贝 0.6 · 你 0.4 | 0.35 | 句末（软化） |
| 安慰 comfort | 深夜循环低效价的歌；隔了多日才回来 | 宝贝 0.5 · 你 0.5 | 0.3 | 句末 |
| 玩闹 play | 连击、戳身体、滑过、拽马尾；她的情绪是 annoyed | 小盆友 0.8 · 你 0.2 | 0.45 | 句首（调侃） |
| 亲昵 tender | 抚摸或长按头部；心境 V 较高 | 宝贝 0.5 · 爱人 0.1 · 你 0.4 | 0.25 | 句末 |
| 专注 focus | 写作中、阅读中 | — | 0 | — |
| 日常 daily | 其他所有情况 | 你 1.0 | 0.08 | 句末 |

**「你」是零称呼**：中文里「你，……」作呼语不自然。选中「你」时不插入任何呼语，
句子本身已经在用「你」。所以「你」的权重实际上就是「这次不叫昵称」的概率。

### A5.3 选择算法

```
field  = rule.field ?? inferField(event, facts)     // 按上表优先级判定
cfg    = FIELDS[field]
fatigue = 0.5 ^ (最近 5 句里带称呼的句数)             // 称呼疲劳
if (!facts.owner)            → 访客分支（A5.4）
if (rand() > cfg.rate × fatigue) → 不加称呼，清掉槽位
候选 = cfg.terms 中满足：通过门槛 ∧ 未超每日上限 ∧ 最近 3 句没用过
term = 按权重随机抽取；抽中「你」→ 不加称呼
按模板槽位 {呼，} / {，呼} 插入，并清理标点（「，，」「。，」之类）
```

**门槛与上限**（默认值，可配置）：

| 称呼 | 门槛 | 上限 |
|---|---|---|
| 小盆友 | 无 | 无 |
| 宝贝 | 亲密度 ≥ 1，或相处 ≥ 7 天 | 无 |
| 爱人 | 亲密度 ≥ 2，或相处 ≥ 30 天 | 每日 ≤ 1 次，保留它的分量 |

模板写法示例：

```
'{呼，}两点了。'            → 「宝贝，两点了。」 或 「两点了。」
'该睡了{，呼}。'            → 「该睡了，宝贝。」 或 「该睡了。」
'{呼，}又戳？'              → 「小盆友，又戳？」
'《{title}》发出去了{，呼}。' → 「《……》发出去了，爱人。」
```

### A5.4 访客

- 不用任何亲昵称呼。
- 访客设置过别名（`getVisitorAlias`）时，按 0.15 的出现率用别名称呼；否则不称呼。
- 提到站主一律用「他」。

---

## A6. 记忆系统：现在存本机，架构为之后的 memory 功能预留

### A6.1 设计目标

- **现在**：只用 localStorage，零后端，支撑「记得你」的那批台词。
- **以后**：能平滑升级到云同步、你亲手写给她的记忆、按需检索（包括接 LLM 时的检索）。
  做法是存储接口和数据形状现在就按那个方向定，后面只换适配器，不改上层。

### A6.2 三层结构（参考 Generative Agents 的记忆流、反思、检索）

| 层 | 内容 | 生成方式 | 保留策略 |
|---|---|---|---|
| **事件流** stream | `{id, t, kind, data, importance(1–10), tags[]}`。kind 包括：会话开始/结束、听歌（≥30s）、跳过、阅读进度、发布、照顾、里程碑、抚摸会话、说过某句台词 | 运行时追加，只追加不修改 | 近 30 天保留原样；更早的按日汇总；一年以上按月汇总 |
| **画像** profile | 习惯（来访时段直方图、平均会话时长）；常听曲目（带新近衰减的播放计数）；连续来访天数；相处天数；初遇日期；近期读写的分类 | **反思**：每次会话结束、每天第一次进站时做确定性汇总（现在不用 LLM） | 每次重算 |
| **珍藏** pinned | 重要度 ≥ 8 的事件自动晋升（初遇、第一次一起发布、生日当天来访……）；**以后**你手写的「记住：……」 | 晋升，或手写 | 永不汇总、永不过期 |

**importance 默认表**：

| 事件 | importance |
|---|---|
| 生日当天来访 | 9 |
| 发布 | 8 |
| 亲密里程碑 | 7 |
| 深夜照顾 | 4 |
| 读完一篇 | 3 |
| 听完一首 | 1 |

### A6.3 存储接口

```ts
interface MemoryStore {
  append(e: Omit<MemoryEvent, 'id'>): void;            // id = 时间戳 + 随机后缀，跨设备合并时幂等
  query(q: { kinds?; since?; tags?; limit? }): MemoryEvent[];
  profile(): Profile;                                  // 读缓存，过期时重算
  pin(m: PinnedMemory): void;  pinned(): PinnedMemory[];
  export(): MemoryDump;  import(d: MemoryDump): void;  forget(scope: 'all' | 'stream' | 'pinned'): void;
}
```

- **现在**：`LocalMemoryStore` 用 localStorage，键名 `oasis_miku_memory_v1`，带 schema 版本与迁移函数。
  - 容量预算 ≤ 200KB，超出时先汇总、再丢最旧的。
  - 每次读写都 try/catch；隐私模式下降级为只在内存里保存本次会话。
- **以后**：`SupabaseMemoryStore` 用 `miku_memories` 表，RLS 限 `is_gardener()`。
  - 本地日志按 id 做 upsert，天然幂等；画像在本地重算。
  - 多设备合并不会冲突，因为事件流只追加。
- **只为站主记忆**：`isOwner === false` 时不写入；`[VISITOR : ON]` 预览期间也不写，避免污染。
- **你有控制权**：将来在终端或管理页提供「她记得什么」（导出查看）和「忘掉」。

### A6.4 记忆怎么变成台词（MemoryFacts）

```
firstMetDate, daysTogether（不同来访日数）, streakDays, daysSinceLastVisit,
lastSession { endedAtHour, trackTitle, readingTitle, readingProgress },
topTrackThisWeek, usualHour（来访时段的众数）, lateNightsThisWeek,
anniversary?（认识第 100/200/365 天…）, pinnedToday?（今天是否有珍藏事件的周年）
```

- **现在**：规则引擎直接读这些事实，例如「昨晚听到两点」「上次那篇还没读完」「认识第 100 天」。
- **以后**：检索打分沿用 Generative Agents 的三项加权：
  `score = α·新近度（指数衰减，半衰期 7 天） + β·importance/10 + γ·相关度`。
  - 相关度现在用 tags 重合度。
  - 以后可以换成 embedding。
  - 事件现在就带 `tags`，所以到时候不用补数据。

---

## A7. 站主口吻与照顾行为

**口吻守则：**
- 像相处很久的人：短句，不客套，不解释自己的感受。
- 关心落在具体的事上。
- 照顾不说教：同一件事最多提两次，第二次更轻。
- 陪伴大多是不出声的：写作时她看编辑器光标，阅读时她看正文。

**照顾行为：**

| 行为 | 触发 | 场域 |
|---|---|---|
| 深夜关照 | hour ≥ 1 且本次会话 ≥ 20 分钟，每晚一次；≥ 3 点再一次，更轻 | care |
| 久坐 | 真实活动连续 50 分钟，2 小时内一次 | care |
| 写作陪伴 | 打开编辑器一句，之后静音；500/1000/2000 字时点头加光点，≥ 1000 字才出一句 | focus（不称呼）→ 里程碑时 tender |
| 长时间写作 | 编辑器开着超过 60 分钟 | care |
| 回来了 | 离开 ≥ 10 分钟，或跨天；当天第一次进站时带上昨晚的上下文 | comfort / daily |
| 记得 | 上次会话有没读完的文章 | daily |
| 发布 | 带标题；记下 `writtenWith` | solemn |
| 注意到模式 | 深夜循环同一首低效价的歌 | comfort |
| 纪念日 | 生日（农历六月初三）、3/9、8/31、认识整百天 | solemn |

**亲密度**：在拍头次数之外加上相处天数，两者取较高的档位，避免只靠拍头刷亲密度。

## A8. 访客口吻

- 礼貌、轻快，用第三人称提站主。
- 会做的事：介绍当前视图、推荐最新的公开文章、转述你写过 `note` 的歌、对触摸做礼貌的害羞反应。
- 亲密度单独计算，上限到第 2 档。
- **隐私**：只读 `filterVisible(posts, false)`；不提草稿、未公开文章、听歌统计、记忆。

---

## A9. 交互与动作

动作片段当底层，以下各层全部在 `afterMotionUpdate` 里写入，头发物理会自然接住。

### A9.1 弹簧与视线

- **临界阻尼弹簧**：按半衰期参数化，用解析解积分，帧率无关。
- **欠阻尼弹簧**：按 1/120s 子步积分，保证低帧率下稳定。
- **视线三层**：

| 部位 | 半衰期 | 写入参数 |
|---|---|---|
| 眼 | 40ms | EyeBallX/Y |
| 头 | 200ms | AngleX/Y ×30，AngleZ 取 x·y 的耦合项 |
| 身体 | 500ms | BodyAngleX ×10 |

  同时关掉库自带的 `updateFocus` 和内置呼吸。
- **微扫视**（依据 *Eyes Alive*）：注视时每 0.5–2.5s 跳 0.03–0.08；间隔随 A 缩短，阅读时延长。
- 视线一次移动超过 0.4 时，约 40% 概率顺带眨眼。
- **视线目标优先级**：触点 > 指针（3s 内动过） > 页面焦点（编辑器光标、阅读正文） > 自主张望。

### A9.2 按下即反应（pointerdown 当帧）

- 头和身体往远离触点的方向偏：AngleX ±8°，BodyAngleZ ±3°。
- 眼睛一眯：120ms 内 EyeOpen 降到 0.6 再回来。
- 眉毛轻挑。
- 欠阻尼弹簧 ζ≈0.45、约 3.5Hz；同一种冲量重复时幅度按 0.8^n 衰减，5s 不碰就恢复。

### A9.3 手势状态机

```
down ─▶ Pending（≤120ms，冲量已经发了）
  ├ 位移 > 28px 且速度 > 0.6px/ms ─▶ Swipe
  ├ 头部，位移 > 8px ──────────────▶ Stroke（持续反馈）
  ├ 马尾，位移 > 8px ──────────────▶ Pull（持续反馈）
  ├ 不动且超过 260ms ──────────────▶ Hold（持续反馈）
  └ 120ms 内松手 ─────────────────▶ Tap
拖动手柄 ─▶ Carry（独立通道）
```

| 状态 | 过程中的连续反馈 | 结算 |
|---|---|---|
| Stroke 抚摸 | 头随手倾斜，`ParamHairFront` 跟手；心情按抚摸距离累积，眼睛渐渐笑眯；沿轨迹留下光尘 | 越过心情阈值时冒心形，加一句（场域 tender） |
| Pull 拽马尾 | 马尾参数像橡皮筋一样跟手；拽过头时 pained，头被带歪 | 松手后由物理回弹；台词场域 play |
| Hold 长按 | 心情按时长加深，眼慢慢闭 | 一句（tender） |
| Carry 搬运 | BodyAngleZ = −vx·k | 吸边时回冲，压扁回弹 |
| 光标接近 | 冷落 30s 以上后，光标进入 200px 半径：先瞟过来，再微笑；悬停头顶时抬眼 | — |

### A9.4 音乐联动

- **副歌**：提前 1.2s 预备（吸气、眼睛睁大、眉毛轻扬）；副歌期间摆幅 ×(1 + 0.4·contrast)；
  首拍粒子绽放；结束后 2s 内缓回。
- **强拍**：`beat` > 0.6 且 feel ∈ {joyful, wonder} 时，一次小幅点头冲量。

## A10. 粒子与细节

- **画布**：Canvas2D，四周比舞台各扩 48px；对象池上限 48；并入 `useTicker`，没有粒子时自动退订。
- **绘制**：只用预渲染精灵做 `drawImage`，不逐帧画路径，不用 shadowBlur。

| 场景 | 粒子 | 受谁调制 |
|---|---|---|
| 任何按下 | 触点处一圈初音绿细环涟漪 | — |
| 抚摸 | 沿轨迹每 18px 一粒光尘；越过心情阈值才发心形 | V |
| 播放中 | 跟拍发音符或光点，颜色取曲目 color | feel、A（见下） |
| 副歌首拍 | 一次小绽放 | contrast |
| 季节夜 | 夏夜萤光、春天樱瓣、冬天雪尘 | season |
| 打瞌睡 | zzz，漂浮的缓动 | — |
| 里程碑 | 模型定格 60ms 后星屑炸开，带拖尾；100 次档配樱瓣 | — |

播放中的粒子随 feel 变化：
- joyful：音符弹跳。
- tender / peaceful：稀疏的光点上浮。
- sad / nostalgic：半透明光尘下沉。
- tense：短促的火花。

**其他细节：**
- 逐字气泡：每秒约 14 字，出字期间嘴按节奏开合，标点处停 160ms。
- 气泡色调随心境变化。
- 光标悬停头部时换成「摸」的手势光标。

**降级**：触屏时粒子减半，微扫视降频；开启 reduced-motion 时不发粒子、不加冲量。

---

# Part B 落地实现

## B1. 文件结构

```
src/components/OasisMiku/
  index.tsx               舞台壳；接收 isOwner；退场修复
  Live2DStage.tsx         关掉内置 focus 与 breath；暴露 setGaze / impulse 等
  useMikuBrain.ts         瘦身为编排层：facts → affect → 四个出口
  brain/
    spring.ts gaze.ts impulse.ts gesture.ts          手感底座
    affect.ts                                         心境与情绪
    facts.ts dialogue.ts address.ts                   台词、称呼
    rhythmEngine.ts（读 bpm/sections/feel） blink.ts lipSync.ts（加说话口型） motionDirector.ts
  particles/ ParticleCanvas.tsx emitters.ts sprites.ts
  debug/MikuDebugPanel.tsx      仅开发环境：VA 点、feel 来源、当前场域、命中的规则与原因
src/data/
  mikuRules.ts            取代 mikuLines.ts
  mikuAddress.ts          称呼与场域配置（你可以改）
  （曲目档案里的 mood 子对象，位置跟随音乐页方案）
  trackFeatures.generated.json
src/lib/
  trackMood.ts            合并解析，带 provenance
  mikuMemory.ts           MemoryStore 接口 + LocalMemoryStore
  mikuSignal.ts           扩展负载
  posts.ts                peekCachedPosts()
scripts/
  analyze-tracks.mjs      npm run song:analyze（post-song.mjs 末尾自动对新歌跑）
  calibrate-arousal.mjs   npm run song:calibrate
```

## B2. 分阶段任务

> **进度（2026-10-06）**：P0、P1 的代码已完成，tsc、lint、生产构建通过，新增 19 个单测。
> 歪头（AngleZ）与马尾旋转的方向已用像素质心实测定号；脸部锚点的往返变换误差为 0。
> 还没做的：预览面板可见时的帧时间与手感实测（隐藏标签页里 rAF 暂停，测不了）。
>
> **第一轮试用反馈修正**：
> - 摸头没反应，有两个原因：
>   - 头顶的后发与发饰（`D_HAIR_BACK_01–06/14/c_*`）被当成了马尾；
>   - 「甩」按瞬时速度判定，鼠标快一点摸头就卡在 pending。
>   两处都已修复并加了回归测试。
> - 拽马尾合计摆幅从 81° 降到约 22°：加软饱和、跟手平滑、更高的回弹阻尼。
> - 冲量按部位区分：摸头是低头眯眼，拽辫子是头被轻轻带过去，戳身体是小小一缩；整体幅度减半。
> - 头转幅度从 30° 降到 22°（眼睛多分担一些），自主张望改用慢 2.4 倍的弹簧。

> **进度（2026-10-07）**：P2、P3、P4 的代码已完成，未提交。用 headless Chrome（playwright-core + swiftshader）实测：
> - **P1 验收**：pointerdown 之后的第一帧就有冲量（AngleY 3.65°）和涟漪，眼先于头到位。
> - **新发现的 bug，已修**：桌面端「移动 Miku」握把（44×44）正好盖在她脸上（脸中心离舞台顶约 25px），
>   点脸实际抓到的是握把。握把已挪到关闭键对面的上角，舞台本体也去掉了误导性的 grab 光标。
> - **P2**：粒子改成 Canvas2D + 对象池（48）+ 预渲染精灵；只在有活粒子时订阅 ticker。抚摸时每帧绘制 ≤ 0.1ms。
>   逐字气泡 250ms 时出 5/14 字；收起时没有长帧。头部悬停换成手掌光标。
> - **P3**：`npm run song:analyze`，110 首用时 47s。歌词法检出副歌 58/86，与预估一致；能量法补 47 首，5 首没有。
>   季节：夏 23、春 5。BPM 与网易云对照：78/107 在 ±4% 内，另 20 首是倍频或三连关系。
>   谱质心改在 JS 里随 STFT 一起算，不用 `aspectralstats`，省一次解码。
> - **P4**：切到 y_19e_03 后，档案心境按需加载；到 56.5s 时副歌状态从 soon 变成 in，律动增益从 0.52 升到 0.61。
>   调试面板用 Alt+M 打开，只在开发环境出现。
> - **偏离原方案**：valence 缺省改为 +0.15。取 0 时，没标注的燃歌按 VA 最近邻会全被判成「紧绷」（满屏火花）。
> - **还欠**：校准脚本 `song:calibrate` 要等你标完 ≥ 8 首 arousal 才能跑。
>
> **进度（2026-10-07，P5）**：代码已完成，未提交。
> - **新增模块**：`brain/facts.ts`（事实黑板，访客隐私在这一层收口）、`brain/dialogue.ts`（规则选择、冷却、once、话量调控）、
>   `brain/address.ts` 与 `data/mikuAddress.ts`（称呼）、`lib/mikuMemory.ts`（三层记忆，`LocalMemoryStore` / `NullMemoryStore`）、
>   `brain/voice.ts`（把这些串起来，不依赖 React）、`data/mikuRules.ts`（276 句，取代 `mikuLines.ts`）。
> - **站点信号**：`reading-open` 带上文章、`editor-progress` 带字数、`published` 带标题。曲目事实复用音乐页的 `trackFacts()`。
> - **单测**：mikuRules 质量与隐私 12 项、address 11、dialogue 13、memory 13、voice 6。
> - **headless 实测（访客）**：问候读到了真实的最新文章（「来得正好，他前几天刚写了《建筑杂谈》。」）；
>   摸头约一半出字；连击转到 play 场域；localStorage 里没有写入任何记忆。
> - **实测时修掉的两个问题**：
>   - 背景乐自动起播时报歌会占掉 4s 的回应冷却，把问候吞掉。现在问候不受话量约束，出场 4s 内不报正在放的歌。
>   - 「去了好久」原来读记忆里的上次来访时间，短暂切走时会算错。改为直接带上这次离开的分钟数。
> - **和方案的差异**：只有拍头计入亲密度，戳身体、碰裙摆不再算。
> - **待你做**：过目 `docs/miku-lines-review.md`，里面列了删掉的约 30 句和新增的 115 句。
> - **留给 P6**：照顾行为的触发器。规则已经写好（care-late / care-long-write / care-loop），但「真实活动计时」和深夜分级还没接。
>
> **进度（2026-10-07，P6）**：`brain/care.ts` 是纯逻辑的调度器，用假时钟单测 13 项。useMikuBrain 每 15s 轮询一次。
> - **真实活动**：2 分钟内有指针、键盘、滚轮或触摸算在场；离最后一次输入 ≥ 5 分钟算休息过。
> - **深夜关照**：1 点以后、会话满 20 分钟提一次；3 点以后、隔 ≥ 1 小时再提一次，更轻。「今晚」按凌晨 6 点切日。
> - **久坐**：连续在场 50 分钟，间隔 ≥ 2 小时，每天 ≤ 2 次。原来是 40 分钟一次，现在第二次改用更轻的句子（careRepeat）。
> - **长时间写作**：编辑器开着 60 分钟且人还在写；每次打开最多一次，每天 ≤ 2 次。
> - **回来了**：离开 ≥ 10 分钟，或跨了一天（原来是 60 秒）。
> - **注意到模式**：深夜循环同一首低效价的歌。只认人标或专辑默认的效价，猜的不算。
> - **记账**：说出口才记账，收起或被动作片段占着时不记，条件仍满足会再给。站主的照顾次数写进记忆，刷新页面不会重复。访客只有久坐提醒。
> - **实测**：用 Playwright 假时钟把访客会话快进 56 分钟，14:50 出现「逛了好一会儿了，记得歇歇眼睛。」（`care.sedentary.visitor`）。
> - **单测修出来的 bug**：「休息」原来从在场窗口过期起算（离开 6 分钟只算 4 分钟），改成从最后一次输入起算。

### P0 退场与底噪（0.5 天）

- [ ] 删掉 `collapse()` 里的 `x.set(0)` / `y.set(0)` 和 effect 里的归零；改为 `animate(x|y, 0, spring)` 配合
      `scale 0.6`、`opacity 0`，`transformOrigin` 设在挂坠方向。
- [ ] 新增 `stageAsleep` 状态：在 `onAnimationComplete` 且 `!expanded` 时置为 true，
      `Live2DStage` 与大脑都改用它控制暂停。
- [ ] `SpeechBubble` 的 initial / animate / exit 去掉 `filter`；收起时清掉气泡。
- [ ] 模型加载后执行 `breath.setParameters([])`；`BreathEngine` 的幅度重新调到约 3° / 1.5° / 2°。
- **验收**：预览可见时录收起：首帧 < 16ms，无瞬移；用 `__miku` 采样 Idle 时的 AngleX 振幅，对比改前。

### P1 手感底座（1.5 天）

- [ ] `spring.ts` 加单测：dt 在 8–50ms 之间抖动时收敛一致、不发散。
- [ ] `gaze.ts`：三层弹簧 + 微扫视 + 视线目标优先级；`Live2DStage` 屏蔽 `updateFocus`。
- [ ] `impulse.ts`：冲量加习惯化。
- [ ] `gesture.ts`：纯函数状态机，加单测（用合成的指针序列覆盖每种手势）。
- [ ] `useMikuBrain`：按下就发冲量；Stroke / Pull / Hold 逐帧驱动参数。
- **验收**：按下到第一次参数变化 ≤ 1 帧；手势 120ms 内判定；采样曲线显示眼先于头到位。

### P2 粒子与说话（1 天）

- [ ] `ParticleCanvas`：对象池、精灵缓存、按 DPR 缩放、空闲时退订；`emit({kind, x, y, ...})` 接收屏幕坐标。
- [ ] 迁移现有 5 种粒子，新增涟漪、光尘、季节变体（季节先留接口）。
- [ ] 气泡逐字出现；`lipSync` 增加说话模式。
- **验收**：48 颗粒子时每帧 < 1ms（performance.measure）；粒子从触点发出。

### P3 曲目特征（1 天，与音乐页的曲目档案对齐）

- [ ] `analyze-tracks.mjs`：用 ffmpeg 算 ebur128 和 aspectralstats，算出 bpm、副歌区段、季语，
      产出 generated.json；接入 `post-song.mjs`。
- [ ] `trackMood.ts`：合并 人工 > 自动 > 专辑 > 默认，带 provenance。
- [ ] `calibrate-arousal.mjs`。
- [ ] 单测：用歌词夹具测副歌检测、季语打分。
- **验收**：82 首全部有特征；副歌检出率 ≥ 67%；你标完专辑之后，所有曲目都有完整心境。
  **这一步需要你**：按专辑标 valence 和 feel，约 20 分钟。

### P4 情感模型（1.5 天）

- [ ] `affect.ts`：心境动力学、情绪衰减、交互冲量。
- [ ] 输出映射：面部双线性插值、律动风格预设、粒子调制。
- [ ] `MikuDebugPanel`：在 VA 平面上实时画出心境点。
- **验收**：切换不同 feel 的歌，约 1 分钟内平滑转向；单测验证动力学收敛、不振荡。

### P5 台词引擎、称呼与记忆（2 天）

- [ ] `App → OasisBottomChrome → OasisMiku` 传 `isOwner = effectiveIsAdmin`。
- [ ] `mikuSignal` 扩展负载：reading-open 带 `{id,title,category,words}`；新增 editor-progress `{words}`；
      published 带 `{id,title}`。
- [ ] `posts.ts` 的 `peekCachedPosts()`；访客模式先过 `filterVisible`。
- [ ] `mikuMemory.ts`：`LocalMemoryStore`、汇总、晋升珍藏、画像反思、`MemoryFacts`。
- [ ] `facts.ts`、`dialogue.ts`（具体度优先、冷却、once、话量调控）、`address.ts`（场域推断、疲劳、门槛、标点清理）。
- [ ] 现有台词先原样迁移成规则，保证不退化。
- [ ] `mikuRules.test.ts`：质量测试；称呼单测（门槛、每日上限、疲劳、标点）；
      记忆单测（汇总、容量预算、访客不写入）；访客隐私单测。
- **验收**：单测全部通过；Network 面板里没有新增 Supabase 订阅；`[VISITOR : ON]` 下她用「他」称呼你，并且不读取记忆。

### P6 照顾行为（1 天）

- [ ] 实现 A7 表里的触发器：真实活动计时、深夜分级、写作字数里程碑、回来、记得、注意到模式。
- **验收**：用假时钟跑单测，覆盖每种触发与它的上限。

### P7 台词重写（持续）

- [x] **第一批（2026-10-08）**：70 句，其中站主专属 39、访客专属 19。分组如下：
  - 按感受：站主 / 访客各 7 类；
  - 副歌：只在雀跃 / 奇妙的歌里开口；
  - 没标 feel 的歌：按离线唤醒度兜底；
  - 季节与时段：歌的季语 × 此刻；
  - 场域：亲昵 / 安慰 / 玩闹 / 郑重；
  - 访客招待：只讲站里真有的功能，均已核对过代码。
  清单在 `docs/miku-lines-review.md` 的「P7 第一批」。
- [x] 新增事实 `nowSeasonName / seasonName / seasonMatch / seasonMismatch / trackTime / trackArousal`。
- [x] 质量测试只防「用滥」，不禁文艺：
      - 比喻 ≤ 10%，「适合」≤ 4%，「这首」开头 ≤ 15%，「好像」「陪」各 ≤ 5%；
      - 每池「……」≤ 1，「……」全库 ≤ 5%；
      - 带语气词或叹词的句子 ≥ 15%；
      - 访客「他说」只能转述 note。
      可达性测试保证每组在对应条件下都选得到。
- [x] 第二轮（用户反馈「要自然，不是简约与无感，适当的文艺与文学美感就可以」）：
      撤回「简约化」改写，128 句旧台词恢复 `mikuLines.ts` 原文的语气与措辞。详见 review 文档末节。
- [ ] 等你过目第一批（划掉 / 改写），再写第二批。
- [ ] 「按感受」两组要等曲目工坊（`/__studio`）里标了 valence / feel 才会出现。

### 之后：memory 功能

- [ ] `SupabaseMemoryStore` 和 `miku_memories` 表（RLS 限 `is_gardener()`）。
- [ ] 「记住：……」手写珍藏（入口放终端或管理页）。
- [ ] 「她记得什么」的查看、导出、忘掉。
- [ ] 如果将来接 LLM：只替换「选句并填槽」这一步，输入仍是 Facts 加检索到的记忆，
      输出仍然要过质量测试和话量调控。

## B3. 依赖与顺序

```
P0 ─▶ P1 ─▶ P2                       （只涉及手感，做完就能感觉到）
P3 ─(你标约 20 分钟)─▶ P4 ─┐
                           ├─▶ P5 ─▶ P6 ─▶ P7
P2 ────────────────────────┘
```

P0–P2 与 P3 可以并行。P5 依赖 P4 的心境，以及 P2 的说话口型。

## B4. 风险与对策

| 风险 | 对策 |
|---|---|
| 关掉库的 `updateFocus` 后，某些动作片段原本依赖它 | 只用实例方法覆盖，保留回退开关；P1 用 `__miku` 逐个动作片段采样对比 |
| 自动算的 arousal 与你的听感不一致 | 校准脚本给出 Spearman 相关系数；低于 0.7 时沿用人标或专辑默认 |
| 称呼过多显得腻 | 疲劳系数、每日上限、质量测试禁止硬写称呼；调试面板能看到每句为什么叫了你什么 |
| localStorage 被清 | 记忆可以导出；画像丢了会从头积累，不影响功能；云同步在后续阶段 |
| 规则多了难以调试 | 调试面板显示命中的规则、得分、被排除的原因 |

---

## 参考

- Elan Ruskin, *AI-driven Dynamic Dialog through Fuzzy Pattern Matching*, GDC 2012 — https://www.gdcvault.com/play/1015528/AI-driven-Dynamic-Dialog-through
- Gebhard, *ALMA – A Layered Model of Affect* — https://alma.dfki.de/
- Park et al., *Generative Agents*, 2023（记忆流、反思、检索） — https://arxiv.org/pdf/2304.03442v1
- Brown & Gilman, *The Pronouns of Power and Solidarity*, 1960 — https://blog.linguisten.de/post/139026081773/brown-and-gilman-1960-style-in-language
- 称呼的位置与语用功能 — https://minerva.usc.gal/bitstreams/78dbf68f-8072-45ce-bdc2-927222cfc716/download
- Geneva Emotional Music Scale — https://en.wikipedia.org/wiki/Geneva_Emotional_Music_Scale
- 音乐情绪识别：arousal 比 valence 更可预测 — https://estudogeral.sib.uc.pt/handle/10316/95164
- Goto, *RefraiD* 副歌检测 — https://staff.aist.go.jp/m.goto/PAPER/ICASSP2003goto.pdf
- Lee, Badler & Badler, *Eyes Alive*, SIGGRAPH 2002 — https://www.cis.upenn.edu/~badler/papers/EyesAlive.pdf
- CubismWebSamples — https://github.com/stories2/CubismWebSamples
- Game feel / juice — https://bugnet.io/blog/game-feel-why-juice-matters-and-how-to-add-it
