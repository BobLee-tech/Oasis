# 🛠 scripts/ — 内容管线速查

这些脚本都是**本地跑的搬运工**：把桌面上的一个文件，变成线上能访问的资源 + 一段可粘贴的代码。
它们不改数据库、不改源码，最后一步永远是「打印 / 复制到剪贴板」，由你自己决定要不要贴进去。

| 命令 | 干什么 | 产物落点 |
|---|---|---|
| `npm run img` | 截图 → webp → R2 → Markdown 图片语法 | `r2:oasis-picture` → `img.boblee.dev` |
| `npm run song -- <音频\|文件夹>` | 音频 → 归档 + AAC 转码 → R2 → PLAYLIST 代码行 | `oasis-r2:oasis-audio` → `audio.boblee.dev` |
| `npm run lyric -- --track <id>` | 本地/LRCLIB/网易云同步歌词 → 校验 → 双语合并 → R2 | `oasis-r2:oasis-audio/lyrics` |
| `npm run lyric:identity` | ffprobe 音频标签 → 可审计曲目身份清单 | `lyrics-config/tracks.identity.json` |
| `npm run lyric:translate` | 整首机器初译 → 定点自检 → 同轴中文 LRC | `lyrics-src/<id>/` |
| `npm run lyric:netease -- --track <id>` | 已有原文的曲目导入网易云译文，对齐到本地轴并以 machine 状态直接发布 | `lyrics-src/<id>/translation.zh.lrc` → `dist-lyrics/` |
| `npm run lyric:review` | 生成逐行试听 + 编辑的本地校对页 | `public/__lyrics-review/` |
| `npm run backup` | 导出 Supabase 里的全部文章到本地 | `backups/` |
| `npm run live2d:texture` | Miku 母版贴图降到 1024² WebP | `public/live2d/miku/miku_sample_t04.1024/` |
| `npm run live2d:patch` | 把六段手势动作修成一次性播放 | `public/live2d/miku/motion/` |
| `npm run noise` | 烘焙全站静态可平铺噪点 | `public/textures/noise-128.png` |
| `bash scripts/transcode-audio.sh` | 全量重转 `public/audio/` （`song` 的批量版） | `dist-audio/` |

## 怎么用

统一是 `npm run <别名> -- <参数>`。**`--` 不能省**，否则参数会被 npm 自己吃掉。

```bash
npm run song -- ~/Downloads/千本桜.flac              # 单曲，归入 Miku/
npm run song -- ~/Downloads/某专辑/ --album "2024.03.09 [Album] 某专辑"
npm run song -- ~/Downloads/千本桜.flac --dry        # 演练：只解析、只打印，不落盘不上传
npm run lyric -- --track m_06 --lrc ~/Downloads/メルト.lrc
npm run lyric -- --category Miku --fetch --netease   # 缺失歌词先试 LRCLIB，再试网易云
npm run lyric -- --category Miku --fetch --publish   # 确认后发布并校验
npm run lyric:identity                               # 更新标签身份清单
npm run lyric:netease -- --category Miku             # 已有原文的曲目，导入网易云译文并以 machine 发布
npm run lyric:netease -- --category Yorushika --force # 用网易云译文替换从未真正审校过的旧译文
npm run lyric:review -- --track m_06                # 生成逐行校对页
npm run lyric:translate -- --track y_18_03 \
  --reuse-reviewed-from y_20_04                      # 同词版本复用审校译文
```

嫌 `npm run song --` 长，可以在 `~/.zshrc` 里挂短别名：

```zsh
alias song='node /Users/nai/Developer/Oasis/scripts/post-song.mjs'
```

**忘了用法就看脚本开头**——每个脚本前 20 行都是完整的用法注释：

```bash
head -20 scripts/post-song.mjs
```

## 怎么维护

写新脚本时照抄现有的三件套，别另起炉灶：

- `run(cmd, args)` — 跑子进程，非 0 退出码直接 reject
- `capture(cmd, args)` — 同上但收 stdout（`post-song.mjs` 用它读 ffprobe）
- `copyToClipboard(text)` — `pbcopy`，最后一步的固定动作

约定：

1. **文件名** `post-<名词>.mjs`，`package.json` 里挂一个不超过 4 个字母的别名。
2. **不自动改源码 / 不自动写数据库。** 音频代码行仍要人工确认；歌词则写入 gitignored 的
   `lyrics-src/` 与 `dist-lyrics/`，由版本化 manifest 发现，不把版权文本提交进代码仓库。
3. **上传后必须校验。** `post-song.mjs` 传完会 `curl -I` 一次公开 URL 确认 200；空格与日文的转义不一致是这套流程唯一会静默失败的地方。
4. **歌词网络匹配只在本地导入时发生。** 访客浏览器只请求自己的 R2，避免把第三方服务、
   查询关键词和故障面暴露给线上用户。中文译词放在
   `lyrics-src/<trackId>/translation.zh.lrc`。导入默认标为 `machine`；
   校对完成后用 `--reviewed` 或 `--import-reviewed` 升级。
   网易云译文（`--netease` 或 `lyric:netease`）无论如何都不会自动升级为
   `reviewed`——这条门槛写死在 `post-lyrics.mjs` 里，见 `docs/lyrics-pipeline.md`。
5. **新增脚本记得回来更新上面那张表**，这份 README 是唯一的索引。

## 外部依赖

`ffmpeg` / `ffprobe`（`brew install ffmpeg`）、`rclone`（`brew install rclone`，remote 见 `~/.config/rclone/rclone.conf`）、`sharp`（已在 devDependencies）、`pbcopy` / `sips`（macOS 自带）。
