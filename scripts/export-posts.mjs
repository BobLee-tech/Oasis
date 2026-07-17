#!/usr/bin/env node
// scripts/export-posts.mjs
// 💾 内容备份：把 garden_posts 全表导出为带 front-matter 的 .md 文件，存进 content-backup/。
//   数字花园的第一原则是「拥有自己的文字」——Supabase 项目哪天出问题，这份导出就是退路。
//   用 anon key 即可：当前 RLS 允许公开读取全部文章；日后若加入草稿（status 字段），
//   草稿对 anon 不可见，届时需改用 service role key 才能连草稿一并导出（见下方注释）。
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(ROOT, 'content-backup');

// 极简 .env.local 解析：够用即可，不为一个本地脚本引入 dotenv 依赖
const loadEnvLocal = () => {
  const envPath = path.join(ROOT, '.env.local');
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
};

const env = { ...loadEnvLocal(), ...process.env };
const supabaseUrl = env.VITE_SUPABASE_URL;
// 有 service role key 就优先用它（能读到草稿）；否则退回 anon key（当前表全公开可读）
const supabaseKey = env.SUPABASE_SERVICE_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，请检查 .env.local');
  process.exit(1);
}

const escapeYaml = (s) => String(s ?? '').replace(/"/g, '\\"');

// 文件名：日期 + 标题（剥掉文件系统不安全字符，中文保留）+ id 前 4 位防撞名
const safeSlug = (title) =>
  (title || 'untitled').replace(/[/:*?"<>|\\]/g, '').trim().slice(0, 60) || 'untitled';

async function main() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase.from('garden_posts').select('*');
  if (error) {
    console.error('拉取 garden_posts 失败：', error.message);
    process.exit(1);
  }
  if (!data || data.length === 0) {
    console.log('云端暂无文章，无需导出。');
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });

  for (const p of data) {
    const createdAt = Number(p.created_at);
    const dateStr = new Date(createdAt).toISOString().slice(0, 10);
    const filename = `${dateStr}-${safeSlug(p.title)}-${p.id.slice(0, 4)}.md`;

    const frontMatter = [
      '---',
      `id: "${escapeYaml(p.id)}"`,
      `title: "${escapeYaml(p.title)}"`,
      `type: "${escapeYaml(p.type)}"`,
      `tags: [${(p.tags ?? []).map((t) => `"${escapeYaml(t)}"`).join(', ')}]`,
      `color: "${escapeYaml(p.color)}"`,
      p.series ? `series: "${escapeYaml(p.series)}"` : null,
      `createdAt: "${new Date(createdAt).toISOString()}"`,
      p.updated_at ? `updatedAt: "${new Date(Number(p.updated_at)).toISOString()}"` : null,
      p.growth ? `growth: "${escapeYaml(p.growth)}"` : null,
      p.status ? `status: "${escapeYaml(p.status)}"` : null,
      `excerpt: "${escapeYaml(p.excerpt)}"`,
      '---',
      '',
    ].filter((line) => line !== null).join('\n');

    writeFileSync(path.join(OUT_DIR, filename), frontMatter + (p.content ?? ''), 'utf-8');
  }

  console.log(`✓ 已导出 ${data.length} 篇文章到 ${path.relative(ROOT, OUT_DIR)}/`);
}

main();
