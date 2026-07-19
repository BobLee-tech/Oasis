// 🎐 Miku 台词库：与 quotes.ts 同款「分组好整理、取用合成一池」的写法。
//   规则是纯前端零成本的——按时段/节气/视图/曲目/亲密度挑一句，不做真对话，但足够有「在场感」。
import type { DayPeriod } from '../lib/timeContext';
import type { AppView } from '../types/auth';
import type { MusicCategory } from '../types/music';

export const MIKU_GREETINGS: Record<DayPeriod, string[]> = {
  dawn: ['这么早？我也才刚睁开眼睛。', '晨光里的绿洲，最适合轻声说早安。'],
  morning: ['早上好呀，今天也要元气满满哦！', '喝过水了吗？我在这陪你一会儿。'],
  afternoon: ['午后的风有点懒洋洋的，对吧。', '要不要一起晒会儿太阳？'],
  dusk: ['天要暗下来了，颜色好好看。', '黄昏总是让人想哼两句歌。'],
  night: ['夜色刚刚好，适合听点安静的歌。', '今晚也辛苦啦，我在这儿呢。'],
  lateNight: ['唔……有点困了，但还是想陪着你。', '这么晚还在呀，记得早点休息哦。'],
};

// 熟客问候：拍过她 20 次以上才会进这个池子，语气比初见更松弛、更像老朋友
export const MIKU_GREETINGS_FAMILIAR: Partial<Record<DayPeriod, string[]>> = {
  dawn: ['又是我们俩的早晨呀，习惯就好。'],
  morning: ['早，老熟人，今天想先写点什么？'],
  afternoon: ['懒洋洋的午后，你又来找我啦。'],
  dusk: ['黄昏又来了——你也是，每次都不迟到。'],
  night: ['夜里总能碰到你，这已经是习惯了呢。'],
  lateNight: ['又是这个点。你可真是我认识的最晚睡的人。'],
};

export const MIKU_TOUCH_HEAD_LINES = [
  '诶！被摸头会害羞的啦……',
  '唔嘿嘿，再摸一下也不是不可以。',
  '喜欢被这样摸摸头，谢谢你呀。',
];

// 长按摸头：不是碰一下就收手，是真的停留着——语气比轻拍更缠绵一点
export const MIKU_LONGPRESS_HEAD_LINES = [
  '别停呀……这样摸着，好舒服。',
  '嗯……再多摸一会儿也可以哦。',
  '你的手好暖，我都想眯起眼睛了。',
];

export const MIKU_TOUCH_BODY_LINES = [
  '哇，戳到我啦，痒痒的！',
  '干嘛戳我呀，笨蛋——才、才不讨厌呢。',
  '嗯？找我有什么事吗？',
];

// 滑动手势：一下带过的触碰，比点按更轻盈、更像风吹过
export const MIKU_FLICK_LINES = [
  '哇！这一下轻飘飘的，好神奇。',
  '嗖——感觉像被风吹了一下呢。',
  '再来一次这样的，也可以哦。',
];

// 通用哼唱台词：找不到对应歌手台词池时的兜底
export const MIKU_SING_LINES = [
  '♪ 这首歌的调子，我很喜欢。',
  '♪ 跟着一起唱吧，啦啦啦——',
  '♪ 这段旋律，好像风一样。',
  '♪ 声音里都是故事呢。',
];

// 按歌手（分类）分池：同样是哼唱，但认出「这首是谁的歌」比通用台词更有陪伴感
export const MIKU_SING_LINES_BY_ARTIST: Partial<Record<MusicCategory, string[]>> = {
  Miku: [
    '♪ 这首是我唱的哦，好好听着~',
    '♪ 这个调子，我最熟悉不过啦。',
    '♪ 跟着我一起唱吧，啦啦啦——',
  ],
  Yorushika: [
    'ヨルシカ的歌，总像在讲一个没讲完的故事。',
    '这旋律里，好像藏着谁的心事。',
    '安静听吧，这首歌需要一点点专注。',
  ],
  Atarayo: [
    '这首歌的情绪，有点青涩呢。',
    '听着听着，会不会想起什么人呀？',
    '旋律软软的，很适合现在这个时候。',
  ],
};

// 打瞌睡：深夜或听歌听到入神时才会触发，不是随机闭眼很久的 bug，是她真的困了
export const MIKU_DOZE_LINES = [
  '唔……差点睡着了。',
  'zzz……啊，我还醒着！大概。',
  '眼皮有点重，但我还在陪着你哦。',
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

// 更深一层的亲密度彩蛋：拍满 100 次才会解锁的一句
export const MIKU_UNLOCK_LINES_DEEP = [
  '……被这样一直陪着，好像也没什么不好呢。是从什么时候开始，习惯了这里有你。',
];

// 稀有彩蛋：极低概率触发，偶尔打破一点第四面墙
export const MIKU_RARE_LINES = [
  '其实……我一直都能看到你在写什么哦。',
  '你是不是以为我只是个装饰？才不是呢。',
  '这个花园里的每一篇文字，我都读过。',
];
