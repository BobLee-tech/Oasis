// 任意 URL：抓一次 → 去掉脚本、样式、导航、页脚 → 只留正文文本。
// 你在工坊里框选需要的段落，再指定填进哪个字段；只保存框选的部分（docs/music-design.md A5）。
import { fetchText } from './http.mjs';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = text => text
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
  .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);

/** HTML → 正文纯文本（保留段落与换行，歌词页的 <br> 逐行）。 */
export const htmlToText = html => {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
  let body = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|template|iframe|nav|header|footer|aside|form|button|select)\b[\s\S]*?<\/\1>/gi, '');
  // 有 <main> / <article> 就只要它
  const main = body.match(/<(main|article)\b[\s\S]*?<\/\1>/i)?.[0];
  if (main && main.length > 400) body = main;
  const text = decode(body
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|dd|dt|section|blockquote|pre)>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t ]+/g, ' ')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text: text.slice(0, 60_000) };
};

export const fetchPageText = async url => ({ url, ...htmlToText(await fetchText(url)) });
