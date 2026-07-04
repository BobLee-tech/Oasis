// src/components/OasisResonance.tsx
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useIsPresent } from 'framer-motion';
import { useSoundscape, getSpectrum } from '../hooks/useSoundscape';
import type { MusicCategory, Track } from '../types/music';

// 🌊 实时声波条：直接订阅 Web Audio 频谱，与正在播放的音乐律动同步。
// 独立成组件，把每帧的高频刷新隔离在这里，避免整个面板 60fps 重渲染。
const LiveSpectrum: React.FC<{ color: string; isPlaying: boolean; bars?: number; active?: boolean }> = ({ color, isPlaying, bars = 11, active = true }) => {
  const barsRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(isPlaying);
  playingRef.current = isPlaying;

  // rAF 常驻：播放时读取真实频谱，暂停时 getSpectrum 自然返回 0，
  // 声波借 CSS 过渡柔和落回静息线，而非瞬间归零。
  // 对称布局：低频置于正中央、向两侧镜像生长，能量「从中间开始」而非自左铺开。
  // ⚡ 直接用 ref 写 DOM 样式：每帧 setState 会让 React 重渲染整排声条，移动端掉帧明显。
  useEffect(() => {
    if (!active) return; // 视图非激活（含切换退场期间）时停转，避免高频刷新争用主线程
    let raf = 0;
    const half = Math.ceil(bars / 2);
    const center = (bars - 1) / 2;
    const tick = () => {
      const container = barsRef.current;
      if (container) {
        const spec = getSpectrum(half);            // 低→高
        const playing = playingRef.current;
        const children = container.children;
        for (let i = 0; i < children.length; i++) {
          const d = Math.round(Math.abs(i - center)); // 到中心的距离 → 频段（中心=低频）
          const lv = spec[Math.min(half - 1, d)];
          const e = Math.pow(lv, 0.72); // 更大的动态范围，弱信号也清晰可辨
          const el = children[i] as HTMLElement;
          el.style.height = `${3 + e * 97}%`;
          el.style.opacity = `${playing ? 0.22 + e * 0.78 : 0.16}`;
          el.style.boxShadow = e > 0.55 ? `0 0 ${5 + e * 8}px ${color}` : 'none';
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bars, active, color]);

  // 镜像波形：声条以中线为基准上下对称生长，比单边触底更具音乐性与美感
  return (
    <div className="relative flex items-center justify-center h-16 w-full">
      {/* 静息中线，暂停时声条柔和落回这条线 */}
      <span className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-current to-transparent opacity-10 pointer-events-none" style={{ color }} />
      <div ref={barsRef} className="flex items-center justify-center gap-[2px] h-full w-full">
        {Array.from({ length: bars }, (_, i) => (
          <span
            key={i}
            className="w-[2px] rounded-full flex-shrink-0"
            style={{
              height: '3%',
              backgroundColor: color,
              opacity: 0.16,
              transition: 'height 90ms cubic-bezier(0.22,0.61,0.36,1), opacity 200ms linear, box-shadow 200ms linear',
            }}
          />
        ))}
      </div>
    </div>
  );
};

// 💿 唱片光晕：染当前曲目情绪色。播放时随频谱节拍律动（鼓点点亮、缓落呼吸），
//    暂停时丝滑淡出、重新播放时丝滑淡入——常驻 rAF + presence 包络做无缝渐变，
//    而非 isPlaying 切换时重启动画造成的生硬跳变。
const DiscHalo: React.FC<{ color: string; isPlaying: boolean; active?: boolean }> = ({ color, isPlaying, active = true }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const playingRef = React.useRef(isPlaying);
  playingRef.current = isPlaying;

  useEffect(() => {
    if (!active) return; // 非激活时停转：避免每帧重栅格化 blur-3xl 大模糊层
    let raf = 0;
    let fast = 0;       // 快包络：锐利捕捉鼓点/瞬态，毫秒级起跳
    let slow = 0;       // 慢包络：沉稳的呼吸底色
    let presence = 0;   // 播放存在度 0→1，驱动丝滑淡入淡出
    const tick = () => {
      const el = ref.current;
      if (el) {
        const playing = playingRef.current;
        presence += ((playing ? 1 : 0) - presence) * 0.05; // 柔和淡入淡出（约数百毫秒）
        let beat = 0;
        if (playing) {
          // 高分辨率取谱，低频加权——鼓点的力度被更细腻地拾取
          const spec = getSpectrum(32);
          let bass = 0, mid = 0;
          for (let i = 0; i < 6; i++) bass += spec[i];
          for (let i = 6; i < 18; i++) mid += spec[i];
          bass /= 6; mid /= 12;
          const energy = spec.reduce((a, b) => a + b, 0) / spec.length;
          beat = Math.max(bass * 1.15, mid * 0.85, energy);
        }
        // 双包络：快包络抓节奏的「点」，慢包络铺律动的「线」，叠加后既灵动又不闪烁
        fast += (beat - fast) * (beat > fast ? 0.55 : 0.16);
        slow += (beat - slow) * (beat > slow ? 0.22 : 0.05);
        const level = slow * 0.62 + fast * 0.5;
        el.style.opacity = `${presence * (0.15 + level * 0.62)}`;
        el.style.transform = `scale(${1 + level * 0.16 * presence})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return (
    <div
      ref={ref}
      className="absolute -inset-[12%] rounded-full blur-3xl pointer-events-none z-0"
      style={{ backgroundColor: color, opacity: 0, transition: 'background-color 1500ms ease' }}
    />
  );
};

// 🌫️ 环境光晕：随音乐整体能量呼吸，让氛围与声波同步起伏。
// 用 ref 直接改样式而非 state，60fps 也不触发 React 重渲染。
const AmbientGlow: React.FC<{ color: string; isPlaying: boolean; active?: boolean }> = ({ color, isPlaying, active = true }) => {
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return; // 非激活时停转：blur-[100px] 巨型模糊层每帧变换极昂贵，切换时尤甚
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
  }, [isPlaying, active]);

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
const ReactiveTitle: React.FC<{ title: string; color: string; isPlaying: boolean; active?: boolean }> = ({ title, color, isPlaying, active = true }) => {
  const ref = React.useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!active) return; // 非激活时停转
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
  }, [color, isPlaying, active]);

  return (
    <h2
      ref={ref}
      className="text-[2rem] sm:text-[2.6rem] md:text-6xl font-serif text-slate-800 dark:text-slate-50 tracking-wide leading-[1.12] w-full text-balance transition-colors duration-[1500ms]"
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

export const OasisResonance: React.FC = () => {
  // 🎚️ 视图是否「在场」：切换离场时（AnimatePresence 退场期间）useIsPresent 立即转 false，
  //    据此关停所有高频 rAF 视觉，避免退场动画与新视图挂载争用主线程/GPU，消除切换卡顿。
  const active = useIsPresent();
  // 🖥️ 大屏才启用最重的氛围视觉（挂载时判定一次即可，旋转/拉伸窗口属边缘场景）
  const isDesktop = useRef(typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches).current;
  const { currentTrack, isPlaying, playMode, currentTime, duration, volume, togglePlay, switchTrack, togglePlayMode, seek, playNext, playPrev, changeVolume, playlist } = useSoundscape();
  const [activeCategory, setActiveCategory] = useState<MusicCategory>('All Tracks');

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // 🦾 唱臂角度：播放时落针并随进度缓缓内移（外圈→内圈），暂停/停止时抬臂归位
  const armAngle = isPlaying ? 16 + (progress / 100) * 13 : -14;

  // 💿 真实唱盘惯性：用 rAF 让转速平滑趋近目标，播放时缓缓启转、暂停时自然滑停，
  //    取代 CSS animationPlayState 的「咔哒」式骤停骤起。
  const discRef = useRef<HTMLDivElement>(null);
  const spin = useRef({ angle: 0, vel: 0 });        // 当前角度(deg) 与角速度(deg/s)
  const targetVel = useRef(0);                       // 目标角速度：播放 20deg/s(≈18s 一圈)，暂停 0
  useEffect(() => { targetVel.current = isPlaying ? 20 : 0; }, [isPlaying]);
  useEffect(() => {
    if (!active) return; // 非激活时停转盘
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const s = spin.current;
      // 指数趋近：时间常数 ≈1.4s，启转与滑停都舒缓自然
      s.vel += (targetVel.current - s.vel) * (1 - Math.exp(-dt / 1.4));
      s.angle = (s.angle + s.vel * dt) % 360;
      if (discRef.current) discRef.current.style.transform = `rotate(${s.angle}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const modeDisplay = useMemo(() => {
    if (playMode === 'loop') return { icon: Icons.loop, text: 'LOOP' };
    if (playMode === 'sequence') return { icon: Icons.sequence, text: 'SEQ' };
    return { icon: Icons.shuffle, text: 'RND' };
  }, [playMode]);

  const filteredPlaylist = useMemo(() => {
    if (activeCategory === 'All Tracks') return playlist;
    return playlist.filter(track => track.category === activeCategory);
  }, [activeCategory, playlist]);

  // 📀 按专辑分组陈列：曲库本就按专辑顺序排列，相邻同专辑聚为一组
  const albumGroups = useMemo(() => {
    const groups: { key: string; name: string; year: string; tracks: Track[] }[] = [];
    filteredPlaylist.forEach(track => {
      const info = albumOf(track.url);
      const last = groups[groups.length - 1];
      if (last && last.key === info.key) last.tracks.push(track);
      else groups.push({ ...info, tracks: [track] });
    });
    return groups;
  }, [filteredPlaylist]);

  // ⌨️ 键盘快捷键：空格 播放/暂停、← → 切歌（聚焦输入框时不拦截）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); playNext(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); playPrev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, playNext, playPrev]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { 'All Tracks': playlist.length };
    playlist.forEach(t => { counts[t.category] = (counts[t.category] || 0) + 1; });
    return counts;
  }, [playlist]);

  return (
    <motion.div
      className="relative w-full max-w-[1680px] mx-auto h-full max-h-full overflow-y-auto no-scrollbar lg:overflow-visible lg:h-screen lg:max-h-screen flex flex-col z-10 pt-12 pb-28 lg:pb-28 px-6 md:px-14 lg:pl-16 lg:pr-32 xl:pl-20 xl:pr-44"
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 text-slate-400/30 font-mono text-[10px] tracking-[0.5em] uppercase whitespace-nowrap">
        Resonance Chamber
      </div>

      {/* ✨ 核心排版：左侧唱机（7/12，主角）/ 右侧选碟台（5/12），整屏锁定、底部留 Dock 安全区 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-y-14 lg:gap-x-20 xl:gap-x-28 w-full mt-8 lg:flex-1 lg:min-h-0 items-stretch">

        {/* ================= 左侧 (7/12)：拟真转盘唱机（主角） ================= */}
        <div className="col-span-1 lg:col-span-7 flex flex-col items-center justify-center relative h-full min-h-0">

          {/* 超大环境光晕：随声波能量呼吸。blur-[100px] 超大模糊层对手机 GPU 过重，仅桌面栏式布局启用 */}
          {isDesktop && <AmbientGlow color={currentTrack.color} isPlaying={isPlaying} active={active} />}

          {/* 🎛️ 唱机基座 Plinth：玻璃木纹台面，承载转盘与唱臂 */}
          <div className="relative w-full max-w-[420px] lg:max-w-[480px] xl:max-w-[520px] aspect-[10/8.8] rounded-[2.5rem] bg-white/45 dark:bg-white/[0.04] border border-white/60 dark:border-white/10 backdrop-blur-xl shadow-[0_36px_90px_rgba(0,0,0,0.14)] dark:shadow-[0_36px_90px_rgba(0,0,0,0.6)] transition-colors duration-[1500ms]">

            {/* 台面微光拉丝 */}
            <div className="absolute inset-0 rounded-[2.5rem] bg-gradient-to-br from-white/35 via-transparent to-white/5 dark:from-white/[0.07] dark:to-transparent pointer-events-none" />
            {/* 台面顶缘高光，增强玻璃质感 */}
            <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/70 dark:via-white/20 to-transparent pointer-events-none" />

            {/* 💿 转盘 + 黑胶：偏左放置，给唱臂留出呼吸位 */}
            <div
              className="absolute left-[6%] top-1/2 -translate-y-1/2 w-[71%] aspect-square cursor-pointer group"
              onClick={togglePlay} role="button" aria-label={isPlaying ? '暂停' : '播放'}
            >
              {/* 💿 唱片光晕：随音乐律动，暂停丝滑淡出、重播丝滑淡入 */}
              <DiscHalo color={currentTrack.color} isPlaying={isPlaying} active={active} />
              {/* 🎛️ 拉丝金属转盘（platter）：黑胶坐落其上，带柔和径向高光与内阴影，质感更真实 */}
              <div className="absolute -inset-[4.5%] rounded-full bg-gradient-to-br from-slate-200/70 via-slate-300/45 to-slate-400/40 dark:from-white/[0.07] dark:via-black/30 dark:to-black/50 shadow-[inset_0_2px_10px_rgba(0,0,0,0.18)] border border-white/50 dark:border-white/[0.06] transition-colors duration-[1500ms]" />
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
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[4.5%] h-[4.5%] bg-[#FAF8F3] dark:bg-[#0A0F1D] rounded-full shadow-[inset_0_2px_5px_rgba(0,0,0,0.5)] z-20" />
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
          <div className="w-full max-w-[420px] lg:max-w-[480px] xl:max-w-[520px] mt-10 lg:mt-12 relative z-20 flex flex-col gap-6">

            {/* 进度条 */}
            <div className="flex items-center gap-4 px-2">
              <span className="font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400 w-9 text-right transition-colors duration-[1500ms]">
                {formatTime(currentTime)}
              </span>
              <div className="relative flex-1 group/seek h-6 md:h-4 flex items-center">
                <div className="absolute inset-x-0 h-[4px] md:h-[3px] group-hover/seek:h-[5px] rounded-full bg-slate-300/50 dark:bg-white/10 overflow-hidden transition-all duration-300">
                  <div className="h-full rounded-full transition-colors duration-[1500ms] relative" style={{ width: `${progress}%`, backgroundColor: currentTrack.color, boxShadow: `0 0 10px ${currentTrack.color}90` }}>
                    {/* 进度末端流动微光，增强律动感 */}
                    <span className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-full bg-gradient-to-r from-transparent to-white/40 mix-blend-overlay" />
                  </div>
                </div>
                <div
                  className="absolute w-3 h-3 rounded-full bg-white dark:bg-slate-100 shadow-md -translate-x-1/2 opacity-100 md:opacity-0 group-hover/seek:opacity-100 transition-opacity pointer-events-none ring-2"
                  style={{ left: `${progress}%`, ['--tw-ring-color' as string]: currentTrack.color }}
                />
                <input
                  type="range" min={0} max={duration || 0} step={0.1} value={currentTime}
                  onChange={(e) => seek(Number(e.target.value))}
                  aria-label="播放进度"
                  className="absolute inset-x-0 w-full h-6 md:h-4 appearance-none bg-transparent cursor-pointer opacity-0"
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

            {/* 🔊 音量：点击图标静音/恢复，细滑轨染当前情绪色 */}
            <div className="flex items-center gap-3.5 px-4">
              <button
                onClick={() => changeVolume(volume > 0 ? 0 : 0.5)}
                aria-label={volume > 0 ? '静音' : '取消静音'}
                className="shrink-0 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors outline-none"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
                  {volume <= 0.001 ? (
                    <path d="M23 9l-6 6M17 9l6 6" />
                  ) : (
                    <>
                      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                      {volume > 0.55 && <path d="M18.5 5.5a9 9 0 0 1 0 13" />}
                    </>
                  )}
                </svg>
              </button>
              <div className="relative flex-1 group/vol h-6 md:h-4 flex items-center">
                <div className="absolute inset-x-0 h-[4px] md:h-[3px] group-hover/vol:h-[5px] rounded-full bg-slate-300/50 dark:bg-white/10 overflow-hidden transition-all duration-300">
                  <div className="h-full rounded-full transition-colors duration-[1500ms]" style={{ width: `${volume * 100}%`, backgroundColor: currentTrack.color }} />
                </div>
                <div
                  className="absolute w-3 h-3 rounded-full bg-white dark:bg-slate-100 shadow-md -translate-x-1/2 opacity-100 md:opacity-0 group-hover/vol:opacity-100 transition-opacity pointer-events-none ring-2"
                  style={{ left: `${volume * 100}%`, ['--tw-ring-color' as string]: currentTrack.color }}
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

        {/* ================= 右侧 (5/12)：曲目信息（居中） + 选碟台 ================= */}
        <div className="col-span-1 lg:col-span-5 flex flex-col items-center text-center w-full h-full min-h-0 relative z-20">

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

            <LiveSpectrum color={currentTrack.color} isPlaying={isPlaying} bars={72} active={active} />

            <AnimatePresence mode="wait">
              <motion.div key={currentTrack.id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} className="flex flex-col items-center w-full mt-4">

                <ReactiveTitle title={currentTrack.title} color={currentTrack.color} isPlaying={isPlaying} active={active} />

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
          <div className="flex flex-wrap justify-center gap-x-5 md:gap-x-8 gap-y-2 mt-9 mb-7 w-full max-w-[540px] border-b border-slate-200/50 dark:border-white/5 pb-4">
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

          {/* 💿 选碟台 The Crate：一台拟真选碟箱，碟片在其中陈列，点选即「换碟上盘」 */}
          <div className="w-full max-w-[520px] mx-auto flex flex-col h-[52vh] lg:h-auto lg:flex-1 lg:min-h-0 overflow-hidden">

            {/* 🏷️ 极简标签行：身份标识 + 碟数，去卡片化——直接坐落背景上，仅留一道渐变细线收束 */}
            <div className="shrink-0 flex items-center justify-between px-1 pb-3 mb-1 border-b border-transparent [border-image:linear-gradient(to_right,transparent,rgba(148,163,184,0.25),transparent)_1] dark:[border-image:linear-gradient(to_right,transparent,rgba(255,255,255,0.12),transparent)_1]">
              <div className="flex items-center gap-2.5">
                <motion.span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: currentTrack.color }}
                  animate={{ opacity: isPlaying ? [1, 0.4, 1] : 0.5 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
                <span className="font-mono text-[9px] tracking-[0.32em] uppercase text-slate-500 dark:text-slate-400">The Crate · 选碟台</span>
              </div>
              <span className="font-mono text-[9px] tracking-[0.2em] text-slate-400/70 dark:text-slate-600 tabular-nums">{filteredPlaylist.length} 首</span>
            </div>

            {/* 碟槽区：用 mask 让内容上下淡出成透明，无论背景或光晕都自然融入（不再有色带） */}
            <div className="relative flex-1 min-h-0">
              <div
                className="absolute inset-0 overflow-y-auto pb-10 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                style={{
                  maskImage: 'linear-gradient(to bottom, transparent 0, #000 28px, #000 calc(100% - 56px), transparent 100%)',
                  WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 28px, #000 calc(100% - 56px), transparent 100%)',
                }}
              >
                {/* 🎼 按专辑分组的曲目索引：每张专辑一道极淡标头，翻阅如在碟箱中一张张翻碟 */}
                {albumGroups.map(group => (
                  <section key={group.key}>
                    {/* 专辑分组标头：情绪色点 · 专辑名 · 年份 · 碟数 */}
                    <div className="flex items-center gap-2.5 px-5 pt-6 pb-2 first:pt-3 select-none">
                      <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: group.tracks[0].color }} />
                      <span className="font-serif text-[13px] text-slate-500 dark:text-slate-400 truncate">{group.name}</span>
                      {group.year && <span className="font-mono text-[8px] tracking-[0.2em] text-slate-300 dark:text-slate-600 shrink-0">{group.year}</span>}
                      <span className="h-px flex-1 bg-gradient-to-r from-slate-200/70 dark:from-white/10 to-transparent" />
                      <span className="font-mono text-[8px] text-slate-300 dark:text-slate-600 tabular-nums shrink-0">{group.tracks.length}</span>
                    </div>

                    {group.tracks.map((track, i) => {
                      const isActive = currentTrack.id === track.id;
                      return (
                        <button
                          key={track.id} onClick={() => switchTrack(track)}
                          className="group relative w-full flex items-center gap-4 pl-5 pr-5 py-[11px] text-left outline-none hover:bg-slate-900/[0.025] dark:hover:bg-white/[0.025] transition-colors duration-300"
                          style={isActive ? { background: `linear-gradient(90deg, ${track.color}1f, ${track.color}08 35%, transparent 75%)` } : undefined}
                        >
                          {/* 左缘情绪色细标 */}
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] rounded-full transition-all duration-500" style={{ height: isActive ? '62%' : '0%', backgroundColor: track.color, boxShadow: isActive ? `0 0 8px ${track.color}` : 'none' }} />

                          {/* 序号槽：碟内曲序 → 悬停播放标 → 在播均衡器 */}
                          <span className="relative w-5 shrink-0 flex items-center justify-center self-start mt-1">
                            {isActive ? (
                              isPlaying ? (
                                <span className="flex items-end gap-[2px] h-3">
                                  {[0, 0.2, 0.4].map((d, k) => (
                                    <motion.span key={k} className="w-[2px] rounded-full" style={{ backgroundColor: track.color }} animate={{ height: ['28%', '100%', '28%'] }} transition={{ duration: 0.7, repeat: Infinity, delay: d, ease: 'easeInOut' }} />
                                  ))}
                                </span>
                              ) : (
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: track.color, boxShadow: `0 0 6px ${track.color}` }} />
                              )
                            ) : (
                              <>
                                <span className="font-mono text-[10px] tabular-nums text-slate-400/55 dark:text-slate-600 group-hover:opacity-0 transition-opacity duration-200 select-none">{String(i + 1).padStart(2, '0')}</span>
                                <svg viewBox="0 0 24 24" fill="currentColor" className="absolute w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-slate-500 dark:text-slate-300"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                              </>
                            )}
                          </span>

                          {/* 标题 + 艺术家 */}
                          <span className="flex-1 min-w-0 flex flex-col">
                            <span className={`font-serif text-[15px] md:text-base leading-snug tracking-wide truncate transition-colors duration-300 ${isActive ? 'text-slate-900 dark:text-slate-50' : 'text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100'}`}>
                              {track.title}
                            </span>
                            <span className="font-mono text-[9px] tracking-[0.22em] uppercase mt-1 truncate text-slate-400/80 dark:text-slate-500">
                              {track.artist}
                            </span>
                          </span>

                          {/* 右栏：在播标识 */}
                          {isActive && (
                            <span className="shrink-0 self-start mt-1.5 font-mono text-[8px] tracking-[0.28em] uppercase whitespace-nowrap" style={{ color: track.color }}>On Deck</span>
                          )}
                        </button>
                      );
                    })}
                  </section>
                ))}

                {filteredPlaylist.length === 0 && (
                  <div className="pt-16 text-center font-serif italic text-slate-400 dark:text-slate-600 text-sm">碟箱里没有匹配的碟片…</div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </motion.div>
  );
};
