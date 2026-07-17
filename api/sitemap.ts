// 📍 sitemap.xml：首页 + 全部已发布文章的 /p/:id，供搜索引擎发现与收录。
//   Vercel 按文件路由自动挂载为 /api/sitemap，vercel.json 把 /sitemap.xml 重写到这里。
//   与 api/rss.ts 同构：anon key 查询，RLS 已把草稿挡在外面，这里无需再筛 status。
import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const origin = new URL(req.url).origin;

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response('Supabase credentials missing', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase
    .from('garden_posts')
    .select('id,created_at,updated_at')
    .order('created_at', { ascending: false });

  if (error) {
    return new Response(`Failed to load posts: ${error.message}`, { status: 500 });
  }

  const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  const urls = [
    `    <url><loc>${origin}/</loc></url>`,
    ...(data ?? []).map((p) => {
      const lastmod = isoDate(Number(p.updated_at) || Number(p.created_at));
      return `    <url><loc>${origin}/p/${p.id}</loc><lastmod>${lastmod}</lastmod></url>`;
    }),
  ].join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=1800',
    },
  });
}
