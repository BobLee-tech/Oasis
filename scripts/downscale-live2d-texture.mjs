// Live2D 贴图降采样：2048² → 1024²，并转 WebP。
// 舞台最大渲染 304×472 物理像素，1024² 仍有充足超采样；显存由 16MB 降为 4MB。
// sharp 的 resize 会在采样阶段正确处理 alpha，避免发梢与裙摆的半透明边缘渗出黑边。
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const source = resolve('public/live2d/miku/miku_sample_t04.2048/texture_00.png');
const target = resolve('public/live2d/miku/miku_sample_t04.1024/texture_00.webp');

await mkdir(dirname(target), { recursive: true });
await sharp(source)
  .resize(1024, 1024, { kernel: 'lanczos3', fit: 'fill' })
  .webp({ quality: 92, alphaQuality: 100, effort: 6 })
  .toFile(target);

const metadata = await sharp(target).metadata();
console.log(`Live2D 贴图已生成：${metadata.width}×${metadata.height} · ${target}`);
