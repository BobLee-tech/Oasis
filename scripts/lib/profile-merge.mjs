// 曲目档案合并：人标 > 导入 > 自动 > 专辑默认 > 缺省，每个字段记下出处（docs/music-design.md A3.2）。
//
// 只读进 git 的东西（music-data/、tracks.identity.json、PLAYLIST），所以 Vercel 上的 prebuild
// 也能跑；歌词正文与 lyrics-src/ 缓存一概不碰。工坊与 build-profiles.mjs 共用。

export const FEELS = ['tender', 'nostalgic', 'sad', 'peaceful', 'joyful', 'tense', 'wonder'];
export const FEEL_LABELS = {
  tender: '温柔', nostalgic: '怀念', sad: '哀伤', peaceful: '宁静', joyful: '雀跃', tense: '紧绷', wonder: '奇妙',
};
export const RELATION_KINDS = ['reply', 'sequel', 'sameStory', 'sameLyrics'];
export const NOTE_MAX = 40;
export const INTRO_MAX = 120;

// Miku A2.4：VA 最近邻
const FEEL_VA = {
  joyful: [0.7, 0.6], tense: [-0.4, 0.6], wonder: [0.4, 0.3], tender: [0.5, -0.3],
  peaceful: [0.3, -0.6], nostalgic: [-0.1, -0.3], sad: [-0.6, -0.4],
};
export const nearestFeel = (valence, arousal) => {
  let best = null;
  for (const [feel, [v, a]] of Object.entries(FEEL_VA)) {
    const distance = (v - valence) ** 2 + (a - arousal) ** 2;
    if (!best || distance < best.distance) best = { feel, distance };
  }
  return best.feel;
};

// 导入来源的优先级（同一字段多个来源都有时取靠前的）
const IMPORT_ORDER = ['netease', 'vocadb', 'musicbrainz', 'web'];

const present = value =>
  value !== undefined && value !== null && value !== '' &&
  !(Array.isArray(value) && value.length === 0) &&
  !(typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);

const fromSources = (profile, key) => {
  for (const name of IMPORT_ORDER) {
    const value = profile.sources?.[name]?.[key];
    if (present(value)) return { value, source: name };
  }
  return null;
};

const cleanCredits = credits => {
  const out = {};
  for (const role of ['lyricist', 'composer', 'arranger', 'vocal']) {
    const names = (credits?.[role] ?? []).map(name => String(name).trim()).filter(Boolean);
    if (names.length) out[role] = [...new Set(names)];
  }
  return out;
};

/**
 * @param profile   music-data/tracks/<id>.json（可为 { id }）
 * @param identity  tracks.identity.json 里的一项（音频标签）
 * @param album     music-data/albums/<slug>.json（可为 null）
 * @param auto      自动特征：src/data/trackFeatures.generated.json 里这一首（scripts/analyze-tracks.mjs 产出）
 */
export const mergeProfile = (profile, identity, album, auto = {}) => {
  const out = { id: profile.id ?? identity?.id };
  const provenance = {};
  const set = (key, value, source) => {
    if (!present(value)) return;
    out[key] = value;
    provenance[key] = source;
  };
  const pick = (key, candidates) => {
    for (const [value, source] of candidates) {
      if (present(value)) {
        set(key, value, source);
        return;
      }
    }
  };

  pick('titleAlt', [[profile.titleAlt, 'manual'], ...[fromSources(profile, 'titleAlt')].filter(Boolean).map(hit => [hit.value, hit.source])]);
  // 专辑与曲序：音频标签 > 网易云（标签是你手里那张碟本身）
  pick('album', [[profile.album, 'manual'], [identity?.tags?.album, 'tags'], [profile.sources?.netease?.album, 'netease']]);
  pick('trackNo', [
    [profile.trackNo, 'manual'],
    [Number(identity?.tags?.trackNumber) || undefined, 'tags'],
    [profile.sources?.netease?.trackNo, 'netease'],
  ]);
  const releasedHit = fromSources(profile, 'released');
  pick('released', [[profile.released, 'manual'], [releasedHit?.value, releasedHit?.source]]);
  if (out.released) {
    out.year = Number(String(out.released).slice(0, 4)) || undefined;
    if (!out.year) delete out.year;
  }

  if (present(cleanCredits(profile.credits))) set('credits', cleanCredits(profile.credits), 'manual');
  else {
    for (const name of IMPORT_ORDER) {
      const credits = cleanCredits(profile.sources?.[name]?.credits);
      if (present(credits)) {
        set('credits', credits, name);
        break;
      }
    }
  }

  const tieInHit = fromSources(profile, 'tieIn');
  pick('tieIn', [[profile.tieIn, 'manual'], [tieInHit?.value, tieInHit?.source]]);

  set('intro', profile.intro?.trim(), 'manual');
  if (profile.notePrivate) {
    out.notePrivate = true;
  } else {
    set('note', profile.note?.trim(), 'manual');
    set('noteVisitor', profile.noteVisitor?.trim(), 'manual');
  }
  const relations = (profile.relations ?? []).filter(rel => RELATION_KINDS.includes(rel?.kind) && rel?.to);
  set('relations', relations, 'manual');

  // ── mood：人标 > 自动 > 专辑默认 > 缺省 ──
  const mood = {};
  const moodSource = {};
  const moodPick = (key, candidates) => {
    for (const [value, source] of candidates) {
      if (present(value)) {
        mood[key] = value;
        moodSource[key] = source;
        return;
      }
    }
  };
  const manualMood = profile.mood ?? {};
  const albumMood = album?.moodDefaults ?? {};
  moodPick('valence', [[manualMood.valence, 'manual'], [auto.valence, 'auto'], [albumMood.valence, 'album']]);
  moodPick('arousal', [[manualMood.arousal, 'manual'], [auto.arousal, 'auto'], [albumMood.arousal, 'album']]);
  // bpm：人标 > 网易云 > 自动（与 Miku 的 trackMood.ts 同一顺序）
  moodPick('bpm', [[manualMood.bpm, 'manual'], [profile.sources?.netease?.bpm ?? auto.bpmNetease, 'netease'], [auto.bpm, 'auto']]);
  moodPick('sections', [[manualMood.sections, 'manual'], [auto.sections, 'auto']]);
  moodPick('contrast', [[manualMood.contrast, 'manual'], [auto.contrast, 'auto']]);
  moodPick('season', [[manualMood.season, 'manual'], [auto.season, 'auto']]);
  moodPick('time', [[manualMood.time, 'manual'], [auto.time, 'auto']]);
  moodPick('feel', [[manualMood.feel, 'manual'], [albumMood.feel, 'album']]);
  if (!mood.feel && typeof mood.valence === 'number' && typeof mood.arousal === 'number') {
    mood.feel = nearestFeel(mood.valence, mood.arousal);
    moodSource.feel = 'va';
  }
  if (present(mood)) {
    out.mood = mood;
    for (const [key, source] of Object.entries(moodSource)) provenance[`mood.${key}`] = source;
  }

  if (album?.slug) out.albumSlug = album.slug;
  out.provenance = provenance;
  return out;
};

/** 校验人写的字段；返回问题列表（空 = 通过）。 */
export const validateProfile = (profile, knownIds) => {
  const problems = [];
  if (!knownIds.has(profile.id)) problems.push(`${profile.id}：PLAYLIST 里没有这个 id`);
  const len = value => [...String(value ?? '')].length;
  if (len(profile.note) > NOTE_MAX) problems.push(`${profile.id}：note ${len(profile.note)} 字，超过 ${NOTE_MAX}`);
  if (len(profile.noteVisitor) > NOTE_MAX) problems.push(`${profile.id}：noteVisitor 超过 ${NOTE_MAX} 字`);
  if (len(profile.intro) > INTRO_MAX) problems.push(`${profile.id}：intro ${len(profile.intro)} 字，超过 ${INTRO_MAX}`);
  const mood = profile.mood ?? {};
  if (mood.valence !== undefined && !(mood.valence >= -1 && mood.valence <= 1)) problems.push(`${profile.id}：valence 应在 -1..1`);
  if (mood.arousal !== undefined && !(mood.arousal >= 0 && mood.arousal <= 1)) problems.push(`${profile.id}：arousal 应在 0..1`);
  if (mood.feel !== undefined && !FEELS.includes(mood.feel)) problems.push(`${profile.id}：未知 feel「${mood.feel}」`);
  for (const rel of profile.relations ?? []) {
    if (!RELATION_KINDS.includes(rel?.kind)) problems.push(`${profile.id}：未知关联类型「${rel?.kind}」`);
    if (!knownIds.has(rel?.to)) problems.push(`${profile.id}：关联曲「${rel?.to}」不在曲库里`);
    if (rel?.to === profile.id) problems.push(`${profile.id}：不能关联自己`);
  }
  for (const [surface, reading] of Object.entries(profile.lyrics?.readings ?? {})) {
    if (!/\p{Script=Han}/u.test(surface) || !/^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(String(reading))) {
      problems.push(`${profile.id}：读法「${surface} → ${reading}」应是汉字 → 假名`);
    }
  }
  for (const section of mood.sections ?? []) {
    if (!Array.isArray(section) || section.length !== 2 || !(section[0] < section[1])) {
      problems.push(`${profile.id}：sections 每段应是 [startMs, endMs]`);
      break;
    }
  }
  return problems;
};
