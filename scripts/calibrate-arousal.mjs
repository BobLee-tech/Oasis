#!/usr/bin/env node
// 🎚 arousal 权重校准（docs/miku-design.md A2.3）：npm run song:calibrate
//   读 music-data/tracks/<id>.json 里你人标过的 mood.arousal（≥ 8 首），在单纯形上拟合四项权重，
//   打印新旧权重的 Spearman；新权重 ≥ 0.7 且不比旧的差才写入 music-data/arousal-weights.json，
//   之后重跑 song:analyze 生效。
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_AROUSAL_WEIGHTS, fitArousalWeights, spearman } from './lib/track-features.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FEATURES = path.join(ROOT, 'src/data/trackFeatures.generated.json');
const PROFILE_DIR = path.join(ROOT, 'music-data/tracks');
const WEIGHTS_FILE = path.join(ROOT, 'music-data/arousal-weights.json');
const KEYS = ['loudness', 'onsets', 'centroid', 'tempo'];

const features = JSON.parse(await readFile(FEATURES, 'utf8')).tracks;
const labelled = [];
for (const name of (await readdir(PROFILE_DIR)).filter(n => n.endsWith('.json'))) {
  const profile = JSON.parse(await readFile(path.join(PROFILE_DIR, name), 'utf8'));
  const target = profile.mood?.arousal;
  const f = features[profile.id];
  if (typeof target === 'number' && f?.percentiles) labelled.push({ id: profile.id, target, p: f.percentiles });
}
if (labelled.length < 8) {
  console.log(`人标 arousal 只有 ${labelled.length} 首，至少要 8 首才校准（在 music-data/tracks/<id>.json 写 "mood": { "arousal": 0..1 }）`);
  process.exit(0);
}

const predict = w => labelled.map(l => KEYS.reduce((s, k) => s + w[k] * l.p[k], 0));
const targets = labelled.map(l => l.target);
const current = { ...DEFAULT_AROUSAL_WEIGHTS, ...(await readFile(WEIGHTS_FILE, 'utf8').then(JSON.parse).catch(() => ({}))).weights };
const fitted = fitArousalWeights(labelled.map(l => l.p), targets);
const before = spearman(predict(current), targets);
const after = spearman(predict(fitted), targets);
console.log(`${labelled.length} 首人标 · 现有权重 ρ=${before.toFixed(3)} ${JSON.stringify(current)}`);
console.log(`拟合权重 ρ=${after.toFixed(3)} ${JSON.stringify(fitted)}`);
if (after >= 0.7 && after >= before) {
  await mkdir(path.dirname(WEIGHTS_FILE), { recursive: true });
  await writeFile(WEIGHTS_FILE, `${JSON.stringify({ weights: fitted, spearman: Number(after.toFixed(3)), samples: labelled.length, fittedAt: new Date().toISOString().slice(0, 10) }, null, 2)}\n`);
  console.log(`已写入 ${path.relative(ROOT, WEIGHTS_FILE)}；运行 npm run song:analyze -- --all 生效`);
} else {
  console.log('相关度不够（需 ≥ 0.7 且不低于现有权重），保持原权重；可先多标几首或改用专辑默认');
}
