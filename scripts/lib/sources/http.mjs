// 网页导入共用的取数：超时、限长、礼貌 UA。只在本机工坊里、你点「导入」时调用一次。
const MAX_BYTES = 3 * 1024 * 1024;
export const USER_AGENT = 'Oasis personal music garden/1.0 (+https://boblee.dev; metadata import)';

export const fetchText = async (url, { headers = {}, timeoutMs = 15_000 } = {}) => {
  const target = new URL(url);
  if (!/^https?:$/.test(target.protocol)) throw new Error('只支持 http(s) 链接');
  // 不替网页去摸本机或内网：工坊跑在你电脑上，挡住 SSRF 这一类最低级的误用。
  if (/^(?:localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|169\.254\.)/.test(target.hostname)) {
    throw new Error('不抓取本机或内网地址');
  }
  const response = await fetch(target, {
    headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...headers },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error('页面过大（> 3MB）');
    }
    chunks.push(value);
  }
  const buffer = Buffer.concat(chunks);
  const charset = response.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
};

export const fetchJson = async (url, options) => JSON.parse(await fetchText(url, options));
