// 🏮 邻家灯火：友链配置。
// 加一位邻居 = 加一条记录；color 建议从站内 aura 色板取：
// #FFB7C5 樱粉 / #FDBA74 暖橙 / #FDE047 鹅黄 / #A7F3D0 薄荷 / #39C5BB 初音绿 / #60A5FA 天蓝 / #A78BFA 藤紫
export interface FriendLink {
  name: string;
  url: string;
  desc: string;
  color: string;
}

// ⚠️ 以下为占位示例，请替换为真实的邻居们；数组为空时整个「邻家灯火」小节自动隐藏
export const FRIENDS: FriendLink[] = [
  {
    name: "A Quiet Garden",
    url: "https://example.com",
    desc: "一座还没有名字的花园",
    color: "#39C5BB",
  },
  {
    name: "Sakura Notes",
    url: "https://example.org",
    desc: "落樱与代码之间的随笔",
    color: "#FFB7C5",
  },
  {
    name: "Moonlit Terminal",
    url: "https://example.net",
    desc: "深夜里亮着的一块屏幕",
    color: "#A78BFA",
  },
];
