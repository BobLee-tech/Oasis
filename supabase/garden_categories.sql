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

drop policy if exists "categories public read" on public.garden_categories;
create policy "categories public read"
  on public.garden_categories for select
  using (true);

drop policy if exists "categories authed write" on public.garden_categories;
create policy "categories authed write"
  on public.garden_categories for all
  to authenticated
  using (true)
  with check (true);
