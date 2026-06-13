// src/components/OasisResonance.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSoundscape, getSpectrum } from '../hooks/useSoundscape';
import type { MusicCategory } from '../types/music';

// 🌊 实时声波条：直接订阅 Web Audio 频谱，与正在播放的音乐律动同步。
// 独立成组件，把每帧的高频刷新隔离在这里，避免整个面板 60fps 重渲染。
const LiveSpectrum: React.FC<{ color: string; isPlaying: boolean; bars?: number }> = ({ color, isPlaying, bars = 11 }) => {
  const [levels, setLevels] = useState<number[]>(() => new Array(bars).fill(0));

  // rAF 常驻：播放时读取真实频谱，暂停时 getSpectrum 自然返回 0，
  // 声波借 CSS 过渡柔和落回静息线，而非瞬间归零。
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setLevels(getSpectrum(bars));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bars]);

  // 镜像波形：声条以中线为基准上下对称生长，比单边触底更具音乐性与美感
  return (
    <div className="relative flex items-center justify-center gap-[3px] h-12 w-full">
      {/* 静息中线，暂停时声条柔和落回这条线 */}
      <span className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-current to-transparent opacity-10 pointer-events-none" style={{ color }} />
      {levels.map((lv, i) => {
        const e = Math.pow(lv, 0.82); // 轻微提亮中段，弱信号也可见
        return (
          <span
            key={i}
            className="w-[3px] rounded-full"
            style={{
              height: `${6 + e * 94}%`,
              backgroundColor: color,
              opacity: isPlaying ? 0.28 + e * 0.72 : 0.18,
              boxShadow: e > 0.6 ? `0 0 9px ${color}` : 'none',
              transition: 'height 120ms cubic-bezier(0.22,0.61,0.36,1), opacity 240ms linear, box-shadow 240ms linear',
            }}
          />
        );
      })}
    </div>
  );
};

// 🌫️ 环境光晕：随音乐整体能量呼吸，让氛围与声波同步起伏。
// 用 ref 直接改样式而非 state，60fps 也不触发 React 重渲染。
const AmbientGlow: React.FC<{ color: string; isPlaying: boolean }> = ({ color, isPlaying }) => {
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      const el = ref.current;
      if (el) {
        if (isPlaying) {
          const spec = getSpectrum(24);
          // 偏重低频做「节拍包络」：鼓点一来迅速点亮，再缓缓回落，呼吸跟着节奏走
          const bass = (spec[0] + spec[1] + spec[2] + spec[3]) / 4;
          const energy = spec.reduce((a, b) => a + b, 0) / spec.length;
          const beat = Math.max(bass, energy);
          const rate = beat > smooth ? 0.4 : 0.05; // 快起慢落
          smooth += (beat - smooth) * rate;
          el.style.transform = `translate(-50%, -50%) scale(${1 + smooth * 0.24})`;
          el.style.opacity = `${0.08 + smooth * 0.55}`;
        } else {
          smooth += (0 - smooth) * 0.04;
          el.style.transform = `translate(-50%, -50%) scale(${1 + smooth * 0.24})`;
          el.style.opacity = `${0.05 + smooth * 0.3}`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  return (
    <div
      ref={ref}
      className="absolute top-1/2 left-1/2 rounded-full blur-[100px] dark:blur-[130px] mix-blend-multiply dark:mix-blend-screen pointer-events-none"
      style={{ width: '115%', height: '115%', backgroundColor: color, transform: 'translate(-50%, -50%)', opacity: 0.06, transition: 'background-color 2000ms ease' }}
    />
  );
};

// 2 位十六进制透明度
const alphaHex = (a: number) => Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');

// 🎶 歌名本身：随音乐能量轻轻呼吸晕光，让标题成为律动的主角而非静态文字。
const ReactiveTitle: React.FC<{ title: string; color: string; isPlaying: boolean }> = ({ title, color, isPlaying }) => {
  const ref = React.useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      const el = ref.current;
      if (el) {
        const spec = isPlaying ? getSpectrum(16) : [];
        const energy = spec.length ? spec.reduce((a, b) => a + b, 0) / spec.length : 0;
        smooth += (energy - smooth) * 0.14;
        const glow = isPlaying ? 0.18 + smooth * 0.55 : 0;
        el.style.textShadow = glow > 0.01
          ? `0 0 ${10 + smooth * 38}px ${color}${alphaHex(glow)}`
          : 'none';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [color, isPlaying]);

  return (
    <h2
      ref={ref}
      className="text-[2.6rem] md:text-6xl font-serif text-slate-800 dark:text-slate-50 tracking-wide leading-[1.12] w-full text-balance transition-colors duration-[1500ms]"
    >
      {title}
    </h2>
  );
};

const Icons = {
  sequence: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>),
  loop: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /></svg>),
  shuffle: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>),
  play: (<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className="w-[20px] h-[20px] ml-1"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>),
  pause: (<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className="w-[20px] h-[20px]"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>),
  prev: (<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className="w-[18px] h-[18px]"><polygon points="19 20 9 12 19 4 19 20" /><rect x="5" y="4" width="2" height="16" rx="1" /></svg>),
  next: (<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className="w-[18px] h-[18px]"><polygon points="5 4 15 12 5 20 5 4" /><rect x="17" y="4" width="2" height="16" rx="1" /></svg>),
};

const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const CATEGORIES: { id: MusicCategory; label: string }[] = [
  { id: 'All Tracks', label: 'ALL TRACKS' },
  { id: 'Yorushika', label: 'YORUSHIKA' },
  { id: 'Atarayo', label: 'ATARAYO' },
  { id: 'Miku', label: 'MIKU' }
];

// 💿 唱片纹理：列表迷你碟与主唱盘共用同一套视觉语言
const VINYL_GROOVES = 'repeating-radial-gradient(circle at 50% 50%, #111 0px, #111 3px, #1b1b1f 4px, #111 5px)';
const MINI_GROOVES = 'repeating-radial-gradient(circle at 50% 50%, #14141a 0px, #14141a 1.5px, #22222a 2px, #14141a 2.5px)';

export const OasisResonance: React.FC = () => {
  const { currentTrack, isPlaying, playMode, currentTime, duration, togglePlay, switchTrack, togglePlayMode, seek, playNext, playPrev, playlist } = useSoundscape();
  const [activeCategory, setActiveCategory] = useState<MusicCategory>('All Tracks');

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // 🦾 唱臂角度：播放时落针并随进度缓缓内移（外圈→内圈），暂停/停止时抬臂归位
  const armAngle = isPlaying ? 16 + (progress / 100) * 13 : -14;

  const modeDisplay = useMemo(() => {
    if (playMode === 'loop') return { icon: Icons.loop, text: 'LOOP' };
    if (playMode === 'sequence') return { icon: Icons.sequence, text: 'SEQ' };
    return { icon: Icons.shuffle, text: 'RND' };
  }, [playMode]);

  const filteredPlaylist = useMemo(() => {
    if (activeCategory === 'All Tracks') return playlist;
    return playlist.filter(track => track.category === activeCategory);
  }, [activeCategory, playlist]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { 'All Tracks': playlist.length };
    playlist.forEach(t => { counts[t.category] = (counts[t.category] || 0) + 1; });
    return counts;
  }, [playlist]);

  return (
    <motion.div
      className="relative w-full max-w-[1680px] mx-auto min-h-[85vh] flex flex-col z-10 pt-12 pb-8 px-6 md:px-16 lg:px-24 xl:px-32"
      initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, scale: 1.02, filter: 'blur(10px)' }} transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 text-slate-400/30 font-mono text-[10px] tracking-[0.5em] uppercase whitespace-nowrap">
        Resonance Chamber
      </div>

      {/* ✨ 核心排版：左侧唱机 / 右侧选碟架 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-y-16 lg:gap-x-24 xl:gap-x-32 w-full h-full mt-10 items-center">

        {/* ================= 左侧 (6/12)：拟真转盘唱机 ================= */}
        <div className="col-span-1 lg:col-span-6 flex flex-col items-center justify-center relative">

          {/* 超大环境光晕：随声波能量呼吸 */}
          <AmbientGlow color={currentTrack.color} isPlaying={isPlaying} />

          {/* 🎛️ 唱机基座 Plinth：玻璃木纹台面，承载转盘与唱臂 */}
          <div className="relative w-full max-w-[400px] lg:max-w-[520px] aspect-[10/8.4] rounded-[2.25rem] bg-white/45 dark:bg-white/[0.04] border border-white/60 dark:border-white/10 backdrop-blur-xl shadow-[0_36px_90px_rgba(0,0,0,0.14)] dark:shadow-[0_36px_90px_rgba(0,0,0,0.6)] transition-colors duration-[1500ms]">

            {/* 台面微光拉丝 */}
            <div className="absolute inset-0 rounded-[2.25rem] bg-gradient-to-br from-white/35 via-transparent to-white/5 dark:from-white/[0.07] dark:to-transparent pointer-events-none" />
            {/* 台面顶缘高光，增强玻璃质感 */}
            <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/70 dark:via-white/20 to-transparent pointer-events-none" />

            {/* 💿 转盘 + 黑胶：偏左放置，给唱臂留出呼吸位 */}
            <div
              className="absolute left-[6%] top-1/2 -translate-y-1/2 w-[71%] aspect-square cursor-pointer group"
              onClick={togglePlay} role="button" aria-label={isPlaying ? '暂停' : '播放'}
            >
              {/* 转盘底缘 */}
              <div className="absolute -inset-[3.5%] rounded-full bg-slate-300/40 dark:bg-black/40 shadow-inner border border-white/40 dark:border-white/5 transition-colors duration-[1500ms]" />

              <div
                className="relative w-full h-full rounded-full shadow-[0_18px_45px_rgba(0,0,0,0.25)] dark:shadow-[0_18px_45px_rgba(0,0,0,0.7)] overflow-hidden border border-slate-500/20 dark:border-white/10"
                style={{ animation: 'oasis-spin 18s linear infinite', animationPlayState: isPlaying ? 'running' : 'paused' }}
              >
                {/* 黑胶纹理 */}
                <div className="absolute inset-0" style={{ background: VINYL_GROOVES }} />
                {/* 反光弧 */}
                <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent mix-blend-overlay" />
                <div className="absolute inset-0 bg-gradient-to-bl from-transparent via-transparent to-white/5 mix-blend-overlay" />
                {/* 唱片贴纸 */}
                <div className="absolute inset-[31%] rounded-full flex items-center justify-center shadow-inner overflow-hidden transition-colors duration-[1500ms]" style={{ backgroundColor: currentTrack.color }}>
                  <div className="absolute inset-0 bg-black/10 mix-blend-overlay" />
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={currentTrack.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6, ease: 'easeInOut' }}
                      className="font-mono text-[7px] tracking-[0.3em] uppercase text-white/80 rotate-[-12deg] select-none px-2 text-center leading-relaxed line-clamp-2"
                    >
                      {currentTrack.artist}
                    </motion.span>
                  </AnimatePresence>
                </div>
                {/* 中轴 */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[4.5%] h-[4.5%] bg-[#F8FAFC] dark:bg-[#0A0F1D] rounded-full shadow-[inset_0_2px_5px_rgba(0,0,0,0.5)] z-20" />
              </div>

              {/* 悬停播放/暂停提示 */}
              <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/0 group-hover:bg-black/25 opacity-0 group-hover:opacity-100 transition-all duration-500 backdrop-blur-[1px] z-30">
                <span className="text-white/90 drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] scale-[1.8]">
                  {isPlaying ? Icons.pause : Icons.play}
                </span>
              </div>
            </div>

            {/* 🦾 唱臂 Tonearm：随播放状态落针/抬臂，并随进度缓缓内移 */}
            <div className="absolute right-[9%] top-[13%] h-[62%] z-30 pointer-events-none">
              {/* 轴座 */}
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-[15%] min-w-9 aspect-square rounded-full bg-gradient-to-br from-slate-100 to-slate-300 dark:from-slate-600 dark:to-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.25)] border border-white/60 dark:border-white/10 z-20 transition-colors duration-[1500ms]" />
              <motion.div
                className="relative h-full w-2 origin-top"
                animate={{ rotate: armAngle }}
                transition={{ type: 'spring', stiffness: 45, damping: 13, mass: 1.2 }}
              >
                {/* 配重锤：枢轴上方 */}
                <div className="absolute -top-[9%] left-1/2 -translate-x-1/2 w-4 h-[10%] rounded-md bg-gradient-to-b from-slate-300 to-slate-400 dark:from-slate-500 dark:to-slate-700 shadow-md transition-colors duration-[1500ms]" />
                {/* 臂杆 */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[4px] h-[88%] rounded-full bg-gradient-to-b from-slate-300 via-slate-200 to-slate-300 dark:from-slate-500 dark:via-slate-400 dark:to-slate-500 shadow-[1px_2px_4px_rgba(0,0,0,0.2)] transition-colors duration-[1500ms]" />
                {/* 唱头壳 + 针尖 */}
                <div className="absolute bottom-[2%] left-1/2 -translate-x-1/2 flex flex-col items-center" style={{ transform: 'translateX(-50%) rotate(14deg)' }}>
                  <div className="w-3 h-6 rounded-[3px] bg-gradient-to-b from-slate-400 to-slate-600 dark:from-slate-400 dark:to-slate-700 shadow-md transition-colors duration-[1500ms]" />
                  <div className="w-[3px] h-[7px] -mt-px rounded-b-full transition-colors duration-[1500ms]" style={{ backgroundColor: currentTrack.color }} />
                </div>
                {/* 落针微光：播放时针尖晕出当前曲目情绪色 */}
                <motion.div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full blur-md"
                  animate={{ opacity: isPlaying ? 0.55 : 0, scale: isPlaying ? [1, 1.25, 1] : 0.6 }}
                  transition={{ scale: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } }}
                  style={{ backgroundColor: currentTrack.color }}
                />
              </motion.div>
            </div>

            {/* 🔴 转速指示灯：右下角，呼吸节奏与播放同步 */}
            <div className="absolute right-[7%] bottom-[7%] flex items-center gap-2.5">
              <motion.span
                className="w-2 h-2 rounded-full"
                animate={{ backgroundColor: isPlaying ? currentTrack.color : 'rgba(148,163,184,0.4)', opacity: isPlaying ? [1, 0.45, 1] : 0.5, boxShadow: isPlaying ? `0 0 8px ${currentTrack.color}` : 'none' }}
                transition={{ opacity: { duration: 2, repeat: Infinity, ease: 'easeInOut' } }}
              />
              <span className="font-mono text-[8px] tracking-[0.25em] text-slate-400 dark:text-slate-500 uppercase select-none">{isPlaying ? '33⅓ RPM' : 'STANDBY'}</span>
            </div>
          </div>

          {/* ✨ 播放控制台：进度 + 走带，收束于唱机正下方 */}
          <div className="w-full max-w-[380px] lg:max-w-[460px] mt-12 relative z-20 flex flex-col gap-6">

            {/* 进度条 */}
            <div className="flex items-center gap-4 px-2">
              <span className="font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400 w-9 text-right transition-colors duration-[1500ms]">
                {formatTime(currentTime)}
              </span>
              <div className="relative flex-1 group/seek h-4 flex items-center">
                <div className="absolute inset-x-0 h-[3px] group-hover/seek:h-[5px] rounded-full bg-slate-300/50 dark:bg-white/10 overflow-hidden transition-all duration-300">
                  <div className="h-full rounded-full transition-colors duration-[1500ms] relative" style={{ width: `${progress}%`, backgroundColor: currentTrack.color, boxShadow: `0 0 10px ${currentTrack.color}90` }}>
                    {/* 进度末端流动微光，增强律动感 */}
                    <span className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-full bg-gradient-to-r from-transparent to-white/40 mix-blend-overlay" />
                  </div>
                </div>
                <div
                  className="absolute w-3 h-3 rounded-full bg-white dark:bg-slate-100 shadow-md -translate-x-1/2 opacity-0 group-hover/seek:opacity-100 transition-opacity pointer-events-none ring-2"
                  style={{ left: `${progress}%`, ['--tw-ring-color' as string]: currentTrack.color }}
                />
                <input
                  type="range" min={0} max={duration || 0} step={0.1} value={currentTime}
                  onChange={(e) => seek(Number(e.target.value))}
                  aria-label="播放进度"
                  className="absolute inset-x-0 w-full h-4 appearance-none bg-transparent cursor-pointer opacity-0"
                />
              </div>
              <span className="font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400 w-9 transition-colors duration-[1500ms]">
                {formatTime(duration)}
              </span>
            </div>

            {/* 走带控制行 */}
            <div className="flex items-center justify-between px-8 py-4 w-full rounded-full bg-white/40 dark:bg-white/[0.02] border border-white/60 dark:border-white/10 backdrop-blur-xl shadow-lg dark:shadow-[0_10px_30px_rgba(0,0,0,0.3)] transition-colors duration-[1500ms]">
              <button onClick={togglePlayMode} title={modeDisplay.text} className="flex items-center justify-center w-10 h-10 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-all outline-none shrink-0">
                {modeDisplay.icon}
              </button>
              <button onClick={playPrev} aria-label="上一首" className="flex items-center justify-center w-10 h-10 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:scale-110 transition-all outline-none shrink-0">
                {Icons.prev}
              </button>
              <button
                onClick={togglePlay} aria-label={isPlaying ? '暂停' : '播放'}
                className="w-14 h-14 rounded-full flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-all duration-300 outline-none border border-white/20 shrink-0"
                style={{ backgroundColor: currentTrack.color, boxShadow: `0 8px 25px ${currentTrack.color}50` }}
              >
                {isPlaying ? Icons.pause : Icons.play}
              </button>
              <button onClick={playNext} aria-label="下一首" className="flex items-center justify-center w-10 h-10 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:scale-110 transition-all outline-none shrink-0">
                {Icons.next}
              </button>
              <span className="flex items-center justify-center w-10 h-10 font-mono text-[9px] tracking-[0.15em] text-slate-300 dark:text-slate-600 select-none shrink-0 transition-colors duration-[1500ms]">
                {modeDisplay.text}
              </span>
            </div>
          </div>
        </div>

        {/* ================= 右侧 (6/12)：曲目信息（居中） + 选碟架 ================= */}
        <div className="col-span-1 lg:col-span-6 flex flex-col items-center text-center w-full h-full relative z-20">

          {/* 🎶 正在共鸣 · 居中置于歌单上方中央，声波 → 歌名 → 艺术家 → 歌词 自上而下 */}
          <div className="w-full max-w-[480px] flex flex-col items-center">

            {/* 状态标签：左右对称细线，更具仪式感 */}
            <div className="flex items-center gap-3 w-full max-w-[280px] mb-3">
              <span className="h-px flex-1 bg-gradient-to-l from-slate-300/50 dark:from-white/10 to-transparent" />
              <span className="font-mono text-[8px] tracking-[0.45em] uppercase text-slate-400/80 dark:text-slate-500 whitespace-nowrap select-none">
                {isPlaying ? 'Now Resonating' : 'Paused'}
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-slate-300/50 dark:from-white/10 to-transparent" />
            </div>

            <LiveSpectrum color={currentTrack.color} isPlaying={isPlaying} bars={32} />

            <AnimatePresence mode="wait">
              <motion.div key={currentTrack.id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className="flex flex-col items-center w-full mt-4">

                <ReactiveTitle title={currentTrack.title} color={currentTrack.color} isPlaying={isPlaying} />

                <div className="flex items-center justify-center gap-3 mt-5">
                  <motion.span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: currentTrack.color }}
                    animate={{ opacity: isPlaying ? [1, 0.35, 1] : 0.4, scale: isPlaying ? [1, 0.85, 1] : 1 }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <p className="font-mono text-[11px] md:text-xs tracking-[0.4em] uppercase text-slate-500 dark:text-slate-400 transition-colors duration-[1500ms]">
                    {currentTrack.artist}
                  </p>
                </div>

                {currentTrack.lyric && (
                  <motion.p
                    animate={{ opacity: isPlaying ? 1 : 0.55 }} transition={{ duration: 1.5, ease: 'easeOut' }}
                    className="mt-7 max-w-[420px] font-serif italic text-slate-600 dark:text-slate-300 tracking-wider text-base md:text-lg leading-loose transition-colors duration-[1500ms]"
                  >
                    <span className="mr-0.5 text-xl align-[-0.15em] opacity-60" style={{ color: currentTrack.color }}>“</span>
                    {currentTrack.lyric}
                    <span className="ml-0.5 text-xl align-[-0.15em] opacity-60" style={{ color: currentTrack.color }}>”</span>
                  </motion.p>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* 分类栏（居中） */}
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 mt-9 mb-7 w-full max-w-[540px] border-b border-slate-200/50 dark:border-white/5 pb-4">
            {CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`relative flex items-baseline gap-1.5 font-mono text-[10px] tracking-[0.2em] uppercase transition-all duration-700 outline-none pb-2 ${activeCategory === cat.id ? 'text-slate-800 dark:text-slate-100 font-bold' : 'text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                {cat.label}
                <sup className={`text-[8px] tracking-normal transition-opacity duration-700 ${activeCategory === cat.id ? 'opacity-70' : 'opacity-40'}`}>{categoryCounts[cat.id] ?? 0}</sup>
                {activeCategory === cat.id && (
                  <motion.div layoutId="activeCategory" className="absolute -bottom-[1px] left-0 right-0 h-[2px] rounded-full transition-colors duration-[1500ms]" style={{ backgroundColor: currentTrack.color }} />
                )}
              </button>
            ))}
          </div>

          {/* 💿 选碟架：每首歌是一张迷你唱片，点击即「换碟上盘」 */}
          <div className="w-full max-w-[560px] mx-auto flex-1 relative min-h-[350px]">
            <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-[#F8FAFC] dark:from-[#0A0F1D] to-transparent z-10 pointer-events-none transition-colors duration-[1500ms]" />
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#F8FAFC] dark:from-[#0A0F1D] to-transparent z-10 pointer-events-none transition-colors duration-[1500ms]" />

            <div className="absolute inset-0 overflow-y-auto pt-2 pb-16 pr-3 space-y-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <AnimatePresence mode="popLayout">
                {filteredPlaylist.map((track, index) => {
                  const isActive = currentTrack.id === track.id;
                  return (
                    <motion.button
                      layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      key={track.id} onClick={() => switchTrack(track)}
                      className={`relative w-full pl-4 pr-4 py-2.5 rounded-xl transition-colors duration-500 outline-none flex items-center gap-4 text-left group ${
                        isActive ? 'bg-white/55 dark:bg-white/[0.05]' : 'hover:bg-white/35 dark:hover:bg-white/[0.03]'
                      }`}
                      whileHover={{ x: 4 }} whileTap={{ scale: 0.985 }}
                    >
                      {/* 激活情绪色竖条 */}
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-full transition-all duration-500" style={{ height: isActive ? '55%' : '0%', backgroundColor: track.color, opacity: isActive ? 1 : 0 }} />

                      {/* 💿 迷你唱片：在架时静止，上盘后随播放旋转；悬停浮出播放暗示 */}
                      <motion.span
                        className="relative w-10 h-10 shrink-0 rounded-full overflow-hidden shadow-[0_3px_8px_rgba(0,0,0,0.25)] border border-black/20 dark:border-white/10"
                        animate={{ scale: isActive ? 1.06 : 1 }}
                        style={{ animation: 'oasis-spin 5s linear infinite', animationPlayState: isActive && isPlaying ? 'running' : 'paused' }}
                      >
                        <span className="absolute inset-0" style={{ background: MINI_GROOVES }} />
                        <span className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent mix-blend-overlay" />
                        <span className="absolute inset-[30%] rounded-full" style={{ backgroundColor: track.color }} />
                        <span className="absolute inset-[45%] rounded-full bg-[#F8FAFC] dark:bg-[#0A0F1D] transition-colors duration-[1500ms]" />
                      </motion.span>
                      {/* 悬停播放暗示（不随碟旋转） */}
                      {!isActive && (
                        <span className="absolute left-4 w-10 h-10 rounded-full flex items-center justify-center bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                          <svg viewBox="0 0 24 24" fill="white" className="w-3.5 h-3.5 ml-0.5"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                        </span>
                      )}

                      <div className="flex flex-col min-w-0 flex-1">
                        <span className={`font-serif text-[15px] md:text-base leading-snug tracking-wide transition-colors duration-500 truncate ${isActive ? 'text-slate-900 dark:text-slate-50 font-semibold' : 'text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100'}`}>
                          {track.title}
                        </span>
                        <span className={`font-mono text-[9px] md:text-[10px] tracking-[0.2em] uppercase mt-0.5 transition-colors duration-500 ${isActive ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400/80 dark:text-slate-500'}`}>
                          {track.artist}
                        </span>
                      </div>

                      {/* 右端状态：激活显示跳动音轨 / NOW ON DECK，常态显示序号 */}
                      <span className="shrink-0 flex items-center gap-2.5">
                        {isActive ? (
                          <>
                            <span className="hidden md:inline font-mono text-[8px] tracking-[0.25em] uppercase" style={{ color: track.color }}>On Deck</span>
                            <span className="flex items-end gap-[2px] h-3.5">
                              {isPlaying ? [0, 0.2, 0.4].map((d, i) => (
                                <motion.span key={i} className="w-[2px] rounded-full" style={{ backgroundColor: track.color }} animate={{ height: ['30%', '100%', '30%'] }} transition={{ duration: 0.7, repeat: Infinity, delay: d }} />
                              )) : <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: track.color }} />}
                            </span>
                          </>
                        ) : (
                          <span className="font-mono text-[10px] tabular-nums text-slate-400/60 dark:text-slate-600 select-none">{String(index + 1).padStart(2, '0')}</span>
                        )}
                      </span>
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

        </div>
      </div>
    </motion.div>
  );
};
