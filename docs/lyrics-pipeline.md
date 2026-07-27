# 歌词系统：本地优先、发布时固化

Resonance 的歌词不是在访客浏览器里临时搜索，而是在站主本地完成匹配、校验与发布。这样能避免
第三方服务不可用时破坏播放体验，也不会让错误匹配在不知情的情况下直接上线。

## 数据流

1. `scripts/post-lyrics.mjs` 先寻找音频同名 `.lrc` 和
   `lyrics-src/<trackId>/original.lrc`。
2. 使用 `--fetch` 时，缺失项才会向 LRCLIB 查询；候选同时按曲名、时长和艺术家打分，
   低置信结果会留在「暂缺」而不会勉强导入。
3. 中文译词使用同时间轴 LRC：`lyrics-src/<trackId>/translation.zh.lrc`。允许
   ±350ms 偏差，覆盖率低于 70% 会拒绝生成。
4. 生成的 `dist-lyrics/<trackId>.json` 经过行数、时间戳、长度和单调性约束；
   `manifest.json` 只登记真正存在的歌词，前端不会靠 404 猜测可用性。
5. `--publish` 上传 `dist-lyrics` 到 `oasis-audio/lyrics/`，随后逐项请求公开地址确认 200。

源 LRC、译词和发布 JSON 都在 `.gitignore` 中。歌词来源、抓取时间与译词状态会保留在 JSON，
界面会把机器译词显示为「待校」。

## 常用命令

```bash
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
```

线上可单独设置 `VITE_LYRICS_BASE=https://audio.boblee.dev/lyrics`。未设置时会自动使用
`VITE_AUDIO_BASE + /lyrics`；本地未配置对象存储时回退 `/lyrics`，对应脚本生成的
`public/lyrics/` 预览副本。

## 中文译词状态

- `none`：仅原文。
- `machine`：机器初译，界面显示「待校」。
- `reviewed`：人工逐行核对过。

正文始终由 React 作为纯文本渲染；远端 JSON 还会在浏览器端再次校验，拒绝超长、乱序、跨曲目
或包含异常键名的数据。
