// src/hooks/useAtelier.ts
// 🎨 绘阁数据层：Supabase 云端为权威源 + localStorage 本地缓存兜底。与 useGarden.ts 同一套模式——
//   · 首屏：先用本地缓存瞬时点亮，再向云端拉取最新覆盖（不白屏、不等待）。
//   · 实时：订阅 garden_artworks 表变更，跨标签页/设备自动同步。
//   · 离线 / 表未建：云端任何失败都静默回落到本地缓存，行为与纯本地一致，绝不破坏可用性。
//   · 云端 + 本地都空时：播种 DEMO_ARTWORKS（占位渐变图），保证绘阁一开始就有东西可看。
import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { DEMO_ARTWORKS } from '../data/artworks';

export type ArtPlatform = 'pixiv' | 'x' | 'original' | 'other';
// 🔒 可见性：private 仅园丁本人（默认，避风港优先）；public 是白名单式例外——已获授权 / 可转载的才放出来
export type ArtVisibility = 'private' | 'public';

export interface Artwork {
  id: string;
  title: string;
  artist: string;
  artistUrl?: string;
  sourceUrl: string;
  platform: ArtPlatform;
  imagePath: string;    // R2 图片 key（不含扩展名），或占位/本地图的完整路径（/ 或 http 开头）
  width: number;
  height: number;
  color: string;        // 主色调：灯箱氛围光 + 卡片辉光
  tags: string[];
  note: string;
  visibility: ArtVisibility;
  collectedAt: number;  // 毫秒时间戳
}

// ✍️ 装裱 / 修润一张画作时传入的字段
export interface ArtworkInput {
  title: string;
  artist: string;
  artistUrl?: string;
  sourceUrl: string;
  platform: ArtPlatform;
  imagePath: string;
  width: number;
  height: number;
  color: string;
  tags: string[];
  note: string;
  visibility?: ArtVisibility;
}

const TABLE = 'garden_artworks';
const CACHE_KEY = 'oasis_atelier_artworks';

// 🖼️ 图片地址解析：DB 里登记的 imagePath 可能是——
//   · R2 图片 key（如 '104123456_p0'）：拼 VITE_ART_BASE + 变体后缀
//   · 已经是完整可访问路径（占位图 /artworks-demo/xxx.svg，或未来的手填 URL）：原样返回
const ART_BASE = (import.meta.env.VITE_ART_BASE ?? '').replace(/\/$/, '');
export const resolveArtSrc = (imagePath: string, variant: 'thumb' | 'full' = 'thumb'): string => {
  if (!imagePath) return '';
  if (imagePath.startsWith('/') || /^https?:\/\//.test(imagePath)) return imagePath;
  const base = ART_BASE || '/artworks-src'; // 本地开发：未设 VITE_ART_BASE 时回退 public/artworks-src
  return `${base}/${imagePath}_${variant}.webp`;
};

const sortByNewest = (arr: Artwork[]) => [...arr].sort((a, b) => b.collectedAt - a.collectedAt);

// 🩹 老数据迁移兜底：缺字段的行补齐默认值，与 useGarden 的 hydrate 同一手法
const hydrate = (raw: any[]): Artwork[] =>
  raw.map((a) => ({
    platform: 'other' as ArtPlatform,
    visibility: 'private' as ArtVisibility,
    note: '',
    ...a,
    tags: Array.isArray(a.tags) ? a.tags : [],
  }));

const readCache = (): Artwork[] | null => {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    return stored ? sortByNewest(hydrate(JSON.parse(stored))) : null;
  } catch { return null; }
};
const writeCache = (artworks: Artwork[]) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(artworks)); } catch { /* 容量/隐私模式失败可忽略 */ }
};

// 🌙 只读一眼本地缓存快照，不发起网络请求、不订阅 realtime——供深夜低语等
//   「偶尔瞄一下有没有画作可用」的轻量场景使用，无需挂载完整 useAtelier 实例。
export const peekCachedArtworks = (): Artwork[] => readCache() ?? [];

// —— DB 行 ⇄ Artwork 映射（snake_case ⇄ camelCase） ——
const fromRow = (r: any): Artwork => ({
  id: r.id,
  title: r.title,
  artist: r.artist,
  artistUrl: r.artist_url || undefined,
  sourceUrl: r.source_url,
  platform: (r.platform as ArtPlatform) || 'other',
  imagePath: r.image_path,
  width: Number(r.width) || 0,
  height: Number(r.height) || 0,
  color: r.dominant_color || '#39C5BB',
  tags: Array.isArray(r.tags) ? r.tags : [],
  note: r.note || '',
  visibility: (r.visibility as ArtVisibility) || 'private',
  collectedAt: typeof r.collected_at === 'number' ? r.collected_at : Number(r.collected_at),
});
const toRow = (a: Artwork) => ({
  id: a.id, title: a.title, artist: a.artist, artist_url: a.artistUrl ?? null,
  source_url: a.sourceUrl, platform: a.platform, image_path: a.imagePath,
  width: a.width, height: a.height, dominant_color: a.color,
  tags: a.tags, note: a.note, visibility: a.visibility, collected_at: a.collectedAt,
});

export const useAtelier = () => {
  const [artworks, setArtworks] = useState<Artwork[]>(() => readCache() ?? []);
  const cloudOk = useRef(true);
  const artworksRef = useRef(artworks);
  artworksRef.current = artworks;

  const commit = useCallback((next: Artwork[]) => {
    const sorted = sortByNewest(next);
    setArtworks(sorted);
    writeCache(sorted);
  }, []);

  const fetchCloud = useCallback(async () => {
    try {
      const { data, error } = await supabase.from(TABLE).select('*');
      if (error) throw error;
      cloudOk.current = true;
      if (data && data.length > 0) {
        commit(data.map(fromRow));
      } else if (!readCache()) {
        // 云端为空且本地也无缓存：播种占位画作（并尝试上云）
        commit(DEMO_ARTWORKS);
        supabase.from(TABLE).insert(DEMO_ARTWORKS.map(toRow)).then(({ error: e }) => { if (e) cloudOk.current = false; });
      }
    } catch {
      cloudOk.current = false;
      const cached = readCache();
      commit(cached ?? DEMO_ARTWORKS);
    }
  }, [commit]);

  useEffect(() => {
    fetchCloud();
    // 频道名带随机后缀：避免多实例同时挂载时 channel 名冲突导致崩白（同 useGarden 的坑）
    const channel = supabase
      .channel(`garden_artworks_sync_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => fetchCloud())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchCloud]);

  const frameArtwork = useCallback((input: ArtworkInput) => {
    const now = Date.now();
    const newArt: Artwork = {
      id: crypto.randomUUID(),
      title: input.title.trim() || 'Untitled',
      artist: input.artist.trim() || 'Unknown',
      artistUrl: input.artistUrl?.trim() || undefined,
      sourceUrl: input.sourceUrl.trim(),
      platform: input.platform,
      imagePath: input.imagePath.trim(),
      width: input.width, height: input.height, color: input.color,
      tags: input.tags, note: input.note.trim(),
      visibility: input.visibility ?? 'private',
      collectedAt: now,
    };
    commit([newArt, ...artworksRef.current]); // 乐观更新
    if (cloudOk.current) supabase.from(TABLE).insert(toRow(newArt)).then(({ error }) => { if (error) cloudOk.current = false; });
  }, [commit]);

  const retouchArtwork = useCallback((id: string, input: ArtworkInput) => {
    const patch = {
      title: input.title.trim() || 'Untitled', artist: input.artist.trim() || 'Unknown',
      artistUrl: input.artistUrl?.trim() || undefined, sourceUrl: input.sourceUrl.trim(),
      platform: input.platform, imagePath: input.imagePath.trim(),
      width: input.width, height: input.height, color: input.color,
      tags: input.tags, note: input.note.trim(), visibility: input.visibility ?? 'private',
    };
    commit(artworksRef.current.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    if (cloudOk.current) {
      const dbPatch = {
        title: patch.title, artist: patch.artist, artist_url: patch.artistUrl ?? null,
        source_url: patch.sourceUrl, platform: patch.platform, image_path: patch.imagePath,
        width: patch.width, height: patch.height, dominant_color: patch.color,
        tags: patch.tags, note: patch.note, visibility: patch.visibility,
      };
      supabase.from(TABLE).update(dbPatch).eq('id', id).then(({ error }) => { if (error) cloudOk.current = false; });
    }
  }, [commit]);

  const unframeArtwork = useCallback((id: string) => {
    commit(artworksRef.current.filter((a) => a.id !== id));
    if (cloudOk.current) supabase.from(TABLE).delete().eq('id', id).then(({ error }) => { if (error) cloudOk.current = false; });
  }, [commit]);

  return { artworks, frameArtwork, retouchArtwork, unframeArtwork };
};

// 🔒 可见性过滤：RLS 已在服务端把 private 挡在匿名读取之外，这层过滤只为「访客模拟」开关服务——
//   admin 本人的已登录会话仍会把 private 收藏一并拉下来，模拟访客视角时需要在客户端滤掉。
export const filterVisible = (artworks: Artwork[], isAdmin: boolean): Artwork[] =>
  isAdmin ? artworks : artworks.filter((a) => a.visibility === 'public');
