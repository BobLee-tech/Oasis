// 🪶 边缘函数专用的极简 Supabase 只读客户端：直接 fetch PostgREST 端点，不引 @supabase/supabase-js。
//   该包会连带打包 @supabase/realtime-js，而后者依赖 Node-only 的 `ws`，
//   Vercel Edge Runtime 静态打包分析时会把整条引用链判定为
//   "referencing unsupported modules" 并直接拒绝部署。
//   这几个边缘函数都只做只读查询，一个 fetch 封装就够，行为（含 RLS）与官方客户端完全一致——
//   同一把 anon key、同一张表，草稿依旧只对已登录会话可见。
// garden_posts 的一行；select 只取了一部分列，所以全是可选
export interface PostRow {
  id: string;
  title?: string;
  excerpt?: string | null;
  content?: string | null;
  created_at?: number | string; // 存的是毫秒时间戳（bigint）
  updated_at?: number | string | null;
  color?: string | null;
  tags?: string[] | null;
  slug?: string | null;
  status?: string | null;
  share_token?: string | null;
}

export interface RestQuery {
  select: string;
  eq?: [string, string];
  filters?: [string, string][]; // 额外的 eq 过滤条件，AND 叠加（如排除 unlisted 用 ['status', 'published']）
  order?: string;   // 如 'created_at.desc'
  limit?: number;
}

export const fetchGardenPosts = async (
  supabaseUrl: string,
  anonKey: string,
  query: RestQuery
): Promise<PostRow[]> => {
  const url = new URL(`${supabaseUrl}/rest/v1/garden_posts`);
  url.searchParams.set('select', query.select);
  if (query.eq) url.searchParams.set(query.eq[0], `eq.${query.eq[1]}`);
  (query.filters ?? []).forEach(([col, val]) => url.searchParams.set(col, `eq.${val}`));
  if (query.order) url.searchParams.set('order', query.order);
  if (query.limit) url.searchParams.set('limit', String(query.limit));

  const res = await fetch(url, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  if (!res.ok) throw new Error(`Supabase REST ${res.status}: ${await res.text()}`);
  return res.json();
};

// 🔗 unlisted 文章的唯一读取口子：RLS 的 public-read 策略只放行 published，
//   这个 RPC 在服务端（security definer）里单独判断 token 匹配 + status='unlisted'，
//   与 garden_posts.sql 的 get_post_by_share_token() 对应，不能直接查表拿到。
export const fetchPostByShareToken = async (
  supabaseUrl: string,
  anonKey: string,
  token: string
): Promise<PostRow | null> => {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_post_by_share_token`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error(`Supabase RPC ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
};
