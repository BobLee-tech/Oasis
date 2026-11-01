// src/components/CategoryIcon.tsx
import React from 'react';
import { ICONS, strokeProps } from '../lib/categoryIcons';

// 分类图标组件：任何地方渲染图标只经此一处
export const CategoryIcon: React.FC<{ name?: string }> = ({ name }) => (
  <svg viewBox="0 0 24 24" {...strokeProps} className="w-full h-full">
    {ICONS[name || 'pen'] ?? ICONS.pen}
  </svg>
);
