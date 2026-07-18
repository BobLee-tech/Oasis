# 🎨 绘阁图片托管说明（Cloudflare R2 + WebP）

线上画作原图不随网站打包，而是处理成两档 WebP 后托管在 Cloudflare R2，前端通过
`VITE_ART_BASE` 环境变量拼接完整 URL 加载。数据表结构见 `supabase/garden_artworks.sql`，
数据层见 `src/hooks/useAtelier.ts`。

- 地址解析：`useAtelier.ts` 内 `resolveArtSrc(imagePath, variant)`，`variant` 为 `thumb`（瀑布流卡片）或 `full`（灯箱大图）
- 处理脚本：`scripts/process-artworks.mjs`（依赖 `sharp`，已在 devDependencies）

## 0. 版权前提（先看这个）

pixiv / X 的图片不可热链（referer 防盗链会 403），必须先转存一份再展示；但**转存 ≠ 可以公开**。
默认所有画作 `visibility = private`（仅登录的园丁本人可见），`public` 是白名单式例外——
只对明确允许转载 / 你自己创作 / CC 协议作品放开。展示时务必带上 `sourceUrl` 指回原作品页，
是为了给画师引流，不是替代原地址。

## 1. 收藏原图

把原图（jpg/png/webp，可从 pixiv 收藏用 `gallery-dl` 批量拉取，个人用途）放进
`public/artworks-src/`（不进 git，见 `.gitignore`）。文件名会成为 `imagePath`，
建议直接用 pixiv 的作品 id，如 `104123456_p0.png`。

## 2. 处理

```bash
node scripts/process-artworks.mjs
```

输出在 `dist-artworks/`（已 gitignore）：

- `<basename>_thumb.webp`：长边 640px，瀑布流卡片用
- `<basename>_full.webp`：长边 2048px，灯箱大图用
- `manifest.json`：每张图的 `imagePath` / `width` / `height` / `color`（整图平均色，当氛围光够用）

已存在的输出会自动跳过，只处理新加的原图。

## 3. 创建 Cloudflare R2 bucket

1. 登录 Cloudflare → R2 → **Create bucket**（名称如 `oasis-artworks`）。
2. 进入 bucket → **Settings** → **Public access**：
   - 简单做法：开启 **R2.dev subdomain**，得到形如 `https://pub-xxxxxxxx.r2.dev` 的公开地址。
   - 推荐做法：**Custom Domains** 绑定自己的域名（如 `art.your-domain.com`），走 CDN。

## 4. 上传 `dist-artworks/` 内容到 bucket 根目录

```bash
# 一次性配置（选 s3 → Cloudflare R2，填 R2 Access Key / Secret / account endpoint）
rclone config

# 把 dist-artworks 同步到 bucket 根目录（manifest.json 不必上传，本地留档即可）
rclone copy dist-artworks/ r2:oasis-artworks/ --exclude manifest.json --progress
```

## 5. 配置环境变量

- **Vercel**：项目 → Settings → Environment Variables，新增
  `VITE_ART_BASE = https://<你的R2公开地址>`（不带结尾斜杠），重新部署。
- **本地**：`.env.local` 留空 `VITE_ART_BASE` 即可，回退加载
  `public/artworks-src/<imagePath>_thumb.webp` 等本地文件（需先跑过第 2 步）。

## 6. 在站内登记

管理员登录后，绘阁顶部「+ 装裱」表单里填：

- **图片路径**：`manifest.json` 里对应条目的 `imagePath`
- **原图宽 / 高**、**主色调**：同样从 `manifest.json` 抄
- 其余字段（标题、画师、原作品页、标签、收藏语、可见性）手填

保存后立即写入 Supabase（`garden_artworks` 表）+ 本地缓存，全站实时同步。

## 占位图例外

`public/artworks-demo/` 下的几张渐变 SVG 是纯代码生成的占位图（非真实画作），
不走这套流程——`imagePath` 直接登记完整路径（如 `/artworks-demo/demo-1.svg`），
`resolveArtSrc()` 识别到 `/` 开头会原样返回，不会去拼 R2 地址。
