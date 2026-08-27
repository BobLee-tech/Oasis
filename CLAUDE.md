# Oasis — 个人数字花园(博客)

React 19 + Vite 8 + TypeScript + Tailwind CSS 4 + Framer Motion 单页应用。无 react-router、无状态库。后端 Supabase(数据 + Auth),音频托管在 Cloudflare R2,部署 Vercel。UI 文案/注释多为中文,美学关键词:初音绿 `#39C5BB`、樱粉 `#FFB7C5`、禅意/水波涟漪。

## 命令
- 开发:`npm run dev`(preview 用 `.claude/launch.json` 的 `oasis-dev`,端口 5180)
- 构建:`npm run build`(tsc -b + vite build);Lint:`npm run lint`

## 架构(src/, 共约 5700 行)
- [App.tsx](src/App.tsx) — 根组件:视图切换(AnimatePresence 交叉溶解 + RippleBloom 涟漪转场)、日夜主题、终端暗门(按 `` ` `` 或 2.5s 内连点右上角时钟 5 次唤起登录终端)、深夜低语、点击涟漪、访客模拟开关。
- 视图(AppView):`welcome`(OasisGarden 入场页) / `garden`(OasisGallery 博客) / `soundscape`(OasisResonance 音乐播放器) / `orchard`(OasisOrchard 知识星图) / `lights`(OasisLights 友链灯笼)。底部 OasisDock 切换。
- [lib/route.ts](src/lib/route.ts) — 极轻 hash 路由:`#/garden|resonance|constellation|lanterns`,garden 支持 `#/garden/<postId>`。注意 URL 段与内部 view 名不同(orchard↔constellation, soundscape↔resonance)。
- [lib/supabase.ts](src/lib/supabase.ts) — 客户端,需 `.env.local` 里 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`。

### Hooks(数据层)
- [useGarden.ts](src/hooks/useGarden.ts) — 博客文章。Supabase `garden_posts` 表为权威源 + localStorage(`oasis_garden_posts`)缓存兜底;实时订阅表变更;云端失败静默回落本地。API:`{ posts, plantSeed, updateSeed, uprootSeed }`(均支持可选 `series` 参数)。BlogPost 含 `series?`(合集名);合集内序号不存库,按 createdAt 在合集内推导(OasisGallery 的 `chapterOf`)。
- [useCategories.tsx](src/hooks/useCategories.tsx) — 自定义分类,`garden_categories` 表,同样 localStorage 兜底。
- [useAuth.ts](src/hooks/useAuth.ts) — Supabase Auth;`isAdmin` = 有 session。getSession 有 3s 超时兜底(受限浏览器 navigator.locks 会卡死)。
- [useSoundscape.ts](src/hooks/useSoundscape.ts)(495 行) — 音乐核心:内嵌 82 首曲库 `PLAYLIST`(Yorushika/Atarayo/Miku,含歌词与情绪色);全局单例 `<audio>`;`resolveAudioUrl()` 在设置了 `VITE_AUDIO_BASE` 时把 `/audio/...flac` 改写为 R2 上的 `.m4a`,否则回退 `public/audio/` 原始文件(本地开发)。
- [useAutoTheme.ts](src/hooks/useAutoTheme.ts) — auto/light/dark 三态,auto 按时间;dark 通过 `document.documentElement.classList` 切换。
- useDiary / usePostResonance — 日记回声与文章共鸣(点赞类)。

### 大组件
- [OasisGallery.tsx](src/components/OasisGallery.tsx)(~1160 行) — 博客主界面:列表(分类/合集/标签筛选 + 按月归档)、全屏写作编辑器(admin;createPortal 到 body 的 z-[210] 覆盖层,元信息收在底部抽屉,⌘⏎ 发布)、阅读舱(含合集目录导航)。Markdown.tsx: react-markdown + gfm + highlight + rehype-raw。
- [OasisResonance.tsx](src/components/OasisResonance.tsx)(684 行) — 播放器 UI。
- [OasisOrchard.tsx](src/components/OasisOrchard.tsx)(~1400 行) — 知识年轮盘,与博客同源 useGarden。定位是「花园的夜间俯瞰」:三层动线 L0 年轮概览(节气 + 写作密度 + 分类带星群) → L1 星卡 → L2 跳博客阅读舱 `#/garden/<id>`,**星图内不提供长文阅读**。五条硬规矩写在文件头,改之前必读:字号/墨度/线宽只有固定档位(令牌在 index.css 的 `.oasis-sky`);昼夜是同一张天只换光;相机与星卡跟随全程不进 React(`viewRef` + 直接写 transform);命中走最近邻拾取;年轮盘是唯一底图,关系线是默认关闭的可选查询图层。
  - ⚠️ 缩放补偿令牌(`--sky-name` 等)必须声明在 `.oasis-sky-canvas`(即写 `--sky-scale` 的那个元素)上——自定义属性的 `var()` 在**声明它的元素**上就完成替换,放到 `.oasis-sky` 会被固化成 `calc(13px / 1)`。
  - [lib/constellation.ts](src/lib/constellation.ts) — 纯数据层。**角度 = 日期**(与外圈 24 节气严格对应,不许为构图去动)、**半径 = 分类带**、拥挤处按写作先后贪心落座(`layoutStars`)。由此得两条有测试守着的不变量:新增文章不移动任何旧星;任意两星间距 ≥ `MIN_SEP`,命中区因而永不相交。年轮盘几何统一复用 `densityByTerm` / `annularSector` / `arcPath` / `relaxColumn`。

### 其他
- [lib/solarTerms.ts](src/lib/solarTerms.ts) 二十四节气、[lib/timeContext.ts](src/lib/timeContext.ts) 时段判断(深夜=23:00–4:59)、[data/quotes.ts](src/data/quotes.ts) 语录、[data/friends.ts](src/data/friends.ts) 友链。

## Supabase
- 建表脚本:[supabase/garden_posts.sql](supabase/garden_posts.sql)、[supabase/garden_categories.sql](supabase/garden_categories.sql)、[supabase/garden_artworks.sql](supabase/garden_artworks.sql)、[supabase/post_resonances.sql](supabase/post_resonances.sql)。RLS:公开内容所有人可读,写入仅限 `is_gardener()`(站主邮箱白名单);留言表匿名可 insert(服务端限长 + 禁 `[_REPLY_]` 标记防伪造站主回复),改删仅园丁。不建表应用也能跑(纯 localStorage)。

## 音频流程(详见 docs/audio-hosting.md)
加歌用 `npm run song -- <文件|文件夹>`([scripts/post-song.mjs](scripts/post-song.mjs)):归档到 `public/audio/`(不部署) → 转 AAC 256k 到 `dist-audio/`(gitignored) → rclone 传 `oasis-r2:oasis-audio` → curl 校验 `audio.boblee.dev` 可访问 → 打印 PLAYLIST 代码行(`color`/`lyric` **故意留空**手填)。批量重转用 `scripts/transcode-audio.sh`;线上设 `VITE_AUDIO_BASE`。脚本总览见 [scripts/README.md](scripts/README.md)。

## 注意事项
- 移动端性能敏感:噪点层 `hidden md:block`、触屏走轻量涟漪(pointer: coarse)、动画只用 opacity/transform;改动画时保持合成器友好并尊重 `prefers-reduced-motion`。
- README 中的 Miku 图片(`public/image/Girl.jpg` / `Miku.jpg`)是主人心头好,不要动(见 git 历史 "Give my miku back!")。
- 曲库路径与 R2 文件名必须严格一致(含空格/日文);改曲目 url 时同步检查实际文件。
