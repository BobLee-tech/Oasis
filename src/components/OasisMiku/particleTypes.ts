// 🎐 粒子事件的最小共享类型——被 useMikuBrain（发射方）和 MikuParticles（渲染方）同时引用，
//   单独拆出来是为了不让一个 hook 去 import 一个 .tsx 组件文件。
export type ParticleKind = 'hearts' | 'notes' | 'zzz' | 'burst' | 'petal';

export interface ParticleEvent {
  kind: ParticleKind;
  /** hearts/notes 用，控制这一下发射几颗；zzz/burst/petal 数量固定，忽略此项 */
  count?: number;
}
