// src/hooks/useAuth.ts
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const useAuth = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 初始化时检查当前是否已经登录
  useEffect(() => {
    const checkSession = async () => {
      try {
        // 某些受限/内嵌浏览器里 supabase 依赖的 navigator.locks 可能永不返回，
        // 用超时兜底，避免应用永远卡在「checking」黑屏上。
        const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 3000));
        const result = await Promise.race([supabase.auth.getSession(), timeout]);
        setIsAdmin(!!result?.data?.session);
      } catch {
        setIsAdmin(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();

    // 监听登录状态的变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAdmin(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Admin 云端登录
  const loginAdmin = async (email: string, pass: string) => {
    setIsLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setIsLoading(false);
    if (error) throw error;
    return data;
  };

  // 登出
  const logout = async () => {
    await supabase.auth.signOut();
  };

  return { isAdmin, isLoading, loginAdmin, logout };
};