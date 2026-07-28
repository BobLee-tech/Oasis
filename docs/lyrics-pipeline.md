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
4. `lyrics-config/overrides.json` 只保存无法从标签推导的纯器乐和少量检索覆盖。
5. 中文译词使用同时间轴 LRC：`lyrics-src/<trackId>/translation.zh.lrc`。允许
   ±350ms 偏差，覆盖率低于 70% 会拒绝生成。
6. `npm run lyric:translate` 从规范化原文生成严格同行的机器稿，并进行第二轮定点自检；
   默认状态始终是 `machine`。
7. `npm run lyric:review` 生成本地逐行试听校对页。只有导回审校 JSON 并显式
   `--reviewed` 后，状态才会升级。
8. 生成的 `dist-lyrics/<trackId>.json` 经过行数、时间戳、长度和单调性约束；
   `manifest.json` 只登记真正存在的歌词，前端不会靠 404 猜测可用性。
9. `--publish` 上传 `dist-lyrics` 到 `oasis-audio/lyrics/`，随后逐项请求公开地址确认 200。

源 LRC、译词和发布 JSON 都在 `.gitignore` 中。歌词来源、抓取时间与译词状态会保留在 JSON，
界面会把机器译词显示为「待校」。

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

# Miku 分区缺失项网络匹配；先本地预览
npm run lyric -- --category Miku --fetch

# 重新向来源核验并刷新已经归档的网络歌词
npm run lyric -- --category Miku --fetch --refresh --force

# 确认后上传
npm run lyric -- --category Miku --fetch --publish

# 整张专辑机器初译（需配置 API key 与显式模型名）
LYRICS_TRANSLATION_MODEL=<model> \
npm run lyric:translate -- --album エルマ

# 生成本地校对页
npm run lyric:review -- --track m_06

# 导回校对页下载的 JSON，并升级为 reviewed
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
- `machine`：机器初译，界面显示「待校」。
- `reviewed`：人工逐行核对过。

导入译文默认是 `machine`；只有显式 `--reviewed` 或导入审校文件才可标记为 `reviewed`。

## 前端状态

- 原文歌词：日 / 日中 / 中三态切换；中文模式只做行级着色，不伪造中文逐字时间。
- 纯器乐：manifest 使用 `{ "kind": "instrumental" }`，显示独立水纹态。
- 暂缺：确实有词但尚无可靠原文，保留策展摘句。

正文始终由 React 作为纯文本渲染；远端 JSON 还会在浏览器端再次校验，拒绝超长、乱序、跨曲目
或包含异常键名的数据。
