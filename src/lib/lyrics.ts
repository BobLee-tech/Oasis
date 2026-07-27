import type {
  LyricLine,
  LyricsDocument,
  LyricsManifest,
  LyricsManifestEntry,
  LyricTranslationStatus,
} from '../types/music';

const MAX_LINES = 2_000;
const MAX_TEXT_LENGTH = 500;
const MAX_TIMESTAMP_MS = 24 * 60 * 60 * 1_000;
const TIMESTAMP = /\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g;
const META = /^\[([a-z][a-z0-9_-]*):(.*)]$/i;

export interface ParsedLrc {
  lines: LyricLine[];
  metadata: Record<string, string>;
  offsetMs: number;
  warnings: string[];
}

const fractionToMs = (fraction = '') => {
  if (!fraction) return 0;
  if (fraction.length === 1) return Number(fraction) * 100;
  if (fraction.length === 2) return Number(fraction) * 10;
  return Number(fraction.slice(0, 3));
};

const cleanText = (value: string) =>
  value
    .replace(/^\uFEFF/, '')
    .replace(/\0/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_LENGTH);

const looksChinese = (value: string) => {
  const simplifiedOnly = value.match(/[这为发后里个们时会说开关从对过还进无与么]/g)?.length ?? 0;
  const kana = value.match(/[\u3040-\u30ff]/g)?.length ?? 0;
  return simplifiedOnly > 0 && kana === 0;
};

/**
 * 宽容读取、严格输出的 LRC 解析器。
 * 支持多时间戳、2/3 位小数、offset、BOM、同时间戳双语与乱序输入。
 */
export const parseLrc = (input: string): ParsedLrc => {
  const metadata: Record<string, string> = {};
  const warnings: string[] = [];
  const rawLines: { startMs: number; text: string; order: number }[] = [];
  let offsetMs = 0;

  input.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, order) => {
    const line = raw.trim();
    if (!line) return;

    const meta = line.match(META);
    if (meta && !/\d/.test(meta[1])) {
      const key = meta[1].toLowerCase();
      const value = cleanText(meta[2]);
      metadata[key] = value;
      if (key === 'offset') {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && Math.abs(parsed) <= 60_000) offsetMs = Math.round(parsed);
        else warnings.push(`忽略异常 offset：${value}`);
      }
      return;
    }

    const stamps = [...line.matchAll(TIMESTAMP)];
    if (!stamps.length) {
      warnings.push(`忽略无时间戳行 ${order + 1}`);
      return;
    }

    const text = cleanText(line.replace(TIMESTAMP, ''));
    if (!text) return;
    for (const stamp of stamps) {
      const startMs =
        Number(stamp[1]) * 60_000 +
        Number(stamp[2]) * 1_000 +
        fractionToMs(stamp[3]);
      if (startMs <= MAX_TIMESTAMP_MS) rawLines.push({ startMs, text, order });
      else warnings.push(`忽略超长时间戳行 ${order + 1}`);
    }
  });

  rawLines.sort((a, b) => a.startMs - b.startMs || a.order - b.order);

  const grouped = new Map<number, string[]>();
  for (const line of rawLines) {
    const texts = grouped.get(line.startMs) ?? [];
    if (!texts.includes(line.text)) texts.push(line.text);
    grouped.set(line.startMs, texts);
  }

  const starts = [...grouped.keys()];
  const lines = starts.slice(0, MAX_LINES).map((startMs, index): LyricLine => {
    const texts = grouped.get(startMs) ?? [];
    const firstChinese = texts.findIndex(looksChinese);
    const ja =
      firstChinese > 0
        ? texts.slice(0, firstChinese).join(' / ')
        : texts[0] ?? '';
    const zh =
      firstChinese >= 0
        ? texts.slice(firstChinese).join(' / ')
        : texts.length > 1
          ? texts.slice(1).join(' / ')
          : undefined;
    const next = starts[index + 1];
    return {
      startMs,
      endMs: Math.max(startMs + 250, next ?? startMs + 8_000),
      ja,
      ...(zh ? { zh } : {}),
    };
  });

  if (rawLines.length > MAX_LINES) warnings.push(`歌词超过 ${MAX_LINES} 行，已截断`);
  return { lines, metadata, offsetMs, warnings };
};

export const mergeTranslation = (lines: LyricLine[], translated: LyricLine[], toleranceMs = 350) => {
  if (!translated.length) return lines;
  let cursor = 0;
  return lines.map(line => {
    while (
      cursor + 1 < translated.length &&
      Math.abs(translated[cursor + 1].startMs - line.startMs) <=
        Math.abs(translated[cursor].startMs - line.startMs)
    ) cursor += 1;
    const candidate = translated[cursor];
    if (!candidate || Math.abs(candidate.startMs - line.startMs) > toleranceMs) return line;
    return { ...line, zh: candidate.ja };
  });
};

/** 返回当前应该高亮的行；前奏阶段为 -1。 */
export const findActiveLine = (lines: LyricLine[], playbackMs: number) => {
  if (!lines.length || playbackMs < lines[0].startMs) return -1;
  let low = 0;
  let high = lines.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (lines[middle].startMs <= playbackMs) low = middle + 1;
    else high = middle - 1;
  }
  return Math.max(-1, high);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const translationStatus = (value: unknown): LyricTranslationStatus =>
  value === 'machine' || value === 'reviewed' ? value : 'none';

/** 网络 JSON 的运行时边界：只接受有限、单调、纯文本的数据。 */
export const validateLyricsDocument = (value: unknown, expectedTrackId: string): LyricsDocument => {
  if (!isRecord(value) || value.version !== 1 || value.trackId !== expectedTrackId) {
    throw new Error('歌词文件与当前曲目不匹配');
  }
  if (!Array.isArray(value.lines) || value.lines.length === 0 || value.lines.length > MAX_LINES) {
    throw new Error('歌词行数异常');
  }

  let previousStart = -1;
  const lines = value.lines.map((raw, index): LyricLine => {
    if (!isRecord(raw)) throw new Error(`歌词第 ${index + 1} 行格式异常`);
    const startMs = Math.round(Number(raw.startMs));
    const endMs = Math.round(Number(raw.endMs));
    const ja = cleanText(String(raw.ja ?? ''));
    const zh = cleanText(String(raw.zh ?? ''));
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      startMs < 0 ||
      startMs > MAX_TIMESTAMP_MS ||
      startMs < previousStart ||
      endMs <= startMs ||
      !ja
    ) throw new Error(`歌词第 ${index + 1} 行内容异常`);
    previousStart = startMs;
    return { startMs, endMs, ja, ...(zh ? { zh } : {}) };
  });

  const source = isRecord(value.source) ? value.source : {};
  const kind = source.kind === 'lrclib' ? 'lrclib' : 'local';
  const offset = Math.round(Number(value.offsetMs ?? 0));

  return {
    version: 1,
    trackId: expectedTrackId,
    title: cleanText(String(value.title ?? '')),
    artist: cleanText(String(value.artist ?? '')),
    language: value.language === 'ja' ? 'ja' : 'und',
    offsetMs: Number.isFinite(offset) && Math.abs(offset) <= 60_000 ? offset : 0,
    translationStatus: translationStatus(value.translationStatus),
    source: {
      kind,
      label: cleanText(String(source.label ?? (kind === 'lrclib' ? 'LRCLIB' : '本地歌词'))),
      ...(typeof source.url === 'string' && /^https:\/\//.test(source.url)
        ? { url: source.url.slice(0, 1_000) }
        : {}),
      ...(typeof source.fetchedAt === 'string' ? { fetchedAt: source.fetchedAt.slice(0, 40) } : {}),
    },
    lines,
  };
};

export const validateLyricsManifest = (value: unknown): LyricsManifest => {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.tracks)) {
    throw new Error('歌词索引格式异常');
  }
  const tracks: Record<string, LyricsManifestEntry> = {};
  Object.entries(value.tracks).slice(0, 5_000).forEach(([trackId, raw]) => {
    if (!/^[a-z0-9_-]{1,80}$/i.test(trackId) || !isRecord(raw)) return;
    const key = String(raw.key ?? '');
    if (!/^[a-z0-9/_-]{1,160}\.json$/i.test(key) || key.includes('..')) return;
    tracks[trackId] = { key, translationStatus: translationStatus(raw.translationStatus) };
  });
  return {
    version: 1,
    generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt.slice(0, 40) : '',
    tracks,
  };
};
