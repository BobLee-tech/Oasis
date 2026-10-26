// 🧻 纸的工具箱（显卡这一半）：三维场所进场不卡、慢机器不拖。尺牍与园图两个 three.js 引擎共用。
//   · 贴图分帧上传：一口气 initTexture 十几张，转场动画正好卡在那几帧；每帧只传一小份（默认 6 ms）。
//   · 着色器先并行编好再开画：compileAsync 走 KHR_parallel_shader_compile，不在第一帧里同步等编译。
//     画进离屏目标（读信景深、阴影图）的是另一套程序（线性输出、不做色调映射），要连目标一起编。
//   · 像素比调速：只看连着画的帧，平均慢过 24 ms 撑了 1.2 s 才降一档（0.25），最低 1；只降不升，免得来回抖。
import * as THREE from 'three';

export const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));

/** 等浏览器闲下来（Safari 没有 requestIdleCallback，退回一小段 setTimeout） */
export const whenIdle = (timeout = 1500) => new Promise<void>((r) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(() => r(), { timeout }); else setTimeout(r, 80);
});

/** 一个物体树里所有材质用到的贴图（标准材质的 map 们，和 ShaderMaterial 的 uniforms） */
export const texturesOf = (root: THREE.Object3D, out = new Set<THREE.Texture>()) => {
  const take = (v: unknown) => { if (v && (v as THREE.Texture).isTexture) out.add(v as THREE.Texture); };
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    for (const mm of Array.isArray(m) ? m : m ? [m] : []) {
      for (const v of Object.values(mm)) take(v);
      const u = (mm as THREE.ShaderMaterial).uniforms;
      if (u) for (const k in u) take(u[k].value);
    }
  });
  return out;
};

/** 把贴图一张张传进显卡，每帧最多花 budget 毫秒；alive() 为假就停 */
export const uploadSpread = async (renderer: THREE.WebGLRenderer, textures: Iterable<THREE.Texture | null | undefined>, alive: () => boolean, budget = 6) => {
  let t0 = performance.now();
  for (const t of textures) {
    if (!t) continue;
    if (performance.now() - t0 > budget) { await nextFrame(); if (!alive()) return; t0 = performance.now(); }
    renderer.initTexture(t);
  }
};

/** 着色器并行编好：每一项按它的目标（null＝画布，或某个离屏目标）各编一套，全部就绪再返回 */
export const warmPrograms = async (renderer: THREE.WebGLRenderer, jobs: { scene: THREE.Object3D; camera: THREE.Camera; target?: THREE.WebGLRenderTarget | null; lights?: THREE.Scene }[]) => {
  const prev = renderer.getRenderTarget(), waits: Promise<unknown>[] = [];
  try {
    for (const j of jobs) {
      renderer.setRenderTarget(j.target ?? null);   // 编译时读的是「此刻」的目标，所以逐项切过去
      waits.push(renderer.compileAsync(j.scene, j.camera, j.lights ?? null));
    }
  } finally { renderer.setRenderTarget(prev); }
  await Promise.all(waits).catch(() => undefined);
};

/** 像素比调速：每画一帧调 frame(now)；这一帧没画（闲时降帧、静止不画）调 skip()，空档不算进帧时 */
export const dprGovernor = (start: number, apply: (dpr: number) => void, floor = 1) => {
  let dpr = start, ema = 0, slow = 0, last = 0;
  return {
    get dpr() { return dpr; },
    skip() { last = 0; },
    frame(now: number) {
      const dt = last ? now - last : 0; last = now;
      if (!dt || dt > 250) { ema = 0; slow = 0; return; }   // 刚开画、或停过（切走标签页）：重新起算
      ema = ema ? ema + (dt - ema) * 0.1 : dt;
      slow = ema > 24 ? slow + dt : 0;
      if (slow > 1200 && dpr > floor) {
        dpr = Math.max(floor, Math.round((dpr - 0.25) * 4) / 4);
        ema = 0; slow = 0; last = 0;
        apply(dpr);
      }
    },
  };
};
