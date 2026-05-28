// src/App.tsx
import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from './hooks/useAuth';
import { useSoundscape } from './hooks/useSoundscape'; 

import { OasisWhispers } from './components/OasisWhispers';
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
      <filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" stitchTiles="stitch" /></filter>
      <rect width="100%" height="100%" filter="url(#noise)" />
    </svg>
  </div>
);

// 🛠️ 提取出来的时间组件，避免整个 HUD 重新渲染
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
  
  // 💡 模拟访客状态
  const [simulateGuest, setSimulateGuest] = useState(false);
  
  // 💡 动态结算实际权限：必须是 Admin 且 没有开启访客模拟
  const effectiveIsAdmin = isAdmin && !simulateGuest;
  
  const hasTriggeredBGM = useRef(false);

  // 1. 初始化进入检测：彻底解除与 Terminal 动画的冲突
  useEffect(() => {
    if (!isLoading) {
      if (isAdmin && terminalStatus === 'checking') {
        // 只有最初进入网站且发现已经登录时，才自动放行
        setTerminalStatus('granted');
        setBgPhase('zen');
      } else if (!isAdmin) {
        setTerminalStatus('locked');
        setBgPhase('cyber');
        setAppView('welcome');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]); 

  // 2. 音乐触发钩子
  useEffect(() => {
    if (appView !== 'welcome' && terminalStatus === 'granted' && !hasTriggeredBGM.current) {
      hasTriggeredBGM.current = true;
      playBGM(0.4, 2500); 
    }
  }, [appView, terminalStatus, playBGM]);

  // 3. 终端通过事件 (让终端主动释放控制权，保证过渡丝滑)
  const handleTerminalSuccess = () => {
    setTerminalStatus('granted');
    setBgPhase('blooming');
    setTimeout(() => setBgPhase('zen'), 2500);
  };

  // 4. 登出系统
  const handleLogout = async () => {
    await logout();
    setSimulateGuest(false);
    setTerminalStatus('locked');
    setBgPhase('cyber');
    setAppView('welcome');
  };

  const containerBg = bgPhase === 'cyber' ? '#050505' : '#FAFAFA';

  return (
    <motion.div 
      className="relative w-screen h-screen overflow-hidden flex items-center justify-center"
      animate={{ backgroundColor: containerBg }} transition={{ duration: 2.5, ease: customEase }}
    >
      <NoiseOverlay />
      <OasisHUD showClock={terminalStatus === 'granted' && bgPhase === 'zen'} />

      {/* 🚀 造物主控制面板 (仅 Admin 可见) */}
      <AnimatePresence>
        {isAdmin && terminalStatus === 'granted' && bgPhase === 'zen' && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute top-8 left-8 z-50 flex items-center gap-6 font-mono text-[9px] tracking-widest uppercase"
          >
            <button 
              onClick={() => setSimulateGuest(!simulateGuest)} 
              className={`transition-colors border border-slate-200 px-3 py-1 rounded-full ${simulateGuest ? 'bg-[#39C5BB] text-white border-[#39C5BB]' : 'bg-white/50 text-slate-500 hover:border-slate-400'}`}
            >
              {simulateGuest ? '[ Visitor Mode : ON ]' : '[ Visitor Mode : OFF ]'}
            </button>
            <button onClick={handleLogout} className="text-slate-400 hover:text-[#FFB7C5] transition-colors">
              Disconnect
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-0 z-30 shadow-[inset_0_0_150px_rgba(0,0,0,0.05)]" />
      <OasisBackground phase={bgPhase} />

      <div className="relative w-full h-full flex items-center justify-center z-10">
        <AnimatePresence mode="wait">
          {terminalStatus === 'checking' && (
            <motion.div key="checking" className="absolute inset-0 bg-[#050505] z-50" exit={{ opacity: 0, transition: { duration: 1 } }} />
          )}

          {terminalStatus === 'locked' && (
            <OasisTerminal key="terminal" onSuccess={handleTerminalSuccess} />
          )}

          {terminalStatus === 'granted' && bgPhase === 'zen' && appView === 'welcome' && (
            // ✅ 将名字换成了 Bob Lee
            <OasisGarden 
              key="garden" visitorName={effectiveIsAdmin ? "Bob Lee" : "Visitor"} isReturningUser={effectiveIsAdmin} 
              onEnterGarden={() => setAppView('gallery')} 
            />
          )}

          {terminalStatus === 'granted' && bgPhase === 'zen' && appView !== 'welcome' && (
            <motion.div 
              key="oasis-arena" className="w-full h-full flex items-center justify-center"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.5 } }}
            >
              <AnimatePresence mode="wait">
                {/* 🛡️ 根据 effectiveIsAdmin 进行真正的权限渲染 */}
                {appView === 'diary' && effectiveIsAdmin && (
                  <motion.div key="diary-space" className="w-full" initial={{ opacity: 0, y: 15, filter: 'blur(10px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -15, filter: 'blur(10px)' }} transition={{ duration: 0.8, ease: customEase }}>
                    <OasisDiary />
                  </motion.div>
                )}
                {appView === 'soundscape' && <OasisResonance key="sound-space" />}
                {appView === 'memories' && effectiveIsAdmin && <OasisMemories key="memory-space" />}
                {appView === 'gallery' && <OasisGallery key="gallery-space" isAdmin={effectiveIsAdmin} />}
                {appView === 'whispers' && <OasisWhispers key="whispers-space" isAdmin={effectiveIsAdmin} />}
              </AnimatePresence>
              
              {/* 🚢 将虚拟的沙盒权限向下传递给底座 */}
              <OasisDock currentView={appView} onViewChange={setAppView} isAdmin={effectiveIsAdmin} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {bgPhase === 'blooming' && (
          <motion.div className="absolute inset-0 z-[5] pointer-events-none bg-gradient-to-tr from-[#39C5BB]/15 via-transparent to-[#FFB7C5]/15" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1.5, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 2.5, ease: "easeInOut" }} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default App;