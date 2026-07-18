// 📍 sitemap.xml：首页 + 全部已发布文章的 /p/:slug，供搜索引擎发现与收录。
//   Vercel 按文件路由自动挂载为 /api/sitemap，vercel.json 把 /sitemap.xml 重写到这里。
//   与 api/rss.ts 同构：anon key 查询，RLS 挡掉了 draft，但 unlisted 对匿名可读（分享链接要能打开），
//   所以这里必须显式再筛 status=published，否则 unlisted 会漏进搜索引擎收录。
import { fetchGardenPosts } from './_lib/supabaseRest';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const origin = new URL(req.url).origin;

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response('Supabase credentials missing', { status: 500 });
  }

  let data: any[];
  try {
    data = await fetchGardenPosts(supabaseUrl, supabaseAnonKey, {
      select: 'id,slug,created_at,updated_at',
      // ⚠️ RLS 已经把 draft 挡在匿名读取之外，但 unlisted 现在也对匿名可读（否则分享链接打不开）——
      //   这里必须显式再筛一道 published，否则「不进搜索引擎收录」这个 unlisted 的核心承诺会被打破。
      filters: [['status', 'published']],
      order: 'created_at.desc',
    });
  } catch (e) {
    return new Response(`Failed to load posts: ${(e as Error).message}`, { status: 500 });
  }

  const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  const urls = [
    `    <url><loc>${origin}/</loc></url>`,
    ...(data ?? []).map((p) => {
      const lastmod = isoDate(Number(p.updated_at) || Number(p.created_at));
      return `    <url><loc>${origin}/p/${encodeURIComponent(p.slug || p.id)}</loc><lastmod>${lastmod}</lastmod></url>`;
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
