# 歌词系统：本地优先、发布时固化

Resonance 的歌词不是在访客浏览器里临时搜索，而是在站主本地完成匹配、校验与发布。这样能避免
第三方服务不可用时破坏播放体验，也不会让错误匹配在不知情的情况下直接上线。

## 数据流

1. `npm run lyric:identity` 用音频标签生成 `lyrics-config/tracks.identity.json`；
   标题、艺人、专辑、时长、轨号和 ISRC 不再依赖 PLAYLIST 的展示文案。
2. `scripts/post-lyrics.mjs` 先寻找音频同名 `.lrc` 和
   `lyrics-src/<trackId>/original.lrc`。
3. 使用 `--fetch` 时，缺失项才会向 LRCLIB 查询。艺人是硬门槛，曲名、专辑和时长用于
   排序；正文碰撞会把双方隔离，避免导入顺序决定结果。
4. 原文仍然缺失时，`--netease` 会向网易云搜索并同时取回原文与官方译文——
   门槛比 LRCLIB 更严（时长 ±5s 硬门槛、标题相似度 ≥0.86），因为网易搜索里
   翻唱/伴奏/live 同名曲远比 LRCLIB 常见。命中的译文只标记 `machine`（待校），
   不因为传了 `--reviewed` 就变成 `reviewed`——见「中文译词状态」一节。
5. `lyrics-config/overrides.json` 除了纯器乐和检索覆盖，也接受
   `tracks.<id>.neteaseId` 手动指定网易云 song id，跳过自动匹配（同曲异版
   本极多时，人工指定永远比自动搜索可靠）。
6. `lyrics-config/artistAliases` 同时供 LRCLIB 与网易云检索复用。
7. 中文译词使用同时间轴 LRC：`lyrics-src/<trackId>/translation.zh.lrc`。允许
   ±350ms 偏差，覆盖率低于 70% 会拒绝生成。
8. `npm run lyric:translate` 从规范化原文生成严格同行的机器稿，并进行第二轮定点自检；
   默认状态始终是 `machine`。
9. `npm run lyric:netease` 为**已经有原文**的曲目拉一份网易云官方译文，直接
   写进 `lyrics-src/<trackId>/translation.zh.lrc` 并重新发布——不做「和既有译文
   比较、挑一版更好的」这种判断。网易云自己的时间轴和本地原文（LRCLIB/本地 LRC）
   不是同一份转写，逐行未必对齐，所以先用 `scripts/lib/lyrics-transplant.mjs`
   的弱匹配最长公共子序列对齐算法把译文换算到本地时间轴上，再落盘。默认不覆盖
   已经存在的 `translation.zh.lrc`（保护手改过的内容）；`--force` 才会替换。
   发布状态永远是 `machine`（待校），不会因为这一步变成 `reviewed`。
   （最早做过一版「两版译文对照、机器判定分歧再挑」的方案，后来发现完全没必要：
   反正校对时要把整首歌听一遍读一遍，不需要算法替你决定该看哪一行——直接拿一个
   来源当默认值、边听边改就够了，链路也更短。）
10. `npm run lyric:review` 生成本地逐行试听校对页：日文原文 + 可编辑译文，默认值
    取当前已发布内容。改完下载 JSON，只有导回并显式 `--reviewed` 后，状态才会升级。
11. 生成的 `dist-lyrics/<trackId>.json` 经过行数、时间戳、长度和单调性约束；
    `manifest.json` 只登记真正存在的歌词，前端不会靠 404 猜测可用性。
12. `--publish` 上传 `dist-lyrics` 到 `oasis-audio/lyrics/`，随后逐项请求公开地址确认 200。

源 LRC、译词和发布 JSON 都在 `.gitignore` 中。歌词来源、抓取时间与译词状态会保留在 JSON，
界面会把机器译词显示为「待校」；`translator` 字段存在时（网易云自动导入，或校对页填写的
署名）会一并展示为「译：xxx」。

## 常用命令

```bash
# 重建音频身份清单
npm run lyric:identity

# 本地 LRC
npm run lyric -- --track m_06 --lrc ~/Downloads/メルト.lrc

# 加入人工校对后的中文时间轴
npm run lyric -- --track m_06 \
  --lrc ~/Downloads/メルト.lrc \
  --translation ~/Downloads/メルト.zh.lrc

# Miku 分区缺失项网络匹配（LRCLIB 优先，找不到再试网易云）；先本地预览
npm run lyric -- --category Miku --fetch --netease

# 重新向来源核验并刷新已经归档的网络歌词
npm run lyric -- --category Miku --fetch --netease --refresh --force

# 确认后上传
npm run lyric -- --category Miku --fetch --netease --publish

# 整张专辑机器初译（需配置 API key 与显式模型名）
LYRICS_TRANSLATION_MODEL=<model> \
npm run lyric:translate -- --album エルマ

# 已有原文但还没译文的曲目，导入网易云译文并直接发布为 machine（待校）
npm run lyric:netease -- --category Miku

# 用网易云译文替换某批从未被真正审校过的旧译文
npm run lyric:netease -- --category Yorushika --force

# 生成本地逐行试听校对页（日文 / 可编辑译文）
npm run lyric:review -- --track m_06

# 导回校对页下载的 JSON（含译者署名），并升级为 reviewed
npm run lyric:translate -- --track m_06 \
  --import-reviewed ~/Downloads/m_06.reviewed.json

# 明确声明为同词版本时，安全复用已审校译文并重建目标时间轴
npm run lyric:translate -- --track y_18_03 \
  --reuse-reviewed-from y_20_04
```

`--reuse-reviewed-from` 只接受单曲：两版必须在身份配置中声明 `sameLyricsAs`，
行数相同，且日文文本完全相同或仅存在一个字符的增删。原文差异会记录进目标
`translation.reviewed.json`，不会使用模糊匹配强行复用。

线上可单独设置 `VITE_LYRICS_BASE=https://audio.boblee.dev/lyrics`。未设置时会自动使用
`VITE_AUDIO_BASE + /lyrics`；本地未配置对象存储时回退 `/lyrics`，对应脚本生成的
`public/lyrics/` 预览副本。

## 中文译词状态

- `none`：仅原文。
- `machine`：待校——机器初译，或网易云官方译文自动导入（`--netease` 命中时）。
  两者来源不同，但对「站主还没有逐行看过」这件事是等价的，界面统一显示「待校」。
- `reviewed`：人工逐行核对过。

导入译文默认是 `machine`；网易云译文**无论传不传 `--reviewed` 都只会是
`machine`**——`post-lyrics.mjs --netease` 和 `pull-netease-translation.mjs` 都
只会写 `--machine`，因为网易云的译文再准确也不是站主本人核对过的。真正升级为
`reviewed` 只有一条路：在 `lyric:review` 的校对页里逐行读一遍、改完，下载审校
JSON，再用 `lyric:translate --import-reviewed` 导回。

`translator` 字段（可选）记录译文署名，网易云自动导入时固定为「网易云」；人工审校时
取校对页里填写的名字，随审校 JSON 一起写入 `translation.reviewed.json` 并透传到发布的
`dist-lyrics/<id>.json`，前端显示为「译：xxx」。

## 前端状态

- 原文歌词：日 / 日中 / 中三态切换；中文模式只做行级着色，不伪造中文逐字时间。
- 纯器乐：manifest 使用 `{ "kind": "instrumental" }`，显示独立水纹态。
- 暂缺：确实有词但尚无可靠原文，保留策展摘句。
- 来源角标：`本地 LRC` / `LRCLIB` / `网易云音乐`，`translator` 存在时附「· 译：xxx」，
  `machine` 状态附「· 待校」。

正文始终由 React 作为纯文本渲染；远端 JSON 还会在浏览器端再次校验，拒绝超长、乱序、跨曲目
或包含异常键名的数据。
