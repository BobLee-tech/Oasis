// 六段手势动作首尾不闭合，却都被标成 Loop:true；循环会每 2~5 秒硬拉回起始姿态。
// 手势改成一次性播放，由 MotionDirector 在动作真正结束后接回 Idle。
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const motionIds = ['02', '03', '04', '05', '06', '08'];

for (const id of motionIds) {
  const file = resolve(`public/live2d/miku/motion/miku_${id}.motion3.json`);
  const data = JSON.parse(await readFile(file, 'utf8'));
  data.Meta.Loop = false;
  await writeFile(file, `${JSON.stringify(data, null, '\t')}\n`);
  console.log(`已修正 miku_${id}：Loop=false`);
}
