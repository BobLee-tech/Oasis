#!/usr/bin/env bash
#
# 🎧 批量把 public/audio 下的无损/源文件转码成网页友好的 AAC(.m4a)
#   · 输入：public/audio/**/*.{flac,mp3}
#   · 输出：dist-audio/**/*.m4a（保留相同目录结构，供上传 Cloudflare R2）
#   · 编码：AAC 256k VBR，听感无损、全平台可播（含 iOS Safari），体积约为 FLAC 的 1/5
#
# 用法：bash scripts/transcode-audio.sh
#
set -euo pipefail

SRC_DIR="public/audio"
OUT_DIR="dist-audio"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "❌ 未找到 ffmpeg，请先安装：brew install ffmpeg" >&2
  exit 1
fi

total=$(find "$SRC_DIR" -type f \( -iname '*.flac' -o -iname '*.mp3' \) | wc -l | tr -d ' ')
echo "🎼 共发现 $total 个音频文件，开始转码 → $OUT_DIR"
i=0

find "$SRC_DIR" -type f \( -iname '*.flac' -o -iname '*.mp3' \) -print0 |
while IFS= read -r -d '' src; do
  i=$((i + 1))
  rel="${src#"$SRC_DIR"/}"                 # 相对路径，如 "2017.../01 - xxx.flac"
  out="$OUT_DIR/${rel%.*}.m4a"             # 换成 .m4a
  mkdir -p "$(dirname "$out")"
  if [ -f "$out" ]; then
    echo "[$i/$total] ⏭  已存在，跳过：$rel"
    continue
  fi
  echo "[$i/$total] 🔄 $rel"
  ffmpeg -nostdin -hide_banner -loglevel error -y -i "$src" \
    -map a:0 -c:a aac -b:a 256k -movflags +faststart "$out"
done

echo "✅ 转码完成。输出目录：$OUT_DIR"
echo "   原始大小：$(du -sh "$SRC_DIR" | cut -f1)  →  转码后：$(du -sh "$OUT_DIR" | cut -f1)"
echo "   下一步：把 $OUT_DIR 的内容上传到 Cloudflare R2 bucket 根目录。"
