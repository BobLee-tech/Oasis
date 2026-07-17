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
  content     text not null default '',
  series      text,                     -- 📚 合集名（可空）：同主题连载归属，序号按 created_at 推导
  updated_at  bigint,                    -- 🌿 最近一次照料（updateSeed）的时间戳；从未改过则等于 created_at
  growth      text not null default 'seedling', -- 🌱 生长度：seedling / growing / evergreen
  status      text not null default 'published' -- 📝 发布状态：draft（仅园丁可见）/ published
);

-- 已建表的存量库：执行下面几行补上新增列（新库可忽略，幂等安全）
alter table public.garden_posts add column if not exists series text;
alter table public.garden_posts add column if not exists updated_at bigint;
alter table public.garden_posts add column if not exists growth text not null default 'seedling';
alter table public.garden_posts add column if not exists status text not null default 'published';

-- 存量行回填：没改过的老文章 updated_at = created_at（视为「从未被照料过」，
-- 阅读舱落款不会凭空多出一行「照料于」；之后真正 updateSeed 过的文章才会有差值）
update public.garden_posts set updated_at = created_at where updated_at is null;

do $$ begin
  alter table public.garden_posts
    add constraint garden_posts_growth_check check (growth in ('seedling', 'growing', 'evergreen'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.garden_posts
    add constraint garden_posts_status_check check (status in ('draft', 'published'));
exception when duplicate_object then null;
end $$;

-- 按时间倒序读取更快
create index if not exists garden_posts_created_at_idx
  on public.garden_posts (created_at desc);

-- 行级安全：草稿只有登录的园丁本人可见，已发布对所有人可见；写入仍仅限登录
alter table public.garden_posts enable row level security;

drop policy if exists "garden public read" on public.garden_posts;
create policy "garden public read"
  on public.garden_posts for select
  using (status = 'published');

-- 与上面这条 select 策略是 OR 关系：登录的园丁本人额外能看到草稿
drop policy if exists "garden authed read" on public.garden_posts;
create policy "garden authed read"
  on public.garden_posts for select
  to authenticated
  using (true);

drop policy if exists "garden authed write" on public.garden_posts;
create policy "garden authed write"
  on public.garden_posts for all
  to authenticated
  using (true)
  with check (true);

-- 开启实时同步（博客 ↔ 知识星图、跨标签页/设备）；已加入过则跳过，保持整份脚本可重复执行
do $$ begin
  alter publication supabase_realtime add table public.garden_posts;
exception when duplicate_object then null;
end $$;
