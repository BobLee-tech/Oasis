// 曲目档案合并：人标 > 草稿 > 导入 > 自动 > 专辑默认 > 缺省，每个字段记下出处（docs/music-design.md A3.2）。
//
// 只读进 git 的东西（music-data/、tracks.identity.json、PLAYLIST），所以 Vercel 上的 prebuild
// 也能跑；歌词正文与 lyrics-src/ 缓存一概不碰。工坊与 build-profiles.mjs 共用。

import {
  checkMood, dominantFeel, feelsOfLayer, nearestFeel, normalizeArc, normalizeImagery, overallValenceOfLayer,
} from './mood-core.mjs';

// 情绪的维度、标签与推导在 mood-core.mjs（前端 trackMood.ts 共用同一份）
export { FEELS, FEEL_LABELS, nearestFeel } from './mood-core.mjs';
export const RELATION_KINDS = ['reply', 'sequel', 'sameStory', 'sameLyrics'];
export const NOTE_MAX = 40;
export const INTRO_MAX = 120;

// 草稿层（sources.draft）：据网络资料与歌词起草的介绍与情绪。2026-10-17 站主拍板：标注太多，
//   搜来的直接生效，工坊里只校不填——人标永远压住草稿，没写的字段由草稿撑着，出处记 'draft'。
//   想回到「草稿不进公开档案」，把这里改成 false 即可。
export const DRAFT_LAYER = true;

// 草稿里与情绪有关的那几项（草稿对象还带 intro / basis / refs 等，不能整个当 mood 层用）
const draftMoodOf = draft => (draft ? {
  valence: draft.valence, lyricValence: draft.lyricValence, soundValence: draft.soundValence,
  feels: draft.feels, feel: draft.feels ? undefined : draft.feel, arc: draft.arc, imagery: draft.imagery,
} : {});

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

  const draft = DRAFT_LAYER ? profile.sources?.draft : undefined;
  pick('intro', [[profile.intro?.trim(), 'manual'], [draft?.intro?.trim(), 'draft']]);
  if (profile.notePrivate) {
    out.notePrivate = true;
  } else {
    set('note', profile.note?.trim(), 'manual');
    set('noteVisitor', profile.noteVisitor?.trim(), 'manual');
  }
  const relations = (profile.relations ?? []).filter(rel => RELATION_KINDS.includes(rel?.kind) && rel?.to);
  set('relations', relations, 'manual');

  // ── mood：人标 > 草稿 > 自动 > 专辑默认 > 缺省 ──
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
  const draftMood = draftMoodOf(draft);
  // 效价：一层写了 valence 用它，只写了词 / 曲分量时取平均（docs/song-emotion-design.md §2.2）
  moodPick('valence', [[overallValenceOfLayer(manualMood), 'manual'], [overallValenceOfLayer(draftMood), 'draft'], [auto.valence, 'auto'], [overallValenceOfLayer(albumMood), 'album']]);
  moodPick('lyricValence', [[manualMood.lyricValence, 'manual'], [draftMood.lyricValence, 'draft'], [albumMood.lyricValence, 'album']]);
  moodPick('soundValence', [[manualMood.soundValence, 'manual'], [draftMood.soundValence, 'draft'], [albumMood.soundValence, 'album']]);
  moodPick('arousal', [[manualMood.arousal, 'manual'], [auto.arousal, 'auto'], [albumMood.arousal, 'album']]);
  // bpm：人标 > 网易云 > 自动（与 Miku 的 trackMood.ts 同一顺序）
  moodPick('bpm', [[manualMood.bpm, 'manual'], [profile.sources?.netease?.bpm ?? auto.bpmNetease, 'netease'], [auto.bpm, 'auto']]);
  moodPick('sections', [[manualMood.sections, 'manual'], [auto.sections, 'auto']]);
  moodPick('contrast', [[manualMood.contrast, 'manual'], [auto.contrast, 'auto']]);
  moodPick('season', [[manualMood.season, 'manual'], [auto.season, 'auto']]);
  moodPick('time', [[manualMood.time, 'manual'], [auto.time, 'auto']]);
  // 情绪向量：整层替换，不跨层混合（人标写了 feels 就完全不看专辑的）；旧的单个 feel 读作 { feel: 3 }
  moodPick('feels', [[feelsOfLayer(manualMood), 'manual'], [feelsOfLayer(draftMood), 'draft'], [feelsOfLayer(albumMood), 'album']]);
  if (mood.feels) {
    mood.feel = dominantFeel(mood.feels);
    moodSource.feel = moodSource.feels;
  } else if (typeof mood.valence === 'number' && typeof mood.arousal === 'number') {
    mood.feel = nearestFeel(mood.valence, mood.arousal);
    moodSource.feel = 'va';
  }
  moodPick('arc', [[normalizeArc(manualMood.arc), 'manual'], [normalizeArc(draftMood.arc), 'draft']]);
  // 意象：人标 > 歌题与歌词计出来的（analyze-tracks.mjs，与季语同一套计分）；人标写了空数组 = 「这首没有意象」，压住自动的
  if (Array.isArray(manualMood.imagery)) {
    mood.imagery = normalizeImagery(manualMood.imagery) ?? [];
    moodSource.imagery = 'manual';
  } else if (Array.isArray(draftMood.imagery) && normalizeImagery(draftMood.imagery)?.length) {
    mood.imagery = normalizeImagery(draftMood.imagery);
    moodSource.imagery = 'draft';
  } else moodPick('imagery', [[normalizeImagery(auto.imagery ? [auto.imagery] : undefined), 'auto']]);
  if (manualMood.sure === false) {
    mood.sure = false;
    moodSource.sure = 'manual';
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
  const draft = profile.sources?.draft;
  if (DRAFT_LAYER && draft) {
    if (len(draft.intro) > INTRO_MAX) problems.push(`${profile.id}：草稿 intro ${len(draft.intro)} 字，超过 ${INTRO_MAX}`);
    problems.push(...checkMood(draftMoodOf(draft), `${profile.id}（草稿）`).problems);
  }
  const mood = profile.mood ?? {};
  problems.push(...checkMood(mood, profile.id).problems);
  if (mood.arousal !== undefined && !(mood.arousal >= 0 && mood.arousal <= 1)) problems.push(`${profile.id}：arousal 应在 0..1`);
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

/** 不拦构建的提示（比如 feels 超过 3 维非零）：曲目档案与专辑默认。 */
export const moodWarnings = (profiles, albums = []) => [
  ...profiles.flatMap(profile => checkMood(profile.mood, profile.id).warnings),
  ...(DRAFT_LAYER ? profiles.flatMap(profile => checkMood(draftMoodOf(profile.sources?.draft), `${profile.id}（草稿）`).warnings) : []),
  ...albums.flatMap(album => checkMood(album.moodDefaults, `专辑 ${album.slug}`).warnings),
];

/** 专辑默认（moodDefaults）的校验：与曲目档案同一套情绪规矩。 */
export const validateAlbumMood = album => checkMood(album.moodDefaults, `专辑 ${album.slug}`).problems;
