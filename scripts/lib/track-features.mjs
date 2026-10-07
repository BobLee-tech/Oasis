// 🎚 曲目特征的纯函数层（docs/miku-design.md A2.3–A2.7）：给 analyze-tracks.mjs 与单测共用。
//   不碰文件、不起进程；输入是解码好的 PCM / 歌词行 / 标题，输出是可追溯的数字。

// ───────────────────────── 基础 ─────────────────────────

/** 曲库内百分位：每个值 → 它在全体里的名次 / (n−1)，并列取平均名次。对母带响度差鲁棒。 */
export const percentileRanks = values => {
  const n = values.length;
  if (n <= 1) return values.map(() => 0.5);
  const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(n);
  for (let i = 0; i < n;) {
    let j = i;
    while (j + 1 < n && order[j + 1][0] === order[i][0]) j++;
    const rank = (i + j) / 2 / (n - 1);
    for (let k = i; k <= j; k++) ranks[order[k][1]] = rank;
    i = j + 1;
  }
  return ranks;
};

export const median = values => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const quantile = (values, q) => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};

const movingAverage = (xs, radius) => {
  const out = new Float64Array(xs.length);
  let sum = 0;
  let count = 0;
  let lo = 0;
  let hi = -1;
  for (let i = 0; i < xs.length; i++) {
    while (hi < Math.min(xs.length - 1, i + radius)) { hi++; sum += xs[hi]; count++; }
    while (lo < i - radius) { sum -= xs[lo]; lo++; count--; }
    out[i] = sum / count;
  }
  return out;
};

// ───────────────────────── 频谱 ─────────────────────────

/** 原地 radix-2 FFT（re/im 长度为 2 的幂）。 */
const fft = (re, im) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
};

/**
 * 一次 STFT 同时得到：谱通量起音包络（半波整流的对数幅度差之和）、逐帧谱质心（Hz）、逐帧 RMS。
 * 默认 11025Hz、窗 1024、hop 256（≈23ms，与设计里 44.1k/hop1024 等价）。
 */
export const analyzeSpectrum = (pcm, sampleRate, { size = 1024, hop = 256 } = {}) => {
  const frames = Math.max(0, Math.floor((pcm.length - size) / hop) + 1);
  const window = new Float64Array(size).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const half = size / 2;
  let prev = new Float64Array(half);
  let cur = new Float64Array(half);
  const flux = new Float64Array(frames);
  const centroid = new Float64Array(frames);
  const rms = new Float64Array(frames);
  const binHz = sampleRate / size;
  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    let energy = 0;
    for (let i = 0; i < size; i++) {
      const s = pcm[off + i];
      energy += s * s;
      re[i] = s * window[i];
      im[i] = 0;
    }
    rms[f] = Math.sqrt(energy / size);
    fft(re, im);
    let num = 0;
    let den = 0;
    let fl = 0;
    for (let k = 1; k < half; k++) {
      const mag = Math.hypot(re[k], im[k]);
      const lm = Math.log1p(100 * mag);
      cur[k] = lm;
      const d = lm - prev[k];
      if (d > 0) fl += d;
      num += k * binHz * mag;
      den += mag;
    }
    flux[f] = f === 0 ? 0 : fl;
    centroid[f] = den > 1e-9 ? num / den : 0;
    [prev, cur] = [cur, prev];
  }
  return { flux, centroid, rms, hopSec: hop / sampleRate };
};

/** 起音密度：通量峰值 / 秒。峰 = 局部极大且高于「局部均值 + 1.5σ」（窗 ±1s）。 */
export const onsetRate = (flux, hopSec) => {
  const radius = Math.max(1, Math.round(1 / hopSec));
  const mean = movingAverage(flux, radius);
  const sq = movingAverage(flux.map(x => x * x), radius);
  let peaks = 0;
  for (let i = 1; i < flux.length - 1; i++) {
    const sd = Math.sqrt(Math.max(0, sq[i] - mean[i] * mean[i]));
    if (flux[i] > flux[i - 1] && flux[i] >= flux[i + 1] && flux[i] > mean[i] + 1.5 * sd) peaks++;
  }
  const seconds = flux.length * hopSec;
  return seconds > 0 ? peaks / seconds : 0;
};

/**
 * 速度：起音包络减 1s 均值后半波整流 → 60–180 BPM 的 lag 自相关 → 乘以中心 110 BPM、σ 一个八度的
 * 对数高斯先验 → 倍频纠错（一半或两倍处得分 ≥ 0.8 倍最大值时，取更接近 110 的那个）。
 */
export const estimateBpm = (flux, hopSec, { center = 110, minBpm = 60, maxBpm = 180 } = {}) => {
  const radius = Math.max(1, Math.round(0.5 / hopSec));
  const mean = movingAverage(flux, radius);
  const env = flux.map((x, i) => Math.max(0, x - mean[i]));
  const lagOf = bpm => 60 / bpm / hopSec;
  // 自相关覆盖到 30 BPM（两倍 lag）以便做倍频比较
  const maxLag = Math.ceil(lagOf(minBpm / 2));
  const minLag = Math.floor(lagOf(maxBpm * 2));
  const ac = new Float64Array(maxLag + 2);
  for (let lag = Math.max(1, minLag); lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < env.length; i++) s += env[i] * env[i + lag];
    ac[lag] = s / (env.length - lag);
  }
  // 分数 lag 的线性插值，让 BPM 不被量化成 hop 的整数倍
  const acAt = lag => {
    const lo = Math.floor(lag);
    const t = lag - lo;
    return (ac[lo] ?? 0) * (1 - t) + (ac[lo + 1] ?? 0) * t;
  };
  const prior = bpm => Math.exp(-0.5 * Math.log2(bpm / center) ** 2);
  let best = 0;
  let bestScore = -Infinity;
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.5) {
    const score = acAt(lagOf(bpm)) * prior(bpm);
    if (score > bestScore) { bestScore = score; best = bpm; }
  }
  if (!(bestScore > 0)) return null;
  const raw = bpm => acAt(lagOf(bpm));
  const candidates = [best, best / 2, best * 2].filter(b => b >= minBpm && b <= maxBpm);
  const top = Math.max(...candidates.map(raw));
  const viable = candidates.filter(b => raw(b) >= 0.8 * top);
  viable.sort((a, b) => Math.abs(Math.log2(a / center)) - Math.abs(Math.log2(b / center)));
  return Math.round(viable[0] * 10) / 10;
};

// ───────────────────────── 副歌 ─────────────────────────

const normalizeLine = text => String(text ?? '')
  .normalize('NFKC')
  .replace(/[\s\p{P}\p{S}]/gu, '')
  .toLowerCase();

/**
 * 歌词法（A2.6①）：找连续 ≥2 行、整块出现 ≥2 次的重复块；出现次数 × 块长最大者记为副歌
 * （并列取更长的块），每次出现取 [首行 startMs, 末行 endMs]。思路即 RefraiD：副歌是被重复的段落。
 */
export const chorusFromLyrics = lines => {
  const usable = lines.filter(l => Number.isFinite(l.startMs) && Number.isFinite(l.endMs));
  const norm = usable.map(l => normalizeLine(l.ja ?? l.text ?? l.zh));
  const n = norm.length;
  const blocks = new Map();
  for (let i = 0; i < n; i++) {
    if (!norm[i]) continue;
    for (let j = i + 1; j < n; j++) {
      if (norm[j] !== norm[i]) continue;
      let len = 0;
      while (j + len < n && i + len < j && norm[i + len] && norm[i + len] === norm[j + len]) len++;
      for (let L = 2; L <= len; L++) {
        const key = norm.slice(i, i + L).join('\n');
        if (!blocks.has(key)) blocks.set(key, L);
      }
    }
  }
  let best = null;
  for (const [key, len] of blocks) {
    const seq = key.split('\n');
    const starts = [];
    for (let i = 0; i + len <= n;) {
      let match = true;
      for (let k = 0; k < len; k++) if (norm[i + k] !== seq[k]) { match = false; break; }
      if (match) { starts.push(i); i += len; } else i++;
    }
    if (starts.length < 2) continue;
    const score = starts.length * len;
    if (!best || score > best.score || (score === best.score && len > best.len)) best = { score, len, starts };
  }
  if (!best) return null;
  return best.starts.map(s => [usable[s].startMs, usable[s + best.len - 1].endMs]);
};

/** 能量法（A2.6②）：0.5s RMS → 4s 平滑 → 高于 75 百分位且持续 ≥ 8s 的段 → 平均能量最高的 2–3 段。 */
export const chorusFromEnergy = (rms, hopSec) => {
  const per = Math.max(1, Math.round(0.5 / hopSec));
  const coarse = [];
  for (let i = 0; i + per <= rms.length; i += per) {
    let s = 0;
    for (let k = 0; k < per; k++) s += rms[i + k] * rms[i + k];
    coarse.push(Math.sqrt(s / per));
  }
  const smooth = movingAverage(coarse, 4);
  const threshold = quantile([...smooth], 0.75);
  // 整首几乎一样响时（≥ 75 分位的帧就是全部）不出结果，避免把整首判成副歌
  const floor = quantile([...smooth], 0.25) * 1.05;
  const segments = [];
  let start = -1;
  for (let i = 0; i <= smooth.length; i++) {
    const on = i < smooth.length && smooth[i] >= threshold && smooth[i] > floor;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      if ((i - start) * 0.5 >= 8) {
        let sum = 0;
        for (let k = start; k < i; k++) sum += smooth[k];
        segments.push({ from: start * 500, to: i * 500, mean: sum / (i - start) });
      }
      start = -1;
    }
  }
  if (!segments.length) return null;
  return segments
    .sort((a, b) => b.mean - a.mean)
    .slice(0, 3)
    .sort((a, b) => a.from - b.from)
    .map(s => [s.from, s.to]);
};

// ───────────────────────── 季语 / 时段 ─────────────────────────

// 季语表：只收意象明确的词；「花」「月」「海」这类四季皆可的词不收（宁可不标，不要标错）
export const SEASON_WORDS = {
  spring: ['春', '桜', 'さくら', 'サクラ', '花びら', '花弁', '菜の花', '卒業', '四月', '三月', '春風', '花曇り', '入学', '芽吹'],
  summer: ['夏', '蝉', 'セミ', '花火', '向日葵', 'ひまわり', '夕立', '入道雲', '風鈴', '八月', '七月', '金魚', '夏祭り', '蛍', 'ラムネ', '陽炎', '夏草', '青嵐'],
  autumn: ['秋', '紅葉', '十月', '九月', '月見', '落ち葉', '落葉', '金木犀', '秋桜', 'コスモス', '鈴虫', '十一月'],
  winter: ['冬', '雪', '十二月', '一月', '白い息', 'マフラー', '凍え', '霜', '木枯らし', 'クリスマス', '吹雪', '二月'],
};

const countHits = (text, words) => words.reduce((sum, w) => {
  let n = 0;
  for (let i = text.indexOf(w); i >= 0; i = text.indexOf(w, i + w.length)) n++;
  return sum + n;
}, 0);

/** 得分 = 3 × 歌题命中 + 1 × 歌词命中；总分 ≥ 3 且最高季占比 ≥ 0.6 才标。 */
export const seasonOf = (title, lyricText) => {
  const scores = Object.fromEntries(Object.entries(SEASON_WORDS).map(([season, words]) =>
    [season, 3 * countHits(title, words) + countHits(lyricText, words)]));
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  if (total < 3) return { season: null, scores };
  const [top, value] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return { season: value / total >= 0.6 ? top : null, scores };
};

export const TIME_WORDS = {
  morning: ['朝', '夜明け', '目覚め', '朝日', '朝焼け', 'おはよ'],
  dusk: ['夕', '黄昏', '夕暮れ', '夕焼け', '茜'],
  night: ['夜', '深夜', '真夜中', '星', '眠れ', '月明かり', '夜空', 'おやすみ'],
};

/** 时段：同季语的计分规则；低唤醒（< 0.35）给「夜」加 1 分——安静的歌更适合夜里。 */
export const timeOf = (title, lyricText, arousal) => {
  const scores = Object.fromEntries(Object.entries(TIME_WORDS).map(([time, words]) =>
    [time, 3 * countHits(title, words) + countHits(lyricText, words)]));
  // 「夜明け」「夕」里也含「夜」「夕」：夜明け 归早晨，从夜里扣回去
  scores.night -= countHits(title, ['夜明け']) * 3 + countHits(lyricText, ['夜明け']);
  if (arousal !== undefined && arousal < 0.35) scores.night += 1;
  const total = Object.values(scores).reduce((a, b) => a + Math.max(0, b), 0);
  if (total < 3) return { time: null, scores };
  const [top, value] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return { time: value / total >= 0.6 ? top : null, scores };
};

// ───────────────────────── 唤醒度 ─────────────────────────

export const DEFAULT_AROUSAL_WEIGHTS = { loudness: 0.35, onsets: 0.25, centroid: 0.2, tempo: 0.2 };

/** arousal_auto = Σ wᵢ · P(xᵢ)；contrast = P(LRA)。输入是每首的原始量，输出与输入同序。 */
export const arousalFromRaw = (raws, weights = DEFAULT_AROUSAL_WEIGHTS) => {
  const P = key => percentileRanks(raws.map(r => r[key] ?? 0));
  const L = P('lufs');
  const O = P('onsetRate');
  const C = P('centroid');
  const T = P('bpm');
  const R = P('lra');
  return raws.map((_, i) => ({
    arousal: round3(weights.loudness * L[i] + weights.onsets * O[i] + weights.centroid * C[i] + weights.tempo * T[i]),
    contrast: round3(R[i]),
    percentiles: { loudness: round3(L[i]), onsets: round3(O[i]), centroid: round3(C[i]), tempo: round3(T[i]) },
  }));
};

export const round3 = x => Math.round(x * 1000) / 1000;

/** Spearman 等级相关（并列取平均名次）。 */
export const spearman = (a, b) => {
  const ra = percentileRanks(a);
  const rb = percentileRanks(b);
  const n = a.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n;
  const mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
};

/**
 * 校准：在「非负、和为 1」的单纯形上按 0.05 的网格搜索使平方误差最小的权重（4 维共 1771 个点，
 * 比写一个带约束的 NNLS 求解器简单且足够准）。percentiles 是 arousalFromRaw 给出的四项百分位。
 */
export const fitArousalWeights = (percentiles, targets, step = 0.05) => {
  const keys = ['loudness', 'onsets', 'centroid', 'tempo'];
  const steps = Math.round(1 / step);
  let best = null;
  for (let a = 0; a <= steps; a++) for (let b = 0; a + b <= steps; b++) for (let c = 0; a + b + c <= steps; c++) {
    const w = [a, b, c, steps - a - b - c].map(x => x / steps);
    let err = 0;
    for (let i = 0; i < targets.length; i++) {
      const pred = keys.reduce((s, k, j) => s + w[j] * percentiles[i][k], 0);
      err += (pred - targets[i]) ** 2;
    }
    if (!best || err < best.err) best = { err, w };
  }
  return Object.fromEntries(keys.map((k, j) => [k, round3(best.w[j])]));
};
