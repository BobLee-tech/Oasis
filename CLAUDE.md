# Oasis — 个人数字花园(博客)

React 19 + Vite 8 + TypeScript + Tailwind CSS 4 + Framer Motion 单页应用。无 react-router、无状态库。后端 Supabase(数据 + Auth),音频托管在 Cloudflare R2,部署 Vercel。UI 文案/注释多为中文,美学关键词:初音绿 `#39C5BB`、樱粉 `#FFB7C5`、禅意/水波涟漪。

## 命令
- 开发:`npm run dev`(preview 用 `.claude/launch.json` 的 `oasis-dev`,端口 5180)
- 构建:`npm run build`(tsc -b + vite build);Lint:`npm run lint`

## 架构(src/, 共约 5700 行)
- [App.tsx](src/App.tsx) — 根组件:视图切换(AnimatePresence 交叉溶解 + RippleBloom 涟漪转场)、日夜主题、终端暗门(按 `` ` `` 或 2.5s 内连点右上角时钟 5 次唤起登录终端)、深夜低语、点击涟漪、访客模拟开关。
- 视图(AppView):`welcome`(OasisGarden 入场页) / `garden`(OasisGallery 博客) / `soundscape`(OasisResonance 音乐播放器) / `orchard`(OasisOrchard 知识星图) / `lights`(OasisLights 友链灯笼) / `atelier`(OasisAtelier 工坊:简历三件作品的册页,数据在 `src/data/projects.ts`,规矩见 `atelier/atelier.css` 文件头)。底部 OasisDock 切换。
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
- [OasisOrchard.tsx](src/components/OasisOrchard.tsx) — 星图「砂与星」:昼为枯山水砂庭、夜为星池,同一套几何只换光。视觉基准 `docs/sandprototype-v5.1.html`,取舍见 `docs/constellation-v5.1-refinement.md`。石/星=文章(大小=篇幅五档,种子=实线浅卵石、常青覆苔/四角芒),庭=分类,合集=枯流れ(砂纹自身沿章序流成的窄溪,不画连接线;夜里是星座连线)+源头灯笼,石桥/鹊桥=双链,砂纹=整座庭一张距离场的等值线。月亮是固定在右上角的 `orchard/Moon.tsx`(悉尼所见、南半球倒置)。本文件只管版面外的 React 部分(页头、庭记目录、星卡、时光拨盘);**星图内不提供长文阅读**,星卡跳 `#/garden/<id>`。已拍板去掉:星等切换、未种下的星、待照料模式、手机版(窄屏只给告示,Dock 隐藏入口)。每次从别的场所切进来都走一遍进场编排(相机俯身落定 → 石逐块落定 → 砂纹耙出 → 注记淡入)。
  - [orchard/sandScene.ts](src/components/orchard/sandScene.ts) — 地图引擎,**全程不进 React**:相机直写 transform,屏幕尺寸恒定的东西放 `scale(1/k)` 子组;定位写 SVG transform 特性、CSS 动画放内层 g(CSS transform 会覆盖特性);注记在屏幕空间择位、canvas 量真实字宽;最近邻拾取。样式在同目录 `sand.css`(`.oasis-sand` 昼 / `.dark .oasis-sand` 夜;color-mix 只能写在 CSS 里)。
  - [lib/sandGarden.ts](src/lib/sandGarden.ts) — 纯数据层:落座「出生时择邻,此后终生不迁」(按 createdAt 依次落座,新分类上黄金角螺线),测试守着前缀不变量(新增文章不移动旧石)与 `MIN_SEP`;关系推导(小径/桥/同话题);砂纹 smooth-min 距离场 + marching squares。

### 其他
- [lib/solarTerms.ts](src/lib/solarTerms.ts) 二十四节气、[lib/timeContext.ts](src/lib/timeContext.ts) 时段判断(深夜=23:00–4:59)、[data/quotes.ts](src/data/quotes.ts) 语录、[data/friends.ts](src/data/friends.ts) 友链。

## Supabase
- 建表脚本:[supabase/garden_posts.sql](supabase/garden_posts.sql)、[supabase/garden_categories.sql](supabase/garden_categories.sql)、[supabase/post_resonances.sql](supabase/post_resonances.sql)。RLS:公开内容所有人可读,写入仅限 `is_gardener()`(站主邮箱白名单);留言表匿名可 insert(服务端限长 + 禁 `[_REPLY_]` 标记防伪造站主回复),改删仅园丁。不建表应用也能跑(纯 localStorage)。

## 音频流程(详见 docs/audio-hosting.md)
加歌用 `npm run song -- <文件|文件夹>`([scripts/post-song.mjs](scripts/post-song.mjs)):归档到 `public/audio/`(不部署) → 转 AAC 256k 到 `dist-audio/`(gitignored) → rclone 传 `oasis-r2:oasis-audio` → curl 校验 `audio.boblee.dev` 可访问 → 打印 PLAYLIST 代码行(`color`/`lyric` **故意留空**手填)。批量重转用 `scripts/transcode-audio.sh`;线上设 `VITE_AUDIO_BASE`。脚本总览见 [scripts/README.md](scripts/README.md)。

## 注意事项
- 移动端性能敏感:噪点层 `hidden md:block`、触屏走轻量涟漪(pointer: coarse)、动画只用 opacity/transform;改动画时保持合成器友好并尊重 `prefers-reduced-motion`。
- README 中的 Miku 图片(`public/image/Girl.jpg` / `Miku.jpg`)是主人心头好,不要动(见 git 历史 "Give my miku back!")。
- 曲库路径与 R2 文件名必须严格一致(含空格/日文);改曲目 url 时同步检查实际文件。
