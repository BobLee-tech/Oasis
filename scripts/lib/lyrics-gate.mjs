// 歌词「合适」的五道闸（docs/music-design.md A4.1）。
//
// 纯函数：输入一份歌词文档（发布 JSON 的形状）和音频时长，输出每道闸的结果。
// post-lyrics --publish、lyric:gate 报告与曲目工坊共用这一份判断，别在别处另写一套。
//
//   version      末行之后剩余 ≤ 45s（档案里声明 outroMs 的可放宽）；首行不早于 0；末行不晚于音频
//   clean        正文里没有「作词 / 作曲 / 编曲 …」署名行、「曲名 - 艺人」标题行（署名应解析进 credits），
//                也没有简体字形（「见てる」「仆の手」：中文用户转写时混进来的）
//   translation  每个有字的行都有译文（或显式标 zhSkip）
//   reading      每个含汉字的行都有假名读音（LyricLine.kana）
//   listened     站主完整听过一遍（translationStatus === 'reviewed'）——唯一不阻止发布的一道

export const MAX_TAIL_MS = 45_000;

export const GATES = ['version', 'clean', 'translation', 'reading', 'listened'];
export const BLOCKING_GATES = ['version', 'clean', 'translation', 'reading'];

export const GATE_LABELS = {
  version: '版本',
  clean: '洁净',
  translation: '译文',
  reading: '读音',
  listened: '试听',
};

// 网易云/LRCLIB 歌词头常见的署名行：「作词 : n-buna」「作曲：ナユタン星人」「Lyrics by …」。
const CREDIT_ROLES = [
  ['lyricist', /^(?:作\s*[词詞]|[词詞]|lyrics?(?:\s+by)?|written\s+by)$/i],
  ['composer', /^(?:作\s*曲|曲|music(?:\s+by)?|compose[dr]?(?:\s+by)?)$/i],
  ['arranger', /^(?:[编編]\s*曲|arrange(?:d|r|ment)?(?:\s+by)?)$/i],
  ['producer', /^(?:制作人|製作人|プロデューサー|監製|监制|producer|produced\s+by)$/i],
  ['vocal', /^(?:演唱|歌|vocals?|唄)$/i],
  ['other', /^(?:混音|母带|和声|吉他|贝斯|鼓|钢琴|弦乐|录音|mix(?:ed|ing)?(?:\s+by)?|master(?:ed|ing)?(?:\s+by)?|guitar|bass|drums|piano|strings|recording)$/i],
];
const CREDIT_LINE = /^\s*([^:：]{1,24}?)\s*[:：]\s*(.+?)\s*$/;

/** 署名行 → { role, names }；不是署名行返回 null。 */
export const parseCreditLine = text => {
  const match = String(text ?? '').match(CREDIT_LINE);
  if (!match) return null;
  const label = match[1].trim();
  const role = CREDIT_ROLES.find(([, pattern]) => pattern.test(label))?.[0];
  if (!role) return null;
  const names = match[2].split(/\s*[/／、,，&]\s*/).map(name => name.trim()).filter(Boolean);
  return names.length ? { role, label, names } : null;
};

/** 从署名行汇总出 credits：{ lyricist: [...], composer: [...], ... }。 */
export const creditsFromLines = lines => {
  const credits = {};
  for (const line of lines) {
    const credit = parseCreditLine(line.ja);
    if (!credit || credit.role === 'other') continue;
    const list = credits[credit.role] ?? (credits[credit.role] = []);
    for (const name of credit.names) if (!list.includes(name)) list.push(name);
  }
  return credits;
};

/** 歌词头里「曲名 - 艺人」这种标题行（LRCLIB 常见），同样不属于正文。 */
export const isTitleLine = (text, title) => {
  const value = String(text ?? '').trim();
  const name = String(title ?? '').trim();
  if (!value || !name) return false;
  const match = value.match(/^(.+?)\s+[-–—]\s+.+$/);
  return Boolean(match && match[1].trim() === name);
};

const isHeader = (line, title) => Boolean(parseCreditLine(line.ja)) || isTitleLine(line.ja, title);

// 日文正文里的汉字都应该在 JIS X 0208 里；不在的多半是中文用户转写时混进的简体字形
// （「见てる」「仆の手」「可爱くて」）。少数 JIS X 0213 的正经日文汉字放进白名单。
const JIS_EXTRA = new Set([...'捥𠮟剝頰塡噓']);
let jisSet = null;
const jisKanji = () => {
  if (jisSet) return jisSet;
  jisSet = new Set();
  const decoder = new TextDecoder('shift_jis');
  for (let lead = 0x81; lead <= 0xef; lead += 1) {
    if (lead > 0x9f && lead < 0xe0) continue;
    for (let trail = 0x40; trail <= 0xfc; trail += 1) {
      if (trail === 0x7f) continue;
      const char = decoder.decode(new Uint8Array([lead, trail]));
      if (char !== '\ufffd') jisSet.add(char);
    }
  }
  return jisSet;
};
const HAN_CHAR = /\p{Script=Han}/u;
/** 一行里不像日文字形的汉字（简体转写的痕迹）。 */
export const foreignGlyphs = text => {
  const set = jisKanji();
  return [...String(text ?? '')].filter(char => HAN_CHAR.test(char) && !set.has(char) && !JIS_EXTRA.has(char));
};

/** 没有任何字母/假名/汉字的行（「…」「♪」「（間奏）」之外的纯符号）不需要译文。 */
const hasWords = text => /[\p{L}\p{N}]/u.test(String(text ?? '').replace(/[（(][^）)]*[）)]/g, ''));
const KANJI = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff々〆ヶ]/;
const hasKanji = text => KANJI.test(String(text ?? ''));

/** 行里每个汉字都落在某个读音片段的 surface 里才算有读音（只标了一半的行不算）。 */
const kanjiCovered = (text, kana) => {
  if (!Array.isArray(kana) || !kana.length) return false;
  const value = String(text ?? '');
  const covered = new Array(value.length).fill(false);
  let cursor = 0;
  for (const segment of kana) {
    const surface = String(segment?.surface ?? '');
    if (!surface || !String(segment?.kana ?? '')) continue;
    const at = value.indexOf(surface, cursor);
    if (at < 0) continue;
    for (let i = at; i < at + surface.length; i += 1) covered[i] = true;
    cursor = at + surface.length;
  }
  return [...value].every((char, index) => !KANJI.test(char) || covered[index]);
};

const fmt = ms => {
  const total = Math.round(ms / 1_000);
  return `${Math.floor(total / 60)}:${String(Math.abs(total % 60)).padStart(2, '0')}`;
};

/**
 * @param {object} document  歌词 JSON：{ offsetMs, translationStatus, lines: [{ startMs, ja, zh?, zhSkip?, kana? }] }
 * @param {object} context   { durationMs, outroMs? }  outroMs：档案里声明的纯器乐尾奏长度
 * @returns {{ gates: Record<string, { pass: boolean, detail: string, lines?: number[] }>, blocked: string[], credits: object }}
 */
export const checkLyrics = (document, { durationMs = 0, outroMs = 0 } = {}) => {
  const lines = Array.isArray(document?.lines) ? document.lines : [];
  const offsetMs = Number(document?.offsetMs ?? 0) || 0;
  const gates = {};

  // ── 版本 ──
  {
    const problems = [];
    const first = lines[0];
    const last = lines[lines.length - 1];
    if (!first) problems.push('没有歌词行');
    else {
      if (first.startMs + offsetMs < 0) problems.push(`首行早于 0（${first.startMs + offsetMs}ms）`);
      if (durationMs > 0) {
        const lastStart = last.startMs + offsetMs;
        const tail = durationMs - lastStart;
        const allowance = Math.max(MAX_TAIL_MS, (Number(outroMs) || 0) + 15_000);
        if (tail < 0) problems.push(`末行 ${fmt(lastStart)} 晚于音频结尾 ${fmt(durationMs)}`);
        else if (tail > allowance) {
          problems.push(`末行 ${fmt(lastStart)} 之后还有 ${fmt(tail)}（音频 ${fmt(durationMs)}）`);
        }
      }
    }
    gates.version = { pass: problems.length === 0, detail: problems.join('；') || (durationMs ? '时长吻合' : '未知时长，只查首行') };
  }

  // ── 洁净 ──
  {
    const bad = lines.flatMap((line, index) => isHeader(line, document?.title) ? [index] : []);
    const glyphLines = lines.flatMap((line, index) =>
      !isHeader(line, document?.title) && foreignGlyphs(line.ja).length ? [index] : []);
    const glyphs = [...new Set(glyphLines.flatMap(index => foreignGlyphs(lines[index].ja)))];
    const problems = [
      bad.length && `${bad.length} 行署名/标题混在正文：${bad.slice(0, 3).map(i => `「${lines[i].ja}」`).join('')}`,
      glyphLines.length && `${glyphLines.length} 行混入非日文字形「${glyphs.slice(0, 8).join('')}」（多半是简体转写）`,
    ].filter(Boolean);
    const flagged = [...new Set([...bad, ...glyphLines])].sort((a, b) => a - b);
    gates.clean = {
      pass: problems.length === 0,
      detail: problems.join('；') || '无署名行、字形正常',
      ...(flagged.length ? { lines: flagged } : {}),
    };
  }

  const body = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => hasWords(line.ja) && !isHeader(line, document?.title));

  // ── 译文 ──
  {
    const missing = body.filter(({ line }) => !String(line.zh ?? '').trim() && !line.zhSkip).map(({ index }) => index);
    gates.translation = {
      pass: body.length > 0 && missing.length === 0,
      detail: !body.length
        ? '没有正文行'
        : missing.length
          ? `缺 ${missing.length}/${body.length} 行译文`
          : `${body.length} 行全有译文`,
      ...(missing.length ? { lines: missing } : {}),
    };
  }

  // ── 读音 ──
  {
    const needing = body.filter(({ line }) => hasKanji(line.ja));
    const missing = needing
      .filter(({ line }) => !kanjiCovered(line.ja, line.kana))
      .map(({ index }) => index);
    gates.reading = {
      pass: missing.length === 0,
      detail: missing.length ? `缺 ${missing.length}/${needing.length} 行读音` : needing.length ? '读音齐全' : '无汉字行',
      ...(missing.length ? { lines: missing } : {}),
    };
  }

  // ── 试听 ──
  gates.listened = {
    pass: document?.translationStatus === 'reviewed',
    detail: document?.translationStatus === 'reviewed' ? '已校' : '待校',
  };

  return {
    gates,
    blocked: BLOCKING_GATES.filter(name => !gates[name].pass),
    credits: creditsFromLines(lines),
  };
};

/** 发布前去掉署名行与标题行（credits 另存），其余行原样保留。 */
export const stripHeaderLines = (lines, title) => lines.filter(line => !isHeader(line, title));
