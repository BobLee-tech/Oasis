// 🎐 Live2D 画布：只管「画她、加载她、把控制面板递出去」，不关心她该说什么、该看哪——
//   那是 useMikuBrain 的事。这里保持纯粹，方便日后换皮肤/换模型。
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { Application, Point } from 'pixi.js';
import type { Live2DModel, Cubism4InternalModel } from 'pixi-live2d-display/cubism4';
import { loadLive2DRuntime } from './live2dRuntime';

// Cubism4 的核心模型在类型层只声明为 object，实际方法要在这里补一层最小接口
interface CoreModelLike {
  setParameterValueById: (id: string, value: number, weight?: number) => void;
  addParameterValueById: (id: string, value: number, weight?: number) => void;
  getParameterValueById: (id: string) => number;
}

export interface MikuStageHandle {
  /** 视线跟随：传入的是屏幕坐标（clientX/clientY），内部换算成画布局部坐标 */
  focus: (clientX: number, clientY: number, instant?: boolean) => void;
  /** 自主看向某处，不依赖真实鼠标——用于触屏设备的自发左右张望 */
  focusNormalized: (x: number, y: number, instant?: boolean) => void;
  /** priority 默认 NORMAL(2)，优先于自动待机；传 3(FORCE) 可打断另一段正在播放的 NORMAL 动作（例如摸醒正在打瞌睡的她） */
  playMotion: (group: string, index?: number, priority?: number) => void;
  /** 叠加在动作曲线之上（addParameterValueById）：调用方每帧传入「当前想叠加多少」的快照值，
   *  不是增量——不会跨帧累积。实际施加发生在 model3.json 动作曲线写完参数「之后」
   *  （挂在 pixi-live2d-display 的 afterMotionUpdate 事件上，见下方 effect），
   *  所以既不会被下一轮动作循环悄悄冲掉，也不存在「读回上一帧自己写的值再叠加」那种会失控的积分器。 */
  addParam: (id: string, value: number) => void;
  /** 绝对接管（setParameterValueById）：用于必须完全盖过动作曲线自身表现的参数，比如唱歌时的口型、心情表情。
   *  同样挂在 afterMotionUpdate 之后生效，因此稳赢当前 tick 的动作曲线写入。 */
  overrideParam: (id: string, value: number) => void;
  /** 交还控制权给动作曲线本身——Tap/Flick/Doze 等专业动作片段播放期间，表情/律动整体让位时用它释放。 */
  clearParam: (id: string) => void;
  /** 让位系数：0 = 参数偏移完全不生效（动作曲线独占），1 = 完全生效。由 motionDirector 每帧平滑推进，
   *  取代过去「进出 reacting 窗口瞬时 clearParam」的硬切——见 applyOffsets 里的插值用法。 */
  setYield: (alpha: number) => void;
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
  // 声明式的参数偏移快照：key 是参数 id，value 是「这一刻想施加多少」。真正写进模型的动作
  // 在 afterMotionUpdate 钩子里统一发生（见下方 effect），这里只负责记账，不直接碰 coreModel
  const offsetsRef = useRef(new Map<string, { value: number; mode: 'add' | 'override' }>());
  const yieldRef = useRef(1);

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
    addParam: (id, value) => { offsetsRef.current.set(id, { value, mode: 'add' }); },
    overrideParam: (id, value) => { offsetsRef.current.set(id, { value, mode: 'override' }); },
    clearParam: (id) => { offsetsRef.current.delete(id); },
    setYield: (alpha) => { yieldRef.current = alpha; },
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
    // ref 本身在这枚组件实例存活期间恒定不变（useRef 初始化一次，从不重新赋值）——
    // 提前取一次局部变量只是让 cleanup 里的用法对 exhaustive-deps 更友好，不代表语义有变
    const offsets = offsetsRef.current;

    // 在动作曲线把这一 tick 的参数全部写完之后（而非之前）统一施加偏移，保证：
    // ① 不会被动作曲线的下一次覆盖悄悄冲掉；② physics（头发/衣摆物理）会在这之后才 evaluate，
    // 所以能正确接住我们叠加的摇摆；③ 与 useMikuBrain 的 RAF 循环彻底解耦，不再有谁先谁后的竞态
    //
    // yieldRef 是「让位」的连续系数而非开关：override 从「动作曲线本帧写好的值」向「我们想要的值」
    // 按 alpha 插值（alpha=0 时完全不动它），add 直接按 alpha 缩放叠加量——所以 motionDirector 把
    // alpha 从 1 淡到 0（或反过来）时，参数是连续过渡的，不会在 reacting 窗口进出的那一帧产生跳变
    // （旧版 clearParam 是瞬时的，这正是问题二「表情硬切」的来源之一）
    const applyOffsets = () => {
      const core = model?.internalModel.coreModel as unknown as CoreModelLike | undefined;
      if (!core) return;
      const alpha = yieldRef.current;
      if (alpha <= 0.001) return;
      for (const [id, o] of offsets) {
        if (o.mode === 'add') {
          core.addParameterValueById(id, o.value * alpha);
        } else {
          const cur = core.getParameterValueById(id);
          core.setParameterValueById(id, cur + (o.value - cur) * alpha);
        }
      }
    };

    (async () => {
      try {
        const { PIXI, Live2DModel: ModelCtor, MotionPreloadStrategy } = await loadLive2DRuntime();
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

        // autoInteract 关闭：命中区域与点击语义由 useMikuBrain 按站点自己的规则接管。
        // motionPreload: ALL——8 段动作文件体积很小，全量预载消灭「首次触发某个动作组时
        // 异步取文件、期间没有任何动作在驱动参数」的空窗帧；这个空窗帧正是下面 eyeBlink=undefined
        // 之前，自动眨眼系统会在其中悄悄接管一两帧、动作曲线加载完又把眼睛瞬间掰回去的根源
        // （pixi-live2d-display 只在 motionManager.update 本帧「没有动作在跑」时才驱动自动眨眼）
        model = await ModelCtor.from(modelUrl, { autoInteract: false, motionPreload: MotionPreloadStrategy.ALL });
        if (cancelled) { model.destroy(); return; }
        // 8 段动作片段全部自带手工关键帧的眨眼曲线（ParamEyeLOpen/ROpen），眨眼节奏本就该跟着
        // 动作走；框架自带的独立正弦眨眼定时器只会在上述空窗帧里越俎代庖，直接关掉切断这个来源。
        // eyeBlink 只声明在 Cubism4InternalModel 上，Live2DModel 的 internalModel 字段类型层默认
        // 停在更泛化的基类，这里窄化一下类型才能拿到它——运行时就是同一个对象，不是真的转型
        (model.internalModel as Cubism4InternalModel).eyeBlink = undefined;

        const scale = height / model.internalModel.originalHeight;
        model.scale.set(scale);
        model.anchor.set(0.5, 1);
        model.x = width / 2;
        model.y = height;

        app.stage.addChild(model);
        modelRef.current = model;
        model.internalModel.on('afterMotionUpdate', applyOffsets);

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
      model?.internalModel.off('afterMotionUpdate', applyOffsets);
      model?.destroy();
      app?.destroy(true, { children: true });
      modelRef.current = null;
      appRef.current = null;
      offsets.clear();
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
