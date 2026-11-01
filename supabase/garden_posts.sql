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
  status      text not null default 'published', -- 📝 可见性：draft（仅园丁）/ unlisted（凭 share_token 可读，不进列表/索引）/ published
  slug        text,                     -- 🔗 可读短链（可空，唯一）：/p/:slug 优先于 /p/:id
  share_token text                      -- 🔒 unlisted 专用的不可猜测令牌：/p/:token 通过 RPC 单篇读取，绕开会被枚举的整表 SELECT
);

-- 已建表的存量库：执行下面几行补上新增列（新库可忽略，幂等安全）
alter table public.garden_posts add column if not exists series text;
alter table public.garden_posts add column if not exists updated_at bigint;
alter table public.garden_posts add column if not exists growth text not null default 'seedling';
alter table public.garden_posts add column if not exists status text not null default 'published';
alter table public.garden_posts add column if not exists slug text;
alter table public.garden_posts add column if not exists share_token text;

do $$ begin
  alter table public.garden_posts add constraint garden_posts_slug_key unique (slug);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.garden_posts add constraint garden_posts_share_token_key unique (share_token);
exception when duplicate_object then null;
end $$;

-- 存量行回填：没改过的老文章 updated_at = created_at（视为「从未被照料过」，
-- 阅读舱落款不会凭空多出一行「照料于」；之后真正 updateSeed 过的文章才会有差值）
update public.garden_posts set updated_at = created_at where updated_at is null;

do $$ begin
  alter table public.garden_posts
    add constraint garden_posts_growth_check check (growth in ('seedling', 'growing', 'evergreen'));
exception when duplicate_object then null;
end $$;

-- 老库若还带着两态的旧约束，先卸掉才能换成三态（同名 add 在约束已存在时会跳过，不会真的放宽）
alter table public.garden_posts drop constraint if exists garden_posts_status_check;
do $$ begin
  alter table public.garden_posts
    add constraint garden_posts_status_check check (status in ('draft', 'unlisted', 'published'));
exception when duplicate_object then null;
end $$;

-- 按时间倒序读取更快
create index if not exists garden_posts_created_at_idx
  on public.garden_posts (created_at desc);

-- 🔑 唯一园丁判定：登录邮箱与站主邮箱一致才算数。
--   仅靠「to authenticated」远远不够——Supabase 项目若没关掉公开注册，
--   任何访客自己 signUp() 拿到的 session 也是 authenticated，会读到草稿、能改写/删掉全部文章。
--   ⚠️ 这条策略只是纵深防御的第二层，第一层务必去 Supabase Dashboard →
--   Authentication → Settings 关掉 "Enable new user signups"。
create or replace function public.is_gardener()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'gardener@example.com';  -- ← 换成你自己的登录邮箱
$$;

-- 行级安全：published 对所有人可见；unlisted 不在这条策略里——
--   否则匿名方也能靠 select * 把「不想被列出」的文章整批枚举出来，
--   unlisted 唯一合法读取路径是下面的 get_post_by_share_token() RPC。
--   draft 仅登录的园丁本人可见；写入也仅限园丁本人。
alter table public.garden_posts enable row level security;

drop policy if exists "garden public read" on public.garden_posts;
create policy "garden public read"
  on public.garden_posts for select
  using (status = 'published');

-- 与上面这条 select 策略是 OR 关系：园丁本人额外能看到 draft / unlisted 全部
drop policy if exists "garden authed read" on public.garden_posts;
create policy "garden authed read"
  on public.garden_posts for select
  to authenticated
  using (public.is_gardener());

drop policy if exists "garden authed write" on public.garden_posts;
create policy "garden authed write"
  on public.garden_posts for all
  to authenticated
  using (public.is_gardener())
  with check (public.is_gardener());

-- 🔗 unlisted 文章的唯一读取口子：必须已经持有正确的 share_token 才能取到那一行，
--   security definer 绕开表级 RLS，但函数体本身把条件收窄到「token 精确匹配且 status=unlisted」，
--   不会变成能查全表的后门。匿名与登录访客都能调用。
create or replace function public.get_post_by_share_token(token text)
returns setof public.garden_posts
language sql
stable
security definer
set search_path = public
as $$
  select * from public.garden_posts
  where share_token = token and status = 'unlisted';
$$;

grant execute on function public.get_post_by_share_token(text) to anon, authenticated;

-- 开启实时同步（博客 ↔ 知识星图、跨标签页/设备）；已加入过则跳过，保持整份脚本可重复执行
do $$ begin
  alter publication supabase_realtime add table public.garden_posts;
exception when duplicate_object then null;
end $$;
