// 🎧 曲目的「它让我怎样」（felt，docs/song-emotion-design.md §6 方案 A）：站主私密，存 Supabase 的 track_felt 表。
//   feels 是歌表达的（进 git、公开 chunk），felt 是它让站主怎样——与 notePrivate 同级，永不进档案与生成文件。
//   RLS 只放园丁本人读写（supabase/track_felt.sql），访客的请求只会拿到空表；这里也只在站主模式下才去拉。
//
//   读：Miku 在站主模式下拉一次（loadTrackFelt），之后同步取（getTrackFelt）；离开站主模式就清掉内存里的副本。
//   写：曲目工坊标注页（saveTrackFelt）。表没建也不报错：读回落为空，写返回原因。
import { normalizeFeels } from '../../scripts/lib/mood-core.mjs';
import type { Feels } from './trackMood';
import { supabase } from './supabase';

const TABLE = 'track_felt';
const STALE_MS = 10 * 60_000;
const TIMEOUT_MS = 5000;

let cache: Map<string, Feels> | null = null;
let loadedAt = 0;
let inflight: Promise<Map<string, Feels>> | null = null;

const withTimeout = <T,>(promise: PromiseLike<T>, ms = TIMEOUT_MS) =>
  Promise.race([Promise.resolve(promise), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

/** 拉全表（站主至多一百来行）。force 或超过 10 分钟才重拉；失败时保留旧副本。 */
export const loadTrackFelt = (force = false): Promise<Map<string, Feels>> => {
  if (inflight) return inflight;
  if (cache && !force && Date.now() - loadedAt < STALE_MS) return Promise.resolve(cache);
  inflight = (async () => {
    try {
      const { data, error } = await withTimeout(supabase.from(TABLE).select('track_id, felt'));
      if (error) throw error;
      const next = new Map<string, Feels>();
      for (const row of (data ?? []) as { track_id: string; felt: unknown }[]) {
        const felt = normalizeFeels(row.felt);
        if (felt) next.set(row.track_id, felt);
      }
      cache = next;
      loadedAt = Date.now();
    } catch {
      // 表没建、没登录、断网：静默，Miku 照常工作，只是没有 felt
      cache ??= new Map();
    } finally {
      inflight = null;
    }
    return cache;
  })();
  return inflight;
};

/** 同步取（没加载或不是站主时为 undefined）。 */
export const getTrackFelt = (trackId: string | undefined): Feels | undefined =>
  trackId ? cache?.get(trackId) : undefined;

/** 离开站主模式（登出、访客预览）时清掉内存副本。 */
export const forgetTrackFelt = () => {
  cache = null;
  loadedAt = 0;
};

/** 写一首：空向量 = 删掉这一行。返回 null 表示成功，否则是给人看的原因。 */
export const saveTrackFelt = async (trackId: string, felt: Feels | undefined): Promise<string | null> => {
  const clean = normalizeFeels(felt);
  try {
    const { error } = clean
      ? await withTimeout(supabase.from(TABLE).upsert({ track_id: trackId, felt: clean, updated_at: new Date().toISOString() }))
      : await withTimeout(supabase.from(TABLE).delete().eq('track_id', trackId));
    if (error) return describeError(error);
  } catch (error) {
    return error instanceof Error && error.message === 'timeout' ? '连不上 Supabase（超时）' : String(error);
  }
  if (cache) {
    if (clean) cache.set(trackId, clean);
    else cache.delete(trackId);
  }
  return null;
};

const describeError = (error: { code?: string; message: string }) => {
  // 42P01：表不存在；42501 / PGRST301：RLS 拒绝（没登录或不是园丁）
  if (error.code === '42P01' || /does not exist|schema cache/i.test(error.message)) return '还没建 track_felt 表（执行 supabase/track_felt.sql）';
  if (error.code === '42501' || /row-level security|permission/i.test(error.message)) return '没有权限：先在主站以站主身份登录';
  return error.message;
};
