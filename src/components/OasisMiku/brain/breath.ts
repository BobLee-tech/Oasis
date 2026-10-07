// 🫁 呼吸：采用 Live2D CubismBreath 的互质周期（互质 → 叠加后永不整齐重复）。
// 库内置的那层 CubismBreath 已在 Live2DStage 里关掉（它在 AngleX 上有 ±7.5° 的慢摆，和这里叠成两层，
// 头一直在晃），所以这里是唯一的呼吸源：幅度取内置版的约 1/3——看得出在呼吸，但不再「飘」。
// 呼吸不会因 Tap/Flick 让位；人做手势时也不会暂停呼吸。
import type { MikuStageHandle } from '../Live2DStage';

const BREATH = [
  { id: 'ParamAngleX', offset: 0, peak: 2.5, cycle: 6.5345, absolute: false },
  { id: 'ParamAngleY', offset: 0, peak: 1.4, cycle: 3.5345, absolute: false },
  { id: 'ParamAngleZ', offset: 0, peak: 1.8, cycle: 5.5345, absolute: false },
  { id: 'ParamBodyAngleX', offset: 0, peak: 0.9, cycle: 15.5345, absolute: false },
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
