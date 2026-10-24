// 📜 园图：全站的总图，也是地标——仇英《独乐园图》卷，七景对到现网的去处。
//   不是 Dock 上的第五处：入口页「展卷看园」与 ⌘K 是它的两扇门；从哪一处进来，卷就展到哪一景（签条上标「你在这里」）。
//   做成懒加载的场所而不是另开一页：整页跳转会把正在放的歌掐断，three.js 也照样单独成包、不进首屏。
//   卷本身在 yuantu/scrollScene.ts（WebGL，不进 React）；这里只管页头的问候、页脚的近况（借景）与几个按钮。
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { AppView } from '../types/auth';
import type { BlogPost } from '../hooks/useGarden';
import { usePlayer } from '../hooks/useSoundscape';
import { useCoarsePointer } from '../hooks/useCoarsePointer';
import { PLACE_NAME, type Place } from '../lib/places';
import { currentSolarTerm, daysIntoTerm } from '../lib/solarTerms';
import { PROJECTS } from '../data/projects';
import { FRIENDS } from '../data/friends';
import { SCENES, SCENE_OF, sceneById, yStore, cn, type Scene } from './yuantu/scenes';
import { createScrollScene, hasWebGL2, type RollState, type ScrollScene } from './yuantu/scrollScene';
import './yuantu/yuantu.css';

// 素材根：默认随站点部署在 public/yuantu；挪到 R2 时设 VITE_YUANTU_BASE（与 VITE_AUDIO_BASE 同一种做法）
const BASE = ((import.meta.env.VITE_YUANTU_BASE as string | undefined) || '/yuantu').replace(/\/$/, '');

// 七十二候取每个节气的初候，问候里「寒露 · 第九日 / 鸿雁来宾 酉时」
const HOU: Record<string, string> = {
  小寒: '雁北乡', 大寒: '鸡始乳', 立春: '东风解冻', 雨水: '獭祭鱼', 惊蛰: '桃始华', 春分: '玄鸟至',
  清明: '桐始华', 谷雨: '萍始生', 立夏: '蝼蝈鸣', 小满: '苦菜秀', 芒种: '螳螂生', 夏至: '鹿角解',
  小暑: '温风至', 大暑: '腐草为萤', 立秋: '凉风至', 处暑: '鹰乃祭鸟', 白露: '鸿雁来', 秋分: '雷始收声',
  寒露: '鸿雁来宾', 霜降: '豺乃祭兽', 立冬: '水始冰', 小雪: '虹藏不见', 大雪: '鹖鴠不鸣', 冬至: '蚯蚓结',
};
const ZHI = '子丑寅卯辰巳午未申酉戌亥';
const SP = '\u3000';   // 全角空格：中文句读间的留白（lint 不许字面量）
const md = (ms: number) => { const d = new Date(ms); return `${cn(d.getMonth() + 1)}月${cn(d.getDate())}日`; };
const isPlace = (v?: AppView): v is Place => !!v && v in PLACE_NAME;

interface OasisYuantuProps {
  /** 从哪一处进来（App 记的上一处）；直接打开 #/yuantu 时没有 */
  from?: AppView;
  /** 地址里的景：#/yuantu/<景>，开卷后展到这一景 */
  scene?: string;
  posts: BlogPost[];
  isDark: boolean;
  onEnter: (view: AppView) => void;
  onBack: () => void;
}

export const OasisYuantu = ({ from, scene, posts, isDark, onEnter, onBack }: OasisYuantuProps) => {
  const reduce = !!useReducedMotion();
  const coarse = useCoarsePointer();
  const [gl, setGl] = useState(hasWebGL2);
  const rootRef = useRef<HTMLDivElement>(null);
  const dustRef = useRef<HTMLCanvasElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const miniRef = useRef<HTMLDivElement>(null);
  const winRef = useRef<HTMLDivElement>(null);
  const engine = useRef<ScrollScene | null>(null);
  // 卷只建一次，回调走 ref，永远调到 App 最新的那一个
  const enterRef = useRef(onEnter);
  useEffect(() => { enterRef.current = onEnter; }, [onEnter]);
  const [ready, setReady] = useState(false);
  const [roll, setRoll] = useState<RollState>('closed');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [primary, setPrimary] = useState('解带展卷');
  const [toast, setToast] = useState<string | null>(null);
  const here = isPlace(from) ? SCENE_OF[from] : undefined;
  const start = sceneById(scene)?.id ?? here;

  // 问候只在进门那一刻算一次：上次停在哪、隔了几天、园里新长了几篇
  const [greet] = useState(() => {
    const visits = yStore.get('visits', 0), lastAt = yStore.get('lastAt', 0);
    const lastId = yStore.get<string | null>('last', null), rolled = yStore.get('rolled', false);
    if (!visits) return { b: isDark ? '夜深了，灯下展卷。' : '初来。', resume: null as Scene | null, rest: null as string | null };
    const days = Math.max(0, Math.round((Date.now() - lastAt) / 864e5));
    const fresh = posts.filter((p) => p.createdAt > lastAt).length;
    return {
      b: rolled ? '又来了。上回游完一周。' : days ? `别来${cn(Math.min(days, 99))}日。` : '又见。',
      resume: start ? null : sceneById(lastId) ?? null,
      rest: fresh ? `园中新长${cn(fresh)}篇` : '园中如故',
    };
  });
  useEffect(() => { yStore.set('visits', yStore.get('visits', 0) + 1); yStore.set('lastAt', Date.now()); }, []);

  const term = currentSolarTerm();
  const now = new Date();

  // 卷：挂载即建，卸载即拆（GPU 资源全部释放）
  useEffect(() => {
    if (!gl) return;
    const r = rootRef.current, d = dustRef.current, b = bandRef.current, t = trackRef.current, m = miniRef.current, w = winRef.current;
    if (!r || !d || !b || !t || !m || !w) return;
    let toastTimer = 0;
    try {
      engine.current = createScrollScene({
        root: r, dust: d, band: b, track: t, mini: m, miniWin: w,
        base: BASE, night: isDark, reduce, coarse, start, here,
        placeName: (s) => (s.to ? PLACE_NAME[s.to] : null),
        onFocus: setFocusId,
        onPrimary: setPrimary,
        onState: setRoll,
        onEnter: (s) => { if (s.to) enterRef.current(s.to); },
        onToast: (text) => { setToast(text); window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => setToast(null), 2600); },
        onReady: () => setReady(true),
      });
    } catch (err) {
      // 显卡建不起 WebGL 上下文（驱动黑名单、上下文数用尽等）：退回「七景的门」，别让整站跟着白屏
      console.warn('[yuantu] 卷没能展开，退回七景列表', err);
      queueMicrotask(() => setGl(false));
      return;
    }
    return () => { window.clearTimeout(toastTimer); engine.current?.destroy(); engine.current = null; };
    // 卷只建一次：昼夜另有一处跟着走，进出走 enterRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  const firstNight = useRef(true);
  useEffect(() => {
    if (firstNight.current) { firstNight.current = false; return; }
    engine.current?.setNight(isDark);
  }, [isDark]);

  // 借景：签条落下时，页脚写那一处此刻的样子
  const track = usePlayer((s) => s.track);
  const playing = usePlayer((s) => s.isPlaying);
  const latest = useMemo(() => posts.reduce<BlogPost | null>((a, p) => (!a || p.createdAt > a.createdAt ? p : a), null), [posts]);
  const near = (s: Scene): ReactNode => {
    switch (s.to) {
      case 'soundscape': return <>{playing ? '正在放' : '唱机上是'}：<em>{track.title}</em> · {track.artist}</>;
      case 'garden': return latest ? <>新近一篇：<em>{latest.title}</em> · {md(latest.createdAt)}</> : '还没有种下文章。';
      case 'atelier': return <>{cn(PROJECTS.length)}件作品：{PROJECTS.map((p) => p.title).join(' · ')}</>;
      case 'lights': {
        // 尺牍页总留一只空信封（虚席以待）
        return <>邻家来信<em>{cn(FRIENDS.length)}</em>封，虚一席以待</>;
      }
      case 'orchard': return <>登台望全园：{cn(posts.length)}块石，{cn(new Set(posts.map((p) => p.type)).size)}处庭</>;
      default: return '尚未开园。';
    }
  };
  const focus = sceneById(focusId);
  const backLabel = isPlace(from) ? `回到${PLACE_NAME[from]}` : '回到入口';

  return (
    <div
      ref={rootRef}
      className="oasis-yuantu"
      data-roll={roll}
      data-ready={ready ? '' : undefined}
      style={{ '--yt-paper': `url(${BASE}/tex/yinshou-paper.webp)` } as CSSProperties}
      aria-label="园图 · 仇英《独乐园图》卷"
    >
      <div className="yt-ground" aria-hidden><i /></div>
      <h1 className="sr-only">园图：绿洲园中七景</h1>

      {gl ? (
        <>
          <div className="yt-head">
            <div className="yt-say">
              <b>{greet.b}</b>
              {greet.rest === null
                ? <>向左展卷，园中七景，<em>走到哪处便进哪处</em>。</>
                : <>
                  {greet.resume && <>上次停在<em>{greet.resume.name}</em><button type="button" onClick={() => engine.current?.goToScene(greet.resume!.id)}>接着走</button>；</>}
                  {greet.rest}。
                </>}
            </div>
            <div className="yt-now">
              <b>{term.name} · 第{cn(daysIntoTerm(now) + 1)}日</b><br />
              {HOU[term.name] ?? ''}{SP}{ZHI[Math.floor(((now.getHours() + 1) % 24) / 2)]}时
            </div>
          </div>
          <div ref={bandRef} className="yt-band" aria-roledescription="手卷" aria-label="仇英《独乐园图》卷" tabIndex={0}>
            <div ref={trackRef} className="yt-track" />
          </div>
          <canvas ref={dustRef} className="yt-dust" aria-hidden />
          <div className="yt-untie">
            <button type="button" onClick={() => engine.current?.unroll()}>解带展卷</button>
            <small>卷首题签：绿洲园图{SP}轻点卷轴，或按回车</small>
          </div>
          <div className="yt-foot">
            <div ref={miniRef} className="yt-mini" aria-label="全卷缩略">
              <div className="ms"><img src={`${BASE}/scroll/mini.webp`} alt="" draggable={false} /><div ref={winRef} className="win" /></div>
            </div>
            <div>
              <p className="yt-near" aria-live="polite">
                {focus ? <><b>{focus.name} · {focus.to ? PLACE_NAME[focus.to] : '未开'}</b>{near(focus)}</> : null}
              </p>
              <p className="yt-hint">
                {coarse
                  ? `左右滑动展卷${SP}签条落下处轻点即入`
                  : <>滚轮、拖动或 <kbd>←</kbd> <kbd>→</kbd> 展卷{SP}签条落下处可入{SP}夜里指针是一支烛</>}
              </p>
            </div>
            <button type="button" className="yt-go" onClick={() => engine.current?.primary()}>
              <svg viewBox="0 0 16 16" aria-hidden><path d="M14 8H2M6 4L2 8l4 4" /></svg><span>{primary}</span>
            </button>
          </div>
          {/* 出口：Dock 在园图里收起，回去的路放在右上角（时钟原来的位置），一眼看得到 */}
          <button type="button" className="yt-back yt-exit" onClick={onBack}>
            <svg viewBox="0 0 14 14" aria-hidden><path d="M12 7H2M6 3L2 7l4 4" /></svg>{backLabel}
          </button>
          <div className={`yt-toast ${toast ? 'on' : ''}`} role="status">{toast}</div>
        </>
      ) : (
        <div className="yt-nogl">
          <p>这卷画要用 WebGL2 才展得开，当前浏览器没有开。<br />园中七景，从这里也能去：</p>
          <ul>
            {SCENES.map((s) => (
              <li key={s.id}>
                {s.to ? <button type="button" onClick={() => onEnter(s.to!)}>{s.name} · {PLACE_NAME[s.to]}</button> : <span>{s.name} · 未开</span>}
              </li>
            ))}
          </ul>
          <button type="button" className="yt-back" onClick={onBack}>
            <svg viewBox="0 0 14 14" aria-hidden><path d="M12 7H2M6 3L2 7l4 4" /></svg>{backLabel}
          </button>
        </div>
      )}
    </div>
  );
};
