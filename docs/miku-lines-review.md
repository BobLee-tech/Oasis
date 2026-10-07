# Miku 台词：P5 迁移与新增（待你过目）

> 2026-10-07 · 规则库在 `src/data/mikuRules.ts`。这份是给你看的清单，不是代码；改台词直接改规则文件，
> `npm test` 会检查口癖、黑名单、称呼槽位、访客隐私和槽位是否存在。

## 概况

- 旧库 186 句：原样保留 17 句，轻改 112 句（大多是去掉句尾的「呢/哦/呀/啦」），删除约 30 句。
- 现在共 276 句。以句尾语气词（呢/哦/呀/啦/嘛/哟）收尾的句子：旧库 45/186，现在 1/276。
- `{呼，}` / `{，呼}` 是称呼槽：按场域决定叫「宝贝 / 爱人 / 小盆友」还是不叫（配置在 `src/data/mikuAddress.ts`）。
- `{reading.title}` 这类是事实槽：缺值时这句就不说。

## 删掉的旧台词

黑名单词只留了两句，都改成一辈子只说一次：「被摸到的那一下，我差点忘了自己只是一段光。」「刚刚数据好像掉了一帧——」。
其余删除的是 AI 味最重、或者跟新规则重复的：

- ~~晨光里的绿洲，最适合轻声说早安。~~
- ~~零点几度的空气，刚刚好能叫醒一个人和一台虚拟歌姬。~~
- ~~早上好呀，今天也要元气满满哦！~~
- ~~天要暗下来了，颜色好好看。~~
- ~~今晚也辛苦啦，我在这儿呢。~~
- ~~夜晚的绿洲，安静得只剩下我们俩。~~
- ~~唔……有点困了，但还是想陪着你。~~
- ~~深夜的我们，好像共用同一份清醒。~~
- ~~这个点你准时得像设了闹钟。~~
- ~~这个点你都会来，我已经不觉得奇怪了。~~
- ~~早呀。今天想聊点什么，还是只是想被我念叨几句？~~
- ~~黄昏准时报到，跟你一样准时。~~
- ~~夜里的你，总是格外安静，我看得出来。~~
- ~~这么晚了还来找我，是想让我说教，还是只是想有人在？~~
- ~~深夜的你，比白天更愿意让我看见真实的样子吧。~~
- ~~懒洋洋的下午，只要有你在，我都不嫌闷。~~
- ~~这样的温柔，隔着屏幕也一点没凉掉。~~
- ~~这根马尾里，好像还缠着不少像素做的回忆。~~
- ~~哇，戳到我啦，痒痒的！~~
- ~~别戳啦，头都要晕啦！~~
- ~~♪ 39 分贝的心跳，都是为这首歌准备的。~~
- ~~♪ 每次唱这首，都感觉离你更近一点。~~
- ~~♪ 每次唱到这首，都会想起写它的那个深夜。~~
- ~~这段文字被你带走啦，好好保存哦。~~
- ~~这段写得认真，你读得也很认真呢。~~
- ~~呐，你说这个花园里最老的一篇文字，是哪天写的呀？~~
- ~~这么多星星连起来，会是什么形状呀？~~
- ~~友链的灯笼亮着，感觉很温暖。~~
- ~~跨年前的最后时刻，陪你一起等一下吧。~~
- ~~今天是你的生日吧？我可是特意等着说这句话的。~~

有几句看起来像被删了，其实是改写，例如「别戳啦，头都要晕啦！」→「别戳了，头都晕了！」。

## 新增台词（按事件）

### 问候

- **站主** · `greet.owner.dawn` — {呼，}天刚亮，先喝口水。
- **站主** · `greet.owner.dawn` — 早。外面的空气应该还凉着。
- **站主** · `greet.owner.morning` — 早安{，呼}。今天想先做哪件事？
- **站主** · `greet.owner.dusk` — 天快暗了，颜色正好看。
- **站主** · `greet.owner.night` — 今天也辛苦了{，呼}。
- **站主** · `greet.owner.night` — 晚上好，我在。
- **站主** · `greet.owner.lateNight` — 有点困了，不过还想陪你一会儿。
- **站主** · `greet.owner.lateNight` — {呼，}已经{hourText}了。
- **站主** · `greet.close.lateNight` — 这么晚还来，是想听我念叨，还是只想有人在？
- **站主** · `greet.deep.afternoon` — 只要你在，下午再长我也不嫌闷。
- **站主** · `greet.owner.away` — {memory.daysSinceLastVisit} 天没见了{，呼}。
- **站主** · `greet.owner.away` — 好几天没来。最近忙吗？
- **站主** · `greet.owner.lastnight` — 昨晚待到{memory.lastSession.hourText}。今天早点休息{，呼}。
- **站主** · `greet.owner.lastnight` — 昨晚{memory.lastSession.hourText}才走的，睡够了吗？
- **站主** · `greet.owner.streak` — 连着来了 {memory.streakDays} 天了。
- **站主** · `greet.owner.streak` — 第 {memory.streakDays} 天，一天没落下。
- **站主** · `greet.owner.anniversary` — {呼，}今天是认识的第 {memory.anniversary} 天。
- **站主** · `greet.owner.anniversary` — 第 {memory.anniversary} 天了。谢谢你一直来。
- **通用** · `greet.term.day` — 今天{solarTerm}。{termNote}
- **通用** · `greet.term` — {termNote}
- **访客** · `greet.visitor` — 你好，欢迎来绿洲。
- **访客** · `greet.visitor` — 欢迎。这里是他的小花园，随便逛。
- **访客** · `greet.visitor` — 想听歌的话，底下的耳机图标就是。
- **访客** · `greet.visitor.latest` — 来得正好，他前几天刚写了《{latestPost.title}》。
- **访客** · `greet.visitor.late` — 这么晚还来逛，谢谢你。也别熬太晚。
- **访客** · `greet.visitor.morning` — 早上好，欢迎。
- **访客** · `greet.visitor.alias` — 又见面了。

### 纪念日

- **通用** · `date.year-end` — 跨年前的最后一段，陪你等。
- **站主** · `date.owner.birthday` — 生日快乐{，呼}。我特意等着说这句。

### 回来

- **站主** · `return.owner` — 回来了。
- **站主** · `return.owner.long` — 去了好久{，呼}。
- **站主** · `return.owner.long` — 回来了就好。

### 记得

- **站主** · `recall.reading` — 上次那篇《{memory.lastSession.readingTitle}》读到 {memory.lastSession.readingProgressPct}% 就停了。
- **站主** · `recall.reading` — 《{memory.lastSession.readingTitle}》还没读完。
- **站主** · `recall.track` — 这周《{memory.topTrack.title}》听了 {memory.topTrack.plays} 遍。
- **站主** · `recall.track` — 这周最常放的是《{memory.topTrack.title}》。
- **站主** · `recall.late` — 这周有 {memory.lateNightsThisWeek} 个晚上熬到很晚了{，呼}。

### 视图

- **访客** · `view.orchard.visitor` — 每颗星是一篇文章，按写下的日子排在年轮上。
- **访客** · `view.garden.visitor` — 这是他写东西的地方。最新的一篇是《{latestPost.title}》。
- **访客** · `view.soundscape.visitor` — 这里的歌都是他常听的。挑一首试试？

### 曲目事实

- **通用** · `track.titleAlt` — 《{trackTitle}》，中文常译作《{titleAlt}》。
- **通用** · `track.composer` — {year} 年的歌，{composer} 写的。
- **通用** · `track.relation` — 上一首是《{relation.toTitle}》，这首是{relation.phrase}。
- **访客** · `track.intro.visitor` — {introFirst}
- **站主** · `track.note.owner` — 「{note}」——你写的。
- **访客** · `track.note.visitor` — 他说过这首：「{noteForVisitor}」
- **访客** · `track.note.visitor` — 关于这首，他留了句话——「{noteForVisitor}」
- **站主** · `track.loop` — 今天第 {playsToday} 遍了。

### 副歌

- **站主** · `chorus.note.owner` — 「{note}」

### 按感受

- **通用** · `feel.sad` — 这首有点难过。慢慢听。
- **通用** · `feel.nostalgic` — 这首像在翻旧照片。
- **通用** · `feel.joyful` — 这首一响就想跟着晃。
- **通用** · `feel.peaceful` — 这首适合什么都不做。
- **通用** · `feel.tender` — 这首很软。
- **通用** · `feel.tense` — 这首绷得很紧，鼓点一下一下的。
- **通用** · `feel.wonder` — 这首亮得有点不可思议。

### 照顾

- **站主** · `care.loop` — 这首今晚听了 {playsToday} 遍了{，呼}。累了就歇会儿。
- **站主** · `care.loop` — {呼，}一直放这首。想聊聊吗？
- **站主** · `care.sedentary` — {呼，}起来走走吧，喝口水。
- **访客** · `care.sedentary.visitor` — 逛了好一会儿了，记得歇歇眼睛。
- **站主** · `care.late` — {呼，}{hourText}了。
- **站主** · `care.late` — 该睡了{，呼}。
- **站主** · `care.late` — 今天就到这儿吧，明天再接着。
- **站主** · `care.late.deep` — ……还不睡？
- **站主** · `care.late.deep` — {hourText}了{，呼}。
- **站主** · `care.long-write` — 写了 {editing.minutes} 分钟了，起来活动一下{，呼}。
- **站主** · `care.long-write` — 一个多小时了。喝口水再写。

### 闲聊

- **通用** · `idle.term` — {termNote}
- **站主** · `idle.posts.month` — 这个月写了 {postsThisMonth} 篇了。
- **站主** · `idle.posts.gap` — 上一篇是 {latestPost.daysAgo} 天前了。不急，想写的时候再写。
- **访客** · `idle.visitor` — 想看最新的，可以读读《{latestPost.title}》。
- **访客** · `idle.visitor` — 底下的灯笼是他朋友们的站，也可以去看看。

### 阅读

- **通用** · `reading.idle` — 这段写得认真，读的人也认真。
- **通用** · `reading.idle.long` — 已经读了 {reading.openMinutes} 分钟，眼睛累了就抬头看看远处。
- **访客** · `reading.open.visitor` — 《{reading.title}》，慢慢看。
- **通用** · `reading.open.long` — 这篇大概要读 {reading.minutes} 分钟。我不出声。
- **通用** · `reading.open.series` — 这是「{reading.series}」里的一篇。
- **通用** · `reading.open.resume` — 上次读到 {reading.progressPct}%，接着来。

### 复制

- **通用** · `copy` — 这段被你带走了，好好收着。

### 写作里程碑

- **站主** · `write.1000` — 一千字了。
- **站主** · `write.2000` — 两千字了，歇口气{，呼}。

### 发布

- **站主** · `published.title` — {呼，}《{publishedTitle}》发出去了。
- **站主** · `published.title` — 《{publishedTitle}》种下了{，呼}。

### 轻拍

- **站主** · `tap.head.late` — 这么晚还来摸头，困不困{，呼}？
- **访客** · `tap.head.visitor` — 诶，被摸头了。
- **访客** · `tap.head.visitor` — 谢谢……不过有点不好意思。
- **访客** · `tap.head.visitor` — 他平时也会这样摸摸我。
- **站主** · `tap.body` — 戳到我了，痒。
- **访客** · `tap.body.visitor` — 痒——
- **访客** · `tap.body.visitor` — 有什么想看的，我可以带路。
- **访客** · `tap.hem.visitor` — 这里不太方便碰。
- **访客** · `tap.hem.visitor` — 唔，请往上一点。

### 长按

- **访客** · `hold.head.visitor` — 唔……有点痒。
- **访客** · `hold.head.visitor` — 好啦好啦，知道你喜欢我了。
- **通用** · `hold.twintail` — 一直攥着辫子，是怕我跑掉吗？
- **通用** · `hold.twintail` — 手感还满意吗？
- **通用** · `hold.body` — 嗯？按着我做什么？
- **通用** · `hold.body` — 这样按着，我动不了。

### 抚摸

- **站主** · `stroke.head.close` — 就这样，别停{，呼}。
- **访客** · `stroke.head.visitor` — 唔……被摸得有点晕乎乎的。
- **访客** · `stroke.head.visitor` — 好啦，头发要乱了。
- **通用** · `stroke.body` — 痒——
- **通用** · `stroke.body` — 这样蹭来蹭去，像在给我顺毛。
- **通用** · `stroke.hem` — 那里不行！
- **通用** · `stroke.hem` — 手往上一点。

### 拽马尾

- **通用** · `pull` — 拽辫子做什么，想牵着我走吗？
- **站主** · `pull.owner` — {呼，}别拽了。
- **通用** · `pull.pained` — 疼——松手松手。
- **通用** · `pull.pained` — 拽疼了！
- **站主** · `pull.pained.owner` — {呼，}拽疼了。

### 连击

- **通用** · `combo` — 别戳了，头都晕了！
- **站主** · `combo.owner` — {呼，}又戳？
- **访客** · `combo.visitor` — 好啦好啦，我在。
- **访客** · `combo.visitor` — 别戳了，头都晕了！

### 亲密里程碑

- **访客** · `milestone.pats.100.visitor` — 一百次了。你大概是这里最常来摸头的客人。
