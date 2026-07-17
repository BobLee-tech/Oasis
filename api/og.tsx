// 🖼️ 分享卡：/api/og?id=<postId> → 1200×630 PNG，供 api/post.ts 的 og:image / twitter:image 引用。
//   标题多为中文，@vercel/og（satori）默认字体不含中文字形，会渲染成方块——
//   这里用 Google Fonts 的 `text=` 子集化接口按需只取「本次要画的那几个字」，
//   体积从完整字库的几十 MB 降到几 KB，且天然覆盖任意标题、无需在仓库里塞字体文件。
//   UA 伪装成不支持 woff2 的旧浏览器，让 Google 回落到 satori 能直接解析的 TTF。
import { ImageResponse } from '@vercel/og';
import { currentSolarTerm } from '../src/lib/solarTerms';
import { fetchGardenPosts } from './_lib/supabaseRest';

export const config = { runtime: 'edge' };

const OLD_UA =
  'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.34 (KHTML, like Gecko) PhantomJS/1.9.8 Safari/534.34';

async function loadCjkFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const unique = Array.from(new Set(text.split(''))).join('');
    const cssRes = await fetch(
      `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@700&text=${encodeURIComponent(unique)}`,
      { headers: { 'User-Agent': OLD_UA } }
    );
    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    const match = css.match(/src: url\(([^)]+)\)/);
    if (!match) return null;
    const fontRes = await fetch(match[1]);
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n).trim() + '…' : s);

export default async function handler(req: Request) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const id = new URL(req.url).searchParams.get('id') ?? '';

  const SITE = 'OASIS · Bob Lee 的小站';
  let title = 'Oasis';
  let color = '#39C5BB';
  let dateLabel = '';

  if (supabaseUrl && supabaseAnonKey && id) {
    const rows = await fetchGardenPosts(supabaseUrl, supabaseAnonKey, { select: 'title,color,created_at', eq: ['id', id] }).catch(() => []);
    const p = rows[0];
    if (p) {
      title = p.title ?? title;
      color = p.color ?? color;
      const d = new Date(Number(p.created_at));
      dateLabel = `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${currentSolarTerm(d).name}`;
    }
  }

  title = truncate(title, 42);
  const fontData = await loadCjkFont(SITE + title + dateLabel + '花园');

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', backgroundColor: '#FAF8F3',
          padding: '64px 80px', fontFamily: fontData ? 'Noto Sans SC' : undefined,
        }}
      >
        <div style={{ display: 'flex', fontSize: 22, letterSpacing: 4, color: '#94a3b8' }}>{SITE}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={{ display: 'flex', fontSize: 60, color: '#334155', lineHeight: 1.35, maxWidth: 980 }}>
            {title}
          </div>
          <svg width="140" height="14" viewBox="0 0 140 14">
            <path d="M0 7 Q17 0 35 7 T70 7 T105 7 T140 7" fill="none" stroke={color} strokeWidth="2" opacity="0.75" />
          </svg>
        </div>

        <div style={{ display: 'flex', fontSize: 22, color: '#94a3b8', letterSpacing: 2 }}>{dateLabel}</div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: fontData ? [{ name: 'Noto Sans SC', data: fontData, weight: 700, style: 'normal' }] : undefined,
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800' },
    }
  );
}
