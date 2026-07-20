// 🌙 农历工具：只做「今天是不是某个农历日期」这一件事——用于站主生日这类跟着农历走、
//   每年对应的公历日期都会浮动的纪念日。借用浏览器 Intl 自带的中国农历日历，不引入数据表或依赖。
//   闰月会被标记成 "2bis" 这种形式，与目标月份精确字符串匹配即可天然排除闰月重复命中。
export const isLunarDate = (month: number, day: number, date: Date = new Date()): boolean => {
  const parts = new Intl.DateTimeFormat('en-u-ca-chinese', { month: 'numeric', day: 'numeric' }).formatToParts(date);
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return m === String(month) && d === String(day);
};
