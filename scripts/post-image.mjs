#!/usr/bin/env node
//
// 🖼️  博客配图一键流程：截图 → 压缩 webp → 传 R2 → 生成 Markdown 并复制到剪贴板
//   · 不传参数：自动抓 ~/Desktop 下最新修改的一张图（截屏默认存这）
//   · 传参数：node scripts/post-image.mjs <图片路径>
//
// 用法：npm run img
//      npm run img -- ~/Desktop/某张图.png
//
import { readdir, stat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { REMOTE, compressToWebp, uploadToR2 } from './lib/post-image-core.mjs';

const DESKTOP = path.join(homedir(), 'Desktop');
const EXTS = new Set(['.png', '.jpg', '.jpeg', '.heic', '.heif']);

const copyToClipboard = (text) => new Promise((resolve, reject) => {
  const p = spawn('pbcopy');
  p.on('error', reject);
  p.on('close', code => (code === 0 ? resolve() : reject(new Error('pbcopy 失败'))));
  p.stdin.write(text);
  p.stdin.end();
});

// 桌面上的图有时会被顺手拖进子文件夹整理，往下扫 2 层子目录，跳过隐藏目录
const collectImages = async (dir, depth) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth > 0) files.push(...(await collectImages(full, depth - 1)));
    } else if (EXTS.has(path.extname(e.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
};

const findLatestDesktopImage = async () => {
  const candidates = await collectImages(DESKTOP, 2);
  if (candidates.length === 0) throw new Error(`~/Desktop 下没找到 png/jpg 图片，先截个图，或者手动传路径：npm run img -- <路径>`);

  const withTime = await Promise.all(candidates.map(async full => {
    const s = await stat(full);
    return { full, mtime: s.mtimeMs };
  }));
  withTime.sort((a, b) => b.mtime - a.mtime);
  return withTime[0].full;
};

const main = async () => {
  const inputArg = process.argv[2];
  const input = inputArg ? path.resolve(inputArg.replace(/^~/, homedir())) : await findLatestDesktopImage();
  console.log(`📸 使用图片：${input}`);

  const tmp = await mkdtemp(path.join(tmpdir(), 'oasis-img-'));
  const { out, filename, before, after } = await compressToWebp(input, tmp);
  console.log(`🗜️  压缩完成：${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB`);

  console.log(`☁️  上传到 ${REMOTE}/${filename} ...`);
  const url = await uploadToR2(out, filename);
  await rm(tmp, { recursive: true, force: true });

  const markdown = `![](${url})`;

  console.log(`✅ 完成！`);
  console.log(markdown);

  try {
    await copyToClipboard(markdown);
    console.log(`📋 已复制到剪贴板，直接在编辑器里 ⌘V 粘贴即可。`);
  } catch {
    console.log(`（自动复制到剪贴板失败，手动复制上面这行就行）`);
  }
};

main().catch(err => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
