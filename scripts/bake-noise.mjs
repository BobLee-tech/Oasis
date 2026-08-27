// 全屏 feTurbulence 的图案不会变化，预烘焙成 128×128 PNG 后只需平铺一张静态纹理。
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const size = 128;
const pixels = Buffer.alloc(size * size * 4);
let seed = 0x39c5bb;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x1_0000_0000;
};

for (let i = 0; i < size * size; i++) {
  const value = Math.round(96 + random() * 64);
  pixels[i * 4] = value;
  pixels[i * 4 + 1] = value;
  pixels[i * 4 + 2] = value;
  pixels[i * 4 + 3] = 255;
}

const target = resolve('public/textures/noise-128.png');
await mkdir(dirname(target), { recursive: true });
await sharp(pixels, { raw: { width: size, height: size, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(target);
console.log(`静态噪点已生成：${target}`);
