// src/App.tsx
import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from './hooks/useAuth';
import { useSoundscape } from './hooks/useSoundscape'; 

import { OasisOrchard } from './components/OasisOrchard';
import { OasisGallery } from './components/OasisGallery';
import { OasisResonance } from './components/OasisResonance';
import { OasisTerminal } from './components/OasisTerminal';
import { OasisBackground } from './components/OasisBackground';
import { OasisGarden } from './components/OasisGarden'; 
import { OasisDock } from './components/OasisDock'; 

import type { BgPhase, AppView } from './types/auth';

const NoiseOverlay = () => (
  <div className="pointer-events-none absolute inset-0 z-50 opacity-[0.03] mix-blend-overlay">
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

  useEffect(() => {
    // 与界面主色调呼应的柔和色板：初音绿 / 樱粉 / 月白
    const palette = ['rgba(57,197,187,0.55)', 'rgba(255,183,197,0.5)', 'rgba(226,232,240,0.55)'];
    let i = 0;
    let last = 0;
    const handler = (e: PointerEvent) => {
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
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[300] overflow-hidden">
      <AnimatePresence>
        {ripples.map(r => (
          <span key={r.id} className="absolute" style={{ left: r.x, top: r.y }}>
            {/* 落点的一点柔光，像水珠触面后缓缓晕开 */}
            <motion.span
              className="absolute rounded-full blur-[4px]"
              style={{ x: '-50%', y: '-50%', background: `radial-gradient(circle, ${r.color} 0%, transparent 72%)` }}
              initial={{ width: 14, height: 14, opacity: 0.55 }}
              animate={{ width: 78, height: 78, opacity: 0 }}
              transition={{ duration: 1.7, ease: 'easeOut' }}
            />
            {/* 主涟漪细环：从容地荡开，长长的尾韵 */}
            <motion.span
              className="absolute rounded-full"
              style={{ x: '-50%', y: '-50%', border: `1.5px solid ${r.color}` }}
              initial={{ width: 6, height: 6, opacity: 0.55 }}
              animate={{ width: 230, height: 230, opacity: 0 }}
              transition={{ duration: 2.5, ease: [0.22, 0.61, 0.36, 1] }}
            />
            {/* 第二圈延迟扩散，水波荡开的余韵 */}
            <motion.span
              className="absolute rounded-full"
              style={{ x: '-50%', y: '-50%', border: `1px solid ${r.color}` }}
              initial={{ width: 6, height: 6, opacity: 0 }}
              animate={{ width: 168, height: 168, opacity: [0, 0.32, 0] }}
              transition={{ duration: 2.8, ease: [0.22, 0.61, 0.36, 1], delay: 0.35, times: [0, 0.25, 1] }}
            />
          </span>
        ))}
      </AnimatePresence>
    </div>
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

const OasisHUD = ({ showClock }: { showClock: boolean }) => (
  <div className="pointer-events-none absolute inset-8 z-40 flex flex-col justify-between opacity-30 mix-blend-difference text-slate-400">
    <div className="flex justify-between items-start">
      <span className="font-mono text-xs leading-none">+</span>
      <div className="flex flex-col items-end gap-3">
        <span className="font-mono text-xs leading-none">+</span>
        <AnimatePresence>
          {showClock && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 2 }} className="font-mono text-[10px] tracking-[0.3em] whitespace-nowrap">
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

function App() {
  const { isAdmin, isLoading, logout } = useAuth();
  const { playBGM } = useSoundscape(); 

  const [terminalStatus, setTerminalStatus] = useState<'checking' | 'locked' | 'granted'>('checking');
  const [bgPhase, setBgPhase] = useState<BgPhase>('cyber');
  const [appView, setAppView] = useState<AppView>('welcome');
  
  const [simulateGuest, setSimulateGuest] = useState(false);
  const effectiveIsAdmin = isAdmin && !simulateGuest;
  
  const hasTriggeredBGM = useRef(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  useEffect(() => {
    if (!isLoading) {
      if (isAdmin && terminalStatus === 'checking') {
        setTerminalStatus('granted'); setBgPhase('zen');
      } else if (!isAdmin) {
        setTerminalStatus('locked'); setBgPhase('cyber'); setAppView('welcome');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]); 

  useEffect(() => {
    if (appView !== 'welcome' && terminalStatus === 'granted' && !hasTriggeredBGM.current) {
      hasTriggeredBGM.current = true; playBGM(0.4, 2500); 
    }
  }, [appView, terminalStatus, playBGM]);

  const handleTerminalSuccess = () => {
    setTerminalStatus('granted'); setBgPhase('blooming');
    setTimeout(() => setBgPhase('zen'), 2500);
  };

  const handleLogout = async () => {
    await logout(); setSimulateGuest(false); setTerminalStatus('locked'); setBgPhase('cyber'); setAppView('welcome');
  };

  // ✨ 核心修复：纯原生 CSS 类名驱动背景，彻底解放 transition
  const bgClass = bgPhase === 'cyber' ? 'bg-[#050505]' : 'bg-[#F8FAFC] dark:bg-[#0A0F1D]';

  return (
    <div className={`relative w-screen h-screen overflow-hidden flex items-center justify-center transition-colors duration-[1500ms] ease-in-out ${bgClass} ${isDarkMode ? 'dark' : ''}`}>
      <NoiseOverlay />
      <ClickRipples />
      <OasisHUD showClock={terminalStatus === 'granted' && bgPhase === 'zen'} />

      <AnimatePresence>
        {terminalStatus === 'granted' && bgPhase === 'zen' && appView !== 'welcome' && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 1 }}
            className="absolute top-8 left-8 z-[100] flex flex-wrap items-center gap-3"
          >
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)} 
              className="flex items-center justify-center font-mono text-[9px] tracking-[0.2em] uppercase px-4 py-2 rounded-full border transition-all duration-700 outline-none backdrop-blur-md bg-white/40 dark:bg-white/5 border-slate-300/40 dark:border-white/10 text-slate-500 dark:text-slate-300 hover:text-[#39C5BB] dark:hover:text-[#39C5BB] hover:border-[#39C5BB]/50 shadow-sm"
            >
              {isDarkMode ? '☼ LIGHT' : '☽ DARK'}
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

      <div className="relative w-full h-full flex items-center justify-center z-10">
        <AnimatePresence mode="wait">
          {terminalStatus === 'checking' && <motion.div key="checking" className="absolute inset-0 bg-[#050505] z-50" exit={{ opacity: 0, transition: { duration: 1 } }} />}
          {terminalStatus === 'locked' && <OasisTerminal key="terminal" onSuccess={handleTerminalSuccess} />}
          {terminalStatus === 'granted' && bgPhase === 'zen' && appView === 'welcome' && (
            <OasisGarden key="garden" visitorName={effectiveIsAdmin ? "Bob Lee" : "Visitor"} isReturningUser={effectiveIsAdmin} onEnterGarden={() => setAppView('garden')} />
          )}
          {terminalStatus === 'granted' && bgPhase === 'zen' && appView !== 'welcome' && (
            <motion.div key="oasis-arena" className="w-full h-full flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.5 } }}>
              <AnimatePresence mode="wait">
                {appView === 'soundscape' && <OasisResonance key="sound-space" />}
                {appView === 'garden' && <OasisGallery key="garden-space" isAdmin={effectiveIsAdmin} />}
                {appView === 'orchard' && <OasisOrchard key="orchard-space" isAdmin={effectiveIsAdmin} />}
              </AnimatePresence>
              <OasisDock currentView={appView} onViewChange={setAppView} isAdmin={effectiveIsAdmin} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {bgPhase === 'blooming' && <motion.div className="absolute inset-0 z-[5] pointer-events-none bg-gradient-to-tr from-[#39C5BB]/15 via-transparent to-[#FFB7C5]/15" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1.5, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 2.5, ease: "easeInOut" }} />}
      </AnimatePresence>
    </div>
  );
}

export default App;