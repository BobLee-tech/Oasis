-- 🎨 Oasis 绘阁 · 画作收藏表
-- 在 Supabase → SQL Editor 中执行一次。配合 src/hooks/useAtelier.ts 使用。
-- 若不执行此脚本，应用仍可用：useAtelier 会静默回落到 localStorage 本地存储（种子占位画作）。

create table if not exists public.garden_artworks (
  id             text primary key,
  title          text not null default '',
  artist         text not null default '',
  artist_url     text,
  source_url     text not null default '',        -- 原作品页（pixiv/x），灯箱「去原作页」落点
  platform       text not null default 'pixiv',   -- pixiv / x / original / other
  image_path     text not null default '',        -- R2 图片 key（或本地/占位图的完整路径），见 resolveArtSrc()
  width          int  not null default 0,
  height         int  not null default 0,
  dominant_color text not null default '#39C5BB', -- 灯箱氛围光 + 卡片辉光
  tags           jsonb not null default '[]'::jsonb,
  note           text not null default '',        -- 收藏语：为什么留下这一张
  visibility     text not null default 'private', -- 🔒 private（仅园丁）/ public（访客可见）
  collected_at   bigint not null                  -- 毫秒时间戳
);

do $$ begin
  alter table public.garden_artworks
    add constraint garden_artworks_platform_check check (platform in ('pixiv', 'x', 'original', 'other'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.garden_artworks
    add constraint garden_artworks_visibility_check check (visibility in ('private', 'public'));
exception when duplicate_object then null;
end $$;

-- 按收藏时间倒序读取更快
create index if not exists garden_artworks_collected_at_idx
  on public.garden_artworks (collected_at desc);

-- 行级安全：默认 private 只有登录的园丁本人可见（白名单式公开，而非默认公开）
alter table public.garden_artworks enable row level security;

drop policy if exists "atelier public read" on public.garden_artworks;
create policy "atelier public read"
  on public.garden_artworks for select
  using (visibility = 'public');

-- 与上面这条 select 策略是 OR 关系：登录的园丁本人额外能看到 private 收藏
drop policy if exists "atelier authed read" on public.garden_artworks;
create policy "atelier authed read"
  on public.garden_artworks for select
  to authenticated
  using (true);

drop policy if exists "atelier authed write" on public.garden_artworks;
create policy "atelier authed write"
  on public.garden_artworks for all
  to authenticated
  using (true)
  with check (true);

-- 开启实时同步（跨标签页/设备）；已加入过则跳过，保持整份脚本可重复执行
do $$ begin
  alter publication supabase_realtime add table public.garden_artworks;
exception when duplicate_object then null;
end $$;
