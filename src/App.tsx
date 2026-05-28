// src/App.tsx
import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from './hooks/useAuth';
import { useSoundscape } from './hooks/useSoundscape'; 

import { OasisGallery } from './components/OasisGallery';
import { OasisResonance } from './components/OasisResonance';
import { OasisTerminal } from './components/OasisTerminal';
import { OasisBackground } from './components/OasisBackground';
import { OasisGarden } from './components/OasisGarden'; 
import { OasisDiary } from './components/OasisDiary'; 
import { OasisDock } from './components/OasisDock'; 
import { OasisMemories } from './components/OasisMemories';
import type { BgPhase, AppView } from './types/auth';

const customEase: [number, number, number, number] = [0.16, 1, 0.3, 1];

const NoiseOverlay = () => (
  <div className="pointer-events-none absolute inset-0 z-50 opacity-[0.03] mix-blend-overlay">
    <svg className="absolute inset-0 w-full h-full">
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#noise)" />
    </svg>
  </div>
);

const OasisHUD = ({ showClock }: { showClock: boolean }) => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    if (!showClock) return;
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [showClock]);

  return (
    <div className="pointer-events-none absolute inset-8 z-40 flex flex-col justify-between opacity-30 mix-blend-difference text-slate-400">
      <div className="flex justify-between items-start">
        <span className="font-mono text-xs leading-none">+</span>
        <div className="flex flex-col items-end gap-3">
          <span className="font-mono text-xs leading-none">+</span>
          <AnimatePresence>
            {showClock && (
              <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 2 }} className="font-mono text-[10px] tracking-[0.3em] whitespace-nowrap">
                {time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })} · OASIS
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="flex justify-between items-end">
        <span className="font-mono text-xs leading-none">+</span>
        <span className="font-mono text-xs leading-none">+</span>
      </div>
    </div>
  );
};

function App() {
  const { status, mode, userName, isDirectEntry, grantAccess, verifyLogin, resetIdentity } = useAuth();
  const { playBGM } = useSoundscape(); 

  const [bgPhase, setBgPhase] = useState<BgPhase>('cyber');
  const [appView, setAppView] = useState<AppView>('welcome');
  
  // ✅ 核心修复：添加记忆锁，防止切路由时重复播放 BGM
  const hasTriggeredBGM = useRef(false);

  useEffect(() => {
    if (status === 'authorized') {
      if (isDirectEntry) {
        setBgPhase('zen');
      } else {
        setBgPhase('blooming');
        const timer = setTimeout(() => setBgPhase('zen'), 2500);
        return () => clearTimeout(timer);
      }
    } else if (status === 'unauthorized') {
      setBgPhase('cyber');
      setAppView('welcome');
    }
  }, [status, isDirectEntry]);

  useEffect(() => {
    // ✅ 只有当进入绿洲，且之前没触发过 BGM 时，才调用播放
    if (appView !== 'welcome' && status === 'authorized' && !hasTriggeredBGM.current) {
      hasTriggeredBGM.current = true; // 上锁
      playBGM(0.4, 2500); 
    }
  }, [appView, status, playBGM]);

  const handleTerminalSuccess = (name: string, passkey: string) => {
    if (mode === 'register') grantAccess(name, passkey);
    else {
      if (verifyLogin(passkey)) grantAccess(name, passkey);
      else alert("> error. resonance_frequency mismatch. unauthorized breach detected.");
    }
  };

  const containerBg = bgPhase === 'cyber' ? '#050505' : '#FAFAFA';
  const isReturningUser = isDirectEntry || mode === 'login';
  const isInsideOasis = status === 'authorized' && bgPhase === 'zen';

  return (
    <motion.div 
      className="relative w-screen h-screen overflow-hidden flex items-center justify-center"
      animate={{ backgroundColor: containerBg }}
      transition={{ duration: 2.5, ease: customEase }}
    >
      <NoiseOverlay />
      <OasisHUD showClock={isInsideOasis} />
      
      <div className="pointer-events-none absolute inset-0 z-30 shadow-[inset_0_0_150px_rgba(0,0,0,0.05)]" />
      <OasisBackground phase={bgPhase} />

      <div className="relative w-full h-full flex items-center justify-center z-10">
        <AnimatePresence mode="wait">
          {status === 'checking' && (
            <motion.div key="checking" className="absolute inset-0 bg-[#050505] z-50" exit={{ opacity: 0, transition: { duration: 1 } }} />
          )}

          {status === 'unauthorized' && (
            <OasisTerminal key="terminal" mode={mode} knownName={userName} onSuccess={handleTerminalSuccess} onReset={resetIdentity} />
          )}

          {status === 'authorized' && bgPhase === 'zen' && appView === 'welcome' && (
            <OasisGarden 
              key="garden" visitorName={userName} isReturningUser={isReturningUser} 
              onEnterGarden={() => setAppView('gallery')} 
            />
          )}

          {status === 'authorized' && bgPhase === 'zen' && appView !== 'welcome' && (
            <motion.div 
              key="oasis-arena" className="w-full h-full flex items-center justify-center"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.5 } }}
            >
              <AnimatePresence mode="wait">
                {appView === 'diary' && (
                  <motion.div key="diary-space" className="w-full" initial={{ opacity: 0, y: 15, filter: 'blur(10px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -15, filter: 'blur(10px)' }} transition={{ duration: 0.8, ease: customEase }}>
                    <OasisDiary />
                  </motion.div>
                )}
                {appView === 'soundscape' && (
                  <OasisResonance key="sound-space" />
                )}
                {appView === 'memories' && (
                  <OasisMemories key="memory-space" />
                )}
                {appView === 'gallery' && (
                  <OasisGallery key="gallery-space" />
                )}
              </AnimatePresence>
              
              <OasisDock currentView={appView} onViewChange={(view) => setAppView(view)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {bgPhase === 'blooming' && (
          <motion.div
            className="absolute inset-0 z-[5] pointer-events-none bg-gradient-to-tr from-[#39C5BB]/15 via-transparent to-[#FFB7C5]/15"
            initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1.5, opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 2.5, ease: "easeInOut" }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default App;