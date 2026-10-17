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
- [useSoundscape.ts](src/hooks/useSoundscape.ts) — 音乐核心:内嵌 110 首曲库 `PLAYLIST`(Yorushika/Atarayo/Miku,含情绪色);全局单例 `<audio>`;`resolveAudioUrl()` 在设置了 `VITE_AUDIO_BASE` 时把 `/audio/...flac` 改写为 R2 上的 `.m4a`,否则回退 `public/audio/` 原始文件(本地开发)。**没有 `useSoundscape()` hook 了**:命令(`switchTrack`/`togglePlay`/`seek`…)是直接 import 的模块函数;状态用 `usePlayer(selector)` 按需订阅(selector 只能返回原始值或已有对象);进度不进 React,用 `getPlaybackTime()` + ticker 写 DOM。`isPlaying` 是播放意图,命令当帧改。音乐页的交互四规矩见 [OasisResonance.tsx](src/components/OasisResonance.tsx) 文件头与 [docs/music-design.md](docs/music-design.md);开发环境下 `window.__uiProbe.run(fn)` 可逐帧检查瞬移/错位。
- [useAutoTheme.ts](src/hooks/useAutoTheme.ts) — auto/light/dark 三态,auto 按时间;dark 通过 `document.documentElement.classList` 切换。
- useDiary / usePostResonance — 日记回声与文章共鸣(点赞类)。

### 大组件
- [OasisGallery.tsx](src/components/OasisGallery.tsx)(~1160 行) — 博客主界面:列表(分类/合集/标签筛选 + 按月归档)、全屏写作编辑器(admin;createPortal 到 body 的 z-[210] 覆盖层,元信息收在底部抽屉,⌘⏎ 发布)、阅读舱(含合集目录导航)。Markdown.tsx: react-markdown + gfm + highlight + rehype-raw。
- [OasisResonance.tsx](src/components/OasisResonance.tsx)(~900 行) — 播放器 UI。整体版式「一个房间，三种距离」见 `docs/music-stage-redesign-demo.html`:进场是延续(唱盘/唱臂按播放器快照起步,不每次“开机”;前往音乐页转场 200+280ms、涟漪单圈染曲目色);右栏一条左对齐轴(铭牌 → `LinerSlip` 内页条 → 选碟台表头即分类);音量 `VolumePopover` 悬停弹出,氛围开关在切换条左边;进度条是声波(`PlaybackBar` 读 `src/data/trackPeaks.generated.json`,独立 chunk,编码在 `scripts/lib/peaks-core.mjs`,`npm run song:analyze -- --peaks` 补;加新歌后 `song:analyze` 默认也会补),没峰值时退回细线;贴纸与内页条联动高亮,首访提示一次(`oasis_notes_hint_seen`),`I` 键开合内页。**水的着色保留原版,不要改**。三处水的语汇(演示与取舍见 `docs/music-ripple-notes-demo.html`、`docs/music-lyrics-stage-demo.html`):
  - 内页 `resonance/RippleReveal.tsx` + `LinerNotes.tsx`:贴纸(盘面声槽仍是播放)或歌名点开,波前由 ticker 推进、直写 clip-path,WebGL2 画波的明暗;几何与节奏是纯函数 `lib/ripple.ts`(有测试)。
  - 歌词近景:唱片 transform 退到舞台左缘,纵向量歌词水线与舞台边界定位(圆心对水线,不越界、给走带留 76px 空带),进度是半圈 `ProgressArc`;大走带隐去,换成左下 `CloseUpTransport` 一行,`useIdle` 闲置 2.5s 隐去、暂停常显,切换条随之退到 38%;`LyricField` 焦点 0.5 是水线,当前句底边贴线,线下 `.lyric-water` 是将唱(桌面 backdrop 模糊),间奏由水线起伏+倒计时承担;阅读设置收进 `LyricPanel` 的 Aa 弹层。
  - 纯器乐 `resonance/InstrumentalPond.tsx`:`lib/waterSim.ts` 高度场(有测试)+ 着色器,鼓点落滴、高频细雨、`mood.sections` 段落雨密,无频谱按 `mood.bpm` 兜底;氛围关 / 无 WebGL2 回退静止 CSS 水纹。WebGL 小封装在 `lib/gl.ts`。
- [OasisOrchard.tsx](src/components/OasisOrchard.tsx) — 星图「砂与星」:昼为枯山水砂庭、夜为星池,同一套几何只换光。视觉基准 `docs/sandprototype-v5.1.html`,取舍见 `docs/constellation-v5.1-refinement.md`。石/星=文章(大小=篇幅五档,种子=实线浅卵石、常青覆苔/四角芒),庭=分类,合集=枯流れ(砂纹自身沿章序流成的窄溪,不画连接线;夜里是星座连线)+源头灯笼,石桥/鹊桥=双链,砂纹=整座庭一张距离场的等值线。月亮是固定在右上角的 `orchard/Moon.tsx`(悉尼所见、南半球倒置)。本文件只管版面外的 React 部分(页头、庭记目录、星卡、时光拨盘);**星图内不提供长文阅读**,星卡跳 `#/garden/<id>`。已拍板去掉:星等切换、未种下的星、待照料模式、手机版(窄屏只给告示,Dock 隐藏入口)。每次从别的场所切进来都走一遍进场编排(相机俯身落定 → 石逐块落定 → 砂纹耙出 → 注记淡入)。
  - [orchard/sandScene.ts](src/components/orchard/sandScene.ts) — 地图引擎,**全程不进 React**:相机直写 transform,屏幕尺寸恒定的东西放 `scale(1/k)` 子组;定位写 SVG transform 特性、CSS 动画放内层 g(CSS transform 会覆盖特性);注记在屏幕空间择位、canvas 量真实字宽;最近邻拾取。样式在同目录 `sand.css`(`.oasis-sand` 昼 / `.dark .oasis-sand` 夜;color-mix 只能写在 CSS 里)。
  - [lib/sandGarden.ts](src/lib/sandGarden.ts) — 纯数据层:落座「出生时择邻,此后终生不迁」(按 createdAt 依次落座,新分类上黄金角螺线),测试守着前缀不变量(新增文章不移动旧石)与 `MIN_SEP`;关系推导(小径/桥/同话题);砂纹 smooth-min 距离场 + marching squares。

### 其他
- [lib/solarTerms.ts](src/lib/solarTerms.ts) 二十四节气、[lib/timeContext.ts](src/lib/timeContext.ts) 时段判断(深夜=23:00–4:59)、[data/quotes.ts](src/data/quotes.ts) 语录、[data/friends.ts](src/data/friends.ts) 友链。

## Supabase
- 建表脚本:[supabase/garden_posts.sql](supabase/garden_posts.sql)、[supabase/garden_categories.sql](supabase/garden_categories.sql)、[supabase/post_resonances.sql](supabase/post_resonances.sql)、[supabase/track_felt.sql](supabase/track_felt.sql)（曲目 felt，仅园丁可读写）。RLS:公开内容所有人可读,写入仅限 `is_gardener()`(站主邮箱白名单);留言表匿名可 insert(服务端限长 + 禁 `[_REPLY_]` 标记防伪造站主回复),改删仅园丁。不建表应用也能跑(纯 localStorage)。

## 曲目档案与工坊(详见 docs/music-design.md)
- `music-data/tracks/<id>.json`(进 git):顶层是站主写的(intro / note / mood / relations / lyrics.outroMs / lyrics.readings),`sources.*` 是导入层(`npm run music:netease`、工坊网页导入)。专辑叙事与心境默认在 `music-data/albums/<slug>.json`(原 lyrics-config/albums 已迁入,translate-lyrics 改读这里)。
- 曲目情绪是多维的([docs/song-emotion-design.md](docs/song-emotion-design.md)):`mood.feels` 10 维 0–3 强度、词/曲分离效价、段落 arc、意象;推导核心 `scripts/lib/mood-core.mjs` 被构建脚本与前端 `trackMood.ts` 共用,**改维度只改这一处**。`felt`(它让你怎样)不进档案,存 Supabase。arc 认的段落标签(intro/verse/pre/chorus/bridge/outro)与自动意象由 `npm run song:analyze` 从歌词算出,写进 `trackFeatures.generated.json` 的 `segments` / `imagery`(不解码音频也会全体重算)。
- `npm run music:build`(prebuild)合并成 `src/data/trackProfiles.generated.json`,前端经 `src/lib/trackProfile.ts` 按需加载;曲目卡 `resonance/LinerNotes.tsx`。notePrivate 构建期就不写 note。Miku 的 `trackMoodData.ts` 也读这份生成文件,**不要再 glob 原始档案**(会把导入记录与私密 note 打进公开 chunk)。
- 曲目工坊 `/__studio`:只在 `npm run dev` 下存在(`scripts/music-studio/`,前端 `src/dev/studio/`)。改了 `scripts/music-studio/api.mjs` 或它引用的 `scripts/lib/*` 要重启开发服务器(Node 模块缓存)。
- 歌词读音层:`scripts/lib/kana.mjs`(行内注音 > 网易云罗马音 > kuromoji),发布 JSON 的 `LyricLine.kana`;五道闸在 `scripts/lib/lyrics-gate.mjs`,`post-lyrics` 强制版本/洁净闸。

## 音频流程(详见 docs/audio-hosting.md)
加歌用 `npm run song -- <文件|文件夹>`([scripts/post-song.mjs](scripts/post-song.mjs)):归档到 `public/audio/`(不部署) → 转 AAC 256k 到 `dist-audio/`(gitignored) → rclone 传 `oasis-r2:oasis-audio` → curl 校验 `audio.boblee.dev` 可访问 → 打印 PLAYLIST 代码行(`color`/`lyric` **故意留空**手填)。批量重转用 `scripts/transcode-audio.sh`;线上设 `VITE_AUDIO_BASE`。脚本总览见 [scripts/README.md](scripts/README.md)。

## 注意事项
- 移动端性能敏感:噪点层 `hidden md:block`、触屏走轻量涟漪(pointer: coarse)、动画只用 opacity/transform;改动画时保持合成器友好并尊重 `prefers-reduced-motion`。
- README 中的 Miku 图片(`public/image/Girl.jpg` / `Miku.jpg`)是主人心头好,不要动(见 git 历史 "Give my miku back!")。
- 曲库路径与 R2 文件名必须严格一致(含空格/日文);改曲目 url 时同步检查实际文件。
