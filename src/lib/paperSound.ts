// 📜 纸声：纸类场所（尺牍拆信、工坊翻册页、园图展卷）共用的一点纸响。默认关，⌘K 里开。
//   不用音频文件：WebAudio 现合成——纸响就是带通噪声加一串随机的细碎脆响（找过，没有确认 CC0 的拆信声）。
//   规矩：放歌时让位（压到四成）；没开过的人一个 AudioContext 都不建；浏览器没被点过之前出不了声，就安静地跳过。
import { getPlayerSnapshot } from '../hooks/useSoundscape';

const KEY = 'oasis_paper_sound';
export type PaperCue = 'flap' | 'slide' | 'unfold' | 'tuck' | 'leaf' | 'unroll' | 'roll' | 'stamp';

let on = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
let ac: AudioContext | null = null, noise: AudioBuffer | null = null, out: GainNode | null = null;

const init = () => {
  if (ac) { void ac.resume().catch(() => {}); return; }
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  ac = new Ctx();
  out = ac.createGain(); out.gain.value = 0.55;
  const comp = ac.createDynamicsCompressor();
  out.connect(comp).connect(ac.destination);
  noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
};
// 开着纸声又是新开的页面：第一下点击才能让浏览器出声
if (on && typeof window !== 'undefined') window.addEventListener('pointerdown', () => { if (on) init(); }, { once: true, capture: true });

export const paperSoundOn = () => on;
export const setPaperSound = (v: boolean) => {
  on = v;
  try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* 隐私模式存不下也无妨：这一趟有效 */ }
  if (v) { init(); playPaper('leaf'); }   // 开的那一下就响一声，知道开了
};

/** 一段带通噪声：频率从 f0 滑到 f1，起 20 ms、落到 dur */
const burst = (t0: number, dur: number, f0: number, f1: number, q: number, g: number, type: BiquadFilterType = 'bandpass') => {
  if (!ac || !noise || !out) return;
  const src = ac.createBufferSource(); src.buffer = noise;
  const bp = ac.createBiquadFilter(); bp.type = type; bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t0); bp.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const gn = ac.createGain();
  gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(g, t0 + Math.min(0.02, dur * 0.25)); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(gn).connect(out);
  src.start(t0, Math.random() * 1.5, dur + 0.05);
};
/** 纸的细碎脆响：dur 里随机落 n 粒 */
const crackle = (t0: number, dur: number, n: number, g: number) => {
  for (let i = 0; i < n; i++) burst(t0 + Math.random() * dur, 0.006 + Math.random() * 0.03, 2400 + Math.random() * 4200, 1600 + Math.random() * 2400, 1.4, g * (0.35 + Math.random() * 0.65));
};
const CUES: Record<PaperCue, (t: number, d: number) => void> = {
  flap: (t) => { crackle(t, 0.24, 7, 0.09); burst(t, 0.2, 2000, 900, 0.7, 0.025); },                 // 拆封：封舌被纸的硬挺拖住一下再翻
  slide: (t, d) => { burst(t, d, 1100, 3400, 0.55, 0.045); crackle(t + 0.05, d, 3, 0.03); },          // 抽出：一段摩擦
  unfold: (t) => { crackle(t, 0.4, 12, 0.1); burst(t + 0.34, 0.1, 520, 170, 0.8, 0.14, 'lowpass'); }, // 摊开：一串细碎，再一声闷响
  tuck: (t) => { burst(t, 0.42, 2900, 1200, 0.6, 0.035); crackle(t, 0.3, 4, 0.05); },                // 折回、放回
  leaf: (t) => { burst(t, 0.32, 3200, 900, 0.5, 0.05); crackle(t + 0.04, 0.22, 5, 0.06); },           // 翻一开册页
  unroll: (t, d) => { burst(t, d, 700, 1900, 0.45, 0.04); crackle(t + 0.1, d * 0.8, Math.round(d * 7), 0.035); },   // 展卷：绢擦过纸，长而轻
  roll: (t, d) => { burst(t, d, 1800, 650, 0.45, 0.04); crackle(t, d * 0.7, Math.round(d * 5), 0.03); },
  stamp: (t) => { burst(t, 0.12, 380, 120, 0.9, 0.2, 'lowpass'); crackle(t + 0.02, 0.08, 3, 0.05); }, // 钤印：一声闷
};

/** 响一下；d 是这段响多久（抽出、展卷这类有长短的才用得上） */
export const playPaper = (cue: PaperCue, d = 0.5) => {
  if (!on) return;
  init();
  if (!ac || !out || ac.state !== 'running') return;
  out.gain.setTargetAtTime(getPlayerSnapshot().isPlaying ? 0.22 : 0.55, ac.currentTime, 0.05);   // 放歌时让位
  CUES[cue](ac.currentTime + 0.01, d);
};
