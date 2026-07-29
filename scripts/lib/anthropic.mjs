// Anthropic Messages API 的最小封装：模型名必须显式配置，避免脚本悄悄换模型。
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export const anthropicMessage = async ({ system, user, maxTokens = 12_000, temperature = 0.2 }) => {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.LYRICS_TRANSLATION_API_KEY;
  const model = process.env.LYRICS_TRANSLATION_MODEL;
  if (!apiKey) throw new Error('缺少 ANTHROPIC_API_KEY 或 LYRICS_TRANSLATION_API_KEY');
  if (!model) throw new Error('缺少 LYRICS_TRANSLATION_MODEL；模型名必须显式配置，避免静默漂移');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`翻译 API HTTP ${response.status}：${body.slice(0, 300)}`);
  if (body.length > MAX_RESPONSE_BYTES) throw new Error('翻译 API 响应过大');
  const value = JSON.parse(body);
  return value.content?.filter(item => item?.type === 'text').map(item => item.text).join('\n') ?? '';
};

export const extractJson = text => {
  const cleaned = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (cleaned.length > MAX_RESPONSE_BYTES) throw new Error('模型响应过大');
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('模型没有返回 JSON');
    return JSON.parse(cleaned.slice(start, end + 1));
  }
};
