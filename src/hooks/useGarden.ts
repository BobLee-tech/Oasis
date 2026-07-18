// src/hooks/useGarden.ts
// 🌱 数字花园数据层：Supabase 云端为权威源 + localStorage 本地缓存兜底。
//   · 首屏：先用本地缓存瞬时点亮，再向云端拉取最新覆盖（不白屏、不等待）。
//   · 实时：订阅 garden_posts 表变更，博客与知识星图（同源 useGarden）跨标签页/设备自动同步。
//   · 离线 / 表未建：云端任何失败都静默回落到本地缓存，行为与旧版纯本地一致，绝不破坏可用性。
// 公开 API 与旧版完全一致：{ posts, plantSeed, updateSeed, uprootSeed }。
import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

// 🌱 条目类型：内置随笔 / 周报 / 学习笔记 / 成长 / 项目复盘 + 用户自定义分类（见 useCategories）
export type PostType = string;

// 🌱🌿🌳 生长度：花园里的植物会长大——种子刚种下 / 正在生长 / 已长成常青树，纯自述性质，不影响排序
export type Growth = 'seedling' | 'growing' | 'evergreen';
// 📝 可见性：draft（仅园丁本人，RLS 挡在外面）/ unlisted（凭 shareToken 单篇可读，不进列表与站外索引）/ published（对所有人可读且列出）
export type PostStatus = 'draft' | 'unlisted' | 'published';

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  date: string;          // 展示用的友好日期串
  createdAt: number;     // 真实时间戳，用于可靠排序与按月归档
  updatedAt: number;     // 🌿 最近一次被「照料」（updateSeed）的时间戳；从未改过则等于 createdAt
  growth: Growth;
  status: PostStatus;
  type: PostType;        // 条目类型
  tags: string[];
  color: string;
  content: string;
  series?: string;       // 📚 合集：同一主题的连载归属（如「悉尼生活」）；序号按 createdAt 在合集内推导
  slug?: string;         // 🔗 可读短链（唯一）：/p/:slug 优先于 /p/:id，留空则外链回落用 id
  shareToken?: string;   // 🔒 仅 unlisted 用：/p/:token 通过 RPC 单篇读取，不随 status 改回后自动作废
}

// ✍️ 种下 / 照料一颗种子时传入的字段：plantSeed 全部必填即用，updateSeed 对既有文章打补丁
export interface SeedInput {
  title: string;
  tags: string[];
  color: string;
  content: string;
  type?: PostType;
  series?: string;
  growth?: Growth;
  status?: PostStatus;
  slug?: string;         // 留空 → 从 title 自动生成
  excerpt?: string;      // 留空 → makeExcerpt 自动截断正文
}

const TABLE = 'garden_posts';
const CACHE_KEY = 'oasis_garden_posts';

export const makeExcerpt = (content: string) =>
  content.slice(0, 110).replace(/[#*`>!\[\]()]/g, '').replace(/\n+/g, ' ').trim() + '…';

// 🔗 slug 化：中文标题保留汉字直接进 URL（现代浏览器地址栏会自动解码，比强行转拼音/随机串更可读），
//   只清掉标点符号、空白折成连字符。纯符号/纯 emoji 标题会滑出空串，交给调用方兜底。
const slugify = (s: string) =>
  s.trim().toLowerCase()
    .replace(/[「」『』《》〈〉【】〔〕（）()\[\]{}"'“”‘’、，,。.!！?？:：;；~～·`/\\]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

// 唯一 slug：与既有文章（排除自己）撞名则加短后缀；slugify 结果为空（纯符号/emoji 标题）则退回短 id
const uniqueSlug = (title: string, custom: string | undefined, existing: BlogPost[], selfId?: string) => {
  const base = slugify(custom || title) || `post-${Date.now().toString(36)}`;
  const taken = new Set(existing.filter(p => p.id !== selfId).map(p => p.slug).filter(Boolean));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
};

const friendlyDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const DEFAULT_POSTS: BlogPost[] = [
  {
    id: 'p1', title: 'The Architecture of a Digital Garden',
    excerpt: '打破传统博客时间轴的暴政。探讨如何构建一个具有疗愈感与空间隐喻的数字避难所。',
    date: friendlyDate(Date.now()), createdAt: Date.now(), updatedAt: Date.now(),
    growth: 'seedling', status: 'published', type: 'thought',
    tags: ['UI/UX', 'Psyche'], color: '#39C5BB',
    content: '## 逃离内卷\n\n在充满内卷与信息焦虑的时代，我们需要一种非竞争性的数字表达方式。数字花园不按时间线强制排序，它允许思想自由生长。\n\n### Markdown 与图片支持\n\n你现在可以像这样插入图片：\n\n![Oasis Vibe](https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=2000&auto=format&fit=crop)'
  }
];

const sortByNewest = (arr: BlogPost[]) => [...arr].sort((a, b) => b.createdAt - a.createdAt);

// 🩹 老数据迁移：为缺失字段的旧文章补齐 type / createdAt / tags / growth / status / updatedAt
const hydrate = (raw: any[]): BlogPost[] =>
  raw.map((p, i) => {
    const createdAt = typeof p.createdAt === 'number'
      ? p.createdAt
      : (Date.parse(p.date) || (Date.now() - i * 86400000));
    return {
      type: 'thought' as PostType,
      growth: 'seedling' as Growth,
      status: 'published' as PostStatus,
      ...p,
      createdAt,
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : createdAt,
      tags: Array.isArray(p.tags) ? p.tags : [],
      date: p.date || friendlyDate(createdAt),
    };
  });

// —— 本地缓存读写 ——
const readCache = (): BlogPost[] | null => {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    return stored ? sortByNewest(hydrate(JSON.parse(stored))) : null;
  } catch { return null; }
};
// 🔒 草稿全文不落盘：登出后 / 借用设备时，localStorage 缓存不该还留着没发布的文字。
//   draft 被整条剔除（下次加载先短暂看不到草稿，直到 fetchCloud 回来即刻补上，admin 体验上无感）；
//   unlisted 本就允许匿名凭 token 读到，缓存无妨。
const writeCache = (posts: BlogPost[]) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(posts.filter(p => p.status !== 'draft'))); } catch { /* 容量/隐私模式失败可忽略 */ }
};

// —— DB 行 ⇄ BlogPost 映射（snake_case ⇄ camelCase） ——
// growth/status/updated_at 三列可能来自尚未跑迁移脚本（supabase/garden_posts.sql）的老库，
// 缺失时兜底为 seedling / published / createdAt，与本地 hydrate() 的默认值保持一致。
const fromRow = (r: any): BlogPost => {
  const createdAt = typeof r.created_at === 'number' ? r.created_at : Number(r.created_at);
  return {
    id: r.id,
    title: r.title,
    excerpt: r.excerpt,
    date: r.date || friendlyDate(createdAt),
    createdAt,
    updatedAt: typeof r.updated_at === 'number' ? r.updated_at : (Number(r.updated_at) || createdAt),
    growth: (r.growth as Growth) || 'seedling',
    status: (r.status as PostStatus) || 'published',
    type: r.type,
    tags: Array.isArray(r.tags) ? r.tags : [],
    color: r.color,
    content: r.content,
    series: r.series || undefined,
    slug: r.slug || undefined,
    shareToken: r.share_token || undefined,
  };
};
const toRow = (p: BlogPost) => ({
  id: p.id, title: p.title, excerpt: p.excerpt, date: p.date,
  created_at: p.createdAt, updated_at: p.updatedAt, growth: p.growth, status: p.status,
  type: p.type, tags: p.tags, color: p.color, content: p.content,
  series: p.series ?? null, slug: p.slug ?? null, share_token: p.shareToken ?? null,
});

export const useGarden = () => {
  const [posts, setPosts] = useState<BlogPost[]>(() => readCache() ?? []);
  // 云端是否可用：失败一次即标记，后续写入只走本地，保持离线可用
  const cloudOk = useRef(true);
  // 始终持有最新 posts，供事件回调读取，避免把 posts 列进 useCallback 依赖造成订阅反复重建
  const postsRef = useRef(posts);
  postsRef.current = posts;

  // 统一更新入口：写状态 + 同步本地缓存
  const commit = useCallback((next: BlogPost[]) => {
    const sorted = sortByNewest(next);
    setPosts(sorted);
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
        // 云端为空且本地也无缓存：植入默认首篇（并尝试上云）
        commit(DEFAULT_POSTS);
        supabase.from(TABLE).insert(DEFAULT_POSTS.map(toRow)).then(({ error: e }) => { if (e) cloudOk.current = false; });
      }
    } catch {
      // 云端不可用（离线 / 表未建 / 凭证缺失）：回落本地缓存，无缓存则播种默认
      cloudOk.current = false;
      const cached = readCache();
      commit(cached ?? DEFAULT_POSTS);
    }
  }, [commit]);

  useEffect(() => {
    fetchCloud();
    // 🛰️ 实时订阅：任意端增删改 → 本地刷新，博客与星图同步。
    // ⚠️ 频道名必须每个 hook 实例唯一：博客与星图（OasisGallery / OasisOrchard）会在切换转场时
    //    短暂同时挂载，两个 useGarden 实例若共用固定频道名，第二个 .on() 会在该频道 subscribe() 之后
    //    被调用而抛错，导致整页崩白。用随机后缀隔离，各实例各自独立的频道。
    const channel = supabase
      .channel(`garden_posts_sync_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => fetchCloud())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchCloud]);

  const plantSeed = useCallback((input: SeedInput) => {
    const now = Date.now();
    const title = input.title.trim() || 'Untitled Thought';
    const status = input.status ?? 'published';
    const newPost: BlogPost = {
      id: crypto.randomUUID(),
      title,
      excerpt: input.excerpt?.trim() || makeExcerpt(input.content),
      date: friendlyDate(now), createdAt: now, updatedAt: now,
      growth: input.growth ?? 'seedling', status,
      type: input.type ?? 'thought',
      tags: input.tags.length > 0 ? input.tags : ['Draft'], color: input.color, content: input.content,
      series: input.series?.trim() || undefined,
      slug: uniqueSlug(title, input.slug, postsRef.current),
      // 🔒 只有 unlisted 才需要令牌；draft/published 都靠 RLS 直接判定，不必生成一个用不上的 token
      shareToken: status === 'unlisted' ? crypto.randomUUID() : undefined,
    };
    commit([newPost, ...postsRef.current]); // 乐观更新
    if (cloudOk.current) supabase.from(TABLE).insert(toRow(newPost)).then(({ error }) => { if (error) cloudOk.current = false; });
  }, [commit]);

  const updateSeed = useCallback((id: string, input: SeedInput) => {
    // 🌿 每次显式「Update」都是一次照料：updatedAt 刷新为此刻，供 Colophon 与「最近照料」展示
    const updatedAt = Date.now();
    const title = input.title.trim() || 'Untitled';
    const status = input.status ?? 'published';
    const existing = postsRef.current.find(p => p.id === id);
    const patch = {
      title, tags: input.tags.length > 0 ? input.tags : ['Draft'],
      color: input.color, content: input.content, type: input.type ?? 'thought',
      excerpt: input.excerpt?.trim() || makeExcerpt(input.content),
      series: input.series?.trim() || undefined,
      updatedAt,
      growth: input.growth ?? 'seedling', status,
      slug: uniqueSlug(title, input.slug, postsRef.current, id),
      // 沿用已有令牌（旧分享链接不会因为改回 unlisted 而失效）；首次转 unlisted 才现生成一个
      shareToken: status === 'unlisted' ? (existing?.shareToken ?? crypto.randomUUID()) : existing?.shareToken,
    };
    commit(postsRef.current.map(p => p.id === id ? { ...p, ...patch } : p));
    if (cloudOk.current) {
      const dbPatch = {
        title: patch.title, tags: patch.tags, color: patch.color, content: patch.content, type: patch.type,
        excerpt: patch.excerpt, series: patch.series ?? null, growth: patch.growth, status: patch.status,
        updated_at: updatedAt, slug: patch.slug, share_token: patch.shareToken ?? null,
      };
      supabase.from(TABLE).update(dbPatch).eq('id', id).then(({ error }) => { if (error) cloudOk.current = false; });
    }
  }, [commit]);

  const uprootSeed = useCallback((id: string) => {
    commit(postsRef.current.filter(p => p.id !== id));
    if (cloudOk.current) supabase.from(TABLE).delete().eq('id', id).then(({ error }) => { if (error) cloudOk.current = false; });
  }, [commit]);

  // ☁️ 一键迁移：把当前所有本地文章 upsert 到云端（按 id 去重，可重复安全执行）。
  //    返回 { count } 表示同步条数；若表未建 / 未登录 / 离线则抛错，由调用方提示。
  const syncToCloud = useCallback(async (): Promise<{ count: number }> => {
    const all = postsRef.current;
    if (all.length === 0) return { count: 0 };
    const { error } = await supabase.from(TABLE).upsert(all.map(toRow), { onConflict: 'id' });
    if (error) { cloudOk.current = false; throw error; }
    cloudOk.current = true;
    return { count: all.length };
  }, []);

  return { posts, plantSeed, updateSeed, uprootSeed, syncToCloud };
};

// 🔒 草稿可见性：RLS 已在服务端把草稿挡在匿名读取之外，这层过滤只为「访客模拟」开关服务——
//   admin 本人的已登录会话仍会把草稿一并拉下来，模拟访客视角时需要在客户端把它们滤掉，
//   否则「模拟」名不副实。真实访客的 posts 里本就不会有草稿，这个过滤对他们是无操作。
//   ⚠️ unlisted 故意不在这里过滤：这份返回值是「能被直接导航/引用到」的集合（深链、反向链接、
//   合集目录都靠它），unlisted 的全部含义就是「知道链接的人能读到」，过滤掉反而打破分享链接。
//   真正把 unlisted 挡在主列表/归档/搜索之外的是 OasisGallery 里另建的 listedPosts。
export const filterVisible = (posts: BlogPost[], isAdmin: boolean): BlogPost[] =>
  isAdmin ? posts : posts.filter(p => p.status !== 'draft');
