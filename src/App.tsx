// src/App.tsx
import { useState, useEffect, useRef, Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { layerVariants, reducedLayerVariants, BLOOM_EASE, type RippleOrigin } from './lib/transitions';
import { useAuth } from './hooks/useAuth';
import { useGarden, filterVisible } from './hooks/useGarden';
import { peekCachedArtworks, filterVisible as filterVisibleArtworks, resolveArtSrc, type Artwork } from './hooks/useAtelier';
import { playBGM } from './hooks/useSoundscape';
import { useHashRoute, parseHash } from './lib/route';
import { useAutoTheme } from './hooks/useAutoTheme';
import { isLateNight } from './lib/timeContext';
import { termTint } from './lib/solarTerms';
import { NIGHT_REMINDERS, MIKU_WHISPERS } from './data/quotes';
import { useCoarsePointer } from './hooks/useCoarsePointer';
import { getVisitorAlias } from './lib/visitor';

import { OasisTerminal } from './components/OasisTerminal';
import { OasisBackground } from './components/OasisBackground';
import { OasisGarden } from './components/OasisGarden';
import { OasisBottomChrome } from './components/OasisBottomChrome';
import { OasisPalette, openPalette, type PaletteView } from './components/OasisPalette';

// 🪷 次级场所懒加载：欢迎页首屏只需 OasisGarden 本体，其余四个场所（含各自的
//    markdown/highlight.js/图表等重依赖）按需拆包，切换时才拉取，减轻首屏体积。
const OasisOrchard = lazy(() => import('./components/OasisOrchard').then(m => ({ default: m.OasisOrchard })));
const OasisGallery = lazy(() => import('./components/OasisGallery').then(m => ({ default: m.OasisGallery })));
const OasisResonance = lazy(() => import('./components/OasisResonance').then(m => ({ default: m.OasisResonance })));
const OasisLights = lazy(() => import('./components/OasisLights').then(m => ({ default: m.OasisLights })));
const OasisAtelier = lazy(() => import('./components/OasisAtelier').then(m => ({ default: m.OasisAtelier })));

import type { BgPhase, AppView } from './types/auth';

// 移动端隐藏：满屏 mix-blend 噪点层要求每帧对整屏做混合合成，手机 GPU 吃不消，
// 而 0.03 透明度在小屏上本就几乎不可见。
const NoiseOverlay = () => (
  <div className="pointer-events-none absolute inset-0 z-50 opacity-[0.03] mix-blend-overlay hidden md:block">
    <svg className="absolute inset-0 w-full h-full">
      <filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" stitchTiles="stitch" /></filter>
      <rect width="100%" height="100%" filter="url(#noise)" />
    </svg>
  </div>
);

// 🫧 全局点击涟漪：每次点击在落点晕开一圈舒缓的水波，与绿洲的呼吸美学呼应。
type Ripple = { id: number; x: number; y: number; color: string };
const ClickRipples = () => {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  // 触屏设备走轻量版：只保留主涟漪细环，去掉模糊柔光与余韵二环，滑动/点按不掉帧
  const coarse = useCoarsePointer();
  const reduceMotion = !!useReducedMotion();

  useEffect(() => {
    // 与界面主色调呼应的柔和色板：初音绿 / 樱粉 / 月白
    const palette = ['rgba(57,197,187,0.55)', 'rgba(255,183,197,0.5)', 'rgba(226,232,240,0.55)'];
    let i = 0;
    let last = 0;
    const handler = (e: PointerEvent) => {
      if (reduceMotion) return;
      // Dock 有自己的短促按压反馈；跳过全屏长涟漪，避免一次点击叠出两套动效。
      if (e.target instanceof Element && e.target.closest('[data-no-global-ripple]')) return;
      // 舒缓的节奏：太密集的点击不再叠成一团，让每圈水波都从容荡开
      const now = performance.now();
      if (now - last < 140) return;
      last = now;
      const id = now + Math.random();
      const color = palette[i++ % palette.length];
      setRipples(prev => [...prev.slice(-4), { id, x: e.clientX, y: e.clientY, color }]);
      window.setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 3200);
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [reduceMotion]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[300] overflow-hidden">
      <AnimatePresence>
        {ripples.map(r => (
          <span key={r.id} className="absolute" style={{ left: r.x, top: r.y }}>
            {/* 落点的一点柔光，像水珠触面后缓缓晕开 */}
            {!coarse && (
              <motion.span
                className="absolute rounded-full blur-[4px]"
                style={{ x: '-50%', y: '-50%', background: `radial-gradient(circle, ${r.color} 0%, transparent 72%)` }}
                initial={{ width: 14, height: 14, opacity: 0.55 }}
                animate={{ width: 78, height: 78, opacity: 0 }}
                transition={{ duration: 1.7, ease: 'easeOut' }}
              />
            )}
            {/* 主涟漪细环：从容地荡开，长长的尾韵 */}
            <motion.span
              className="absolute rounded-full"
              style={{ x: '-50%', y: '-50%', border: `1.5px solid ${r.color}` }}
              initial={{ width: 6, height: 6, opacity: 0.55 }}
              animate={{ width: 230, height: 230, opacity: 0 }}
              transition={{ duration: 2.5, ease: [0.22, 0.61, 0.36, 1] }}
            />
            {/* 第二圈延迟扩散，水波荡开的余韵 */}
            {!coarse && (
              <motion.span
                className="absolute rounded-full"
                style={{ x: '-50%', y: '-50%', border: `1px solid ${r.color}` }}
                initial={{ width: 6, height: 6, opacity: 0 }}
                animate={{ width: 168, height: 168, opacity: [0, 0.32, 0] }}
                transition={{ duration: 2.8, ease: [0.22, 0.61, 0.36, 1], delay: 0.35, times: [0, 0.25, 1] }}
              />
            )}
          </span>
        ))}
      </AnimatePresence>
    </div>
  );
};

// 🌙 深夜低语：23:00–4:59 到访时，底部浮起一句温柔提醒后缓缓散去；每次会话只说一次，不扰人。
//   本地缓存里若有 miku 标签的公开收藏，优先配一张一并浮现（点击直达绘阁灯箱）；
//   没有则回退纯文字提醒。只读 peekCachedArtworks() 快照，不为此额外发起云端请求。
type WhisperContent = { kind: 'text'; msg: string } | { kind: 'art'; artwork: Artwork; msg: string };
const NightWhisper = ({ isAdmin, onOpenArtwork }: { isAdmin: boolean; onOpenArtwork: (id: string) => void }) => {
  const [content, setContent] = useState<WhisperContent | null>(null);
  useEffect(() => {
    if (!isLateNight() || sessionStorage.getItem('oasis_night_whispered')) return;
    // ⚠️ 标记必须在真正展示（show 定时器触发）时才写入，不能在这里同步写：
    //   StrictMode 开发模式会先「挂载→卸载」空跑一次 effect 再正式挂载，若在此处同步标记，
    //   空跑的那一次会抢先占用标记，导致真正存活的那次直接被挡在门外、永远不展示。
    const show = setTimeout(() => {
      sessionStorage.setItem('oasis_night_whispered', '1');
      const mikuPicks = filterVisibleArtworks(peekCachedArtworks(), isAdmin).filter((a) => a.tags.includes('miku'));
      if (mikuPicks.length > 0) {
        const artwork = mikuPicks[Math.floor(Math.random() * mikuPicks.length)];
        const msg = MIKU_WHISPERS[Math.floor(Math.random() * MIKU_WHISPERS.length)];
        setContent({ kind: 'art', artwork, msg });
      } else {
        setContent({ kind: 'text', msg: NIGHT_REMINDERS[Math.floor(Math.random() * NIGHT_REMINDERS.length)] });
      }
    }, 4000);   // 等入场安顿好再轻声说
    const hide = setTimeout(() => setContent(null), 14000);  // 停留 10 秒后散去
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [isAdmin]);
  return (
    <AnimatePresence>
      {content && (
        <motion.div
          initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
          onClick={content.kind === 'art' ? () => onOpenArtwork(content.artwork.id) : undefined}
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[350] rounded-full backdrop-blur-md bg-white/40 dark:bg-white/5 border border-slate-300/40 dark:border-white/10 shadow-sm ${
            content.kind === 'art' ? 'flex items-center gap-3 pl-2 pr-5 py-2 cursor-pointer pointer-events-auto' : 'pointer-events-none px-6 py-3'
          }`}
        >
          {content.kind === 'art' ? (
            <>
              <img src={resolveArtSrc(content.artwork.imagePath, 'thumb')} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
              <span className="font-serif text-sm text-slate-500 dark:text-slate-300 whitespace-nowrap">
                <span className="mr-2">♪</span>{content.msg}
              </span>
            </>
          ) : (
            <span className="font-serif text-sm text-slate-500 dark:text-slate-300 whitespace-nowrap">
              <span className="mr-2">🌙</span>{content.msg}
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const Clock = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })} · OASIS</>;
};

const OasisHUD = ({ showClock, onClockTap }: { showClock: boolean; onClockTap?: () => void }) => (
  <div className="pointer-events-none absolute inset-5 md:inset-8 z-40 flex flex-col justify-between opacity-30 mix-blend-difference text-slate-400">
    <div className="flex justify-between items-start">
      <span className="font-mono text-xs leading-none">+</span>
      <div className="flex flex-col items-end gap-3">
        <span className="font-mono text-xs leading-none">+</span>
        <AnimatePresence>
          {showClock && (
            <motion.div onClick={onClockTap} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 2 }} className="font-mono text-[10px] tracking-[0.3em] whitespace-nowrap pointer-events-auto select-none">
              <Clock />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
    <div className="flex justify-between items-end">
      <span className="font-mono text-xs leading-none">+</span><span className="font-mono text-xs leading-none">+</span>
    </div>
  </div>
);

// 🌫️ 单层视图容器：先退场再入场（AnimatePresence mode="wait"），避免新旧两个重量级场所
// 同时挂载导致内容重叠、争抢主线程；底层 OasisBackground 常驻，退场期间露出的是禅境底色而非闪白。
// 只动 opacity + 极轻 scale（合成器层），永不触发整屏重绘，因此丝滑无抖动。
const ViewLayer = ({ reduce, children }: { reduce: boolean; children: ReactNode }) => (
  <motion.div
    className="absolute inset-0 flex items-center justify-center"
    variants={reduce ? reducedLayerVariants : layerVariants}
    initial="initial" animate="animate" exit="exit"
  >
    {children}
  </motion.div>
);

// 🫫 水波涟漪：落点处一圈圈细环渐次荡开，如雨滴落水般轻盈舒缓；中心仅一抹弥散柔光衬底。
// 仅 transform scale + opacity（合成器友好），细环带微模糊柔边，airy 不厚重、无廉价硬环。
const RippleBloom = ({ origin }: { origin: RippleOrigin }) => {
  const anchor = { left: origin.x, top: origin.y, x: '-50%', y: '-50%' } as const;
  // 三圈错峰荡开的涟漪：渐次延迟 + 渐淡，营造水面一圈圈舒展、缓缓平息的层次。
  const rings = [
    { color: 'rgba(57,197,187,0.42)', w: 1.5, to: 5.4, op: 0.7, delay: 0, dur: 1.6 },
    { color: 'rgba(57,197,187,0.30)', w: 1.2, to: 4.6, op: 0.55, delay: 0.18, dur: 1.7 },
    { color: 'rgba(255,183,197,0.34)', w: 1.2, to: 3.9, op: 0.5, delay: 0.36, dur: 1.8 },
  ];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[39]">
      {/* 中心弥散柔光：轻轻衬底，不抢戏 */}
      <motion.span
        className="absolute rounded-full"
        style={{ ...anchor, width: 360, height: 360, background: 'radial-gradient(circle, rgba(57,197,187,0.30) 0%, rgba(57,197,187,0.10) 44%, transparent 72%)', filter: 'blur(10px)' }}
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 2.2, opacity: [0, 0.55, 0] }}
        transition={{ duration: 1.5, ease: BLOOM_EASE, times: [0, 0.14, 1] }}
      />
      {/* 渐次荡开的涟漪细环 */}
      {rings.map((r, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ ...anchor, width: 150, height: 150, border: `${r.w}px solid ${r.color}`, filter: 'blur(0.6px)' }}
          initial={{ scale: 0.3, opacity: r.op }}
          animate={{ scale: r.to, opacity: 0 }}
          transition={{ duration: r.dur, ease: BLOOM_EASE, delay: r.delay }}
        />
      ))}
    </div>
  );
};

function App() {
  const { isAdmin, isLoading, logout } = useAuth();

  const { route, navigate } = useHashRoute();

  const [terminalStatus, setTerminalStatus] = useState<'checking' | 'locked' | 'granted'>('checking');
  const [bgPhase, setBgPhase] = useState<BgPhase>('cyber');
  // 🧭 带 hash 直达：刷新 / 分享链接进入 #/garden 等地址时跳过欢迎入场，直落对应场所
  const [appView, setAppView] = useState<AppView>(() => parseHash(window.location.hash).view);
  
  const [simulateGuest, setSimulateGuest] = useState(false);
  const effectiveIsAdmin = isAdmin && !simulateGuest;
  
  const hasTriggeredBGM = useRef(false);
  // 🌗 日夜：默认 AUTO 跟随时间流转，也可手动锁定
  const { mode: themeMode, isDark: isDarkMode, cycleMode } = useAutoTheme();

  // 🫧 涟漪转场：记录每次切换的落点（被点击的 Dock 图标中心），并用自增 key 触发一道扩散水波。
  const prefersReducedMotion = useReducedMotion();
  // 📱 触屏：场所切换关闭水波转场，减少额外合成层，缓解移动端卡顿。
  const coarse = useCoarsePointer();
  const [revealOrigin, setRevealOrigin] = useState<RippleOrigin>({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight * 0.92 : 0,
  });
  const [waveKey, setWaveKey] = useState(0);

  const handleViewChange = (view: AppView, origin?: RippleOrigin) => {
    if (origin) setRevealOrigin(origin);
    setWaveKey(k => k + 1);
    setAppView(view);
    navigate(view); // 同步地址栏，切换场所即可被收藏 / 分享 / 后退
  };

  // ⬅️ 浏览器后退 / 前进：hash 变化时把场所切回对应视图（欢迎页除外，避免误触重播入场）
  useEffect(() => {
    if (route.view !== 'welcome' && route.view !== appView) {
      setWaveKey(k => k + 1);
      setAppView(route.view);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.view]);

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  // 🚪 默认即访客：会话检查结束后所有人直入禅境，登录不再是大门而是暗门
  useEffect(() => {
    if (!isLoading && terminalStatus === 'checking') {
      setTerminalStatus('granted'); setBgPhase('zen');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // 🕳️ 终端暗门：反引号 ` 键召唤 / ESC 关闭；已是 creator 时无需再召
  const [showTerminal, setShowTerminal] = useState(false);
  const clockTaps = useRef<number[]>([]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable;
      if (e.key === '`' && !typing && !isAdmin) { e.preventDefault(); setShowTerminal(v => !v); }
      if (e.key === 'Escape') setShowTerminal(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isAdmin]);

  // 移动端暗号：2.5 秒内连点右上角时钟 5 次
  const handleClockTap = () => {
    const now = Date.now();
    clockTaps.current = [...clockTaps.current.filter(ts => now - ts < 2500), now];
    if (clockTaps.current.length >= 5) { clockTaps.current = []; if (!isAdmin) setShowTerminal(true); }
  };

  useEffect(() => {
    if (appView !== 'welcome' && terminalStatus === 'granted' && !hasTriggeredBGM.current) {
      hasTriggeredBGM.current = true;
      // 🌙 深夜到访：陪你把声音也一并压低，呼应 NightWhisper 的关怀感
      playBGM(isLateNight() ? 0.22 : 0.4, 2500);
    }
  }, [appView, terminalStatus, playBGM]);

  const handleTerminalSuccess = () => {
    setShowTerminal(false); setBgPhase('blooming');
    setTimeout(() => setBgPhase('zen'), 2500);
  };

  // 登出后回到访客欢迎页，而非终端锁屏
  const handleLogout = async () => {
    await logout(); setSimulateGuest(false); setAppView('welcome'); navigate('welcome');
  };

  // ✨ 核心修复：纯原生 CSS 类名驱动背景，彻底解放 transition
  const bgClass = bgPhase === 'cyber' ? 'bg-[#050505]' : 'bg-[#FAF8F3] dark:bg-[#0A0F1D]';

  // 🌾 季节光：暖纸底光的主色随四季缓缓流转，变化幅度极小，只为让常客隐约觉得「这里在呼吸」
  const seasonTint = termTint();

  // ⌘K 命令面板：独立的 useGarden 实例（与 Gallery/Orchard 同一模式，频道名自随机，互不冲突）
  const { posts: rawAllPosts } = useGarden();
  const allPosts = filterVisible(rawAllPosts, effectiveIsAdmin);
  const paletteView: PaletteView | 'welcome' =
    appView === 'garden' || appView === 'soundscape' || appView === 'orchard' || appView === 'lights' || appView === 'atelier'
      ? appView : 'welcome';
  const themeLabel = themeMode === 'auto' ? `AUTO · ${isDarkMode ? '☽' : '☼'}` : themeMode === 'light' ? 'LIGHT' : 'DARK';

  return (
    <div className={`relative w-screen h-dvh overflow-hidden flex items-center justify-center transition-colors duration-[1500ms] ease-in-out ${bgClass} ${isDarkMode ? 'dark' : ''}`}>
      {/* 🌾 暖纸底光：仅亮色可见。左上一抹暖白、右下极淡青，替代纯平「实验室白」，让庭园有和纸的温度。
          夜色下 dark:opacity-0 隐去，交还给星河底色。 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] transition-opacity duration-[1500ms] dark:opacity-0"
        style={{
          background:
            `radial-gradient(120% 90% at 15% 12%, ${seasonTint.wash} 0%, rgba(250,248,243,0.45) 42%, transparent 70%), radial-gradient(90% 80% at 88% 92%, ${seasonTint.accent} 0%, transparent 60%)`,
        }}
      />
      <NoiseOverlay />
      <ClickRipples />
      <OasisHUD showClock={terminalStatus === 'granted' && bgPhase === 'zen'} onClockTap={handleClockTap} />

      <AnimatePresence>
        {terminalStatus === 'granted' && bgPhase === 'zen' && appView !== 'welcome' && (
          <motion.div 
            data-miku-avoid
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 1 }}
            className="absolute top-5 left-5 md:top-8 md:left-8 z-[100] flex flex-wrap items-center gap-2 md:gap-3 max-w-[calc(100vw-7rem)]"
          >
            <button
              onClick={openPalette}
              className="flex items-center justify-center gap-1.5 font-mono text-[9px] tracking-[0.2em] uppercase w-9 h-9 md:w-auto md:px-3 rounded-full border transition-all duration-700 outline-none backdrop-blur-md bg-white/40 dark:bg-white/5 border-slate-300/40 dark:border-white/10 text-slate-500 dark:text-slate-300 hover:text-[#39C5BB] dark:hover:text-[#39C5BB] hover:border-[#39C5BB]/50 shadow-sm"
              title="⌘K 寻找一片叶子"
              aria-label="打开命令面板"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <span className="hidden md:inline">⌘K</span>
            </button>

            <button
              onClick={cycleMode}
              className="flex items-center justify-center font-mono text-[9px] tracking-[0.2em] uppercase px-3 py-2 md:px-4 rounded-full border transition-all duration-700 outline-none backdrop-blur-md bg-white/40 dark:bg-white/5 border-slate-300/40 dark:border-white/10 text-slate-500 dark:text-slate-300 hover:text-[#39C5BB] dark:hover:text-[#39C5BB] hover:border-[#39C5BB]/50 shadow-sm"
              title="AUTO 跟随时间自动调节日夜"
            >
              {themeMode === 'auto' ? `◐ AUTO · ${isDarkMode ? '☽' : '☼'}` : themeMode === 'light' ? '☼ LIGHT' : '☽ DARK'}
            </button>

            {isAdmin && (
              <>
                <button 
                  onClick={() => setSimulateGuest(!simulateGuest)} 
                  className={`flex items-center justify-center font-mono text-[9px] tracking-[0.2em] uppercase px-4 py-2 rounded-full border transition-all duration-700 outline-none backdrop-blur-md shadow-sm ${simulateGuest ? 'bg-[#39C5BB] text-white border-[#39C5BB]' : 'bg-white/40 dark:bg-white/5 border-slate-300/40 dark:border-white/10 text-slate-500 dark:text-slate-300 hover:text-slate-600 dark:hover:text-white'}`}
                >
                  {simulateGuest ? '[ VISITOR : ON ]' : '[ VISITOR : OFF ]'}
                </button>
                <button 
                  onClick={handleLogout} 
                  className="flex items-center justify-center font-mono text-[9px] tracking-[0.2em] uppercase px-4 py-2 rounded-full border border-transparent transition-all duration-700 outline-none text-slate-400 dark:text-slate-500 hover:text-[#FFB7C5] dark:hover:text-[#FFB7C5] hover:bg-white/40 dark:hover:bg-white/5"
                >
                  DISCONNECT
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-0 z-30 shadow-[inset_0_0_150px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_0_150px_rgba(0,0,0,0.8)] transition-shadow duration-[1500ms]" />
      <OasisBackground phase={bgPhase} isDark={isDarkMode} />
      {terminalStatus === 'granted' && <NightWhisper isAdmin={effectiveIsAdmin} onOpenArtwork={(id) => navigate('atelier', id)} />}
      <div className="relative w-full h-full flex items-center justify-center z-10">
        <AnimatePresence mode="wait">
          {terminalStatus === 'checking' && <motion.div key="checking" className="absolute inset-0 bg-[#050505] z-50" exit={{ opacity: 0, transition: { duration: 1 } }} />}
          {terminalStatus === 'granted' && bgPhase === 'zen' && appView === 'welcome' && (
            <OasisGarden key="garden" visitorName={effectiveIsAdmin ? "Bob Lee" : (getVisitorAlias() ?? "Visitor")} isReturningUser={effectiveIsAdmin || getVisitorAlias() !== null} onEnterGarden={() => handleViewChange('garden')} />
          )}
          {terminalStatus === 'granted' && bgPhase === 'zen' && appView !== 'welcome' && (
            <motion.div key="oasis-arena" className="w-full h-full flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.9, ease: [0.32, 0.72, 0, 1] } }} exit={{ opacity: 0, transition: { duration: 0.45, ease: [0.4, 0, 0.9, 0.2] } }}>
              {/* 🌫️ 交叉溶解：新旧界面同时在场、同步淡入淡出，无空档不闪白 */}
              {(() => {
                const reduce = !!prefersReducedMotion || coarse;
                const wrap = (key: string, node: ReactNode) => (
                  <ViewLayer key={key} reduce={reduce}>{node}</ViewLayer>
                );
                return (
                  <Suspense fallback={null}>
                    <AnimatePresence mode="wait">
                      {appView === 'soundscape' && wrap('sound-space', <OasisResonance />)}
                      {appView === 'garden' && wrap('garden-space', <OasisGallery isAdmin={effectiveIsAdmin} />)}
                      {appView === 'orchard' && wrap('orchard-space', <OasisOrchard isAdmin={effectiveIsAdmin} />)}
                      {appView === 'lights' && wrap('lights-space', <OasisLights />)}
                      {appView === 'atelier' && wrap('atelier-space', <OasisAtelier isAdmin={effectiveIsAdmin} />)}
                    </AnimatePresence>
                  </Suspense>
                );
              })()}
              {!prefersReducedMotion && !coarse && waveKey > 0 && <RippleBloom key={waveKey} origin={revealOrigin} />}
              <OasisBottomChrome currentView={appView} onViewChange={handleViewChange} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {bgPhase === 'blooming' && <motion.div className="absolute inset-0 z-[5] pointer-events-none bg-gradient-to-tr from-[#39C5BB]/15 via-transparent to-[#FFB7C5]/15" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1.5, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 2.5, ease: "easeInOut" }} />}
      </AnimatePresence>

      {/* ⌘K 命令面板：搜文章 / 去往场所 / 切主题，全站唯一的漫游入口 */}
      {terminalStatus === 'granted' && (
        <OasisPalette
          posts={allPosts}
          currentView={paletteView}
          themeLabel={themeLabel}
          onGo={(view) => handleViewChange(view)}
          onOpenPost={(id) => navigate('garden', id)}
          onToggleTheme={cycleMode}
        />
      )}

      {/* 🕳️ 终端暗门覆盖层：只属于园丁的后门，点击空白或 ESC 关闭 */}
      <AnimatePresence>
        {showTerminal && (
          <motion.div
            key="terminal-overlay"
            className="fixed inset-0 z-[400] flex items-center justify-center bg-[#050505]/90 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowTerminal(false); }}
          >
            <OasisTerminal onSuccess={handleTerminalSuccess} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
