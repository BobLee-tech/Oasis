// src/components/OasisTerminal.tsx
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';

interface OasisTerminalProps {
  onSuccess: () => void;
}

export const OasisTerminal: React.FC<OasisTerminalProps> = ({ onSuccess }) => {
  const { loginAdmin } = useAuth();
  const [inputValue, setInputValue] = useState('');
  const [logs, setLogs] = useState<string[]>([
    '> SYSTEM INITIALIZED. AWAITING COMMAND...',
    '> type "guest" for public access',
    '> type "sudo login [email] [password]" for creator override'
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [logs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = inputValue.trim();
    if (!val || isProcessing) return;

    // 🛡️ 安全脱敏：绝不在 DOM 历史日志中留下明文密码
    const displayVal = val.startsWith('sudo login') ? 'sudo login [SECURE_UPLINK_HIDDEN]' : val;
    setLogs(prev => [...prev, `> ${displayVal}`]);
    setInputValue(''); // 立刻清空输入框状态

    if (val.toLowerCase() === 'guest') {
      setIsProcessing(true);
      setLogs(prev => [...prev, '> identity confirmed: visitor', '> initializing public sectors...']);
      setTimeout(() => onSuccess(), 1500); 
    } 
    else if (val.startsWith('sudo login')) {
      const parts = val.split(' ');
      // 密码可以含空格：第 4 段起整体拼回，别用 length===4 把强密码挡在门外
      if (parts.length >= 4) {
        setIsProcessing(true);
        setLogs(prev => [...prev, '> authenticating via secure uplink...']);
        try {
          await loginAdmin(parts[2], parts.slice(3).join(' '));
          setLogs(prev => [...prev, '> ACCESS GRANTED: WELCOME CREATOR', '> unlocking restricted sectors (Echoes)...']);
          setTimeout(() => onSuccess(), 1500); 
        } catch (error: any) {
          setLogs(prev => [...prev, `> AUTH FAILED: ${error.message}`]);
          setIsProcessing(false);
        }
      } else {
        setLogs(prev => [...prev, '> usage: sudo login [email] [password]']);
      }
    } 
    else {
      setLogs(prev => [...prev, `> command_not_found: ${val}`]);
    }
  };

  return (
    // ... 这里保持原本的 <motion.form> UI 渲染结构不变，直接复用你之前的 JSX 即可
    // ⚠️ 关键点：原本显示 input 的地方，用下面的安全代码替换：
    <motion.form
      key="terminal-window"
      onSubmit={handleSubmit}
      onClick={() => inputRef.current?.focus()} 
      className="relative z-20 w-[90vw] max-w-2xl h-[24rem] bg-[#0A0A0A] border border-[#222222] rounded-xl shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden cursor-text"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85, filter: 'blur(20px)' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.01)_50%,rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px] opacity-30 z-20" />
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_60px_rgba(0,0,0,0.8)] z-20" />

      <div className="h-8 border-b border-[#222222] bg-[#0D0D0D] flex items-center px-4 space-x-2 z-10 shrink-0">
        <div className="w-2.5 h-2.5 rounded-full bg-[#333333]" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#333333]" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#333333]" />
        <div className="ml-4 text-[10px] text-[#444] font-mono tracking-widest hidden sm:block">OASIS_SECURITY_KERNEL</div>
      </div>

      <div className="flex-1 p-5 md:p-8 font-mono text-sm md:text-base tracking-[0.1em] text-[#39C5BB] [text-shadow:0_0_8px_rgba(57,197,187,0.4)] flex flex-col overflow-y-auto no-scrollbar z-10">
        <AnimatePresence initial={false}>
          {logs.map((log, i) => (
            <motion.div 
              key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} 
              className={`mb-2 ${log.includes('FAILED') || log.includes('not_found') ? 'text-[#FFB7C5]' : log.includes('GRANTED') ? 'text-emerald-400' : ''}`}
            >
              {log}
            </motion.div>
          ))}
        </AnimatePresence>

        {!isProcessing && (
          <div className="relative flex items-center mt-2 shrink-0">
            <span className="mr-2">&gt;</span>
            <div className="relative flex items-center flex-1">
              {/* 🛡️ 实时脱敏：打字过程中的密码实时替换为 *号，防止旁人偷窥 */}
              <span className="relative z-10">{inputValue.startsWith('sudo login') ? inputValue.replace(/(\S+\s+\S+\s+\S+\s+).*/, '$1' + '*'.repeat(Math.max(0, inputValue.length - inputValue.lastIndexOf(' ') - 1))) : inputValue}</span>
              <motion.div animate={{ opacity: [1, 1, 0, 0] }} transition={{ repeat: Infinity, duration: 1, times: [0, 0.5, 0.5, 1] }} className="w-[5px] h-[1.1em] bg-[#39C5BB] ml-[2px] shadow-[0_0_8px_rgba(57,197,187,0.8)] rounded-sm" />
            </div>
            <input ref={inputRef} autoFocus type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} className="absolute inset-0 w-full h-full text-transparent caret-transparent outline-none" spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </motion.form>
  );
};