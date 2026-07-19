// 🎐 Live2D 画布：只管「画她、加载她、把控制面板递出去」，不关心她该说什么、该看哪——
//   那是 useMikuBrain 的事。这里保持纯粹，方便日后换皮肤/换模型。
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { Application } from 'pixi.js';
import type { Live2DModel } from 'pixi-live2d-display/cubism4';
import { loadLive2DRuntime } from './live2dRuntime';

// Cubism4 的核心模型在类型层只声明为 object，实际方法要在这里补一层最小接口
interface CoreModelLike {
  setParameterValueById: (id: string, value: number, weight?: number) => void;
}

export interface MikuStageHandle {
  /** 视线跟随：传入的是屏幕坐标（clientX/clientY），内部换算成画布局部坐标 */
  focus: (clientX: number, clientY: number, instant?: boolean) => void;
  /** 自主看向某处，不依赖真实鼠标——用于触屏设备的自发左右张望 */
  focusNormalized: (x: number, y: number, instant?: boolean) => void;
  playMotion: (group: string, index?: number) => void;
  setParam: (id: string, value: number, weight?: number) => void;
  /** 是否正在播放 Tap/Flick 等「专业动作片段」——是的话我们的表情混合要让位，别打架 */
  isReacting: () => boolean;
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
    playMotion: (group, index) => {
      // MotionPriority.NORMAL：优先于自动待机动作，但不会打断更高优先级的表演
      void modelRef.current?.motion(group, index, 2);
    },
    setParam: (id, value, weight) => {
      const core = modelRef.current?.internalModel.coreModel as unknown as CoreModelLike | undefined;
      core?.setParameterValueById(id, value, weight);
    },
    isReacting: () => (modelRef.current?.internalModel.motionManager.state.currentPriority ?? 0) >= 2,
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
