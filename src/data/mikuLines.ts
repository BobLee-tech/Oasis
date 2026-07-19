// 🎐 Miku 台词库：与 quotes.ts 同款「分组好整理、取用合成一池」的写法。
//   规则是纯前端零成本的——按时段/节气/视图/曲目挑一句，不做真对话，但足够有「在场感」。
import type { DayPeriod } from '../lib/timeContext';
import type { AppView } from '../types/auth';

export const MIKU_GREETINGS: Record<DayPeriod, string[]> = {
  dawn: ['这么早？我也才刚睁开眼睛。', '晨光里的绿洲，最适合轻声说早安。'],
  morning: ['早上好呀，今天也要元气满满哦！', '喝过水了吗？我在这陪你一会儿。'],
  afternoon: ['午后的风有点懒洋洋的，对吧。', '要不要一起晒会儿太阳？'],
  dusk: ['天要暗下来了，颜色好好看。', '黄昏总是让人想哼两句歌。'],
  night: ['夜色刚刚好，适合听点安静的歌。', '今晚也辛苦啦，我在这儿呢。'],
  lateNight: ['唔……有点困了，但还是想陪着你。', '这么晚还在呀，记得早点休息哦。'],
};

export const MIKU_TOUCH_HEAD_LINES = [
  '诶！被摸头会害羞的啦……',
  '唔嘿嘿，再摸一下也不是不可以。',
  '喜欢被这样摸摸头，谢谢你呀。',
];

export const MIKU_TOUCH_BODY_LINES = [
  '哇，戳到我啦，痒痒的！',
  '干嘛戳我呀，笨蛋——才、才不讨厌呢。',
  '嗯？找我有什么事吗？',
];

export const MIKU_SING_LINES = [
  '♪ 这首歌的调子，我很喜欢。',
  '♪ 跟着一起唱吧，啦啦啦——',
  '♪ 这段旋律，好像风一样。',
  '♪ 声音里都是故事呢。',
];

export const MIKU_VIEW_LINES: Partial<Record<AppView, string[]>> = {
  orchard: ['星图好安静，像是把心事都摊开了。', '每一颗星星都是一篇文章呢。'],
  lights: ['这些灯笼，都是朋友留下的光。', '友链的灯笼亮着，感觉很温暖。'],
  garden: ['要不要一起读读最近写的东西？', '文字发芽的地方，我很喜欢待着。'],
  atelier: ['画廊里的光线，刚刚好。', '每一幅画都藏着一点心情呢。'],
};

export const MIKU_UNLOCK_LINES = [
  '咦，你已经来找我这么多次了呀……谢谢你。',
  '被这样常常惦记着，我很开心哦。',
];
