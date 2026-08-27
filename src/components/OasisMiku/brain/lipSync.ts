// 🎤 口型优先读歌词音拍；没有歌词数据才退回人声频段。空音拍代表前奏/间奏，明确闭嘴。
import type { ActiveLyric } from '../../../hooks/useSoundscape';

type Vowel = 'a' | 'i' | 'u' | 'e' | 'o';
const VOWEL_OF: Record<string, Vowel> = {
  あ:'a', か:'a', さ:'a', た:'a', な:'a', は:'a', ま:'a', や:'a', ら:'a', わ:'a', が:'a', ざ:'a', だ:'a', ば:'a', ぱ:'a', ぁ:'a', ゃ:'a',
  い:'i', き:'i', し:'i', ち:'i', に:'i', ひ:'i', み:'i', り:'i', ぎ:'i', じ:'i', び:'i', ぴ:'i', ぃ:'i',
  う:'u', く:'u', す:'u', つ:'u', ぬ:'u', ふ:'u', む:'u', ゆ:'u', る:'u', ぐ:'u', ず:'u', ぶ:'u', ぷ:'u', ぅ:'u', ゅ:'u',
  え:'e', け:'e', せ:'e', て:'e', ね:'e', へ:'e', め:'e', れ:'e', げ:'e', ぜ:'e', べ:'e', ぺ:'e', ぇ:'e',
  お:'o', こ:'o', そ:'o', と:'o', の:'o', ほ:'o', も:'o', よ:'o', ろ:'o', ご:'o', ぞ:'o', ぼ:'o', ぽ:'o', ぉ:'o', ょ:'o',
};
const FORM_OF = { a: 0.05, i: 0.85, u: -0.75, e: 0.45, o: -0.45 } as const;
const vowelOf = (character: string): Vowel | undefined => {
  const code = character.codePointAt(0) ?? 0;
  const hiragana = code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : character;
  return VOWEL_OF[hiragana];
};

export class LipSync {
  private open = 0;
  private form = 0;

  update(dtSec: number, lyric: ActiveLyric | null, midEnergy: number, own: boolean) {
    let target = 0;
    let formTarget = 0;

    if (lyric) {
      const progress = lyric.progress();
      const beat = lyric.beats.find(item => progress >= item.from && progress < item.to);
      if (beat) {
        const t = (progress - beat.from) / Math.max(1e-4, beat.to - beat.from);
        target = Math.sin(Math.PI * Math.min(1, t * 1.12)) ** 0.7;
        target *= 0.45 + midEnergy * 0.55;
        const vowel = vowelOf(beat.text[0]);
        formTarget = vowel ? FORM_OF[vowel] : 0.1;
      }
    } else {
      target = midEnergy * 0.85;
    }

    if (!own) { target *= 0.3; formTarget *= 0.4; }
    const tau = target > this.open ? 0.045 : 0.11;
    this.open += (target - this.open) * (1 - Math.exp(-dtSec / tau));
    this.form += (formTarget - this.form) * (1 - Math.exp(-dtSec / 0.13));
    return { open: this.open, form: this.form };
  }
}
