// ✉️ 尺牍的内容：每位邻居一封信（八行笺上写什么），外加一只「虚席以待」的空信封。
//   引擎（letterScene.ts）只管画，写什么在这里定。落款＝结邻那天的干支与节气，不写农历日（省得算错）。
import type { FriendLink } from '../../data/friends';

export type Motif = 'bird' | 'spray' | 'blossom';

/** 八行笺上的一行（第一行在最右）：t 为空就是空行；at=end 是落款，贴着地脚写 */
export interface LetterCol { t?: string; at?: 'start' | 'end'; small?: boolean }

export interface Letter {
  kind: 'friend' | 'vacant';
  name: string;
  url: string;
  host: string;
  desc: string;
  /** 邻居的 aura 色：笺染这个色（薛涛笺的意思），淡印也偏向它 */
  color: string;
  /** 花笺淡印用哪一块木刻 */
  motif: Motif;
  cols: LetterCol[];
}

/** 自家名帖：虚席回帖里那一行，交换友链时可复制 */
export const SELF = {
  name: 'Oasis · Bob Lee 的小站',
  desc: '一处温柔疗愈、带着禅意的数字花园。',
  mail: 'lb15058460816@gmail.com',
  color: '#FFB7C5',
};

const TERMS: [number, number, string][] = [
  [1, 5, '小寒'], [1, 20, '大寒'], [2, 4, '立春'], [2, 18, '雨水'], [3, 5, '惊蛰'], [3, 20, '春分'],
  [4, 5, '清明'], [4, 20, '谷雨'], [5, 5, '立夏'], [5, 21, '小满'], [6, 5, '芒种'], [6, 21, '夏至'],
  [7, 7, '小暑'], [7, 22, '大暑'], [8, 7, '立秋'], [8, 23, '处暑'], [9, 7, '白露'], [9, 23, '秋分'],
  [10, 8, '寒露'], [10, 23, '霜降'], [11, 7, '立冬'], [11, 22, '小雪'], [12, 7, '大雪'], [12, 21, '冬至'],
];
const termOf = (d: Date) => {
  const m = d.getMonth() + 1, day = d.getDate();
  let t = '冬至';
  for (const [tm, td, n] of TERMS) if (m > tm || (m === tm && day >= td)) t = n;
  return t;
};
// 干支年以立春为界
const ganzhi = (d: Date) => {
  let y = d.getFullYear();
  if (d.getMonth() === 0 || (d.getMonth() === 1 && d.getDate() < 4)) y--;
  return '甲乙丙丁戊己庚辛壬癸'[(y - 4) % 10] + '子丑寅卯辰巳午未申酉戌亥'[(y - 4) % 12];
};
/** 「丙午寒露」；不给日子就是今天 */
export const dateLine = (iso?: string) => {
  const d = iso ? new Date(`${iso}T12:00:00`) : new Date();
  return `${ganzhi(d)}${termOf(d)}`;
};

export const hostOf = (u: string) => {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; }
};

const MOTIFS: Motif[] = ['bird', 'spray'];

export const buildLetters = (friends: FriendLink[], selfUrl: string): Letter[] => [
  ...friends.map((f, i): Letter => ({
    kind: 'friend', name: f.name, url: f.url, host: hostOf(f.url), desc: f.desc, color: f.color, motif: MOTIFS[i % MOTIFS.length],
    cols: [{ t: '见字如面' }, { t: f.desc }, {}, {}, {}, {}, { t: f.name, at: 'end' }, { t: dateLine(f.since), at: 'end', small: true }],
  })),
  {
    kind: 'vacant', name: '虚席以待', url: selfUrl, host: hostOf(selfUrl), desc: SELF.desc, color: SELF.color, motif: 'blossom',
    cols: [{ t: '灯火常新' }, { t: '想把你的花园连过来？' }, { t: '来信' }, {}, {}, {}, { t: '绿洲园丁 Bob Lee', at: 'end' }, { t: dateLine(), at: 'end', small: true }],
  },
];
