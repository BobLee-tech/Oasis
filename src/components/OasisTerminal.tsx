import React, { useState, useRef } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import type { AuthMode } from '../types/auth';

interface OasisTerminalProps {
  mode: AuthMode;
  knownName?: string;
  onSuccess: (name: string, passkey: string) => void;
  onReset: () => void; // 逃生舱回调
}

// 加入 confirm_key 步骤
type TerminalStep = 'ask_name' | 'ask_key' | 'confirm_key' | 'processing' | 'success';

export const OasisTerminal: React.FC<OasisTerminalProps> = ({ mode, knownName, onSuccess, onReset }) => {
    const [errorCount, setErrorCount] = useState(0); // ✅ 新增错误计数
    const [step, setStep] = useState<TerminalStep>(mode === 'register' ? 'ask_name' : 'ask_key');
    const [inputValue, setInputValue] = useState('');
    const [tempName, setTempName] = useState(knownName || '');
    const [tempKey, setTempKey] = useState(''); // 用于双重验证比对
    
    const [isError, setIsError] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const triggerError = (msg: string) => {
        setIsError(true);
        setErrorMsg(msg);
        setInputValue('');
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const val = inputValue.trim();
        if (!val || step === 'processing' || step === 'success') return;
        
        // ✅ 隐藏彩蛋：极客逃生舱
        if (val === 'sudo reset_identity') {
        onReset();
        setStep('ask_name');
        setTempName('');
        setTempKey('');
        setInputValue('');
        return;
        }

        if (step === 'ask_name') {
        setTempName(val);
        setInputValue('');
        setStep('ask_key');
        } 
        else if (step === 'ask_key') {
        if (mode === 'register') {
            // 注册态：暂存第一次输入的密码，进入二次确认
            setTempKey(val);
            setInputValue('');
            setStep('confirm_key');
        } else {
            // 登录态：直接丢给外部校验
            setStep('processing');
            setTimeout(() => onSuccess(tempName, val), 1200);
        }
        }
        else if (step === 'confirm_key') {
        if (val === tempKey) {
            // ✅ 密码一致，通过！
            setStep('processing');
            setTimeout(() => {
            setStep('success');
            setTimeout(() => onSuccess(tempName, val), 1000);
            }, 1200);
        } else {
        // ❌ 密码不一致，触发物理震动
            setErrorCount(prev => prev + 1); // ✅ 错误次数 +1
            triggerError('> mismatch. recalibrate_key:');
            setTempKey('');
            setStep('ask_key');
            }
        }
    };

    const lineVariants: Variants = {
        hidden: { opacity: 0, x: -10 },
        show: { opacity: 1, x: 0, transition: { duration: 0.3 } }
    };

    return (
        <motion.form
        key="terminal-window"
        onSubmit={handleSubmit}
        onClick={() => inputRef.current?.focus()} 
        // ✅ 响应式优化：w-[90vw] max-w-2xl 适配手机与宽屏
        className="relative z-20 w-[90vw] max-w-2xl min-h-[20rem] bg-[#0A0A0A] border border-[#222222] rounded-xl shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden cursor-text"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={isError ? { x: [-10, 10, -8, 8, -4, 4, 0], opacity: 1, scale: 1 } : { opacity: 1, scale: 1 }}
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

        {/* ✅ 响应式内边距适配 md:p-8 p-5 */}
        <div className="flex-1 p-5 md:p-8 font-mono text-base md:text-xl tracking-[0.1em] text-[#39C5BB] [text-shadow:0_0_8px_rgba(57,197,187,0.4)] flex flex-col justify-start z-10 space-y-4">
            
            {/* 引导语 */}
            <motion.div variants={lineVariants} initial="hidden" animate="show" className="text-[#39C5BB]/60 text-xs md:text-sm mb-4">
            {mode === 'register' ? '>> new_entity_detected. establishing_connection...' : '>> connection_lost. waiting for resonance_frequency...'}
            </motion.div>

            <AnimatePresence mode="popLayout">
            {step !== 'ask_name' && (
                <motion.div key="name-confirmed" variants={lineVariants} initial="hidden" animate="show" className="text-[#39C5BB]/50">
                {`> target_identity: ${tempName}`}
                </motion.div>
            )}

            {errorMsg && (
                <motion.div key="error-msg" variants={lineVariants} initial="hidden" animate="show" className="text-[#FFB7C5] italic">
                {errorMsg}
                </motion.div>
            )}

            {/* ✅ 渐进式披露：输错 3 次及以上，优雅地给出退路 */}
            {errorCount >= 3 && (
                <motion.div key="hint-msg" variants={lineVariants} initial="hidden" animate="show" className="text-slate-600 italic text-sm mt-1">
                {`> hint: memory corrupted? try 'sudo reset_identity'`}
                </motion.div>
            )}

            {step === 'processing' && (
                <motion.div key="processing" variants={lineVariants} initial="hidden" animate="show" className="text-yellow-400/80">
                {`> ${mode === 'register' ? 'generating_soul_token' : 'synchronizing_resonance'}...`}
                </motion.div>
            )}

            {step === 'success' && (
                <motion.div key="success" variants={lineVariants} initial="hidden" animate="show" className="text-emerald-400">
                {`> access_granted. welcome_to_oasis.`}
                </motion.div>
            )}
            
            {(step === 'ask_name' || step === 'ask_key' || step === 'confirm_key') && (
                <motion.div key="input-line" variants={lineVariants} initial="hidden" animate="show" className="relative flex flex-col sm:flex-row sm:items-center mt-2">
                <span className="mr-4 whitespace-nowrap mb-2 sm:mb-0">
                    {step === 'ask_name' && '> identify_yourself:'}
                    {step === 'ask_key' && '> resonance_frequency_required:'}
                    {step === 'confirm_key' && '> verify_resonance_frequency:'}
                </span>
                
                <div className="relative flex items-center">
                    {/* 密码掩码显示，安全且极客 */}
                    <span className="relative z-10">
                    {(step === 'ask_key' || step === 'confirm_key') ? '*'.repeat(inputValue.length) : inputValue}
                    </span>
                    <motion.div
                    animate={{ opacity: [1, 1, 0, 0] }}
                    transition={{ repeat: Infinity, duration: 1, times: [0, 0.5, 0.5, 1] }}
                    className="w-[5px] h-[1.1em] bg-[#39C5BB] ml-[2px] shadow-[0_0_8px_rgba(57,197,187,0.8)] rounded-sm"
                    />
                </div>

                <input
                    ref={inputRef}
                    autoFocus
                    type="text"
                    value={inputValue}
                    onChange={(e) => { setInputValue(e.target.value); setIsError(false); setErrorMsg(''); }}
                    className="absolute inset-0 w-full h-full text-transparent caret-transparent outline-none"
                    spellCheck={false}
                />
                </motion.div>
            )}
            </AnimatePresence>
        </div>
        </motion.form>
    );
    };