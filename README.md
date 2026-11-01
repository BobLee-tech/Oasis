###   **Oasis: My Digital Garden** 🍀
![alt](./public/image/Girl.jpg)

你好！欢迎到访我的花园呀！ :D

我是这片花园的主人🌸，  
也是她们的园丁🪏

这些花都是我种的，  
很好看吧，  
我也很喜欢她们! >v<  

## 🌿 关于花园  
Oasis是我的个人博客网站  
她沉淀了音乐，思考和成长，  
她是我种下的花，  


我喜欢她 ❤️  

## 🛠️ 核心架构 (The Architecture)  
Frontend依旧老几样：React + Vite + Framer Motion + Tailwind CSS

Backend & Auth 轻量数据与鉴权管理: Supabase 

Data Flow: 乐观更新 

## 🌗 交互体验细节  
等你慢慢发现 ~~其实是懒得写了~~  

## 🌱 在本地跑起来
需要 Node 20.19+ 或 22.12+（Vite 8 的要求）。

```bash
git clone https://github.com/BobLee-tech/Oasis.git
cd Oasis
npm install
cp .env.example .env.local   # 可以全空着
npm run dev                  # http://localhost:5173
```

- **不配 Supabase 也能逛**：文章、分类、留言会存在浏览器 localStorage 里。要接自己的库，就在 Supabase 的 SQL Editor 依次跑 `supabase/*.sql`，并把里面 `is_gardener()` 的邮箱换成你自己的（只有这个邮箱登录后能写）。登录入口是按 `` ` `` 唤起的终端。
- **歌不在仓库里**：音频与歌词有版权，只托管在我自己的 R2 上。本地想听，把文件放进 `public/audio/`（路径要与 `src/hooks/useSoundscape.ts` 里 `PLAYLIST` 的 `url` 一致），或者设 `VITE_AUDIO_BASE`。
- **Miku 不在仓库里**：她是 Live2D 官方的初音样例模型，按授权不随源码分发。没有她时角落会显示「她今天有点害羞」，其余一切照旧。想请她来，从 [Live2D 样例页](https://www.live2d.com/en/learn/sample/) 下载初音ミク样例，把其中的 `miku_sample_t04.moc3`、`.physics3.json`、`.cdi3.json`、`motion/` 和 `miku_sample_t04.2048/` 放进 `public/live2d/miku/`（仓库里那份 `model3.json` 是重排过动作分组的，别用样例自带的覆盖它），再跑 `npm run live2d:texture` 和 `npm run live2d:patch`。
- 构建 `npm run build`，测试 `npm test`。其余脚本（加歌、配图、歌词）见 [scripts/README.md](scripts/README.md)。

## 📜 许可
**代码**以 [MIT](LICENSE) 开源，随便拿去种自己的花园。

下面这些**不在** MIT 里：
- **图片、视频与人物形象**：`public/image/`、`public/miku.jpg`、`public/avatar.jpg`、`public/atelier/`（工坊作品的展示片）。版权归各自作者，别拿去另作他用。
- **园里写的字**：`music-data/` 里的曲目介绍与心境、`src/data/` 里的语录与来信文案、文章正文（在 Supabase 里，不在仓库）。保留所有权利。
- **歌**：曲名、专辑与歌手信息只作索引，音频与歌词版权归原权利人，本仓库不包含它们。
- **第三方素材**：仇英《独乐园图》等馆藏画作（CC0）、开源字体（OFL）等，出处与许可见 [public/yuantu/CREDITS.md](public/yuantu/CREDITS.md)、[public/lights/CREDITS.md](public/lights/CREDITS.md)、[public/garden/CREDITS.md](public/garden/CREDITS.md)。`public/live2d/core/live2dcubismcore.min.js` 是 Live2D Cubism Core，按 [Live2D Proprietary Software License](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html) 作为 Redistributable Code 随附；Miku 模型本身不在仓库里（见上）。

## 📬 联络  
如果你觉得有想对我说的话，或探讨技术架构，或是开发心得，或是闲聊一二，欢迎通过下方链接找到我。  

Email: lb15058460816@gmail.com  

“Exploring the intersection of human behavior, aesthetics, and software architecture.”  
