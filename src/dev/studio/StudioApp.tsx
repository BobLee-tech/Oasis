import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, fmtTime, type Library, type ScriptResult, type TrackDetail } from './api';
import { TrackList } from './TrackList';
import { LyricsTab } from './LyricsTab';
import { InfoTab } from './InfoTab';
import { AnnotateTab } from './AnnotateTab';
import { player, usePlayerState } from './player';
import { Button } from './ui';
import { cx } from './classes';

type Tab = 'lyrics' | 'info' | 'annotate';
const TABS: { key: Tab; label: string }[] = [
  { key: 'lyrics', label: '歌词' },
  { key: 'info', label: '资料' },
  { key: 'annotate', label: '标注' },
];

export interface StudioActions {
  /** 跑一个会写文件的操作：显示日志，完成后刷新单曲与曲库。 */
  run: (label: string, action: () => Promise<ScriptResult | unknown>) => Promise<boolean>;
  reload: () => Promise<void>;
}

const readHash = () => {
  const [id, tab] = location.hash.replace(/^#\/?/, '').split('/');
  return { id: id ?? '', tab: (TABS.some(item => item.key === tab) ? tab : 'lyrics') as Tab };
};

export function StudioApp() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [{ id, tab }, setRoute] = useState(readHash);
  const [detail, setDetail] = useState<TrackDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [log, setLog] = useState<{ label: string; ok: boolean; text: string } | null>(null);
  const [session, setSession] = useState<{ file: string; at: string }[]>([]);
  const [showSession, setShowSession] = useState(false);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((nextId: string, nextTab: Tab = tab) => {
    location.hash = `/${nextId}/${nextTab}`;
  }, [tab]);

  const loadLibrary = useCallback(async () => {
    try {
      setLibrary(await api.library());
      setSession((await api.session()).files);
    } catch (reason) {
      setError(String(reason instanceof Error ? reason.message : reason));
    }
  }, []);

  const loadDetail = useCallback(async (trackId: string) => {
    if (!trackId) return;
    try {
      setDetail(await api.track(trackId));
      setError('');
    } catch (reason) {
      setError(String(reason instanceof Error ? reason.message : reason));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([api.library(), api.session()])
      .then(([value, current]) => {
        if (!alive) return;
        setLibrary(value);
        setSession(current.files);
      })
      .catch(reason => alive && setError(String(reason instanceof Error ? reason.message : reason)));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!id && library?.rows[0]) navigate(library.rows[0].id, 'lyrics');
  }, [id, library, navigate]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    api.track(id)
      .then(value => {
        if (!alive) return;
        setDetail(value);
        setError('');
      })
      .catch(reason => alive && setError(String(reason instanceof Error ? reason.message : reason)));
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (detail?.track?.url) player.load(detail.track.url);
  }, [detail?.track?.url]);

  const reload = useCallback(async () => {
    await Promise.all([loadDetail(id), loadLibrary()]);
  }, [id, loadDetail, loadLibrary]);

  const actions = useMemo<StudioActions>(() => ({
    reload,
    run: async (label, action) => {
      setBusy(label);
      try {
        const result = await action();
        const script = result && typeof result === 'object' && 'log' in result ? (result as ScriptResult) : null;
        setLog({ label, ok: script ? script.ok : true, text: script?.log ?? '已保存' });
        await reload();
        return script ? script.ok : true;
      } catch (reason) {
        setLog({ label, ok: false, text: reason instanceof Error ? reason.message : String(reason) });
        return false;
      } finally {
        setBusy('');
      }
    },
  }), [reload]);

  const row = library?.rows.find(item => item.id === id);
  const ready = detail && detail.identity.id === id;

  return (
    <div className="flex h-dvh flex-col bg-[#FAF8F3] font-serif text-slate-800">
      <header className="flex items-center gap-4 border-b border-black/[0.07] px-4 py-2">
        <h1 className="font-serif text-lg tracking-[0.2em] text-slate-800">曲目工坊</h1>
        <span className="text-[12px] text-slate-400">只在本机开发服务器 · 写 music-data/ 与歌词源文件 · 不发布</span>
        <div className="ml-auto flex items-center gap-2">
          {busy && <span className="animate-pulse text-[12px] text-[#1B7A74]">{busy}…</span>}
          <div className="relative">
            <Button onClick={() => setShowSession(value => !value)} aria-expanded={showSession}>
              本次改动 <span className="font-mono">{session.length}</span>
            </Button>
            {showSession && (
              <div className="absolute right-0 z-30 mt-1 w-[26rem] rounded-lg border border-black/10 bg-white p-2 shadow-lg">
                {session.length ? session.map(item => (
                  <div key={item.file} className="flex justify-between gap-2 py-0.5 font-mono text-[11px]">
                    <span className="truncate">{item.file}</span>
                    <span className="shrink-0 text-slate-400">{item.at.slice(11, 19)}</span>
                  </div>
                )) : <p className="text-[12px] text-slate-400">还没写过文件</p>}
                <p className="mt-2 border-t border-black/5 pt-2 text-[11px] text-slate-500">
                  music-data/ 进 git，用 <code>git diff music-data</code> 审阅；歌词改动发布用
                  <code> npm run lyric -- --track &lt;id&gt; --publish</code>
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[19rem] shrink-0 border-r border-black/[0.07] bg-[#F4F1EA]">
          {library && <TrackList rows={library.rows} selected={id} onSelect={nextId => navigate(nextId)} />}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {error && <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-[13px] text-rose-700">{error}</div>}
          {ready && library ? (
            <>
              <TrackHeader detail={detail} />
              <div className="flex gap-1 border-b border-black/[0.07] px-4" role="tablist">
                {TABS.map(item => (
                  <button
                    key={item.key}
                    role="tab"
                    type="button"
                    aria-selected={tab === item.key}
                    onClick={() => navigate(id, item.key)}
                    className={cx(
                      '-mb-px border-b-2 px-3 py-2 text-[14px] transition-colors',
                      tab === item.key ? 'border-[#39C5BB] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {tab === 'lyrics' && <LyricsTab key={id} detail={detail} actions={actions} />}
                {tab === 'info' && <InfoTab key={id} detail={detail} actions={actions} limits={library.limits} />}
                {tab === 'annotate' && <AnnotateTab key={id} detail={detail} library={library} actions={actions} />}
              </div>
            </>
          ) : (
            <div className="p-8 text-slate-400">{row ? `载入 ${row.title}…` : '选择一首歌'}</div>
          )}
        </main>
      </div>

      {log && (
        <div className={cx('border-t px-4 py-2', log.ok ? 'border-[#39C5BB]/30 bg-[#39C5BB]/[0.06]' : 'border-rose-200 bg-rose-50')}>
          <div className="flex items-center justify-between">
            <span className={cx('text-[13px]', log.ok ? 'text-[#1B7A74]' : 'text-rose-700')}>
              {log.ok ? '✓' : '✗'} {log.label}
            </span>
            <button type="button" className="text-[12px] text-slate-400 hover:text-slate-600" onClick={() => setLog(null)}>收起</button>
          </div>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-600">{log.text}</pre>
        </div>
      )}
    </div>
  );
}

function TrackHeader({ detail }: { detail: TrackDetail }) {
  const { identity, merged } = detail;
  const state = usePlayerState();
  const duration = identity.tags.durationMs;
  return (
    <div className="flex items-center gap-4 border-b border-black/[0.07] px-4 py-3">
      <button
        type="button"
        onClick={player.toggle}
        aria-label={state.playing ? '暂停' : '播放'}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1B7A74] text-white hover:bg-[#16625d]"
      >
        {state.playing ? (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3 1.5v11l9.5-5.5z" fill="currentColor" /></svg>
        )}
      </button>
      <div className="min-w-0">
        <div className="flex items-baseline gap-3">
          <h2 className="truncate font-[family-name:var(--font-ja)] text-xl text-slate-900">{identity.display.title}</h2>
          {merged.titleAlt && <span className="truncate text-[14px] text-slate-500">{merged.titleAlt}</span>}
        </div>
        <p className="text-[12px] text-slate-500">
          {identity.display.artist}
          {merged.album && ` · ${merged.album}`}
          {merged.year && ` · ${merged.year}`}
          {merged.trackNo && ` · No.${merged.trackNo}`}
          <span className="ml-2 font-mono text-slate-400">{identity.id}</span>
        </p>
      </div>
      <div className="ml-auto flex min-w-[16rem] flex-1 items-center gap-3">
        <span className="font-mono text-[12px] text-slate-500">{fmtTime(state.timeMs)}</span>
        <input
          type="range"
          min={0}
          max={duration}
          step={100}
          value={Math.min(state.timeMs, duration)}
          onChange={event => player.seek(Number(event.target.value))}
          aria-label="进度"
          className="flex-1 accent-[#39C5BB]"
        />
        <span className="font-mono text-[12px] text-slate-400">{fmtTime(duration)}</span>
      </div>
    </div>
  );
}
