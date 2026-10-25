// 🍃 风钟：全站同一阵风。樱瓣的飘、尺牍的竹影与封舌与烛、园图的浮尘都读这里——
//   从尺牍切去花园，风不断；尺牍里竹影摇得最狠的那一下，花园里的樱瓣也正被吹偏。
//   按页面时钟（performance.now）走，不进 React；纯函数，谁读都是同一个值。

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

/** 阵风 0–1：两个慢周期相乘，大多数时候很轻，十几秒到一分钟来一阵（尺牍原先竹影的那条） */
export const gust = (t = now()) => (Math.sin(t * 0.37) * 0.5 + 0.5) * (Math.sin(t * 0.11 + 1) * 0.5 + 0.5);

/** 呼吸：带方向的慢风，约 −0.25…0.25（樱瓣原先的那条，正为往右） */
export const breath = (t = now()) => Math.sin(t * 0.1) * 0.15 + Math.sin(t * 0.23 + 2) * 0.1;
