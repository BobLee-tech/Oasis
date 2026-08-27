// 🫁 呼吸：采用 Live2D CubismBreath 的互质周期，但把角度幅度压到动作曲线的 6%~8%。
// 呼吸不会因 Tap/Flick 让位；人做手势时也不会暂停呼吸。
import type { MikuStageHandle } from '../Live2DStage';

const BREATH = [
  { id: 'ParamAngleX', offset: 0, peak: 1.0, cycle: 6.5345, absolute: false },
  { id: 'ParamAngleY', offset: 0, peak: 0.6, cycle: 3.5345, absolute: false },
  { id: 'ParamAngleZ', offset: 0, peak: 0.7, cycle: 5.5345, absolute: false },
  { id: 'ParamBodyAngleX', offset: 0, peak: 0.3, cycle: 15.5345, absolute: false },
  { id: 'ParamBreath', offset: 0.5, peak: 0.5, cycle: 3.2345, absolute: true },
] as const;

export class BreathEngine {
  private t = 0;

  update(stage: MikuStageHandle, dtSec: number) {
    this.t += dtSec;
    for (const breath of BREATH) {
      const value = breath.offset + breath.peak * Math.sin((this.t * Math.PI * 2) / breath.cycle);
      if (breath.absolute) stage.overrideParam(breath.id, value, 1);
      else stage.addParam(breath.id, value, 1);
    }
  }
}
