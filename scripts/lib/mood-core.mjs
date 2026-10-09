// 🎚 曲目情绪的核心推导（docs/song-emotion-design.md §2）：脚本（profile-merge.mjs）与前端（src/lib/trackMood.ts）
//   共用这一份，免得两边各写一套、慢慢对不上。纯函数、无依赖；类型在同目录 mood-core.d.mts。
//
//   feels   —— 10 维、每维 0–3 的强度（0 不写）；旧档案的单个 feel 读作 { feel: 3 }
//   feel    —— 派生：feels 里最强的一维，并列取 FEELS 里靠前的（旧规则、律动、粒子照旧读它）
//   blend   —— 派生：两维都 ≥ 2 时的复合情绪名（切ない、释然…）
//   词 / 曲 —— lyricValence / soundValence，不写就等于整体 valence；两者差 ≥ SPLIT_MIN 即「反差」
//   arc     —— 按段落写的增量；imagery —— 意象（只收有消费者的）

export const FEELS = ['tender', 'nostalgic', 'sad', 'peaceful', 'joyful', 'tense', 'wonder', 'power', 'transcendence', 'defiant'];

export const FEEL_LABELS = {
  tender: '温柔', nostalgic: '怀念', sad: '哀伤', peaceful: '宁静', joyful: '雀跃',
  tense: '不安', wonder: '奇妙', power: '燃', transcendence: '空灵', defiant: '不甘',
};

/** 各维在 VA 平面上的锚点（a 为 −1..1）。 */
export const FEEL_VA = {
  joyful: { v: 0.7, a: 0.6 },
  tense: { v: -0.4, a: 0.6 },
  wonder: { v: 0.4, a: 0.3 },
  tender: { v: 0.5, a: -0.3 },
  peaceful: { v: 0.3, a: -0.6 },
  nostalgic: { v: -0.1, a: -0.3 },
  sad: { v: -0.6, a: -0.4 },
  power: { v: 0.3, a: 0.8 },
  transcendence: { v: 0.2, a: -0.4 },
  defiant: { v: -0.5, a: 0.5 },
};

// 只有 VA 可分的维参与最近邻：空灵挨着宁静、不甘挨着不安，靠 VA 猜只会抢走它们的邻居，必须人标。
// 燃参与——没标注的高能量曲原先只能落到「紧绷」或「奇妙」（§0 问题 2）。
export const VA_GUESSABLE = ['tender', 'nostalgic', 'sad', 'peaceful', 'joyful', 'tense', 'wonder', 'power'];

export const MAX_INTENSITY = 3;
/** 一首建议最多几维非零：超过只警告，不拒 */
export const MAX_ACTIVE_FEELS = 3;
export const SPLIT_MIN = 0.6;

export const SECTION_LABELS = ['intro', 'verse', 'pre', 'chorus', 'bridge', 'outro'];
export const SECTION_NAMES = { intro: '前奏', verse: '主歌', pre: '预副歌', chorus: '副歌', bridge: '桥段', outro: '尾声' };
const ARC_AT = new RegExp(`^(${SECTION_LABELS.join('|')})(#[1-9]\\d?)?$`);

// 每个意象都要有读它的模块（A2.1）：前五个给粒子，letter 只给台词
export const IMAGERY = ['rain', 'sea', 'flower', 'moon', 'snow', 'letter'];
export const IMAGERY_LABELS = { rain: '雨', sea: '海', flower: '花', moon: '月', snow: '雪', letter: '信' };

// 复合情绪：两维都 ≥ 2 时成立；多个成立时取两维强度和最大的，再并列取表里靠前的
export const BLENDS = [
  { id: 'setsunai', label: '切ない', feels: ['sad', 'tender'] },
  { id: 'release', label: '释然', feels: ['sad', 'peaceful'] },
  { id: 'fired', label: '燃', feels: ['power', 'joyful'] },
  { id: 'youth', label: '青春', feels: ['joyful', 'nostalgic'] },
  { id: 'hollow', label: '空', feels: ['nostalgic', 'transcendence'] },
  { id: 'smolder', label: '憋着火', feels: ['tense', 'defiant'] },
];

const isNum = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** VA → 最近的可猜维。arousal 用 0..1（与自动层同一量纲），内部映射到 −1..1。 */
export const nearestFeel = (valence, arousal01) => {
  const a = arousal01 * 2 - 1;
  let best = 'peaceful';
  let bestD = Infinity;
  for (const feel of VA_GUESSABLE) {
    const p = FEEL_VA[feel];
    const d = (p.v - valence) ** 2 + (p.a - a) ** 2;
    if (d < bestD) { bestD = d; best = feel; }
  }
  return best;
};

/** 洗成 { feel: 1..3 }：未知维与 0 丢掉，强度取整并钳到 0..3。空则返回 undefined。 */
export const normalizeFeels = raw => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};
  for (const feel of FEELS) {
    const value = raw[feel];
    if (!isNum(value)) continue;
    const level = clamp(Math.round(value), 0, MAX_INTENSITY);
    if (level > 0) out[feel] = level;
  }
  return Object.keys(out).length ? out : undefined;
};

/** 一层（人标或专辑默认）的情绪向量：feels 优先；只有旧的单个 feel 时读作 { feel: 3 }。 */
export const feelsOfLayer = layer => {
  const feels = normalizeFeels(layer?.feels);
  if (feels) return feels;
  return FEELS.includes(layer?.feel) ? { [layer.feel]: MAX_INTENSITY } : undefined;
};

/** 最强的一维；并列取 FEELS 里靠前的。 */
export const dominantFeel = feels => {
  let best;
  for (const feel of FEELS) {
    if ((feels?.[feel] ?? 0) > (best ? feels[best] : 0)) best = feel;
  }
  return best;
};

export const blendOf = feels => {
  let best;
  let bestScore = 0;
  for (const blend of BLENDS) {
    const [a, b] = blend.feels.map(feel => feels?.[feel] ?? 0);
    if (a >= 2 && b >= 2 && a + b > bestScore) { best = blend.id; bestScore = a + b; }
  }
  return best;
};

/** 一层的整体效价：写了 valence 用它，否则取已写的词 / 曲分量的平均。 */
export const overallValenceOfLayer = layer => {
  if (isNum(layer?.valence)) return layer.valence;
  const parts = [layer?.lyricValence, layer?.soundValence].filter(isNum);
  return parts.length ? parts.reduce((sum, x) => sum + x, 0) / parts.length : undefined;
};

export const isSplit = (lyricValence, soundValence) =>
  isNum(lyricValence) && isNum(soundValence) && Math.abs(soundValence - lyricValence) >= SPLIT_MIN - 1e-9;

export const normalizeArc = raw => {
  if (!Array.isArray(raw)) return undefined;
  const out = [];
  for (const step of raw) {
    if (!step || typeof step.at !== 'string' || !ARC_AT.test(step.at)) continue;
    const next = { at: step.at };
    const feels = normalizeFeels(step.feels);
    if (feels) next.feels = feels;
    if (isNum(step.dv) && step.dv !== 0) next.dv = clamp(step.dv, -1, 1);
    if (isNum(step.da) && step.da !== 0) next.da = clamp(step.da, -1, 1);
    if (Object.keys(next).length > 1) out.push(next);
  }
  return out.length ? out : undefined;
};

/**
 * 此刻这一段生效的弧线（§3.2）：at 写「chorus」的对每次副歌都生效，写「chorus#2」的只对第 2 次；
 * 两条都命中时叠加。n 是这一段在同标签里的第几次（从 1 数）。
 * @returns {{ feels?: Record<string, number>, dv: number, da: number } | null} 没有命中时 null
 */
export const arcAt = (arc, at, n) => {
  if (!arc?.length || !at) return null;
  let hit = null;
  for (const step of arc) {
    const [label, nth] = step.at.split('#');
    if (label !== at || (nth !== undefined && Number(nth) !== n)) continue;
    hit ??= { dv: 0, da: 0 };
    hit.dv += step.dv ?? 0;
    hit.da += step.da ?? 0;
    if (step.feels) hit.feels = addFeels(hit.feels, step.feels);
  }
  return hit;
};

/** 底色 ⊕ 增量：逐维相加，钳到 0..3（弧线只写「这一段多了什么」）。 */
export const addFeels = (base, delta) => {
  const out = { ...base };
  for (const feel of FEELS) {
    const sum = (base?.[feel] ?? 0) + (delta?.[feel] ?? 0);
    if (sum > 0) out[feel] = Math.min(MAX_INTENSITY, sum);
  }
  return out;
};

export const normalizeImagery = raw => {
  if (!Array.isArray(raw)) return undefined;
  const out = IMAGERY.filter(item => raw.includes(item));
  return out.length ? out : undefined;
};

/**
 * 校验人写的情绪字段（曲目档案的 mood 或专辑的 moodDefaults）。
 * @returns {{ problems: string[], warnings: string[] }} problems 拦构建；warnings 只提示
 */
export const checkMood = (mood, where) => {
  const problems = [];
  const warnings = [];
  if (!mood) return { problems, warnings };
  for (const key of ['valence', 'lyricValence', 'soundValence']) {
    if (mood[key] !== undefined && !(isNum(mood[key]) && mood[key] >= -1 && mood[key] <= 1)) problems.push(`${where}：${key} 应在 -1..1`);
  }
  if (mood.feel !== undefined && !FEELS.includes(mood.feel)) problems.push(`${where}：未知 feel「${mood.feel}」`);
  const checkFeels = (feels, label) => {
    if (feels === undefined) return;
    if (!feels || typeof feels !== 'object' || Array.isArray(feels)) {
      problems.push(`${where}：${label} 应是 { 维: 0–3 }`);
      return;
    }
    for (const [feel, level] of Object.entries(feels)) {
      if (!FEELS.includes(feel)) problems.push(`${where}：${label} 里有未知维「${feel}」`);
      else if (!Number.isInteger(level) || level < 0 || level > MAX_INTENSITY) problems.push(`${where}：${label}.${feel} 应是 0–3 的整数`);
    }
  };
  checkFeels(mood.feels, 'feels');
  const active = Object.values(mood.feels ?? {}).filter(level => level > 0).length;
  if (active > MAX_ACTIVE_FEELS) warnings.push(`${where}：feels 有 ${active} 维非零，建议不超过 ${MAX_ACTIVE_FEELS}`);
  if (mood.feel !== undefined && mood.feels !== undefined) warnings.push(`${where}：同时写了 feel 与 feels，以 feels 为准`);
  if (mood.arc !== undefined) {
    if (!Array.isArray(mood.arc)) problems.push(`${where}：arc 应是数组`);
    else {
      mood.arc.forEach((step, index) => {
        if (!step || typeof step.at !== 'string' || !ARC_AT.test(step.at)) problems.push(`${where}：arc[${index}].at 应是 ${SECTION_LABELS.join(' / ')}（可带 #2）`);
        checkFeels(step?.feels, `arc[${index}].feels`);
        for (const key of ['dv', 'da']) {
          if (step?.[key] !== undefined && !(isNum(step[key]) && step[key] >= -1 && step[key] <= 1)) problems.push(`${where}：arc[${index}].${key} 应在 -1..1`);
        }
      });
    }
  }
  if (mood.imagery !== undefined) {
    if (!Array.isArray(mood.imagery)) problems.push(`${where}：imagery 应是数组`);
    else for (const item of mood.imagery) if (!IMAGERY.includes(item)) problems.push(`${where}：未知意象「${item}」（可用：${IMAGERY.join(' / ')}）`);
  }
  if (mood.sure !== undefined && typeof mood.sure !== 'boolean') problems.push(`${where}：sure 应是 true / false`);
  // felt 是「这首让你怎样」，与 notePrivate 同级私密：档案进 git、生成文件是公开 chunk，所以它只存 Supabase（§6 方案 A）
  if (mood.felt !== undefined) problems.push(`${where}：felt 不写进档案（会公开），它存在 Supabase 的 track_felt 表`);
  return { problems, warnings };
};
