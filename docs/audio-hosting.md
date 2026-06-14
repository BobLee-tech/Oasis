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

1. 把源文件放进 `public/audio/<专辑>/`，在 `useSoundscape.ts` 的 `PLAYLIST` 登记
   （`url` 写 `.flac`/`.mp3` 源路径即可）。
2. 重新运行 `bash scripts/transcode-audio.sh`（已存在的会自动跳过，仅转新文件）。
3. 把新生成的 `.m4a` 上传到 R2 同名路径。
