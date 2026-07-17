// 🌾 二十四节气：让网站「知道今天是什么日子」。
//   纯前端近似（公历固定日，误差 ±1 天，对问候语足够）。每个节气配几句温柔的话，按日轮换。
//   同时提供当前季节，供背景粒子在春樱 / 夏萤 / 秋叶 / 冬雪之间流转。

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SolarTerm {
  name: string;       // 中文名
  notes: string[];    // 几句温柔的话，随节气内的日子轮换
  month: number;      // 公历近似月
  day: number;        // 公历近似日
}

// 按公历顺序（从立春起），日期为常见近似值
export const SOLAR_TERMS: SolarTerm[] = [
  { name: '立春', month: 2, day: 4, notes: [
    '东风解冻，万物开始舒展。',
    '律回岁晚冰霜少，春到人间草木知。',
    '一年的温柔，从今天起笔。',
  ]},
  { name: '雨水', month: 2, day: 19, notes: [
    '天街小雨润如酥。',
    '好雨知时节，当春乃发生。',
    '雨水落地无声，滋养都在看不见的地方。',
  ]},
  { name: '惊蛰', month: 3, day: 6, notes: [
    '一声春雷，唤醒沉睡的生灵。',
    '微雨众卉新，一雷惊蛰始。',
    '蛰伏不是停滞，是在积蓄破土的力气。',
  ]},
  { name: '春分', month: 3, day: 21, notes: [
    '昼夜均分，愿你也内外均衡。',
    '春分麦起身，一刻值千金。',
    '燕子回时，昼夜正平分。',
  ]},
  { name: '清明', month: 4, day: 5, notes: [
    '气清景明，万物皆显。',
    '梨花风起正清明，游子寻春半出城。',
    '记得的人，就一直都在。',
  ]},
  { name: '谷雨', month: 4, day: 20, notes: [
    '雨生百谷，是播种也是耐心。',
    '谷雨春光晓，山川黛色青。',
    '春天最后一场雨，落给整个夏天。',
  ]},
  { name: '立夏', month: 5, day: 6, notes: [
    '万物至此皆长大。',
    '绿树阴浓夏日长，楼台倒影入池塘。',
    '蝉声还早，先让风把绿意吹满。',
  ]},
  { name: '小满', month: 5, day: 21, notes: [
    '小满即是全，不必求圆满。',
    '麦穗初齐稚子娇，桑叶正肥蚕食饱。',
    '将满未满，是最从容的时节。',
  ]},
  { name: '芒种', month: 6, day: 6, notes: [
    '有芒的麦子快收，有芒的稻子可种。',
    '时雨及芒种，四野皆插秧。',
    '忙而不茫，种下的都会有回音。',
  ]},
  { name: '夏至', month: 6, day: 21, notes: [
    '白昼最长，愿光也照进心里。',
    '绿筠尚含粉，圆荷始散芳。',
    '今天的太阳走得最慢，多晒一会儿吧。',
  ]},
  { name: '小暑', month: 7, day: 7, notes: [
    '倏忽温风至，因循小暑来。',
    '荷风送香气，竹露滴清响。',
    '暑气初起，记得多喝水呀。',
  ]},
  { name: '大暑', month: 7, day: 23, notes: [
    '暑气正盛，记得给自己纳凉。',
    '桂轮开子夜，萤火照空时。',
    '热到极处，秋凉就不远了。',
  ]},
  { name: '立秋', month: 8, day: 8, notes: [
    '一叶知秋，凉意悄悄启程。',
    '云天收夏色，木叶动秋声。',
    '夏天欠你的风，秋天会补上。',
  ]},
  { name: '处暑', month: 8, day: 23, notes: [
    '暑气至此而止，心也渐渐安宁。',
    '离离暑云散，袅袅凉风起。',
    '燥热退场，把耐心还给日子。',
  ]},
  { name: '白露', month: 9, day: 8, notes: [
    '露从今夜白，月是故乡明。',
    '蒹葭苍苍，白露为霜。',
    '夜里凉了，记得添一件衣裳。',
  ]},
  { name: '秋分', month: 9, day: 23, notes: [
    '昼夜再度均分，愿你收放自如。',
    '晴空一鹤排云上，便引诗情到碧霄。',
    '收获一半，留白一半。',
  ]},
  { name: '寒露', month: 10, day: 8, notes: [
    '露气寒冷，将凝结成霜。',
    '袅袅凉风动，凄凄寒露零。',
    '桂香最浓的时候到了。',
  ]},
  { name: '霜降', month: 10, day: 24, notes: [
    '霜叶红于二月花。',
    '停车坐爱枫林晚。',
    '秋天在用最盛大的颜色告别。',
  ]},
  { name: '立冬', month: 11, day: 8, notes: [
    '万物收藏，是休息也是积蓄。',
    '细雨生寒未有霜，庭前木叶半青黄。',
    '冬天不是终点，是一次深呼吸。',
  ]},
  { name: '小雪', month: 11, day: 22, notes: [
    '天地初寒，落雪未盛。',
    '晚来天欲雪，能饮一杯无。',
    '第一场雪还在路上，先把炉火点好。',
  ]},
  { name: '大雪', month: 12, day: 7, notes: [
    '愿这场雪，覆住所有喧嚣。',
    '千山鸟飞绝，万径人踪灭。',
    '雪把世界调成静音，正好听见自己。',
  ]},
  { name: '冬至', month: 12, day: 22, notes: [
    '数九寒天，昼短夜长，春已在路上。',
    '天时人事日相催，冬至阳生春又来。',
    '最长的夜过去，日子就一天天亮起来。',
  ]},
  { name: '小寒', month: 1, day: 6, notes: [
    '小寒信风，腊梅初绽。',
    '墙角数枝梅，凌寒独自开。',
    '最冷的日子里，也有花在偷偷开。',
  ]},
  { name: '大寒', month: 1, day: 20, notes: [
    '岁末大寒，静待又一个春。',
    '寒夜客来茶当酒，竹炉汤沸火初红。',
    '熬过大寒，就是立春。',
  ]},
];

const mmdd = (m: number, d: number) => m * 100 + d;

// 当前（或指定日期）所处的节气
export const currentSolarTerm = (date: Date = new Date()): SolarTerm => {
  const key = mmdd(date.getMonth() + 1, date.getDate());
  // 1 月初：小寒(1/6)前仍属上一年冬至
  if (key < mmdd(1, 6)) return SOLAR_TERMS.find(t => t.name === '冬至')!;
  // 取「不晚于今天」的最近一个节气（按 mmdd 比大小，而非数组顺序，避免年末的小寒/大寒抢位）
  let current = SOLAR_TERMS.find(t => t.name === '冬至')!;
  let best = -1;
  for (const t of SOLAR_TERMS) {
    const k = mmdd(t.month, t.day);
    if (k <= key && k > best) { best = k; current = t; }
  }
  return current;
};

// 进入当前节气的第几天（交节当天为 0），供问候语区分「今日交节」与「第 N 日」
export const daysIntoTerm = (date: Date = new Date()): number => {
  const term = currentSolarTerm(date);
  let year = date.getFullYear();
  // 跨年：1 月初仍属上一年冬至
  if (term.month === 12 && date.getMonth() === 0) year -= 1;
  const start = new Date(year, term.month - 1, term.day);
  return Math.max(0, Math.floor((date.getTime() - start.getTime()) / 86400000));
};

// 当前节气今日的一句话：在该节气的几句语录间按日轮换
export const termNoteOfDay = (date: Date = new Date()): string => {
  const term = currentSolarTerm(date);
  return term.notes[daysIntoTerm(date) % term.notes.length];
};

// 当前季节（依「四立」划分），供背景粒子切换形态
export const currentSeason = (date: Date = new Date()): Season => {
  const key = mmdd(date.getMonth() + 1, date.getDate());
  if (key >= mmdd(2, 4) && key < mmdd(5, 6)) return 'spring';
  if (key >= mmdd(5, 6) && key < mmdd(8, 8)) return 'summer';
  if (key >= mmdd(8, 8) && key < mmdd(11, 8)) return 'autumn';
  return 'winter';
};

// 🌾 季节光：每个季节一组极淡的环境色，替换 App 背景暖纸底光的两处 radial-gradient
//   （该层整体只在亮色模式可见，dark:opacity-0 时隐去，故此处只需亮色两份）。
//   幅度控制在「隐约觉得站变了却说不出哪变了」——按季节而非 24 节气逐一配色，变化本就该缓慢。
interface SeasonTint { wash: string; accent: string }
const SEASON_TINTS: Record<Season, SeasonTint> = {
  spring: { wash: 'rgba(250,253,245,0.9)', accent: 'rgba(120,200,150,0.06)' },  // 嫩绿
  summer: { wash: 'rgba(255,251,242,0.9)', accent: 'rgba(57,197,187,0.06)' },   // 青金（原色）
  autumn: { wash: 'rgba(255,248,238,0.9)', accent: 'rgba(200,140,90,0.06)' },   // 暖赭
  winter: { wash: 'rgba(248,250,255,0.9)', accent: 'rgba(120,150,220,0.06)' },  // 靛蓝
};
export const termTint = (date: Date = new Date()): SeasonTint => SEASON_TINTS[currentSeason(date)];
