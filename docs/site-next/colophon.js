// 标本 · 阅读舱的落款。
//   现网：OasisReader.tsx:328 Colophon——波线 + 「写于 {en-US 日期} · {节气}」。
//   提案：与尺牍落款同一套写法——干支年、节气、七十二候（都由 createdAt 推，节气用现网 lib/solarTerms.ts）；
//         读到文末时一方园主印落、压、起三拍钤上（只第一次演）。
import { gsap } from 'gsap';
import { currentSolarTerm, daysIntoTerm } from '/src/lib/solarTerms.ts';
import { supabase } from '/src/lib/supabase.ts';

const GAN = '甲乙丙丁戊己庚辛壬癸', ZHI = '子丑寅卯辰巳午未申酉戌亥';
// 七十二候（《逸周书·时训解》通行本），每节气三候，五日一候
const HOU = {
  立春: ['东风解冻', '蛰虫始振', '鱼陟负冰'], 雨水: ['獭祭鱼', '候雁北', '草木萌动'], 惊蛰: ['桃始华', '仓庚鸣', '鹰化为鸠'],
  春分: ['玄鸟至', '雷乃发声', '始电'], 清明: ['桐始华', '田鼠化为鴽', '虹始见'], 谷雨: ['萍始生', '鸣鸠拂其羽', '戴胜降于桑'],
  立夏: ['蝼蝈鸣', '蚯蚓出', '王瓜生'], 小满: ['苦菜秀', '靡草死', '麦秋至'], 芒种: ['螳螂生', '鵙始鸣', '反舌无声'],
  夏至: ['鹿角解', '蜩始鸣', '半夏生'], 小暑: ['温风至', '蟋蟀居宇', '鹰始挚'], 大暑: ['腐草为萤', '土润溽暑', '大雨时行'],
  立秋: ['凉风至', '白露降', '寒蝉鸣'], 处暑: ['鹰乃祭鸟', '天地始肃', '禾乃登'], 白露: ['鸿雁来', '玄鸟归', '群鸟养羞'],
  秋分: ['雷始收声', '蛰虫坯户', '水始涸'], 寒露: ['鸿雁来宾', '雀入大水为蛤', '菊有黄华'], 霜降: ['豺乃祭兽', '草木黄落', '蛰虫咸俯'],
  立冬: ['水始冰', '地始冻', '雉入大水为蜃'], 小雪: ['虹藏不见', '天气上升地气下降', '闭塞而成冬'], 大雪: ['鹖鴠不鸣', '虎始交', '荔挺出'],
  冬至: ['蚯蚓结', '麋角解', '水泉动'], 小寒: ['雁北乡', '鹊始巢', '雉始雊'], 大寒: ['鸡始乳', '征鸟厉疾', '水泽腹坚'],
};
const ganzhi = (d) => {
  // 干支纪年以立春为界（现网节气表近似立春 2 月 4 日）
  const y = d.getMonth() < 1 || (d.getMonth() === 1 && d.getDate() < 4) ? d.getFullYear() - 1 : d.getFullYear();
  return GAN[(y - 4) % 10] + ZHI[(y - 4) % 12];
};
const houOf = (d) => { const t = currentSolarTerm(d).name, i = Math.min(2, Math.floor(daysIntoTerm(d) / 5)); return { term: t, idx: i, name: HOU[t]?.[i] ?? '' }; };
const enDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// 与现网阅读舱同一篇：建筑杂谈。正文末几段、写于与照料于都从 Supabase 取真的；取不到用截图里看得见的几句
const POST_ID = '360f9ceb-6560-469b-9145-64332f00d787';
const FALLBACK = { title: '建筑杂谈', created: new Date(2026, 9, 5), updated: null, color: '#39C5BB',
  paras: ['而结构有加法，减法。', '加法可以增加面数，为后期的多角度美感做准备。', '可以降低封闭感与视角呼应，同时创造出灰空间。'] };
const loadPost = async () => {
  try {
    const { data, error } = await supabase.from('garden_posts').select('title,created_at,updated_at,color,content').eq('id', POST_ID).single();
    if (error || !data) throw error;
    const created = new Date(Number(data.created_at)), updated = Number(data.updated_at) || 0;
    const paras = String(data.content || '').replace(/```[\s\S]*?```/g, '').split(/\n+/)
      .map((l) => l.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^[#>*\-\s]+/, '').replace(/[*_`]/g, '').trim())
      .filter((l) => l.length > 1).slice(-7);
    return { title: data.title, created, updated: updated - created.getTime() > 48 * 3600e3 ? new Date(updated) : null, color: data.color || '#39C5BB', paras, real: true };
  } catch { return FALLBACK; }
};

export async function mount(host, ctx) {
  const POST = await loadPost();
  const c = houOf(POST.created), u = POST.updated ? houOf(POST.updated) : null;
  host.innerHTML = `
  <style>
    .cl { position:absolute; inset:0; overflow:auto; background:#FAF8F3; }
    body.night .cl { background:#0A0F1D; }
    .cl-col { width:min(672px, calc(100% - 48px)); margin:0 auto; padding:56px 0 160px; font:17px/2.35 var(--zh); color:#334155; letter-spacing:.02em; }
    body.night .cl-col { color:#CBD5E1; }
    .cl-col p { margin:0 0 .2em; }
    .cl-col .gap { height:1.2em; }
    .cl-end { margin-top:64px; display:flex; flex-direction:column; align-items:center; gap:12px; user-select:none; min-height:230px; }
    .cl-end .live { font:italic 12px/1.8 var(--serif); color:#94A3B8; text-align:center; letter-spacing:.03em; }
    body.night .cl-end .live { color:#64748B; }
    .cl-next { position:relative; display:flex; flex-direction:row-reverse; align-items:flex-start; gap:16px; margin-top:2px; }
    .cl-next .main { display:flex; flex-direction:column; align-items:center; gap:14px; }
    .cl-next .v { writing-mode:vertical-rl; font:400 15px/1.9 var(--song); letter-spacing:.32em; color:#5B6676; }
    body.night .cl-next .v { color:#AEB7C4; }
    .cl-next .v small { font-size:12px; color:#94A3B8; letter-spacing:.24em; }
    .cl-next .v.sub { font-size:13px; color:#94A3B8; }
    .cl-seal { position:relative; width:58px; height:55px; margin-top:4px; }
    .cl-seal img { position:absolute; inset:0; width:100%; height:100%; mix-blend-mode:multiply; opacity:.92; }
    body.night .cl-seal img { mix-blend-mode:screen; filter:saturate(.9) brightness(.95); opacity:.78; }
    .cl-seal i { position:absolute; inset:-30%; background:url(/textures/inkpad-specks.webp) center/80px; opacity:0; mix-blend-mode:multiply; pointer-events:none; }
    .cl-replay { margin-top:14px; font-size:12px; color:#94A3B8; border:1px solid rgba(148,163,184,.4); border-radius:999px; padding:3px 12px; }
  </style>
  <div class="cl"><div class="cl-col">
    ${POST.paras.map((t) => `<p>${t.replace(/[<>&]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m]))}</p>`).join('')}
    <div class="cl-end" aria-label="落款">
      <svg width="120" height="10" viewBox="0 0 120 10" aria-hidden="true"><path d="M0 5 Q15 0 30 5 T60 5 T90 5 T120 5" fill="none" stroke="${POST.color}" stroke-width="1" opacity=".55"/></svg>
      <div class="slot"></div>
    </div>
  </div></div>`;
  const slot = host.querySelector('.slot'), scroller = host.querySelector('.cl'), end = host.querySelector('.cl-end');
  let mode = ctx.v, tl = null, played = false;

  const render = () => {
    tl?.kill(); tl = null;
    if (mode === 'live') {
      slot.innerHTML = `<div class="live">写于 ${enDate(POST.created)} · ${c.term}${u ? `<br>照料于 ${enDate(POST.updated)} · ${u.term}` : ''}</div>`;
      return;
    }
    slot.innerHTML = `<div class="cl-next">
        <div class="main"><div class="v">${ganzhi(POST.created)}年${c.term}<small>　${['初', '次', '末'][c.idx]}候　${c.name}</small></div>
        <div class="cl-seal" aria-label="园丁之印"><img src="/yuantu/seals/s00.webp" alt=""><i></i></div></div>
        ${u ? `<div class="v sub">照料于${u.term}　${['初', '次', '末'][u.idx]}候 ${u.name}</div>` : ''}
      </div>
      <button class="cl-replay">再钤一次</button>`;
    slot.querySelector('.cl-replay').addEventListener('click', () => stamp(true));
    if (played) stamp(false);
  };
  // 钤印三拍：落（离纸、略大、偏一点）→ 压（贴纸、略扁、印泥斑一闪）→ 起（回正，留下印）
  const stamp = (animate) => {
    const seal = slot.querySelector('.cl-seal'); if (!seal) return;
    const img = seal.querySelector('img'), spk = seal.querySelector('i');
    tl?.kill();
    if (!animate || ctx.reduce) { gsap.set(img, { opacity: .92, scale: 1, rotate: -2, y: 0 }); return; }
    tl = gsap.timeline()
      .set(img, { opacity: 0, scale: 1.35, rotate: -9, y: -26, filter: 'blur(2px)' })
      .to(img, { opacity: .5, scale: 1.08, rotate: -4, y: -4, filter: 'blur(.6px)', duration: .42, ease: 'power2.in' })
      .to(img, { opacity: .96, scale: .97, scaleY: .94, rotate: -2, y: 0, filter: 'blur(0px)', duration: .12, ease: 'power1.out' })
      .to(spk, { opacity: .35, duration: .08 }, '<')
      .to(spk, { opacity: 0, duration: .9, ease: 'power2.out' }, '>')
      .to(img, { scale: 1, scaleY: 1, opacity: .92, duration: .5, ease: 'elastic.out(1, .6)' }, '<');
  };
  // 读到文末才钤（只第一次）；台上滚到底就演
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && mode === 'next' && !played) { played = true; stamp(true); } }, { root: scroller, threshold: .6 });
  io.observe(end);
  ctx.bar.innerHTML = `<button class="b" data-end>滚到文末</button><span class="sep"></span><span style="font-size:12px;color:var(--ink3)">${POST.title} · ${POST.real ? '正文末几段取自 Supabase' : '示例（取不到 Supabase）'}</span>`;
  ctx.bar.querySelector('[data-end]').addEventListener('click', () => end.scrollIntoView({ behavior: ctx.reduce ? 'auto' : 'smooth', block: 'center' }));
  ctx.perf(`节气：现网 lib/solarTerms.ts\n${ganzhi(POST.created)} · ${c.term} 第 ${daysIntoTerm(POST.created) + 1} 日 → ${['初', '次', '末'][c.idx]}候`);
  render();
  return {
    setMode(v) { mode = v; render(); if (v === 'next' && !played && end.getBoundingClientRect().top < host.getBoundingClientRect().bottom) { played = true; stamp(true); } },
    setNight() {},
    destroy() { tl?.kill(); io.disconnect(); },
  };
}
