// 📜 园图的七景：仇英《独乐园图》卷上的七处建筑，对到现网的场所。
//   fx 是原图全分辨率的横坐标（原图 120000 宽，卷从右往左读，弄水轩在最前）；
//   slip 是签条相对景的偏移、calli 是文徵明景名真迹的宽高、qy 是卷尾《七咏》里这一景名字的位置——都是切片坐标的来源量。
//   采药圃、钓鱼庵现网还没有对应的去处：签条照挂（景名是真迹，好看），写「未开」，不能入。
import type { AppView } from '../../types/auth';
import type { Place } from '../../lib/places';

export interface Scene {
  id: string;
  name: string;
  fx: number;
  slip: number;
  to: Place | null;
  calli: [number, number];
  qy: number;
}

export const SCENES: Scene[] = [
  { id: 'nongshui', name: '弄水轩', fx: 98590, slip: 760, to: 'soundscape', calli: [235, 626], qy: 25042 },
  { id: 'dushu', name: '读书堂', fx: 90670, slip: 860, to: 'garden', calli: [199, 592], qy: 30706 },
  { id: 'zhongzhu', name: '种竹斋', fx: 82048, slip: 980, to: 'atelier', calli: [260, 860], qy: 23680 },
  { id: 'caiyao', name: '采药圃', fx: 77086, slip: 900, to: null, calli: [231, 639], qy: 27920 },
  { id: 'jiaohua', name: '浇花亭', fx: 72472, slip: 820, to: 'lights', calli: [219, 617], qy: 22200 },
  { id: 'diaoyu', name: '钓鱼庵', fx: 63604, slip: 900, to: null, calli: [244, 800], qy: 29310 },
  { id: 'jianshan', name: '见山台', fx: 55762, slip: 1150, to: 'orchard', calli: [207, 700], qy: 26495 },
];

export const sceneById = (id?: string | null): Scene | undefined => SCENES.find((s) => s.id === id);

/** 从哪一处进园图，卷就展到哪一景 */
export const SCENE_OF: Partial<Record<AppView, string>> = {
  soundscape: 'nongshui',
  garden: 'dushu',
  atelier: 'zhongzhu',
  lights: 'jiaohua',
  orchard: 'jianshan',
};

// 园图的本机记忆（只存在这台设备上）：解带只演一次、上次停在哪一景、来过几次、有没有在卷尾留过印
const KEY = 'oasis_yuantu_';
export const yStore = {
  get<T>(k: string, d: T): T {
    try { const v = localStorage.getItem(KEY + k); return v == null ? d : (JSON.parse(v) as T); } catch { return d; }
  },
  set(k: string, v: unknown) {
    try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch { /* 隐私模式等：不记也能用 */ }
  },
};

const D = '〇一二三四五六七八九';
/** 一二三…九十九：问候里的「别来三日」「新长两篇」 */
export const cn = (n: number): string =>
  n < 10 ? D[n] : n < 20 ? '十' + (n % 10 ? D[n % 10] : '') : D[Math.floor(n / 10)] + '十' + (n % 10 ? D[n % 10] : '');
