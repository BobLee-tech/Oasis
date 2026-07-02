// src/types/auth.ts
export type AuthStatus = 'checking' | 'unauthorized' | 'authorized';
export type AuthMode = 'register' | 'login';
export type BgPhase = 'cyber' | 'blooming' | 'zen';

// ✨ 核心整合：去掉了 diary 和 memories，合并为 echoes。将 gallery 改为符合语境的 garden
export type AppView = 'welcome' | 'echoes' | 'soundscape' | 'garden' | 'orchard' | 'lights';

export interface UserSession {
  name: string;
  passkey: string;
  expiresAt: number; 
}