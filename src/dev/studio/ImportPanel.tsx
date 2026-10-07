// 网页导入（docs/music-design.md A5）：只在你点「查」时抓一次；只保存你框选的那部分，记下 URL 与时间。
import { useState, type MouseEvent } from 'react';
import { api, type Credits, type TrackDetail } from './api';
import type { StudioActions } from './StudioApp';
import { Button, Section } from './ui';
import { cx, inputClass } from './classes';

type Kind = 'vocadb' | 'wikipedia' | 'musicbrainz' | 'url' | 'paste';
const KINDS: { key: Kind; label: string }[] = [
  { key: 'vocadb', label: 'VocaDB' },
  { key: 'wikipedia', label: 'Wikipedia' },
  { key: 'musicbrainz', label: 'MusicBrainz' },
  { key: 'url', label: '网址' },
  { key: 'paste', label: '粘贴' },
];

interface VocadbResult {
  id: number;
  url: string;
  name: string;
  songType: string;
  publishDate?: string;
  credits: Credits;
  tags: string[];
  lyrics: { kind: string; language: string; source?: string; url?: string; text: string }[];
}
interface WikiResult { title: string; url: string; license: string; text: string }
interface MbResult { url: string; title: string; released?: string; artist: string; credits: Credits }
interface PageResult { url: string; title: string; text: string }

const ROLE_PATTERNS: [keyof Credits, RegExp][] = [
  ['lyricist', /^(?:作\s*[词詞]|[词詞]|lyrics?(?:\s+by)?)$/i],
  ['composer', /^(?:作\s*曲|曲|music(?:\s+by)?|composer?)$/i],
  ['arranger', /^(?:[编編]\s*曲|arrange(?:d|r|ment)?(?:\s+by)?)$/i],
  ['vocal', /^(?:演唱|歌|vocals?|唄)$/i],
];
/** 框选的「作詞：xxx」几行 → credits */
const parseCredits = (text: string): Credits => {
  const credits: Credits = {};
  for (const line of text.split(/\n/)) {
    const match = line.match(/^\s*([^:：]{1,16}?)\s*[:：]\s*(.+)$/);
    if (!match) continue;
    const role = ROLE_PATTERNS.find(([, pattern]) => pattern.test(match[1].trim()))?.[0];
    if (!role) continue;
    credits[role] = match[2].split(/\s*[/／、,，]\s*/).map(name => name.trim()).filter(Boolean);
  }
  return credits;
};

const creditsText = (credits: Credits) =>
  Object.entries(credits).map(([role, names]) => `${{ lyricist: '作词', composer: '作曲', arranger: '编曲', vocal: '演唱' }[role] ?? role} ${names?.join(' / ')}`).join(' · ');

// 按钮按下时别让焦点吃掉页面上的选区
const keepSelection = (event: MouseEvent) => event.preventDefault();
const selectedText = () => window.getSelection()?.toString().trim() ?? '';

export function ImportPanel({ detail, actions }: { detail: TrackDetail; actions: StudioActions }) {
  const { identity } = detail;
  const id = identity.id;
  const [kind, setKind] = useState<Kind>(identity.category === 'Miku' ? 'vocadb' : 'wikipedia');
  const [queries, setQueries] = useState<Record<Kind, string>>({
    vocadb: identity.display.title,
    wikipedia: `${identity.display.title} ${identity.display.artist}`,
    musicbrainz: identity.tags.isrc ?? '',
    url: '',
    paste: '',
  });
  const [lang, setLang] = useState('ja');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<{ kind: Kind; items: unknown[] } | null>(null);

  const search = async () => {
    if (kind === 'paste') return;
    setLoading(true);
    setError('');
    try {
      const { results: items } = await api.importSearch<unknown>(kind, queries[kind], lang);
      setResults({ kind, items });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  const saveSelection = (field: 'lyrics' | 'ref' | 'credits', fallback: string, meta: { url: string; source: string; title?: string; license?: string }) => {
    const text = selectedText() || fallback;
    if (!text) return;
    if (field === 'credits') {
      const credits = parseCredits(text);
      if (!Object.keys(credits).length) {
        setError('选区里没认出「作詞：xxx」这样的署名行');
        return;
      }
      if (!confirm(`采用这份署名？\n${creditsText(credits)}`)) return;
      void actions.run('保存网页署名', () => api.importSave(id, { field, credits, ...meta }));
      return;
    }
    void actions.run(field === 'lyrics' ? '保存为打点用的歌词文本' : '保存为参考资料', () => api.importSave(id, { field, text, ...meta }));
  };

  const selectionActions = ({ fallback, meta, allowLyrics = true }: { fallback: string; meta: { url: string; source: string; title?: string; license?: string }; allowLyrics?: boolean }) => (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <span className="self-center text-[11px] text-slate-400">框选一段（不选 = 全部）→</span>
      {allowLyrics && <Button onMouseDown={keepSelection} onClick={() => saveSelection('lyrics', fallback, meta)}>歌词</Button>}
      <Button onMouseDown={keepSelection} onClick={() => saveSelection('credits', fallback, meta)}>署名</Button>
      <Button onMouseDown={keepSelection} onClick={() => saveSelection('ref', fallback, meta)}>参考资料</Button>
    </div>
  );

  return (
    <Section title="网页导入" className="self-start xl:sticky xl:top-4">
      <div className="mb-3 flex gap-1" role="tablist">
        {KINDS.map(item => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={kind === item.key}
            onClick={() => setKind(item.key)}
            className={cx(
              'rounded-full px-2.5 py-0.5 text-[12px] transition-colors',
              kind === item.key ? 'bg-[#1B7A74] text-white' : 'text-slate-500 hover:bg-black/5',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {kind === 'paste' ? (
        <div>
          <textarea
            className={cx(inputClass, 'h-48 font-[family-name:var(--font-ja)]')}
            value={queries.paste}
            onChange={event => setQueries(current => ({ ...current, paste: event.target.value }))}
            placeholder="永远可用的兜底：把歌词或资料直接贴进来"
          />
          {selectionActions({ fallback: queries.paste, meta: { url: '', source: 'paste' } })}
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={event => {
            event.preventDefault();
            void search();
          }}
        >
          <input
            className={inputClass}
            value={queries[kind]}
            placeholder={kind === 'url' ? 'https://…（只抓这一页，不跟链接）' : kind === 'musicbrainz' ? 'ISRC' : '检索词'}
            onChange={event => setQueries(current => ({ ...current, [kind]: event.target.value }))}
          />
          {kind === 'wikipedia' && (
            <select className={cx(inputClass, 'w-20')} value={lang} onChange={event => setLang(event.target.value)}>
              <option value="ja">ja</option>
              <option value="zh">zh</option>
              <option value="en">en</option>
            </select>
          )}
          <Button tone="primary" type="submit" disabled={loading || !queries[kind].trim()}>{loading ? '查询中…' : '查'}</Button>
        </form>
      )}
      {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}

      {results && results.kind === kind && kind !== 'paste' && (
        <div className="mt-3 max-h-[70vh] space-y-3 overflow-y-auto">
          {!results.items.length && <p className="text-[13px] text-slate-400">没有结果</p>}

          {kind === 'vocadb' && (results.items as VocadbResult[]).map(song => (
            <article key={song.id} className="rounded-lg border border-black/[0.06] p-3">
              <header className="flex items-baseline justify-between gap-2">
                <a href={song.url} target="_blank" rel="noreferrer" className="font-[family-name:var(--font-ja)] text-[14px] text-slate-800 hover:underline">{song.name}</a>
                <span className="text-[11px] text-slate-400">{song.songType} · {song.publishDate}</span>
              </header>
              {Object.keys(song.credits).length > 0 && (
                <div className="mt-1 flex items-center gap-2 text-[12px] text-slate-600">
                  {creditsText(song.credits)}
                  <Button className="ml-auto" onClick={() => actions.run('采用 VocaDB 署名', () => api.importSave(id, { field: 'credits', credits: song.credits, url: song.url, source: 'vocadb' }))}>采用</Button>
                </div>
              )}
              {song.tags.length > 0 && <p className="mt-1 text-[11px] text-slate-400">{song.tags.join(' · ')}</p>}
              {song.lyrics.map(lyric => (
                <details key={`${lyric.kind}-${lyric.language}`} className="mt-2">
                  <summary className="cursor-pointer text-[12px] text-slate-600">{lyric.kind} · {lyric.language} {lyric.source && `· ${lyric.source}`}</summary>
                  <pre className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap font-[family-name:var(--font-ja)] text-[13px] leading-relaxed text-slate-700">{lyric.text}</pre>
                  {selectionActions({ fallback: lyric.text, meta: { url: song.url, source: 'vocadb', title: `${song.name}（${lyric.kind}）` } })}
                </details>
              ))}
            </article>
          ))}

          {kind === 'wikipedia' && (results.items as WikiResult[]).map(page => (
            <article key={page.url} className="rounded-lg border border-black/[0.06] p-3">
              <header className="flex items-baseline justify-between gap-2">
                <a href={page.url} target="_blank" rel="noreferrer" className="text-[14px] text-slate-800 hover:underline">{page.title}</a>
                <span className="text-[10px] text-slate-400">{page.license}</span>
              </header>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{page.text}</p>
              {selectionActions({ fallback: page.text, meta: { url: page.url, source: 'wikipedia', title: page.title, license: page.license }, allowLyrics: false })}
            </article>
          ))}

          {kind === 'musicbrainz' && (results.items as MbResult[]).map(hit => (
            <article key={hit.url} className="rounded-lg border border-black/[0.06] p-3 text-[13px]">
              <a href={hit.url} target="_blank" rel="noreferrer" className="text-slate-800 hover:underline">{hit.title} — {hit.artist}</a>
              <p className="text-[12px] text-slate-500">{hit.released}</p>
              {Object.keys(hit.credits).length ? (
                <div className="mt-1 flex items-center gap-2 text-[12px] text-slate-600">
                  {creditsText(hit.credits)}
                  <Button className="ml-auto" onClick={() => actions.run('采用 MusicBrainz 署名', () => api.importSave(id, { field: 'credits', credits: hit.credits, url: hit.url, source: 'musicbrainz' }))}>采用</Button>
                </div>
              ) : <p className="text-[12px] text-slate-400">这条录音没有挂词曲署名</p>}
            </article>
          ))}

          {kind === 'url' && (results.items as PageResult[]).map(page => (
            <article key={page.url} className="rounded-lg border border-black/[0.06] p-3">
              <header className="text-[14px] text-slate-800">{page.title || page.url}</header>
              <pre className="mt-1 max-h-[55vh] overflow-y-auto whitespace-pre-wrap font-[family-name:var(--font-ja)] text-[13px] leading-relaxed text-slate-700">{page.text}</pre>
              {selectionActions({ fallback: '', meta: { url: page.url, source: 'web', title: page.title } })}
            </article>
          ))}
        </div>
      )}
      {detail.imported && (
        <p className="mt-3 border-t border-black/5 pt-2 text-[12px] text-slate-500">
          已存打点用文本：{detail.imported.source} · {detail.imported.fetchedAt} · {[...detail.imported.text].length} 字 —— 到「歌词」页签点「边听边打点」使用
        </p>
      )}
    </Section>
  );
}
