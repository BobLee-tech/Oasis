// 全站梳理的文字：每处一份笔记（现状 · 证据 / 提案 / 不动 / 代价与退路 / 要你定）+ 一张「梳理全文」。
//   证据里的行号对的是 2026-10-25 的 main（16ca652；当天另两次提交只动了 lights/letterScene.ts）；实测是 headless Chrome 1440×900、devicePixelRatio 2。

const S = (title, body) => `<h3>${title}</h3>${body}`;
const goto = (id, text) => `<a href="#${id}" data-go="${id}">${text}</a>`;

const MEASURE = [
  ['入口', '樱瓣 2D', '60', '3,058', '看得见'],
  ['花园', '樱瓣 2D', '60', '3,057', '看得见'],
  ['阅读舱', '樱瓣 2D', '60', '3,056', '—'],
  ['共鸣（未放歌）', '樱瓣 2D', '57', '2,904', '看得见'],
  ['星图', '樱瓣 2D ／ sky 2D', '60 ／ 0', '3,055 ／ 0', '看得见'],
  ['工坊', '樱瓣 2D', '60', '3,056', '看得见'],
  ['尺牍（夜，已含闲时 30 帧）', '樱瓣 2D ／ lt-gl', '60 ／ 30', '3,055 ／ 584', '<b>樱瓣被纸盖住</b>'],
  ['园图', '樱瓣 2D ／ yt-gl ／ 浮尘', '60 ／ 60 ／ 22', '3,069 ／ 241 ／ 412', '<b>樱瓣被纸盖住</b>'],
];
const measureTable = `<table><tr><th>页（闲置 3 秒）</th><th>画布</th><th>帧/秒</th><th>绘制调用/秒</th><th>樱瓣</th></tr>${MEASURE.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>
<p class="ev" style="font-size:12px;margin-top:6px">量法：钩住 <code>getContext</code> 与各绘制调用，按画布计数；每页进场后等 7 秒再量 3 秒。音乐页 headless 不能自动放歌，所以涟漪内页与水琴窟没量到；Miku 在 headless 下没加载，也没量。</p>`;

export const MODULES = [
  {
    id: 'overview', name: '总览', p: 'keep', pLabel: '十处', hook: '一句判断，十张卡',
    say: '尺牍立下的是四条做法，不是一种「相」：真材实料有出处；昼夜换的是光源；动有来由；画归画、点归点。拿这四条去量全站，最大的缺口不在哪一处的样子，而在<b>光</b>——各处各打各的光，互相不认：唱片的反光跟着盘转，石影写死在右下，樱瓣不分正反面，封面是 16% 的渐变。把这束光（和一阵风）做成一件底座，各处只借「质」；玻璃卡、初音绿、樱瓣、唱机、砂与星，一样不换。',
    keep: '—', score: [0, 0, 0, 0],
    notes: `<span class="k">Overview</span><h2>先说判断</h2>
<p class="lede">尺牍是全站第一处把四件事同时做齐的地方：<b>真材实料有出处</b>（克利夫兰木刻、ambientCG 帘纹、雪窗竹影，<code>public/lights/CREDITS.md</code>）；<b>昼夜换光源</b>（昼是窗与竹影，夜是烛随指针）；<b>动有来由</b>（封舌先被纸的硬挺拖住再翻，防穿模三条写在文件头）；<b>画归画、点归点</b>（WebGL 只负责好看，可点的是 DOM）。</p>
${S('拿这四条去量', `<ul>
<li><b>质</b>：工坊、尺牍、园图到了；其余三处的「质」是 CSS 渐变在扮演——唱片声槽是 5px 的 repeating-radial-gradient，封面是 16% 的情绪色渐变。</li>
<li><b>光</b>：只有尺牍和园图有光源。唱片的反光弧画在会转的那层里（<code>OasisResonance.tsx:667</code>），石影是写死的右下偏移（<code>sandScene.ts:85</code>），樱瓣正反同色、不受光。</li>
<li><b>动</b>：大体都有来由（唱盘惯性、唱臂弹簧、砂纹耙出），这一项全站最好。</li>
<li><b>省</b>：樱瓣画布在每一页都 60 帧不停，包括被尺牍、园图的纸整个盖住的时候（${goto('base', '底座')}有实测表）。</li>
</ul>`)}
${S('所以建议', `<ol>
<li>先做一件底座：<b>一束光、一阵风、画的节制</b>（${goto('base', '底座')}）。</li>
<li>再把「质」借给三处最常用的：${goto('vinyl', '唱片')}、${goto('sand', '砂')}、${goto('petals', '樱瓣')}——相不变，换的是它们怎么受光。</li>
<li>两处小的：${goto('colophon', '落款')}钤印、${goto('covers', '封面')}（要你拍板）。</li>
<li>入口、工坊、尺牍、园图：说明牌里写了为什么少动或不动。</li>
</ol>`)}
${S('怎么看这页', `<ul><li>左栏有标签的五处是<b>标本</b>：右上「现网 / 提案」与「昼 / 夜」随时切，夜里指针就是烛。标本直接 import 现网模块（<code>lib/gl.ts</code>、<code>lib/sandGarden.ts</code>、<code>lib/solarTerms.ts</code>）、用真文章与 <code>trackPeaks.generated.json</code>。</li>
<li>其余是<b>说明牌</b>：现网截图加编号标注。</li>
<li>「梳理全文」是整份判断、包与素材表、顺序和待你定。</li></ul>`)}
<p class="ev" style="font-size:12.5px">与上午的 <a href="/docs/chidu-next.html" target="_blank">尺牍实验台</a> 的关系：那一份只管尺牍自身八项；这一份管全站，尺牍那边的结论在这里只引用不重复。</p>`,
  },

  {
    id: 'petals', name: '外壳 · 樱瓣', p: 'P0', pLabel: 'P0+P1', spec: 'petals',
    hook: '糊、每帧新建渐变、被盖住也画；翻面只是压扁',
    say: '樱瓣是全站的活气，留着。画布没乘 DPR，Retina 上糊；每帧每瓣新建渐变；尺牍、园图里被纸盖住还在 60 帧。翻面是横向压扁，正反同色。',
    keep: '数量公式、季节色板、夜里星萤、光斑、reduced-motion 只画一帧', score: [2, 1, 3, 1],
    notes: `<span class="k">Shell · Petals</span><h2>樱瓣：真的翻面，闲时不画</h2>
<p class="lede">樱瓣是现网活气的一半（另一半是 Miku），一瓣不少。要改的是它怎么画、什么时候画。</p>
${S('现状 · 证据', `<ul class="ev">
<li>画布按 CSS 像素建：<code>OasisBackground.tsx:34</code> <code>canvas.width = window.innerWidth</code>。实测 devicePixelRatio 2 下画布 1440×900，被拉到 2880×1800 显示——花瓣只有 4.5–9.5 px，糊得最明显。</li>
<li>每帧每瓣新建一个渐变对象（<code>:179</code>、<code>:186</code>、<code>:200</code>、<code>:212</code>）。实测每秒约 <span class="num">3,055</span> 次 2D 绘制调用，60 帧不停。</li>
<li>尺牍与园图各有不透明的「地」（<code>lights.css:22</code>、<code>yuantu.css:30</code>），樱瓣在底下照跑：两页分别 <span class="num">3,055</span>、<span class="num">3,069</span> 次/秒，一瓣也看不见。</li>
<li>「翻飞」是 <code>scale(squash, 1)</code> 横向压扁（<code>:198</code>）：正面背面同一个渐变，不受光，转到侧面也不会变成一条线。</li>
<li>运动按帧积分（<code>:143</code> <code>this.x += this.vx</code>，没有 dt）：120 Hz 的 ProMotion 屏上飘得快一倍。</li>
</ul>`)}
${S('提案（台上「提案」）', `<ol>
<li><b>精灵预渲</b>：每个色调正、背两面 × 四档明暗，启动时画一次；帧里只有 <code>drawImage</code>。</li>
<li><b>真三维取向</b>：每瓣一个四元数，局部 x、y 轴的正交投影就是 <code>setTransform</code> 的六个数——还是一块 2D 画布，没有 WebGL。法线朝外看见正面、朝里看见背面（背面浅、带一点透光）；受光几分按法线与窗的夹角选那一档。</li>
<li><b>物理照旧</b>：侧着时下落快、平着时被风兜住，这一条现网就有，只是改成由真实法线决定；积分改按秒，60 / 120 Hz 一样快。</li>
<li><b>按 DPR 建</b>（上限 2）。</li>
<li><b>场所有自己的地就停</b>：尺牍、园图里停画，切回来接着飘（台上不演，落地是 App 传一个 <code>covered</code>）。</li>
<li><b>风从风钟取</b>：「吹一阵」那一下，落地后与尺牍的竹影是同一阵（${goto('base', '底座')}）。</li>
</ol>`)}
${S('不动', '<p>数量公式（<code>:229</code>）、四季色板与冬雪圆粒、夜里星萤自下而上、远景光斑、reduced-motion 只画一帧。</p>')}
${S('代价 · 退路', '<p>精灵约 30 张 64×64 离屏画布（< 0.5 MB）；四元数积分每瓣几十次乘法。台右上角是两种画法各自的每帧耗时，现场量。改动只在 <code>OasisBackground.tsx</code> 一个文件，退回就是还原这个文件。</p>')}`,
  },

  {
    id: 'welcome', name: '入口', p: 'P3', hook: '身份，不改构图；可选「水下的字」',
    say: 'Hello Visitor、OASIS、节气问候是身份，三次选过原版。唯一可选：点一下，涟漪真的荡开，字透过水面折一下再平复。',
    keep: 'Hello Visitor、OASIS 渐变字、节气问候、8 秒自动进园、展卷看园', score: [2, 1, 2, 3],
    shot: './site-next/shots/welcome.jpg', pins: [[50, 58], [50, 93.6], [97, 6.5]],
    caption: '现网入口（昼，1440×900）。① OASIS：font-black 渐变字，blur(20px)→0 用 2.5 秒淡入　② 两扇门：点任意处进园、展卷看园　③ 四角准星与等宽时钟',
    notes: `<span class="k">Welcome</span><h2>入口：不动构图</h2>
${S('现状', `<ul class="ev">
<li>OASIS 是 font-black 的渐变字，<code>OasisGarden.tsx:43–46</code> 用 2.5 秒从 blur(20px) 淡入，首访 8 秒后自动进园（<code>:24–27</code>）。</li>
<li>点击涟漪是 CSS 圆环（<code>App.tsx:53</code> ClickRipples），和字、和「绿洲」这个意思没有关系。</li>
</ul>`)}
${S('判断', '<p>入口是身份。竖排「绿洲」、印章、换字体在「庭的空气」里提过，没采用；整站换皮三次都选了原版（记录在案）。这里不再提。</p>')}
${S('可选一项（P3，要你看过再定）', `<p><b>水下的字</b>：点一下，涟漪从点击处真的荡开，OASIS 透过水面跟着折一下再平复。复用 <code>lib/waterSim.ts</code> 的高度场（有测试）和 <code>lib/gl.ts</code>；只在入口那 3–8 秒里有一块画布，进园就拆。着色照音乐页<b>原版</b>的亮暗环，不做透明写实——原版的水你说过更灵动。</p>
<p class="ev">没做标本：它改的是入口唯一的那次点击，值不值得要你先说一句。</p>`)}`,
  },

  {
    id: 'covers', name: '花园 · 封面', p: 'P2', spec: 'covers',
    hook: '16% 渐变 + 大图标；按月分组右列常空',
    say: '封面条是情绪色 16%→4% 渐变加 13% 的分类图标水印，同分类只差颜色深浅。提案：每类一种纸、受同一束光。另：每月一篇时右列整列空着。',
    keep: '卡片的玻璃、圆角、徽章、标签、hover 抬起；不要求配图', score: [1, 1, 3, 3],
    dayLight: '窗在左上，悬停时随指针略偏',
    notes: `<span class="k">Garden · Covers</span><h2>封面：一条有来由的纸</h2>
${S('现状 · 证据', `<ul class="ev">
<li>封面条 112 px（<code>h-28</code>）= 情绪色 16%→4% 的渐变 + 13% 透明度的分类图标（<code>OasisGallery.tsx:1447–1450</code>）。十篇文章里，同分类的封面只差一个颜色深浅。</li>
<li>栅格 1280 px 以上两列、按月分组（<code>:1434</code>）。眼下每月多是一篇：1440 宽时十月、九月各一张卡，右半边整列空着（左侧截图可见）。</li>
</ul>`)}
${S('提案（只动封面条，卡片照旧）', `<ol>
<li><b>每类一种纸</b>：随笔＝花笺（克利夫兰 1932.125《花鸟》木刻，尺牍已在用）；学习笔记＝帘纹纸加界格（ambientCG Paper004，尺牍在用）；项目复盘＝云纹缎（工坊封面同一张 <code>ling-cloud</code>，Met 69815）。木刻的白＝墨，直接当拱花的高度图。零下载。</li>
<li><b>受光</b>：昼是左上的窗（与尺牍同向），悬停时光随指针偏一点，拱花的明暗跟着走；夜里是烛。色仍是文章自己的情绪色，只是压在纸上。</li>
<li><b>栅格</b>：某月只有一篇时，让它占满两列宽、封面条变长（台上第三张卡演示），右列不再空。</li>
</ol>`)}
${S('不动', '<p>卡片的玻璃、圆角 3xl、徽章、标签、hover 抬起与弹簧；文章不需要配图。</p>')}
${S('代价 · 退路', '<p>每张卡一次 2D 逐像素打光（约 0.18 MP，现场量见右上），只在悬停与换昼夜时重算；落地可以把昼光那一张预烘成 webp。只改卡片里的一个 <code>&lt;div&gt;</code>。</p>')}
<div class="ask"><b>要你定</b>：上午的梳理说过「文章列表不换纸的相」。这一条只碰 112 px 的封面条，仍算换了一点相，所以放 P2：动不动？动的话，三种纸对不对得上三个分类？</div>`,
  },

  {
    id: 'colophon', name: '阅读舱 · 落款', p: 'P1', spec: 'colophon', light: false,
    hook: '中文落款里夹着英文日期；读完钤一方印',
    say: '落款是「写于 Oct 5, 2026 · 秋分」。改成尺牍的写法：干支、节气、七十二候；读到文末，一方园主印落、压、起三拍钤上。',
    keep: '波线、照料于、WorkshopNote、续读、正文排版', score: [2, 2, 2, 4],
    notes: `<span class="k">Reader · Colophon</span><h2>落款：与尺牍同一套写法</h2>
${S('现状 · 证据', `<ul class="ev">
<li>文末落款是一条波线 + 「写于 {date} · {节气}」（<code>OasisReader.tsx:341</code>）。<code>date</code> 来自 <code>useGarden.ts:77</code> 的 en-US 格式，于是中文落款里夹着「Oct 5, 2026」。</li>
<li>节气只到「气」（十五天一换），尺牍的邻居信已经写成「丙午 寒露」这样的干支节气。</li>
</ul>`)}
${S('提案', `<ol>
<li><b>写法</b>：「丙午年 秋分 · 末候 水始涸」。干支、节气、七十二候都由 <code>createdAt</code> 推（节气用现网 <code>lib/solarTerms.ts</code> 的 <code>currentSolarTerm</code> / <code>daysIntoTerm</code>，台上就是 import 的它），与尺牍落款同一套。</li>
<li><b>钤印</b>：读到文末时，一方园主印（园图卷尾那方，克利夫兰 1978.67，CC0，<code>public/yuantu/seals/s00.webp</code>）落、压、起三拍钤上，印泥斑用 <code>inkpad-specks.webp</code>。只在第一次读完这篇时演，再来就静静印在那里（本机记一笔）。</li>
<li><b>字</b>：落款用朱雀仿宋（尺牍 chunk 已自托管、按 unicode-range 切片）。</li>
</ol>`)}
${S('不动', '<p>波线、「照料于」那一行（48 h 阈值）、WorkshopNote、续读进度、正文排版。</p>')}
${S('代价', '<p>七十二候表 72 个词；印一张 181×171 的 webp（27 KB）。只改 <code>Colophon</code> 一个组件。</p>')}
<div class="ask"><b>要你定</b>：七十二候要不要（还是只到节气）？钤印只演第一次，还是每次读完都演？</div>`,
  },

  {
    id: 'vinyl', name: '共鸣 · 唱片', p: 'P1', spec: 'vinyl',
    hook: '光不随盘转；声槽里看得见这张专辑',
    say: '反光弧画在会转的那层里，跟着盘转——真唱片恰好相反。提案：高光钉在光源那边，盘转光不转；七首歌按真实时长排成七条带，响的段落发灰发亮。',
    keep: '玻璃台、转速 20°/s、唱臂弹簧、近景编排、三处水', score: [2, 1, 3, 3],
    notes: `<span class="k">Resonance · Vinyl</span><h2>唱片：盘转，光不转</h2>
${S('现状 · 证据', `<ul class="ev">
<li>声槽是 5 px 周期的 <code>repeating-radial-gradient</code>（<code>OasisResonance.tsx:108</code>）；两层反光弧（<code>:667–670</code>）和贴纸都在 <code>discRef</code> 里，ticker 每帧写 <code>rotate</code>（<code>:233</code>），整块一起转。</li>
<li>真唱片恰好相反：声槽是同心圆，转起来看不出动；反光由光源决定，钉在原地。现在「看起来在转」靠的正是那道转动的反光。</li>
<li>唱臂本该随一首歌的进度扫过半张盘（<code>ARM_START</code> 16° + 13°，<code>:125–126</code>）——但落地时查出它在现网根本不动：ticker 的 <code>written</code> 初值是 <code>NaN</code>，<code>Math.abs(x − NaN) &gt; 0.01</code> 恒为假，进页面后唱臂既不落针也不抬臂（已修）。</li>
<li>唱臂的影子是写死的 <code>1px 2px</code>（<code>:713</code>）。</li>
</ul>`)}
${S('提案（同一张盘、同一个位置、同一种情绪色）', `<ol>
<li><b>盘面换成一块着色器</b>，用 <code>lib/gl.ts</code>——涟漪内页、水琴窟同一套封装，不引 three（台上就是 import 的它）。各向异性高光按声槽切线算（Kajiya–Kay），光在左上就钉在左上；夜里光源是烛，那道「蝴蝶结」会转过去对着指针。</li>
<li><b>声槽显影</b>：这张专辑（夜明け前，七首）按真实时长排成七条带（时长取自 <code>trackFeatures.generated.json</code>），曲间是六道更亮的空槽；每条带里声槽的粗糙度取自 <code>trackPeaks.generated.json</code>——响的段落发灰、高光散开，静的段落黑而锐，对着光能看出副歌在哪。</li>
<li><b>转动交给该动的东西</b>：贴纸的字、几粒灰尘、一道发丝划痕、一点翘曲让高光每圈晃一下。</li>
<li><b>针落在当前曲目那条带里</b>，一首歌只走一条带的宽度。</li>
<li><b>贴纸是纸</b>：纸纤维（<code>public/textures/xuan-fiber.webp</code>，倪瓒《虞山林壑图》留白处）染情绪色，字是压进纸里的，受同一束光。</li>
<li><b>影子按光投</b>：盘与唱臂的影子随窗 / 烛的方向。</li>
</ol>`)}
${S('不动', '<p>唱机的玻璃台、转速 20°/s（现网刻意放慢的，约 18 秒一圈）、唱臂的弹簧手感、悬停播放提示、近景时盘退到舞台左缘的编排；<b>三处水一处不碰</b>。</p>')}
${S('代价 · 退路', '<p>一块盘大小的 WebGL2 画布（约 1000×1000 设备像素）；停着时一帧不画（右上读数可见），转着时每帧一个全屏三角形。拿不到 WebGL2 就是现在的 CSS 盘。落地：<code>discRef</code> 里换一个 <code>resonance/VinylSurface.tsx</code>，ticker 照旧只写一个角度。</p>')}
<div class="ask"><b>要你定</b>：针改成「一首只走一条带」，唱臂的运动小了很多——要不要？</div>`,
  },

  {
    id: 'sand', name: '星图 · 砂', p: 'P1', spec: 'sand',
    hook: '同一张距离场耙出沟来；石影随悉尼的太阳走',
    say: '砂纹是平的描线，石影写死在右下。提案：同一张距离场变成耙出来的沟，光从悉尼的太阳来——早上影子朝西拖长，正午短，傍晚转到东边；夜里同一批沟只剩月光一条亮边。',
    keep: '整个 SVG 层（石、注记、灯笼、桥、拾取、进场编排）、庭记、星卡、时光拨盘', score: [3, 1, 4, 3],
    dayLight: '悉尼的太阳（按日期与时刻）', nightLight: '月在右上（与 Moon.tsx 同位）',
    notes: `<span class="k">Constellation · Sand</span><h2>砂：同一套几何，真的换光</h2>
${S('现状 · 证据', `<ul class="ev">
<li>砂纹是 SVG 描线：三圈等值线（<code>LV = [9, 17, 25]</code>，<code>sandGarden.ts:238</code>）加远处 7 px 一道的直纹（<code>sandScene.ts:618</code>）；线是平的，砂面是一张 <code>paper-cotton</code> 纸纹。</li>
<li>石影是固定偏移的椭圆（<code>sandScene.ts:85</code>：H×0.75, H×0.95），等于太阳永远停在左上同一个高度。</li>
<li>规矩写着「昼为砂庭、夜为星池，同一套几何只换光」——可现在换的只是颜色，光没有方向。</li>
</ul>`)}
${S('提案（同一张距离场、同一批石）', `<ol>
<li>台上直接 import 现网 <code>lib/sandGarden.ts</code>：<code>toSandPosts → layoutGarden → sandField</code>，文章是 Supabase 里的真文章（拿不到就用示例）。「现网」那一面就是用同一套 <code>iso</code> / <code>smooth</code> / <code>stonePath</code> 画的 SVG。</li>
<li>「提案」把距离场上传成一张浮点贴图，着色器把三圈等值线变成三道耙出来的沟、远处变成直沟，再叠细砂粒。</li>
<li><b>光从悉尼的太阳来</b>：按今天的日期与时刻算方位与高度。南半球，正午太阳在北边——屏幕上方——影子朝南、朝下；早上太阳在东，影子朝西长长地拖，傍晚反过来。砂沟一侧受光一侧背光，斜阳时最深。</li>
<li><b>石影的长短是数据</b>：按石高 <code>RH</code>（文章越长越高）和太阳高度算。现网就用 RH 定影长，这里只是让它跟着太阳。</li>
<li><b>夜</b>：光源换成右上角那轮月（与 <code>orchard/Moon.tsx</code> 同位），同一批沟只剩冷光的一条亮边。</li>
<li><b>砂是静的</b>：只有拨时辰、换昼夜、缩放时才画一帧，平时零开销（右上读数）。</li>
</ol>`)}
${S('不动', '<p>SVG 层全留：石的轮廓与斑晶、注记择位、灯笼、桥、拾取、进场耙纹；WebGL 只垫在底下当砂面。夜里的星池、庭记目录、星卡、时光拨盘都不动。</p>')}
${S('代价 · 退路', '<p>一块全屏 WebGL2 画布、一张浮点贴图（<code>sandField</code> 自带 24 万格上限，约 1 MB）。建不起就是现在的样子；SVG 的直纹与等值线在提案里改成透明度 0，退回只是把它调回来。</p>')}
<div class="ask"><b>要你定</b>：太阳按真实时刻（悉尼），还是固定一个好看的斜阳？</div>`,
  },

  {
    id: 'atelier', name: '工坊', p: 'keep', pLabel: '少动', hook: '已达标；可借封面受光与纸声',
    say: '已经是尺牍的水准：Met CC0 云纹缎、竖排题签、红签目录。可借两件小的：封面云纹缎受光（与封面标本同一个打光函数）、册页展开的纸声。',
    keep: '册页构图、题签、目录、FLIP 展开', score: [4, 2, 3, 3],
    shot: './site-next/shots/atelier.jpg', pins: [[50, 25], [36.7, 25], [28, 57.5]],
    caption: '现网工坊（昼）。① 封面：Met 藏云纹缎（ling-cloud）　② 竖排题签「工坊 · 作品册 · 丙午」　③ 目录：第一开 / 第二开 / 第三开',
    notes: `<span class="k">Atelier</span><h2>工坊：少动</h2>
${S('现状', '<p>工坊在 10 月初那轮就按「真材实料有出处」做了：Met Open Access 的云纹缎做封面、竖排题签、红签目录，规矩写在 <code>atelier/atelier.css</code> 文件头。四项里「质」已满格。</p>')}
${S('可借（都不急）', `<ol>
<li><b>封面受光</b>：同一张 <code>ling-cloud</code> 当高度图，昼光左上固定、夜里随指针——与${goto('covers', '封面标本')}同一个打光函数，零新素材。</li>
<li><b>纸声</b>：册页展开时一声轻的，默认关（尺牍实验台里有合成版；也可以换 OpenGameArt 的 CC0 纸声，见全文素材表）。</li>
<li>手写的 FLIP 可换 GSAP <code>Flip</code>（已在 node_modules，3.13 起免费）——只为少维护一段代码，看不出区别。</li>
</ol>`)}`,
  },

  {
    id: 'letters', name: '尺牍', p: 'keep', pLabel: '见实验台', hook: '全站的样板；自身八项在实验台',
    say: '全站的样板。实验台八项里，省显存、闲时 30 帧、纸会弯、洒金会闪、一阵风今天已提交（0935dac、16ca652，未推送）；剩读信景深、信多了怎么摆、纸声。这里只补：樱瓣在它底下照跑；风改从风钟取。',
    keep: '整处', score: [4, 4, 4, 3],
    shot: './site-next/shots/letters.jpg', pins: [[50, 30], [24, 74], [75, 50]],
    caption: '现网尺牍（昼）。① 雪窗《风竹图》竹影：SpotLight.map 当遮光片　② 骑缝印与红签：克利夫兰藏印、洒金　③ 虚席：没封口的空信封',
    notes: `<span class="k">Letters</span><h2>尺牍：样板</h2>
${S('自身', `<p>八项改进在 <a href="/docs/chidu-next.html" target="_blank">docs/chidu-next.html</a>。今天已经落地两批：<code>0935dac</code>（阴影图 1024、骑缝印共用贴花、笺移近才画、闲时 30 帧）与 <code>16ca652</code>（纸会弯、洒金会闪、一阵风），都还没推送。剩下要拍板的是 P2：读信景深、纸声、错落叠放（第四位邻居来之前要定）。</p><p class="ev">底座表里尺牍夜里 lt-gl 30 帧，就是 0935dac 的闲时降帧在起作用。</p>`)}
${S('这一份补的两条', `<ul>
<li><b>樱瓣在它底下照跑</b>：尺牍的地是不透明的（<code>lights.css:22</code>），实测樱瓣画布仍 60 帧、每秒 3,055 次绘制。归${goto('petals', '樱瓣')}那一条修。</li>
<li><b>风</b>：16ca652 的「一阵风」已经让竹影、封舌、烛、笺同一阵；落地风钟时把它的 <code>gust</code> 挪进 <code>lib/ambient.ts</code>，樱瓣也取这一个（${goto('base', '底座')}），从尺牍切去花园，风不断。</li>
</ul>`)}
${S('它借给全站的', '<p>窗的方向（左上）、夜里烛随指针、落款的干支节气写法、「画归画点归点」、画布自建自拆——这一份里每个标本都照这几条做。</p>')}`,
  },

  {
    id: 'yuantu', name: '园图', p: 'P0', hook: '卷静止时仍 60 帧；贴图可压 KTX2',
    say: '质、光、动都满格。省：卷静止时 yt-gl 仍 60 帧、每秒 241 次绘制，浮尘 22 帧；常驻最多 9 张 2048×1100 切片，未压缩约 108 MB。',
    keep: '整卷：解带、签条摆、钤印、烛照绢纹、浮尘', score: [4, 4, 4, 1],
    shot: './site-next/shots/yuantu.jpg', pins: [[50, 48], [3.6, 46], [32, 80]],
    caption: '现网园图（昼，卷首）。① 引首「绿洲」与题跋　② 左轴：纸长决定卷筒粗细　③ 浮尘层（2D 画布，22 帧/秒）',
    notes: `<span class="k">Yuantu</span><h2>园图：只省，不改</h2>
${S('现状 · 实测', `<ul class="ev">
<li>卷静止不动时，<code>yt-gl</code> 仍 <span class="num">60</span> 帧/秒、每秒 <span class="num">241</span> 次绘制；浮尘 2D 层 <span class="num">22</span> 帧/秒、每秒 412 次。</li>
<li>卷切 20 片 2048×1100，显卡常驻最多 9 片，未压缩约 9 × 12 MB ≈ 108 MB（上午实验台的估算）。</li>
<li>樱瓣画布在它底下 60 帧，看不见。</li>
</ul>`)}
${S('提案', `<ol>
<li><b>静了就停</b>：卷没在动、没有补间、签条摆停了，就不画；夜里烛闪降到 15 帧。浮尘留着（你拍板过），降到 15 帧看不出差别。</li>
<li><b>贴图压成 KTX2</b>：UASTC 约 ¼、ETC1S 约 ⅛；three 自带 <code>KTX2Loader</code>，basis 转码器只进园图那一包。</li>
</ol>`)}
${S('不动', '<p>整卷的一切：解带只给第一次来的人、签条阻尼摆、卷尾钤印、烛照绢纹、浮尘。</p>')}`,
  },

  {
    id: 'base', name: '底座 · 一光一风', p: 'P0', hook: '一束光、一阵风、画的节制；实测表',
    say: '三件小东西给所有场所：lib/ambient（光的方向、风钟）、画的节制（被盖住就停、静了就降）、纸的工具箱。实测：樱瓣在每一页都 60 帧，包括看不见的两页。',
    keep: '—', score: [3, 0, 2, 1],
    stageHtml: `<div style="width:min(860px,100%);font-size:13.5px;line-height:1.8">
      <div style="font:10px/1 var(--mono);letter-spacing:.3em;color:var(--teal-ink);text-transform:uppercase">Measured · 2026-10-25</div>
      <h2 style="font:500 22px/1.4 var(--zh);margin:8px 0 4px">各页闲着时在画什么</h2>
      <p style="color:var(--ink2);margin:0 0 6px">headless Chrome，1440×900，devicePixelRatio 2；每页进场后等 7 秒，再量 3 秒。</p>
      <div class="notes" style="border:0;padding:0;overflow:visible">${measureTable}</div></div>`,
    notes: `<span class="k">Base</span><h2>底座：一束光、一阵风、画的节制</h2>
<p class="lede">各处各打各的光，是全站看起来「不是一座园子」的主要原因。这一件不显山露水，但其余每一条都站在它上面。</p>
${S('一 · lib/ambient.ts', `<ul>
<li><code>light(t, night, pointer)</code> → 方向、颜色、强度。昼＝左上的窗（尺牍已定的方向）；星图例外，按悉尼的太阳；夜＝烛随指针（尺牍、封面、唱片）或月（星图）。</li>
<li><code>gust(t)</code> 风钟：樱瓣、竹影、没封口的封舌、园图浮尘同一阵。看不出来也无妨，看出来的人会觉得这是一座园子。</li>
<li>CSS 侧只出两个变量 <code>--sdx</code> / <code>--sdy</code>（影子方向），玻璃卡的投影可以慢慢接上，不急。</li>
</ul>`)}
${S('二 · 画的节制', `<ul>
<li>一个 <code>useFrameBudget</code>：场所被盖住（有自己的地）就停；没有补间、指针不动就降到 0 / 15 / 30 帧。</li>
<li>验收就是左边这张表：樱瓣在尺牍、园图两页应为 0；园图静止时 yt-gl 应为 0。</li>
</ul>`)}
${S('三 · 纸的工具箱 lib/paper/', '<p>上午实验台提过：<code>yuantu/scrollScene.ts</code> 与 <code>lights/letterScene.ts</code> 各写了一份 <code>loadImg</code>、<code>mk</code>、纸色叠印。再加本页封面与工坊要用的<b>拱花打光函数</b>，收成一处。</p>')}
${S('实测', '<p>见左边的表。</p>')}`,
  },
];

export const FULL = `
<span class="kick" style="font:10px/1 var(--mono);letter-spacing:.3em;color:var(--teal-ink);text-transform:uppercase">Notes · 全站梳理</span>
<h2>借尺牍的光，逐处看全站</h2>
<p class="lede">${MODULES[0].say}</p>

<h3>壹 · 尺牍立下的四条做法<small>拿来量每一处</small></h3>
<ol>
<li><b>真材实料，有出处。</b>每张图有馆藏号与许可：克利夫兰 1625 年《花鸟》木刻作花笺淡印与拱花，雪窗《风竹图》作竹影，ambientCG 帘纹作信封。不画「像纸的渐变」。</li>
<li><b>昼夜换的是光源，不是调暗。</b>昼是窗与竹影（<code>SpotLight.map</code> 当遮光片），夜是秉烛、烛跟指针。</li>
<li><b>动有来由。</b>封舌先被纸的硬挺拖住再翻；防穿模三条写在文件头。</li>
<li><b>画归画，点归点。</b>WebGL 只负责好看；可点、可聚焦、能 ⌘ 直达、读屏能念的是 DOM。引擎不进 React，画布自建自拆，建不起就退回。</li>
</ol>

<h3>贰 · 逐处<small>点名字去看标本或说明牌</small></h3>
<table>
<tr><th>处</th><th>判断</th><th>做什么</th><th>顺序</th></tr>
${MODULES.slice(1).map((m) => `<tr><td><a href="#${m.id}" data-go="${m.id}">${m.name}</a></td><td>${m.say}</td><td>不动：${m.keep}</td><td>${m.pLabel ?? m.p}</td></tr>`).join('')}
</table>

<h3>叁 · 可引入的包与素材<small>许可核过才列；能不下载就不下载</small></h3>
<table>
<tr class="sub"><td colspan="3">已在仓库里，零下载</td></tr>
<tr><td><code>lib/gl.ts</code>（自家）</td><td>唱片盘面、砂面、入口的水都用它：一个全屏三角形 + 一段片元着色器，不引 three</td><td>—</td></tr>
<tr><td>three 0.170</td><td>已用在尺牍、园图；<code>KTX2Loader</code> 给园图压贴图；<code>PMREMGenerator</code> 给洒金（实验台）</td><td>MIT</td></tr>
<tr><td>GSAP 3.15 全部插件</td><td>CustomEase 已用；钤印三拍、Flip（工坊）、SplitText、CustomWiggle（风掀封舌）、InertiaPlugin</td><td>3.13 起插件全部免费、随 npm 包发</td></tr>
<tr><td><code>trackPeaks</code> / <code>trackFeatures</code>.generated.json</td><td>唱片声槽显影的数据：响度包络、真实时长</td><td>自家生成</td></tr>
<tr><td><code>lib/sandGarden.ts</code>、<code>lib/waterSim.ts</code></td><td>砂面的距离场、入口水的高度场（都有测试）</td><td>自家</td></tr>
<tr class="sub"><td colspan="3">public/ 里已有、出处在 CREDITS 的素材</td></tr>
<tr><td>《花鸟》木刻三块 <code>lights/motif/</code></td><td>随笔封面的拱花与淡印</td><td>克利夫兰 1932.125，CC0</td></tr>
<tr><td>帘纹 <code>lights/tex/laid-n.webp</code></td><td>学习笔记封面</td><td>ambientCG Paper004，CC0</td></tr>
<tr><td>云纹缎 <code>textures/ling-cloud.webp</code></td><td>项目复盘封面、工坊封面受光</td><td>清《云纹缎》残片，Met 69815，CC0（出处在 <code>atelier.css</code> 文件头）</td></tr>
<tr><td>纸纤维 <code>textures/xuan-fiber.webp</code></td><td>唱片贴纸的纸</td><td>倪瓒《虞山林壑图》留白处，Met 1973.120.8，CC0（同上）</td></tr>
<tr><td>园主印 <code>yuantu/seals/s00.webp</code>、印泥斑 <code>textures/inkpad-specks.webp</code></td><td>落款钤印</td><td>克利夫兰 1978.67，CC0</td></tr>
<tr class="sub"><td colspan="3">要下载，等你点头</td></tr>
<tr><td>OpenGameArt「Various Paper Sound Effects」</td><td>纸声（拆信、展卷、册页），比 WebAudio 合成真</td><td>页面标 CC0，Luckius 2021，七段、zip 约 974 KB（<a href="https://opengameart.org/node/127323" target="_blank" rel="noopener">opengameart.org/node/127323</a>）</td></tr>
<tr><td>ShareTextures「Ground 4」砂地</td><td>只在程序砂粒近看不够真时</td><td>页面标 CC0（<a href="https://sharetextures.com/textures/ground/ground-4" target="_blank" rel="noopener">sharetextures.com</a>）；ambientCG 的砂没查到具体编号</td></tr>
<tr><td>pmndrs/postprocessing</td><td>只在真要做景深、泛光时；眼下自写两遍高斯够</td><td>Zlib（<a href="https://github.com/pmndrs/postprocessing" target="_blank" rel="noopener">GitHub</a>）</td></tr>
<tr class="sub"><td colspan="3">不建议</td></tr>
<tr><td>three 升级 ／ WebGPU</td><td>没有非它不可的功能，三处引擎都要回归</td><td>—</td></tr>
<tr><td>Theatre.js Studio</td><td>可视化关键帧</td><td>编辑器是 AGPL；GSDevTools 够调手感</td></tr>
<tr><td>物理引擎做纸、做樱瓣</td><td>—</td><td>解析解确定、可测、零依赖，够用</td></tr>
<tr><td>Poliigon、Soundstripe、Artlist</td><td>砂、纸声</td><td>商用订阅，不是 CC0</td></tr>
</table>

<h3>肆 · 建议的顺序</h3>
<ul>
<li><b>P0 看不见、纯更好</b>：樱瓣（DPR、精灵、被盖住就停）；园图静止停画；<code>useFrameBudget</code>。验收是底座那张实测表。</li>
<li><b>P1 看得见、不换相</b>：唱片的光与声槽；砂面受光、石影随日；落款钤印；樱瓣三维翻面。各自一个文件，各自能退。</li>
<li><b>P2 要你拍板</b>：封面的纸与月份栅格。</li>
<li><b>P3 以后</b>：入口「水下的字」；风钟串起樱瓣、竹影与浮尘；纸声扩到工坊与园图。</li>
</ul>

<h3>伍 · 待你定</h3>
<ol>
<li>唱针改成「一首只走一条带」——针的运动小了，要不要？</li>
<li>星图的太阳：真实时刻（悉尼），还是固定一个好看的斜阳？</li>
<li>封面：动不动？动的话三种纸对不对得上三个分类？</li>
<li>落款：七十二候要不要？钤印只演第一次，还是每次？</li>
</ol>

<h3>出处</h3>
<p class="src">本页没有下载任何新文件：素材全部来自 <code>public/lights</code>、<code>public/yuantu</code>、<code>public/textures</code>；数据来自 <code>src/data/*.generated.json</code> 与 Supabase 的真文章。字：EB Garamond、JetBrains Mono、霞鹜文楷、朱雀仿宋、Klee One、IM Fell English SC（均 OFL，npm 自托管）。核对许可用到的页面：<a href="https://opengameart.org/node/127323" target="_blank" rel="noopener">OpenGameArt 纸声</a>、<a href="https://sharetextures.com/textures/ground/ground-4" target="_blank" rel="noopener">ShareTextures Ground 4</a>、<a href="https://github.com/pmndrs/postprocessing" target="_blank" rel="noopener">pmndrs/postprocessing</a>。</p>
`;
