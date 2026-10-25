// 园图的卷切片转 KTX2（Basis ETC1S）：显卡里每片从约 12 MB 降到约 1.5 MB，下载还更小。
//   用法：node scripts/yuantu-ktx2.mjs [--out 目录] [--only t03] [--q 质量 1–255]
//   读 public/yuantu/scroll/t*.webp，写同名 .ktx2（默认写回同目录）。引擎（yuantu/scrollScene.ts）
//   有 .ktx2 就用、没有或建不起转码器就退回 webp，所以这一步可以随时重跑、随时删掉。
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import sharp from 'sharp';
import { encodeToKTX2 } from 'ktx2-encoder';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const SRC = 'public/yuantu/scroll', OUT = opt('out', SRC), ONLY = opt('only', null), Q = +opt('q', 200);
// 卷首两片（引首「绿洲」与题跋）要在画布上题字，引擎仍读 webp，不必转（与 scrollScene.ts 的 FRONT_DECOR 对应）
const SKIP = new Set(['t17', 't18']);

const decode = async (buf) => {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};

await mkdir(OUT, { recursive: true });
const files = (await readdir(SRC)).filter((f) => /^t\d\d\.webp$/.test(f) && !SKIP.has(basename(f, '.webp')) && (!ONLY || f.startsWith(ONLY))).sort();
let inB = 0, outB = 0;
for (const f of files) {
  const src = await readFile(join(SRC, f));
  const t0 = Date.now();
  // ETC1S：画心是绢本设色，色块柔、少硬边，ETC1S 在质量 200 上看不出块；UASTC 体积是它的四五倍
  const ktx = await encodeToKTX2(new Uint8Array(src), { isUASTC: false, qualityLevel: Q, compressionLevel: 2, generateMipmap: true, isPerceptual: true, imageDecoder: decode });
  const name = basename(f, '.webp') + '.ktx2';
  await writeFile(join(OUT, name), ktx);
  inB += src.length; outB += ktx.length;
  console.log(`${f} → ${name}  ${(src.length / 1024).toFixed(0)} KB → ${(ktx.length / 1024).toFixed(0)} KB  ${Date.now() - t0} ms`);
}
console.log(`共 ${files.length} 片：webp ${(inB / 1048576).toFixed(2)} MB → ktx2 ${(outB / 1048576).toFixed(2)} MB`);
