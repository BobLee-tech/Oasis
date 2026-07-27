# 🎧 音频托管说明（Cloudflare R2 + AAC）

线上音频不再随网站打包，而是转码成 AAC(.m4a) 后托管在 Cloudflare R2，前端通过
`VITE_AUDIO_BASE` 环境变量拼接完整 URL 流式播放。

- 曲库源数据：`src/hooks/useSoundscape.ts`（`url` 仍登记为 `/audio/...flac|mp3`）
- 地址解析：同文件内 `resolveAudioUrl()`，线上自动换成 `.m4a` 并转义路径
- 转码脚本：`scripts/transcode-audio.sh`

## 1. 转码（已自动完成）

```bash
bash scripts/transcode-audio.sh
```

输出在 `dist-audio/`（已 gitignore），目录结构与 `public/audio/` 一致，全部为 `.m4a`。
AAC 256k VBR，听感无损、全平台可播（含 iOS Safari）。

## 2. 创建 Cloudflare R2 bucket

1. 登录 Cloudflare → R2 → **Create bucket**（名称如 `oasis-audio`）。
2. 进入 bucket → **Settings** → **Public access**：
   - 简单做法：开启 **R2.dev subdomain**，得到一个形如
     `https://pub-xxxxxxxx.r2.dev` 的公开地址。
   - 推荐做法：在 **Custom Domains** 绑定自己的域名（如 `music.your-domain.com`），
     走 Cloudflare CDN，速度与缓存更好。

## 3. 上传 `dist-audio/` 内容到 bucket 根目录

保持目录结构。任选其一：

- **控制台拖拽**：bucket → Objects → Upload → 拖入 `dist-audio` 里的各专辑文件夹。
- **rclone（推荐，命令行批量）**：

  ```bash
  # 一次性配置（选 s3 → Cloudflare R2，填 R2 Access Key / Secret / account endpoint）
  rclone config

  # 把 dist-audio 同步到 bucket 根目录
  rclone copy dist-audio/ r2:oasis-audio/ --progress
  ```

上传后，`<公开地址>/2017.06.28 [Album] 夏草/01 - 夏陰、ピアノを弾く.m4a` 应可直接访问。

## 4. 配置环境变量

- **Vercel**：项目 → Settings → Environment Variables，新增
  `VITE_AUDIO_BASE = https://<你的R2公开地址>`（不带结尾斜杠），重新部署。
- **本地**：在 `.env.local` 取消注释 `VITE_AUDIO_BASE` 即可联调线上音频；
  留空则回退播放本地 `public/audio` 原始 flac。

## 新增 / 修改曲目

用 `npm run song`（`scripts/post-song.mjs`）一步走完归档 → 转码 → 上传 → 校验：

```bash
npm run song -- ~/Downloads/千本桜.flac                    # 单曲，归入 public/audio/Miku/
npm run song -- ~/Downloads/某专辑/ --album "2024.03.09 [Album] 某专辑"
npm run song -- ~/Downloads/千本桜.flac --dry              # 演练，只打印不落盘
```

脚本会：归档源文件到 `public/audio/<专辑>/` → 转 AAC 256k 到 `dist-audio/` → `rclone` 传
`oasis-r2:oasis-audio` → **`curl -I` 校验 `audio.boblee.dev` 上真的取得到**（专治空格/日文
转义不一致导致的静默 404）→ 生成 `PLAYLIST` 代码行并复制到剪贴板。

最后一步是手工的，**故意的**：`color`（情绪色）与 `lyric`（那一句）留空等你填。
曲库里每首歌的这两个字段都是手挑的，Resonance 页面的唱片贴纸、光晕、声波全吃 `color`，
歌词是右栏的主角；用封面平均色和空歌词自动补，只会在一个靠均质手感撑起来的地方留下二等公民。

粘贴时注意：`OasisResonance.tsx` 的 `albumGroups` 按「**相邻**同目录」分组，
新曲必须贴在同专辑那一块里，散着贴会被拆成两个同名分组。脚本会直接告诉你贴到第几行之后。

批量重转整个 `public/audio/` 仍用 `bash scripts/transcode-audio.sh`（已存在的自动跳过）。
