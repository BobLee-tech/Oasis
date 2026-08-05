// 🎨 情绪色板：全站唯一的取色来源，与 index.css 的 .oasis-accent-ink 配套使用。
//   七色环——樱粉 / 暖橙 / 鹅黄 / 薄荷 / 初音绿 / 天蓝 / 藤紫——覆盖文章、评论、友链、
//   分类的取色需求；新增取色 UI 一律从这里引用，而不是各处各写一份十六进制字面量。
export const AURA = {
  sakura: '#FFB7C5',
  amber: '#FDBA74',
  citrine: '#FDE047',
  mint: '#A7F3D0',
  teal: '#39C5BB',
  sky: '#60A5FA',
  violet: '#A78BFA',
} as const;

export const AURA_COLORS = Object.values(AURA);
