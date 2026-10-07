// src/components/OasisResonance.tsx
//
// 🎧 共鸣（音乐页）。四条规矩，改之前必读（详见 docs/music-design.md §A2）：
//   1. 100ms 内给画面反馈：命令当帧改界面状态，音量淡入淡出在后台跟上（useSoundscape 的命令）。
//   2. 控件不随内容迁移：歌词/选碟切换条固定在右栏顶部；曲目铭牌外框定高；在播标识在曲号槽里替换数字。
//   3. 一个元素只归一套动画系统：不跨容器用 layoutId；被 ticker 每帧移动的容器里不放 framer layout 元素。
//      layoutId 只留给父容器静止的高亮块与下划线。
//   4. 最后一帧等于静止态：面板只做原位交叉淡化（opacity），尺寸变化一律预留。
// 进度、时间、唱臂、唱盘都由 ticker 直接写 DOM，播放中页面不因时间流逝重渲染。
// 动效时长只用 lib/motion.ts 的档位；情绪色只经由根节点的 --mood 一个变量过渡。
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useIsPresent, useReducedMotion } from 'framer-motion';
import {
  PLAYLIST,
  usePlayer,
  getPlaybackTime,
  getPlayerSnapshot,
  togglePlay,
  togglePlayMode,
  playNext,
  playPrev,
  changeVolume,
} from '../hooks/useSoundscape';
import type { MusicCategory } from '../types/music';
import { useTicker } from '../lib/ticker';
import { MOTION } from '../lib/motion';
import { LyricPanel } from './resonance/LyricPanel';
import { StageMeter } from './resonance/StageMeter';
import { StageGlow } from './resonance/StageGlow';
import { PlaybackBar } from './resonance/PlaybackBar';
import { CrateList, type AlbumGroup } from './resonance/CrateList';
import { TrackCaption } from './resonance/TrackCaption';
import { LinerNotes } from './resonance/LinerNotes';
import { getTrackProfile, loadTrackProfiles, useTrackProfilesReady } from '../lib/trackProfile';

const Icons = {
  sequence: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>),
  loop: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /></svg>),
  shuffle: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>),
  play: (<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className="w-[20px] h-[20px] ml-1"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>),
  pause: (<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className="w-[20px] h-[20px]"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>),
  prev: (<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className="w-[18px] h-[18px]"><polygon points="19 20 9 12 19 4 19 20" /><rect x="5" y="4" width="2" height="16" rx="1" /></svg>),
  next: (<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className="w-[18px] h-[18px]"><polygon points="5 4 15 12 5 20 5 4" /><rect x="17" y="4" width="2" height="16" rx="1" /></svg>),
  ambience: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-[18px] h-[18px]"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" /></svg>),
};

const VolumeIcon: React.FC<{ volume: number; className: string }> = ({ volume, className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
    {volume <= 0.001 ? <path d="M23 9l-6 6M17 9l6 6" /> : <><path d="M15.5 8.5a5 5 0 0 1 0 7" />{volume > 0.55 && <path d="M18.5 5.5a9 9 0 0 1 0 13" />}</>}
  </svg>
);

const AMBIENCE_KEY = 'oasis_resonance_ambience';

const initialAmbience = () => {
  if (typeof window === 'undefined') return true;
  try { return window.localStorage.getItem(AMBIENCE_KEY) !== 'off'; }
  catch { return true; }
};

const CATEGORIES: { id: MusicCategory; label: string }[] = [
  { id: 'All Tracks', label: 'ALL TRACKS' },
  { id: 'Yorushika', label: 'YORUSHIKA' },
  { id: 'Atarayo', label: 'ATARAYO' },
  { id: 'Miku', label: 'MIKU' }
];

// 💿 黑胶纹理：主唱盘的同心声槽
const VINYL_GROOVES = 'repeating-radial-gradient(circle at 50% 50%, #111 0px, #111 3px, #1b1b1f 4px, #111 5px)';

// 💽 从音轨 url 推导专辑信息（曲库未单列 album 字段，按 /audio/<专辑文件夹>/<文件> 解析）。
// 用于「选碟台」按专辑分组陈列，让翻阅像在碟箱里一张张翻碟。
const albumOf = (url: string): { key: string; name: string; year: string } => {
  const folder = (url.split('/')[2] || '').trim();
  const year = (folder.match(/\b(?:19|20)\d{2}\b/) || [])[0] || '';
  let name = folder
    .replace(/^\d{4}\.\d{2}\.\d{2}\s*/, '')   // 去日期前缀
    .replace(/\[[^\]]*\]\s*/g, '')             // 去 [Album]/[Single] 标记
    .trim();
  if (name.includes(' - ')) name = name.split(' - ').slice(1).join(' - ').trim(); // "Artist - Album" → 取专辑
  return { key: folder, name: name || folder, year };
};

// 🦾 唱臂：落针 16°，随进度内移到 29°；抬臂 −14°。欠阻尼弹簧，抬落时带一点真实的惯性。
const ARM_REST = -14;
const ARM_START = 16;
const ARM_SWEEP = 13;
const ARM_STIFFNESS = 45 / 1.2;
const ARM_DAMPING = 13 / 1.2;

export const OasisResonance: React.FC<{ isOwner?: boolean }> = ({ isOwner = false }) => {
  // 🎚️ 视图是否「在场」：切换离场时（AnimatePresence 退场期间）useIsPresent 立即转 false，
  //    据此关停所有高频 rAF 视觉，避免退场动画与新视图挂载争用主线程/GPU，消除切换卡顿。
  const active = useIsPresent();
  const reduceMotion = !!useReducedMotion();
  // 🖥️ 大屏才启用最重的氛围视觉；监听断点变化，兼容手机旋转与 iPad 分屏。
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const currentTrack = usePlayer(s => s.track);
  const isPlaying = usePlayer(s => s.isPlaying);
  const playMode = usePlayer(s => s.playMode);
  const volume = usePlayer(s => s.volume);

  const [activeCategory, setActiveCategory] = useState<MusicCategory>('All Tracks');
  // 📱 移动端分段：一次只呈现唱片 / 歌词 / 歌单中的一段，避免同屏合成争用。
  const [mobileTab, setMobileTab] = useState<'disc' | 'lyrics' | 'crate'>('disc');
  const [desktopPanel, setDesktopPanel] = useState<'lyrics' | 'crate'>('crate');
  const [ambienceEnabled, setAmbienceEnabled] = useState(initialAmbience);
  const motionEnabled = ambienceEnabled && !reduceMotion;
  // 📜 曲目卡（内页）：浮层，不占排版；切面板或切段时合上
  const [notesOpen, setNotesOpen] = useState(false);
  const openNotes = () => setNotesOpen(true);
  const closeNotes = useMemo(() => () => setNotesOpen(false), []);
  const chooseDesktopPanel = (panel: 'lyrics' | 'crate') => { setDesktopPanel(panel); setNotesOpen(false); };
  const chooseMobileTab = (tab: 'disc' | 'lyrics' | 'crate') => { setMobileTab(tab); setNotesOpen(false); };

  // 🗂 曲目档案（独立 chunk）：进音乐页就开始取，选碟台按档案里的专辑分组，曲目卡读它
  useEffect(() => { void loadTrackProfiles(); }, []);
  const profilesReady = useTrackProfilesReady();

  // 📱 唱片页上滑翻开内页：竖直上滑 > 60px 且明显比横向位移大
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const swiped = useRef(false);
  const swipeHandlers = {
    onPointerDown: (event: React.PointerEvent) => {
      swipe.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
      swiped.current = false;
    },
    onPointerUp: (event: React.PointerEvent) => {
      const start = swipe.current;
      swipe.current = null;
      if (!start || start.id !== event.pointerId) return;
      const dy = event.clientY - start.y;
      const dx = event.clientX - start.x;
      if (dy < -60 && Math.abs(dy) > Math.abs(dx) * 1.6) {
        swiped.current = true;
        setNotesOpen(true);
      }
    },
    onPointerCancel: () => { swipe.current = null; },
    // 上滑结束时手指落在唱片上，别让那一下再触发播放/暂停
    onClickCapture: (event: React.MouseEvent) => {
      if (swiped.current) { event.stopPropagation(); swiped.current = false; }
    },
  };

  useEffect(() => {
    try { window.localStorage.setItem(AMBIENCE_KEY, ambienceEnabled ? 'on' : 'off'); }
    catch { /* 隐私模式下偏好不落盘，当前会话仍正常工作。 */ }
  }, [ambienceEnabled]);

  // 💿 真实唱盘惯性：用 rAF 让转速平滑趋近目标，播放时缓缓启转、暂停时自然滑停，
  //    取代 CSS animationPlayState 的「咔哒」式骤停骤起。
  const discRef = useRef<HTMLDivElement>(null);
  const spin = useRef({ angle: 0, vel: 0 });        // 当前角度(deg) 与角速度(deg/s)
  const targetVel = useRef(0);                       // 目标角速度：播放 20deg/s(≈18s 一圈)，暂停 0
  useEffect(() => {
    targetVel.current = isPlaying && motionEnabled ? 20 : 0;
    if (!motionEnabled) spin.current.vel = 0;
  }, [isPlaying, motionEnabled]);
  useTicker((_now, dt) => {
    const state = spin.current;
    state.vel += (targetVel.current - state.vel) * (1 - Math.exp(-dt / 1.4));
    state.angle = (state.angle + state.vel * dt) % 360;
    if (discRef.current) discRef.current.style.transform = `rotate(${state.angle}deg)`;
  }, active && motionEnabled);

  // 🦾 唱臂随播放进度内移：进度每帧在变，所以由 ticker 推弹簧、直接写 transform。
  const armRef = useRef<HTMLDivElement>(null);
  const arm = useRef({ angle: ARM_REST, vel: 0, written: Number.NaN });
  useTicker((_now, dt) => {
    const { duration } = getPlayerSnapshot();
    const ratio = duration > 0 ? Math.min(1, getPlaybackTime() / duration) : 0;
    const target = isPlaying ? ARM_START + ratio * ARM_SWEEP : ARM_REST;
    const state = arm.current;
    if (reduceMotion) {
      state.angle = target;
      state.vel = 0;
    } else {
      // 子步积分：低帧率（触屏隔帧）下欠阻尼弹簧也稳定
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h = dt / steps;
      for (let i = 0; i < steps; i += 1) {
        state.vel += (ARM_STIFFNESS * (target - state.angle) - ARM_DAMPING * state.vel) * h;
        state.angle += state.vel * h;
      }
    }
    if (Math.abs(state.angle - state.written) > 0.01 && armRef.current) {
      state.written = state.angle;
      armRef.current.style.transform = `rotate(${state.angle}deg)`;
    }
  }, active && isDesktop);

  const modeDisplay = useMemo(() => {
    if (playMode === 'loop') return { icon: Icons.loop, text: 'LOOP' };
    if (playMode === 'sequence') return { icon: Icons.sequence, text: 'SEQ' };
    return { icon: Icons.shuffle, text: 'RND' };
  }, [playMode]);

  const filteredPlaylist = useMemo(() => {
    if (activeCategory === 'All Tracks') return PLAYLIST;
    return PLAYLIST.filter(track => track.category === activeCategory);
  }, [activeCategory]);

  // 📀 按专辑分组陈列：曲库本就按专辑顺序排列，相邻同专辑聚为一组。
  //    档案到了就用档案里的专辑名与年份（音频标签 > 网易云），之前先按文件夹名猜。
  const albumGroups = useMemo(() => {
    const groups: AlbumGroup[] = [];
    filteredPlaylist.forEach(track => {
      const guessed = albumOf(track.url);
      const profile = profilesReady ? getTrackProfile(track.id) : undefined;
      const info = profile?.album
        ? { key: profile.albumSlug ?? profile.album, name: profile.album, year: profile.year ? String(profile.year) : guessed.year }
        : guessed;
      const last = groups[groups.length - 1];
      if (last && last.key === info.key) last.tracks.push(track);
      else groups.push({ ...info, tracks: [track] });
    });
    return groups;
  }, [filteredPlaylist, profilesReady]);

  // ⌨️ 键盘快捷键：空格 播放/暂停、← → 切歌（聚焦输入框时不拦截）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); playNext(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); playPrev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { 'All Tracks': PLAYLIST.length };
    PLAYLIST.forEach(t => { counts[t.category] = (counts[t.category] || 0) + 1; });
    return counts;
  }, []);

  const moodStyle = { '--mood': currentTrack.color } as React.CSSProperties;
  const toggleMute = () => changeVolume(volume > 0 ? 0 : 0.5);

  // 分类栏：选中只改颜色与下划线，不改字重——字重会改变按钮宽度，带着整排分类横跳。
  const categoryBar = (mobile: boolean) => CATEGORIES.map(cat => (
    <button
      key={cat.id}
      type="button"
      onClick={() => setActiveCategory(cat.id)}
      aria-pressed={activeCategory === cat.id}
      className={`relative flex items-baseline gap-1.5 font-mono text-[10px] tracking-[0.2em] uppercase whitespace-nowrap transition-colors duration-200 outline-none pb-2 shrink-0 ${
        activeCategory === cat.id ? 'text-slate-800 dark:text-slate-100' : `text-slate-500 dark:text-slate-500 ${mobile ? '' : 'hover:text-slate-700 dark:hover:text-slate-300'}`
      }`}
    >
      {cat.label}
      <sup className={`text-[8px] tracking-normal transition-opacity duration-200 ${activeCategory === cat.id ? 'opacity-70' : 'opacity-40'}`}>{categoryCounts[cat.id] ?? 0}</sup>
      {activeCategory === cat.id && (
        <motion.div
          layoutId={mobile ? 'activeCategoryMobile' : 'activeCategory'}
          className="absolute -bottom-[1px] left-0 right-0 h-[2px] rounded-full"
          style={{ backgroundColor: 'var(--mood)' }}
          transition={MOTION.settle}
        />
      )}
    </button>
  ));

  const crateMask = (top: number, bottom: number) => ({
    maskImage: `linear-gradient(to bottom, transparent 0, #000 ${top}px, #000 calc(100% - ${bottom}px), transparent 100%)`,
    WebkitMaskImage: `linear-gradient(to bottom, transparent 0, #000 ${top}px, #000 calc(100% - ${bottom}px), transparent 100%)`,
  });

  // ================= 📱 移动端：分段版式（唱片 ↔ 歌词 ↔ 歌单），只呈现当前段，减负增美 =================
  if (!isDesktop) {
    return (
      <div
        className="oasis-mood oasis-bottom-scroll-safe relative w-full h-full flex flex-col z-10 overflow-hidden pt-[max(3.25rem,calc(env(safe-area-inset-top)+1.75rem))] pb-[var(--oasis-bottom-safe-space)] px-5"
        style={moodStyle}
      >

        {/* 分段切换：一枚水滴形药丸，选中段染当前情绪色 */}
        <div className="shrink-0 flex items-center justify-center gap-2 mb-5">
          <div className="inline-flex p-1 rounded-full bg-white/45 dark:bg-white/[0.05] border border-white/50 dark:border-white/10 shadow-sm">
            {(['disc', 'lyrics', 'crate'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => chooseMobileTab(t)}
                aria-pressed={mobileTab === t}
                className={`relative min-w-[4.5rem] px-4 py-2 rounded-full font-mono text-[10px] tracking-[0.22em] uppercase transition-colors duration-200 outline-none ${mobileTab === t ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`}
              >
                {mobileTab === t && (
                  <motion.span
                    layoutId="mobileTabPill"
                    className="absolute inset-0 rounded-full"
                    style={{ backgroundColor: 'var(--mood)', boxShadow: '0 4px 14px color-mix(in srgb, var(--mood) 33%, transparent)' }}
                    transition={MOTION.settle}
                  />
                )}
                <span className="relative z-10">{t === 'disc' ? '唱片' : t === 'lyrics' ? '歌词' : '歌单'}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAmbienceEnabled(value => !value)}
            aria-pressed={ambienceEnabled}
            aria-label={ambienceEnabled ? '关闭动态氛围' : '开启动态氛围'}
            title={ambienceEnabled ? '关闭动态氛围' : '开启动态氛围'}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
              ambienceEnabled
                ? 'border-white/60 bg-white/55 text-slate-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300'
                : 'border-slate-200/60 text-slate-400 dark:border-white/[0.06] dark:text-slate-600'
            }`}
          >
            {Icons.ambience}
          </button>
        </div>

        {/* 三段在同一个盒子里原位交叉淡化（规矩 4），切段时外框尺寸不变 */}
        <div className="relative flex-1 min-h-0">
          <AnimatePresence initial={false}>
            <motion.div
              key={mobileTab}
              className="absolute inset-0 flex flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={MOTION.swap}
            >
              {mobileTab === 'disc' ? (
                /* ——— 唱片段：黑胶 + 情绪光晕 → 声波 → 歌名 → 走带 ——— */
                <div className="flex-1 min-h-0 flex flex-col items-center justify-between touch-pan-x" {...swipeHandlers}>

                  {/* 💿 手机只保留一层近光；缩放上限 2%，避免大面积合成层抢占性能。 */}
                  <div onClick={togglePlay} className="relative w-[58vw] max-w-[260px] aspect-square shrink-0 cursor-pointer">
                    <StageGlow
                      color={currentTrack.color}
                      isPlaying={isPlaying}
                      audible={volume > 0.001}
                      active={active && mobileTab === 'disc'}
                      enabled={ambienceEnabled}
                      compact
                    />
                    <div className="absolute -inset-[3%] rounded-full bg-gradient-to-br from-slate-200/60 to-slate-400/30 dark:from-white/[0.06] dark:to-black/40 border border-white/40 dark:border-white/[0.06]" />
                    <div ref={discRef} className="relative w-full h-full rounded-full overflow-hidden shadow-[0_18px_45px_rgba(0,0,0,0.28)] dark:shadow-[0_18px_45px_rgba(0,0,0,0.65)] border border-slate-500/20 dark:border-white/10 will-change-transform">
                      <div className="absolute inset-0" style={{ background: VINYL_GROOVES }} />
                      <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent mix-blend-overlay" />
                      <div className="absolute inset-[31%] rounded-full flex items-center justify-center overflow-hidden shadow-inner" style={{ backgroundColor: 'var(--mood)' }}>
                        <div className="absolute inset-0 bg-black/10 mix-blend-overlay" />
                      </div>
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[4.5%] h-[4.5%] bg-[#FAF8F3] dark:bg-[#0A0F1D] rounded-full shadow-[inset_0_2px_5px_rgba(0,0,0,0.5)] z-20" />
                    </div>
                  </div>

                  {/* 正在共鸣：声波 → 歌名 → 艺术家 */}
                  <div className="w-full flex flex-col items-center text-center px-2 min-h-0">
                    <div className="w-full max-w-[280px] mt-5"><StageMeter color={currentTrack.color} isPlaying={isPlaying} bars={40} active={active && motionEnabled} /></div>
                    <div className="w-full mt-3"><TrackCaption track={currentTrack} isPlaying={isPlaying} onOpenNotes={openNotes} /></div>
                  </div>

                  {/* 走带控制台：进度 + 传送键 */}
                  <div className="w-full max-w-[420px] flex flex-col gap-4 mt-4">
                    <PlaybackBar active={active && mobileTab === 'disc'} compact />

                    <div className="flex items-center justify-between px-2">
                      <button type="button" onClick={togglePlayMode} title={modeDisplay.text} aria-label={modeDisplay.text} className="flex items-center justify-center w-11 h-11 text-slate-400 dark:text-slate-500 active:scale-90 transition-transform outline-none shrink-0">{modeDisplay.icon}</button>
                      <button type="button" onClick={playPrev} aria-label="上一首" className="flex items-center justify-center w-11 h-11 text-slate-500 dark:text-slate-300 active:scale-90 transition-transform outline-none shrink-0">{Icons.prev}</button>
                      <button type="button" onClick={togglePlay} aria-label={isPlaying ? '暂停' : '播放'} className="w-16 h-16 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform duration-200 outline-none border border-white/20 shrink-0" style={{ backgroundColor: 'var(--mood)', boxShadow: '0 8px 25px color-mix(in srgb, var(--mood) 33%, transparent)' }}>{isPlaying ? Icons.pause : Icons.play}</button>
                      <button type="button" onClick={playNext} aria-label="下一首" className="flex items-center justify-center w-11 h-11 text-slate-500 dark:text-slate-300 active:scale-90 transition-transform outline-none shrink-0">{Icons.next}</button>
                      <button type="button" onClick={toggleMute} aria-label={volume > 0 ? '静音' : '取消静音'} className="flex items-center justify-center w-11 h-11 text-slate-400 dark:text-slate-500 active:scale-90 transition-transform outline-none shrink-0">
                        <VolumeIcon volume={volume} className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : mobileTab === 'lyrics' ? (
                /* ——— 歌词段：逐句共鸣，点句跳转；手动浏览后可一键回到此刻 ——— */
                <div className="flex-1 min-h-0">
                  <LyricPanel
                    track={currentTrack}
                    color={currentTrack.color}
                    isPlaying={isPlaying}
                    active={active}
                    compact
                  />
                </div>
              ) : (
                /* ——— 歌单段：分类 + 碟箱列表，占满整段高度 ——— */
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="shrink-0 flex gap-x-6 overflow-x-auto no-scrollbar pb-3 mb-1 border-b border-slate-200/50 dark:border-white/5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {categoryBar(true)}
                  </div>

                  <div className="relative flex-1 min-h-0">
                    <div
                      className="absolute inset-0 overflow-y-auto pb-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      style={crateMask(20, 40)}
                    >
                      <CrateList groups={albumGroups} currentTrackId={currentTrack.id} isPlaying={isPlaying} live={motionEnabled} compact />
                      {filteredPlaylist.length === 0 && <div className="pt-16 text-center font-serif italic text-slate-400 dark:text-slate-600 text-sm">碟箱里没有匹配的碟片…</div>}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          <LinerNotes track={currentTrack} open={notesOpen} onClose={closeNotes} isOwner={isOwner} compact />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="oasis-mood oasis-bottom-scroll-safe relative w-full max-w-[1680px] mx-auto h-full max-h-full overflow-y-auto no-scrollbar lg:overflow-visible lg:h-screen lg:max-h-screen flex flex-col z-10 pt-12 px-6 md:px-14 lg:pl-16 lg:pr-32 xl:pl-20 xl:pr-44"
      style={moodStyle}
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 text-slate-400/30 font-mono text-[10px] tracking-[0.5em] uppercase whitespace-nowrap">
        Resonance Chamber
      </div>

      {/* ✨ 两列都允许收缩，间距来自容器而非十二列网格中的空轨。 */}
      <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] gap-y-14 lg:gap-x-[clamp(2.5rem,5vw,6rem)] w-full mt-8 lg:flex-1 lg:min-h-0 items-stretch">

        {/* 🕯️ 一套近光 + 远光：唱片是光源，词场只承接余光。 */}
        <StageGlow
          color={currentTrack.color}
          isPlaying={isPlaying}
          audible={volume > 0.001}
          active={active}
          enabled={ambienceEnabled}
          focus={desktopPanel}
        />

        {/* ================= 左侧：拟真转盘唱机（主角） ================= */}
        <div className="min-w-0 flex flex-col items-center justify-center relative h-full min-h-0">

          {/* 🎛️ 唱机基座 Plinth：玻璃木纹台面，承载转盘与唱臂 */}
          <div className="relative w-full max-w-[420px] lg:max-w-[480px] xl:max-w-[520px] aspect-[10/8.8] rounded-[2.5rem] bg-white/45 dark:bg-white/[0.04] border border-white/60 dark:border-white/10 backdrop-blur-xl shadow-[0_36px_90px_rgba(0,0,0,0.14)] dark:shadow-[0_36px_90px_rgba(0,0,0,0.6)]">

            {/* 台面微光拉丝 */}
            <div className="absolute inset-0 rounded-[2.5rem] bg-gradient-to-br from-white/35 via-transparent to-white/5 dark:from-white/[0.07] dark:to-transparent pointer-events-none" />
            {/* 台面顶缘高光，增强玻璃质感 */}
            <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/70 dark:via-white/20 to-transparent pointer-events-none" />

            {/* 💿 转盘 + 黑胶：偏左放置，给唱臂留出呼吸位 */}
            <div
              className="absolute left-[6%] top-1/2 -translate-y-1/2 w-[71%] aspect-square cursor-pointer group"
              onClick={togglePlay} role="button" aria-label={isPlaying ? '暂停' : '播放'}
            >
              {/* 🎛️ 拉丝金属转盘（platter）：黑胶坐落其上，带柔和径向高光与内阴影，质感更真实 */}
              <div className="absolute -inset-[4.5%] rounded-full bg-gradient-to-br from-slate-200/70 via-slate-300/45 to-slate-400/40 dark:from-white/[0.07] dark:via-black/30 dark:to-black/50 shadow-[inset_0_2px_10px_rgba(0,0,0,0.18)] border border-white/50 dark:border-white/[0.06]" />
              {/* 转盘边缘细圈，分隔黑胶与盘面 */}
              <div className="absolute -inset-[0.5%] rounded-full border border-white/25 dark:border-white/[0.05] pointer-events-none z-10" />

              <div
                ref={discRef}
                className="relative w-full h-full rounded-full shadow-[0_18px_45px_rgba(0,0,0,0.25)] dark:shadow-[0_18px_45px_rgba(0,0,0,0.7)] overflow-hidden border border-slate-500/20 dark:border-white/10 will-change-transform"
              >
                {/* 黑胶纹理 */}
                <div className="absolute inset-0" style={{ background: VINYL_GROOVES }} />
                {/* 反光弧 */}
                <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent mix-blend-overlay" />
                <div className="absolute inset-0 bg-gradient-to-bl from-transparent via-transparent to-white/5 mix-blend-overlay" />
                {/* 唱片贴纸 */}
                <div className="absolute inset-[31%] rounded-full flex items-center justify-center shadow-inner overflow-hidden" style={{ backgroundColor: 'var(--mood)' }}>
                  <div className="absolute inset-0 bg-black/10 mix-blend-overlay" />
                  <AnimatePresence initial={false}>
                    <motion.span
                      key={currentTrack.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={MOTION.move}
                      className="absolute font-mono text-[7px] tracking-[0.3em] uppercase text-white/80 rotate-[-12deg] select-none px-2 text-center leading-relaxed line-clamp-2"
                    >
                      {currentTrack.artist}
                    </motion.span>
                  </AnimatePresence>
                </div>
                {/* 中轴 */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[4.5%] h-[4.5%] bg-[#FAF8F3] dark:bg-[#0A0F1D] rounded-full shadow-[inset_0_2px_5px_rgba(0,0,0,0.5)] z-20" />
              </div>

              {/* 悬停播放/暂停提示 */}
              <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/0 group-hover:bg-black/25 opacity-0 group-hover:opacity-100 transition-all duration-500 backdrop-blur-[1px] z-30">
                <span className="text-white/90 drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] scale-[1.8]">
                  {isPlaying ? Icons.pause : Icons.play}
                </span>
              </div>
            </div>

            {/* 🦾 唱臂 Tonearm：随播放状态落针/抬臂，并随进度缓缓内移（ticker 驱动） */}
            <div className="absolute right-[9%] top-[13%] h-[62%] z-30 pointer-events-none">
              {/* 轴座 */}
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-[15%] min-w-9 aspect-square rounded-full bg-gradient-to-br from-slate-100 to-slate-300 dark:from-slate-600 dark:to-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.25)] border border-white/60 dark:border-white/10 z-20" />
              <div ref={armRef} className="relative h-full w-2 origin-top will-change-transform" style={{ transform: `rotate(${ARM_REST}deg)` }}>
                {/* 配重锤：枢轴上方 */}
                <div className="absolute -top-[9%] left-1/2 -translate-x-1/2 w-4 h-[10%] rounded-md bg-gradient-to-b from-slate-300 to-slate-400 dark:from-slate-500 dark:to-slate-700 shadow-md" />
                {/* 臂杆 */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[4px] h-[88%] rounded-full bg-gradient-to-b from-slate-300 via-slate-200 to-slate-300 dark:from-slate-500 dark:via-slate-400 dark:to-slate-500 shadow-[1px_2px_4px_rgba(0,0,0,0.2)]" />
                {/* 唱头壳 + 针尖 */}
                <div className="absolute bottom-[2%] left-1/2 -translate-x-1/2 flex flex-col items-center" style={{ transform: 'translateX(-50%) rotate(14deg)' }}>
                  <div className="w-3 h-6 rounded-[3px] bg-gradient-to-b from-slate-400 to-slate-600 dark:from-slate-400 dark:to-slate-700 shadow-md" />
                  <div className="w-[3px] h-[7px] -mt-px rounded-b-full" style={{ backgroundColor: 'var(--mood)' }} />
                </div>
                {/* 落针微光：播放时针尖晕出当前曲目情绪色 */}
                <div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full blur-md transition-[opacity,scale] duration-500 ease-out"
                  style={{ backgroundColor: 'var(--mood)', opacity: isPlaying ? 0.42 : 0, scale: isPlaying ? '1' : '0.7' }}
                />
              </div>
            </div>

            {/* 🔴 转速指示灯：右下角，呼吸节奏与播放同步 */}
            <div className="absolute right-[7%] bottom-[7%] flex items-center gap-2.5">
              <span
                className="w-2 h-2 rounded-full transition-[opacity,box-shadow] duration-300"
                style={{
                  backgroundColor: isPlaying ? 'var(--mood)' : 'rgba(148,163,184,0.4)',
                  opacity: isPlaying ? 0.9 : 0.5,
                  boxShadow: isPlaying ? '0 0 8px var(--mood)' : 'none',
                }}
              />
              <span className="font-mono text-[8px] tracking-[0.25em] text-slate-400 dark:text-slate-500 uppercase select-none">{isPlaying ? '33⅓ RPM' : 'STANDBY'}</span>
            </div>
          </div>

          {/* ✨ 播放控制台：进度 + 走带，收束于唱机正下方 */}
          <div className="w-full max-w-[420px] lg:max-w-[480px] xl:max-w-[520px] mt-10 lg:mt-12 relative z-20 flex flex-col gap-6">

            {/* 声波槽位：叠在唱机与进度条之间那道 48px 空隙里，不占排版高度（规矩 2）；
                只在歌词模式显形，选碟时声波在右栏铭牌上方。 */}
            <div
              className="absolute inset-x-0 -top-11 pointer-events-none transition-opacity duration-200"
              style={{ opacity: desktopPanel === 'lyrics' ? 1 : 0 }}
              aria-hidden={desktopPanel !== 'lyrics'}
            >
              <StageMeter color={currentTrack.color} isPlaying={isPlaying} bars={44} active={active && motionEnabled && desktopPanel === 'lyrics'} compact />
            </div>

            <PlaybackBar active={active} />

            {/* 走带控制行 */}
            <div className="flex items-center justify-between px-8 py-4 w-full rounded-full bg-white/40 dark:bg-white/[0.02] border border-white/60 dark:border-white/10 backdrop-blur-xl shadow-lg dark:shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
              <button type="button" onClick={togglePlayMode} title={modeDisplay.text} aria-label={modeDisplay.text} className="flex items-center justify-center w-10 h-10 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors outline-none shrink-0">
                {modeDisplay.icon}
              </button>
              <button type="button" onClick={playPrev} aria-label="上一首" className="flex items-center justify-center w-10 h-10 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:scale-110 transition-[color,transform] duration-200 outline-none shrink-0">
                {Icons.prev}
              </button>
              <button
                type="button"
                onClick={togglePlay} aria-label={isPlaying ? '暂停' : '播放'}
                className="w-14 h-14 rounded-full flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform duration-200 outline-none border border-white/20 shrink-0"
                style={{ backgroundColor: 'var(--mood)', boxShadow: '0 8px 25px color-mix(in srgb, var(--mood) 31%, transparent)' }}
              >
                {isPlaying ? Icons.pause : Icons.play}
              </button>
              <button type="button" onClick={playNext} aria-label="下一首" className="flex items-center justify-center w-10 h-10 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:scale-110 transition-[color,transform] duration-200 outline-none shrink-0">
                {Icons.next}
              </button>
              <button
                type="button"
                onClick={() => setAmbienceEnabled(value => !value)}
                aria-pressed={ambienceEnabled}
                aria-label={ambienceEnabled ? '关闭动态氛围' : '开启动态氛围'}
                title={ambienceEnabled ? '关闭动态氛围' : '开启动态氛围'}
                className={`flex h-10 w-10 shrink-0 items-center justify-center transition-colors ${
                  ambienceEnabled
                    ? 'text-slate-500 dark:text-slate-300'
                    : 'text-slate-300 dark:text-slate-600'
                }`}
              >
                {Icons.ambience}
              </button>
            </div>

            {/* 🔊 音量：点击图标静音/恢复，细滑轨染当前情绪色 */}
            <div className="flex items-center gap-3.5 px-4">
              <button
                type="button"
                onClick={toggleMute}
                aria-label={volume > 0 ? '静音' : '取消静音'}
                className="shrink-0 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors outline-none"
              >
                <VolumeIcon volume={volume} className="w-4 h-4" />
              </button>
              <div className="relative flex-1 group/vol h-6 md:h-4 flex items-center">
                <div className="absolute inset-x-0 h-[4px] md:h-[3px] group-hover/vol:scale-y-[1.6] rounded-full bg-slate-300/50 dark:bg-white/10 overflow-hidden transition-transform duration-200">
                  <div className="h-full w-full rounded-full origin-left" style={{ transform: `scaleX(${volume})`, backgroundColor: 'var(--mood)' }} />
                </div>
                <div
                  className="absolute w-3 h-3 rounded-full bg-white dark:bg-slate-100 shadow-md -translate-x-1/2 opacity-100 md:opacity-0 group-hover/vol:opacity-100 transition-opacity pointer-events-none ring-2"
                  style={{ left: `${volume * 100}%`, ['--tw-ring-color' as string]: 'var(--mood)' }}
                />
                <input
                  type="range" min={0} max={1} step={0.01} value={volume}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  aria-label="音量"
                  className="absolute inset-x-0 w-full h-6 md:h-4 appearance-none bg-transparent cursor-pointer opacity-0"
                />
              </div>
              <span className="font-mono text-[9px] tabular-nums text-slate-400 dark:text-slate-500 w-7 text-right select-none">{Math.round(volume * 100)}</span>
            </div>
          </div>
        </div>

        {/* ================= 右侧：切换条（固定） + 面板（原位交叉淡化） ================= */}
        <div className="min-w-0 flex flex-col items-center text-center w-full h-full min-h-0 relative z-20">

          {/* 歌词 / 选碟：同一舞台的两种观看距离。固定在右栏顶部，任何状态下都不移动（规矩 2）。 */}
          <div className="shrink-0 inline-flex mb-6 p-1 rounded-full bg-white/40 dark:bg-white/[0.035] border border-white/55 dark:border-white/[0.08] shadow-sm">
            {(['lyrics', 'crate'] as const).map(panel => (
              <button
                key={panel}
                type="button"
                onClick={() => chooseDesktopPanel(panel)}
                aria-pressed={desktopPanel === panel}
                className={`relative min-w-20 h-8 px-4 rounded-full font-mono text-[9px] tracking-[0.24em] transition-colors duration-200 outline-none ${desktopPanel === panel ? 'text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                {desktopPanel === panel && (
                  <motion.span
                    layoutId="resonancePanelPill"
                    className="absolute inset-0 rounded-full"
                    style={{ backgroundColor: 'var(--mood)', boxShadow: '0 4px 16px color-mix(in srgb, var(--mood) 25%, transparent)' }}
                    transition={MOTION.settle}
                  />
                )}
                <span className="relative z-10">{panel === 'lyrics' ? '歌词' : '选碟'}</span>
              </button>
            ))}
          </div>

          <div className="relative w-full flex-1 min-h-0">
            <AnimatePresence initial={false}>
              {desktopPanel === 'lyrics' ? (
                <motion.div
                  key="lyrics"
                  className="absolute inset-0 flex justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={MOTION.swap}
                >
                  <div className="w-full max-w-[540px] h-full">
                    <LyricPanel
                      track={currentTrack}
                      color={currentTrack.color}
                      isPlaying={isPlaying}
                      active={active}
                    />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="crate"
                  className="absolute inset-0 flex flex-col items-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={MOTION.swap}
                >
                  {/* 封套式曲目铭牌：声波 + 定高的歌名框 */}
                  <div className="shrink-0 w-full max-w-[480px] flex flex-col items-center">
                    {/* 声波是装饰：屏高不足时让位给碟箱 */}
                    <div className="w-full [@media(max-height:860px)]:hidden">
                      <StageMeter color={currentTrack.color} isPlaying={isPlaying} bars={72} active={active && motionEnabled} />
                    </div>
                    <div className="w-full mt-2"><TrackCaption track={currentTrack} isPlaying={isPlaying} withExcerpt onOpenNotes={openNotes} /></div>
                  </div>

                  {/* 分类栏（居中） */}
                  <div className="shrink-0 flex flex-wrap justify-center gap-x-5 md:gap-x-8 gap-y-2 mt-4 mb-5 w-full max-w-[540px] border-b border-slate-200/50 dark:border-white/5 pb-3">
                    {categoryBar(false)}
                  </div>

                  {/* 💿 选碟台 The Crate：一台拟真选碟箱，碟片在其中陈列，点选即「换碟上盘」 */}
                  <div className="w-full max-w-[520px] mx-auto flex flex-col flex-1 min-h-0 overflow-hidden">

                    {/* 🏷️ 极简标签行：身份标识 + 碟数 */}
                    <div className="shrink-0 flex items-center justify-between px-1 pb-3 mb-1 border-b border-transparent [border-image:linear-gradient(to_right,transparent,rgba(148,163,184,0.25),transparent)_1] dark:[border-image:linear-gradient(to_right,transparent,rgba(255,255,255,0.12),transparent)_1]">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full transition-opacity duration-300"
                          style={{ backgroundColor: 'var(--mood)', opacity: isPlaying ? 0.9 : 0.5 }}
                        />
                        <span className="font-mono text-[9px] tracking-[0.32em] uppercase text-slate-500 dark:text-slate-400">The Crate · 选碟台</span>
                      </div>
                      <span className="font-mono text-[9px] tracking-[0.2em] text-slate-400/70 dark:text-slate-600 tabular-nums">{filteredPlaylist.length} 首</span>
                    </div>

                    {/* 碟槽区：用 mask 让内容上下淡出成透明，无论背景或光晕都自然融入 */}
                    <div className="relative flex-1 min-h-0">
                      <div
                        className="absolute inset-0 overflow-y-auto pb-10 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        style={crateMask(28, 56)}
                      >
                        <CrateList groups={albumGroups} currentTrackId={currentTrack.id} isPlaying={isPlaying} live={motionEnabled} />
                        {filteredPlaylist.length === 0 && (
                          <div className="pt-16 text-center font-serif italic text-slate-400 dark:text-slate-600 text-sm">碟箱里没有匹配的碟片…</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 📜 内页：盖在铭牌与碟箱上方，绝对定位，不推动任何东西 */}
                  <LinerNotes track={currentTrack} open={notesOpen} onClose={closeNotes} isOwner={isOwner} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      <div className="oasis-bottom-spacer" aria-hidden />
    </motion.div>
  );
};
