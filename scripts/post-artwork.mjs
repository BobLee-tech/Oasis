#!/usr/bin/env node
//
// 🎨 绘阁配图一键流程：pixiv/X 下载的图 → 备份原图 → 出 thumb+full 两档 webp
//    → 传 R2（art/ 前缀，与博客共用 oasis-picture bucket）→ 打印「+ 装裱」表单要填的字段
//
// 用法：node scripts/post-artwork.mjs <图片路径>
//      art ~/Downloads/104123456_p0.png
//
// 注意：这一步只负责传图 + 算元数据，不会自动登记进 Supabase。
//      版权可见性（visibility private/public）务必在站内「+ 装裱」表单里手动确认，
//      pixiv/X 图默认按 private 处理，见 docs/artwork-hosting.md「版权前提」。
//
import { mkdir, mkdtemp, rm, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

const PROJECT_ROOT = '/Users/nai/Developer/Oasis';
const REMOTE = 'r2:oasis-picture';
const PUBLIC_BASE = 'https://img.boblee.dev/art';
const ART_SRC_DIR = path.join(PROJECT_ROOT, 'public/artworks-src');
const HEIC_EXTS = new Set(['.heic', '.heif']);

const run = (cmd, args) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { stdio: ['pipe', 'inherit', 'inherit'] });
  p.on('error', reject);
  p.on('close', code => (code === 0 ? resolve() : reject(new Error(`${cmd} 退出码 ${code}`))));
  return p;
});

const copyToClipboard = (text) => new Promise((resolve, reject) => {
  const p = spawn('pbcopy');
  p.on('error', reject);
  p.on('close', code => (code === 0 ? resolve() : reject(new Error('pbcopy 失败'))));
  p.stdin.write(text);
  p.stdin.end();
});

const normalizeToDecodable = async (input, tmp) => {
  if (!HEIC_EXTS.has(path.extname(input).toLowerCase())) return input;
  const converted = path.join(tmp, 'source.png');
  console.log(`🔄 HEIC 转 PNG 中（sharp 读不了 HEVC 像素数据）...`);
  await run('sips', ['-s', 'format', 'png', input, '--out', converted]);
  return converted;
};

const toHex = (n) => n.toString(16).padStart(2, '0');
const averageColor = async (input) => {
  const { data } = await sharp(input).resize(1, 1).raw().toBuffer({ resolveWithObject: true });
  const [r, g, b] = data;
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// pixiv 建议用作品 id 命名，比如 104123456_p0；这里只做基本清理，不强制格式
const slugify = (base) => base.trim().replace(/\s+/g, '_').replace(/[^\w.-]/g, '');

const main = async () => {
  const inputArg = process.argv[2];
  if (!inputArg) throw new Error('要传图片路径，比如：art ~/Downloads/104123456_p0.png');
  const input = path.resolve(inputArg.replace(/^~/, homedir()));
  if (!existsSync(input)) throw new Error(`文件不存在：${input}`);
  console.log(`🎨 使用图片：${input}`);

  const ext = path.extname(input);
  const imagePath = slugify(path.basename(input, ext));

  // 备份原图到 public/artworks-src（gitignored，本地留档，见 docs/artwork-hosting.md 第 1 步）
  await mkdir(ART_SRC_DIR, { recursive: true });
  const backupPath = path.join(ART_SRC_DIR, `${imagePath}${ext}`);
  if (!existsSync(backupPath)) {
    await copyFile(input, backupPath);
    console.log(`💾 原图已备份到 public/artworks-src/${imagePath}${ext}`);
  }

  const tmp = await mkdtemp(path.join(tmpdir(), 'oasis-art-'));
  const decodable = await normalizeToDecodable(input, tmp);

  const meta = await sharp(decodable).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const color = await averageColor(decodable);

  const thumbOut = path.join(tmp, `${imagePath}_thumb.webp`);
  const fullOut = path.join(tmp, `${imagePath}_full.webp`);
  await sharp(decodable).resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toFile(thumbOut);
  await sharp(decodable).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(fullOut);
  console.log(`🗜️  已生成 thumb（640）+ full（2048）两档 webp，${width}×${height}，主色 ${color}`);

  console.log(`☁️  上传到 ${REMOTE}/art/ ...`);
  await run('rclone', ['copyto', thumbOut, `${REMOTE}/art/${imagePath}_thumb.webp`, '--s3-no-check-bucket']);
  await run('rclone', ['copyto', fullOut, `${REMOTE}/art/${imagePath}_full.webp`, '--s3-no-check-bucket']);
  await rm(tmp, { recursive: true, force: true });

  const thumbUrl = `${PUBLIC_BASE}/${imagePath}_thumb.webp`;
  console.log(`✅ 完成，验证地址：${thumbUrl}`);

  const formSnippet = `imagePath: ${imagePath}\n宽: ${width}\n高: ${height}\n主色调: ${color}`;
  console.log(`\n📋 「+ 装裱」表单要填的字段（已复制到剪贴板）：\n${formSnippet}`);
  console.log(`\n⚠️  别忘了：可见性默认要选 private，除非确定这张图允许公开转载；标题/画师/原作品页链接需要手动填。`);

  try {
    await copyToClipboard(formSnippet);
  } catch {
    console.log(`（自动复制到剪贴板失败，手动抄上面几行就行）`);
  }
};

main().catch(err => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
