// 📤 写作抽屉的本地上传：Vite 插件，只在 `vite serve`（npm run dev）下注册，构建产物里没有它。
//
//   POST /__upload/image   请求体是图片原始字节，X-Filename 头带原文件名（只取扩展名，HEIC 要靠它）
//                          → 压成 webp、传 R2（scripts/lib/post-image-core.mjs，与 npm run img 同一条路）→ { url }
//
// 和曲目工坊一样只接受本机回环地址：开发服务器即使 --host 暴露到局域网，也不替别人往桶里传东西。
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const LIMIT = 40 * 1024 * 1024;
const isLoopback = address => /^(?:127\.|::1$|::ffff:127\.)/.test(String(address ?? ''));

const send = (res, code, body) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const readBody = req => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on('data', c => {
    size += c.length;
    if (size > LIMIT) { reject(new Error('图片超过 40 MB')); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

export default function imageUpload() {
  return {
    name: 'oasis-image-upload',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/__upload/image')) return next();
        if (!isLoopback(req.socket.remoteAddress)) return send(res, 403, { error: '上传只对本机开放' });
        if (req.method !== 'POST') return send(res, 405, { error: '只收 POST' });
        // 用到才加载：sharp 不进 `vite build` 读配置的那一趟
        const { UPLOAD_EXTS, compressToWebp, uploadToR2 } = await import('../lib/post-image-core.mjs');
        const ext = path.extname(decodeURIComponent(String(req.headers['x-filename'] ?? ''))).toLowerCase();
        if (!UPLOAD_EXTS.has(ext)) return send(res, 400, { error: `不认识的格式「${ext || '无扩展名'}」，要 png / jpg / webp / heic` });
        let tmp;
        try {
          const body = await readBody(req);
          if (!body.length) return send(res, 400, { error: '空文件' });
          tmp = await mkdtemp(path.join(tmpdir(), 'oasis-upload-'));
          const input = path.join(tmp, `source${ext}`);
          await writeFile(input, body);
          const { out, filename, before, after } = await compressToWebp(input, tmp);
          const url = await uploadToR2(out, filename);
          console.log(`📤 封面上传：${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB · ${url}`);
          send(res, 200, { url });
        } catch (e) {
          send(res, 500, { error: e instanceof Error ? e.message : String(e) });
        } finally {
          if (tmp) await rm(tmp, { recursive: true, force: true });
        }
      });
    },
  };
}
