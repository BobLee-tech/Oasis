// 🎬 动作调度的唯一出入口：谁想播一段专业动作片段（Tap/Flick/Doze/FlickUp），走这里，不要
//   直接调 stage.playMotion。原因两个：
//
//   ① model3.json 里全部 8 段动作都标了 Loop:true，会一直循环、永远不会「播完」——pixi-live2d-display
//     只在 motionManager.isFinished() 为 true 时才自动切回 Idle 组（见其 update() 源码），而循环动作
//     的 motionQueueEntry 永远不会被标记为 finished。也就是说，一旦播放过一次 Tap，如果没有人显式
//     再切一次动作，模型会卡在 Tap 的循环里再也回不去 Idle。这里的 reacting 窗口结束后主动补一次
//     FORCE 优先级的 Idle，就是这个 bug 的唯一修复点。
//   ② 表情/律动叠加层（Live2DStage 的 offsetsRef）在动作片段播放期间要整体让位，但让位不该是瞬时
//     的——见 setYield 的注释。这里统一管理让位系数从 0→1 / 1→0 的平滑过渡，调用方不用关心细节。
import type { MikuStageHandle } from '../Live2DStage';

const IDLE_MOTION_COUNT = 2; // miku_01 / miku_07，与 model3.json 的 Idle 组一致
const YIELD_TAU_S = 0.18; // 让位淡变时间常数：约 180ms 内完成 0↔1 过渡，快到不显拖沓，慢到不显跳变

export interface PlayOptions {
  /** 传了这个才算「专业动作片段」：接下来这么多毫秒内，表情/律动整体让位，绝不与动作曲线打架 */
  reactMs?: number;
  /** 默认 NORMAL(2)；摸头/滑动等要打断当前动作的交互传 3(FORCE) */
  priority?: number;
}

export class MotionDirector {
  private reactingUntil = 0;
  private needsIdleReturn = false;
  private yieldAlpha = 1;

  play(stage: MikuStageHandle, group: string, index?: number, opts?: PlayOptions) {
    stage.playMotion(group, index, opts?.priority ?? 2);
    if (opts?.reactMs) {
      this.reactingUntil = performance.now() + opts.reactMs;
      this.needsIdleReturn = group !== 'Idle';
    }
  }

  /** 供 RAF 循环之外的触发点（信号监听、可见性回调等）查询「现在方不方便插嘴/接管」 */
  isReacting(): boolean {
    return performance.now() < this.reactingUntil;
  }

  /** 每帧调用一次：推进让位系数、到点了就把动作组交还给 Idle。返回值供本帧其余逻辑分支用 */
  update(stage: MikuStageHandle, dtSec: number): { reacting: boolean; yieldAlpha: number } {
    const reacting = this.isReacting();
    if (!reacting && this.needsIdleReturn) {
      this.needsIdleReturn = false;
      stage.playMotion('Idle', Math.floor(Math.random() * IDLE_MOTION_COUNT), 3);
    }
    const target = reacting ? 0 : 1;
    this.yieldAlpha += (target - this.yieldAlpha) * (1 - Math.exp(-dtSec / YIELD_TAU_S));
    stage.setYield(this.yieldAlpha);
    return { reacting, yieldAlpha: this.yieldAlpha };
  }
}
