-- 🎧 Oasis · 曲目「它让我怎样」（felt）表
-- 在 Supabase → SQL Editor 中执行一次。配合 src/lib/trackFelt.ts（Miku 读）与曲目工坊标注页（写）使用。
-- 设计见 docs/song-emotion-design.md §6 方案 A：feels 是歌表达的（进 git、公开），felt 是它让站主怎样（私密）。
-- 档案与生成文件都是公开的，所以 felt 只存在这里，且只有园丁本人读得到——访客连 select 都拿不到行。
-- 若不执行此脚本：工坊里这一栏会提示表不存在，Miku 照常工作，只是没有 felt。

create table if not exists public.track_felt (
  track_id   text primary key,                    -- 与 PLAYLIST / music-data/tracks/<id>.json 的 id 一致
  felt       jsonb not null default '{}'::jsonb,  -- { "peaceful": 2, "sad": 1 }：十维里的若干维，0–3
  updated_at timestamptz not null default now()
);

-- 🛡️ 形状收口：必须是对象、体积很小（十个键 × 0–3 足够），挡住往里塞大段文字
do $$ begin
  alter table public.track_felt
    add constraint track_felt_shape check (jsonb_typeof(felt) = 'object' and pg_column_size(felt) <= 512);
exception when duplicate_object then null;
end $$;

-- 🔑 唯一园丁判定：与 garden_posts.sql 里那份定义完全一致（create or replace 幂等）。
create or replace function public.is_gardener()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'lb15058460816@gmail.com';
$$;

alter table public.track_felt enable row level security;

-- 读写全部只归园丁：这张表没有公开读
drop policy if exists "felt gardener all" on public.track_felt;
create policy "felt gardener all"
  on public.track_felt for all
  to authenticated
  using (public.is_gardener())
  with check (public.is_gardener());
