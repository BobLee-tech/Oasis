// Wikipedia（MediaWiki API，ja / zh）：只作为你写 intro / story 的参考，不直接入档案。
// 需要引用时保留出处链接（CC BY-SA）。
import { fetchJson } from './http.mjs';

export const searchWikipedia = async (query, lang = 'ja') => {
  if (!['ja', 'zh', 'en'].includes(lang)) throw new Error('只支持 ja / zh / en');
  const api = `https://${lang}.wikipedia.org/w/api.php`;
  const found = await fetchJson(`${api}?${new URLSearchParams({
    action: 'query', list: 'search', srsearch: query, srlimit: '3', format: 'json',
  })}`);
  const titles = (found?.query?.search ?? []).map(item => item.title);
  if (!titles.length) return [];
  const pages = await fetchJson(`${api}?${new URLSearchParams({
    action: 'query', prop: 'extracts', exintro: '1', explaintext: '1', redirects: '1',
    format: 'json', titles: titles.join('|'), ...(lang === 'zh' ? { variant: 'zh-cn' } : {}),
  })}`);
  const byTitle = new Map(Object.values(pages?.query?.pages ?? {}).map(page => [page.title, page]));
  return titles.map(title => byTitle.get(title)).filter(Boolean).map(page => ({
    title: page.title,
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    license: 'CC BY-SA 4.0',
    text: String(page.extract ?? '').trim(),
  }));
};
