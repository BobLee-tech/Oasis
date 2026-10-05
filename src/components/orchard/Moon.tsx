// ☾ 今夜的月：钉在画面右上角，不随地图平移缩放——月亮是天上的，不是砂上的。
//
// 质感来自四层，都是静态的（不动、不闪，一个页面只让被操作的东西动）：
//   ① 月晕：冷白的一圈柔光，满月最盛、新月几乎没有；
//   ② 地照：暗面并非纯黑，留一层灰蓝的「灰光」，月轮的整圆因此始终可辨；
//   ③ 亮面：临边昏暗（中心象牙白 → 边缘灰赭）+ 九片月海 + 第谷、哥白尼两个亮坑；
//   ④ 明暗界线用模糊蒙版柔化，不是一刀切开的矢量边。
// 星空按悉尼（南纬 34°）算，月面也按南半球所见倒置：北在下，上弦月亮在左侧。
import React, { useMemo } from 'react';

const SYNODIC = 29.530589;
const EPOCH = Date.parse('2026-01-18T19:52:00Z');   // 一次朔
const DAY = 86400000;

// 月面坐标：单位圆，x 向右、y 向下，北在上（北半球视角）；整体旋转 180° 成南半球所见
const MARIA: [number, number, number, number, number][] = [
  [-.36, -.44, .27, .21, -20], // 雨海
  [.13, -.4, .17, .15, 0],     // 澄海
  [.26, -.1, .22, .17, 10],    // 静海
  [.63, -.3, .12, .1, 0],      // 危海
  [-.6, .02, .24, .42, 12],    // 风暴洋
  [-.2, .36, .2, .13, 0],      // 云海
  [.5, .13, .12, .17, -8],     // 丰富海
  [.33, .3, .09, .08, 0],      // 酒海
  [-.02, -.12, .1, .08, 0],    // 汽海 / 中央湾
];

const phaseName = (age: number) =>
  age < 1 || age > 28.5 ? '朔月' : age < 6.4 ? '蛾眉月' : age < 8.4 ? '上弦月' : age < 13.8 ? '盈凸月'
    : age < 15.8 ? '望月' : age < 21.1 ? '亏凸月' : age < 23.1 ? '下弦月' : '残月';

export const Moon: React.FC<{ now: number }> = ({ now }) => {
  const m = useMemo(() => {
    const ph = (((now - EPOCH) / DAY % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC;
    const age = ph * SYNODIC, illum = (1 - Math.cos(2 * Math.PI * ph)) / 2;
    const R = 20, q = ph < .5 ? ph : 1 - ph, k = Math.cos(2 * Math.PI * q);
    const lit = `M0 ${-R}A${R} ${R} 0 0 1 0 ${R}A${(R * Math.abs(k)).toFixed(2)} ${R} 0 0 ${k > 0 ? 0 : 1} 0 ${-R}Z`;
    return { ph, age, illum, R, lit, name: phaseName(age) };
  }, [now]);
  const { R } = m;
  return (
    <div className="moon-wrap" title="今夜月相 · 悉尼所见（南半球月面倒置）">
      <div className="moon-cap">
        <b>{m.name}</b>
        <span>{Math.round(m.illum * 100)}% · 月龄 {m.age.toFixed(1)}</span>
      </div>
      <svg className="moon" viewBox="-44 -44 88 88" aria-hidden>
        <defs>
          <radialGradient id="moon-halo">
            <stop offset="0" stopColor="#F1F2EA" stopOpacity=".3" />
            <stop offset=".38" stopColor="#E3ECEE" stopOpacity=".1" />
            <stop offset="1" stopColor="#E8EEF0" stopOpacity="0" />
          </radialGradient>
          {/* 临边昏暗：光源略偏亮面一侧，中心不是正中 */}
          <radialGradient id="moon-face" cx=".46" cy=".44" r=".62">
            <stop offset="0" stopColor="#FFFBEF" />
            <stop offset=".6" stopColor="#F0E9D6" />
            <stop offset="1" stopColor="#CDC4AD" />
          </radialGradient>
          <radialGradient id="moon-earthshine" cx=".5" cy=".5" r=".5">
            <stop offset="0" stopColor="#3B4759" />
            <stop offset="1" stopColor="#262F3E" />
          </radialGradient>
          <filter id="moon-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation=".9" /></filter>
          <filter id="moon-mare" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.3" /></filter>
          <mask id="moon-lit" maskUnits="userSpaceOnUse" x="-30" y="-30" width="60" height="60">
            <g transform={m.ph < .5 ? undefined : 'scale(-1 1)'}><path d={m.lit} fill="#fff" filter="url(#moon-soft)" /></g>
          </mask>
          <clipPath id="moon-disc"><circle r={R} /></clipPath>
        </defs>
        <circle r={42} fill="url(#moon-halo)" opacity={.25 + .75 * m.illum} />
        <g transform="rotate(180)">
          <circle r={R} fill="url(#moon-earthshine)" opacity=".85" />
          <g clipPath="url(#moon-disc)" mask="url(#moon-lit)">
            <circle r={R} fill="url(#moon-face)" />
            <g filter="url(#moon-mare)" fill="#8E948F">
              {MARIA.map(([x, y, rx, ry, a], i) => (
                <ellipse key={i} cx={x * R} cy={y * R} rx={rx * R} ry={ry * R} transform={`rotate(${a} ${x * R} ${y * R})`} opacity={.2} />
              ))}
            </g>
            <circle cx={-.12 * R} cy={.72 * R} r={.045 * R} fill="#FFFDF5" opacity=".75" />
            <circle cx={-.3 * R} cy={-.12 * R} r={.035 * R} fill="#FFFDF5" opacity=".7" />
          </g>
          <circle r={R - .3} fill="none" stroke="#F2F5F2" strokeOpacity=".14" strokeWidth=".6" />
        </g>
      </svg>
    </div>
  );
};
