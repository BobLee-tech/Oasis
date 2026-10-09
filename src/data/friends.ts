// 🏮 邻家灯火：友链配置。
// 加一位邻居 = 加一条记录；color 建议从 lib/aura.ts 的 AURA 七色环取（樱粉/暖橙/鹅黄/薄荷/初音绿/天蓝/藤紫）。
export interface FriendLink {
  name: string;
  url: string;
  desc: string;
  color: string;
}

// ⚠️ 以下为占位示例，请替换为真实的邻居们；数组为空时整个「邻家灯火」小节自动隐藏
export const FRIENDS: FriendLink[] = [
  {
    name: "Evan Lin",
    url: "https://evanlin.site/",
    desc: "UNSW Builder",
    color: "#39C5BB",
  },
  {
    name: "Waiting for you",
    url: "https://example.org",
    desc: "等一阵风，也在等你",
    color: "#FFB7C5",
  },
  // {
  //   name: "Moonlit Terminal",
  //   url: "https://example.net",
  //   desc: "深夜里亮着的一块屏幕",
  //   color: "#A78BFA",
  // },
];
