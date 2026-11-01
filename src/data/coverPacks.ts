// 🎨 封面资源包：写作抽屉「Cover」一栏里可以直接选的画（lib/coverImage.ts 把选中的那张写进正文末尾的 `[oasis-cover]:`）。
//   都是开放获取（CC0）的真迹，出处见 public/garden/CREDITS.md 与 public/yuantu/CREDITS.md。
//   focus 是默认取景框（选中时一并写进地址，之后在抽屉里还能再拖）：只给主体偏在一边的画标，其余按中心；园图切片的框避开了上下的裱绫。
//   thumb 是选图面板里的 320 宽缩略图，面板只取它，选中了卡片才取大图（长边 1280–1400）。
//   加一包：往 COVER_PACKS 里追加，图与 <id>.thumb.webp 放 public/garden/<包名>/，出处记进 CREDITS.md。
import type { FocusBox } from '../lib/coverImage';

const GARDEN = ((import.meta.env.VITE_GARDEN_BASE as string | undefined) || '/garden').replace(/\/$/, '');
const YUANTU = ((import.meta.env.VITE_YUANTU_BASE as string | undefined) || '/yuantu').replace(/\/$/, '');

export interface CoverItem { id: string; name: string; src: string; thumb: string; focus?: FocusBox }
export interface CoverPack { id: string; name: string; note: string; items: CoverItem[] }

/** public/garden/<dir>/<id>.webp 与 <id>.thumb.webp */
const art = (dir: string) => (id: string, name: string, focus?: FocusBox): CoverItem =>
  ({ id, name, src: `${GARDEN}/${dir}/${id}.webp`, thumb: `${GARDEN}/${dir}/${id}.thumb.webp`, focus });
const plate = art('plates');
const scroll = (t: string, name: string, focus: FocusBox): CoverItem =>
  ({ id: `t${t}`, name, src: `${YUANTU}/scroll/t${t}.webp`, thumb: `${GARDEN}/dulelyuan/t${t}.thumb.webp`, focus });
const ukiyoe = art('ukiyoe'), rimpa = art('rimpa'), song = art('song'), mingqing = art('mingqing');

export const COVER_PACKS: CoverPack[] = [
  {
    id: 'momoyogusa', name: '百々世草', note: '神坂雪佳，1909–10 · 一月两节气一幅',
    items: [
      plate('secchuchiku', '雪中竹 · 小寒大寒'), plate('ume', '梅 · 立春雨水'), plate('suminoe', '住之江 · 惊蛰春分'),
      plate('yanagi-sakura', '柳樱 · 清明谷雨'), plate('yatsuhashi', '八桥 · 立夏小满'), plate('ajisai', '紫阳花 · 芒种夏至'),
      plate('asagao', '朝颜 · 小暑大暑'), plate('komami', '小波 · 立秋处暑'), plate('tsuru', '鹤 · 白露秋分'),
      plate('boshu', '暮秋 · 寒露霜降'), plate('sonarematsu', '矶驯松 · 立冬小雪'), plate('fuji', '富士 · 大雪冬至'),
    ],
  },
  {
    id: 'ukiyoe', name: '浮世绘 · 风雨雪月', note: '广重、北斋、晓斋，1830s–1880s 的木版画',
    items: [
      ukiyoe('shono', '庄野白雨 · 广重', [0.05, 0.34, 0.75, 0.76]), ukiyoe('kambara', '蒲原夜雪 · 广重'), ukiyoe('karasaki', '唐崎夜雨 · 广重'),
      ukiyoe('yokkaichi', '四日市 · 广重'), ukiyoe('awa', '阿波鸣门 · 广重'), ukiyoe('kanazawa', '金泽夜月 · 广重'),
      ukiyoe('gaifu', '凯风快晴 · 北斋', [0.3, 0.1, 0.95, 0.52]), ukiyoe('sanka', '山下白雨 · 北斋', [0.3, 0.03, 0.95, 0.45]),
      ukiyoe('misaka', '三坂水面 · 北斋'), ukiyoe('kintai', '锦带桥 · 北斋'), ukiyoe('karasu', '月下梅鸦 · 晓斋', [0.42, 0.15, 0.9, 0.57]),
    ],
  },
  {
    id: 'rimpa', name: '琳派 · 金屏', note: '光琳、渡边始兴、中村芳中，18 世纪',
    items: [
      rimpa('kiku-1', '溪畔菊 · 光琳 其一'), rimpa('kiku-2', '溪畔菊 · 光琳 其二'), rimpa('shosho', '潇湘八景 · 始兴'),
      rimpa('nami', '波 · 芳中'), rimpa('ume', '梅 · 光琳画谱'), rimpa('aoi', '葵 · 光琳画谱'),
      rimpa('asagao', '朝颜 · 光琳画谱'), rimpa('kame', '龟 · 光琳画谱', [0.12, 0.25, 0.92, 0.67]),
    ],
  },
  {
    id: 'song', name: '宋元小品', note: '马远、马麟、夏圭、钱选，团扇与册页',
    items: [
      song('mayuan-moon', '月下把杯 · 马远', [0, 0.6, 0.62, 0.9]), song('mayuan-deer', '松溪观鹿 · 马远', [0.25, 0.56, 0.95, 0.86]),
      song('malin-geese', '远山飞雁 · 马麟', [0.4, 0.62, 1, 0.92]), song('malin-clouds', '坐看云起 · 马麟', [0, 0.6, 0.7, 0.9]), song('willows', '柳岸 · 宋人'),
      song('gibbon', '悬猿 · 夏圭', [0.02, 0.24, 0.4, 0.54]), song('qianxuan', '花鸟 · 钱选'), song('flowering', '花枝小禽 · 宋人'),
    ],
  },
  {
    id: 'mingqing', name: '明清册页', note: '沈周《虎丘十二景》、樊圻、查士标',
    items: [
      mingqing('huqiu-1', '虎丘远眺 · 沈周'), mingqing('huqiu-2', '憨憨泉 · 沈周'), mingqing('huqiu-7', '千佛堂 · 沈周'),
      mingqing('huqiu-9', '千顷云 · 沈周'), mingqing('huqiu-11', '竹亭 · 沈周'), mingqing('huqiu-12', '陟云阁 · 沈周'),
      mingqing('fanqi-6', '柳蝉 · 樊圻', [0, 0.12, 0.62, 0.52]), mingqing('fanqi-8', '月下凫 · 樊圻', [0.2, 0.45, 0.68, 0.88]),
      mingqing('fanqi-9', '林禽 · 樊圻'), mingqing('wuling', '武陵溪 · 查士标'),
    ],
  },
  {
    id: 'dulelyuan', name: '独乐园图', note: '仇英，明 · 园图那一卷的画心',
    items: [
      scroll('15', '弄水轩', [0.5, 0.2, 0.95, 0.65]), scroll('14', '读书堂', [0.3, 0.15, 0.75, 0.6]),
      scroll('13', '竹畔', [0.2, 0.2, 0.8, 0.65]), scroll('12', '种竹斋', [0.1, 0.2, 0.9, 0.65]),
      scroll('11', '采药圃', [0.2, 0.25, 0.8, 0.7]), scroll('10', '浇花亭', [0.5, 0.25, 0.95, 0.7]),
      scroll('09', '钓鱼庵', [0.05, 0.2, 0.6, 0.65]), scroll('07', '见山台', [0.45, 0.2, 0.85, 0.62]),
    ],
  },
];
