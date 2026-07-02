// 🎭 演示文章：仅用于本地开发时预览排版效果（月份归档 / 类型筛选 / 卡片瀑布流）。
//   · 只在 DEV 环境混入展示，不写 localStorage、不上云，☁ Sync 也不会带上它们。
//   · 看完效果后删掉本文件并移除 useGarden.ts 中的引用即可，或把 DEMO_POSTS 清空。
import type { BlogPost } from '../hooks/useGarden';

const ts = (s: string) => new Date(s).getTime();
const friendly = (s: string) =>
  new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const make = (
  id: string, dateStr: string, type: BlogPost['type'], title: string,
  tags: string[], color: string, content: string,
): BlogPost => ({
  id: `demo-${id}`,
  title,
  excerpt: content.slice(0, 110).replace(/[#*`>!\[\]()]/g, '').replace(/\n+/g, ' ').trim() + '…',
  date: friendly(dateStr),
  createdAt: ts(dateStr),
  type, tags, color, content,
});

export const DEMO_POSTS: BlogPost[] = [
  make('thought-slow', '2026-07-01T21:30:00', 'thought', '慢一点，也是一种前进',
    ['Psyche', 'Life'], '#39C5BB',
`## 为什么要有一座花园

朋友问我：都 2026 年了，为什么还要自己写个站，而不是发在别的平台上。

我想了想，大概是因为**平台的时间轴是别人的**，而花园的土壤是自己的。在这里没有推荐算法催促我更新，没有小红点等着被消灭。一篇文章可以安静地长在这里，三个月后我回来给它松松土，它还是它。

> 时光有自己的流速，事物有自己的归宿。

## 慢的勇气

这学期我刻意把节奏放慢了：少参加一场 hackathon，多读完一本书；少刷一小时资讯，多写五百字笔记。奇怪的是，产出反而变多了。

慢不是懒，是给根系留出向下生长的时间。`),

  make('weekly-w26', '2026-06-28T22:00:00', 'weekly', 'Week 26 · 期末后的第一周',
    ['Weekly', 'UNSW'], '#FFB7C5',
`## 本周做了什么

- 期末最后一门 COMP 考完，睡了一个十小时的觉
- 把 Oasis 的 garden 界面重构了一轮：左栏去卡片化，右栏收成一条目录线
- 给 C++ 项目补齐了单元测试，覆盖率终于过 80%

## 学到了什么

- Framer Motion 的 keyframes 数组每段独立缓动，想要自然的呼吸感要用 \`repeatType: 'mirror'\`
- 设计里"疏密对比"比"均匀分布"更接近美

## 遇到的困难

- 深夜改 UI 会陷入像素强迫症，改十分钟看半小时

## 下周计划

- 开始读《Designing Data-Intensive Applications》第七章
- 给花园写第一篇正式的技术长文

## 一点心情

> 考完试的傍晚，悉尼冬天的太阳落得很早，但心里是亮的。`),

  make('note-move', '2026-06-15T15:00:00', 'note', 'C++ 移动语义笔记：从 std::move 到完美转发',
    ['C++', 'Notes'], '#60A5FA',
`## 核心概念

\`std::move\` 不移动任何东西——它只是一次到右值引用的 cast，真正的"移动"发生在移动构造/移动赋值函数里。

## 关键点

- 右值引用 \`T&&\` 延长临时对象的生命周期，并允许"偷走"它的资源
- 被移动后的对象处于 *valid but unspecified* 状态，只能析构或重新赋值
- 万能引用（forwarding reference）只出现在 \`template <typename T> void f(T&&)\` 且 T 需要推导时

## 代码 / 示例

\`\`\`cpp
template <typename T, typename... Args>
std::unique_ptr<T> make(Args&&... args) {
    return std::unique_ptr<T>(new T(std::forward<Args>(args)...));
}
\`\`\`

## 我的理解

移动语义的本质是**所有权的转移仪式**：编译器要的不是魔法，而是你明确说出"这个资源我不要了"。

## 延伸与疑问

- NRVO 什么时候会让手写的 \`std::move\` 反而变成负优化？`),

  make('growth-19', '2026-05-30T23:10:00', 'growth', '十九岁的一次小结',
    ['Growth'], '#A7F3D0',
`## 此刻的我

十九岁，在悉尼，是个大二的 CS 学生。会写一点 C++，在学着让 AI agent 替我干活，手机里循环着 ryo 的歌。

## 一个微小的进步

以前我羞于把半成品拿给别人看，现在我学会了在 README 里坦然写下 "work in progress"。完成比完美重要，公开比藏着成长快。

## 想对未来的自己说

> 愿你还记得为什么给这个站取名 Oasis——不是为了向谁证明什么，而是想在沙漠一样的互联网里，留一小片有水的地方。`),

  make('project-oasis', '2026-05-12T20:00:00', 'project', 'Oasis 重构复盘：把仪表盘改回花园',
    ['UI/UX', 'React'], '#A78BFA',
`## 目标与背景

Oasis 第一版的主界面越做越像后台管理系统：左边一张名片卡，右边三排筛选控件。功能都在，但"疗愈感"没了。这次重构的目标只有一句话：**让界面回到花园的隐喻里**。

## 方案与取舍

- 左栏去容器化：删掉卡片外壳，用两团呼吸柔光锚定视觉 —— 光比边框更温柔
- 三排控件收成一条"目录线"：筛选变纯文字，搜索收成图标，标签做成抽屉
- 放弃了"个人信息横向报头"方案：滚动后身份会消失，陪伴感不如常驻左栏

## 踩过的坑

- Framer Motion 的多段 keyframes 会在每个关键帧处减速归零，浮动动画显得僵硬
- \`AnimatePresence\` 里嵌套条件渲染时，退场动画的 key 一定要稳定

## 复盘与下一步

设计上最大的收获：**做减法比做加法难，但每一次减法都让主题更清晰**。下一步想给阅读舱加目录侧栏。`),
];
