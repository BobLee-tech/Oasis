// 🖼️ 博客配图的公共一段：压缩成 webp → 传 R2 → 返回 img.boblee.dev 上的地址。
//   命令行 `npm run img`（scripts/post-image.mjs）与写作抽屉的本地上传（scripts/image-upload/plugin.mjs，只在 npm run dev 下）共用，
//   两条路出来的图同名规则、同一压缩参数、同一个桶。
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

export const REMOTE = 'r2:oasis-picture';
export const PUBLIC_BASE = 'https://img.boblee.dev';
/** 写作抽屉上传接受的扩展名 */
export const UPLOAD_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif']);

export const run = (cmd, args) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { stdio: ['pipe', 'inherit', 'inherit'] });
  p.on('error', reject);
  p.on('close', code => (code === 0 ? resolve() : reject(new Error(`${cmd} 退出码 ${code}`))));
  return p;
});

// sharp 背后的 libvips 没编译 HEVC 解码器，读不了 HEIC 像素数据（只能读 metadata）
// 借道系统自带的 sips 先转成 PNG，兼容性最稳
const normalizeToDecodable = async (input, tmp) => {
  if (!['.heic', '.heif'].includes(path.extname(input).toLowerCase())) return input;
  const converted = path.join(tmp, 'source.png');
  console.log(`🔄 HEIC 转 PNG 中（sharp 读不了 HEVC 像素数据）...`);
  await run('sips', ['-s', 'format', 'png', input, '--out', converted]);
  return converted;
};

/** 压到 1600 宽的 webp，文件名是当下的时间戳（与 R2 上已有的图同一规则） */
export const compressToWebp = async (input, tmp) => {
  const filename = `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.webp`;
  const out = path.join(tmp, filename);
  const before = (await stat(input)).size;
  const decodable = await normalizeToDecodable(input, tmp);
  await sharp(decodable)
    .rotate() // 手机照片按 EXIF 摆正
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(out);
  const after = (await stat(out)).size;
  return { out, filename, before, after };
};

export const uploadToR2 = async (file, filename) => {
  await run('rclone', ['copyto', file, `${REMOTE}/${filename}`, '--s3-no-check-bucket']);
  return `${PUBLIC_BASE}/${filename}`;
};
