# 花园 · 封面资源包出处

写作抽屉「Cover」一栏的资源包（`src/data/coverPacks.ts`）。全部来自克利夫兰美术馆开放获取（Cleveland Museum of Art Open Access，CC0），取自 `openaccess-api.clevelandart.org` 的 print 版（长边 3400）。演示与取舍见 `docs/cards.html`。

处理（脚本思路记在这里，图本身已是成品）：先按四边背景色找出画心、裁掉博物馆照片的底色；裱在衬纸 / 裱绫上的再剥一层（参考色取内收 4% 的那一圈，避开最外一道深色绫边）；团扇取扇面的内接矩形（各边内收 15.5%）；《光琳画谱》对开页去掉书页外缘；樊圻册页只取右半的画心（手量 x 0.515–0.935、y 0.27–0.80）。大图长边 1280（百々世草 1400），webp q72；`*.thumb.webp` 是选图面板用的 320 宽缩略图。

| 目录 | 作品 | 馆藏号 | 许可 |
|---|---|---|---|
| `plates/`（12） | 神坂雪佳《百々世草》1909–10：梅、柳樱、八桥、紫阳花、朝颜、小波、住之江、鹤、暮秋、矶驯松、雪中竹、富士 | 1988.23.2.6、2.2、1.9、2.13、1.15、2.20、3.2、2.8、3.17、3.13、1.20、1.13 | CC0 |
| `ukiyoe/shono` | 歌川广重《东海道五十三次 · 庄野 白雨》1833 | 1948.306 | CC0 |
| `ukiyoe/kambara` | 歌川广重《东海道五十三次 · 蒲原 夜之雪》1833 | 1985.317 | CC0 |
| `ukiyoe/karasaki` | 歌川广重《近江八景 · 唐崎夜雨》c. 1835 | 1985.312 | CC0 |
| `ukiyoe/yokkaichi` | 歌川广重《东海道五十三次 · 四日市 三重川》c. 1833–34 | 1948.307 | CC0 |
| `ukiyoe/awa` | 歌川广重《阿波鸣门之风景》三联 1857 | 1930.183 | CC0 |
| `ukiyoe/kanazawa` | 歌川广重《武阳金泽八胜夜景》三联 1857 | 1924.967 | CC0 |
| `ukiyoe/gaifu` | 葛饰北斋《富岳三十六景 · 凯风快晴》early 1830s | 1930.189 | CC0 |
| `ukiyoe/sanka` | 葛饰北斋《富岳三十六景 · 山下白雨》early 1830s | 1940.1002 | CC0 |
| `ukiyoe/misaka` | 葛饰北斋《富岳三十六景 · 甲州三坂水面》early 1830s | 1985.325 | CC0 |
| `ukiyoe/kintai` | 葛饰北斋《诸国名桥奇览 · 周防国岩国锦带桥》early 1830s | 1924.965 | CC0 |
| `ukiyoe/karasu` | 河锅晓斋《月下梅枝鸦》1880s | 1930.203 | CC0 |
| `rimpa/kiku-1`、`kiku-2` | 尾形光琳《溪畔菊图》屏风一双 c. 1715–30 | 1958.206.1、1958.206.2 | CC0 |
| `rimpa/shosho` | 渡边始兴《潇湘八景图》屏风 early–mid 1700s | 1968.267 | CC0 |
| `rimpa/nami` | 中村芳中《波》扇面 late 1700s–early 1800s | 1999.90 | CC0 |
| `rimpa/ume`、`aoi`、`asagao`、`kame` | 中村芳中《光琳画谱》对开页 1800s | 1991.118.2.e、2.k、1.b、2.b | CC0 |
| `song/mayuan-moon` | 马远《月下把杯》late 1100s–early 1200s | 1997.89 | CC0 |
| `song/mayuan-deer` | 马远《松溪观鹿》1127–1279 | 1997.88 | CC0 |
| `song/malin-geese` | 马麟《远山飞雁》mid-1200s | 1952.285 | CC0 |
| `song/malin-clouds` | 马麟《坐看云起》团扇 c. 1256 | 1961.421.1 | CC0 |
| `song/willows` | 宋人《柳岸》团扇 1100s | 1985.365 | CC0 |
| `song/gibbon` | 夏圭《悬猿》团扇 late 1100s–early 1200s | 1978.1 | CC0 |
| `song/qianxuan` | 钱选《花鸟》first half 1300s | 1970.70 | CC0 |
| `song/flowering` | 宋人《花枝小禽》1100s | 1985.371 | CC0 |
| `mingqing/huqiu-*` | 沈周《虎丘十二景》after 1490：虎丘远眺、憨憨泉、千佛堂、千顷云、竹亭、陟云阁 | 1964.371.1、.2、.7、.9、.11、.12 | CC0 |
| `mingqing/fanqi-*` | 樊圻《杂画册》early 1650s：第 6、8、9 开 | 1975.22.6、.8、.9 | CC0 |
| `mingqing/wuling` | 查士标《仿古山水册 · 武陵溪》1684 | 1955.37.4 | CC0 |
| `dulelyuan/t*.thumb.webp` | 仇英《独乐园图》卷切片的缩略图（大图就是园图的 `public/yuantu/scroll/`） | 1978.67 | CC0 |
