// 🎐 Live2D 运行时懒加载：Cubism Core 脚本 + pixi.js + pixi-live2d-display，全站只做一次。
//   主包不含分毫这里的体积——只有 Miku 被真正展开时才会拉取，折叠态零成本。

let corePromise: Promise<void> | null = null;

const loadCubismCore = (): Promise<void> => {
  if (corePromise) return corePromise;
  corePromise = new Promise((resolve, reject) => {
    if ((window as unknown as { Live2DCubismCore?: unknown }).Live2DCubismCore) { resolve(); return; }
    const script = document.createElement('script');
    script.src = '/live2d/core/live2dcubismcore.min.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Live2D Cubism Core 加载失败'));
    document.head.appendChild(script);
  });
  return corePromise;
};

type Live2DModelCtor = typeof import('pixi-live2d-display/cubism4').Live2DModel;
type MotionPreloadStrategyNS = typeof import('pixi-live2d-display/cubism4').MotionPreloadStrategy;
type PixiNS = typeof import('pixi.js');

let runtimePromise: Promise<{ PIXI: PixiNS; Live2DModel: Live2DModelCtor; MotionPreloadStrategy: MotionPreloadStrategyNS }> | null = null;

// pixi-live2d-display 在被 import 的那一刻就会去读 window.PIXI.Ticker 把模型的自动更新
// 挂上去，所以必须先把 PIXI 挂到 window，再动态引入它——顺序反了模型就不会自己动。
// 这也是为什么 MotionPreloadStrategy 要跟着 Live2DModel 一起从这个动态 import 里拿，而不是
// 在 Live2DStage.tsx 顶部写一行静态 `import { MotionPreloadStrategy } from 'pixi-live2d-display/cubism4'`——
// 那样的值导入会在模块求值时立刻执行、抢在 window.PIXI 挂上去之前跑，直接炸穿整棵组件树
// （折叠态也会因此被迫提前拉取这整个运行时，等于让「只在展开时才懒加载」的设计整个失效）
export const loadLive2DRuntime = () => {
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    const [PIXI] = await Promise.all([import('pixi.js'), loadCubismCore()]);
    (window as unknown as { PIXI: PixiNS }).PIXI = PIXI;
    const { Live2DModel, MotionPreloadStrategy } = await import('pixi-live2d-display/cubism4');
    return { PIXI, Live2DModel, MotionPreloadStrategy };
  })();
  return runtimePromise;
};
