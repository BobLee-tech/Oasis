// 🌾 二十四节气：让网站「知道今天是什么日子」。
//   纯前端近似（公历固定日，误差 ±1 天，对问候语足够）。每个节气配一句温柔的话。
//   同时提供当前季节，供背景粒子在春樱 / 夏萤 / 秋叶 / 冬雪之间流转。

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SolarTerm {
  name: string;       // 中文名
  note: string;       // 一句温柔的话
  month: number;      // 公历近似月
  day: number;        // 公历近似日
}

// 按公历顺序（从立春起），日期为常见近似值
export const SOLAR_TERMS: SolarTerm[] = [
  { name: '立春', note: '东风解冻，万物开始舒展。', month: 2, day: 4 },
  { name: '雨水', note: '天街小雨润如酥。', month: 2, day: 19 },
  { name: '惊蛰', note: '一声春雷，唤醒沉睡的生灵。', month: 3, day: 6 },
  { name: '春分', note: '昼夜均分，愿你也内外均衡。', month: 3, day: 21 },
  { name: '清明', note: '气清景明，万物皆显。', month: 4, day: 5 },
  { name: '谷雨', note: '雨生百谷，是播种也是耐心。', month: 4, day: 20 },
  { name: '立夏', note: '万物至此皆长大。', month: 5, day: 6 },
  { name: '小满', note: '小满即是全，不必求圆满。', month: 5, day: 21 },
  { name: '芒种', note: '有芒的麦子快收，有芒的稻子可种。', month: 6, day: 6 },
  { name: '夏至', note: '白昼最长，愿光也照进心里。', month: 6, day: 21 },
  { name: '小暑', note: '倏忽温风至，因循小暑来。', month: 7, day: 7 },
  { name: '大暑', note: '暑气正盛，记得给自己纳凉。', month: 7, day: 23 },
  { name: '立秋', note: '一叶知秋，凉意悄悄启程。', month: 8, day: 8 },
  { name: '处暑', note: '暑气至此而止，心也渐渐安宁。', month: 8, day: 23 },
  { name: '白露', note: '露从今夜白，月是故乡明。', month: 9, day: 8 },
  { name: '秋分', note: '昼夜再度均分，愿你收放自如。', month: 9, day: 23 },
  { name: '寒露', note: '露气寒冷，将凝结成霜。', month: 10, day: 8 },
  { name: '霜降', note: '霜叶红于二月花。', month: 10, day: 24 },
  { name: '立冬', note: '万物收藏，是休息也是积蓄。', month: 11, day: 8 },
  { name: '小雪', note: '天地初寒，落雪未盛。', month: 11, day: 22 },
  { name: '大雪', note: '愿这场雪，覆住所有喧嚣。', month: 12, day: 7 },
  { name: '冬至', note: '数九寒天，昼短夜长，春已在路上。', month: 12, day: 22 },
  { name: '小寒', note: '小寒信风，腊梅初绽。', month: 1, day: 6 },
  { name: '大寒', note: '岁末大寒，静待又一个春。', month: 1, day: 20 },
];

const mmdd = (m: number, d: number) => m * 100 + d;

// 当前（或指定日期）所处的节气
export const currentSolarTerm = (date: Date = new Date()): SolarTerm => {
  const key = mmdd(date.getMonth() + 1, date.getDate());
  let current = SOLAR_TERMS[SOLAR_TERMS.length - 3]; // 兜底：冬至（跨年 1 月初仍属其后）
  for (const t of SOLAR_TERMS) {
    if (mmdd(t.month, t.day) <= key) current = t;
  }
  // 处理 1 月初：小寒(1/6)前仍属上一年冬至
  if (key < mmdd(1, 6)) current = SOLAR_TERMS.find(t => t.name === '冬至')!;
  return current;
};

// 当前季节（依「四立」划分），供背景粒子切换形态
export const currentSeason = (date: Date = new Date()): Season => {
  const key = mmdd(date.getMonth() + 1, date.getDate());
  if (key >= mmdd(2, 4) && key < mmdd(5, 6)) return 'spring';
  if (key >= mmdd(5, 6) && key < mmdd(8, 8)) return 'summer';
  if (key >= mmdd(8, 8) && key < mmdd(11, 8)) return 'autumn';
  return 'winter';
};
