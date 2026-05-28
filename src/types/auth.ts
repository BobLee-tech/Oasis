// src/types/auth.ts

// 系统的鉴权状态：检查中 -> 未授权(需拦截) -> 已授权(放行)
export type AuthStatus = 'checking' | 'unauthorized' | 'authorized';

// 终端模式：新用户注册 vs 老用户重新登录
export type AuthMode = 'register' | 'login';

// 背景粒子的三种物理状态
export type BgPhase = 'cyber' | 'blooming' | 'zen';

// ✅ 新增：绿洲内部的三大平行空间路由 ('welcome'为迎宾过渡态)
export type AppView = 'welcome' | 'diary' | 'soundscape' | 'memories' | 'gallery';

export interface UserSession {
  name: string;
  passkey: string; 
  expiresAt: number; // 用于模拟 Session 过期
}