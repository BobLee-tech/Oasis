// 打点吸附用的起音包络（docs/music-design.md A4.3）：手按空格总会早晚几十毫秒，
// 在 ±150ms 内找最近的起音峰值吸过去。
//
// 包络：单声道 → 一阶差分（粗略高通，突出瞬态）→ 每 512 采样的能量 → 对数 → 半波整流的增量。
// 和 Miku A2.3 的 onset 是同一个思路的轻量版，只在浏览器里给工坊用。
const HOP = 512;

export interface OnsetEnvelope {
  hopMs: number;
  values: Float32Array;
}

export const computeOnsets = async (url: string): Promise<OnsetEnvelope> => {
  const response = await fetch(encodeURI(url));
  if (!response.ok) throw new Error(`音频 HTTP ${response.status}`);
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    const frames = Math.floor(buffer.length / HOP);
    const energy = new Float32Array(frames);
    let previous = 0;
    for (let frame = 0; frame < frames; frame += 1) {
      let sum = 0;
      for (let i = frame * HOP; i < (frame + 1) * HOP; i += 1) {
        let sample = 0;
        for (const channel of channels) sample += channel[i];
        sample /= channels.length;
        const diff = sample - previous;
        previous = sample;
        sum += diff * diff;
      }
      energy[frame] = Math.log1p(sum * 1_000);
    }
    const values = new Float32Array(frames);
    for (let frame = 1; frame < frames; frame += 1) values[frame] = Math.max(0, energy[frame] - energy[frame - 1]);
    return { hopMs: (HOP / buffer.sampleRate) * 1_000, values };
  } finally {
    void context.close();
  }
};

/** 在 ±windowMs 内找最高的起音峰；峰值不够显著（< 局部均值 + 1.5σ）就不吸附。 */
export const snapToOnset = (envelope: OnsetEnvelope | null, ms: number, windowMs = 150) => {
  if (!envelope) return ms;
  const { hopMs, values } = envelope;
  const center = Math.round(ms / hopMs);
  const radius = Math.round(windowMs / hopMs);
  const from = Math.max(1, center - radius);
  const to = Math.min(values.length - 1, center + radius);
  if (to <= from) return ms;
  let best = from;
  let mean = 0;
  for (let i = from; i <= to; i += 1) {
    mean += values[i];
    if (values[i] > values[best]) best = i;
  }
  mean /= to - from + 1;
  let variance = 0;
  for (let i = from; i <= to; i += 1) variance += (values[i] - mean) ** 2;
  const sigma = Math.sqrt(variance / (to - from + 1));
  if (values[best] < mean + 1.5 * sigma) return ms;
  return Math.round(best * hopMs);
};
