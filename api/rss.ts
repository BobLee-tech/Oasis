// 📡 RSS 订阅：从 Supabase garden_posts 拉取最新文章，实时生成标准 RSS 2.0 feed。
//   Vercel 按文件路由自动挂载为 /api/rss，vercel.json 里把 /rss.xml 重写到这里，
//   访问 https://<domain>/rss.xml 即可在任意阅读器订阅。
import { fetchGardenPosts } from './_lib/supabaseRest';

export const config = { runtime: 'edge' };

const SITE_TITLE = 'Oasis · Bob Lee 的小站';
const SITE_DESCRIPTION = '一处温柔疗愈、带着禅意的数字花园。记录学习、成长与微小的美好。';

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

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
      select: 'id,title,excerpt,created_at,tags',
      order: 'created_at.desc',
      limit: 30,
    });
  } catch (e) {
    return new Response(`Failed to load posts: ${(e as Error).message}`, { status: 500 });
  }

  const items = (data ?? []).map((p) => {
    // 指向 /p/:id 而非 hash 路由：阅读器/爬虫能拿到真实渲染的 meta 与正文，而非空壳 SPA 首页
    const link = `${origin}/p/${p.id}`;
    const pubDate = new Date(Number(p.created_at)).toUTCString();
    return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="false">${p.id}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(p.excerpt ?? '')}</description>
      ${(p.tags ?? []).map((t: string) => `<category>${escapeXml(t)}</category>`).join('\n      ')}
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(SITE_TITLE)}</title>
    <link>${origin}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>zh-CN</language>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=1800',
    },
  });
}
