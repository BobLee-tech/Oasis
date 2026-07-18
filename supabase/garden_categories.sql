-- 🏷️ Oasis 数字花园 · 自定义分类表
-- 在 Supabase → SQL Editor 中执行一次。配合 src/hooks/useCategories.tsx 使用。
-- 若不执行此脚本，应用仍可用：自定义分类会静默回落到 localStorage 本地存储。

create table if not exists public.garden_categories (
  id     text primary key,             -- 稳定标识，存进 garden_posts.type
  label  text not null default '',     -- 英文名
  zh     text not null default '',     -- 中文名
  color  text not null default '#39C5BB',
  icon   text not null default 'pen'   -- 前端 ICON 集合里的 key
);

alter table public.garden_categories enable row level security;

-- 🔑 唯一园丁判定：与 garden_posts.sql 里那份定义完全一致（create or replace 幂等，
--   两份脚本不管谁先跑都行）。仅靠「to authenticated」不够——项目若没关掉公开注册，
--   任何访客自己注册就能拿到 session 改写全部分类。这里是纵深防御第二层，
--   第一层务必去 Supabase Dashboard → Authentication → Settings 关掉 "Enable new user signups"。
create or replace function public.is_gardener()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'lb15058460816@gmail.com';
$$;

drop policy if exists "categories public read" on public.garden_categories;
create policy "categories public read"
  on public.garden_categories for select
  using (true);

drop policy if exists "categories authed write" on public.garden_categories;
create policy "categories authed write"
  on public.garden_categories for all
  to authenticated
  using (public.is_gardener())
  with check (public.is_gardener());
