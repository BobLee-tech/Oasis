// 🎐 Live2D 画布：只管「画她、加载她、把控制面板递出去」，不关心她该说什么、该看哪——
//   那是 useMikuBrain 的事。这里保持纯粹，方便日后换皮肤/换模型。
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { Application, Point } from 'pixi.js';
import type { Live2DModel } from 'pixi-live2d-display/cubism4';
import { loadLive2DRuntime } from './live2dRuntime';

// Cubism4 的核心模型在类型层只声明为 object，实际方法要在这里补一层最小接口
interface CoreModelLike {
  setParameterValueById: (id: string, value: number, weight?: number) => void;
  getParameterValueById: (id: string) => number;
}

export interface MikuStageHandle {
  /** 视线跟随：传入的是屏幕坐标（clientX/clientY），内部换算成画布局部坐标 */
  focus: (clientX: number, clientY: number, instant?: boolean) => void;
  /** 自主看向某处，不依赖真实鼠标——用于触屏设备的自发左右张望 */
  focusNormalized: (x: number, y: number, instant?: boolean) => void;
  /** priority 默认 NORMAL(2)，优先于自动待机；传 3(FORCE) 可打断另一段正在播放的 NORMAL 动作（例如摸醒正在打瞌睡的她） */
  playMotion: (group: string, index?: number, priority?: number) => void;
  setParam: (id: string, value: number, weight?: number) => void;
  /** 读当前帧的参数值——用于在动作片段自己的曲线之上叠加效果，而不是整个盖掉 */
  getParam: (id: string) => number;
  /** 逐 drawable 精确命中：返回屏幕坐标落在哪些部件网格内（model3.json 的 HitAreas 是空的，
   *  这里直接用 drawable 包围盒兜底）。约定跳过 `D_REF` 前缀——那是建模参考层，不参与交互。
   *  具体「命中了哪些 drawable → 算摸到了哪个身体分区」的语义由调用方（useMikuBrain）决定，
   *  换一具模型 drawable 命名对不上也只是返回空数组，不会报错。 */
  hitTestDrawables: (clientX: number, clientY: number) => string[];
}

interface Live2DStageProps {
  modelUrl: string;
  width: number;
  height: number;
  reduceMotion: boolean;
  onReady?: () => void;
  onError?: (error: unknown) => void;
}

export const Live2DStage = forwardRef<MikuStageHandle, Live2DStageProps>(function Live2DStage(
  { modelUrl, width, height, reduceMotion, onReady, onError },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const modelRef = useRef<Live2DModel | null>(null);

  useImperativeHandle(ref, () => ({
    focus: (clientX, clientY, instant) => {
      const model = modelRef.current;
      const canvas = appRef.current?.view as HTMLCanvasElement | undefined;
      if (!model || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      model.focus(clientX - rect.left, clientY - rect.top, instant);
    },
    focusNormalized: (x, y, instant) => {
      modelRef.current?.internalModel.focusController.focus(x, y, instant);
    },
    playMotion: (group, index, priority) => {
      void modelRef.current?.motion(group, index, priority ?? 2);
    },
    setParam: (id, value, weight) => {
      const core = modelRef.current?.internalModel.coreModel as unknown as CoreModelLike | undefined;
      core?.setParameterValueById(id, value, weight);
    },
    getParam: (id) => {
      const core = modelRef.current?.internalModel.coreModel as unknown as CoreModelLike | undefined;
      return core?.getParameterValueById(id) ?? 0;
    },
    hitTestDrawables: (clientX, clientY) => {
      const model = modelRef.current;
      const canvas = appRef.current?.view as HTMLCanvasElement | undefined;
      if (!model || !canvas) return [];
      const rect = canvas.getBoundingClientRect();
      const local = { x: clientX - rect.left, y: clientY - rect.top } as unknown as Point;
      const modelPos = model.toModelPosition(local, { x: 0, y: 0 } as unknown as Point);
      const im = model.internalModel;
      const hits: string[] = [];
      for (const id of im.getDrawableIDs()) {
        if (id.startsWith('D_REF')) continue; // 建模参考层，不可见，不参与交互
        const b = im.getDrawableBounds(im.getDrawableIndex(id));
        if (modelPos.x >= b.x && modelPos.x <= b.x + b.width && modelPos.y >= b.y && modelPos.y <= b.y + b.height) {
          hits.push(id);
        }
      }
      return hits;
    },
  }), []);

  useEffect(() => {
    let cancelled = false;
    let app: Application | null = null;
    let model: Live2DModel | null = null;

    (async () => {
      try {
        const { PIXI, Live2DModel: ModelCtor } = await loadLive2DRuntime();
        if (cancelled || !containerRef.current) return;

        app = new PIXI.Application({
          width,
          height,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
        });
        containerRef.current.appendChild(app.view as unknown as HTMLCanvasElement);
        appRef.current = app;

        // autoInteract 关闭：命中区域与点击语义由 useMikuBrain 按站点自己的规则接管
        model = await ModelCtor.from(modelUrl, { autoInteract: false });
        if (cancelled) { model.destroy(); return; }

        const scale = height / model.internalModel.originalHeight;
        model.scale.set(scale);
        model.anchor.set(0.5, 1);
        model.x = width / 2;
        model.y = height;

        app.stage.addChild(model);
        modelRef.current = model;

        // 仅开发环境:挂个调试口子到 window，方便控制台里读 drawable 列表 / 手动 setParam 找动作关键帧，
        // 生产构建里 import.meta.env.DEV 会被静态裁掉，零成本
        if (import.meta.env.DEV) {
          (window as unknown as { __miku?: unknown }).__miku = { model, app };
        }

        if (reduceMotion) app.ticker.stop();

        onReady?.();
      } catch (e) {
        onError?.(e);
      }
    })();

    const handleVisibility = () => {
      const currentApp = appRef.current;
      if (!currentApp) return;
      if (document.hidden) currentApp.ticker.stop();
      else if (!reduceMotion) currentApp.ticker.start();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      model?.destroy();
      app?.destroy(true, { children: true });
      modelRef.current = null;
      appRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl, width, height]);

  // 尊重 prefers-reduced-motion：中途切换时同步暂停/恢复渲染循环
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    if (reduceMotion) app.ticker.stop();
    else if (!document.hidden) app.ticker.start();
  }, [reduceMotion]);

  return <div ref={containerRef} className="w-full h-full" />;
});
