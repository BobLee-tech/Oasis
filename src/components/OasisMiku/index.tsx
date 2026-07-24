// 🎐 OasisMiku：折叠成一枚小挂坠，点开是会呼吸、会转头、会跟着音乐哼唱的她。
//   模型与 pixi 运行时只在真正展开时才懒加载，折叠态零额外体积、零渲染开销。
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Live2DStage, type MikuStageHandle } from './Live2DStage';
import { MikuParticles, type MikuParticlesHandle } from './MikuParticles';
import { useMikuBrain, type Mood } from './useMikuBrain';
import { useSoundscape, getSpectrum } from '../../hooks/useSoundscape';
import { useCoarsePointer } from '../../hooks/useCoarsePointer';
import type { AppView } from '../../types/auth';

// 气泡边框按「说这句话时她是什么心情」极淡地染色：开心/惊喜偏初音绿、害羞偏樱粉，
// 其余心情（含常态）维持原本的灰——不做成一句一变的六色系统，只在这两种最有辨识度的
// 情绪上点一下色，多数时候你甚至不会意识到边框在变，只会觉得「今天她好像更活了一点」
const MOOD_BUBBLE_BORDER: Partial<Record<Mood, string>> = {
  happy: 'border-[#39C5BB]/35 dark:border-[#39C5BB]/25',
  surprised: 'border-[#39C5BB]/35 dark:border-[#39C5BB]/25',
  shy: 'border-[#FFB7C5]/50 dark:border-[#FFB7C5]/30',
};
const DEFAULT_BUBBLE_BORDER = 'border-slate-300/40 dark:border-white/10';

const MODEL_URL = '/live2d/miku/miku_sample_t04.model3.json';

// 折叠态的小挂坠图标：双马尾剪影，纯线条，呼应站内其余图标的极简风格
const PendantIcon = () => (
  <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M11 13 C7 17 6 23 8 27" />
    <path d="M21 13 C25 17 26 23 24 27" />
    <circle cx="16" cy="14" r="7" fill="none" />
    <path d="M12 13 Q16 10 20 13" />
  </svg>
);

export const OasisMiku = ({ view }: { view: AppView }) => {
  const stageRef = useRef<MikuStageHandle>(null);
  const particlesRef = useRef<MikuParticlesHandle>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const coarsePointer = useCoarsePointer();
  const prefersReducedMotion = !!useReducedMotion();
  // 触屏屏幕更窄，展开态相应缩一号，别喧宾夺主
  const expandedW = coarsePointer ? 148 : 176;
  const expandedH = coarsePointer ? 232 : 272;

  const [expanded, setExpanded] = useState(() => sessionStorage.getItem('oasis_miku_expanded') === '1');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // 星图右下角另有缩放控制，移动端把挂坠再抬高一层；其他场所只需避开 Dock。
  const mobileBottom = view === 'orchard'
    ? 'bottom-[calc(env(safe-area-inset-bottom)+13rem)]'
    : 'bottom-[calc(env(safe-area-inset-bottom)+6.5rem)]';

  const { isPlaying, currentTrack } = useSoundscape();

  const { bubble, bubbleMood, handlePointerDown, handlePointerUp, handlePointerCancel } = useMikuBrain({
    stageRef, particlesRef, ready, view, isPlaying, trackId: currentTrack?.id, trackCategory: currentTrack?.category, getSpectrum, coarsePointer, reduceMotion: prefersReducedMotion,
  });
  const bubbleBorder = MOOD_BUBBLE_BORDER[bubbleMood] ?? DEFAULT_BUBBLE_BORDER;

  useEffect(() => {
    sessionStorage.setItem('oasis_miku_expanded', expanded ? '1' : '0');
  }, [expanded]);

  // 折叠态直接不渲染 Live2DStage（见下方 JSX），画布随之彻底卸载，没有常驻的 WebGL 开销；
  // ready/failed 的复位放在「展开」这个用户动作本身里，不必为此单独起一个 effect。
  const expand = () => { setReady(false); setFailed(false); setExpanded(true); };

  return (
    <div className={`fixed ${mobileBottom} right-5 md:bottom-8 md:right-8 z-[90] flex flex-col items-end gap-2 select-none`}>
      <AnimatePresence>
        {bubble && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.92, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -4, scale: 0.96, filter: 'blur(4px)' }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className={`relative max-w-[16em] text-[13px] origin-bottom-right rounded-2xl rounded-br-md backdrop-blur-md bg-white/50 dark:bg-white/[0.06] border shadow-sm px-4 py-2.5 transition-colors duration-500 ${bubbleBorder}`}
          >
            <span className="font-serif leading-[1.7] tracking-[0.02em] text-slate-600 dark:text-slate-300 text-balance">{bubble}</span>
            {/* 尾巴：明确这句话是她说的，指向下方的挂坠/立绘 */}
            <span className={`absolute -bottom-[5px] right-6 w-2.5 h-2.5 rotate-45 backdrop-blur-md bg-white/50 dark:bg-white/[0.06] border-b border-r transition-colors duration-500 ${bubbleBorder}`} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {expanded ? (
          <motion.div
            key="stage"
            initial={{ opacity: 0, scale: 0.85, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 12 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22 }}
            className="relative"
            style={{ width: expandedW, height: expandedH }}
          >
            <div
              ref={wrapRef}
              className="w-full h-full cursor-pointer touch-none"
              onPointerDown={(e) => {
                if (!wrapRef.current) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                handlePointerDown(e.clientX, e.clientY, wrapRef.current.getBoundingClientRect());
              }}
              onPointerUp={(e) => handlePointerUp(e.clientX, e.clientY)}
              onPointerCancel={handlePointerCancel}
            >
              {!failed && (
                <Live2DStage
                  ref={stageRef}
                  modelUrl={MODEL_URL}
                  width={expandedW}
                  height={expandedH}
                  reduceMotion={prefersReducedMotion}
                  onReady={() => setReady(true)}
                  onError={() => setFailed(true)}
                />
              )}
              {!ready && !failed && (
                <div className="absolute inset-0 flex items-end justify-center pb-8 opacity-40">
                  <span className="font-mono text-[10px] tracking-[0.2em] text-slate-400">LOADING…</span>
                </div>
              )}
              {failed && (
                <div className="absolute inset-0 flex items-end justify-center pb-8 opacity-50 text-center px-2">
                  <span className="font-serif text-xs text-slate-400">她今天有点害羞，暂时不肯出来见人。</span>
                </div>
              )}
            </div>
            <MikuParticles ref={particlesRef} reduceMotion={prefersReducedMotion} coarsePointer={coarsePointer} />
            <button
              onClick={() => setExpanded(false)}
              aria-label="收起"
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center backdrop-blur-md bg-white/60 dark:bg-white/10 border border-slate-300/40 dark:border-white/10 text-slate-400 hover:text-[#39C5BB] shadow-sm transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <span className="absolute -bottom-4 right-0 left-0 text-right font-mono text-[8px] tracking-wide opacity-30 truncate text-slate-400">
              形象 © Crypton Future Media・建模 © Live2D Inc.
            </span>
          </motion.div>
        ) : (
          <motion.button
            key="pendant"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ delay: 0.7, type: 'spring', stiffness: 260, damping: 22 }}
            onClick={expand}
            title="喊她出来"
            className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md bg-white/40 dark:bg-white/5 border text-slate-500 dark:text-slate-300 hover:text-[#39C5BB] hover:border-[#39C5BB]/50 shadow-sm transition-colors duration-500 ${isPlaying ? 'border-[#39C5BB]/40 shadow-[0_0_12px_rgba(57,197,187,0.35)] animate-miku-breathe' : 'border-slate-300/40 dark:border-white/10'}`}
          >
            <PendantIcon />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
