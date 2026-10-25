// 🖋️ 落款的时间：干支纪年、节气、七十二候。与尺牍邻居信的落款（「丙午 寒露」）同一套写法，
//   阅读舱的文末落款读它（OasisReader.tsx 的 Colophon）。节气沿用 lib/solarTerms.ts 的近似表（公历固定日，±1 天）。
import { currentSolarTerm, daysIntoTerm } from './solarTerms';

const GAN = '甲乙丙丁戊己庚辛壬癸', ZHI = '子丑寅卯辰巳午未申酉戌亥';

// 七十二候（《逸周书·时训解》通行本）：每个节气三候，五日一候
const HOU: Record<string, [string, string, string]> = {
  立春: ['东风解冻', '蛰虫始振', '鱼陟负冰'], 雨水: ['獭祭鱼', '候雁北', '草木萌动'], 惊蛰: ['桃始华', '仓庚鸣', '鹰化为鸠'],
  春分: ['玄鸟至', '雷乃发声', '始电'], 清明: ['桐始华', '田鼠化为鴽', '虹始见'], 谷雨: ['萍始生', '鸣鸠拂其羽', '戴胜降于桑'],
  立夏: ['蝼蝈鸣', '蚯蚓出', '王瓜生'], 小满: ['苦菜秀', '靡草死', '麦秋至'], 芒种: ['螳螂生', '鵙始鸣', '反舌无声'],
  夏至: ['鹿角解', '蜩始鸣', '半夏生'], 小暑: ['温风至', '蟋蟀居宇', '鹰始挚'], 大暑: ['腐草为萤', '土润溽暑', '大雨时行'],
  立秋: ['凉风至', '白露降', '寒蝉鸣'], 处暑: ['鹰乃祭鸟', '天地始肃', '禾乃登'], 白露: ['鸿雁来', '玄鸟归', '群鸟养羞'],
  秋分: ['雷始收声', '蛰虫坯户', '水始涸'], 寒露: ['鸿雁来宾', '雀入大水为蛤', '菊有黄华'], 霜降: ['豺乃祭兽', '草木黄落', '蛰虫咸俯'],
  立冬: ['水始冰', '地始冻', '雉入大水为蜃'], 小雪: ['虹藏不见', '天气上升地气下降', '闭塞而成冬'], 大雪: ['鹖鴠不鸣', '虎始交', '荔挺出'],
  冬至: ['蚯蚓结', '麋角解', '水泉动'], 小寒: ['雁北乡', '鹊始巢', '雉始雊'], 大寒: ['鸡始乳', '征鸟厉疾', '水泽腹坚'],
};

/** 干支纪年，以立春（近似 2 月 4 日）为岁首 */
export const ganzhiYear = (date: Date): string => {
  const m = date.getMonth(), d = date.getDate();
  const y = m < 1 || (m === 1 && d < 4) ? date.getFullYear() - 1 : date.getFullYear();
  const i = ((y - 4) % 60 + 60) % 60;
  return GAN[i % 10] + ZHI[i % 12];
};

export interface Colophon { year: string; term: string; houIndex: number; hou: string }

/** 「丙午年 秋分 · 末候 水始涸」的四个部件 */
export const colophonOf = (date: Date): Colophon => {
  const term = currentSolarTerm(date).name;
  const houIndex = Math.min(2, Math.floor(daysIntoTerm(date) / 5));
  return { year: ganzhiYear(date), term, houIndex, hou: HOU[term]?.[houIndex] ?? '' };
};

export const HOU_ORDINAL = ['初候', '次候', '末候'] as const;
