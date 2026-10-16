// 🔺 最小 WebGL2 封装：一个全屏三角形 + 一段片元着色器。涟漪揭页与水琴窟共用。
// 拿不到 WebGL2（老设备、被禁用、上下文丢失）时返回 null，调用方各自回退。

const VERTEX = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

export interface FullscreenProgram {
  gl: WebGL2RenderingContext;
  uniforms: Record<string, WebGLUniformLocation>;
  draw: () => void;
  dispose: () => void;
}

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    if (import.meta.env.DEV) console.warn('[gl]', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

export const createFullscreenProgram = (
  canvas: HTMLCanvasElement,
  fragment: string,
): FullscreenProgram | null => {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const shader = compile(gl, gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram();
  if (!vertex || !shader || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, shader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    if (import.meta.env.DEV) console.warn('[gl]', gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const location = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);

  const uniforms: Record<string, WebGLUniformLocation> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let index = 0; index < count; index += 1) {
    const info = gl.getActiveUniform(program, index);
    const at = info && gl.getUniformLocation(program, info.name);
    if (info && at) uniforms[info.name] = at;
  }

  return {
    gl,
    uniforms,
    draw: () => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose: () => {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(shader);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
};

/** #rrggbb → [r,g,b]（0–1）；解析不了就给中性灰 */
export const hexToRgb = (hex: string): [number, number, number] => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [0.6, 0.65, 0.7];
  const value = parseInt(match[1], 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
};
