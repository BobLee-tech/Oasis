// 🎨 封面资源包：写作抽屉「Cover」一栏里可以直接选的画（lib/coverImage.ts 把选中的那张写进正文末尾的 `[oasis-cover]:`）。
//   都是开放获取（CC0）的真迹，出处见 public/garden/CREDITS.md 与 public/yuantu/CREDITS.md。
//   focus 是默认取景框（选中时一并写进地址，之后在抽屉里还能再拖）；园图切片的框避开了上下的裱绫。
//   加一包：往 COVER_PACKS 里追加，图放 public/garden/<包名>/，出处记进 CREDITS.md。
import type { FocusBox } from '../lib/coverImage';

const GARDEN = ((import.meta.env.VITE_GARDEN_BASE as string | undefined) || '/garden').replace(/\/$/, '');
const YUANTU = ((import.meta.env.VITE_YUANTU_BASE as string | undefined) || '/yuantu').replace(/\/$/, '');

export interface CoverItem { id: string; name: string; src: string; focus?: FocusBox }
export interface CoverPack { id: string; name: string; note: string; items: CoverItem[] }

const plate = (id: string, name: string): CoverItem => ({ id, name, src: `${GARDEN}/plates/${id}.webp` });
const scroll = (t: string, name: string, focus: FocusBox): CoverItem => ({ id: `t${t}`, name, src: `${YUANTU}/scroll/t${t}.webp`, focus });

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
    id: 'dulelyuan', name: '独乐园图', note: '仇英，明 · 园图那一卷的画心',
    items: [
      scroll('15', '弄水轩', [0.5, 0.2, 0.95, 0.65]), scroll('14', '读书堂', [0.3, 0.15, 0.75, 0.6]),
      scroll('13', '竹畔', [0.2, 0.2, 0.8, 0.65]), scroll('12', '种竹斋', [0.1, 0.2, 0.9, 0.65]),
      scroll('11', '采药圃', [0.2, 0.25, 0.8, 0.7]), scroll('10', '浇花亭', [0.5, 0.25, 0.95, 0.7]),
      scroll('09', '钓鱼庵', [0.05, 0.2, 0.6, 0.65]), scroll('07', '见山台', [0.45, 0.2, 0.85, 0.62]),
    ],
  },
];
