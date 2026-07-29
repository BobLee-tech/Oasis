import { createHash } from 'node:crypto';

const MAX_LINES = 2_000;
const TIMESTAMP = /\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g;

export const clean = value => String(value ?? '')
  .replace(/^﻿/, '')
  .replace(/\0/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 500);

const fractionToMs = fraction => {
  if (!fraction) return 0;
  if (fraction.length === 1) return Number(fraction) * 100;
  if (fraction.length === 2) return Number(fraction) * 10;
  return Number(fraction.slice(0, 3));
};

const looksChinese = text => {
  const simplified = text.match(/[这为发后里个们时会说开关从对过还进无与么]/g)?.length ?? 0;
  const kana = text.match(/[぀-ヿ]/g)?.length ?? 0;
  return simplified > 0 && kana === 0;
};

/** 宽容读取、严格输出：支持多时间戳、2/3 位小数、offset、BOM、同时间戳双语与乱序输入。 */
export const parseLrc = input => {
  const raw = [];
  const warnings = [];
  let offsetMs = 0;
  input.replace(/^﻿/, '').split(/\r?\n/).forEach((sourceLine, order) => {
    const line = sourceLine.trim();
    if (!line) return;
    const offset = line.match(/^\[offset:([+-]?\d+)]$/i);
    if (offset) {
      const value = Number(offset[1]);
      if (Math.abs(value) <= 60_000) offsetMs = value;
      return;
    }
    if (/^\[[a-z][a-z0-9_-]*:.*]$/i.test(line)) return;
    const stamps = [...line.matchAll(TIMESTAMP)];
    if (!stamps.length) {
      warnings.push(`第 ${order + 1} 行没有时间戳`);
      return;
    }
    const text = clean(line.replace(TIMESTAMP, ''));
    if (!text) return;
    for (const stamp of stamps) {
      const startMs = Number(stamp[1]) * 60_000 + Number(stamp[2]) * 1_000 + fractionToMs(stamp[3]);
      if (startMs <= 86_400_000) raw.push({ startMs, text, order });
    }
  });
  raw.sort((a, b) => a.startMs - b.startMs || a.order - b.order);
  const grouped = new Map();
  for (const line of raw) {
    const texts = grouped.get(line.startMs) ?? [];
    if (!texts.includes(line.text)) texts.push(line.text);
    grouped.set(line.startMs, texts);
  }
  const starts = [...grouped.keys()].slice(0, MAX_LINES);
  const lines = starts.map((startMs, index) => {
    const texts = grouped.get(startMs);
    const chineseIndex = texts.findIndex(looksChinese);
    const ja = chineseIndex > 0 ? texts.slice(0, chineseIndex).join(' / ') : texts[0];
    const zh = chineseIndex >= 0
      ? texts.slice(chineseIndex).join(' / ')
      : texts.length > 1 ? texts.slice(1).join(' / ') : '';
    return {
      startMs,
      endMs: Math.max(startMs + 250, starts[index + 1] ?? startMs + 8_000),
      ja,
      ...(zh ? { zh } : {}),
    };
  });
  if (raw.length > MAX_LINES) warnings.push(`超过 ${MAX_LINES} 行，已截断`);
  return { lines, offsetMs, warnings };
};

export const mergeTranslation = (lines, translated, toleranceMs = 350) => {
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

/** 只对 startMs+ja 摘要哈希：审校稿据此校验没有对错原文版本。 */
export const sourceHashOf = lines => createHash('sha256')
  .update(JSON.stringify(lines.map(({ startMs, ja }) => ({ startMs, ja }))))
  .digest('hex');

export const stampLrc = startMs => {
  const total = Math.max(0, Math.round(startMs));
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1_000);
  const milliseconds = total % 1_000;
  return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}]`;
};
