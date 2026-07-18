#!/usr/bin/env node
//
// 🎨 批量把 public/artworks-src 下的原图处理成绘阁需要的两档 webp + 元数据
//   · 输入：public/artworks-src/**/*.{jpg,jpeg,png,webp}（本地暂存，gitignore，不部署）
//   · 输出：dist-artworks/<basename>_thumb.webp（长边 640，瀑布流卡片）
//          dist-artworks/<basename>_full.webp（长边 2048，灯箱大图）
//          dist-artworks/manifest.json（每张图的 width/height/dominantColor，抄进「装裱」表单用）
//   · <basename> 即最终登记进 useAtelier 的 imagePath（不含扩展名），与 resolveArtSrc() 的拼接约定一致。
//
// 用法：node scripts/process-artworks.mjs
//
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC_DIR = 'public/artworks-src';
const OUT_DIR = 'dist-artworks';
const EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const toHex = (n) => n.toString(16).padStart(2, '0');

// 粗算「主色调」：整图缩到 1x1 取平均色，够用来当氛围光，不必上聚类算法
const averageColor = async (input) => {
  const { data } = await sharp(input).resize(1, 1).raw().toBuffer({ resolveWithObject: true });
  const [r, g, b] = data;
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const processOne = async (file, i, total) => {
  const rel = path.relative(SRC_DIR, file);
  const base = rel.slice(0, rel.length - path.extname(rel).length).replace(/\\/g, '/');
  const thumbOut = path.join(OUT_DIR, `${base}_thumb.webp`);
  const fullOut = path.join(OUT_DIR, `${base}_full.webp`);

  await mkdir(path.dirname(thumbOut), { recursive: true });

  const img = sharp(file);
  const meta = await img.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  if (!existsSync(thumbOut)) {
    await sharp(file).resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toFile(thumbOut);
  }
  if (!existsSync(fullOut)) {
    await sharp(file).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(fullOut);
  }
  const color = await averageColor(file);

  console.log(`[${i}/${total}] ✅ ${rel} → ${base}_{thumb,full}.webp  (${width}×${height}, ${color})`);
  return { imagePath: base, width, height, color };
};

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(full)));
    else if (EXTS.has(path.extname(e.name).toLowerCase())) files.push(full);
  }
  return files;
};

const main = async () => {
  if (!existsSync(SRC_DIR)) {
    console.error(`❌ 未找到 ${SRC_DIR}，把原图放进这个目录再运行（图片本身不进 git，见 .gitignore）`);
    process.exit(1);
  }
  const files = await walk(SRC_DIR);
  if (files.length === 0) {
    console.log(`🖼️  ${SRC_DIR} 下没有找到 jpg/png/webp 原图，无事可做。`);
    return;
  }
  console.log(`🎨 共发现 ${files.length} 张原图，开始处理 → ${OUT_DIR}`);

  const manifest = [];
  for (let i = 0; i < files.length; i++) {
    manifest.push(await processOne(files[i], i + 1, files.length));
  }

  await writeFile(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`✅ 处理完成。元数据写入 ${OUT_DIR}/manifest.json`);
  console.log(`   下一步：rclone copy ${OUT_DIR}/ r2:<你的bucket>/ --progress`);
  console.log(`   然后在绘阁「+ 装裱」表单里，imagePath 填 manifest.json 里的 imagePath，宽高/主色调也从里面抄。`);
};

main();
