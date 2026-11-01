-- 🍃 Oasis 数字花园 · 留言（共鸣）表
-- 在 Supabase → SQL Editor 中执行一次。配合 src/hooks/usePostResonance.ts 使用。
-- ⚠️ 这张表此前只在 Dashboard 里手工建过、策略从未进版本库——本脚本把它收编：
--   幂等可重复执行；若表已存在则只重置策略与约束，不动数据。

create table if not exists public.post_resonances (
  id          uuid primary key default gen_random_uuid(),
  post_id     text not null,
  author_name text not null default '',
  content     text not null default '',
  aura_color  text not null default '#39C5BB',
  created_at  timestamptz not null default now()
);

-- 🛡️ 服务端硬约束：前端的 maxLength 只是浏览器属性，挡不住直连 REST 端点的脚本。
--   · 长度上限（content 给到 300：150 的正文 + 站主回复共用一列的余量）
--   · content 禁止出现 [_REPLY_] 魔术标记 —— 它是「站主回复」的拆包分隔符，
--     访客若能写入就能伪造一条挂着站主头像与署名的假回复（身份冒充）。
--     insert 策略里只对匿名禁；update（仅园丁能执行）不受此限，回复拼接才写得进去。
--   · aura_color 必须是 #RRGGBB，访客可控字段不进内联样式的灰色地带
do $$ begin
  alter table public.post_resonances
    add constraint post_resonances_author_len check (char_length(author_name) between 1 and 20);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.post_resonances
    add constraint post_resonances_color_check check (aura_color ~ '^#[0-9a-fA-F]{6}$');
exception when duplicate_object then null;
end $$;

-- 🔑 唯一园丁判定：与 garden_posts.sql 里那份定义完全一致（create or replace 幂等）。
create or replace function public.is_gardener()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'gardener@example.com';  -- ← 换成你自己的登录邮箱
$$;

alter table public.post_resonances enable row level security;

-- 所有人可读：留言本就是公开展示的
drop policy if exists "resonance public read" on public.post_resonances;
create policy "resonance public read"
  on public.post_resonances for select
  using (true);

-- 匿名可留言，但长度与内容在这里强制收口（与前端 maxLength 同数值，前端只是体验层）
drop policy if exists "resonance public insert" on public.post_resonances;
create policy "resonance public insert"
  on public.post_resonances for insert
  with check (
    char_length(content) between 1 and 150
    and position('[_REPLY_]' in content) = 0
  );

-- 改（回复拼接）与删（Purify）只归园丁本人；
--   若无这两条，anon key 是公开的，任何访客开 DevTools 就能删光/篡改全部留言
drop policy if exists "resonance gardener update" on public.post_resonances;
create policy "resonance gardener update"
  on public.post_resonances for update
  to authenticated
  using (public.is_gardener())
  with check (public.is_gardener() and char_length(content) <= 1000);

drop policy if exists "resonance gardener delete" on public.post_resonances;
create policy "resonance gardener delete"
  on public.post_resonances for delete
  to authenticated
  using (public.is_gardener());
