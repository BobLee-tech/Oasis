// 读音层（docs/music-design.md A4.4）：给每行歌词配上按词切分的假名读音，
// 供歌词场的注音开关与 Miku 的口型（lipSync 按音拍取元音）使用。
//
// 来源优先级（逐个汉字串决定）：
//   1. 歌词里自带的行内注音「空（そら）」——转写者标的，最可信（网易云的 DECO*27 等曲目常见）
//   2. 网易云罗马音（反映实际唱法，例如把「三節」唱成 sanfushi、「本気」唱成「マジ」）
//   3. kuromoji 词典读音（只在构建期运行的 devDependency）
// 2 和 3 对同一个汉字串读法不同的，记进 conflicts，交给工坊让你确认；
// 你定下的读法存在曲目档案 lyrics.readings，重建时排在最前。
//
// 输出：line.kana = [{ surface: '嘘', kana: 'うそ' }, …]，只列含汉字（或数字）的片段，按出现顺序。

const HAN = '\\p{Script=Han}々〆ヶ';
const KANA = '\\p{Script=Hiragana}\\p{Script=Katakana}ー';
const INLINE_RUBY = new RegExp(`([${HAN}]+)[（(]([${KANA}]+)[）)]`, 'gu');
const KANJI_CHAR = new RegExp(`[${HAN}]`, 'u');
const RUN_CHAR = new RegExp(`[${HAN}0-9０-９]`, 'u');
const KANA_CHAR = new RegExp(`[${KANA}]`, 'u');

export const toHiragana = text =>
  String(text ?? '').replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));

export const hasKanji = text => KANJI_CHAR.test(String(text ?? ''));

/**
 * 「空（そら）から見てる」→ { text: '空から見てる', ruby: [{ surface: '空', kana: 'そら' }] }
 * 只认「汉字紧跟括号假名」；括号里有别的东西（「（Ah）」「（間奏）」）原样保留。
 */
export const extractInlineRuby = text => {
  const ruby = [];
  const clean = String(text ?? '').replace(INLINE_RUBY, (_, surface, kana) => {
    ruby.push({ surface, kana: toHiragana(kana) });
    return surface;
  });
  return { text: clean, ruby };
};

// ── 罗马音 → 假名 ──────────────────────────────────────────────────────────

const ROMA = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ', kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ',
  sa: 'さ', shi: 'し', si: 'し', su: 'す', se: 'せ', so: 'そ', sha: 'しゃ', shu: 'しゅ', she: 'しぇ', sho: 'しょ',
  ta: 'た', chi: 'ち', ti: 'ち', tsu: 'つ', tu: 'つ', te: 'て', to: 'と', cha: 'ちゃ', chu: 'ちゅ', che: 'ちぇ', cho: 'ちょ',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の', nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
  ha: 'は', hi: 'ひ', fu: 'ふ', hu: 'ふ', he: 'へ', ho: 'ほ', hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ',
  fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も', mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
  ya: 'や', yu: 'ゆ', yo: 'よ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ', rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
  wa: 'わ', wo: 'を', wi: 'うぃ', we: 'うぇ',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご', gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
  za: 'ざ', ji: 'じ', zi: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ', ja: 'じゃ', ju: 'じゅ', je: 'じぇ', jo: 'じょ',
  jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ',
  da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど', dhi: 'でぃ', thi: 'てぃ',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ', bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ', pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
  va: 'ゔぁ', vi: 'ゔぃ', vu: 'ゔ', ve: 'ゔぇ', vo: 'ゔぉ',
};
const MACRON = { ā: 'aa', ī: 'ii', ū: 'uu', ē: 'ee', ō: 'ou', â: 'aa', î: 'ii', û: 'uu', ê: 'ee', ô: 'ou' };

/** 一个罗马音词（网易云按音节空格分开：「ku chi」「kka」「taa」「n」）→ 平假名；认不出返回 null。 */
export const romaTokenToKana = token => {
  const value = String(token ?? '').toLowerCase().replace(/[āīūēōâîûêô]/g, char => MACRON[char]).replace(/['’-]/g, '');
  if (!value || /[^a-z]/.test(value)) return null;
  let out = '';
  let i = 0;
  while (i < value.length) {
    const rest = value.slice(i);
    // 促音：kka / tchi / sshi / ppa
    if (rest.length > 1 && rest[0] === rest[1] && !'aeioun'.includes(rest[0])) {
      out += 'っ';
      i += 1;
      continue;
    }
    if (rest.startsWith('tch')) {
      out += 'っ';
      i += 1;
      continue;
    }
    const syllable = [3, 2, 1].map(size => rest.slice(0, size)).find(part => ROMA[part]);
    if (syllable) {
      out += ROMA[syllable];
      i += syllable.length;
      continue;
    }
    if (rest[0] === 'n') {
      out += 'ん';
      i += rest[1] === 'n' && !'aeiouy'.includes(rest[2] ?? '') ? 2 : 1;
      continue;
    }
    if (rest[0] === 'm' && 'bpm'.includes(rest[1] ?? '')) {
      out += 'ん';
      i += 1;
      continue;
    }
    return null;
  }
  return out;
};

/** 整行罗马音 → 平假名；英文词（原文里也有的拉丁词、或认不出的词）丢掉。 */
export const romaLineToKana = (roma, originalText = '') => {
  const latinWords = new Set((String(originalText).match(/[A-Za-z']+/g) ?? []).map(word => word.toLowerCase()));
  return String(roma ?? '')
    .split(/[^A-Za-zāīūēōâîûêô'’-]+/)
    .filter(Boolean)
    .filter(token => !latinWords.has(token.toLowerCase()))
    .map(romaTokenToKana)
    .filter(Boolean)
    .join('');
};

// ── 对齐：原文（汉字串为通配）↔ 罗马音假名 ─────────────────────────────────

// 助词与歴史假名的读音等价：は↔わ、を↔お、へ↔え；ぢ↔じ、づ↔ず
const EQUIV = { は: 'わ', を: 'お', へ: 'え', ぢ: 'じ', づ: 'ず', ゐ: 'い', ゑ: 'え' };
const fold = char => EQUIV[char] ?? char;
const VOWEL_KANA = new Set([...'あいうえおぁぃぅぇぉ']);

/** 原文拆成单元：{ kana: 'か' } 或 { run: '六畳間', at: 位置 }；标点、空格、拉丁字母略过。 */
const unitsOf = text => {
  const units = [];
  const chars = [...text];
  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i];
    if (RUN_CHAR.test(char)) {
      const last = units[units.length - 1];
      if (last?.run !== undefined && last.end === i) {
        last.run += char;
        last.end = i + 1;
      } else units.push({ run: char, at: i, end: i + 1 });
    } else if (KANA_CHAR.test(char)) {
      units.push({ kana: toHiragana(char) });
    }
  }
  return units;
};

/**
 * 罗马音读出每个汉字串的读法。返回 [{ surface, kana, at }]；对不上返回 null。
 * 回溯匹配：汉字串从短到长试，第一组能让整行对上的切分即为答案。
 */
export const alignReading = (text, romaKana, expected = new Map()) => {
  const units = unitsOf(String(text ?? ''));
  if (!units.some(unit => unit.run !== undefined)) return [];
  const target = [...romaKana];
  const memo = new Map();
  const solve = (ui, pos) => {
    if (ui === units.length) return pos === target.length ? [] : null;
    const key = `${ui}:${pos}`;
    if (memo.has(key)) return memo.get(key);
    const unit = units[ui];
    let result = null;
    if (unit.kana !== undefined) {
      if (unit.kana === 'ー') {
        // 长音：罗马音写成重复元音（taa）或干脆不写
        if (VOWEL_KANA.has(target[pos])) result = solve(ui + 1, pos + 1);
        if (!result) result = solve(ui + 1, pos);
      } else if (pos < target.length && fold(unit.kana) === fold(target[pos])) {
        result = solve(ui + 1, pos + 1);
      } else if (unit.kana === 'っ' && target[pos] !== 'っ') {
        // 罗马音有时漏写促音
        result = solve(ui + 1, pos);
      }
    } else {
      const maxLength = Math.min(target.length - pos, [...unit.run].length * 4 + 2);
      // 相邻两个汉字串之间没有假名时切分有歧义：先试最接近词典读音长度的切法
      const guess = expected.get(unit.at) ?? [...unit.run].length * 2;
      const sizes = Array.from({ length: maxLength }, (_, index) => index + 1)
        .sort((a, b) => Math.abs(a - guess) - Math.abs(b - guess) || a - b);
      for (const size of sizes) {
        if (result) break;
        const reading = target.slice(pos, pos + size).join('');
        // 读音不会以拗音小字或长音开头
        if (/^[ゃゅょぁぃぅぇぉっんー]/.test(reading)) continue;
        const rest = solve(ui + 1, pos + size);
        if (rest) result = [{ surface: unit.run, kana: reading, at: unit.at }, ...rest];
      }
    }
    memo.set(key, result);
    return result;
  };
  return solve(0, 0);
};

// ── kuromoji ────────────────────────────────────────────────────────────

let tokenizerPromise = null;
/** 懒加载 kuromoji（词典约 1 秒）；装不上时返回 null，读音层退回只用前两个来源。 */
export const loadTokenizer = async () => {
  if (!tokenizerPromise) {
    tokenizerPromise = (async () => {
      try {
        const { default: kuromoji } = await import('kuromoji');
        const { createRequire } = await import('node:module');
        const path = await import('node:path');
        const dicPath = path.join(path.dirname(createRequire(import.meta.url).resolve('kuromoji/package.json')), 'dict');
        return await new Promise((resolve, reject) => {
          kuromoji.builder({ dicPath }).build((error, tokenizer) => (error ? reject(error) : resolve(tokenizer)));
        });
      } catch {
        return null;
      }
    })();
  }
  return tokenizerPromise;
};

/** kuromoji 的词 → 只留汉字核心（「出し」读「だし」→「出」读「だ」），带位置。 */
export const dictionaryReading = (tokenizer, text) => {
  if (!tokenizer) return [];
  const segments = [];
  let offset = 0;
  for (const token of tokenizer.tokenize(String(text ?? ''))) {
    const surface = token.surface_form;
    const at = offset;
    offset += surface.length;
    if (!RUN_CHAR.test(surface) || !token.reading || token.reading === '*') continue;
    let reading = toHiragana(token.reading);
    let start = 0;
    let end = surface.length;
    // 去掉送假名：词尾与读音尾相同的假名
    while (end > start && KANA_CHAR.test(surface[end - 1]) && reading.endsWith(toHiragana(surface[end - 1]))) {
      reading = reading.slice(0, -1);
      end -= 1;
    }
    while (start < end && KANA_CHAR.test(surface[start]) && reading.startsWith(toHiragana(surface[start]))) {
      reading = reading.slice(1);
      start += 1;
    }
    if (!reading) continue;
    segments.push({ surface: surface.slice(start, end), kana: reading, at: at + start });
  }
  return segments;
};

const CLAUSE = /[、。，,！？!?　]/u;
/** 原文和罗马音里「、」等标点个数相同时，按标点切成小句分别对齐，歧义小得多。 */
const alignByClause = (text, roma, expected) => {
  const textParts = text.split(CLAUSE);
  const romaParts = String(roma).split(/[、。，,！？!?]/u);
  if (textParts.length > 1 && textParts.length === romaParts.length) {
    const out = [];
    let offset = 0;
    for (let i = 0; i < textParts.length; i += 1) {
      const local = new Map([...expected].filter(([at]) => at >= offset).map(([at, length]) => [at - offset, length]));
      const segments = alignReading(textParts[i], romaLineToKana(romaParts[i], textParts[i]), local);
      if (!segments) return alignReading(text, romaLineToKana(roma, text), expected) ?? [];
      out.push(...segments.map(segment => ({ ...segment, at: segment.at + offset })));
      offset += textParts[i].length + 1;
    }
    return out;
  }
  return alignReading(text, romaLineToKana(roma, text), expected) ?? [];
};

// 比较读音时的同一：长音写法（とう / とお / とー）不算不同
const foldReading = value => [...toHiragana(value)].map(fold).join('')
  .replace(/ー/g, '')
  .replace(/([おこそとのほもよろごぞどぼぽょ])[うお]/g, '$1う');
/** 只差送假名（なが / ながれ）或长音写法的不算冲突。 */
const sameReading = (a, b) => {
  const left = foldReading(a);
  const right = foldReading(b);
  return left === right || left.startsWith(right) || right.startsWith(left);
};

/**
 * 给一行配读音。
 * @param line       { ja, kana? }（kana 已有的是行内注音）
 * @param roma       同一句的网易云罗马音（可为空）
 * @param tokenizer  kuromoji（可为 null）
 * @param overrides  { 汉字串: 读法 }：你在工坊里确认过的读法
 * @returns {{ kana: {surface,kana}[], source: 'none'|'inline'|'roma'|'dictionary'|'mixed', conflicts: {surface,roma,dictionary}[] }}
 */
export const readingForLine = (line, roma, tokenizer, overrides = {}) => {
  const text = String(line.ja ?? '');
  if (!hasKanji(text) && !/[0-9０-９]/.test(text)) return { kana: [], source: 'none', conflicts: [] };

  // 汉字串的位置
  const runs = unitsOf(text).filter(unit => unit.run !== undefined);
  const inline = [];
  let cursor = 0;
  for (const segment of line.kana ?? []) {
    const at = text.indexOf(segment.surface, cursor);
    if (at < 0) continue;
    inline.push({ ...segment, at });
    cursor = at + segment.surface.length;
  }
  const dictionary = dictionaryReading(tokenizer, text);
  const expected = new Map();
  for (const run of runs) {
    const runEnd = run.at + [...run.run].length;
    const inside = dictionary.filter(segment => segment.at >= run.at && segment.at + segment.surface.length <= runEnd);
    if (inside.length) expected.set(run.at, [...inside.map(segment => segment.kana).join('')].length);
  }
  const romaSegments = roma ? alignByClause(text, roma, expected) : [];

  const chosen = [];
  const sources = new Set();
  const conflicts = [];
  let coveredUntil = -1;
  for (const run of runs) {
    const runEnd = run.at + [...run.run].length;
    // 上一个词典词已经跨过来盖住了这个汉字串（「手の平」一个词盖住「手」和「平」）
    if (run.at < coveredUntil) continue;
    const within = list => list.filter(segment => segment.at >= run.at && segment.at + segment.surface.length <= runEnd);
    const fromInline = within(inline);
    const fromRoma = romaSegments.find(segment => segment.at === run.at);
    const fromDictionary = within(dictionary);
    const dictionaryCovers = fromDictionary.map(segment => segment.surface).join('') === run.run;
    if (fromRoma && dictionaryCovers) {
      const dictionaryKana = fromDictionary.map(segment => segment.kana).join('');
      if (!sameReading(dictionaryKana, fromRoma.kana) && !/[0-9０-９]/.test(run.run) && !overrides[run.run]) {
        conflicts.push({ surface: run.run, roma: fromRoma.kana, dictionary: dictionaryKana });
      }
    }
    if (overrides[run.run]) {
      // 你在工坊里定过的读法（profile.lyrics.readings）优先于一切
      chosen.push({ surface: run.run, kana: toHiragana(overrides[run.run]), at: run.at });
      sources.add('manual');
    } else if (fromInline.length) {
      chosen.push(...fromInline);
      sources.add('inline');
    } else if (fromRoma) {
      chosen.push(fromRoma);
      sources.add('roma');
    } else if (fromDictionary.length) {
      chosen.push(...fromDictionary);
      sources.add('dictionary');
    } else {
      // 词典把汉字串和中间的假名切成一个词（手の平 → てのひら）：整词作为一个读音片段
      const spanning = dictionary.find(segment => segment.at <= run.at && segment.at + segment.surface.length >= runEnd);
      if (spanning) {
        chosen.push(spanning);
        sources.add('dictionary');
        coveredUntil = spanning.at + spanning.surface.length;
      }
    }
  }
  chosen.sort((a, b) => a.at - b.at);
  return {
    kana: chosen.map(({ surface, kana }) => ({ surface, kana })),
    source: sources.size === 0 ? 'none' : sources.size === 1 ? [...sources][0] : 'mixed',
    conflicts,
  };
};

/** 歌词正文的比对键：行文本归一化，用来把罗马音从网易云版本借到 LRCLIB 版本的同一句上。 */
export const lineKey = text => String(text ?? '').normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
