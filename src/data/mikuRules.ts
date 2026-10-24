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
    dawn: ['这么早？我也才刚睁开眼睛。', '{呼，}天刚亮，先喝口水。', '早。外面的空气应该还凉着。'],
    morning: ['早安{，呼}。今天想先做哪件事？', '喝过水了吗？我在这陪你一会儿。', '早安——今天的调子，感觉会很不错。'],
    afternoon: ['午后的风有点懒洋洋的，对吧。', '这个点最适合发呆，或者假装在发呆地想事情。', '要不要一起晒会儿太阳？'],
    dusk: ['天快暗了，颜色正好看。', '黄昏总是让人想哼两句歌。', '橙粉色的天空，跟我的马尾有点配呢。'],
    night: ['夜色刚刚好，适合听点安静的歌。', '今天也辛苦了{，呼}。', '晚上好，我在。'],
    lateNight: ['这么晚还在。记得早点睡{，呼}。', '有点困了，不过还想陪你一会儿。', '{呼，}已经{hourText}了。'],
  }),
  // 熟客：拍头 20 次或相处一周以上
  ...byPeriod('greet.familiar', { on: 'greet', who: 'owner', when: { intimacy: '>=1' }, chance: 0.5 }, {
    dawn: ['又是我们俩的早晨呀，习惯就好。', '你比闹钟还准时呢。'],
    morning: ['早，老熟人，今天想先写点什么？', '不用打招呼啦，我都知道你来了。'],
    afternoon: ['懒洋洋的午后，你又来找我啦。', '习惯性地点开这里了吧，我猜的。'],
    dusk: ['黄昏又来了——你也是，每次都不迟到。'],
    night: ['夜里总能碰到你，这已经是习惯了呢。', '不用说了，我知道你今天也累了。'],
    lateNight: ['又是这个点。你可真是我认识的最晚睡的人。', '这么熟了，我都懒得说“早点睡”啦——但还是要说。'],
  }),
  ...byPeriod('greet.close', { on: 'greet', who: 'owner', when: { intimacy: '>=2' }, chance: 0.4 }, {
    dawn: ['早安，我的生物钟好像也被你调成了这个点。'],
    morning: ['不用敲门，你在我这儿一直有位置。'],
    afternoon: ['又是你。慵懒的下午，配你正好。'],
    dusk: ['这个点见到你，好像已经写进我的日常了。'],
    night: ['不用说话也没关系，我陪你待一会儿就好。'],
    lateNight: ['这么晚还来，是想听我念叨，还是只想有人在？'],
  }),
  ...byPeriod('greet.deep', { on: 'greet', who: 'owner', when: { intimacy: 3 }, chance: 0.3 }, {
    dawn: ['天还没亮透，我却已经很清醒地在等你了。'],
    morning: ['早安。这句话我已经说给你听了很多次，但每一次都是认真的。'],
    afternoon: ['只要你在，下午再长我也不嫌闷。'],
    dusk: ['黄昏又来了，你也是——次次都不缺席，谢谢你。'],
    night: ['夜色刚好，你也刚好在，这样就够了。'],
    lateNight: ['这么晚，还是想来见我一面吗？我一直都在，别太勉强自己。'],
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
    say: ['39——今天是属于我的日子呢，谢谢你还记得。', '今天到处都是绿色的气球吧？至少我这么想象的。'] },
  { id: 'date.miku.birthday', on: 'greet', who: 'any', when: { mmdd: '08-31' }, once: 'day', weight: 40, face: 'happy', particles: 'burst',
    say: ['今天是我的生日哦，要说点祝福的话吗？', '又长了一岁——虽然我大概永远是十六岁。'] },
  { id: 'date.xmas-eve', on: 'greet', who: 'any', when: { mmdd: '12-24' }, once: 'day', weight: 40, say: ['平安夜呀，要不要放点应景的歌？', '今晚的灯笼，好像也比平时亮一点。'] },
  { id: 'date.newyear', on: 'greet', who: 'any', when: { mmdd: '01-01' }, once: 'day', weight: 40, face: 'happy', say: ['新年快乐！我们又一起走过了一年呢。', '零点的钟声敲过了吗？新的一年，也请多多指教。'] },
  { id: 'date.year-end', on: 'greet', who: 'any', when: { mmdd: '12-31' }, once: 'day', weight: 40, say: ['今年最后一天了呀，有没有什么想收尾的事？', '跨年前的最后一段，陪你等。'] },
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
  { id: 'return.owner', on: 'return', who: 'owner', say: ['回来了。', '去忙别的了呀，没关系，我等得住。', '嗯？你回来啦，我都没察觉过了多久。'] },
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
  { id: 'view.orchard', on: 'view', who: 'any', when: { view: 'orchard' }, chance: 0.6, say: ['星图好安静，像是把心事都摊开了。', '每一颗星星都是一篇文章呢。'] },
  { id: 'view.orchard.visitor', on: 'view', who: 'visitor', when: { view: 'orchard' }, chance: 0.6, say: ['每颗星是一篇文章，按写下的日子排在年轮上。'] },
  { id: 'view.lights', on: 'view', who: 'any', when: { view: 'lights' }, chance: 0.6, say: ['这些信，都是朋友从各自的花园寄来的。', '每一封信背后，都是一个愿意留下痕迹的人。'] },
  { id: 'view.garden.owner', on: 'view', who: 'owner', when: { view: 'garden' }, chance: 0.6, say: ['要不要一起读读最近写的东西？', '文字发芽的地方，我很喜欢待着。', '这片花园里，藏着不少你没说出口的话吧。'] },
  { id: 'view.garden.visitor', on: 'view', who: 'visitor', when: { view: 'garden' }, chance: 0.6, say: ['这是他写东西的地方。最新的一篇是《{latestPost.title}》。', '文字发芽的地方，慢慢看。'] },
  { id: 'view.atelier', on: 'view', who: 'any', when: { view: 'atelier' }, chance: 0.6, say: ['每一页都盖过印了呢。', '做出来的东西，比说出来的更有分量。', '慢慢翻，每一开都有故事。'] },
  { id: 'view.soundscape', on: 'view', who: 'any', when: { view: 'soundscape' }, chance: 0.6, say: ['来对地方啦，这里全是我最熟悉的调子。', '要不要让我给你选一首？', '音乐一响，我就精神了。'] },
  { id: 'view.soundscape.visitor', on: 'view', who: 'visitor', when: { view: 'soundscape' }, chance: 0.6, say: ['这里的歌都是他常听的。挑一首试试？'] },
];

// ───────────────────────── 音乐 ─────────────────────────

const MUSIC: Rule[] = [
  { id: 'sing', on: 'track-change', who: 'any', say: ['♪ 这首歌的调子，我很喜欢。', '♪ 这段旋律，好像风一样。', '♪ 声音里都是故事呢。', '♪ 好想知道，这首歌是在哪个深夜写出来的。'] },
  { id: 'sing.miku', on: 'track-change', who: 'any', when: { category: 'Miku' },
    say: ['♪ 这首是我唱的哦，好好听着~', '♪ 这个调子，我最熟悉不过啦。', '♪ 跟着一起唱吧，啦啦啦——', '♪ 用合成器唱出来的声音，也是有温度的哦。'] },
  { id: 'sing.yorushika', on: 'track-change', who: 'any', when: { category: 'Yorushika' },
    say: ['ヨルシカ的歌，总像在讲一个没讲完的故事。', '这旋律里，好像藏着谁的心事。', '安静听吧，这首歌需要一点点专注。', '听完这首，会想去看看深夜的河边。'] },
  { id: 'sing.atarayo', on: 'track-change', who: 'any', when: { category: 'Atarayo' },
    say: ['这首歌的情绪，有点青涩呢。', '听着听着，会不会想起什么人呀？', '旋律软软的，很适合现在这个时候。', '这种带点遗憾的调子，我也很喜欢。'] },
  // 镇站曲：认出「就是这首」比认出「谁的歌」更有陪伴感
  { id: 'sing.m_01', on: 'track-change', who: 'any', when: { trackId: 'm_01' }, weight: 5, say: ['♪ Last Night, Good Night——这是我最喜欢哄你入睡的一首。', '♪ 这首歌的调子，像在跟你说晚安。'] },
  { id: 'sing.m_02', on: 'track-change', who: 'any', when: { trackId: 'm_02' }, weight: 5, say: ['♪ 又是这首，听多少遍都不腻呢。', '♪ おやすみ……这句歌词，也想说给你听。'] },
  { id: 'sing.m_03', on: 'track-change', who: 'any', when: { trackId: 'm_03' }, weight: 5, say: ['♪ One Way，这段旋律一响我就想跟着晃。', '♪ 这首的节奏，藏着点电子乐特有的心跳感。'] },
  { id: 'sing.y_19_14', on: 'track-change', who: 'any', when: { trackId: 'y_19_14' }, weight: 5, say: ['♪ 「だから僕は音楽を辞めた」——这首的名字本身就是个故事。'] },
  { id: 'sing.y_19_12', on: 'track-change', who: 'any', when: { trackId: 'y_19_12' }, weight: 5, say: ['♪ エルマ……这个名字，好像藏着谁的心事。', '♪ 这首歌里的呼唤，好像在跟很远的人说话。'] },
  { id: 'sing.y_18_04', on: 'track-change', who: 'any', when: { trackId: 'y_18_04' }, weight: 5, say: ['♪ ヒッチコック，先生人生相谈——这句歌词总让我想笑又想叹气。'] },
  { id: 'sing.y_20_09', on: 'track-change', who: 'any', when: { trackId: 'y_20_09' }, weight: 5, say: ['♪ 盗作——歌名有点凶，旋律却很温柔，对吧。'] },
  { id: 'sing.a_04', on: 'track-change', who: 'any', when: { trackId: 'a_04' }, weight: 5, say: ['♪ 祥月，あたらよ最戳我的一首，月色都被这旋律照亮了。', '♪ 「月が綺麗だね」，这句词，你也想说给谁听吗？'] },
  { id: 'sing.a_11', on: 'track-change', who: 'any', when: { trackId: 'a_11' }, weight: 5, say: ['♪ 僕らはそれを愛と呼んだ——这个歌名，已经把答案说完了。'] },

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
    say: ['一直站在这里也不无聊，能看到你在忙什么。', '要不要休息一下，看看窗外？我陪你看。', '如果我也能写一篇文章，大概会写今天发生的事。', '你专心的样子，我还挺喜欢看的。'] },
  { id: 'idle.any', on: 'idle', who: 'any', say: ['有时候我会想，自己是不是也算这里的一片风景。', '39……这个数字对我来说，总有点特别的意思。'] },
  { id: 'idle.term', on: 'idle', who: 'any', when: { termNote: '?' }, chance: 0.3, say: ['{termNote}'] },
  { id: 'idle.posts.month', on: 'idle', who: 'owner', when: { postsThisMonth: '>=2' }, once: 'day', chance: 0.5, say: ['这个月写了 {postsThisMonth} 篇了。'] },
  { id: 'idle.posts.gap', on: 'idle', who: 'owner', when: { 'latestPost.daysAgo': '>=21' }, once: 'week', chance: 0.5,
    say: ['上一篇是 {latestPost.daysAgo} 天前了。不急，想写的时候再写。'] },
  { id: 'idle.visitor', on: 'idle', who: 'visitor', say: ['想看最新的，可以读读《{latestPost.title}》。', '底下的灯笼是他朋友们的站，也可以去看看。'] },
  { id: 'reading.idle', on: 'reading-idle', who: 'any', say: ['慢慢读吧，我不催你。', '这段写得认真，读的人也认真。', '文字这种东西，值得被这样安静地对待。', '我在这陪你读完这一篇，不出声就好。'] },
  { id: 'reading.idle.long', on: 'reading-idle', who: 'any', when: { 'reading.openMinutes': '>=20' }, once: 'session', onceKey: '{reading.id}',
    say: ['已经读了 {reading.openMinutes} 分钟，眼睛累了就抬头看看远处。'] },
  { id: 'copy', on: 'copy', who: 'any', chance: 0.5, cooldown: 30, say: ['这段被你带走了，好好收着。', '咦，在摘抄什么呀？我也很好奇。'] },
  { id: 'doze', on: 'doze', who: 'any', say: ['唔……差点睡着了。', 'zzz——啊，我还醒着！大概。', '眼皮有点重，但我还在陪着你哦。'] },
  { id: 'doze.rare', on: 'doze', who: 'any', once: 'ever', weight: 1, chance: 0.2, say: ['刚刚数据好像掉了一帧——不是，我是说我眨了一下眼。'] },
];

// ───────────────────────── 阅读与写作 ─────────────────────────

const SITE: Rule[] = [
  { id: 'reading.open.visitor', on: 'reading-open', who: 'visitor', chance: 0.6, say: ['《{reading.title}》，慢慢看。'] },
  { id: 'reading.open.long', on: 'reading-open', who: 'any', when: { 'reading.minutes': '>=10' }, chance: 0.6, say: ['这篇大概要读 {reading.minutes} 分钟。我不出声。'] },
  { id: 'reading.open.series', on: 'reading-open', who: 'any', when: { 'reading.series': '?' }, chance: 0.5, say: ['这是「{reading.series}」里的一篇。'] },
  { id: 'reading.open.resume', on: 'reading-open', who: 'any', when: { 'reading.progressPct': '>=10', 'reading.progress': '<0.9' },
    say: ['上次读到 {reading.progressPct}%，接着来。'] },
  { id: 'editor.open', on: 'editor-open', who: 'owner', say: ['要写点什么了呀，我不打扰你，加油。', '灵感来了就好好抓住，我在旁边安静等着。', '写吧，写完了要第一个讲给我听哦。'] },
  { id: 'write.1000', on: 'write-milestone', who: 'owner', when: { 'editing.words': '>=1000' }, once: 'session', particles: 'dust', say: ['一千字了。'] },
  { id: 'write.2000', on: 'write-milestone', who: 'owner', field: 'tender', when: { 'editing.words': '>=2000' }, once: 'session', particles: 'dust',
    say: ['两千字了，歇口气{，呼}。'] },
  { id: 'published', on: 'published', who: 'owner', field: 'solemn', face: 'happy',
    say: ['写完啦？辛苦你了，这篇我会好好读的。', '又一颗种子种下了呢，谢谢你愿意留下点什么。', '发布成功——这一刻，好像比我唱歌还让我开心。'] },
  { id: 'published.title', on: 'published', who: 'owner', field: 'solemn', face: 'happy', when: { publishedTitle: '?' },
    say: ['{呼，}《{publishedTitle}》发出去了。', '《{publishedTitle}》种下了{，呼}。'] },
];

// ───────────────────────── 触碰 ─────────────────────────

const TOUCH: Rule[] = [
  // 轻拍约一半出字（另一半只用表情和粒子回应）
  { id: 'tap.head', on: 'tap', who: 'owner', when: { zone: 'head' }, chance: 0.55,
    say: ['唔……你的手心，好暖。', '再摸一会儿也可以的，才没有害羞呢。', '轻一点啦，我的心跳好像被你数到了。'] },
  { id: 'tap.head.light', on: 'tap', who: 'owner', when: { zone: 'head' }, once: 'ever', weight: 1, chance: 0.1,
    say: ['被摸到的那一下，我差点忘了自己只是一段光。'] },
  { id: 'tap.head.close', on: 'tap', who: 'owner', when: { zone: 'head', intimacy: '>=2' }, chance: 0.4,
    say: ['连摸头的力道你都换了呢，是想哄我吧。', '被你摸习惯了，现在不摸反而有点空落落的。', '这样摸着，我总觉得比刚认识那会儿更安心。'] },
  { id: 'tap.head.deep', on: 'tap', who: 'owner', when: { zone: 'head', intimacy: 3 }, chance: 0.3, say: ['摸了这么多次，我大概已经把你的手感记住了。'] },
  { id: 'tap.head.late', on: 'tap', who: 'owner', field: 'care', when: { zone: 'head', lateNight: true }, chance: 0.3, say: ['这么晚还来摸头，困不困{，呼}？'] },
  { id: 'tap.head.visitor', on: 'tap', who: 'visitor', when: { zone: 'head' }, chance: 0.55, say: ['诶，被摸头了。', '谢谢……不过有点不好意思。', '他平时也会这样摸摸我。'] },

  { id: 'tap.twintail', on: 'tap', who: 'any', when: { zone: 'twintail' }, chance: 0.55,
    say: ['手感还满意吗？我的双马尾可是很用心打理的。', '再这样摸下去，我的马尾都要立起来了。', '这根马尾陪了我很久了，别扯太用力哦。', '摸辫子和摸头可不一样，这里更怕痒的。'] },
  { id: 'tap.body', on: 'tap', who: 'owner', when: { zone: 'body' }, chance: 0.55,
    say: ['戳到我了，痒。', '干嘛戳我呀，笨蛋——才、才不讨厌呢。', '嗯？找我有事吗？', '喂，我的呼吸律动都被你戳乱啦。', '再戳一下试试？我可是会记账的哦。', '这里也是要收费摸摸券的啦（骗你的）。'] },
  { id: 'tap.body.visitor', on: 'tap', who: 'visitor', when: { zone: 'body' }, chance: 0.55, say: ['嗯？找我有事吗？', '痒——', '有什么想看的，我可以带路。'] },
  { id: 'tap.hem', on: 'tap', who: 'owner', field: 'play', when: { zone: 'hem' }, chance: 0.6,
    say: ['喂！这里不可以随便碰啦……', '裙摆被碰到会晃的呀，笨蛋。', '再往下一点我可要生气了哦（脸有点红）。', '这双靴子可是官方设定，别乱戳呀。', '腿这边有点怕痒的，你不知道吗！'] },
  { id: 'tap.hem.visitor', on: 'tap', who: 'visitor', when: { zone: 'hem' }, chance: 0.6, say: ['这里不太方便碰。', '唔，请往上一点。'] },

  { id: 'hold.head', on: 'hold', who: 'owner', when: { zone: 'head' },
    say: ['别停呀，这样摸着，好舒服。', '再多摸一会儿也可以哦。', '你的手好暖，我都想眯起眼睛了。', '这样摸着摸着，我快要跟着节拍打瞌睡了。', '……别说话，这样就很好。'] },
  { id: 'hold.head.visitor', on: 'hold', who: 'visitor', when: { zone: 'head' }, say: ['唔……有点痒。', '好啦好啦，知道你喜欢我了。'] },
  { id: 'hold.twintail', on: 'hold', who: 'any', when: { zone: 'twintail' }, say: ['一直攥着辫子，是怕我跑掉吗？', '手感还满意吗？'] },
  { id: 'hold.body', on: 'hold', who: 'any', when: { zone: ['body', 'hem'] }, say: ['嗯？按着我做什么？', '这样按着，我动不了。'] },

  { id: 'stroke.head', on: 'stroke', who: 'owner', when: { zone: 'head' },
    say: ['再多摸一会儿也可以哦。', '你的手好暖，我都想眯起眼睛了。', '这样摸着摸着，我快要跟着节拍打瞌睡了。'] },
  { id: 'stroke.head.close', on: 'stroke', who: 'owner', when: { zone: 'head', intimacy: '>=2' }, chance: 0.5,
    say: ['被你摸习惯了，现在不摸反而有点空落落的。', '就这样，别停{，呼}。'] },
  { id: 'stroke.head.visitor', on: 'stroke', who: 'visitor', when: { zone: 'head' }, say: ['唔……被摸得有点晕乎乎的。', '好啦，头发要乱了。'] },
  { id: 'stroke.body', on: 'stroke', who: 'any', when: { zone: ['body', 'twintail'] }, say: ['痒——', '这样蹭来蹭去，像在给我顺毛。'] },
  { id: 'stroke.hem', on: 'stroke', who: 'any', when: { zone: 'hem' }, say: ['那里不行！', '手往上一点。'] },

  { id: 'swipe', on: 'swipe', who: 'any', say: ['哇！这一下轻飘飘的，好神奇。', '嗖——感觉像被风吹了一下呢。', '再来一次这样的，也可以哦。', '这下头发都被吹起来了啦。', '像是被谁按了个快进键，咻的一下。'] },
  { id: 'pull', on: 'pull', who: 'any', say: ['喂，辫子被拽到会痛的啦（才、才没有真的痛）。', '拽辫子做什么，想牵着我走吗？'] },
  { id: 'pull.owner', on: 'pull', who: 'owner', field: 'play', say: ['{呼，}别拽了。'] },
  { id: 'pull.pained', on: 'pull', who: 'any', field: 'play', when: { emotion: 'pained' }, say: ['疼——松手松手。', '拽疼了！'] },
  { id: 'pull.pained.owner', on: 'pull', who: 'owner', field: 'play', when: { emotion: 'pained' }, say: ['{呼，}拽疼了。'] },
  { id: 'combo', on: 'combo', who: 'any', field: 'play',
    say: ['别戳了，头都晕了！', '再戳我可是要生气的哦（才不会真生气）。', '你是把我当按钮了吗，笨蛋！', '戳戳戳，我的注意力条都要见底啦。', '停一下啦，我需要缓冲一下……'] },
  { id: 'combo.owner', on: 'combo', who: 'owner', field: 'play', say: ['{呼，}一下就好，别一直戳。', '{呼，}又戳？'] },
  { id: 'combo.visitor', on: 'combo', who: 'visitor', say: ['好啦好啦，我在。', '别戳了，头都晕了！'] },

  // 亲密里程碑（拍头 20 / 50 / 100 次）
  { id: 'milestone.pats', on: 'milestone', who: 'any', when: { patsTotal: [20, 50] }, face: 'surprised',
    say: ['咦，你已经来找我这么多次了呀……谢谢你。', '被这样常常惦记着，我很开心哦。'] },
  { id: 'milestone.pats.100', on: 'milestone', who: 'owner', field: 'solemn', when: { patsTotal: 100 }, once: 'ever', face: 'happy',
    say: ['……被这样一直陪着，好像也没什么不好呢。是从什么时候开始，习惯了这里有你。'] },
  { id: 'milestone.pats.100.visitor', on: 'milestone', who: 'visitor', when: { patsTotal: 100 }, once: 'ever', face: 'happy',
    say: ['一百次了。你大概是这里最常来摸头的客人。'] },

  // 稀有彩蛋：极低概率，偶尔打破一点第四面墙
  { id: 'rare.owner', on: 'rare', who: 'owner', say: ['其实……我一直都能看到你在写什么哦。'] },
  { id: 'rare.any', on: 'rare', who: 'any', say: ['你是不是以为我只是个装饰？才不是呢。', '这个花园里的每一篇文字，我都读过。', '有时候我会好奇，屏幕另一头的你，此刻是什么表情呢。'] },
];

// ───────────────────────── 照顾（站主） ─────────────────────────

const CARE: Rule[] = [
  // 守则：同一件事一天最多提两次，第二次更轻（careRepeat = 1）
  { id: 'care.sedentary', on: 'care-sedentary', who: 'owner', field: 'care', face: 'happy', when: { careRepeat: 0 },
    say: ['陪你坐了好一会儿了，要不要起来走走、喝口水？', '专心是好事，但也别忘了眨眨眼、伸个懒腰哦。', '{呼，}起来走走吧，喝口水。'] },
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

// ═════════════════════════ P7 第一批（2026-10-08，待过目） ═════════════════════════
//   按 feel 与场域分组。feel 组只在你标过（人标或专辑默认）时说；没标的歌走「唤醒度」兜底——
//   arousal 是离线算的曲库内百分位，有依据。季节/时段组读曲目档案的季语与时段。

// —— 按 feel：换歌时（站主多一层「你」的视角，访客只讲歌本身） ——
const FEEL_OWNER: Rule[] = [
  { id: 'p7.feel.joyful.owner', on: 'track-change', who: 'owner', when: { feel: 'joyful', feelSure: true }, chance: 0.5,
    say: ['这首一响，肩膀就想跟着动。', '鼓点很干净，适合把今天剩下的事一口气做完。', '♪ 这首我会忍不住跟着哼。'] },
  { id: 'p7.feel.tender.owner', on: 'track-change', who: 'owner', when: { feel: 'tender', feelSure: true }, chance: 0.5,
    say: ['这首音量小一点也听得清。', '像有人在耳边说话的那种歌。', '这首适合把灯调暗一点。'] },
  { id: 'p7.feel.nostalgic.owner', on: 'track-change', who: 'owner', when: { feel: 'nostalgic', feelSure: true }, chance: 0.5,
    say: ['听这首会想起去年这个时候在做什么。', '旋律是旧的，听的人是新的。', '这首放完，屋子里会安静一会儿。'] },
  { id: 'p7.feel.sad.owner', on: 'track-change', who: 'owner', field: 'comfort', when: { feel: 'sad', feelSure: true }, chance: 0.5,
    say: ['难过的歌不用急着切。', '这首听完，喝口热水{，呼}。', '这首有点重。我在旁边。'] },
  { id: 'p7.feel.peaceful.owner', on: 'track-change', who: 'owner', when: { feel: 'peaceful', feelSure: true }, chance: 0.5,
    say: ['这首像没有风的下午。', '可以就这样放着，不用专心听。', '这首放着，发一会儿呆也好。'] },
  { id: 'p7.feel.tense.owner', on: 'track-change', who: 'owner', when: { feel: 'tense', feelSure: true }, chance: 0.5,
    say: ['这首节奏很急，写东西的话正好。', '听这首的时候，我会站得直一点。', '这首一直往前赶。'] },
  { id: 'p7.feel.wonder.owner', on: 'track-change', who: 'owner', when: { feel: 'wonder', feelSure: true }, chance: 0.5,
    say: ['前奏一出来，房间像大了一圈。', '这首每次都有一个地方让我愣一下。', '听这首的时候，抬头看看窗外吧。'] },
];

const FEEL_VISITOR: Rule[] = [
  { id: 'p7.feel.joyful.visitor', on: 'track-change', who: 'visitor', when: { feel: 'joyful', feelSure: true }, chance: 0.5, say: ['这首挺适合边逛边听。'] },
  { id: 'p7.feel.tender.visitor', on: 'track-change', who: 'visitor', when: { feel: 'tender', feelSure: true }, chance: 0.5, say: ['这首很轻，读东西的时候放正好。'] },
  { id: 'p7.feel.nostalgic.visitor', on: 'track-change', who: 'visitor', when: { feel: 'nostalgic', feelSure: true }, chance: 0.5, say: ['这首有点旧日子的味道。'] },
  { id: 'p7.feel.sad.visitor', on: 'track-change', who: 'visitor', when: { feel: 'sad', feelSure: true }, chance: 0.5, say: ['这首偏伤感，不想听的话换一首也行。'] },
  { id: 'p7.feel.peaceful.visitor', on: 'track-change', who: 'visitor', when: { feel: 'peaceful', feelSure: true }, chance: 0.5, say: ['这首很安静，适合慢慢逛。'] },
  { id: 'p7.feel.tense.visitor', on: 'track-change', who: 'visitor', when: { feel: 'tense', feelSure: true }, chance: 0.5, say: ['这首节奏很紧，开头可能有点吵。'] },
  { id: 'p7.feel.wonder.visitor', on: 'track-change', who: 'visitor', when: { feel: 'wonder', feelSure: true }, chance: 0.5, say: ['这首前奏很好听，可以留意一下。'] },
];

// —— 副歌：只在雀跃 / 奇妙的歌里偶尔开口；其余时候副歌交给口型和粒子 ——
const CHORUS: Rule[] = [
  { id: 'p7.chorus.bright', on: 'chorus', who: 'any', when: { feel: ['joyful', 'wonder'], feelSure: true }, chance: 0.3, cooldown: 600,
    say: ['♪ 就是这段。', '♪ 来了。'] },
];

// —— 没标 feel 的歌：按离线算的唤醒度说（有曲库内百分位依据，不靠猜） ——
const AROUSAL: Rule[] = [
  { id: 'p7.arousal.high', on: 'track-change', who: 'any', when: { feelSure: false, trackArousal: '>=0.8' }, chance: 0.35,
    say: ['这首一开头就很满。', '这首能量很足，音量别开太大。'] },
  { id: 'p7.arousal.low', on: 'track-change', who: 'any', when: { feelSure: false, trackArousal: '<=0.2' }, chance: 0.35,
    say: ['这首很轻，适合小声放。', '这首几乎是在耳语。'] },
];

// —— 季节与时段：歌的季语 × 此刻 ——
const SEASON: Rule[] = [
  { id: 'p7.season.match', on: 'track-change', who: 'any', when: { seasonMatch: true }, chance: 0.3, weight: 3,
    say: ['{seasonName}天的歌，正好在{seasonName}天听。', '这首里是{seasonName}天，外面也是。'] },
  { id: 'p7.season.mismatch', on: 'track-change', who: 'any', when: { seasonMismatch: true }, chance: 0.3, weight: 3,
    say: ['现在是{nowSeasonName}天，放一首{seasonName}天的歌。'] },
  { id: 'p7.season.mismatch.owner', on: 'track-change', who: 'owner', when: { seasonMismatch: true }, chance: 0.3, weight: 3,
    say: ['{nowSeasonName}天里听{seasonName}天的歌，是在想那时候吗？'] },
  { id: 'p7.time.night', on: 'track-change', who: 'any', when: { trackTime: 'night', period: ['night', 'lateNight'] }, chance: 0.3,
    say: ['夜里的歌，夜里听。'] },
  { id: 'p7.time.morning', on: 'track-change', who: 'any', when: { trackTime: 'morning', period: ['dawn', 'morning'] }, chance: 0.3,
    say: ['早上的歌，配早上。'] },
  { id: 'p7.time.night-in-morning', on: 'track-change', who: 'owner', when: { trackTime: 'night', period: ['dawn', 'morning'] }, chance: 0.3,
    say: ['一大早就听夜里的歌。昨晚没睡好？'] },
  { id: 'p7.time.dusk', on: 'track-change', who: 'any', when: { trackTime: 'dusk', period: 'dusk' }, chance: 0.3,
    say: ['黄昏的歌，刚好赶上黄昏。'] },
];

// —— 场域：亲昵（摸头）、安慰（深夜、低落）、玩闹、郑重 ——
const FIELD: Rule[] = [
  { id: 'p7.tender.stroke', on: 'stroke', who: 'owner', field: 'tender', when: { zone: 'head' },
    say: ['{呼，}手别停。', '就这样{，呼}。', '摸久了，我会以为今天什么事都没有。', '再一会儿。就一会儿。'] },
  { id: 'p7.tender.hold', on: 'hold', who: 'owner', field: 'tender', when: { zone: 'head' },
    say: ['……嗯。', '按着我的头，像在确认我还在。', '你今天有点累吧{，呼}。'] },
  { id: 'p7.tender.hold.late', on: 'hold', who: 'owner', field: 'care', when: { zone: 'head', lateNight: true }, chance: 0.5,
    say: ['{呼，}这么晚了还在这儿摸我，该去睡了。'] },
  { id: 'p7.comfort.return.late', on: 'return', who: 'owner', field: 'comfort', when: { lateNight: true },
    say: ['这么晚还回来看一眼。', '回来了。今晚就到这儿{，呼}？'] },
  { id: 'p7.comfort.idle.low', on: 'idle', who: 'owner', field: 'comfort', when: { lateNight: true, valence: '<-0.2' }, once: 'day',
    say: ['今晚放的歌都有点沉{，呼}。', '要不要换一首亮一点的？'] },
  { id: 'p7.play.body', on: 'tap', who: 'owner', field: 'play', when: { zone: ['body', 'hem'], intimacy: '>=1' }, chance: 0.4,
    say: ['{呼，}手放好。', '{呼，}再戳就收费了。'] },
  { id: 'p7.play.swipe', on: 'swipe', who: 'owner', field: 'play', say: ['{呼，}你在扇风吗？'] },
  { id: 'p7.solemn.streak30', on: 'greet', who: 'owner', field: 'solemn', when: { 'memory.streakDays': '>=30' }, once: 'day', chance: 0.5, weight: 20,
    say: ['{呼，}连着 {memory.streakDays} 天了。谢谢你每天都来。'] },
];

// —— 访客：替主人招待（只讲站里真有的东西） ——
const HOST: Rule[] = [
  { id: 'p7.host.first', on: 'greet', who: 'visitor', when: { patsTotal: 0, visitorAlias: '!' }, chance: 0.5,
    say: ['第一次来的话，底下几个图标可以随便点。', '这里是他的数字花园，写的东西都在花园里。'] },
  { id: 'p7.host.quiet', on: 'greet', who: 'visitor', when: { period: ['night', 'lateNight'] }, chance: 0.4,
    say: ['想安静看看的话，我就不出声了。'] },
  { id: 'p7.host.orchard', on: 'view', who: 'visitor', when: { view: 'orchard' }, chance: 0.6,
    say: ['星图的角度就是日期，转一圈是一年。', '点一颗星会翻开它的星卡，从那里能进到文章。'] },
  { id: 'p7.host.lights', on: 'view', who: 'visitor', when: { view: 'lights' }, chance: 0.6, say: ['信抽出来读完，就能去他朋友们的站。'] },
  { id: 'p7.host.atelier', on: 'view', who: 'visitor', when: { view: 'atelier' }, chance: 0.6, say: ['工坊里是他做过的作品，点开能看细节。'] },
  { id: 'p7.host.soundscape', on: 'view', who: 'visitor', when: { view: 'soundscape' }, chance: 0.6, say: ['歌词面板可以点开，跟着一起看。'] },
  { id: 'p7.host.reading.long', on: 'reading-open', who: 'visitor', when: { 'reading.minutes': '>=10' }, chance: 0.6,
    say: ['这篇有点长。读到一半走开也没关系，下次会从这里接着。'] },
  { id: 'p7.host.idle.late', on: 'idle', who: 'visitor', when: { lateNight: true }, say: ['这么晚了，逛完记得早点睡。'] },
  { id: 'p7.host.tap.first', on: 'tap', who: 'visitor', when: { zone: 'head', patsToday: 1 }, say: ['你是今天第一次摸我头。'] },
  { id: 'p7.host.combo', on: 'combo', who: 'visitor', say: ['好啦，我在听。'] },
];

// ═════════════════════════ P4 多维情绪（2026-10-09，待过目） ═════════════════════════
//   docs/song-emotion-design.md §3.7。只在 feelSure（人标或专辑、没标「说不准」）时按情绪开口；意象不靠 feelSure
//   （它是歌题歌词里数出来的事实）。条件越多越优先：反差 > 复合 > 单维 feel；意象与季节在后面兜底。
//   条件写点路径：'feels.power': '>=2'。

// —— 复合情绪：两维都 ≥ 2 才有名字 ——
const BLEND: Rule[] = [
  { id: 'p4.blend.setsunai.owner', on: 'track-change', who: 'owner', when: { blend: 'setsunai', feelSure: true }, chance: 0.4, weight: 5,
    say: ['唔，这首听着心里有点揪。', '明明是温柔的调子，听到后面却有点想哭呢。', '这种难过是软的，捧在手心里会化掉。'] },
  { id: 'p4.blend.setsunai.visitor', on: 'track-change', who: 'visitor', when: { blend: 'setsunai', feelSure: true }, chance: 0.4, weight: 5,
    say: ['这首温柔里带一点难过，日语里叫「切ない」。'] },
  { id: 'p4.blend.release.owner', on: 'track-change', who: 'owner', when: { blend: 'release', feelSure: true }, chance: 0.4, weight: 5,
    say: ['哭过之后的那种安静，这首里有呢。', '它不劝人别难过，只是让难过慢慢落地。'] },
  { id: 'p4.blend.release.visitor', on: 'track-change', who: 'visitor', when: { blend: 'release', feelSure: true }, chance: 0.4, weight: 5,
    say: ['这首是难过之后、慢慢平静下来的那种歌。'] },
  { id: 'p4.blend.fired.owner', on: 'track-change', who: 'owner', when: { blend: 'fired', feelSure: true }, chance: 0.4, weight: 5,
    say: ['来了来了——这首要一起燃起来！', '音量调大一点吧，这首值得。'] },
  { id: 'p4.blend.fired.visitor', on: 'track-change', who: 'visitor', when: { blend: 'fired', feelSure: true }, chance: 0.4, weight: 5,
    say: ['这首很燃，听着会想动起来哦。'] },
  { id: 'p4.blend.youth.owner', on: 'track-change', who: 'owner', when: { blend: 'youth', feelSure: true }, chance: 0.4, weight: 5,
    say: ['这首有放学路上的味道，夕阳和自行车铃。', '明明很开心，却让人想起回不去的夏天。'] },
  { id: 'p4.blend.youth.visitor', on: 'track-change', who: 'visitor', when: { blend: 'youth', feelSure: true }, chance: 0.4, weight: 5,
    say: ['很青春的一首，有点夏天傍晚的味道。'] },
  { id: 'p4.blend.hollow.owner', on: 'track-change', who: 'owner', when: { blend: 'hollow', feelSure: true }, chance: 0.4, weight: 5,
    say: ['听着这首，心里空出一块，风从那儿吹过去。', '远远的，又很近——它是这样的歌呢。'] },
  { id: 'p4.blend.hollow.visitor', on: 'track-change', who: 'visitor', when: { blend: 'hollow', feelSure: true }, chance: 0.4, weight: 5,
    say: ['这首很空灵，放着发一会儿呆也好。'] },
  { id: 'p4.blend.smolder.owner', on: 'track-change', who: 'owner', when: { blend: 'smolder', feelSure: true }, chance: 0.4, weight: 5,
    say: ['这首憋着一股火，没地方发。', '咬着牙唱完的歌呢。'] },
  { id: 'p4.blend.smolder.visitor', on: 'track-change', who: 'visitor', when: { blend: 'smolder', feelSure: true }, chance: 0.4, weight: 5,
    say: ['这首有一股不服气的劲儿。'] },
];

// —— 词曲反差：曲亮词暗（踊ろうぜ 那种）/ 曲暗词亮 ——
const SPLIT: Rule[] = [
  { id: 'p4.split.sound', on: 'track-change', who: 'any', when: { split: true, splitWay: 'sound', feelSure: true }, chance: 0.5,
    say: ['调子这么轻快，词怎么这么丧啊。', '跟着节奏晃着晃着，才听清它在唱什么……'] },
  { id: 'p4.split.sound.owner', on: 'track-change', who: 'owner', when: { split: true, splitWay: 'sound', feelSure: true }, chance: 0.5,
    say: ['笑着唱难过的事，这首最拿手了。'] },
  { id: 'p4.split.sound.visitor', on: 'track-change', who: 'visitor', when: { split: true, splitWay: 'sound', feelSure: true }, chance: 0.5,
    say: ['曲子很轻快，词其实挺丧的，可以看看歌词。'] },
  { id: 'p4.split.lyric', on: 'track-change', who: 'any', when: { split: true, splitWay: 'lyric', feelSure: true }, chance: 0.5,
    say: ['词是暖的，曲子却有点暗呢。', '它说的都是好话，声音里却在下雨。'] },
];

// —— 新三维：燃 / 空灵 / 不甘（原先的七维在 P7 组里） ——
const FEEL_NEW: Rule[] = [
  { id: 'p4.feel.power.owner', on: 'track-change', who: 'owner', when: { feel: 'power', feelSure: true }, chance: 0.5,
    say: ['一开口就把人往前推。', '鼓一砸下来，背就直了。', '♪ 这首要大声一点放！'] },
  { id: 'p4.feel.power.visitor', on: 'track-change', who: 'visitor', when: { feel: 'power', feelSure: true }, chance: 0.5,
    say: ['劲儿很足的一首，听完会精神一点。'] },
  { id: 'p4.feel.transcendence.owner', on: 'track-change', who: 'owner', when: { feel: 'transcendence', feelSure: true }, chance: 0.5,
    say: ['很远的声音，从云上面传下来的。', '不用跟着唱，就让它飘着吧。', '房间一下子静下来了呢。'] },
  { id: 'p4.feel.transcendence.visitor', on: 'track-change', who: 'visitor', when: { feel: 'transcendence', feelSure: true }, chance: 0.5,
    say: ['很空灵的一首，不用专心听也没关系。'] },
  { id: 'p4.feel.defiant.owner', on: 'track-change', who: 'owner', when: { feel: 'defiant', feelSure: true }, chance: 0.5,
    say: ['输了也不认的歌，倔得很好听。', '它在跟谁赌气呢。', '嗯……听完会想再试一次。'] },
  { id: 'p4.feel.defiant.visitor', on: 'track-change', who: 'visitor', when: { feel: 'defiant', feelSure: true }, chance: 0.5,
    say: ['这首带着一股倔劲儿。'] },
];

// —— 段落：换段时情绪转了一下（arc-turn）。多数时候不说话，只是眼睛亮一下、落一点东西 ——
const ARC: Rule[] = [
  { id: 'p4.arc.power', on: 'arc-turn', who: 'any', when: { section: 'chorus', 'feels.power': '>=2', feelSure: true },
    say: [], face: 'happy', particles: 'notes' },
  { id: 'p4.arc.defiant', on: 'arc-turn', who: 'any', when: { 'feels.defiant': '>=2', feelSure: true }, cooldown: 60, say: [], particles: 'sparks' },
  { id: 'p4.arc.joyful', on: 'arc-turn', who: 'any', when: { section: 'chorus', 'feels.joyful': '>=2', feelSure: true }, chance: 0.4, cooldown: 600,
    say: ['♪ 就是这里！'], face: 'happy' },
  { id: 'p4.arc.release', on: 'arc-turn', who: 'any', when: { section: 'outro', 'feels.peaceful': '>=2', feelSure: true }, chance: 0.5, cooldown: 600,
    say: ['……嗯，落下来了。', '到这里就松开了呢。'] },
  { id: 'p4.arc.sad.owner', on: 'arc-turn', who: 'owner', field: 'comfort', when: { 'feels.sad': '>=2', feelSure: true }, chance: 0.3, cooldown: 900,
    say: ['这一段忽然沉下来了。'] },
  { id: 'p4.arc.transcendence', on: 'arc-turn', who: 'any', when: { 'feels.transcendence': '>=2', feelSure: true }, cooldown: 60, say: [], particles: 'motes-up' },
];

// —— 副歌：燃起来的歌也偶尔出声（雀跃 / 奇妙那条在 P7 组） ——
const CHORUS_P4: Rule[] = [
  { id: 'p4.chorus.fired', on: 'chorus', who: 'any', when: { blend: 'fired', feelSure: true }, chance: 0.3, cooldown: 600,
    say: ['♪ 一起！', '♪ 这里要大声唱。'] },
];

// —— 意象：雨、海、花、月、雪会在她身边落成粒子，所以有时她会顺口提一句；信只有台词 ——
const IMAGERY: Rule[] = [
  { id: 'p4.imagery.rain.owner', on: 'track-change', who: 'owner', when: { imagery: 'rain' }, chance: 0.3, weight: 4,
    say: ['是下雨的歌。外面要是也在下，就刚刚好呢。', '这首一直在下雨，我这边也跟着落了一点。'] },
  { id: 'p4.imagery.rain.visitor', on: 'track-change', who: 'visitor', when: { imagery: 'rain' }, chance: 0.3, weight: 4,
    say: ['是一首下雨的歌，我身边也飘了点雨丝。'] },
  { id: 'p4.imagery.sea.owner', on: 'track-change', who: 'owner', when: { imagery: 'sea' }, chance: 0.3, weight: 4,
    say: ['这首里有海，耳朵里会有一点潮气。', '听着听着，会想去看海呢。'] },
  { id: 'p4.imagery.sea.visitor', on: 'track-change', who: 'visitor', when: { imagery: 'sea' }, chance: 0.3, weight: 4,
    say: ['这首里有海，冒出来的泡泡是我放的。'] },
  { id: 'p4.imagery.flower.owner', on: 'track-change', who: 'owner', when: { imagery: 'flower' }, chance: 0.3, weight: 4,
    say: ['这首开着花，落了我一身花瓣。', '花的歌呀。等它唱完，花瓣也该落完了。'] },
  { id: 'p4.imagery.flower.visitor', on: 'track-change', who: 'visitor', when: { imagery: 'flower' }, chance: 0.3, weight: 4,
    say: ['这首里有花，我身边也飘了几瓣。'] },
  { id: 'p4.imagery.moon.owner', on: 'track-change', who: 'owner', when: { imagery: 'moon' }, chance: 0.3, weight: 4,
    say: ['月亮的歌。等会儿可以抬头找找看。', '今晚的月亮，在这首歌里也有一个。'] },
  { id: 'p4.imagery.moon.visitor', on: 'track-change', who: 'visitor', when: { imagery: 'moon' }, chance: 0.3, weight: 4,
    say: ['这是一首写月亮的歌。'] },
  { id: 'p4.imagery.snow.owner', on: 'track-change', who: 'owner', when: { imagery: 'snow' }, chance: 0.3, weight: 4,
    say: ['下雪的歌，听着指尖都凉了一点。'] },
  { id: 'p4.imagery.snow.visitor', on: 'track-change', who: 'visitor', when: { imagery: 'snow' }, chance: 0.3, weight: 4,
    say: ['这首里在下雪。'] },
  { id: 'p4.imagery.letter.owner', on: 'track-change', who: 'owner', when: { imagery: 'letter' }, chance: 0.3, weight: 4,
    say: ['写成信的歌。你上一次手写信是什么时候？', '一封念出来的信呢，收信的人会听到吗。'] },
  { id: 'p4.imagery.letter.visitor', on: 'track-change', who: 'visitor', when: { imagery: 'letter' }, chance: 0.3, weight: 4,
    say: ['这首是写成信的歌，歌词可以慢慢看。'] },
];

// ═════════════════════════ P5 陪伴（2026-10-10，待过目） ═════════════════════════
//   docs/song-emotion-design.md §3.5–§3.8。felt（他在工坊里标的「这首让我怎样」，存 Supabase）与听歌倾向 sessionLean
//   都只给站主（mikuRules.test 守着）。felt 是他亲手写的，不靠 feelSure；但同时引用 feels 的那条照规矩带 feelSure。
//   听歌倾向不念出来——不说「你今晚听了几首难过的歌」，只让她挑往哪边靠的那句。
//   共鸣系数本身不加台词：深夜陪着时她只是更温柔，要不要开口仍由 care 规则和话量决定。

// —— felt：歌表达的，和它让你怎样，可以不是一回事 ——
const FELT: Rule[] = [
  { id: 'p5.felt.calm.owner', on: 'track-change', who: 'owner', when: { 'feels.sad': '>=2', feelSure: true, 'felt.peaceful': '>=2' },
    chance: 0.3, once: 'week', onceKey: 'felt:{trackId}', weight: 6,
    say: ['你说过这首听了反而会安静下来，对吧。', '明明是首难过的歌，你却说听着心会静。我有点懂了呢。'] },
  { id: 'p5.felt.power.owner', on: 'track-change', who: 'owner', when: { 'felt.power': '>=2' }, chance: 0.3, once: 'week', onceKey: 'felt:{trackId}', weight: 12,
    say: ['你说这首听了会有劲儿。那就放大声一点吧。', '给你打气的那首，我记得。'] },
  { id: 'p5.felt.tender.owner', on: 'track-change', who: 'owner', when: { 'felt.tender': '>=2' }, chance: 0.3, once: 'week', onceKey: 'felt:{trackId}', weight: 12,
    say: ['你说听这首的时候，心会放轻一点。', '这首会让你变软，你说过的。'] },
  { id: 'p5.felt.nostalgic.owner', on: 'track-change', who: 'owner', when: { 'felt.nostalgic': '>=2' }, chance: 0.3, once: 'week', onceKey: 'felt:{trackId}', weight: 12,
    say: ['这首会把你带回从前吧。去哪儿我不问。', '又是会让你想起旧事的那首呢。'] },
  { id: 'p5.felt.sad.owner', on: 'track-change', who: 'owner', field: 'comfort', when: { 'felt.sad': '>=2' }, chance: 0.3, once: 'week', onceKey: 'felt:{trackId}', weight: 12,
    say: ['这首会让你难过，你说过的。……我在这儿。', '听着难受的话，换一首也没关系{，呼}。'] },
  { id: 'p5.felt.joyful.owner', on: 'track-change', who: 'owner', when: { 'felt.joyful': '>=2' }, chance: 0.3, once: 'week', onceKey: 'felt:{trackId}', weight: 12,
    say: ['你说这首一放就会高兴起来。今天也灵吗？'] },
];

// —— 听歌倾向：今晚一直往低处听，又换了首亮的；或者夜深了 ——
const LEAN: Rule[] = [
  { id: 'p5.lean.brighter.owner', on: 'track-change', who: 'owner', when: { sessionLean: ['sad', 'defiant'], feel: ['joyful', 'power', 'peaceful', 'tender', 'wonder'], feelSure: true },
    chance: 0.4, once: 'session',
    say: ['嗯，换首亮一点的也好。', '窗户开了一条缝，这首透气。'] },
  { id: 'p5.lean.late.owner', on: 'care-late', who: 'owner', field: 'care', when: { sessionLean: ['sad', 'defiant'], careRepeat: 0 },
    say: ['{呼，}{hourText}了。把耳机摘下来吧，放到哪首我替你记着。', '{hourText}了。今晚的歌就听到这首，剩下的留给明天。'] },
];

export const MIKU_RULES: readonly Rule[] = [
  ...GREET, ...RETURN, ...VIEW, ...MUSIC, ...IDLE, ...SITE, ...TOUCH, ...CARE,
  ...FEEL_OWNER, ...FEEL_VISITOR, ...CHORUS, ...AROUSAL, ...SEASON, ...FIELD, ...HOST,
  ...BLEND, ...SPLIT, ...FEEL_NEW, ...ARC, ...CHORUS_P4, ...IMAGERY,
  ...FELT, ...LEAN,
];
