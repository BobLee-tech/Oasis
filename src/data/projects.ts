// src/data/projects.ts
// 🪵 工坊 Atelier 的展品：简历里的三件获奖 / 交付项目，一件一开册页。
//   静态数据（与 friends.ts 同款），不建表。口径沿用简历 v8 第四节的证据边界：
//   团队交付不写成个人、未验证的结论标明、私有仓库不放链接、页面不出现真名。
//   设计稿与取舍见 docs/atelier-2026-10/ 与演示页（记忆：atelier-workshop-proposal）。

/** 分工条上的一颗石头：人 / 模型 / 规则 */
export type StoneKind = 'h' | 'm' | 'r';
export interface Stone { kind: StoneKind; name: string; sub: string }

export type LinkIcon = 'live' | 'code' | 'award' | 'film' | 'page' | 'lock';
export interface ProjectLink {
  label: string;
  /** 无 href = 不可点的说明行（如私有源码） */
  href?: string;
  icon: LinkIcon;
  /** 出处行第二行：域名或说明 */
  note: string;
  live?: boolean;
}

export interface Project {
  id: string;
  title: string;
  color: string;
  /** 眉题里的类别 */
  kind: string;
  /** 印文，两字一行 */
  seal: [string, string];
  /** 年表里的奖项短语 */
  honor: string;
  /** 年表里的一句出处 */
  venue: string;
  /** 年表与元信息里的时间，按展示原样写 */
  when: string;
  whenNote?: string;
  /** 落款节气与干支按这一天推算 */
  kuanDate: string;
  place: string;
  /** 一句引言，二十字上下 */
  line: string;
  /** 奖项行：粗体部分 + 赛事 */
  award: [string, string];
  role: string;
  team: string;
  stack: string;
  /** 画心下注：素材来历 */
  capture: string;
  captureLive?: boolean;
  still: string;
  promo: string;
  stones: Stone[];
  /** 从第 at 颗石头（1 起）分出的降级支流 */
  branch?: { at: number; why: string; stone: Stone };
  decision: string;
  problem: string;
  did: [string, string][];
  adr: {
    title: string;
    ctx: string;
    dec: string;
    cost: string;
  };
  result: string;
  resultFlag?: string;
  links: ProjectLink[];
}

export const PROJECTS: Project[] = [
  {
    id: 'adaptiq',
    title: 'Adaptiq',
    color: '#60A5FA',
    kind: 'AI 产品',
    seal: ['机构', '交付'],
    honor: '机构交付',
    venue: 'AI 教学系统 · 3 人团队',
    when: '2026.05–09',
    whenNote: '已结束',
    kuanDate: '2026-05-06',
    place: '悉尼',
    line: 'AI 起草学情报告，老师定稿，家长看懂进步。',
    award: ['已交付国内一家教育机构', '团队交付'],
    role: '合伙人 · 产品与全栈',
    team: '3 人',
    stack: 'Next.js · Supabase · DeepSeek',
    capture: '界面重绘 · 演示数据',
    still: '/atelier/adaptiq-still.webp',
    promo: '/atelier/adaptiq-promo.mp4',
    stones: [
      { kind: 'r', name: '课件入库', sub: '4 类格式' },
      { kind: 'm', name: 'DeepSeek 解析', sub: '预填小结' },
      { kind: 'h', name: '教师确认', sub: '可改可退' },
      { kind: 'r', name: '正式入档', sub: '家长可见' },
    ],
    branch: { at: 2, why: '解析失败', stone: { kind: 'h', name: '教师手动填写', sub: '' } },
    decision: '先做教师报告：一个功能，同时服务使用方和付费方。',
    problem: '访谈教师和家长后确认两个痛点：报告靠手写，家长看不出孩子有没有进步。',
    did: [
      ['需求与优先级', '先做教师报告，一个功能同时覆盖使用方和付费方。'],
      ['AI 工作流', 'AI 起草、教师确认、正式入档；4 类课件由 DeepSeek 解析预填，解析失败退回手动填写。'],
      ['线上缺陷', '教师改过之后家长仍看到 AI 原稿。修复后家长端只显示复核过的版本。'],
      ['交付与权限', '机构功能开关从数据库标志位改为服务端强制校验，覆盖 13 个教师端路由。'],
    ],
    adr: {
      title: '用三级掌握程度替代正确率',
      ctx: '小样本下正确率波动很大，一次作业就能让数字大起大落，家长容易误读。',
      dec: '报告改为「掌握 / 巩固中 / 待加强」三级。',
      cost: '报告不再给出精确百分比，分级口径需要向家长解释清楚。',
    },
    result: '已交付国内一家教育机构使用，合作现已结束。阅读回执、查看次数和停留时长已埋点，能追踪报告是否送达、是否被读；阅读率本身没有验证过。',
    resultFlag: '机制已上线 · 效果未验证',
    links: [
      { label: '源码', icon: 'lock', note: '私有项目 · 合作已结束，不公开' },
    ],
  },
  {
    id: 'athena',
    title: 'Athena',
    color: '#A78BFA',
    kind: '黑客松',
    seal: ['赛道', '冠军'],
    honor: 'SIG 赛道冠军',
    venue: 'Atlassian × Mistral × AISoc Hack',
    // 按仓库真实提交：悉尼时间 2026-07-31 13:46 → 08-01 12:34（Devpost 的 07-31 只是提交日）
    when: '2026.07.31–08.01',
    kuanDate: '2026-07-31',
    place: '悉尼',
    line: '把人、任务与阻塞，画成一张会自己更新的组织图谱。',
    award: ['Winner · SIG Track Prize', 'Atlassian × Mistral × AISoc Hack'],
    role: '前端 / 全栈',
    team: '5 人',
    stack: 'Next.js · Mistral · SQLite',
    capture: '线上 Demo 实拍',
    captureLive: true,
    still: '/atelier/athena-still.webp',
    promo: '/atelier/athena-promo.mp4',
    stones: [
      { kind: 'r', name: 'Discord 提醒', sub: '定时推送' },
      { kind: 'h', name: '成员回复', sub: '一句自然语言' },
      { kind: 'm', name: 'Mistral 抽取', sub: '结构化增量' },
      { kind: 'r', name: '回写图谱', sub: '阻塞即时可见' },
    ],
    decision: '进度不用另外汇报：在 Discord 回一句话，图谱自己更新。',
    problem: '团队状态分散且滞后，阻塞往往要等到站会才暴露出来。',
    did: [
      ['问题定义', '把人员、任务、依赖和阻塞做成可下钻的组织图谱，需要跟进的人在界面上直接可见。'],
      ['Agent 闭环', 'Discord 推送和提醒；成员用自然语言回复，Mistral 抽取成结构化状态，写回图谱。'],
    ],
    adr: {
      title: '在 Discord 里收状态，不另做填报页',
      ctx: '让成员打开一个新工具填进度，很难坚持。',
      dec: '提醒发到团队已经在用的 Discord，回复一句自然语言即可，由模型抽取。',
      cost: '抽取质量依赖模型，回复含糊时需要追问或人工修正。',
    },
    result: '获 SIG 赛道奖。现场演示一个完整闭环：Bot 在 Discord 上追问负责人，回复被抽取成图谱增量，图谱当场变化。',
    links: [
      { label: '线上图谱', href: 'https://athena-zeta-ten.vercel.app/', icon: 'live', note: 'athena-zeta-ten.vercel.app', live: true },
      { label: '项目介绍页', href: 'https://athena-showcase.vercel.app/', icon: 'page', note: 'athena-showcase.vercel.app' },
      { label: '演示录像', href: 'https://youtu.be/kfv1F0-Esc0', icon: 'film', note: 'YouTube · 现场完整闭环' },
      { label: 'Devpost 获奖页', href: 'https://devpost.com/software/athena-plnf5a', icon: 'award', note: 'devpost.com/software/athena-plnf5a' },
      { label: 'GitHub', href: 'https://github.com/EdwinjJ1/unsw-mistral-hackathon-2026', icon: 'code', note: 'EdwinjJ1/unsw-mistral-hackathon-2026' },
    ],
  },
  {
    id: 'akeso',
    title: 'Akeso',
    color: '#FDBA74',
    kind: '黑客松',
    seal: ['决赛', '入围'],
    honor: '决赛入围',
    venue: 'ICON UNSW × Lyra',
    when: '2026.07',
    kuanDate: '2026-07-25',
    place: '悉尼',
    line: '按一天的精力起伏，把难事放进状态最好的时段。',
    award: ['Finalist', 'ICON UNSW × Lyra'],
    role: '产品设计与后端',
    team: '4 人',
    stack: 'Express · Supabase · Zod',
    capture: '线上 Demo 实拍',
    captureLive: true,
    still: '/atelier/akeso-still.webp',
    promo: '/atelier/akeso-promo.mp4',
    stones: [
      { kind: 'h', name: '20 秒打卡', sub: '精力 · 睡眠 · 饮食 · 饮水' },
      { kind: 'r', name: 'EnergyEngine', sub: '算出精力分数' },
      { kind: 'r', name: 'PlannerService', sub: '按高峰低谷排日程' },
      { kind: 'm', name: '模型写措辞', sub: '只在约束内' },
    ],
    decision: '健康建议不让模型直接生成：规则先排好，模型只管措辞。',
    problem: '健康和营养建议一旦出错代价高，直接交给模型生成并不安全。',
    did: [
      ['模型边界', '建议先经过确定性规划器，按精力窗口和任务优先级排好，模型只在约束内写措辞。'],
      ['接口与测试', '接通 9 个接口，对规划规则和非法输入写了测试，结果可复现、可追溯。'],
    ],
    adr: {
      title: '规则先行，模型在后',
      ctx: '健康与营养建议属于高风险输出。',
      dec: '确定性规划器决定排什么，模型只负责怎么说。',
      cost: '建议的灵活度受规则限制，新场景要先补规则。',
    },
    result: '入围 ICON UNSW × Lyra 决赛。复盘：核心循环依赖手动记录，我判断它撑不住留存，提出改用可穿戴设备的被动数据驱动计划。',
    resultFlag: '假设 · 未验证',
    links: [
      { label: '在线 Demo', href: 'https://akeso-navy.vercel.app', icon: 'live', note: 'akeso-navy.vercel.app', live: true },
      { label: 'GitHub', href: 'https://github.com/EdwinjJ1/akeso', icon: 'code', note: 'EdwinjJ1/akeso' },
    ],
  },
];

const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
/** 公历年 → 干支纪年（按公历年近似，落款用足够） */
export const ganzhiYear = (year: number): string =>
  STEMS[(((year - 4) % 10) + 10) % 10] + BRANCHES[(((year - 4) % 12) + 12) % 12];

/** 册页序数：第一开、第二开… */
export const leafOrdinal = (i: number): string => `第${'一二三四五六七八九十'[i] ?? i + 1}开`;
