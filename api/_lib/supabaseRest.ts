// 🪶 边缘函数专用的极简 Supabase 只读客户端：直接 fetch PostgREST 端点，不引 @supabase/supabase-js。
//   该包会连带打包 @supabase/realtime-js，而后者依赖 Node-only 的 `ws`，
//   Vercel Edge Runtime 静态打包分析时会把整条引用链判定为
//   "referencing unsupported modules" 并直接拒绝部署。
//   这几个边缘函数都只做只读查询，一个 fetch 封装就够，行为（含 RLS）与官方客户端完全一致——
//   同一把 anon key、同一张表，草稿依旧只对已登录会话可见。
export interface RestQuery {
  select: string;
  eq?: [string, string];
  order?: string;   // 如 'created_at.desc'
  limit?: number;
}

export const fetchGardenPosts = async (
  supabaseUrl: string,
  anonKey: string,
  query: RestQuery
): Promise<any[]> => {
  const url = new URL(`${supabaseUrl}/rest/v1/garden_posts`);
  url.searchParams.set('select', query.select);
  if (query.eq) url.searchParams.set(query.eq[0], `eq.${query.eq[1]}`);
  if (query.order) url.searchParams.set('order', query.order);
  if (query.limit) url.searchParams.set('limit', String(query.limit));

  const res = await fetch(url, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  if (!res.ok) throw new Error(`Supabase REST ${res.status}: ${await res.text()}`);
  return res.json();
};
