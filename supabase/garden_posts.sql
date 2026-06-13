-- 🌱 Oasis 数字花园 · 文章表
-- 在 Supabase → SQL Editor 中执行一次。配合 src/hooks/useGarden.ts 使用。
-- 若不执行此脚本，应用仍可用：useGarden 会静默回落到 localStorage 本地存储。

create table if not exists public.garden_posts (
  id          text primary key,
  title       text not null default '',
  excerpt     text not null default '',
  date        text not null default '',
  created_at  bigint not null,          -- 毫秒时间戳，与前端 BlogPost.createdAt 对应
  type        text not null default 'thought',
  tags        jsonb not null default '[]'::jsonb,
  color       text not null default '#39C5BB',
  content     text not null default ''
);

-- 按时间倒序读取更快
create index if not exists garden_posts_created_at_idx
  on public.garden_posts (created_at desc);

-- 行级安全：所有访客可读；仅登录的创建者可写（与 useAuth 的 Supabase 登录一致）
alter table public.garden_posts enable row level security;

drop policy if exists "garden public read" on public.garden_posts;
create policy "garden public read"
  on public.garden_posts for select
  using (true);

drop policy if exists "garden authed write" on public.garden_posts;
create policy "garden authed write"
  on public.garden_posts for all
  to authenticated
  using (true)
  with check (true);

-- 开启实时同步（博客 ↔ 知识星图、跨标签页/设备）
alter publication supabase_realtime add table public.garden_posts;
