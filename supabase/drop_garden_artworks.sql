-- 🧹 撤掉旧「绘阁」画作表（2026-10-07：#/atelier 已改为工坊册页，前端不再读写这张表）
-- 在 Supabase Dashboard → SQL Editor 里手动执行一次。删表不可撤销，执行前可先导出：
--   select * from public.garden_artworks;   → 结果面板右上角 Download CSV
--
-- 注意：
--   · 不要删 public.is_gardener()——garden_posts / garden_categories / post_resonances 等表的 RLS 都依赖它。
--   · 这里只删表；R2 上 oasis-picture/art/ 下的画作图片是另一回事，要清的话在 Cloudflare 控制台或 rclone 手动删。

begin;

-- 先从实时订阅里摘掉（表不在 publication 里时跳过）
do $$ begin
  alter publication supabase_realtime drop table public.garden_artworks;
exception when undefined_object or undefined_table then null;
end $$;

-- 策略、约束、索引随表一起删除
drop table if exists public.garden_artworks;

commit;
