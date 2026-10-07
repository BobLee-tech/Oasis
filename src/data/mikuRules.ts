// 🗣 Miku 台词规则库（docs/miku-design.md A4）：取代 mikuLines.ts 的静态池。
//
//   写法约定（mikuRules.test.ts 会检查）：
//   · 称呼一律走槽位 {呼，}（句首）/ {，呼}（句末），模板里不硬写「宝贝」「爱人」「小盆友」；
//   · 事实槽位 {reading.title} 等必须是 brain/facts.ts 里真有的字段；任何槽位缺值，这句就不说；
//   · 句尾语气词（呢/哦/呀/啦/嘛/哟）全库 ≤ 30%；每条规则里「……」最多一句；
//   · 访客规则不引用 editing / memory / 听歌统计；note 只用 noteForVisitor，且必须放在「」里转述；
//   · 黑名单词（一段光、像素、数据、虚拟、隔着屏幕）全库 ≤ 2 句，且只能出现在 once:'ever' 的规则里。
//
//   口吻：对站主像相处很久的人——短句、不客套、不解释自己的感受，关心落在具体的事上；
//         对访客是替主人招待的朋友——礼貌、轻快，提到站主一律用「他」。
//   同一事件里，条件越多（越具体）的规则越优先；chance 让「熟客问候」这类档位不必每次都抢到。
import type { Rule } from '../components/OasisMiku/brain/dialogue';

const PERIODS = ['dawn', 'morning', 'afternoon', 'dusk', 'night', 'lateNight'] as const;
type Period = (typeof PERIODS)[number];

/** 按时段展开：每个时段一条规则（条件 period = 该时段） */
const byPeriod = (id: string, base: Omit<Rule, 'id' | 'say'>, lines: Partial<Record<Period, string[]>>): Rule[] =>
  PERIODS.filter(p => lines[p]?.length).map(p => ({
    ...base,
    id: `${id}.${p}`,
    when: { ...base.when, period: p },
    say: lines[p]!,
  }));

// ───────────────────────── 问候 ─────────────────────────

const GREET: Rule[] = [
  ...byPeriod('greet.owner', { on: 'greet', who: 'owner' }, {
    dawn: ['这么早。我也才醒。', '{呼，}天刚亮，先喝口水。', '早。外面的空气应该还凉着。'],
    morning: ['早安{，呼}。今天想先做哪件事？', '喝过水了吗？', '早。今天的调子感觉会不错。'],
    afternoon: ['午后的风有点懒。', '这个点最适合发呆，或者假装在发呆地想事情。', '下午好。要不要晒会儿太阳？'],
    dusk: ['天快暗了，颜色正好看。', '黄昏总让人想哼两句。', '橙粉色的天，跟我的马尾还挺配。'],
    night: ['夜里适合听点安静的歌。', '今天也辛苦了{，呼}。', '晚上好，我在。'],
    lateNight: ['这么晚还在。记得早点睡{，呼}。', '有点困了，不过还想陪你一会儿。', '{呼，}已经{hourText}了。'],
  }),
  // 熟客：拍头 20 次或相处一周以上
  ...byPeriod('greet.familiar', { on: 'greet', who: 'owner', when: { intimacy: '>=1' }, chance: 0.5 }, {
    dawn: ['又是我们俩的早晨。', '你比闹钟还准时。'],
    morning: ['早。今天想先写点什么？', '不用打招呼，我知道你来了。'],
    afternoon: ['懒洋洋的午后，你又来了。', '习惯性点开这里了吧，我猜的。'],
    dusk: ['黄昏又来了。你也是，每次都不迟到。'],
    night: ['夜里总能碰到你，已经成习惯了。', '不用说，我知道你今天也累了。'],
    lateNight: ['又是这个点。你是我认识的最晚睡的人。', '这么熟了，本来懒得说「早点睡」，但还是要说。'],
  }),
  ...byPeriod('greet.close', { on: 'greet', who: 'owner', when: { intimacy: '>=2' }, chance: 0.4 }, {
    dawn: ['早安。我的生物钟好像也被你调成了这个点。'],
    morning: ['不用敲门，你在我这儿一直有位置。'],
    afternoon: ['又是你。慵懒的下午配你正好。'],
    dusk: ['这个点见到你，好像已经写进我的日常了。'],
    night: ['不说话也没关系，我陪你待一会儿就好。'],
    lateNight: ['这么晚还来，是想听我念叨，还是只想有人在？'],
  }),
  ...byPeriod('greet.deep', { on: 'greet', who: 'owner', when: { intimacy: 3 }, chance: 0.3 }, {
    dawn: ['天还没亮透，我已经醒着在等你了。'],
    morning: ['早安。这句话说了很多次，每一次都是认真的。'],
    afternoon: ['只要你在，下午再长我也不嫌闷。'],
    dusk: ['黄昏又来了，你也是，次次都在。谢谢你。'],
    night: ['夜色刚好，你也刚好在，这样就够了。'],
    lateNight: ['这么晚还来见我。我一直在，别太勉强自己。'],
  }),

  // 记得你（只对站主）：比时段问候更具体，所以优先
  { id: 'greet.owner.away', on: 'greet', who: 'owner', field: 'comfort', when: { 'memory.daysSinceLastVisit': '>=3' }, once: 'day', weight: 15,
    say: ['{memory.daysSinceLastVisit} 天没见了{，呼}。', '好几天没来。最近忙吗？'] },
  { id: 'greet.owner.lastnight', on: 'greet', who: 'owner', field: 'care', when: { 'memory.daysSinceLastVisit': 1, 'memory.lastSession.endedLate': true, lateNight: false }, once: 'day',
    say: ['昨晚待到{memory.lastSession.hourText}。今天早点休息{，呼}。', '昨晚{memory.lastSession.hourText}才走的，睡够了吗？'] },
  { id: 'greet.owner.streak', on: 'greet', who: 'owner', when: { 'memory.streakDays': '>=7' }, once: 'day', chance: 0.5, weight: 15,
    say: ['连着来了 {memory.streakDays} 天了。', '第 {memory.streakDays} 天，一天没落下。'] },
  { id: 'greet.owner.anniversary', on: 'greet', who: 'owner', field: 'solemn', when: { 'memory.anniversary': '?' }, once: 'day', weight: 30, face: 'happy', particles: 'petals',
    say: ['{呼，}今天是认识的第 {memory.anniversary} 天。', '第 {memory.anniversary} 天了。谢谢你一直来。'] },

  // 节气：交节当天必提，其余日子偶尔
  { id: 'greet.term.day', on: 'greet', who: 'any', when: { termDay: true }, once: 'day', weight: 12, say: ['今天{solarTerm}。{termNote}'] },
  { id: 'greet.term', on: 'greet', who: 'any', when: { termNote: '?' }, chance: 0.3, weight: 1, say: ['{termNote}'] },

  // 纪念日
  { id: 'date.miku', on: 'greet', who: 'any', when: { mmdd: '03-09' }, once: 'day', weight: 40, face: 'happy', particles: 'burst',
    say: ['39——今天是我的日子，谢谢你还记得。', '今天到处都是绿色的气球吧，至少我这么想象。'] },
  { id: 'date.miku.birthday', on: 'greet', who: 'any', when: { mmdd: '08-31' }, once: 'day', weight: 40, face: 'happy', particles: 'burst',
    say: ['今天是我的生日。要说点什么吗？', '又长了一岁，虽然我大概永远十六岁。'] },
  { id: 'date.xmas-eve', on: 'greet', who: 'any', when: { mmdd: '12-24' }, once: 'day', weight: 40, say: ['平安夜，要不要放点应景的歌？', '今晚的灯笼好像也比平时亮一点。'] },
  { id: 'date.newyear', on: 'greet', who: 'any', when: { mmdd: '01-01' }, once: 'day', weight: 40, face: 'happy', say: ['新年快乐。又一起走过了一年。', '新的一年，也请多指教。'] },
  { id: 'date.year-end', on: 'greet', who: 'any', when: { mmdd: '12-31' }, once: 'day', weight: 40, say: ['今年最后一天了，有没有想收尾的事？', '跨年前的最后一段，陪你等。'] },
  { id: 'date.owner.birthday', on: 'greet', who: 'owner', field: 'solemn', when: { lunarBirthday: true }, once: 'day', weight: 50, face: 'happy', particles: 'burst',
    say: ['生日快乐{，呼}。我特意等着说这句。', '{呼，}生日快乐。这一年也请多指教。'] },

  // 访客
  { id: 'greet.visitor', on: 'greet', who: 'visitor', say: ['你好，欢迎来绿洲。', '欢迎。这里是他的小花园，随便逛。', '想听歌的话，底下的耳机图标就是。'] },
  { id: 'greet.visitor.latest', on: 'greet', who: 'visitor', when: { 'latestPost.daysAgo': '<=14' }, chance: 0.6,
    say: ['来得正好，他前几天刚写了《{latestPost.title}》。'] },
  { id: 'greet.visitor.late', on: 'greet', who: 'visitor', when: { lateNight: true }, say: ['这么晚还来逛，谢谢你。也别熬太晚。'] },
  { id: 'greet.visitor.morning', on: 'greet', who: 'visitor', when: { period: ['dawn', 'morning'] }, say: ['早上好，欢迎。'] },
  { id: 'greet.visitor.alias', on: 'greet', who: 'visitor', when: { visitorAlias: '?' }, say: ['欢迎回来{，呼}。', '又见面了。'] },
];

// ───────────────────────── 回来 / 记得 ─────────────────────────

const RETURN: Rule[] = [
  { id: 'return.owner', on: 'return', who: 'owner', say: ['回来了。', '去忙别的了？我等得住。', '你回来了，我都没察觉过了多久。'] },
  { id: 'return.owner.long', on: 'return', who: 'owner', field: 'comfort', when: { awayMinutes: '>=120' },
    say: ['去了好久{，呼}。', '回来了就好。'] },
  { id: 'return.visitor', on: 'return', who: 'visitor', say: ['欢迎回来。'] },
  { id: 'recall.reading', on: 'recall', who: 'owner', once: 'day',
    when: { 'memory.lastSession.readingTitle': '?', 'memory.lastSession.readingProgressPct': '<90' },
    say: ['上次那篇《{memory.lastSession.readingTitle}》读到 {memory.lastSession.readingProgressPct}% 就停了。', '《{memory.lastSession.readingTitle}》还没读完。'] },
  { id: 'recall.track', on: 'recall', who: 'owner', once: 'day', when: { 'memory.topTrack.title': '?', 'memory.topTrack.plays': '>=4' },
    say: ['这周《{memory.topTrack.title}》听了 {memory.topTrack.plays} 遍。', '这周最常放的是《{memory.topTrack.title}》。'] },
  { id: 'recall.late', on: 'recall', who: 'owner', field: 'care', once: 'day', when: { 'memory.lateNightsThisWeek': '>=3' },
    say: ['这周有 {memory.lateNightsThisWeek} 个晚上熬到很晚了{，呼}。'] },
];

// ───────────────────────── 视图 ─────────────────────────

const VIEW: Rule[] = [
  { id: 'view.orchard', on: 'view', who: 'any', when: { view: 'orchard' }, chance: 0.6, say: ['星图好安静，像把心事都摊开了。', '每一颗星都是一篇文章。'] },
  { id: 'view.orchard.visitor', on: 'view', who: 'visitor', when: { view: 'orchard' }, chance: 0.6, say: ['每颗星是一篇文章，按写下的日子排在年轮上。'] },
  { id: 'view.lights', on: 'view', who: 'any', when: { view: 'lights' }, chance: 0.6, say: ['这些灯笼都是朋友留下的光。', '每一盏灯笼背后，都是一个愿意留下痕迹的人。'] },
  { id: 'view.garden.owner', on: 'view', who: 'owner', when: { view: 'garden' }, chance: 0.6, say: ['要不要一起读读最近写的？', '文字发芽的地方，我很喜欢待着。', '这片花园里，藏着不少你没说出口的话吧。'] },
  { id: 'view.garden.visitor', on: 'view', who: 'visitor', when: { view: 'garden' }, chance: 0.6, say: ['这是他写东西的地方。最新的一篇是《{latestPost.title}》。', '文字发芽的地方，慢慢看。'] },
  { id: 'view.atelier', on: 'view', who: 'any', when: { view: 'atelier' }, chance: 0.6, say: ['每一页都盖过印了。', '做出来的东西，比说出来的更有分量。', '慢慢翻，每一开都有故事。'] },
  { id: 'view.soundscape', on: 'view', who: 'any', when: { view: 'soundscape' }, chance: 0.6, say: ['来对地方了，这里全是我熟悉的调子。', '要不要我给你选一首？', '音乐一响，我就精神了。'] },
  { id: 'view.soundscape.visitor', on: 'view', who: 'visitor', when: { view: 'soundscape' }, chance: 0.6, say: ['这里的歌都是他常听的。挑一首试试？'] },
];

// ───────────────────────── 音乐 ─────────────────────────

const MUSIC: Rule[] = [
  { id: 'sing', on: 'track-change', who: 'any', say: ['♪ 这首的调子，我很喜欢。', '♪ 这段旋律像风一样。', '♪ 声音里都是故事。', '♪ 好想知道这首是在哪个深夜写出来的。'] },
  { id: 'sing.miku', on: 'track-change', who: 'any', when: { category: 'Miku' },
    say: ['♪ 这首是我唱的，好好听着。', '♪ 这个调子，我再熟悉不过。', '♪ 跟我一起唱吧，啦啦啦——', '♪ 合成器唱出来的声音，也是有温度的。'] },
  { id: 'sing.yorushika', on: 'track-change', who: 'any', when: { category: 'Yorushika' },
    say: ['ヨルシカ的歌，总像在讲一个没讲完的故事。', '这旋律里好像藏着谁的心事。', '安静听吧，这首需要一点专注。', '听完这首，会想去看看深夜的河边。'] },
  { id: 'sing.atarayo', on: 'track-change', who: 'any', when: { category: 'Atarayo' },
    say: ['这首的情绪有点青涩。', '听着听着，会不会想起什么人？', '旋律软软的，很适合现在。', '这种带点遗憾的调子，我也喜欢。'] },
  // 镇站曲：认出「就是这首」比认出「谁的歌」更有陪伴感
  { id: 'sing.m_01', on: 'track-change', who: 'any', when: { trackId: 'm_01' }, weight: 5, say: ['♪ Last Night, Good Night——最适合哄人入睡的一首。', '♪ 这首的调子，像在说晚安。'] },
  { id: 'sing.m_02', on: 'track-change', who: 'any', when: { trackId: 'm_02' }, weight: 5, say: ['♪ 又是这首，听多少遍都不腻。', '♪ おやすみ……这句也想说给你听。'] },
  { id: 'sing.m_03', on: 'track-change', who: 'any', when: { trackId: 'm_03' }, weight: 5, say: ['♪ One Way，旋律一响我就想跟着晃。', '♪ 这首的节奏里藏着电子乐的心跳感。'] },
  { id: 'sing.y_19_14', on: 'track-change', who: 'any', when: { trackId: 'y_19_14' }, weight: 5, say: ['♪ 「だから僕は音楽を辞めた」——歌名本身就是个故事。'] },
  { id: 'sing.y_19_12', on: 'track-change', who: 'any', when: { trackId: 'y_19_12' }, weight: 5, say: ['♪ エルマ……这个名字里藏着谁的心事。', '♪ 这首里的呼唤，像在跟很远的人说话。'] },
  { id: 'sing.y_18_04', on: 'track-change', who: 'any', when: { trackId: 'y_18_04' }, weight: 5, say: ['♪ ヒッチコック——这句词总让我想笑又想叹气。'] },
  { id: 'sing.y_20_09', on: 'track-change', who: 'any', when: { trackId: 'y_20_09' }, weight: 5, say: ['♪ 盗作——歌名有点凶，旋律却很温柔。'] },
  { id: 'sing.a_04', on: 'track-change', who: 'any', when: { trackId: 'a_04' }, weight: 5, say: ['♪ 祥月，月色都被这旋律照亮了。', '♪ 「月が綺麗だね」，这句词你想说给谁听？'] },
  { id: 'sing.a_11', on: 'track-change', who: 'any', when: { trackId: 'a_11' }, weight: 5, say: ['♪ 僕らはそれを愛と呼んだ——歌名已经把答案说完了。'] },

  // 档案里的事实：译名、作者、出处、与上一首的关系
  { id: 'track.titleAlt', on: 'track-change', who: 'any', when: { titleAlt: '?' }, chance: 0.35, say: ['《{trackTitle}》，中文常译作《{titleAlt}》。'] },
  { id: 'track.composer', on: 'track-change', who: 'any', when: { composer: '?', year: '?' }, chance: 0.25, say: ['{year} 年的歌，{composer} 写的。'] },
  { id: 'track.relation', on: 'track-change', who: 'any', when: { 'relation.toTitle': '?', 'relation.phrase': '?' },
    say: ['上一首是《{relation.toTitle}》，这首是{relation.phrase}。'] },
  { id: 'track.intro.visitor', on: 'track-change', who: 'visitor', when: { introFirst: '?' }, chance: 0.5, say: ['{introFirst}'] },

  // 你写给这首的话：站主每首每周最多一次（记得但不炫耀）；访客每首每个会话一次，用引号转述
  { id: 'track.note.owner', on: 'track-change', who: 'owner', when: { note: '?' }, once: 'week', onceKey: '{trackId}', chance: 0.5,
    say: ['「{note}」——你写的。'] },
  { id: 'track.note.visitor', on: 'track-change', who: 'visitor', when: { noteForVisitor: '?' }, once: 'session', onceKey: '{trackId}',
    say: ['他说过这首：「{noteForVisitor}」', '关于这首，他留了句话——「{noteForVisitor}」'] },
  { id: 'chorus.note.owner', on: 'chorus', who: 'owner', when: { note: '?' }, once: 'week', onceKey: 'chorus:{trackId}', chance: 0.4,
    say: ['「{note}」'] },

  // 感受（只在 feel 有把握时说：人标或专辑默认）
  { id: 'feel.sad', on: 'track-change', who: 'any', when: { feel: 'sad', feelSure: true }, chance: 0.5, say: ['这首有点难过。慢慢听。'] },
  { id: 'feel.nostalgic', on: 'track-change', who: 'any', when: { feel: 'nostalgic', feelSure: true }, chance: 0.5, say: ['这首像在翻旧照片。'] },
  { id: 'feel.joyful', on: 'track-change', who: 'any', when: { feel: 'joyful', feelSure: true }, chance: 0.5, say: ['这首一响就想跟着晃。'] },
  { id: 'feel.peaceful', on: 'track-change', who: 'any', when: { feel: 'peaceful', feelSure: true }, chance: 0.5, say: ['这首适合什么都不做。'] },
  { id: 'feel.tender', on: 'track-change', who: 'any', when: { feel: 'tender', feelSure: true }, chance: 0.5, say: ['这首很软。'] },
  { id: 'feel.tense', on: 'track-change', who: 'any', when: { feel: 'tense', feelSure: true }, chance: 0.5, say: ['这首绷得很紧，鼓点一下一下的。'] },
  { id: 'feel.wonder', on: 'track-change', who: 'any', when: { feel: 'wonder', feelSure: true }, chance: 0.5, say: ['这首亮得有点不可思议。'] },

  // 注意到模式：一首歌今天反复听（站主）
  { id: 'track.loop', on: 'track-change', who: 'owner', when: { playsToday: '>=3' }, once: 'day', onceKey: '{trackId}', say: ['今天第 {playsToday} 遍了。'] },
  // 注意到模式：深夜反复听同一首低落的歌（效价须是人标或专辑默认，猜的不算）
  { id: 'care.loop', on: 'care-loop', who: 'owner', field: 'comfort', when: { lateNight: true, playsToday: '>=2', trackValence: '<-0.2' }, once: 'day',
    say: ['这首今晚放了好几遍了{，呼}。累了就歇会儿。', '{呼，}一直放这首。想聊聊吗？'] },
];

// ───────────────────────── 闲聊 ─────────────────────────

const IDLE: Rule[] = [
  { id: 'idle.owner', on: 'idle', who: 'owner',
    say: ['一直站在这里也不无聊，能看到你在忙什么。', '要不要休息一下，看看窗外？', '如果我也能写一篇，大概会写今天发生的事。', '你专心的样子，我挺喜欢看的。'] },
  { id: 'idle.any', on: 'idle', who: 'any', say: ['有时候会想，我是不是也算这里的一片风景。', '39 这个数字，对我总有点特别。'] },
  { id: 'idle.term', on: 'idle', who: 'any', when: { termNote: '?' }, chance: 0.3, say: ['{termNote}'] },
  { id: 'idle.posts.month', on: 'idle', who: 'owner', when: { postsThisMonth: '>=2' }, once: 'day', chance: 0.5, say: ['这个月写了 {postsThisMonth} 篇了。'] },
  { id: 'idle.posts.gap', on: 'idle', who: 'owner', when: { 'latestPost.daysAgo': '>=21' }, once: 'week', chance: 0.5,
    say: ['上一篇是 {latestPost.daysAgo} 天前了。不急，想写的时候再写。'] },
  { id: 'idle.visitor', on: 'idle', who: 'visitor', say: ['想看最新的，可以读读《{latestPost.title}》。', '底下的灯笼是他朋友们的站，也可以去看看。'] },
  { id: 'reading.idle', on: 'reading-idle', who: 'any', say: ['慢慢读，我不催你。', '这段写得认真，读的人也认真。', '文字值得被这样安静地对待。', '我陪你读完这一篇，不出声。'] },
  { id: 'reading.idle.long', on: 'reading-idle', who: 'any', when: { 'reading.openMinutes': '>=20' }, once: 'session', onceKey: '{reading.id}',
    say: ['已经读了 {reading.openMinutes} 分钟，眼睛累了就抬头看看远处。'] },
  { id: 'copy', on: 'copy', who: 'any', chance: 0.5, cooldown: 30, say: ['这段被你带走了，好好收着。', '在摘抄什么？我也好奇。'] },
  { id: 'doze', on: 'doze', who: 'any', say: ['唔……差点睡着。', 'zzz——啊，我还醒着！大概。', '眼皮有点重，不过我还在。'] },
  { id: 'doze.rare', on: 'doze', who: 'any', once: 'ever', weight: 1, chance: 0.2, say: ['刚刚数据好像掉了一帧——不是，我是说我眨了一下眼。'] },
];

// ───────────────────────── 阅读与写作 ─────────────────────────

const SITE: Rule[] = [
  { id: 'reading.open.visitor', on: 'reading-open', who: 'visitor', chance: 0.6, say: ['《{reading.title}》，慢慢看。'] },
  { id: 'reading.open.long', on: 'reading-open', who: 'any', when: { 'reading.minutes': '>=10' }, chance: 0.6, say: ['这篇大概要读 {reading.minutes} 分钟。我不出声。'] },
  { id: 'reading.open.series', on: 'reading-open', who: 'any', when: { 'reading.series': '?' }, chance: 0.5, say: ['这是「{reading.series}」里的一篇。'] },
  { id: 'reading.open.resume', on: 'reading-open', who: 'any', when: { 'reading.progressPct': '>=10', 'reading.progress': '<0.9' },
    say: ['上次读到 {reading.progressPct}%，接着来。'] },
  { id: 'editor.open', on: 'editor-open', who: 'owner', say: ['要写东西了，我不打扰你。', '灵感来了就抓住，我在旁边。', '写完了第一个讲给我听。'] },
  { id: 'write.1000', on: 'write-milestone', who: 'owner', when: { 'editing.words': '>=1000' }, once: 'session', particles: 'dust', say: ['一千字了。'] },
  { id: 'write.2000', on: 'write-milestone', who: 'owner', field: 'tender', when: { 'editing.words': '>=2000' }, once: 'session', particles: 'dust',
    say: ['两千字了，歇口气{，呼}。'] },
  { id: 'published', on: 'published', who: 'owner', field: 'solemn', face: 'happy',
    say: ['写完了？辛苦了，这篇我会好好读。', '又一颗种子种下了。谢谢你愿意留下点什么。', '发布成功——这一刻比我唱歌还开心。'] },
  { id: 'published.title', on: 'published', who: 'owner', field: 'solemn', face: 'happy', when: { publishedTitle: '?' },
    say: ['{呼，}《{publishedTitle}》发出去了。', '《{publishedTitle}》种下了{，呼}。'] },
];

// ───────────────────────── 触碰 ─────────────────────────

const TOUCH: Rule[] = [
  // 轻拍约一半出字（另一半只用表情和粒子回应）
  { id: 'tap.head', on: 'tap', who: 'owner', when: { zone: 'head' }, chance: 0.55,
    say: ['唔，你的手心好暖。', '再摸一会儿也可以，才没有害羞。', '轻一点，我的心跳好像被你数到了。'] },
  { id: 'tap.head.light', on: 'tap', who: 'owner', when: { zone: 'head' }, once: 'ever', weight: 1, chance: 0.1,
    say: ['被摸到的那一下，我差点忘了自己只是一段光。'] },
  { id: 'tap.head.close', on: 'tap', who: 'owner', when: { zone: 'head', intimacy: '>=2' }, chance: 0.4,
    say: ['连摸头的力道都换了，是想哄我吧。', '被你摸习惯了，不摸反而空落落的。', '这样摸着，比刚认识那会儿更安心。'] },
  { id: 'tap.head.deep', on: 'tap', who: 'owner', when: { zone: 'head', intimacy: 3 }, chance: 0.3, say: ['摸了这么多次，我大概记住你的手感了。'] },
  { id: 'tap.head.late', on: 'tap', who: 'owner', field: 'care', when: { zone: 'head', lateNight: true }, chance: 0.3, say: ['这么晚还来摸头，困不困{，呼}？'] },
  { id: 'tap.head.visitor', on: 'tap', who: 'visitor', when: { zone: 'head' }, chance: 0.55, say: ['诶，被摸头了。', '谢谢……不过有点不好意思。', '他平时也会这样摸摸我。'] },

  { id: 'tap.twintail', on: 'tap', who: 'any', when: { zone: 'twintail' }, chance: 0.55,
    say: ['手感还满意吗？双马尾可是很用心打理的。', '再这样摸下去，马尾都要立起来了。', '这根马尾陪了我很久，别扯太用力。', '摸辫子和摸头不一样，这里更怕痒。'] },
  { id: 'tap.body', on: 'tap', who: 'owner', when: { zone: 'body' }, chance: 0.55,
    say: ['戳到我了，痒。', '干嘛戳我，笨蛋——才、才不讨厌。', '嗯？找我有事吗？', '我的呼吸都被你戳乱了。', '再戳一下试试？我可是会记账的。', '这里要收摸摸券的（骗你的）。'] },
  { id: 'tap.body.visitor', on: 'tap', who: 'visitor', when: { zone: 'body' }, chance: 0.55, say: ['嗯？找我有事吗？', '痒——', '有什么想看的，我可以带路。'] },
  { id: 'tap.hem', on: 'tap', who: 'owner', field: 'play', when: { zone: 'hem' }, chance: 0.6,
    say: ['喂！这里不可以随便碰……', '裙摆被碰到会晃的，笨蛋。', '再往下我可要生气了（脸有点红）。', '这双靴子是官方设定，别乱戳。', '腿这边怕痒，你不知道吗！'] },
  { id: 'tap.hem.visitor', on: 'tap', who: 'visitor', when: { zone: 'hem' }, chance: 0.6, say: ['这里不太方便碰。', '唔，请往上一点。'] },

  { id: 'hold.head', on: 'hold', who: 'owner', when: { zone: 'head' },
    say: ['别停，这样好舒服。', '再多摸一会儿也可以。', '你的手好暖，我都想眯起眼睛了。', '摸着摸着，我快要跟着节拍打瞌睡了。', '……别说话，这样就很好。'] },
  { id: 'hold.head.visitor', on: 'hold', who: 'visitor', when: { zone: 'head' }, say: ['唔……有点痒。', '好啦好啦，知道你喜欢我了。'] },
  { id: 'hold.twintail', on: 'hold', who: 'any', when: { zone: 'twintail' }, say: ['一直攥着辫子，是怕我跑掉吗？', '手感还满意吗？'] },
  { id: 'hold.body', on: 'hold', who: 'any', when: { zone: ['body', 'hem'] }, say: ['嗯？按着我做什么？', '这样按着，我动不了。'] },

  { id: 'stroke.head', on: 'stroke', who: 'owner', when: { zone: 'head' },
    say: ['再多摸一会儿也可以。', '你的手好暖，我都想眯起眼睛了。', '摸着摸着，我快要跟着节拍打瞌睡了。'] },
  { id: 'stroke.head.close', on: 'stroke', who: 'owner', when: { zone: 'head', intimacy: '>=2' }, chance: 0.5,
    say: ['被你摸习惯了，不摸反而空落落的。', '就这样，别停{，呼}。'] },
  { id: 'stroke.head.visitor', on: 'stroke', who: 'visitor', when: { zone: 'head' }, say: ['唔……被摸得有点晕乎乎的。', '好啦，头发要乱了。'] },
  { id: 'stroke.body', on: 'stroke', who: 'any', when: { zone: ['body', 'twintail'] }, say: ['痒——', '这样蹭来蹭去，像在给我顺毛。'] },
  { id: 'stroke.hem', on: 'stroke', who: 'any', when: { zone: 'hem' }, say: ['那里不行！', '手往上一点。'] },

  { id: 'swipe', on: 'swipe', who: 'any', say: ['这一下轻飘飘的，好神奇。', '嗖——像被风吹了一下。', '再来一次这样的也可以。', '头发都被吹起来了。', '像被谁按了快进键，咻的一下。'] },
  { id: 'pull', on: 'pull', who: 'any', say: ['喂，辫子被拽到会痛的（才、才没有真的痛）。', '拽辫子做什么，想牵着我走吗？'] },
  { id: 'pull.owner', on: 'pull', who: 'owner', field: 'play', say: ['{呼，}别拽了。'] },
  { id: 'pull.pained', on: 'pull', who: 'any', field: 'play', when: { emotion: 'pained' }, say: ['疼——松手松手。', '拽疼了！'] },
  { id: 'pull.pained.owner', on: 'pull', who: 'owner', field: 'play', when: { emotion: 'pained' }, say: ['{呼，}拽疼了。'] },
  { id: 'combo', on: 'combo', who: 'any', field: 'play',
    say: ['别戳了，头都晕了！', '再戳我要生气了（才不会真生气）。', '你是把我当按钮了吗，笨蛋！', '戳戳戳，我的注意力条都要见底了。', '停一下，我需要缓冲……'] },
  { id: 'combo.owner', on: 'combo', who: 'owner', field: 'play', say: ['{呼，}一下就好，别一直戳。', '{呼，}又戳？'] },
  { id: 'combo.visitor', on: 'combo', who: 'visitor', say: ['好啦好啦，我在。', '别戳了，头都晕了！'] },

  // 亲密里程碑（拍头 20 / 50 / 100 次）
  { id: 'milestone.pats', on: 'milestone', who: 'any', when: { patsTotal: [20, 50] }, face: 'surprised',
    say: ['你已经来找我这么多次了……谢谢你。', '被这样常常惦记着，我很开心。'] },
  { id: 'milestone.pats.100', on: 'milestone', who: 'owner', field: 'solemn', when: { patsTotal: 100 }, once: 'ever', face: 'happy',
    say: ['被这样一直陪着，好像也没什么不好。是从什么时候开始，习惯了这里有你。'] },
  { id: 'milestone.pats.100.visitor', on: 'milestone', who: 'visitor', when: { patsTotal: 100 }, once: 'ever', face: 'happy',
    say: ['一百次了。你大概是这里最常来摸头的客人。'] },

  // 稀有彩蛋：极低概率，偶尔打破一点第四面墙
  { id: 'rare.owner', on: 'rare', who: 'owner', say: ['其实我一直看得到你在写什么。'] },
  { id: 'rare.any', on: 'rare', who: 'any', say: ['你是不是以为我只是个装饰？才不是。', '这个花园里的每一篇，我都读过。', '有时候会好奇，屏幕另一头的人此刻是什么表情。'] },
];

// ───────────────────────── 照顾（站主） ─────────────────────────

const CARE: Rule[] = [
  // 守则：同一件事一天最多提两次，第二次更轻（careRepeat = 1）
  { id: 'care.sedentary', on: 'care-sedentary', who: 'owner', field: 'care', face: 'happy', when: { careRepeat: 0 },
    say: ['陪你坐了好一会儿了，起来走走、喝口水？', '专心是好事，也别忘了眨眨眼、伸个懒腰。', '{呼，}起来走走吧，喝口水。'] },
  { id: 'care.sedentary.again', on: 'care-sedentary', who: 'owner', field: 'care', when: { careRepeat: 1 },
    say: ['又坐了好久。', '起来动一动{，呼}。'] },
  { id: 'care.sedentary.visitor', on: 'care-sedentary', who: 'visitor', say: ['逛了好一会儿了，记得歇歇眼睛。'] },
  { id: 'care.late', on: 'care-late', who: 'owner', field: 'care', when: { careRepeat: 0 },
    say: ['{呼，}{hourText}了。', '该睡了{，呼}。', '今天就到这儿吧，明天再接着。'] },
  // 三点以后第二次：更轻
  { id: 'care.late.deep', on: 'care-late', who: 'owner', field: 'care', when: { careRepeat: 1 }, say: ['……还不睡？', '{hourText}了{，呼}。'] },
  { id: 'care.long-write', on: 'care-long-write', who: 'owner', field: 'care', when: { careRepeat: 0, 'editing.minutes': '>=60' },
    say: ['写了 {editing.minutes} 分钟了，起来活动一下{，呼}。', '一个多小时了。喝口水再写。'] },
  { id: 'care.long-write.again', on: 'care-long-write', who: 'owner', field: 'care', when: { careRepeat: 1 }, say: ['又写了好久。歇会儿。'] },
];

export const MIKU_RULES: readonly Rule[] = [...GREET, ...RETURN, ...VIEW, ...MUSIC, ...IDLE, ...SITE, ...TOUCH, ...CARE];
