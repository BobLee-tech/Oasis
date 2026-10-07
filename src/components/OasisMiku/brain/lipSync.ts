// 🎤 口型优先读歌词音拍；没有歌词数据才退回人声频段。空音拍代表前奏/间奏，明确闭嘴。
//   汉字拍带读音（读音层，docs/music-design.md A4.4）：按读音的音拍逐拍取元音，不再一律给中性口型。
//   她自己说话（气泡逐字出现）时另有一路 speaking 包络，与唱歌取较大者：边听歌边说话也看得出在说。
import type { ActiveLyric } from '../../../hooks/useSoundscape';
import { splitMora, vowelOfMora, type MoraVowel } from '../../../lib/kana';

// 元音 → 口形（-1 圆口 … +1 扁口）；ん 半闭的鼻音，っ 闭口顿一下
const FORM_OF = { a: 0.05, i: 0.85, u: -0.75, e: 0.45, o: -0.45, n: -0.3 } as const;
const OPEN_OF = { a: 1, i: 0.75, u: 0.7, e: 0.85, o: 0.9, n: 0.25, q: 0 } as const;

/** 当前拍里正在唱的那个音拍：汉字拍按读音逐拍切（「嘘」= う・そ），假名拍就是它自己。 */
const moraAt = (text: string, reading: string | undefined, t: number) => {
  const morae = splitMora(reading ?? text);
  const position = Math.min(morae.length - 1, Math.max(0, Math.floor(t * morae.length)));
  let previous: MoraVowel | undefined;
  for (let i = 0; i < position; i += 1) previous = vowelOfMora(morae[i], previous) ?? previous;
  return {
    vowel: vowelOfMora(morae[position], previous),
    local: t * morae.length - position,
  };
};

export class LipSync {
  private open = 0;
  private form = 0;

  update(dtSec: number, lyric: ActiveLyric | null, midEnergy: number, own: boolean, speaking = 0) {
    let target = 0;
    let formTarget = 0;

    if (lyric) {
      const progress = lyric.progress();
      const beat = lyric.beats.find(item => progress >= item.from && progress < item.to);
      if (beat) {
        const t = (progress - beat.from) / Math.max(1e-4, beat.to - beat.from);
        const { vowel, local } = moraAt(beat.text, beat.reading, t);
        target = Math.sin(Math.PI * Math.min(1, local * 1.12)) ** 0.7;
        target *= (0.45 + midEnergy * 0.55) * (vowel ? OPEN_OF[vowel] : 0.8);
        formTarget = vowel && vowel !== 'q' ? FORM_OF[vowel] : 0.1;
      }
    } else {
      target = midEnergy * 0.85;
    }

    if (!own) { target *= 0.3; formTarget *= 0.4; }
    if (speaking > target) {
      target = speaking;
      // 说话时嘴形偏「い/え」的扁口，和唱歌的圆口区分开
      formTarget = 0.3;
    }
    const tau = target > this.open ? 0.045 : 0.11;
    this.open += (target - this.open) * (1 - Math.exp(-dtSec / tau));
    this.form += (formTarget - this.form) * (1 - Math.exp(-dtSec / 0.13));
    return { open: this.open, form: this.form };
  }
}
