#!/usr/bin/env node
//
// 🎧 曲库入库一键流程：源文件（flac/mp3/m4a/wav） → 归档进 public/audio/<专辑>/
//    → 转码 AAC 256k → 传 R2（oasis-audio 桶）→ 校验线上可访问
//    → 生成 PLAYLIST 代码行并复制到剪贴板
//
// 用法：npm run song -- <文件或文件夹> [选项]
//      npm run song -- ~/Downloads/千本桜.flac
//      npm run song -- ~/Downloads/某专辑/ --album "2024.03.09 [Album] 某专辑"
//
// 选项：
//   --album <名>     归档到 public/audio/<名>/。默认：传文件夹时取其目录名，传散曲时用 Miku
//   --category <名>  PLAYLIST 的 category 字段，默认按专辑/艺术家推断
//   --dry            只演练：解析元数据 + 打印代码行，不落盘、不转码、不上传
//
// ⚠️ 这一步只负责搬运字节 + 算出能填的字段，**不会自动改 useSoundscape.ts**。
//    color（情绪色）与 excerpt（那一句）留给你手挑——那是这个播放器最好的部分，
//    自动生成的平均色和空歌词只会让曲库出现二等公民。见 docs/audio-hosting.md。
//
import { mkdir, copyFile, readdir, stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PROJECT_ROOT = '/Users/nai/Developer/Oasis';
const REMOTE = 'oasis-r2:oasis-audio';
const PUBLIC_BASE = 'https://audio.boblee.dev';
const SRC_DIR = path.join(PROJECT_ROOT, 'public/audio');   // flac 源，gitignored、不部署
const OUT_DIR = path.join(PROJECT_ROOT, 'dist-audio');     // 转码产物，gitignored
const PLAYLIST_FILE = path.join(PROJECT_ROOT, 'src/hooks/useSoundscape.ts');
const AUDIO_EXTS = new Set(['.flac', '.mp3', '.m4a', '.wav', '.aif', '.aiff']);

// 分类 → id 前缀 / 默认情绪色（沿用曲库里已经定好的那几支）
const CATEGORY_META = {
  Miku:      { prefix: 'm', color: '#39C5BB' },
  Yorushika: { prefix: 'y', color: '#6EE7B7' },
  Atarayo:   { prefix: 'a', color: '#818CF8' },
};

const run = (cmd, args) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { stdio: ['pipe', 'inherit', 'inherit'] });
  p.on('error', reject);
  p.on('close', code => (code === 0 ? resolve() : reject(new Error(`${cmd} 退出码 ${code}`))));
});

const capture = (cmd, args) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args);
  let out = '';
  p.stdout.on('data', d => { out += d; });
  p.on('error', reject);
  p.on('close', code => (code === 0 ? resolve(out) : reject(new Error(`${cmd} 退出码 ${code}`))));
});

const copyToClipboard = (text) => new Promise((resolve, reject) => {
  const p = spawn('pbcopy');
  p.on('error', reject);
  p.on('close', code => (code === 0 ? resolve() : reject(new Error('pbcopy 失败'))));
  p.stdin.write(text);
  p.stdin.end();
});

// 🏷️ 读内嵌标签：ffprobe 就在手边（转码本来就依赖 ffmpeg），不必再引 npm 依赖
const probe = async (file) => {
  try {
    const json = JSON.parse(await capture('ffprobe', [
      '-v', 'quiet', '-print_format', 'json', '-show_format', file,
    ]));
    const tags = json.format?.tags ?? {};
    const pick = (...keys) => {
      for (const k of Object.keys(tags)) {
        if (keys.includes(k.toLowerCase())) return String(tags[k]).trim();
      }
      return '';
    };
    return {
      title: pick('title', '©nam'),
      artist: pick('artist', 'albumartist', '©art'),
      album: pick('album', '©alb'),
      duration: Number(json.format?.duration) || 0,
    };
  } catch {
    return { title: '', artist: '', album: '', duration: 0 };
  }
};

// 📄 文件名兜底：曲库里的命名是 "01 - 靴の花火.flac" / "08.Last Night,Good Night.mp3"，
//    去掉前面的曲序，剩下的就是曲名。标签缺失时用这个。
const titleFromFilename = (base) =>
  base.replace(/^\d{1,3}\s*[-.、]\s*/, '').replace(/\s+/g, ' ').trim() || base;

const fmtDuration = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// 🚨 路径一致性是这套流程唯一的硬约束（见 CLAUDE.md）：PLAYLIST 里的 url、
//    public/audio 下的源文件、R2 上的 key 三者必须逐字节相同。首尾空格和连续空格
//    是最常见的隐形杀手（肉眼看不出，URL 编码后变成 %20%20），这里提前掐掉。
const normalizeFilename = (name) => {
  const ext = path.extname(name);
  const base = path.basename(name, ext).replace(/\s+/g, ' ').trim();
  return `${base}${ext.toLowerCase()}`;
};

const collectAudio = async (input) => {
  const st = await stat(input);
  if (st.isFile()) {
    if (!AUDIO_EXTS.has(path.extname(input).toLowerCase())) throw new Error(`不是音频文件：${input}`);
    return [input];
  }
  const entries = await readdir(input, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && AUDIO_EXTS.has(path.extname(e.name).toLowerCase()))
    .map(e => path.join(input, e.name))
    .sort((a, b) => a.localeCompare(b, 'ja'));
};

// 🔢 下一个可用 id：扫现有 PLAYLIST，取同前缀里最大的序号 +1。
//    Yorushika 用的是 y_<年份>_<曲序> 的嵌套命名，这里只保证「不撞号」，
//    真要沿用嵌套风格自己改一下即可——id 是不透明字符串，改了不影响任何逻辑。
const nextIds = (source, prefix, count) => {
  const taken = new Set([...source.matchAll(/id: '([^']+)'/g)].map(m => m[1]));
  const nums = [...source.matchAll(new RegExp(`id: '${prefix}_(?:\\d+_)?(\\d+)'`, 'g'))]
    .map(m => Number(m[1]));
  let n = (nums.length ? Math.max(...nums) : 0) + 1;
  const ids = [];
  while (ids.length < count) {
    const id = `${prefix}_${String(n).padStart(2, '0')}`;
    if (!taken.has(id)) ids.push(id);
    n += 1;
  }
  return ids;
};

const inferCategory = (album, artist) => {
  const hay = `${album} ${artist}`.toLowerCase();
  if (/miku|初音|ミク/.test(hay)) return 'Miku';
  if (/yorushika|ヨルシカ/.test(hay)) return 'Yorushika';
  if (/atarayo|あたらよ/.test(hay)) return 'Atarayo';
  return '';
};

const parseArgs = (argv) => {
  const opts = { inputs: [], album: '', category: '', dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry') opts.dry = true;
    else if (a === '--album') opts.album = argv[++i] ?? '';
    else if (a === '--category') opts.category = argv[++i] ?? '';
    else if (a.startsWith('--')) throw new Error(`未知选项：${a}`);
    else opts.inputs.push(a);
  }
  return opts;
};

const main = async () => {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.inputs.length) {
    console.log('用法：npm run song -- <文件或文件夹> [--album <名>] [--category <名>] [--dry]');
    process.exit(1);
  }

  for (const cmd of ['ffmpeg', 'ffprobe', 'rclone']) {
    try { await capture('command', ['-v', cmd]); }
    catch { /* command 在非交互 shell 下不可用，交给后续调用自己报错 */ }
  }

  // —— 收集待入库的文件 ——
  const files = [];
  for (const input of opts.inputs) {
    const abs = path.resolve(input.replace(/^~/, process.env.HOME ?? '~'));
    if (!existsSync(abs)) throw new Error(`路径不存在：${abs}`);
    files.push(...await collectAudio(abs));
  }
  if (!files.length) throw new Error('没找到音频文件');

  // —— 定专辑目录 ——
  const firstInput = path.resolve(opts.inputs[0].replace(/^~/, process.env.HOME ?? '~'));
  const inputIsDir = (await stat(firstInput)).isDirectory();
  const album = opts.album || (inputIsDir ? path.basename(firstInput) : 'Miku');
  if (!opts.album && !inputIsDir) {
    console.log('ℹ️  未指定 --album，散曲归入 Miku/（与现有 3 首 Miku 同一目录）\n');
  }

  const albumDir = path.join(SRC_DIR, album);
  console.log(`🎼 ${files.length} 个文件 → public/audio/${album}/\n`);

  const playlistSource = await readFile(PLAYLIST_FILE, 'utf8');
  const rows = [];

  for (const [i, src] of files.entries()) {
    const filename = normalizeFilename(path.basename(src));
    const label = `[${i + 1}/${files.length}]`;
    if (filename !== path.basename(src)) {
      console.log(`${label} 🧹 文件名清理：「${path.basename(src)}」→「${filename}」`);
    }

    const meta = await probe(src);
    const title = meta.title || titleFromFilename(path.basename(filename, path.extname(filename)));
    const artist = meta.artist || 'Hatsune Miku';
    const category = opts.category || inferCategory(album || meta.album, artist) || 'Miku';

    const destSrc = path.join(albumDir, filename);
    const rel = `${album}/${path.basename(filename, path.extname(filename))}.m4a`;
    const outFile = path.join(OUT_DIR, rel);
    const publicUrl = `${PUBLIC_BASE}/${rel.split('/').map(encodeURIComponent).join('/')}`;

    console.log(`${label} 🎵 ${title} — ${artist}${meta.duration ? ` (${fmtDuration(meta.duration)})` : ''}`);

    if (!opts.dry) {
      // 1) 归档源文件（public/audio 是 gitignored 的本地母带库，转码永远从这里出发）
      await mkdir(albumDir, { recursive: true });
      if (path.resolve(src) !== destSrc) await copyFile(src, destSrc);

      // 2) 转码：与 scripts/transcode-audio.sh 完全一致的参数
      await mkdir(path.dirname(outFile), { recursive: true });
      if (existsSync(outFile)) {
        console.log('      ⏭  已转码过，跳过');
      } else {
        await run('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', destSrc,
          '-map', 'a:0', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', outFile]);
      }

      // 3) 上传 R2
      await run('rclone', ['copyto', outFile, `${REMOTE}/${rel}`, '--s3-no-check-bucket']);

      // 4) 校验线上真的能取到——这一步专治空格/日文转义不一致导致的静默 404
      const code = (await capture('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-m', '15', '-I', publicUrl])).trim();
      if (code !== '200') throw new Error(`线上校验失败（HTTP ${code}）：${publicUrl}`);
      console.log(`      ✅ 已上线 ${publicUrl}`);
    }

    rows.push({ title, artist, category, url: `/audio/${album}/${filename}` });
  }

  // —— 生成 PLAYLIST 代码行 ——
  const prefix = CATEGORY_META[rows[0].category]?.prefix ?? rows[0].category.slice(0, 1).toLowerCase();
  const ids = nextIds(playlistSource, prefix, rows.length);
  const snippet = rows.map((r, i) => {
    const color = CATEGORY_META[r.category]?.color ?? '#39C5BB';
    return `  { id: '${ids[i]}', title: '${r.title.replace(/'/g, "\\'")}', artist: '${r.artist.replace(/'/g, "\\'")}', category: '${r.category}', color: '${color}', excerpt: '', url: '${r.url}' },`;
  }).join('\n');

  console.log('\n' + '─'.repeat(72));
  console.log(snippet);
  console.log('─'.repeat(72));

  // 落点提示：albumGroups 按「相邻同目录」分组（OasisResonance.tsx），
  // 所以必须贴到同专辑那一块里，散着贴会被拆成多个同名分组。
  const anchor = playlistSource.split('\n').findIndex((l, idx, arr) =>
    l.includes(`category: '${rows[0].category}'`) &&
    !(arr[idx + 1] ?? '').includes(`category: '${rows[0].category}'`));
  console.log(`\n📋 已复制到剪贴板。粘到 ${path.relative(PROJECT_ROOT, PLAYLIST_FILE)}${anchor >= 0 ? ` 第 ${anchor + 1} 行之后` : ''}（同专辑必须相邻，否则选碟台会拆成两个同名分组）`);
  console.log(`✍️  还差两笔——每首的 color（情绪色）与 excerpt（那一句），共 ${rows.length} 首：`);
  rows.forEach((r, i) => console.log(`     · ${ids[i]}  ${r.title}`));
  console.log('🎚  粘好之后跑 npm run song:analyze——只分析新加的歌（Miku 的律动/副歌/季节读它）。');
  if (opts.dry) console.log('\n🌵 --dry 演练模式：没有落盘、没有转码、没有上传。');

  await copyToClipboard(snippet);
};

main().catch(err => { console.error(`\n❌ ${err.message}`); process.exit(1); });
