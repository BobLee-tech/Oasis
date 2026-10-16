// 💧 纯器乐 · 水琴窟（docs/music-ripple-notes-demo.html 演示二）。
//
// 水琴窟是埋在地下的倒扣陶瓮：水滴落进去，人只听见回响。这里反过来——听得见琴声，看得见水。
//   · 曲名沉在水底（Canvas 2D 预绘一次），水面折射它
//   · 鼓点（energy.beat 上穿）落一滴，低频定大小；高频是细雨；mood.sections 段落里雨更密
//   · 拿不到频谱（静音、受限浏览器）时按 mood.bpm 合成节拍兜底
//   · 暂停：不再落雨，阻尼让水在两秒内静成镜面，字也就清楚了；静下来后停笔不画
//   · 点 / 拖：你自己的一滴
// 渲染：160×160 高度场（手机 96）→ R16F 纹理 → 一个全屏三角形；只在 active 时订阅 ticker。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getEnergy, getPlaybackTime } from '../../hooks/useSoundscape';
import { useTicker } from '../../lib/ticker';
import { createFullscreenProgram, hexToRgb, type FullscreenProgram } from '../../lib/gl';
import { WaterSim, createBeatGate, goldenDrop } from '../../lib/waterSim';
import { getTrackProfile } from '../../lib/trackProfile';
import type { Track } from '../../types/music';

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uH;
uniform sampler2D uBed;
uniform vec2 uRes;
uniform float uTexel;
uniform vec3 uMood;
uniform float uDark;
out vec4 o;
void main() {
  vec2 uv = vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y);
  float h = texture(uH, uv).r;
  float hl = texture(uH, uv - vec2(uTexel, 0)).r, hr = texture(uH, uv + vec2(uTexel, 0)).r;
  float hu = texture(uH, uv - vec2(0, uTexel)).r, hd = texture(uH, uv + vec2(0, uTexel)).r;
  vec2 g = vec2(hr - hl, hd - hu);
  vec3 n = normalize(vec3(-g * 2.0, 1.0));
  vec3 bed = texture(uBed, uv - g * 0.035).rgb;          // 折射：水底随坡度偏移
  float lap = hl + hr + hu + hd - 4.0 * h;
  float caustic = clamp(-lap * 6.0, 0.0, 1.0);           // 凸面聚光：水底的光纹
  vec3 L = normalize(vec3(-0.5, -0.6, 0.62));             // 左上光
  float diff = dot(n, L) - L.z;
  float spec = pow(max(dot(reflect(-L, n), vec3(0, 0, 1)), 0.0), 80.0);
  vec3 c = bed + uMood * caustic * mix(0.28, 0.42, uDark) + diff * mix(0.14, 0.17, uDark) + vec3(spec) * mix(0.45, 0.5, uDark);
  float a = 1.0 - smoothstep(0.74, 1.0, length((uv - 0.5) * 2.0)); // 圆形羽化：水池没有框
  o = vec4(clamp(c, 0.0, 1.0) * a, a);
}`;

const STEP = 1 / 60;
const PAGE = { light: '#FAF8F3', dark: '#0A0F1D' };

const isDark = () => document.documentElement.classList.contains('dark');
const inSection = (sections: [number, number][] | undefined, ms: number) =>
  Boolean(sections?.some(([from, to]) => ms >= from && ms < to));

interface InstrumentalPondProps {
  track: Track;
  color: string;
  isPlaying: boolean;
  active: boolean;
  compact?: boolean;
  /** 拿不到 WebGL2 时的样子（沿用原来的 CSS 水纹） */
  fallback: React.ReactNode;
}

export const InstrumentalPond: React.FC<InstrumentalPondProps> = ({ track, color, isPlaying, active, compact = false, fallback }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const programRef = useRef<FullscreenProgram | null>(null);
  const texturesRef = useRef<{ height: WebGLTexture; bed: WebGLTexture } | null>(null);
  const [size, setSize] = useState(0);
  const [failed, setFailed] = useState(false);
  const grid = compact ? 96 : 160;
  const sim = useMemo(() => new WaterSim({ size: grid }), [grid]);
  const simRef = useRef(sim);
  useEffect(() => { simRef.current = sim; }, [sim]);

  const drive = useRef({
    accumulator: 0,
    dropCount: 0,
    gate: createBeatGate(),
    silentFor: 0,
    phase: 0,
    still: false,
    checkIn: 0,
    pointer: null as null | { x: number; y: number },
  });

  // 水池尺寸：容器里能放下的最大正方形，下面给一行说明留位置
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize(Math.max(0, Math.floor(Math.min(width, height - 56, compact ? 420 : 600))));
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [compact]);

  // GL：画布尺寸确定后建一次
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size || programRef.current) return;
    const program = createFullscreenProgram(canvas, FRAGMENT);
    if (!program) {
      setFailed(true);
      return;
    }
    const { gl, uniforms } = program;
    const makeTexture = (unit: number) => {
      const texture = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    };
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const height = makeTexture(0);
    const sim = simRef.current!;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, sim.size, sim.size, 0, gl.RED, gl.FLOAT, sim.current);
    const bed = makeTexture(1);
    gl.uniform1i(uniforms.uH, 0);
    gl.uniform1i(uniforms.uBed, 1);
    programRef.current = program;
    texturesRef.current = { height, bed };
    canvas.addEventListener('webglcontextlost', () => setFailed(true), { once: true });
  }, [size]);

  useEffect(() => () => {
    programRef.current?.dispose();
    programRef.current = null;
  }, []);

  // 水底：底色、底石、曲名。换曲、换色、换昼夜、换尺寸时重画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size) return;
    let cancelled = false;
    const paint = async () => {
      const dpr = Math.min(compact ? 1.5 : 2, window.devicePixelRatio || 1);
      const px = Math.round(size * dpr);
      canvas.width = px;
      canvas.height = px;
      try {
        await document.fonts?.load(`600 ${Math.round(px * 0.06)}px "Klee One"`);
      } catch {
        // 字体没到就用回退字体画
      }
      const program = programRef.current;
      const textures = texturesRef.current;
      if (cancelled || !program || !textures) return;
      const dark = isDark();
      const [r, g, b] = hexToRgb(color).map(v => Math.round(v * 255));
      const bed = document.createElement('canvas');
      bed.width = px;
      bed.height = px;
      const ctx = bed.getContext('2d')!;
      ctx.fillStyle = dark ? PAGE.dark : PAGE.light;
      ctx.fillRect(0, 0, px, px);
      const wash = ctx.createRadialGradient(px * 0.5, px * 0.48, 0, px * 0.5, px * 0.5, px * 0.5);
      wash.addColorStop(0, `rgba(${r},${g},${b},${dark ? 0.2 : 0.16})`);
      wash.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, px, px);

      // 底石：固定种子，同一首歌每次都是同一片池底
      let seed = [...track.id].reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7) % 2147483647 || 7;
      const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const stone = dark ? '255,255,255' : '15,23,42';
      for (let index = 0; index < 9; index += 1) {
        const angle = index * 2.39996 + random();
        const radius = (0.18 + 0.22 * random()) * px;
        const x = px * 0.5 + Math.cos(angle) * radius;
        const y = px * 0.5 + Math.sin(angle) * radius * 0.9;
        const s = px * (0.035 + 0.04 * random());
        const shade = ctx.createRadialGradient(x - s * 0.3, y - s * 0.3, s * 0.1, x, y, s);
        shade.addColorStop(0, `rgba(${stone},${dark ? 0.035 : 0.018})`);
        shade.addColorStop(0.85, `rgba(${stone},${dark ? 0.02 : 0.011})`);
        shade.addColorStop(1, `rgba(${stone},0)`);
        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.ellipse(x, y, s, s * 0.78, angle, 0, Math.PI * 2);
        ctx.fill();
      }

      const ink = dark ? '226,232,240' : '30,41,59';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let fontSize = px * 0.068;
      ctx.font = `600 ${fontSize}px "Klee One", "Hiragino Mincho ProN", serif`;
      const fit = px * 0.7;
      const measured = ctx.measureText(track.title).width;
      if (measured > fit) fontSize *= fit / measured;
      ctx.font = `600 ${fontSize}px "Klee One", "Hiragino Mincho ProN", serif`;
      ctx.fillStyle = `rgba(${ink},0.86)`;
      ctx.fillText(track.title, px * 0.5, px * 0.46);
      ctx.fillStyle = `rgba(${ink},0.5)`;
      ctx.font = `${Math.round(px * 0.022)}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.fillText('I N S T R U M E N T A L', px * 0.5, px * 0.555);
      const excerpt = track.excerpt?.replace(/^-+\s*|\s*-+$/g, '').trim();
      if (excerpt) {
        ctx.fillStyle = `rgba(${ink},0.55)`;
        ctx.font = `${Math.round(px * 0.03)}px "Klee One", "LXGW WenKai Screen", serif`;
        ctx.fillText(excerpt, px * 0.5, px * 0.62);
      }

      const { gl } = program;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textures.bed);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bed);
      drive.current.still = false;
    };
    void paint();
    const observer = new MutationObserver(() => void paint());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [size, color, track.id, track.title, track.excerpt, compact]);

  // 换曲：水面清空重来
  useEffect(() => {
    simRef.current?.clear();
    drive.current.still = false;
  }, [track.id]);

  useEffect(() => {
    if (isPlaying) drive.current.still = false;
  }, [isPlaying]);

  useTicker((now, dt) => {
    const program = programRef.current;
    const textures = texturesRef.current;
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!program || !textures || !sim || !canvas) return;
    const state = drive.current;
    const scale = sim.size / 160;

    if (isPlaying) {
      const energy = getEnergy();
      const profile = getTrackProfile(track.id);
      const section = inSection(profile?.mood?.sections, getPlaybackTime() * 1_000);
      const silent = energy.low + energy.mid + energy.high < 0.01;
      state.silentFor = silent ? state.silentFor + dt : 0;

      let beat = state.gate(energy.beat, now);
      if (state.silentFor > 2.5) {
        // 兜底：按 BPM 合成节拍（快歌取半拍）
        const bpm = profile?.mood?.bpm ?? 84;
        const period = 60 / (bpm > 120 ? bpm / 2 : bpm);
        state.phase += dt;
        beat = false;
        if (state.phase >= period) {
          state.phase -= period;
          beat = Math.random() < (section ? 0.95 : 0.62);
        }
      }
      const low = state.silentFor > 2.5 ? 0.5 + 0.3 * Math.sin(now / 1_100) : energy.low;
      if (beat) {
        const spot = goldenDrop(state.dropCount++, Math.random());
        sim.drop(
          spot.x * sim.size,
          spot.y * sim.size,
          (section ? 5 : 3.6) * scale * (0.8 + 0.4 * low) + 0.6,
          (section ? 0.95 : 0.68) * (0.7 + 0.5 * low),
        );
      }
      const high = state.silentFor > 2.5 ? (section ? 0.6 : 0.25) : energy.high;
      if (Math.random() < high * (compact ? 2.4 : 4.8) * dt) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.sqrt(Math.random()) * 0.4 * sim.size;
        sim.drop(sim.size / 2 + Math.cos(angle) * radius, sim.size / 2 + Math.sin(angle) * radius, 1.6 * scale + 0.6, 0.12);
      }
      state.still = false;
    } else if (!state.still && (state.checkIn -= 1) <= 0) {
      // 暂停后水自己静下来；静透了就停笔，不再每帧上传与绘制
      state.checkIn = 30;
      if (sim.restlessness() < 1e-3) state.still = true;
    }
    if (state.still) return;

    state.accumulator += dt;
    let steps = 0;
    while (state.accumulator >= STEP && steps < 3) {
      sim.step();
      state.accumulator -= STEP;
      steps += 1;
    }
    if (steps === 3) state.accumulator = 0;

    const { gl, uniforms } = program;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures.height);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, sim.size, sim.size, gl.RED, gl.FLOAT, sim.current);
    gl.uniform2f(uniforms.uRes, canvas.width, canvas.height);
    gl.uniform1f(uniforms.uTexel, 1 / sim.size);
    gl.uniform3f(uniforms.uMood, ...hexToRgb(color));
    gl.uniform1f(uniforms.uDark, isDark() ? 1 : 0);
    program.draw();
  }, active && !failed && size > 0);

  const toGrid = (event: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sim = simRef.current!;
    return { x: ((event.clientX - rect.left) / rect.width) * sim.size, y: ((event.clientY - rect.top) / rect.height) * sim.size };
  };
  const onPointerDown = (event: React.PointerEvent) => {
    const at = toGrid(event);
    simRef.current?.drop(at.x, at.y, 4.5 * (grid / 160) + 1, 0.7);
    drive.current.pointer = at;
    drive.current.still = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const last = drive.current.pointer;
    if (!last) return;
    const at = toGrid(event);
    if (Math.hypot(at.x - last.x, at.y - last.y) > 3) {
      simRef.current?.drop(at.x, at.y, 2.4, 0.18);
      drive.current.pointer = at;
      drive.current.still = false;
    }
  };
  const endPointer = () => { drive.current.pointer = null; };

  if (failed) return <>{fallback}</>;

  return (
    <div ref={boxRef} className="flex h-full flex-col items-center justify-center">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
          role="img"
          aria-label={`${track.title}：纯器乐。曲名沉在水底，水面随音乐落雨；可以点一下水面`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        />
      </div>
      <p className="mt-3 font-mono text-[10px] tracking-[0.32em] text-slate-400 dark:text-slate-500">
        纯器乐 · 此曲无词，且听水纹
      </p>
    </div>
  );
};
