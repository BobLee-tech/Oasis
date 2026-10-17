# 共鸣（音乐页）：设计与落地方案 v1（2026-10-05）

> **一句话**：先把「点了就稳」做好，再把每首歌的资料补齐成一份**曲目档案**。播放器、歌词、
> 曲目卡和 Miku 都只读这一份，每个字段只标一次。
> 资料以网易云为主源；网易云没有的，从网页导入；审美判断（介绍、心境、你的话）留给你。

与 [docs/miku-design.md](miku-design.md) 的分工：本文负责曲目档案的**格式、存放、来源、
导入与展示**；Miku 文档负责 `mood` 子对象的**算法与消费**（A2）以及她怎么用这些事实说话（A4）。
两边字段一一对应，本文 A3 的表里标出了每个字段在 Miku 那边的位置。

**已拍板**

| 问题 | 结论 |
|---|---|
| 卡顿指什么 | 点按钮后元素错位、动画首尾帧跳动（不是掉帧） |
| 资料来源 | 歌词与歌曲信息以网易云为主；网易云没有的，从网页导入 |
| 5 首「缺歌词」的 Yorushika | 都是纯音乐：夏陰、ピアノを弾く / 飛行 / 前世 / 落下 / 夏、バス停、君を待つ |
| 歌曲介绍与标注 | 要做，并且 Miku 会读它们做即时交互；与 Miku 的曲目标注合并成一份 |
| 网易云歌单同步 | 暂不做（实测结论见文末附录，以后重启不用重测） |
| 每个字段 | 必须同时有来源和消费者（沿用 Miku 文档 A2.1 的原则），否则不进 schema |

---

# Part A 设计

## A0. 现状问题（有证据的）

测量方法：在开发服务器上，点击后每一帧记录元素的位置（`getBoundingClientRect`），找「前后都静止、
中间一帧突然跳很远」的元素，以及「高亮块与它所属按钮的中心差」。

| # | 问题 | 证据 | 阶段 |
|---|---|---|---|
| 1 | 歌词/选碟切换时整条控件瞬移 | 切换条一帧上移 263px；高亮块（`layoutId="resonancePanelPill"`）340ms 后才追上，中途一帧跳 170px。原因：上方曲目信息用 `AnimatePresence mode="popLayout"` 退场，当帧脱离排版，切换条没有过渡 | P0 |
| 2 | 选碟→歌词时标题首尾帧跳 | 大小两个标题重叠约 200ms；字号在第一帧突变（`layout="position"` 只补间位置）；新标题透明度停在 0.42 后一帧跳到 1。原因：`layoutId="track-title"` 的另一端在 LyricField 的 `trackRef` 里，这一层每帧被 ticker 直接写 transform，framer 量不到 | P0 |
| 3 | 点选曲目：先没反应，再连跳两次 | 点击后约 0.95s 无变化（`switchTrack` 先等 800ms 淡出才换曲目，useSoundscape.ts:563）；随后新旧两行歌名宽度一帧变化 65px（桌面行尾插入「On Deck」、手机插入律动条，都占文字宽度）；1.77s 时新标题行数不同，标题下方所有内容一帧上移 40px（`mode="wait"` 换标题，容器高度没预留） | P0 |
| 4 | 播放中整页每秒重渲染 | `timeupdate` 每秒通知 → 整个 OasisResonance（110 行、约 1300 节点）重渲染，18 处 `layout/layoutId` 每次都重新测量。开发模式下每秒一个 63–91ms 长帧；线上构建在 Mac 上不明显，但手机 CPU 慢 4–6 倍 | P0 |
| 5 | 歌词有缺口 | 91 首人声曲里 5 首完全没有（m_03 / m_13 / m_14 / m_24 / m_31）；左右盲 267s 的歌只有 90s 的 TV 版歌词；16 首译文缺 15–33% 的行（LRCLIB 原文 + 网易云译文的移植对齐丢行）；3 首混入作词作曲行（ピアス、僕らはそれを愛と呼んだ、逃亡） | P1–P3 |
| 6 | 歌曲没有资料 | Track 只有 title/artist/color/excerpt；Miku 只有 7 首专属台词，其余靠艺人分类兜底 | P2–P5 |
| 7 | Miku 口型读不了汉字 | `lipSync.vowelOf` 只认假名；已发布歌词中汉字占 25.8%，这些字一律给中性口型，且「嘘」这类两拍字只给一拍 | P4 |

能复用的底子：歌词发布管线（本地优先、发布时固化、`reviewed` 人工闸门）、`tracks.identity.json`
（音频标签、时长、ISRC）、`lyric:review` 本地校对页、ticker 与 ref 写样式的动画体系、
`LyricLine.words`（v2 逐词时间，类型已在，数据还没有）。

## A1. 总体架构

```
 ┌──────────────── 来源（只在本机、只在导入时访问）────────────────┐
 │ 网易云（主）：同步原文+译文+罗马音、词曲署名、译者、中文译名、专辑、曲序、出处   │
 │ LRCLIB：同步原文（网易云缺失或版本不对时）                                   │
 │ 网页导入：VocaDB / Wikipedia / MusicBrainz 适配器；任意 URL；粘贴             │
 │ 离线分析：ffmpeg 特征（Miku A2.3）· 歌词重复块 · 季语 · 假名读音             │
 └──────────────────────────────┬───────────────────────────────┘
                                ▼
            曲目工坊 /__studio（仅开发服务器；你在这里选、改、标）
                                ▼
   music-data/（进 git，人能读能审）          lyrics-src/ → dist-lyrics/（gitignore，发布到 R2）
                                ▼  npm run music:build（校验 + 合并 + 出处）
              src/data/trackProfiles.generated.json（按需 import 的独立 chunk）
                                ▼
     播放器 · 选碟台 · 歌词场 · 曲目卡（liner notes） · Miku Facts / lipSync / rhythm
```

为什么这样分：
- **访客浏览器从不访问第三方。** 第三方接口随时会变、会限流、会有地区限制；出错只会发生在你导入的那一刻，
  而不会发生在别人听歌的时候（沿用歌词管线的原则）。
- **档案进 git，歌词正文不进。** 介绍、心境、你的话是你写的内容，需要历史和审阅；歌词正文有版权，
  继续只发布到 R2。
- **工坊是唯一的人工入口。** 不手改 JSON；工坊直接写文件，`git diff` 就是审阅记录。

## A2. 交互稳定：四条规矩

写进 OasisResonance.tsx 文件头（同星图的五条硬规矩），改之前必读：

1. **100ms 内给画面反馈。** 点击当帧就更新界面状态（当前曲目、高亮、状态文字）；
   音频的淡出淡入在后台独立进行，不阻塞界面。用户主动切歌的淡出从 800ms 缩到 180ms，自动续播保留长淡入。
2. **控件不随内容迁移。** 切换条、播放控制、标题区的位置和尺寸在所有状态下固定：
   - 歌词/选碟切换条挪到右栏顶部的固定行，两种模式下同一位置；
   - 标题区按两行预留固定高度，新旧标题在同一个盒子里叠放交叉淡化（不用 `mode="wait"`）；
   - 在播标识放进曲号那一格替换数字（Apple Music 的做法），不再插进文字所在的那一行。
3. **一个元素只归一套动画系统管。** 去掉跨容器的 `layoutId`（`track-title`、`track-excerpt`、
   `stage-meter`）。共享元素过渡只用在**两端父容器都静止**的元素上，例如切换条的高亮块、分类下划线。
   被 ticker 每帧移动的容器里，不放任何 framer 的 layout 元素。
4. **最后一帧等于静止态。** 动画只用 transform 和 opacity；尺寸变化要么预留，要么整体做补间，
   不允许在动画结束时才改排版。

**动效档位**（`src/lib/motion.ts`，同星图的字号档位思路）：现在散落着 0.28 / 0.3 / 0.6 / 0.8 / 1.5s
等多种时长，统一收成 4 档：

| 档 | 时长 | 用途 |
|---|---|---|
| tap | 120ms | 按下反馈、高亮块落位 |
| swap | 200ms | 同位置内容交叉淡化（标题、面板） |
| move | 320ms | 位置变化（抽屉、曲目卡展开） |
| mood | 1450ms | 情绪色（只有一个注册过的 `--accent` 变量在过渡，取代十几处 `transition-colors duration-[1500ms]`） |

**状态拆分**：`useSoundscape` 拆成「命令」和「按需订阅」两部分：
- 命令（`play / pause / switchTrack / seek …`）是模块级稳定函数，组件直接 import，不用订阅。
- `usePlayer(selector)` 基于 `useSyncExternalStore`，组件只在自己选中的字段变化时重渲染。
- 进度条、时间文字、唱臂角度不进 React：和歌词一样，用 ticker 读 `getPlaybackTime()` 直接写 DOM。
- 选碟台抽成 `React.memo` 组件，依赖只有分类、当前曲目 id、是否在播。

## A3. 曲目档案（TrackProfile）

### A3.1 字段总表

| 字段 | 含义 | 来源 | 消费者（本页） | 消费者（Miku） |
|---|---|---|---|---|
| `ncmId` | 网易云曲目 id | 匹配（A4.2）或手动指定 | 导入管线 | — |
| `titleAlt?` | 译名（中文或英文） | 网易云 `transNames`；可手改 | 曲目卡副标题；搜索 | 台词槽 `{titleAlt}` |
| `album` `trackNo` `released` | 专辑、曲序、发行日 | 音频标签 > 网易云 | 曲目卡；选碟台分组（取代从文件夹名猜专辑） | 「2019 年那张《エルマ》里的…」 |
| `credits` | 作词、作曲、编曲、演唱 | 网易云歌词头 `作词 : …` > VocaDB > MusicBrainz（ISRC） | 曲目卡 | `{composer}`；访客介绍 |
| `tieIn?` | 出处（游戏、动画、广告…） | 网易云「音乐百科」的影视节目 > VocaDB | 曲目卡 | 访客介绍 |
| `intro?` | 关于这首歌（60–120 字） | **你写**；工坊并排显示网页导入的参考资料 | 曲目卡 | 访客规则「介绍这首」只用第一句 |
| `note` `noteVisitor?` `notePrivate?` | 你对这首的一句话 | 你写（Miku A2.2 / A2.5） | 曲目卡「他的话」（访客可见，与 Miku 的约定一致；`notePrivate` 时不显示） | 站主引用 / 访客转述 |
| `relations[]` | `{kind: 'reply' \| 'sequel' \| 'sameStory' \| 'sameLyrics', to}` | 你标；VocaDB 的 sequel 标签、网易云「相似歌曲」只作为工坊里的建议；`sameLyrics` 从现有 `sameLyricsAs` 迁入 | 曲目卡里的关联曲链接 | 换歌规则：「上一首是エルマ，这首是她的回信」 |
| `mood` | arousal / valence / feel / bpm / sections / contrast / season / time | 算法与人标见 Miku A2.2–A2.7 | 曲目卡上的感受词（feel）；歌词场在副歌段落的水面线稍亮（sections） | 情感模型、律动、粒子、台词（Miku A3） |
| `lyrics` | 歌词来源与校对状态 | 管线（A4） | 歌词场 | `lyricZh`、口型 |
| `provenance` | 每个字段的来源：`manual / netease / vocadb / wikipedia / musicbrainz / web:<url> / auto / album / default` + 时间 | 自动记录 | 曲目卡底部小字署名；工坊 | 调试面板 |

**暂不收**（目前没有消费者）：曲风（网易云对 Yorushika 全标「流行」）、网易云推荐标签
（众包，エルマ 被标成「欢快」，可以在工坊里当作标 feel 的参考，但不入档案）、封面图
（等做 Media Session 锁屏信息时再加）、播放量。

**专辑层** `music-data/albums/<slug>.json`：`story`（专辑叙事，取代并合并现有
`lyrics-config/albums/*.json` 的 `context`，翻译脚本改读这里）、`moodDefaults`（Miku A2 里「专辑默认 → 逐曲覆盖」的那一层）。

### A3.2 存放与加载

- 来源文件：`music-data/tracks/<id>.json`、`music-data/albums/<slug>.json`，进 git。
- 构建：`npm run music:build`（挂在 `prebuild`）做三件事：
  1. 校验：id 必须存在于 PLAYLIST；字段类型；`note` ≤ 40 字（Miku A2.5）；`intro` ≤ 120 字。
  2. 合并：人标 > 导入 > 自动 > 专辑默认 > 缺省，写出 provenance（与 Miku 的 `trackMood.ts` 同一套优先级）。
  3. 生成 `src/data/trackProfiles.generated.json`，Miku 文档里的 `trackFeatures.generated.json` 作为它的输入之一。
- 运行时：`src/lib/trackProfile.ts` 用 `import()` 按需加载（独立 chunk，估计 110 首约 20KB gzip）。
  音乐页挂载时，或 Miku 第一次需要曲目事实时，才去取。
- PLAYLIST 暂时不动（`post-song`、`lyric:*` 等脚本都靠解析它）。档案按 id 挂靠；
  等工坊稳定后，再考虑把 title/artist/color/excerpt 也迁进档案。

## A4. 歌词：每首都「合适」

### A4.1 「合适」= 五道闸

发布前由 `scripts/lib/lyrics-gate.mjs` 检查，前四道不通过就拒绝发布：

| 闸 | 规则 | 现在拦得住的例子 |
|---|---|---|
| 版本 | 末行之后剩余 ≤ 45s（纯器乐尾奏可在档案里声明 `outroMs` 豁免）；首行不早于 0 | 左右盲（TV 版） |
| 洁净 | 没有 `作词 / 作曲 / 编曲 / 制作人` 等署名行（解析进 `credits`，不是删掉） | ピアス、逃亡 |
| 译文 | 每个非空行都有译文，或者显式标「不译」 | 八月、某、月明かり 缺 18/65 行 |
| 读音 | 每行都有假名读音（A4.4） | 现在全部都没有 |
| 试听 | `reviewed`：你在工坊里完整听过一遍 | 唯一不能自动判断的一道；不阻止发布，界面继续显示「待校」 |

### A4.2 来源优先级（网易云为主）

实测：91 首人声曲里，网易云有同步原文的 **83 首**；其中全部带译文，78 首带罗马音，
79 首歌词头带词曲署名。

1. **网易云原文 + 译文成对使用**：两者来自同一份转写、同一条时间轴，不需要移植对齐。
   这能从根上解决「16 首译文缺行」——缺行就是把网易云译文移植到 LRCLIB 时间轴上时丢的。
2. **LRCLIB**：网易云没有，或网易云的版本通不过「版本闸」时使用。
3. **网页导入**（A5）：两边都没有时使用。现在需要这一步的 5 首：
   心懐サミット、愛言葉II（VocaDB 有原文和罗马音，没有时间轴）；
   One Way、White Letter、melody…（冷门曲，需要找页面或粘贴）。

**匹配改进**：
- 多候选回退：通过「艺人 + 时长 ±5s」的前 3 个候选依次尝试，直到拿到有词的版本
  （同名曲的不同 id，有的「暂无歌词」，有的完整）。
- 检索归一化：全角罗马数字（VocaDB 只认「愛言葉Ⅱ」）、`feat.` 拆分、「Complete ver.」这类后缀。
  网易云在 m_09 / m_11 / m_15 / m_24 / m_31 上一个候选都没通过；愛言葉II 已确认是罗马数字的问题，
  其余几首的原因要在 P2 逐个查。

**换源规则**：`reviewed` 的歌词永远不自动替换。现有 LRCLIB 来源的，工坊里并排显示「当前版本 vs 网易云成对版本」，
连同五道闸的结果一起，由你点选是否替换；默认建议是「译文更完整且时间轴差 < 300ms 时换」。

### A4.3 没有时间轴的歌词：边听边打点

工坊的歌词页提供打点模式：
- 播放时按空格，记下一行的开始时间；按 `[` / `]` 微调 ±50ms；按 `⌫` 撤回一行。
- 打点会吸附到最近的起音点（用 Miku A2.3 里同一套 onset 包络，在 ±150ms 内找峰值），减少手抖误差。
- 打完一遍立即试听回放；通过五道闸后写进 `lyrics-src/<id>/original.lrc`，并沿用现有发布流程。

### A4.4 读音层（供注音与 Miku 口型）

- **来源**：网易云罗马音优先（它反映实际唱法，例如把「本気」唱成「マジ」）；没有罗马音的，用 kuromoji
  （只在构建期运行的 devDependency）分词取读音。两者冲突时，在工坊里标出来，让你确认。
- **存放**：`LyricLine.kana`：按词切分的读音片段 `[{ surface: '嘘', kana: 'うそ' }, …]`。
- **消费者**：
  - `beatsOf` 改为按音拍（mora）切分：「嘘」拆成两拍；`lipSync` 从读音里取元音，汉字不再一律给中性口型。
  - 歌词场新增「注音」开关（ruby 小字），和日 / 日中 / 中三态并列。

## A5. 网页导入

| 适配器 | 取什么 | 备注 |
|---|---|---|
| VocaDB API | 原文 / 罗马音歌词、词曲署名、标签、续作关系 | Miku 曲的主力补充来源；需要的话转成全角罗马数字再搜 |
| Wikipedia（MediaWiki API，ja / zh） | 专辑与歌曲条目的摘要 | 只作为你写 `intro` / `story` 的参考，显示在工坊旁边，不直接入档案；需要引用时保留出处链接（CC BY-SA） |
| MusicBrainz（ISRC） | 词曲署名 | 网易云与 VocaDB 都没有署名时使用 |
| 任意 URL | 页面正文 | 开发服务器代为抓取 → 去掉脚本、导航，只保留正文 → 你在工坊里框选需要的段落 → 指定填进哪个字段（歌词 / 署名 / 参考资料） |
| 粘贴 | 任意文本 | 永远可用的兜底方式 |

约束：
- 只在你点「导入」时抓取一次，不批量爬，不跟随链接。
- 只保存你框选的那部分，并在 provenance 里记下 URL 和时间。
- 抓取发生在本机 Node 端（工坊中间件），浏览器不跨域，访客端不涉及。

## A6. 曲目卡（liner notes）

隐喻：唱片纸套背面的**内页说明**。安静、排版克制，不是百科词条。

- **入口**：唱片中心的贴纸（盘面声槽仍是播放/暂停）；歌名（选碟铭牌、歌词栏头）；艺人行末「内页 ›」；手机唱片页上滑。
- **呈现**（2026-10 改，见 `docs/music-ripple-notes-demo.html`）：内页一直在水下，从点击处荡开涟漪揭开整张纸套，
  再点 / Esc / 点竖排标题沿原路会聚收回、在原点溅一小圈。唱机与切换条浮在水面之上。绝对定位，**不推动任何布局**（规矩 2）；
  氛围关或减弱动态时只做 200ms 交叉淡化。
- **内容**（缺的字段整段不显示，不留空壳）：

```
 エルマ                                  Elma（titleAlt）
 だから僕は音楽を辞めた · 2019 · No.12
 ───────────────────────────
 作词·作曲  n-buna
 ───────────────────────────
 {intro}
 ───────────────────────────
 他说：「{note}」                         ← 访客视角；站主看到的是「你写的」
 怀念 · 夏                                ← feel · season
 回信 → エイミー                          ← relations，点击即播放
 ───────────────────────────
 资料：网易云 · VocaDB · 你                ← provenance，小字
```

- **排版**：只用固定档位（衬线标题、等宽署名、正文一档），与星图 `.oasis-sky` 的令牌思路一致。
- **颜色**：情绪色只用在分隔线和感受词上，正文用墨色，避免对比度问题。

## A7. 给 Miku 的接口

- `getTrackProfile(id)`：档案加载完成后同步返回；加载前返回 `undefined`。按 Miku A4.2 的规则，
  任何槽位缺值，这句台词就不说。
- Facts 在 Miku A4.1 的基础上补这些字段：`track.titleAlt`、`track.album`、`track.year`、`track.credits`、
  `track.tieIn`、`track.introFirst`、`relationToPrev?`（由切歌事件带上 `prevTrackId` 计算）。
- `inChorus` 与副歌预备读 `mood.sections`（Miku A9.4）；`lipSync` 读 `LyricLine.kana`（A4.4）。
- 访客隐私：`notePrivate` 为真时，访客规则跳过 `note`；曲目卡同样不显示。

---

# Part B 落地实现

## B1. 文件结构

```
music-data/
  tracks/<id>.json             曲目档案来源（进 git）
  albums/<slug>.json           专辑叙事与心境默认值（迁入 lyrics-config/albums 的 context）
scripts/
  music-studio/                工坊：Vite 插件（apply: 'serve'）+ 页面 + 中间件
    plugin.mjs  api.mjs  page/
  lib/sources/
    netease.mjs                扩展自 netease-lyrics.mjs：多候选、成对歌词、罗马音、署名、详情、百科
    lrclib.mjs  vocadb.mjs  wikipedia.mjs  musicbrainz.mjs  webpage.mjs
  lib/lyrics-gate.mjs          五道闸（post-lyrics --publish 与单测共用）
  lib/kana.mjs                 读音对齐（网易云罗马音 / kuromoji）
  build-profiles.mjs           npm run music:build（挂 prebuild）
src/
  lib/player/                  store.ts  commands.ts  usePlayer.ts（useSoundscape 保留为兼容层，逐步迁移）
  lib/motion.ts                动效档位
  lib/trackProfile.ts          加载、类型、解析
  lib/kana.ts                  假名 → 罗马音、音拍切分（运行时）
  components/resonance/
    NowPlaying.tsx  PanelSwitch.tsx  CrateList.tsx  ProgressBar.tsx  LinerNotes.tsx
  dev/uiProbe.ts               逐帧瞬移探针（仅开发环境挂到 window.__uiProbe）
src/types/music.ts             + TrackProfile、LyricLine.kana
```

## B2. 分阶段任务

### P0 交互稳定（1.5 天）——已完成 2026-10-06

- [x] `uiProbe.ts`：把这次用的逐帧检测固化下来，`__uiProbe.run('选碟→歌词')` 输出瞬移与错位报告。
- [x] 拆状态：`player/store.ts` + `usePlayer(selector)`；进度条、时间、唱臂改由 ticker 写 DOM；
      Gallery 改为直接 import 命令，Miku 只选 `track.id / isPlaying`。
- [x] `switchTrack` 先更新界面状态，用户主动切歌的淡出 180ms；自动续播保持原节奏。
- [x] 右栏重排：`PanelSwitch` 固定在顶部一行；`NowPlaying` 固定高度、叠放交叉淡化；面板区 `flex-1`，
      两个面板在同一个盒子里绝对定位切换。
- [x] 删掉 `track-title / track-excerpt / stage-meter` 三处 `layoutId`；LyricField 内的标题改用自己的淡入。
- [x] 曲号格放在播标识（桌面和手机共用），删掉行尾的「On Deck」和挤占文字的律动条。
- [x] `motion.ts` 四档；`--accent` 用 `@property` 注册，只让它一个变量做情绪色过渡。
- **验收**（`uiProbe` 跑 8 个操作：歌词↔选碟、切分类、点选曲目、上一首/下一首、播放/暂停、手机三段切换）：
  - 没有超过 18px 的单帧瞬移（新曲目进度条归零除外）；
  - 高亮块与其按钮错位的持续时间不超过所在档位的时长；
  - 点击到第一次画面变化 ≤ 1 帧；
  - 播放中页面静置时，React 每秒提交次数为 0（歌词逐行更新除外）。
- **实测结果**（开发模式，1280×800 与 375×812，`__uiProbe`）：
  - 歌词↔选碟：瞬移 263px → 0；高亮块只做约 250ms 的横向滑动。
  - 点选曲目：首帧反馈 ~950ms → ~35ms；瞬移 65px + 40px → 0（桌面与手机）。
  - 歌词页切歌：旧词场被新曲 0 秒拽回顶部（1808px）→ 退场词场冻结，0。
  - 下一首 / 播放暂停 / 切分类 / 手机三段：0 瞬移；暂停图标 2 帧内翻转（原来要等 650ms 淡出）。
  - 播放中静置：开发模式每秒一个 63–91ms 长帧 → 5 秒内 0 个长帧。
  - 额外：右栏铭牌定高后在 1280×800 挤掉了碟箱，改为按屏高分档（≥900px 用最大字号；≤860px 隐去装饰声波）。

### P1 歌词底账（0.5 天）——已完成 2026-10-07

- [x] 把 5 首纯音乐写进 `lyrics-config/overrides.json`（`kind: instrumental`）。
- [x] `lyrics-gate.mjs` 加单测，用左右盲、逃亡、八月、某、月明かり 做夹具（只复刻问题的形状，不放真实歌词）。
- [x] `npm run lyric:gate` 输出全曲库报告：每首过了哪几道闸、卡在哪里（`--track` 看行号，`--only <闸>` 筛选）。
- [x] 洁净闸追加：「曲名 - 艺人」标题行；**非 JIS X 0208 字形**（中文用户转写混入的简体：「见てる」「颜が」）。
- [x] `post-lyrics` 生成时现在就强制版本闸与洁净闸：署名行解析进 `meta.json` 的 `credits` 后从正文去掉；
      新版本过不了闸时**保留 manifest 里的旧版本**（`--force` 也不会把歌词删掉）。译文与读音闸只打印「待补」。
- **实测**：纯音乐 19、人声 91；版本闸拦下 左右盲 / 逃亡 / 10月無口な君を忘れる / 歌に形はないけれど / One Way
  （后四首多半是真尾奏，等你在工坊里听过后声明 `outroMs`）；译文闸比方案估计的更严：65 首至少缺 1 行。

### P2 网易云主源（1 天）——已完成 2026-10-07

- [x] `sources/netease.mjs`：多候选回退；检索归一化（版本后缀、`feat.` 拆分、罗马数字半/全角、
      **简体写法的日文汉字折叠**：白の季节 = 白の季節）；Miku 合集版只署「初音ミク」也认。
- [x] 成对歌词 `lrc + tlyric + romalrc`；歌词头署名 → `credits`；`transUser` → 译者署名「网易云 @昵称」；
      详情取 `tns / album / no / publishTime`（「电影《…》主题曲」这类 tns 识别为出处而不是译名）；百科取 `tieIn` 与 BPM。
- [x] 原始响应缓存到 `lyrics-src/<id>/ncm/*.json`；检索词变了自动重搜。
- [x] `npm run music:netease`：写 `music-data/tracks/<id>.json` 的 `ncmId` 与 `sources.netease`。
- **实测**：110/110 找到；91 首人声**全部**有同步歌词（方案时 83 首）。原因：心懐サミット 的音频标签是错字
  （正确是「心**壊**サミット」，已在 overrides 里 `searchTitle`），白の季節 是简体写法，あなたの歌姫 / そばかす 只署初音ミク。
  署名 83 首有、8 首标 `creditsMissing`；换源提案 33 首。

### P3 曲目工坊（2 天）——已完成 2026-10-07

- [x] Vite 插件 `scripts/music-studio/plugin.mjs`（`apply: 'serve'`），页面 `/__studio`，前端在 `src/dev/studio/`
      （被 tsc 检查、但没有任何入口引用它）。中间件只接受回环地址；写请求要求同源 Origin + JSON。
- [x] 曲目列表：五道闸色块 + 七项资料完整度，按「缺什么」筛选，按专辑分组。
- [x] **歌词**页签：五道闸详情；当前版本 vs 网易云成对版本并排（含罗马音）、比对建议；逐行补译文；
      尾奏豁免（保存即重建）；读音冲突逐个选（罗马音 / 词典 / 自填，存档案 `lyrics.readings`）；
      「听完了，标为已校」走 `lyric:translate --import-reviewed` 这道原有闸门。
- [x] 打点（A4.3）：空格记点、`[` `]` ±50ms、⌫ 撤回、回车退回重听；吸附 ±150ms 起音峰；重对时间时原文没变的行带上译文。
- [x] **资料**页签：事实字段带出处、可覆写；介绍输入框旁并排专辑叙事、网页参考、网易云推荐标签；
      网页导入（VocaDB 原文/罗马音/署名 · Wikipedia ja/zh/en · MusicBrainz ISRC · 任意网址 · 粘贴），框选后存为 歌词 / 署名 / 参考。
- [x] **标注**页签：专辑 valence / feel；逐曲覆盖；副歌时间轴（歌词重复块建议 + 手工起止）；他的话三件套；关联曲。
- [x] 顶部「本次改动」列出这次会话写过的文件。
- **验收**：`npm run build` 后 `grep -r __studio dist` 为空 ✓。5 首缺歌词：White Letter、愛言葉II 已换上网易云版本并过前四道闸；
  **心壊サミット、melody... 的网易云原文是简体转写，已退回「没有歌词」**（被新加的字形检查拦下，文件留在
  `lyrics-src/<id>/rejected-netease/`），需要你用 VocaDB 原文在工坊里打点；One Way 等你听完声明尾奏。

### P4 读音层（1 天）——已完成 2026-10-07

- [x] `scripts/lib/kana.mjs`：你定的读法 > 行内注音「空（そら）」> 网易云罗马音（按音节转假名，回溯对齐，
      按「、」分句消歧、词典读音长度做提示）> kuromoji（devDependency，只在构建期）；罗马音与词典不一致的写进
      `lyrics-src/<id>/kana.json` 的 conflicts，工坊里逐个确认。罗马音按行文本借给 LRCLIB 版本的同一句。
- [x] 发布的歌词 JSON 写入 `kana`；`beatsOf` 让汉字拍按读音的音拍数分时值；`lipSync` 在汉字拍内逐音拍取元音
      （ん 半闭、っ 闭口）。
- [x] 歌词场「注音」开关（与 日 / 日中 / 中 并列，记在 localStorage）。
- **实测**：能取到元音的比例 72.4%（按字符）→ **98.99%（按音拍）**；读音闸 80/88 通过：没过的 8 首里 4 首是卡在版本闸、没重建的旧版本，另 4 首各有一两行罗马音和词典都没给出读音。
  冲突 254 处里大多是罗马音对、词典错（後 あと、二人 ふたり、躊躇 ためら），也有当て字（三節 さんふし、六畳間 ろくたたみま）。
  单测覆盖拗音、促音、长音、英文混排、当て字。

### P5 曲目卡与 Miku 接口（1 天）——已完成 2026-10-07

- [x] `build-profiles.mjs`（`npm run music:build`，挂 `prebuild`）：校验、合并（自动层读 Miku 的 `trackFeatures.generated.json`）、
      出处；输出无时间戳，内容不变文件不变。`notePrivate` 的曲目**不写** note。
- [x] `trackProfile.ts` 按需加载（独立 chunk，gzip 7.4KB）；`LinerNotes.tsx`：桌面在艺人行末「内页 ›」，
      手机唱片页上滑或点同一入口，底部抽屉可下拉关闭；点关联曲直接播放，卡片原位换内容。选碟台改用档案里的专辑名与年份分组。
- [x] A7：`getTrackProfile(id)`、`useTrackProfile`、`trackFacts(id, prevTrackId)`（titleAlt / album / year / composer /
      tieIn / introFirst / noteForVisitor / relationToPrev）。
- [x] 顺手修了一处泄露：Miku 的 `trackMoodData.ts` 原先 glob 原始档案，整包进公开 chunk（含网易云贡献者昵称，
      以后还会含 notePrivate 原话）；改读生成文件，按出处拆回人标层与专辑层，`trackMood.ts` 不动。
- **验收**：访客看不到 notePrivate（构建期就不写）✓；档案 chunk 只在进入音乐页或 Miku 首次需要时加载 ✓；
  `uiProbe` 测曲目卡展开/收起：首帧反馈 40–44ms，**0 瞬移** ✓。

### 补充：资料草稿（2026-10-07）

站主反馈「标注工作量太大，要校准而不是填写」。于是为全部 110 首写了草稿，放在 `sources.draft`（intro / valence / feel / basis / confidence / refs），
13 张专辑的心境草稿放在 `music-data/albums/<slug>.json` 的 `moodDraft`。
- 来源：Wikipedia ja/zh/en、VocaDB（标签与备注）、网易云（出处、推荐标签只作参考）、歌词原文与译文、专辑文件里站主原有的文学注记。
  萌娘百科拒绝自动访问，未使用。介绍全部用自己的话写，不摘抄。
- **草稿不进公开档案**：`mergeProfile` 只认顶层（你写的）字段。工坊里草稿以虚线预填，点保存即采纳；
  也可「采纳整张专辑的草稿」（只填你还没写的字段，已写的永远不动）。曲目列表「待校草稿」筛选。
- `confidence: low` 的多是纯音乐（只能凭标题与位置），值得优先过目。

### 补充：草稿生效（2026-10-17）

站主反馈「人工标注太多了」，拍板**搜来的标注直接用，工坊里只校不填**。改动：
- `profile-merge.mjs` 加草稿层，合并顺序变成 **人标 > 草稿 > 导入 > 自动 > 专辑默认**，出处记 `draft`。
  草稿里的 intro、效价（含词 / 曲分量）、情绪向量、弧线、意象都参与；人标永远压住草稿。开关是同文件的 `DRAFT_LAYER`，
  改成 `false` 就回到「草稿不进公开档案」。草稿内容在构建时过与人标同一道校验（intro ≤ 120 字、情绪规矩）。
- 前端跟着认这一层：Miku 的 `trackMoodData.ts` 多拆一层草稿、`trackMood.ts` 的解析链与复合情绪认 `draft`，
  `brain/facts.ts` 与 `useMikuBrain.ts` 把草稿算作「写出来的」情绪；曲目卡署名把草稿写作「网络资料整理」，不署站主。
- 工坊：「缺心境」把草稿算作已有；「待校草稿」筛选就是校准队列；⌘⏎「下一首没标的」仍按你亲手标没标（feelsMine）。
- 补齐：其余 92 首草稿由单个 feel 升级为多维向量（依据是歌词译文、专辑注记、原有出处，器乐与拿不准的再上网补搜，
  basis 里写明理由并保留原依据），8 首词曲反差的拆了 lyricValence / soundValence；25 首缺署名的器乐与早期 Miku 曲，
  按 Wikipedia / VocaDB 等写进 `sources.web.credits`（One Way、intro ~memories~ 查不到可靠出处，留空）。
- 结果：110 首介绍、心境齐全（109 首来自草稿，1 首是你写的），署名 108 首。草稿层的单测在 `scripts/lib/profile-merge.test.mjs`。

## B3. 与 Miku 方案的衔接

```
音乐 P0（交互稳定）─────────────── 独立，可以先做
音乐 P1 ─▶ P2 ─▶ P3（工坊）─┬─▶ P4（读音）─▶ Miku lipSync
                           └─▶ P5（档案构建）─▶ Miku P4 / P5（情感模型、台词引擎）
Miku P3（analyze-tracks：arousal、bpm、sections、季语）──▶ 作为 music:build 的输入
```

- Miku 文档里「`mood` 子对象，位置跟随音乐页方案」：位置定为 `music-data/tracks/<id>.json` 的 `mood` 字段；
  自动特征写到 generated 文件，由 `music:build` 合并，与 `trackMood.ts` 的优先级一致。
- Miku P3 需要的「按专辑标 valence 和 feel」改在工坊的「标注」页签里完成，不手改 JSON。

## B4. 风险与对策

| 风险 | 对策 |
|---|---|
| 网易云接口改版或限流 | 只在本机导入时调用；原始响应缓存，重建不联网；保留 `neteaseId` 手动指定；LRCLIB 和网页导入兜底 |
| 网易云版本不对（TV 版、live、翻唱） | 时长 ±5s 硬门槛 + 版本闸；不通过就不进候选 |
| kuromoji 读错歌词里的特殊读法 | 网易云罗马音优先；冲突的行交给你在工坊确认 |
| 工坊代码混进线上 | 插件 `apply: 'serve'`；构建后检查产物；中间件只监听 localhost |
| 网页导入的版权与可靠性 | 只抓你点的那一页，只存框选部分并记录出处；歌词正文继续只发布到 R2；参考资料不直接入档案 |
| PLAYLIST 与档案 id 漂移 | `music:build` 校验两边 id 一一对应，不一致就让构建失败 |
| 拆状态时漏掉订阅者 | `useSoundscape` 保留为兼容层，迁完一个删一处；P0 验收里包含 Miku 和 Gallery 的回归 |

---

## 附录：网易云实测记录（2026-10-05，本机）

- 公开歌单 `v6/playlist/detail` 匿名可读；播放地址 20 分钟过期；fee 0 免费、8 免费标准音质、1 仅 VIP。
- 本机出口 IP 在海外时，连 fee=0 的歌也拿不到播放地址（地区限制）；音频 CDN 返回
  `Access-Control-Allow-Origin: *`，但给的是 http 链接。
- 歌词接口匿名可取 `lrc / tlyric / romalrc`，逐字 `yrc` 匿名取不到。
- 歌词头带 `作词 / 作曲 / 编曲` 署名；返回 `lyricUser / transUser`（贡献者昵称）。
- 「音乐百科」接口给曲风、推荐标签、影视出处、相似歌曲；BPM、语种为空；专辑简介多为空。
- 不做：伪造 IP 绕过地区限制；用站主的 VIP cookie 给访客播放整曲。
