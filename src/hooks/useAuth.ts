import { useState, useEffect, useCallback } from 'react';
import type { AuthStatus, AuthMode, UserSession } from '../types/auth';

export const useAuth = () => {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [mode, setMode] = useState<AuthMode>('register');
  const [userName, setUserName] = useState<string>('');
  const [isDirectEntry, setIsDirectEntry] = useState(false);

  useEffect(() => {
    // 模拟应用冷启动的黑屏缓冲时间，提升极客感
    const checkAuth = setTimeout(() => {
      const stored = localStorage.getItem('oasis_session');
      if (stored) {
        try {
          const session: UserSession = JSON.parse(stored);
          setUserName(session.name);
          if (Date.now() > session.expiresAt) {
            setMode('login'); // 密钥过期，需要重新登入
            setStatus('unauthorized');
          } else {
            setIsDirectEntry(true); // 密钥有效，免密归家
            setStatus('authorized');
          }
        } catch (e) {
          setMode('register');
          setStatus('unauthorized');
        }
      } else {
        setMode('register');
        setStatus('unauthorized');
      }
    }, 1500); // 1.5秒的冷启动延迟

    return () => clearTimeout(checkAuth);
  }, []);

  const grantAccess = useCallback((name: string, passkey: string) => {
    const session: UserSession = {
      name, passkey,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 天保护期
    };
    localStorage.setItem('oasis_session', JSON.stringify(session));
    setUserName(name);
    setIsDirectEntry(false); // 刚输完密码，要求播放破裂动画
    setStatus('authorized');
  }, []);

  const verifyLogin = useCallback((passkey: string): boolean => {
    const stored = localStorage.getItem('oasis_session');
    if (stored) {
      const session: UserSession = JSON.parse(stored);
      return session.passkey === passkey;
    }
    return false;
  }, []);

  // ✅ 极客逃生舱：清空记忆，重新做人
  const resetIdentity = useCallback(() => {
    localStorage.removeItem('oasis_session');
    setUserName('');
    setMode('register');
    setStatus('unauthorized');
  }, []);

  return { status, mode, userName, isDirectEntry, grantAccess, verifyLogin, resetIdentity };
};