// src/hooks/useCoarsePointer.ts
// 📱 触屏检测：手机/平板等主指针为触控的设备返回 true，用于全站统一「减负」判定
// （关转场重影、去 backdrop-blur、简化拟物细节等）。旋转屏幕/外接鼠标属边缘场景，
// 挂载时判定一次即够用，无需响应式监听。
import { useState } from 'react';

export const useCoarsePointer = (): boolean =>
  useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches)[0];
