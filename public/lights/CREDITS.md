# 灯火 · 邻家尺牍 · 素材出处

页面：`src/components/OasisLights.tsx` + `src/components/lights/`；演示稿与取舍：`docs/chidu-demo.html`。
纸色与纸面法线与园图共用 `public/yuantu/tex/`（yinshou-paper.webp、paper-n.webp），印泥斑用 `public/textures/inkpad-specks.webp`。

| 文件 | 来源 | 许可 | 用途 |
|---|---|---|---|
| `motif/bird.webp`、`spray.webp`、`blossom.webp` | 《花鸟》彩色木刻，明 1625，克利夫兰美术馆 1932.125（抠出墨版，灰度：白＝墨） | CC0 | 花笺淡印 + 拱花法线 |
| `tex/laid-n.webp` | ambientCG Paper004 NormalGL | CC0 | 信封帘纹 |
| `tex/fleck.webp` | ambientCG Paper002 Color（去色） | CC0 | 八行笺纸屑 |
| `tex/bamboo-shadow.webp` | 雪窗普明《风竹图》，克利夫兰 1953.246（叶影转阴影 alpha） | CC0 | 昼里窗外竹影（天光遮光片） |
| `seal.webp` | 仇英《独乐园图》卷上的葫芦形收藏印，克利夫兰 1978.67 | CC0 | 骑缝印 |
| `qiji.woff2` | 齐伋体（LingDong-/qiji-font）书斋四版子集 | OFL-1.1 | 标题「邻家尺牍」 |

字（npm 自托管，随灯火的 chunk 按需加载）：朱雀仿宋 `@free-fonts/zhuque-fangsong`（OFL）、志莽行书 `@fontsource/zhi-mang-xing`（OFL）、Homemade Apple（Apache 2.0）、IM Fell English / SC（OFL）。动画：GSAP 3（免费商用）+ CustomEase。
