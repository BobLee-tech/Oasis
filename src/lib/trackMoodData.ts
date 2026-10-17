// 🎼 trackMood 的数据层：只被 trackMood.ts 动态 import，单独成 chunk（Miku 第一次需要曲目事实时才加载）。
//   读音乐页 music:build 生成的 trackProfiles.generated.json（docs/music-design.md A3.2），不再 glob 原始档案：
//   原始档案里有导入记录（网易云贡献者昵称、网页摘录）和 notePrivate 的原话，打进公开 chunk 就等于公开了；
//   生成文件只留公开字段，notePrivate 的曲目根本不写 note。
//   生成文件里的 mood 已按「人标 > 草稿 > 导入 > 自动 > 专辑默认」合并并带出处，这里按出处拆回人标、草稿与专辑三层，
//   trackMood.ts 的合并逻辑原样不动；自动层仍直接读 trackFeatures.generated.json。
import features from '../data/trackFeatures.generated.json';
import profiles from '../data/trackProfiles.generated.json';
import type { AutoFeatures, MoodLayer, TrackNotes } from './trackMood';
import type { TrackProfilesDocument } from '../types/music';

const layerFrom = (mood: Record<string, unknown> | undefined, provenance: Record<string, string>, source: string) => {
  if (!mood) return undefined;
  const layer = Object.fromEntries(Object.entries(mood).filter(([key]) => provenance[`mood.${key}`] === source));
  return Object.keys(layer).length ? (layer as MoodLayer) : undefined;
};

export const trackMoodLayers = () => {
  const auto = (features as unknown as { tracks: Record<string, AutoFeatures> }).tracks;
  const tracks = (profiles as unknown as TrackProfilesDocument).tracks;
  const ids = new Set([...Object.keys(auto), ...Object.keys(tracks)]);
  const out: Record<string, { manual?: MoodLayer; draft?: MoodLayer; album?: MoodLayer; auto?: AutoFeatures; notes: TrackNotes }> = {};
  for (const id of ids) {
    const profile = tracks[id];
    const mood = profile?.mood as Record<string, unknown> | undefined;
    out[id] = {
      manual: profile ? layerFrom(mood, profile.provenance, 'manual') : undefined,
      draft: profile ? layerFrom(mood, profile.provenance, 'draft') : undefined,
      album: profile ? layerFrom(mood, profile.provenance, 'album') : undefined,
      auto: auto[id],
      notes: { note: profile?.note, noteVisitor: profile?.noteVisitor, notePrivate: profile?.notePrivate },
    };
  }
  return out;
};
