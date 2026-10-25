// 🧻 纸的工具箱（着色器这一半）：一张对折的纸怎么弯。尺牍的八行笺在用；以后别的实物（册页、卷）要弯也接这一段。
//   bendify(材质, 参数, 半页) 把弯法注进 three 的标准材质 / 深度材质（影子跟着弯要把同一段挂到 customDepthMaterial）。
import * as THREE from 'three';

/* 纸会弯：uRole 0＝右半页（离折痕的距离 d，整张同一曲率 κ）；1＝左半页（弧长 s 处的切角 ψ(s)）。
   ψ(s) = θ·min(1, s/w)   折痕是宽 w 的圆弧
        + lag·(s/LW)^1.6   边角按角速度滞后
        + κ·s·cosθ         整张微拱（对折时朝向跟着翻，两层才套得住）
   w = lag = κ = 0 时就是原先绕铰链的刚体转动。 */
export const BEND = /* glsl */ `
uniform float uRole, uTheta, uW, uLag, uKappa, uLW;
float ltPsi(float s) {
  float ramp = uW > 0.001 ? min(1.0, s / uW) : 1.0;
  return uTheta * ramp + uLag * pow(s / uLW, 1.6) + uKappa * s * cos(uTheta);
}
void ltBend(inout vec3 p, out vec3 n) {
  if (uRole < 0.5) {
    float d = p.x + uLW * 0.5, c = uKappa * d;
    if (abs(uKappa) > 1e-6) { p.x = sin(c) / uKappa - uLW * 0.5; p.z += (1.0 - cos(c)) / uKappa; }
    n = vec3(-sin(c), 0.0, cos(c));
  } else {
    float s = max(0.0, uLW * 0.5 - p.x), ds = s / 20.0;
    vec2 P = vec2(0.0);
    for (int i = 0; i < 20; i++) { float q = ltPsi((float(i) + 0.5) * ds); P += vec2(-cos(q), sin(q)) * ds; }
    float q = ltPsi(s);
    p.x = P.x + uLW * 0.5; p.z += P.y;
    n = vec3(sin(q), 0.0, cos(q));
  }
}`;
export type BendU = Record<'uTheta' | 'uW' | 'uLag' | 'uKappa' | 'uLW', { value: number }>;
export const bendify = <M extends THREE.Material>(m: M, U: BendU, role: 0 | 1) => {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uRole: { value: role } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + BEND)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal; { vec3 q0 = position; ltBend(q0, objectNormal); }\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3( tangent.xyz );\n#endif')
      .replace('#include <begin_vertex>', 'vec3 transformed = position; { vec3 n0; ltBend(transformed, n0); }');
  };
  return m;
};

