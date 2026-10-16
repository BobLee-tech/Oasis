// src/components/OasisResonance.tsx
//
// 🎧 共鸣（音乐页）。四条规矩，改之前必读（详见 docs/music-design.md §A2）：
//   1. 100ms 内给画面反馈：命令当帧改界面状态，音量淡入淡出在后台跟上（useSoundscape 的命令）。
//   2. 控件不随内容迁移：歌词/选碟切换条固定在右栏右上；曲目铭牌与内页条外框定高；在播标识在曲号槽里替换数字。
//      歌词近景时唱片退到舞台边缘是“镜头”而非控件迁移；走带在近景里“隐去”而不是“挪走”——
//      换成左下角一行（CloseUpTransport），闲置 2.5s 隐去、暂停常显（docs/music-stage-redesign-demo.html）。
//   3. 一个元素只归一套动画系统：不跨容器用 layoutId；被 ticker 每帧移动的容器里不放 framer layout 元素。
//      layoutId 只留给父容器静止的高亮块与下划线。
//   4. 最后一帧等于静止态：面板只做原位交叉淡化（opacity），尺寸变化一律预留。
// 进度、时间、唱臂、唱盘都由 ticker 直接写 DOM，播放中页面不因时间流逝重渲染。
// 进场是延续不是开场：音乐在你进来之前就在放，唱盘与唱臂按播放器快照落在原速、原位，不再每次“开机”。
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
import { useIdle } from '../hooks/useIdle';
import type { MusicCategory } from '../types/music';
import { useTicker } from '../lib/ticker';
import { MOTION } from '../lib/motion';
import { LyricPanel } from './resonance/LyricPanel';
import { StageGlow } from './resonance/StageGlow';
import { PlaybackBar } from './resonance/PlaybackBar';
import { CrateList, type AlbumGroup } from './resonance/CrateList';
import { TrackCaption } from './resonance/TrackCaption';
import { LinerNotes } from './resonance/LinerNotes';
import { LinerSlip } from './resonance/LinerSlip';
import { RippleReveal } from './resonance/RippleReveal';
import { ProgressArc } from './resonance/ProgressArc';
import { CloseUpTransport } from './resonance/CloseUpTransport';
import { VolumeIcon, VolumePopover } from './resonance/VolumePopover';
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

const AMBIENCE_KEY = 'oasis_resonance_ambience';

const initialAmbience = () => {
  if (typeof window === 'undefined') return true;
  try { return window.localStorage.getItem(AMBIENCE_KEY) !== 'off'; }
  catch { return true; }
};

// ✦ 首访提示：第一次来时贴纸荡两圈细环 + 一句话，之后不再出现
const HINT_KEY = 'oasis_notes_hint_seen';
const hintSeen = () => {
  try { return window.localStorage.getItem(HINT_KEY) === '1'; }
  catch { return true; }
};
const markHintSeen = () => {
  try { window.localStorage.setItem(HINT_KEY, '1'); }
  catch { /* 隐私模式下记不住，也只是多提示一次 */ }
};

const CATEGORIES: { id: MusicCategory; label: string }[] = [
  { id: 'All Tracks', label: '全部' },
  { id: 'Yorushika', label: 'ヨルシカ' },
  { id: 'Atarayo', label: 'Atarayo' },
  { id: 'Miku', label: 'Miku' }
];

// 📜 纸套底：情绪色从唱机一侧晕开；四边羽化进页面底色
const SLEEVE_FEATHER = 'linear-gradient(to right, transparent, #000 4rem, #000 calc(100% - 4rem), transparent)';
const SLEEVE_BACKDROP: React.CSSProperties = {
  backgroundImage:
    'radial-gradient(60% 70% at 22% 45%, color-mix(in srgb, var(--mood) 13%, transparent), transparent 70%),' +
    'radial-gradient(40% 50% at 96% 100%, color-mix(in srgb, var(--mood) 7%, transparent), transparent 70%)',
  maskImage: `${SLEEVE_FEATHER}, linear-gradient(to bottom, transparent, #000 2.5rem, #000 calc(100% - 2.5rem), transparent)`,
  WebkitMaskImage: `${SLEEVE_FEATHER}, linear-gradient(to bottom, transparent, #000 2.5rem, #000 calc(100% - 2.5rem), transparent)`,
  maskComposite: 'intersect',
  WebkitMaskComposite: 'source-in',
};

const MOBILE_SLEEVE_BACKDROP: React.CSSProperties = {
  backgroundImage: 'radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, var(--mood) 12%, transparent), transparent 70%)',
  maskImage: 'linear-gradient(to bottom, transparent, #000 0.75rem, #000 calc(100% - 1.5rem), transparent)',
  WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 0.75rem, #000 calc(100% - 1.5rem), transparent)',
};

// 🎥 歌词近景的镜头：唱片放大到 1.4 倍、横移到台面左缘外，只露出右半边；纵向让圆心与歌词水线同高
//    （一条视平线），但不越出舞台上下沿，并给左下角的走带留一条空带——放不下时先缩小唱片。
//    只动 transform / opacity；切回选碟时从当前值折返（规矩 4）。
const CLOSE_UP_SHIFT = '-84%';
const CLOSE_UP_SCALE = 1.4;
const CLOSE_UP_TRANSPORT_ROOM = 76;
const CAMERA = 'transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none';

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
  // 📜 内页：一直在水下，点贴纸或标题荡开涟漪才看见（RippleReveal）；切面板或切段时合上。
  //    原点记在 ref 里：收回时波回到开启时的那个点。
  const [notesOpen, setNotesOpen] = useState(false);
  const notesOrigin = useRef<HTMLElement | null>(null);
  const toggleNotes = (origin: HTMLElement) => {
    if (!notesOpen) {
      notesOrigin.current = origin;
      markHintSeen();
    }
    setNotesOpen(open => !open);
  };
  const notesOpenRef = useRef(notesOpen);
  useEffect(() => { notesOpenRef.current = notesOpen; }, [notesOpen]);
  // 🔗 两个入口互相指认：悬停内页条时贴纸亮虚线圈，悬停贴纸时内页条抬起
  const [peek, setPeek] = useState<'label' | 'slip' | null>(null);
  const closeNotes = useMemo(() => () => setNotesOpen(false), []);
  const stageRef = useRef<HTMLDivElement>(null);
  const plinthRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLButtonElement>(null);
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
        notesOrigin.current = labelRef.current;
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
  //    进场时按播放器快照起步：在放就已是原速（角度按播放时间推出来），不再每次从静止加速。
  const discRef = useRef<HTMLDivElement>(null);
  const [spinStart] = useState(() => ({
    angle: (getPlaybackTime() * 20) % 360,
    vel: getPlayerSnapshot().isPlaying && initialAmbience() && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 20 : 0,
  }));
  const spin = useRef(spinStart);                    // 当前角度(deg) 与角速度(deg/s)
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
  //    同样从快照起步：在放就直接落在进度位置，抬落的弹簧只留给你按下播放 / 暂停的那一下。
  const armRef = useRef<HTMLDivElement>(null);
  const [armStart] = useState(() => {
    const { isPlaying: playing, duration } = getPlayerSnapshot();
    const ratio = duration > 0 ? Math.min(1, getPlaybackTime() / duration) : 0;
    return playing ? ARM_START + ratio * ARM_SWEEP : ARM_REST;
  });
  const arm = useRef({ angle: armStart, vel: 0, written: Number.NaN });
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
      else if (e.code === 'KeyI' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // I：翻开 / 合上内页，涟漪从贴纸起
        e.preventDefault();
        if (!notesOpenRef.current) {
          notesOrigin.current = labelRef.current;
          markHintSeen();
        }
        setNotesOpen(open => !open);
      }
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
  // 🎥 歌词近景：镜头推近，唱片退到舞台边缘成背景，歌词站到中央（docs/music-lyrics-stage-demo.html）
  const closeUp = desktopPanel === 'lyrics';
  const toggleMute = () => changeVolume(volume > 0 ? 0 : 0.5);

  // 🎥 近景镜头的纵向位置与缩放：量歌词水线、台面中心与舞台边界（布局量，不受 transform 影响）
  const [camera, setCamera] = useState({ y: 0, scale: CLOSE_UP_SCALE });
  useEffect(() => {
    if (!isDesktop || !closeUp) return;
    const measure = () => {
      const stage = stageRef.current, plinth = plinthRef.current, deck = deckRef.current;
      if (!stage || !plinth || !deck) return;
      const box = stage.getBoundingClientRect();
      const plinthBox = plinth.getBoundingClientRect();
      const radius = deck.offsetHeight / 2;
      if (!radius) return;
      const field = stage.querySelector<HTMLElement>('.lyric-field')?.getBoundingClientRect();
      const water = field && field.height > 0 ? field.top + field.height / 2 : box.top + box.height / 2;
      const scale = Math.min(CLOSE_UP_SCALE, (box.height - CLOSE_UP_TRANSPORT_ROOM) / (2 * radius));
      const reach = radius * scale;
      const low = box.top + reach;
      const high = box.bottom - CLOSE_UP_TRANSPORT_ROOM - reach;
      const center = low <= high ? Math.min(high, Math.max(low, water)) : (low + high) / 2;
      const next = { y: Math.round(center - (plinthBox.top + plinthBox.height / 2)), scale: Math.round(scale * 1000) / 1000 };
      setCamera(prev => (prev.y === next.y && prev.scale === next.scale ? prev : next));
    };
    const frame = window.requestAnimationFrame(measure);
    // 歌词面板交叉淡入、档案与歌词到位后再量一次
    const later = window.setTimeout(measure, 400);
    const observer = new ResizeObserver(measure);
    if (stageRef.current) observer.observe(stageRef.current);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(later);
      observer.disconnect();
    };
  }, [isDesktop, closeUp, currentTrack.id]);
  const closeUpTransform = `translateX(${CLOSE_UP_SHIFT}) translateY(${camera.y}px) scale(${camera.scale})`;

  // 😴 近景里正在放、内页没开时，闲置 2.5s 让走带隐去、切换条退到 38%；暂停时常显
  const idle = useIdle(isDesktop && closeUp && isPlaying && active && !notesOpen);

  // ✦ 首访：在选碟台落定 1.2s 后提示一次，3.4s 后收起
  const [hint, setHint] = useState(false);
  useEffect(() => {
    if (!isDesktop || !active || closeUp || notesOpen || hintSeen()) return;
    const show = window.setTimeout(() => { markHintSeen(); setHint(true); }, 1_200);
    return () => window.clearTimeout(show);
  }, [isDesktop, active, closeUp, notesOpen]);
  useEffect(() => {
    if (!hint) return;
    const hide = window.setTimeout(() => setHint(false), 3_400);
    return () => window.clearTimeout(hide);
  }, [hint]);

  // 分类栏：选中只改颜色与下划线，不改字重——字重会改变按钮宽度，带着整排分类横跳。
  const categoryBar = (mobile: boolean) => CATEGORIES.map(cat => (
    <button
      key={cat.id}
      type="button"
      onClick={() => setActiveCategory(cat.id)}
      aria-pressed={activeCategory === cat.id}
      lang="ja"
      className={`relative flex items-baseline gap-1 font-[family-name:var(--font-zh)] text-[12.5px] tracking-[0.06em] whitespace-nowrap transition-colors duration-200 outline-none pb-2.5 shrink-0 ${
        activeCategory === cat.id ? 'text-slate-800 dark:text-slate-100' : `text-slate-500 dark:text-slate-500 ${mobile ? '' : 'hover:text-slate-700 dark:hover:text-slate-300'}`
      }`}
    >
      {cat.label}
      <sup className={`font-mono text-[8.5px] tracking-normal transition-opacity duration-200 ${activeCategory === cat.id ? 'opacity-70' : 'opacity-40'}`}>{categoryCounts[cat.id] ?? 0}</sup>
      {activeCategory === cat.id && (
        <motion.div
          layoutId={mobile ? 'activeCategoryMobile' : 'activeCategory'}
          className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
          style={{ backgroundColor: 'var(--mood)' }}
          transition={MOTION.settle}
        />
      )}
    </button>
  ));

  // 🏷️ 贴纸 = 内页入口（盘面声槽仍是播放/暂停）。按钮不放进旋转的唱片里，免得提示字跟着转。
  const notesLabel = (compact: boolean) => (
    <button
      ref={labelRef}
      type="button"
      onClick={event => { event.stopPropagation(); toggleNotes(event.currentTarget); }}
      onPointerEnter={() => setPeek('label')}
      onPointerLeave={() => setPeek(null)}
      aria-label={notesOpen ? '合上内页' : `翻开「${currentTrack.title}」的内页`}
      aria-expanded={notesOpen}
      className="notes-label group/label absolute inset-[31%] z-30 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mood)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
    >
      {!compact && (
        <>
          <span
            aria-hidden
            className={`absolute -inset-[9%] rounded-full border border-dashed transition-opacity duration-200 group-hover/label:opacity-70 ${peek === 'slip' || hint ? 'opacity-70' : 'opacity-0'}`}
            style={{ borderColor: 'color-mix(in srgb, var(--mood) 70%, white)' }}
          />
          {hint && (
            <>
              <span aria-hidden className="notes-hint-ring pointer-events-none absolute inset-0 rounded-full border-[1.5px]" style={{ borderColor: 'var(--mood)' }} />
              <span aria-hidden className="notes-hint-ring pointer-events-none absolute inset-0 rounded-full border-[1.5px] [animation-delay:320ms]" style={{ borderColor: 'var(--mood)' }} />
            </>
          )}
          <span
            aria-hidden
            className={`pointer-events-none absolute left-1/2 top-full mt-4 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-900/70 px-2.5 py-1 font-[family-name:var(--font-zh)] text-[11px] tracking-[0.16em] text-white opacity-0 transition-opacity duration-200 ${hint ? '' : 'group-hover/label:opacity-100'}`}
          >
            {notesOpen ? '合上内页' : '翻开内页'}
          </span>
          <span
            role="status"
            className={`pointer-events-none absolute left-1/2 top-full mt-4 -translate-x-1/2 whitespace-nowrap rounded-xl border border-slate-200/70 bg-white/92 px-3.5 py-2 font-[family-name:var(--font-zh)] text-[13px] text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.18)] backdrop-blur-xl transition-opacity duration-300 dark:border-white/10 dark:bg-[#111728]/94 dark:text-slate-100 ${hint ? 'opacity-100' : 'opacity-0'}`}
          >
            {hint && <>贴纸也能翻开内页<span className="ml-2 font-mono text-[10px] tracking-[0.12em] text-slate-400 dark:text-slate-500">只提示这一次</span></>}
          </span>
        </>
      )}
    </button>
  );

  const crateMask = (top: number, bottom: number) => ({
    maskImage: `linear-gradient(to bottom, transparent 0, #000 ${top}px, #000 calc(100% - ${bottom}px), transparent 100%)`,
    WebkitMaskImage: `linear-gradient(to bottom, transparent 0, #000 ${top}px, #000 calc(100% - ${bottom}px), transparent 100%)`,
  });

  // ================= 📱 移动端：分段版式（唱片 ↔ 歌词 ↔ 歌单），只呈现当前段，减负增美 =================
  if (!isDesktop) {
    return (
      <div
        className="oasis-mood oasis-bottom-scroll-safe relative w-full h-full flex flex-col z-10 overflow-hidden pt-[max(4.75rem,calc(env(safe-area-inset-top)+3.25rem))] pb-[var(--oasis-bottom-safe-space)] px-5"
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
                    {notesLabel(true)}
                  </div>

                  {/* 正在共鸣：歌名 → 艺术家 → 内页条 */}
                  <div className="w-full flex flex-col items-center text-center px-2 min-h-0">
                    <div className="w-full mt-4"><TrackCaption track={currentTrack} isPlaying={isPlaying} onOpenNotes={toggleNotes} /></div>
                    <div className="w-full max-w-[340px] mt-1"><LinerSlip track={currentTrack} onOpen={toggleNotes} compact /></div>
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
                    onOpenNotes={toggleNotes}
                    ambient={motionEnabled}
                  />
                </div>
              ) : (
                /* ——— 歌单段：分类 + 碟箱列表，占满整段高度 ——— */
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="shrink-0 flex gap-x-6 overflow-x-auto no-scrollbar mb-1 border-b border-slate-200/50 dark:border-white/5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
          <RippleReveal
            open={notesOpen}
            originRef={notesOrigin}
            color={currentTrack.color}
            plain={!motionEnabled}
            onClose={closeNotes}
            className="absolute inset-0 z-30"
            fxClassName="absolute inset-0 z-[31] h-full w-full"
          >
            <div aria-hidden className="pointer-events-none absolute -inset-x-5 -inset-y-3 bg-[#FAF8F3] dark:bg-[#0A0F1D]" style={MOBILE_SLEEVE_BACKDROP} />
            <div className="absolute inset-0 overflow-y-auto overscroll-contain px-1 pb-8 pt-1 no-scrollbar">
              <LinerNotes track={currentTrack} onClose={closeNotes} isOwner={isOwner} compact />
            </div>
          </RippleReveal>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="oasis-mood oasis-bottom-scroll-safe relative w-full max-w-[1680px] mx-auto h-full max-h-full overflow-y-auto no-scrollbar lg:overflow-visible lg:h-screen lg:max-h-screen flex flex-col z-10 pt-12 px-6 md:px-14 lg:pl-16 lg:pr-32 xl:pl-20 xl:pr-44"
      style={moodStyle}
    >
      {/* ✨ 两列都允许收缩，间距来自容器而非十二列网格中的空轨。 */}
      <div ref={stageRef} className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] gap-y-14 lg:gap-x-[clamp(2.5rem,5vw,6rem)] w-full mt-8 lg:flex-1 lg:min-h-0 items-stretch">

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
        <div className="min-w-0 flex flex-col items-center justify-center relative z-30 h-full min-h-0">

          {/* 🎛️ 唱机基座 Plinth：玻璃木纹台面，承载转盘与唱臂。
              台面是单独一层：歌词近景时它淡出，唱片留下来退到舞台边缘。 */}
          <div ref={plinthRef} className="relative w-full max-w-[420px] lg:max-w-[480px] xl:max-w-[520px] aspect-[10/8.8]">
            <div
              aria-hidden
              className={`absolute inset-0 rounded-[2.5rem] bg-white/45 dark:bg-white/[0.04] border border-white/60 dark:border-white/10 backdrop-blur-xl shadow-[0_36px_90px_rgba(0,0,0,0.14)] dark:shadow-[0_36px_90px_rgba(0,0,0,0.6)] pointer-events-none ${CAMERA} ${closeUp ? 'opacity-0 scale-[0.96]' : ''}`}
            >
              {/* 台面微光拉丝 */}
              <div className="absolute inset-0 rounded-[2.5rem] bg-gradient-to-br from-white/35 via-transparent to-white/5 dark:from-white/[0.07] dark:to-transparent" />
              {/* 台面顶缘高光，增强玻璃质感 */}
              <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/70 dark:via-white/20 to-transparent" />
            </div>

            {/* 💿 转盘 + 黑胶：偏左放置，给唱臂留出呼吸位 */}
            <div
              ref={deckRef}
              className={`absolute left-[6%] top-1/2 -translate-y-1/2 w-[71%] aspect-square cursor-pointer group ${CAMERA}`}
              style={{ transform: closeUp ? closeUpTransform : 'none' }}
              onClick={togglePlay} role="button" aria-label={isPlaying ? '暂停' : '播放'}
            >
              {/* 🎛️ 拉丝金属转盘（platter）：黑胶坐落其上，带柔和径向高光与内阴影，质感更真实 */}
              <div className={`absolute -inset-[4.5%] rounded-full bg-gradient-to-br from-slate-200/70 via-slate-300/45 to-slate-400/40 dark:from-white/[0.07] dark:via-black/30 dark:to-black/50 shadow-[inset_0_2px_10px_rgba(0,0,0,0.18)] border border-white/50 dark:border-white/[0.06] ${CAMERA} ${closeUp ? 'opacity-0' : ''}`} />
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

              {/* ⭕ 近景进度：画在露出来的右半圈边上 */}
              <ProgressArc
                active={active && closeUp}
                className={`pointer-events-none absolute -left-[3.5%] -top-[3.5%] z-10 h-[107%] w-[107%] transition-opacity duration-500 ${closeUp ? 'opacity-100' : 'opacity-0'}`}
              />

              {/* 悬停播放/暂停提示：只罩声槽（中间挖空给贴纸），悬停贴纸时让位给「内页」 */}
              <div
                className="absolute inset-0 rounded-full flex items-start justify-center pt-[9%] bg-black/0 group-hover:bg-black/25 opacity-0 group-hover:opacity-100 group-has-[.notes-label:hover]:opacity-0 transition-all duration-500 z-30 pointer-events-none"
                style={{ maskImage: 'radial-gradient(circle, transparent 19.5%, #000 20.5%)', WebkitMaskImage: 'radial-gradient(circle, transparent 19.5%, #000 20.5%)' }}
              >
                <span className="text-white/90 drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] scale-[1.5]">
                  {isPlaying ? Icons.pause : Icons.play}
                </span>
              </div>
              {notesLabel(false)}
            </div>

            {/* 🦾 唱臂 Tonearm：随播放状态落针/抬臂，并随进度缓缓内移（ticker 驱动） */}
            <div className={`absolute right-[9%] top-[13%] h-[62%] z-30 pointer-events-none ${CAMERA} ${closeUp ? 'opacity-0' : ''}`}>
              {/* 轴座 */}
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-[15%] min-w-9 aspect-square rounded-full bg-gradient-to-br from-slate-100 to-slate-300 dark:from-slate-600 dark:to-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.25)] border border-white/60 dark:border-white/10 z-20" />
              <div ref={armRef} className="relative h-full w-2 origin-top will-change-transform" style={{ transform: `rotate(${armStart}deg)` }}>
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
            <div className={`absolute right-[7%] bottom-[7%] flex items-center gap-2.5 ${CAMERA} ${closeUp ? 'opacity-0' : ''}`}>
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

          {/* ✨ 走带：进度 + 一行传送键，收束于唱机正下方。播放模式与音量是低频控件，退到两端、音量悬停才弹出。
              近景时整块隐去（不挪走），换成左下角那一行。 */}
          <div
            inert={closeUp}
            aria-hidden={closeUp}
            className={`w-full max-w-[420px] lg:max-w-[480px] xl:max-w-[520px] mt-10 lg:mt-12 relative z-20 flex flex-col gap-5 transition-opacity duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${closeUp ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
          >
            <PlaybackBar active={active && !closeUp} />

            <div className="flex items-center justify-between px-2">
              <button type="button" onClick={togglePlayMode} title={modeDisplay.text} aria-label={modeDisplay.text} className="flex items-center justify-center w-10 h-10 rounded-full text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mood)] shrink-0">
                {modeDisplay.icon}
              </button>
              <div className="flex items-center gap-7">
                <button type="button" onClick={playPrev} aria-label="上一首" className="flex items-center justify-center w-10 h-10 rounded-full text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:scale-110 transition-[color,transform] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mood)] shrink-0">
                  {Icons.prev}
                </button>
                <button
                  type="button"
                  onClick={togglePlay} aria-label={isPlaying ? '暂停' : '播放'}
                  className="w-14 h-14 rounded-full flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white/70 border border-white/20 shrink-0"
                  style={{ backgroundColor: 'var(--mood)', boxShadow: '0 8px 25px color-mix(in srgb, var(--mood) 31%, transparent)' }}
                >
                  {isPlaying ? Icons.pause : Icons.play}
                </button>
                <button type="button" onClick={playNext} aria-label="下一首" className="flex items-center justify-center w-10 h-10 rounded-full text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:scale-110 transition-[color,transform] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mood)] shrink-0">
                  {Icons.next}
                </button>
              </div>
              <VolumePopover />
            </div>
          </div>
        </div>

        {/* 🎛 近景走带：左下角一行，在唱片下沿与舞台底之间留出的空带里（镜头量好了这条带） */}
        <div className="absolute bottom-0 left-0 z-40">
          <CloseUpTransport visible={closeUp && !idle} active={active && closeUp} />
        </div>

        {/* 📜 内页：与网格同框、整张纸套；背景向外多铺一圈并羽化，免得露出硬边 */}
        <RippleReveal
          open={notesOpen}
          originRef={notesOrigin}
          color={currentTrack.color}
          plain={!motionEnabled}
          onClose={closeNotes}
          scopeRef={stageRef}
          className="absolute inset-0 z-[25] hidden lg:block"
          fxClassName="absolute inset-0 z-[26] hidden h-full w-full lg:block"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-16 -inset-y-10 bg-[#FAF8F3] dark:bg-[#0A0F1D]"
            style={SLEEVE_BACKDROP}
          />
          {/* 点纸套的空白处也能合上（点在字上不合，免得选字时误关） */}
          <div
            className="relative grid h-full grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] gap-x-[clamp(2.5rem,5vw,6rem)]"
            onClick={event => { if (event.target === event.currentTarget) closeNotes(); }}
          >
            <div aria-hidden onClick={closeNotes} />
            <div className="min-h-0 pt-14 pb-4">
              <LinerNotes track={currentTrack} onClose={closeNotes} isOwner={isOwner} />
            </div>
          </div>
        </RippleReveal>

        {/* ================= 右侧：切换条（固定） + 面板（原位交叉淡化） ================= */}
        <div className="min-w-0 flex flex-col w-full h-full min-h-0 relative">

          {/* 歌词 / 选碟：同一舞台的两种观看距离。固定在右栏右上，任何状态下都不移动（规矩 2）；
              动态氛围开关在它左边。近景闲置时整行退到 38%。 */}
          <div className="relative z-40 shrink-0 mb-6 flex items-center justify-end gap-2.5 transition-opacity duration-300" style={{ opacity: idle ? 0.38 : 1 }}>
          <button
            type="button"
            onClick={() => setAmbienceEnabled(value => !value)}
            aria-pressed={ambienceEnabled}
            aria-label={ambienceEnabled ? '关闭动态氛围' : '开启动态氛围'}
            title={ambienceEnabled ? '关闭动态氛围' : '开启动态氛围'}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--mood)] ${
              ambienceEnabled
                ? 'border-white/55 bg-white/40 text-slate-500 hover:text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.035] dark:text-slate-300 dark:hover:text-slate-100'
                : 'border-slate-200/60 text-slate-300 hover:text-slate-500 dark:border-white/[0.06] dark:text-slate-600 dark:hover:text-slate-400'
            }`}
          >
            {Icons.ambience}
          </button>
          <div className="inline-flex p-1 rounded-full bg-white/40 dark:bg-white/[0.035] border border-white/55 dark:border-white/[0.08] shadow-sm">
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
          </div>

          <div className="relative isolate w-full flex-1 min-h-0">
            <AnimatePresence initial={false}>
              {desktopPanel === 'lyrics' ? (
                <motion.div
                  key="lyrics"
                  className="absolute inset-y-0 right-0 -left-[clamp(2rem,7vw,7.5rem)] flex justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={MOTION.swap}
                >
                  <div className="w-full max-w-[680px] h-full" data-ripple-push>
                    <LyricPanel
                      track={currentTrack}
                      color={currentTrack.color}
                      isPlaying={isPlaying}
                      active={active}
                      onOpenNotes={toggleNotes}
                      ambient={motionEnabled}
                    />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="crate"
                  className="absolute inset-0 flex flex-col items-start"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={MOTION.swap}
                >
                  {/* 曲目铭牌 + 内页条：右栏一条左对齐的轴；两者都定高（规矩 2） */}
                  <div className="shrink-0 w-full max-w-[520px]" data-ripple-push>
                    <TrackCaption track={currentTrack} isPlaying={isPlaying} desk onOpenNotes={toggleNotes} />
                    <div className="mt-5">
                      <LinerSlip
                        track={currentTrack}
                        onOpen={toggleNotes}
                        lifted={peek === 'label'}
                        hinting={hint}
                        onHover={hovering => setPeek(hovering ? 'slip' : null)}
                      />
                    </div>
                  </div>

                  {/* 💿 选碟台 The Crate：表头即分类（中文名 + 数量），点选即「换碟上盘」 */}
                  <div className="w-full max-w-[520px] mt-7 [@media(min-height:900px)]:mt-9 flex flex-col flex-1 min-h-0 overflow-hidden" data-ripple-push>
                    <div className="shrink-0 flex items-end gap-x-5 border-b border-slate-200/60 dark:border-white/[0.07]">
                      <span className="shrink-0 pb-2.5 font-[family-name:var(--font-zh)] text-[13px] font-semibold tracking-[0.16em] text-slate-700 dark:text-slate-200">选碟台</span>
                      <div className="flex min-w-0 flex-1 items-end gap-x-3.5 overflow-x-auto no-scrollbar [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {categoryBar(false)}
                      </div>
                      <span className="hidden xl:inline shrink-0 pb-2.5 font-mono text-[10px] tracking-[0.12em] text-slate-400 dark:text-slate-500 tabular-nums">{filteredPlaylist.length} 首</span>
                    </div>

                    {/* 碟槽区：用 mask 让内容上下淡出成透明，无论背景或光晕都自然融入 */}
                    <div className="relative flex-1 min-h-0 mt-1">
                      <div
                        className="absolute inset-0 overflow-y-auto pb-10 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        style={crateMask(20, 56)}
                      >
                        <CrateList groups={albumGroups} currentTrackId={currentTrack.id} isPlaying={isPlaying} live={motionEnabled} />
                        {filteredPlaylist.length === 0 && (
                          <div className="pt-16 text-center font-serif italic text-slate-400 dark:text-slate-600 text-sm">碟箱里没有匹配的碟片…</div>
                        )}
                      </div>
                    </div>
                  </div>
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
