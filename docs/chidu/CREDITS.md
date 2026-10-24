# 尺牍（灯火）演示 · 材质出处

演示页 `docs/chidu-demo.html`（须在 `npm run dev` 下打开）。这里只登记本目录新加的素材；纸色、竹影、骑缝印、齐伋体沿用 `docs/shuzhai/`，出处见 `docs/shuzhai/CREDITS.md`。

## 花笺木刻 `motif/`（克利夫兰美术馆 Open Access，CC0）

《花鸟》（Blossoms），明，彩色木刻，1625（天启五年），馆藏号 1932.125。
原图：`https://openaccess-cdn.clevelandart.org/1932.125/1932.125_print.jpg`（3400×2853）。

处理：去色 → 两次模糊估出局部纸色 → 墨量 = 1 − 像素/纸色 → 去底噪 → 灰度图（白＝墨），长边 900。原图已删。

| 文件 | 原图裁切（全分辨率像素） | 用在哪 |
|---|---|---|
| `bird.webp` | x 1720–3280，y 150–1400（鸟与上枝） | Evan Lin 的笺 |
| `spray.webp` | x 1900–3250，y 1350–2450（右下花叶） | hejiac 的笺 |
| `blossom.webp` | x 0–1500，y 1150–2630（左下花丛） | 虚席回帖 |

页面里同一张图用两次：按邻居的 aura 色淡印（花笺），再做高度图求法线（拱花）。

## 纸纹 `tex/`（ambientCG，CC0）

| 文件 | 来源 | 用途 |
|---|---|---|
| `laid-n.webp` | Paper004 NormalGL，1K → 512 | 信封的帘纹 |
| `fleck.webp` | Paper002 Color，1K → 512 去色拉伸 | 八行笺上的纸屑 |

下载：`https://ambientcg.com/get?file=<ID>_1K-JPG.zip`。

## 库

three.js 0.170（MIT）、GSAP 3.13 + CustomEase + SplitText（免费商用），都走 jsDelivr。
