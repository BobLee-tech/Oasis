// 「它让你怎样」（felt，docs/song-emotion-design.md §6 方案 A）：与上面的情绪花分开——那朵是歌表达的（进档案、公开），
// 这朵是它让你怎样（只存 Supabase 的 track_felt 表，仅你本人可读）。悲伤的歌可以让你平静，两朵花不必一样。
// 点花瓣就自动存到云端，不走「保存本曲标注」，也不进 music-data。
// 工坊与主站同源（同一个开发服务器端口），所以主站里以站主身份登录过，这里就带着那个会话。
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getTrackFelt, loadTrackFelt, saveTrackFelt } from '../../lib/trackFelt';
import type { Feels } from './api';
import { EmotionFlower } from './EmotionFlower';
import { Section } from './ui';

type Status = { kind: 'loading' } | { kind: 'signed-out' } | { kind: 'ready'; note?: string } | { kind: 'saving' } | { kind: 'error'; message: string };

const SAVE_DELAY_MS = 700;

export function FeltPanel({ trackId }: { trackId: string }) {
  const [felt, setFelt] = useState<Feels | undefined>(undefined);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 3000));
      const session = await Promise.race([supabase.auth.getSession(), timeout]);
      if (!alive) return;
      if (!session?.data.session) {
        setStatus({ kind: 'signed-out' });
        return;
      }
      await loadTrackFelt(true);
      if (!alive) return;
      setFelt(getTrackFelt(trackId));
      setStatus({ kind: 'ready' });
    })();
    return () => {
      alive = false;
    };
  }, [trackId]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const change = (next: Feels | undefined) => {
    setFelt(next);
    setStatus({ kind: 'saving' });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void saveTrackFelt(trackId, next).then(error => {
        setStatus(error ? { kind: 'error', message: error } : { kind: 'ready', note: next ? '已存到云端' : '已清空' });
      });
    }, SAVE_DELAY_MS);
  };

  const aside = {
    loading: <span className="text-[11px] text-slate-400">读取中…</span>,
    'signed-out': <span className="text-[11px] text-rose-500">没登录</span>,
    ready: <span className="text-[11px] text-slate-400">{status.kind === 'ready' && status.note ? status.note : '点了就存'}</span>,
    saving: <span className="text-[11px] text-slate-400">保存中…</span>,
    error: <span className="text-[11px] text-rose-500">没存上</span>,
  }[status.kind];

  return (
    <Section title="它让你怎样（只给自己）" aside={aside}>
      <p className="mb-3 text-[12px] text-slate-500">
        上面那朵是这首歌表达的；这朵是它让你怎样——悲伤的歌也可以让人安静下来。只存在 Supabase，访客和公开档案都看不到。
        Miku 在站主模式下读它：偶尔提一句「你说过……」，深夜你连着听低落的歌时，她也按这朵花判断这首是不是在把你往下拽。
      </p>
      {status.kind === 'signed-out' ? (
        <p className="text-[13px] text-slate-500">先在主站（同一个开发服务器端口）以站主身份登录，再回来刷新这一页。</p>
      ) : (
        <>
          <EmotionFlower value={felt} onChange={change} className="mx-auto w-56" />
          {status.kind === 'error' && <p className="mt-2 text-center text-[12px] text-rose-500">{status.message}</p>}
        </>
      )}
    </Section>
  );
}
