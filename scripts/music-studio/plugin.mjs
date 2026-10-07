// 🎛 曲目工坊：Vite 插件，只在 `vite serve`（开发服务器）下注册（docs/music-design.md P3）。
//
//   /__studio          工坊页面（前端在 src/dev/studio/，不被 index.html 引用，构建产物里没有它）
//   /__studio/api/*    本机中间件（api.mjs），读写 music-data/ 与歌词源文件
//
// 只接受来自本机回环地址的请求：开发服务器即使被 --host 暴露到局域网，工坊也不对外。
const HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>曲目工坊 · Oasis</title>
  </head>
  <body>
    <div id="studio"></div>
    <script type="module" src="/src/dev/studio/main.tsx"></script>
  </body>
</html>`;

const isLoopback = address => /^(?:127\.|::1$|::ffff:127\.)/.test(String(address ?? ''));

export default function musicStudio() {
  return {
    name: 'oasis-music-studio',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (!url.pathname.startsWith('/__studio')) return next();
        if (!isLoopback(req.socket.remoteAddress)) {
          res.statusCode = 403;
          res.end('工坊只对本机开放');
          return;
        }
        if (url.pathname.startsWith('/__studio/api/')) {
          // 用到才加载：`vite build` 读配置时不会碰 api.mjs 和它的网络适配器
          const { handleApi } = await import('./api.mjs');
          return handleApi(req, res, url.pathname.slice('/__studio/api'.length));
        }
        if (url.pathname === '/__studio' || url.pathname === '/__studio/') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(await server.transformIndexHtml(req.url ?? '/__studio', HTML));
          return;
        }
        next();
      });
    },
  };
}
