// ✉️ 邻家尺牍：友链配置。一位邻居一封信（尺牍页把它画成信封与八行笺，见 components/lights/）。
// 加一位邻居 = 加一条记录；color 是这封信的笺色，建议从 lib/aura.ts 的 AURA 七色环取（樱粉/暖橙/鹅黄/薄荷/初音绿/天蓝/藤紫）。
// 「虚席以待」的空信封是页面自带的，不用在这里占位。
export interface FriendLink {
  name: string;
  url: string;
  /** 邻居自己的一句话：写在信上「见字如面」之后 */
  desc: string;
  /** 还想多说的几句：接在 desc 后面，一句一行（八行笺空着的行最多四行） */
  lines?: string[];
  color: string;
  /** 结邻那天（YYYY-MM-DD）：信末落款写成干支与节气，如「丙午寒露」；不填就落今天 */
  since?: string;
}

export const FRIENDS: FriendLink[] = [
  {
    name: "Evan Lin",
    url: "https://evanlin.site/",
    desc: "UNSW Builder",
    color: "#39C5BB",
    since: "2026-10-10",
  },
  {
    name: "hejiac",
    url: "https://hejiac.com",
    desc: "Made with curiosity.",
    lines: ["你如何留下春天？", "过一个美好的春天。"],
    color: "#7DD3FC",
    since: "2026-10-24",
  },
  // {
  //   name: "Moonlit Terminal",
  //   url: "https://example.net",
  //   desc: "深夜里亮着的一块屏幕",
  //   color: "#A78BFA",
  // },
];
