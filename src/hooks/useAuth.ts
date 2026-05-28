// src/hooks/useAuth.ts
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const useAuth = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 初始化时检查当前是否已经登录
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAdmin(!!session);
      setIsLoading(false);
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