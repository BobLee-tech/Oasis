// 📰 单篇文章分享页：/p/:id → 本文件（见 vercel.json 的 rewrite）。
//   hash 路由 #/garden/:id 的 fragment 从不会被发到服务器，爬虫与分享卡拿到的
//   永远只是首页那一份通用 meta —— 这里补一条「真实存在」的服务端地址：
//   完整渲染 meta / OG / JSON-LD / 纯文本正文（服务端爬虫可读），
//   真人访客则由 head 里的一行脚本立即换乘回 SPA 的 #/garden/:id 阅读舱。
import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// 极简 Markdown → 纯文本段落：爬虫要的是可索引的文字，不是样式，
// 与阅读舱共享 Markdown 组件在这里没有意义（那套依赖太重，edge 函数不需要）。
const mdToParagraphs = (md: string): string[] =>
  (md ?? '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~>]/g, '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

export default async function handler(req: Request): Promise<Response> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const origin = new URL(req.url).origin;
  const id = new URL(req.url).searchParams.get('id') ?? '';

  if (!supabaseUrl || !supabaseAnonKey || !id) {
    return new Response('Not found', { status: 404 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: p } = await supabase
    .from('garden_posts')
    .select('id,title,excerpt,content,created_at,color,tags')
    .eq('id', id)
    .single();

  if (!p) return new Response('Not found', { status: 404 });

  const title = escapeHtml(p.title ?? 'Oasis');
  const description = escapeHtml((p.excerpt ?? '').trim() || '一处温柔疗愈、带着禅意的数字花园。');
  const pubDate = new Date(Number(p.created_at)).toISOString();
  const readerUrl = `/#/garden/${encodeURIComponent(p.id)}`;
  const canonical = `${origin}/p/${encodeURIComponent(p.id)}`;
  const ogImage = `${origin}/api/og?id=${encodeURIComponent(p.id)}`;
  const bodyHtml = mdToParagraphs(p.content).map((para) => `<p>${escapeHtml(para)}</p>`).join('\n');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: p.title,
    description: p.excerpt ?? undefined,
    datePublished: pubDate,
    image: ogImage,
    author: { '@type': 'Person', name: 'Bob Lee' },
    mainEntityOfPage: canonical,
  };

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} · Oasis</title>
  <meta name="description" content="${description}" />
  <meta name="author" content="Bob Lee" />
  <link rel="canonical" href="${canonical}" />

  <meta property="og:type" content="article" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:locale" content="zh_CN" />
  <meta property="article:published_time" content="${pubDate}" />
  ${(p.tags ?? []).map((t: string) => `<meta property="article:tag" content="${escapeHtml(t)}" />`).join('\n  ')}

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${ogImage}" />

  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>

  <!-- 真人访客：立即换乘回 SPA 的阅读舱；爬虫/分享卡从不执行这段脚本，只读上面的静态 meta -->
  <script>location.replace(${JSON.stringify(readerUrl)});</script>
</head>
<body style="background:#FAF8F3;color:#334155;font-family:serif;max-width:640px;margin:2rem auto;padding:0 1.5rem;line-height:1.9;">
  <article>
    <h1>${title}</h1>
    ${bodyHtml}
  </article>
  <p><a href="${readerUrl}">在 Oasis 阅读舱内继续 →</a></p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400',
    },
  });
}
