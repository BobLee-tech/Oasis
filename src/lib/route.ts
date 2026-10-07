// 🧭 极轻 hash 路由：让每个场所、每篇文章都拥有可分享、可收藏、可后退的地址。
//   不引 react-router，只解析 location.hash，与现有 appView / activePost state 双向同步。
import { useState, useEffect, useCallback } from 'react';
import type { AppView } from '../types/auth';

// AppView ↔ 对外的 URL 语义段（用读者能理解的词，而非内部代号）
const VIEW_TO_SEG: Partial<Record<AppView, string>> = {
  soundscape: 'resonance',
  garden: 'garden',
  orchard: 'constellation',
  lights: 'lanterns',
  atelier: 'atelier',
};
const SEG_TO_VIEW: Record<string, AppView> = {
  resonance: 'soundscape',
  garden: 'garden',
  constellation: 'orchard',
  lanterns: 'lights',
  atelier: 'atelier',
};

// 支持「场所内单条目直达」的 view（garden 的文章 / constellation 的选中星 / atelier 工坊的项目页）
const ITEM_VIEWS: ReadonlySet<AppView> = new Set(['garden', 'orchard', 'atelier']);

export interface Route {
  view: AppView;        // 'welcome' 表示无有效路由（首页入场）
  itemId?: string;      // garden/orchard 的文章 id 或 atelier 项目 id，仅 ITEM_VIEWS 内的场所有意义
}

export const parseHash = (hash: string): Route => {
  const clean = hash.replace(/^#\/?/, '');
  const [seg, ...rest] = clean.split('/');
  const view = SEG_TO_VIEW[seg];
  if (!view) return { view: 'welcome' };
  const route: Route = { view };
  if (ITEM_VIEWS.has(view) && rest[0]) route.itemId = decodeURIComponent(rest[0]);
  return route;
};

export const formatHash = (view: AppView, itemId?: string): string => {
  if (view === 'welcome') return '#/';
  const seg = VIEW_TO_SEG[view];
  if (!seg) return '#/';
  return itemId ? `#/${seg}/${encodeURIComponent(itemId)}` : `#/${seg}`;
};

// 读取 + 订阅当前路由；navigate 推入新地址（新增历史项 → 浏览器后退可回退）
export const useHashRoute = () => {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = useCallback((view: AppView, itemId?: string) => {
    const next = formatHash(view, itemId);
    if (next !== window.location.hash) window.location.hash = next;
  }, []);
  return { route, navigate };
};
