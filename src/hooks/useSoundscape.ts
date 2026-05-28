// src/hooks/useSoundscape.ts
import { useState, useCallback, useEffect } from 'react';
import type { Track, MusicCategory } from '../types/music';

// 💽 极致高保真本地黑胶曲库 (83首 · 歌词与编码终极校对版)
export const PLAYLIST: Track[] = [
  // ==========================================
  // 🎸 YORUSHIKA (ヨルシカ) 阵营
  // ==========================================
  
  // 💿 2017.06.28 [Album] 夏草る (情绪色：初夏薄荷 #6EE7B7)
  // ⚠️ 已在代码中移除了 01 和 03 的空格，请确保你的文件也删除了空格！
  { id: 'y_17_01', title: '夏陰、ピアノを弾く', artist: 'Yorushika', category: 'Yorushika', color: '#6EE7B7', lyric: '君の匂いがする', url: '/audio/2017.06.28 [Album] 夏草/01 - 夏陰、ピアノを弾く.flac' },
  { id: 'y_17_02', title: 'カトレア', artist: 'Yorushika', category: 'Yorushika', color: '#6EE7B7', lyric: '貴方にはわからないよ', url: '/audio/2017.06.28 [Album] 夏草/02 - カトレア.flac' },
  { id: 'y_17_03', title: '言って。', artist: 'Yorushika', category: 'Yorushika', color: '#6EE7B7', lyric: '言って、あのね、私実は気付いてるの', url: '/audio/2017.06.28 [Album] 夏草/03 - 言って。.flac' },
  { id: 'y_17_04', title: 'あの夏に咲け', artist: 'Yorushika', category: 'Yorushika', color: '#6EE7B7', lyric: '君の笑った顔を見たいから', url: '/audio/2017.06.28 [Album] 夏草/04 - あの夏に咲け.flac' },
  { id: 'y_17_05', title: '飛行', artist: 'Yorushika', category: 'Yorushika', color: '#6EE7B7', lyric: '空を飛べたら', url: '/audio/2017.06.28 [Album] 夏草/05 - 飛行.flac' },
  { id: 'y_17_06', title: '靴の花火', artist: 'Yorushika', category: 'Yorushika', color: '#6EE7B7', lyric: 'ねぇ、ねぇ、何か言おうとして', url: '/audio/2017.06.28 [Album] 夏草/06 - 靴の花火.flac' },
  { id: 'y_17_07', title: '雲と幽霊', artist: 'Yorushika', category: 'Yorushika', color: '#6EE7B7', lyric: '幽霊になった僕は', url: '/audio/2017.06.28 [Album] 夏草/07 - 雲と幽霊.flac' },

  // 💿 2018.05.09 [Album] 負け犬にアンコールはいらない (情绪色：冷雾灰蓝 #94A3B8)
  { id: 'y_18_01', title: '前世', artist: 'Yorushika', category: 'Yorushika', color: '#94A3B8', lyric: '生まれ変わったら', url: '/audio/2018.05.09 [Album] 負け犬にアンコールはいらない/01 - 前世.flac' },
  { id: 'y_18_02', title: '負け犬にアンコールはいらない', artist: 'Yorushika', category: 'Yorushika', color: '#94A3B8', lyric: 'アンコールはいらない', url: '/audio/2018.05.09 [Album] 負け犬にアンコールはいらない/02 - 負け犬にアンコールはいらない.flac' },
  { id: 'y_18_03', title: '爆弾魔', artist: 'Yorushika', category: 'Yorushika', color: '#94A3B8', lyric: 'どうせならもう、全部が爆発してしまえばいい', url: '/audio/2018.05.09 [Album] 負け犬にアンコールはいらない/03 - 爆弾魔.flac' },
  { id: 'y_18_04', title: 'ヒッチコック', artist: 'Yorushika', category: 'Yorushika', color: '#94A3B8', lyric: '先生、人生相談です', url: '/audio/2018.05.09 [Album] 負け犬にアンコールはいらない/04 - ヒッチコック.flac' },
  { id: 'y_18_05', title: '落下', artist: 'Yorushika', category: 'Yorushika', color: '#94A3B8', lyric: '深く落ちていく', url: '/audio/2018.05.09 [Album] 負け犬にアンコールはいらない/05 - 落下.flac' },
  { id: 'y_18_06', title: '準透明少年', artist: 'Yorushika', category: 'Yorushika', color: '#94A3B8', lyric: '透明な僕のままで', url: '/audio/2018.05.09 [Album] 負け犬にアンコールはいらない/06 - 準透明少年.flac' },
  { id: 'y_18_07', title: 'ただ君に晴れ', artist: 'Yorushika', category: 'Yorushika', color: '#94A3B8', lyric: '追いつけないまま大人になって', url: '/audio/2018.05.09 [Album] 負け犬にアンコールはいらない/07 - ただ君に晴れ.flac' },
  { id: 'y_18_08', title: '冬眠', artist: 'Yorushika', category: 'Yorushika', color: '#94A3B8', lyric: '春を待っている', url: '/audio/2018.05.09 [Album] 負け犬にアンコールはいらない/08 - 冬眠.flac' },
  { id: 'y_18_09', title: '夏、バス停、君を待つ', artist: 'Yorushika', category: 'Yorushika', color: '#94A3B8', lyric: '君のいない夏', url: '/audio/2018.05.09 [Album] 負け犬にアンコールはいらない/09 - 夏、バス停、君を待つ.flac' },

  // 💿 2019.04.10 [Album] 僕は音楽を辞めた (情绪色：晚霞紫粉 #F472B6)
  { id: 'y_19_01', title: '8_31', artist: 'Yorushika', category: 'Yorushika', color: '#F472B6', lyric: '--- 夏の終わり ---', url: '/audio/2019.04.10 [Album] 僕は音楽を辞めた/01 - 8_31.flac' },
  { id: 'y_19_02', title: '藍二乗', artist: 'Yorushika', category: 'Yorushika', color: '#F472B6', lyric: 'ただ、君の目を引きたくて', url: '/audio/2019.04.10 [Album] 僕は音楽を辞めた/02 - 藍二乗.flac' },
  { id: 'y_19_03', title: '八月、某、月明かり', artist: 'Yorushika', category: 'Yorushika', color: '#F472B6', lyric: '人生なんて妥協の連続だ', url: '/audio/2019.04.10 [Album] 僕は音楽を辞めた/03 - 八月、某、月明かり.flac' },
  { id: 'y_19_04', title: '詩書きとコーヒー', artist: 'Yorushika', category: 'Yorushika', color: '#F472B6', lyric: 'コーヒーが冷める前に', url: '/audio/2019.04.10 [Album] 僕は音楽を辞めた/04 - 詩書きとコーヒー.flac' },
  { id: 'y_19_05', title: '7_13', artist: 'Yorushika', category: 'Yorushika', color: '#F472B6', lyric: '--- 雨音 ---', url: '/audio/2019.04.10 [Album] 僕は音楽を辞めた/05 - 7_13.flac' },
  { id: 'y_19_06', title: '踊ろうぜ', artist: 'Yorushika', category: 'Yorushika', color: '#F472B6', lyric: '馬鹿みたいに踊ろうぜ', url: '/audio/2019.04.10 [Album] 僕は音楽を辞めた/06 - 踊ろうぜ.flac' },
  { id: 'y_19_07', title: '六月は雨上がりの街を書く', artist: 'Yorushika', category: 'Yorushika', color: '#F472B6', lyric: '雨上がりの街を書く', url: '/audio/2019.04.10 [Album] 僕は音楽を辞めた/07 - 六月は雨上がりの街を書く.flac' },
  { id: 'y_19_08', title: '五月は花緑青の窓辺から', artist: 'Yorushika', category: 'Yorushika', color: '#F472B6', lyric: '花緑青の窓辺から', url: '/audio/2019.04.10 [Album] 僕は音楽を辞めた/08 - 五月は花緑青の窓辺から.flac' },
  { id: 'y_19_09', title: '夜紛い', artist: 'Yorushika', category: 'Yorushika', color: '#F472B6', lyric: '君のいない夜なんて', url: '/audio/2019.04.10 [Album] 僕は音楽を辞めた/09 - 夜紛い.flac' },
  { id: 'y_19_10', title: '5_6', artist: 'Yorushika', category: 'Yorushika', color: '#F472B6', lyric: '--- 静寂 ---', url: '/audio/2019.04.10 [Album] 僕は音楽を辞めた/10 - 5_6.flac' },
  { id: 'y_19_11', title: 'パレード', artist: 'Yorushika', category: 'Yorushika', color: '#F472B6', lyric: 'このままどこか遠くへ', url: '/audio/2019.04.10 [Album] 僕は音楽を辞めた/11 - パレード.flac' },
  { id: 'y_19_12', title: 'エルマ', artist: 'Yorushika', category: 'Yorushika', color: '#F472B6', lyric: 'エルマ、君なんだよ', url: '/audio/2019.04.10 [Album] 僕は音楽を辞めた/12 - エルマ.flac' },
  { id: 'y_19_13', title: '4_10', artist: 'Yorushika', category: 'Yorushika', color: '#F472B6', lyric: '--- 旅立ち ---', url: '/audio/2019.04.10 [Album] 僕は音楽を辞めた/13 - 4_10.flac' },
  { id: 'y_19_14', title: '僕は音楽を辞めた', artist: 'Yorushika', category: 'Yorushika', color: '#F472B6', lyric: '間違ってないよな、間違ってないよな', url: '/audio/2019.04.10 [Album] 僕は音楽を辞めた/14 - 僕は音楽を辞めた.flac' },

  // 💿 2019.06.24 [Single] 心に穴が空いた (情绪色：深空天蓝 #38BDF8)
  { id: 'y_19s_01', title: '心に穴が空いた', artist: 'Yorushika', category: 'Yorushika', color: '#38BDF8', lyric: 'ぽっかりと空いたその穴を', url: '/audio/2019.06.24 [Single] 心に穴が空いた/01. 心に穴が空いた.flac' },

  // 💿 2019.08.28 [Album] エルマ (情绪色：日落琥珀 #FBBF24)
  { id: 'y_19e_01', title: '車窓', artist: 'Yorushika', category: 'Yorushika', color: '#FBBF24', lyric: '--- 窓の外 ---', url: '/audio/2019.08.28 [Album] エルマ/01 - 車窓.flac' },
  { id: 'y_19e_02', title: '憂一乗', artist: 'Yorushika', category: 'Yorushika', color: '#FBBF24', lyric: '憂鬱に乗せて', url: '/audio/2019.08.28 [Album] エルマ/02 - 憂一乗.flac' },
  { id: 'y_19e_03', title: '夕凪、某、花惑い', artist: 'Yorushika', category: 'Yorushika', color: '#FBBF24', lyric: '夕凪に咲く花', url: '/audio/2019.08.28 [Album] エルマ/03 - 夕凪、某、花惑い.flac' },
  { id: 'y_19e_04', title: '雨とカプチーノ', artist: 'Yorushika', category: 'Yorushika', color: '#FBBF24', lyric: '灰色に白んだ言葉はカプチーノみたいな色してる', url: '/audio/2019.08.28 [Album] エルマ/04 - 雨とカプチーノ.flac' },
  { id: 'y_19e_05', title: '湖の街', artist: 'Yorushika', category: 'Yorushika', color: '#FBBF24', lyric: '--- 波紋 ---', url: '/audio/2019.08.28 [Album] エルマ/05 - 湖の街.flac' },
  { id: 'y_19e_06', title: '神様のダンス', artist: 'Yorushika', category: 'Yorushika', color: '#FBBF24', lyric: '神様が踊る', url: '/audio/2019.08.28 [Album] エルマ/06 - 神様のダンス.flac' },
  { id: 'y_19e_07', title: '雨晴るる', artist: 'Yorushika', category: 'Yorushika', color: '#FBBF24', lyric: '空が晴れるように', url: '/audio/2019.08.28 [Album] エルマ/07 - 雨晴るる.flac' },
  { id: 'y_19e_08', title: '歩く', artist: 'Yorushika', category: 'Yorushika', color: '#FBBF24', lyric: 'ただ歩く', url: '/audio/2019.08.28 [Album] エルマ/08 - 歩く.flac' },
  { id: 'y_19e_09', title: '心に穴が空いた', artist: 'Yorushika', category: 'Yorushika', color: '#FBBF24', lyric: '心に穴が空いたまま', url: '/audio/2019.08.28 [Album] エルマ/09 - 心に穴が空いた.flac' },
  { id: 'y_19e_10', title: '森の教会', artist: 'Yorushika', category: 'Yorushika', color: '#FBBF24', lyric: '--- 祈り ---', url: '/audio/2019.08.28 [Album] エルマ/10 - 森の教会.flac' },
  { id: 'y_19e_11', title: '声', artist: 'Yorushika', category: 'Yorushika', color: '#FBBF24', lyric: '君の声が', url: '/audio/2019.08.28 [Album] エルマ/11 - 声.flac' },
  { id: 'y_19e_12', title: 'エイミー', artist: 'Yorushika', category: 'Yorushika', color: '#FBBF24', lyric: 'エイミー、君は僕の', url: '/audio/2019.08.28 [Album] エルマ/12 - エイミー.flac' },
  { id: 'y_19e_13', title: '海底、月明かり', artist: 'Yorushika', category: 'Yorushika', color: '#FBBF24', lyric: '--- 沈む ---', url: '/audio/2019.08.28 [Album] エルマ/13 - 海底、月明かり.flac' },
  { id: 'y_19e_14', title: 'ノーチラス', artist: 'Yorushika', category: 'Yorushika', color: '#FBBF24', lyric: '喉の奥に引っかかった言葉を', url: '/audio/2019.08.28 [Album] エルマ/14 - ノーチラス.flac' },

  // 💿 2020.07.29 [Album] 盗作 (情绪色：玫瑰朱红 #FB7185)
  { id: 'y_20_01', title: '音楽泥棒の自白', artist: 'Yorushika', category: 'Yorushika', color: '#FB7185', lyric: '--- 自白 ---', url: '/audio/2020.07.29 [Album] 盗作/01 - 音楽泥棒の自白.flac' },
  { id: 'y_20_02', title: '昼鳶', artist: 'Yorushika', category: 'Yorushika', color: '#FB7185', lyric: '飛んでいく', url: '/audio/2020.07.29 [Album] 盗作/02 - 昼鳶.flac' },
  { id: 'y_20_03', title: '春ひさぎ', artist: 'Yorushika', category: 'Yorushika', color: '#FB7185', lyric: '愛を売っている', url: '/audio/2020.07.29 [Album] 盗作/03 - 春ひさぎ.flac' },
  { id: 'y_20_04', title: '爆弾魔 (Re-Recording)', artist: 'Yorushika', category: 'Yorushika', color: '#FB7185', lyric: '全部が爆発してしまえばいい', url: '/audio/2020.07.29 [Album] 盗作/04 - 爆弾魔 (Re-Recording).flac' },
  { id: 'y_20_05', title: '青年期、空き巣', artist: 'Yorushika', category: 'Yorushika', color: '#FB7185', lyric: '--- 空っぽ ---', url: '/audio/2020.07.29 [Album] 盗作/05 - 青年期、空き巣.flac' },
  { id: 'y_20_06', title: 'レプリカント', artist: 'Yorushika', category: 'Yorushika', color: '#FB7185', lyric: '僕らはレプリカント', url: '/audio/2020.07.29 [Album] 盗作/06 - レプリカント.flac' },
  { id: 'y_20_07', title: '花人局', artist: 'Yorushika', category: 'Yorushika', color: '#FB7185', lyric: '騙されて', url: '/audio/2020.07.29 [Album] 盗作/07 - 花人局.flac' },
  { id: 'y_20_08', title: '朱夏期、音楽泥棒', artist: 'Yorushika', category: 'Yorushika', color: '#FB7185', lyric: '--- 泥棒 ---', url: '/audio/2020.07.29 [Album] 盗作/08 - 朱夏期、音楽泥棒.flac' },
  { id: 'y_20_09', title: '盗作', artist: 'Yorushika', category: 'Yorushika', color: '#FB7185', lyric: '君の言葉を盗んだ', url: '/audio/2020.07.29 [Album] 盗作/09 - 盗作.flac' },
  { id: 'y_20_10', title: '思想犯', artist: 'Yorushika', category: 'Yorushika', color: '#FB7185', lyric: '他人に優しい君に', url: '/audio/2020.07.29 [Album] 盗作/10 - 思想犯.flac' },
  { id: 'y_20_11', title: '逃亡', artist: 'Yorushika', category: 'Yorushika', color: '#FB7185', lyric: 'どこまでも逃げていく', url: '/audio/2020.07.29 [Album] 盗作/11 - 逃亡.flac' },
  { id: 'y_20_12', title: '幼年期、思い出の中', artist: 'Yorushika', category: 'Yorushika', color: '#FB7185', lyric: '--- 記憶 ---', url: '/audio/2020.07.29 [Album] 盗作/12 - 幼年期、思い出の中.flac' },
  { id: 'y_20_13', title: '夜行', artist: 'Yorushika', category: 'Yorushika', color: '#FB7185', lyric: '夜の底を歩いていた', url: '/audio/2020.07.29 [Album] 盗作/13 - 夜行.flac' },
  { id: 'y_20_14', title: '花に亡霊', artist: 'Yorushika', category: 'Yorushika', color: '#FB7185', lyric: 'もう忘れてしまったかな', url: '/audio/2020.07.29 [Album] 盗作/14 - 花に亡霊.flac' },

  // 💿 2023.04.05 [Album] 幻燈 (情绪色：晨曦暖黄 #FDE047)
  { id: 'y_23_01', title: '都落ち', artist: 'Yorushika', category: 'Yorushika', color: '#FDE047', lyric: '落ちていく', url: '/audio/2023.04.05 [Album] 幻燈/01 - 都落ち.flac' },
  { id: 'y_23_02', title: 'ブレーメン', artist: 'Yorushika', category: 'Yorushika', color: '#FDE047', lyric: '歩いていく、ただ歩いていく', url: '/audio/2023.04.05 [Album] 幻燈/02 - ブレーメン.flac' },
  { id: 'y_23_03', title: 'チノカテ', artist: 'Yorushika', category: 'Yorushika', color: '#FDE047', lyric: '夕日が落ちるまで', url: '/audio/2023.04.05 [Album] 幻燈/03 - チノカテ.flac' },
  { id: 'y_23_04', title: '月に吠える', artist: 'Yorushika', category: 'Yorushika', color: '#FDE047', lyric: '月に吠える', url: '/audio/2023.04.05 [Album] 幻燈/04 - 月に吠える.flac' },
  { id: 'y_23_05', title: '451', artist: 'Yorushika', category: 'Yorushika', color: '#FDE047', lyric: '燃えていく', url: '/audio/2023.04.05 [Album] 幻燈/05 - 451.flac' },
  { id: 'y_23_06', title: '又三郎', artist: 'Yorushika', category: 'Yorushika', color: '#FDE047', lyric: '風が吹くのを待っている', url: '/audio/2023.04.05 [Album] 幻燈/06 - 又三郎.flac' },
  { id: 'y_23_07', title: '老人と海', artist: 'Yorushika', category: 'Yorushika', color: '#FDE047', lyric: '海を見る', url: '/audio/2023.04.05 [Album] 幻燈/07 - 老人と海.flac' },
  { id: 'y_23_08', title: '左右盲', artist: 'Yorushika', category: 'Yorushika', color: '#FDE047', lyric: '右も左もわからないまま', url: '/audio/2023.04.05 [Album] 幻燈/08 - 左右盲.flac' },
  { id: 'y_23_09', title: 'アルジャーノン', artist: 'Yorushika', category: 'Yorushika', color: '#FDE047', lyric: '少しずつ忘れていく', url: '/audio/2023.04.05 [Album] 幻燈/09 - アルジャーノン.flac' },
  { id: 'y_23_10', title: '第一夜', artist: 'Yorushika', category: 'Yorushika', color: '#FDE047', lyric: '--- 幻燈 ---', url: '/audio/2023.04.05 [Album] 幻燈/10 - 第一夜.flac' },

  // ==========================================
  // 🌃 ATARAYO (あたらよ) 阵营
  // ==========================================

  // 💿 夜明け前 (情绪色：深夜靛蓝 #818CF8)
  { id: 'a_01', title: '10月無口な君を忘れる', artist: 'Atarayo', category: 'Atarayo', color: '#818CF8', lyric: '10月、無口な君を忘れるくらい', url: '/audio/Atarayo (あたらよ) - 夜明け前/01. 10月無口な君を忘れる.flac' },
  { id: 'a_02', title: '夏霞', artist: 'Atarayo', category: 'Atarayo', color: '#818CF8', lyric: '夏の匂いがした', url: '/audio/Atarayo (あたらよ) - 夜明け前/02. 夏霞.flac' },
  { id: 'a_03', title: '晴るる', artist: 'Atarayo', category: 'Atarayo', color: '#818CF8', lyric: '晴れ渡る空に', url: '/audio/Atarayo (あたらよ) - 夜明け前/03. 晴るる.flac' },
  { id: 'a_04', title: '祥月', artist: 'Atarayo', category: 'Atarayo', color: '#818CF8', lyric: '月が綺麗だね', url: '/audio/Atarayo (あたらよ) - 夜明け前/04. 祥月.flac' },
  { id: 'a_05', title: '8.8', artist: 'Atarayo', category: 'Atarayo', color: '#818CF8', lyric: '8.8の空', url: '/audio/Atarayo (あたらよ) - 夜明け前/05. 8.8.flac' },
  { id: 'a_06', title: 'ピアス', artist: 'Atarayo', category: 'Atarayo', color: '#818CF8', lyric: '耳に残る君の声', url: '/audio/Atarayo (あたらよ) - 夜明け前/06. ピアス.flac' },
  { id: 'a_07', title: '嘘つき', artist: 'Atarayo', category: 'Atarayo', color: '#818CF8', lyric: '君は嘘つきだ', url: '/audio/Atarayo (あたらよ) - 夜明け前/07. 嘘つき.flac' },

  // 💿 季億の箱 (情绪色：记忆薰衣草 #C084FC)
  { id: 'a_08', title: 'ただ好きと言えたら', artist: 'Atarayo', category: 'Atarayo', color: '#C084FC', lyric: 'ただ好きと言えたらよかったのに', url: '/audio/Atarayo (あたらよ) - 季億の箱/01. ただ好きと言えたら.flac' },
  { id: 'a_09', title: '今夜2人だけのダンスを', artist: 'Atarayo', category: 'Atarayo', color: '#C084FC', lyric: '今夜、二人だけの', url: '/audio/Atarayo (あたらよ) - 季億の箱/02. 今夜2人だけのダンスを.flac' },
  { id: 'a_10', title: '夏が来るたび', artist: 'Atarayo', category: 'Atarayo', color: '#C084FC', lyric: '君のいない夏が来る', url: '/audio/Atarayo (あたらよ) - 季億の箱/03. 夏が来るたび.flac' },
  { id: 'a_11', title: '僕らはそれを愛と呼んだ', artist: 'Atarayo', category: 'Atarayo', color: '#C084FC', lyric: '僕らはそれを愛と呼んだんだ', url: '/audio/Atarayo (あたらよ) - 季億の箱/04. 僕らはそれを愛と呼んだ.flac' },

  // ==========================================
  // 🌸 MIKU (初音ミク) 阵营
  // ==========================================

  // 💿 Miku 专属 (情绪色：初音绿 #39C5BB)
  { id: 'm_01', title: 'Last Night, Good Night (Re-Dialed)', artist: 'Hatsune Miku', category: 'Miku', color: '#39C5BB', lyric: 'Last night, Good night... 今夜は眠ろう', url: '/audio/Miku/08 - livetune feat. 初音ミク - Last Night,Good Night(Re-Dialed).flac' },
  { id: 'm_02', title: 'Last Night, Good Night', artist: 'Hatsune Miku', category: 'Miku', color: '#39C5BB', lyric: 'おやすみ...', url: '/audio/Miku/08.Last Night,Good Night.mp3' },
  { id: 'm_03', title: 'One Way (Original Mix)', artist: 'Hatsune Miku', category: 'Miku', color: '#39C5BB', lyric: 'One way...', url: '/audio/Miku/Aura Qualic feat. 初音ミク Append (Sweet), 初音ミク Append (Dark) - ELATE - 02 - One Way (Original Mix).flac' }
];

export type PlayMode = 'loop' | 'sequence' | 'shuffle';

// ==========================================
// 🛠️ 核心引擎状态
// ==========================================
const globalAudio = new Audio();
globalAudio.volume = 0;

let shuffleBag: number[] = [];
const getNextShuffleIndex = (currentIndex: number) => {
  if (shuffleBag.length === 0) {
    shuffleBag = PLAYLIST.map((_, i) => i).filter(i => i !== currentIndex);
    for (let i = shuffleBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffleBag[i], shuffleBag[j]] = [shuffleBag[j], shuffleBag[i]];
    }
  }
  return shuffleBag.pop() ?? 0;
};

const getDailyTrack = () => {
  const daysSinceEpoch = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const trackIndex = daysSinceEpoch % PLAYLIST.length;
  return PLAYLIST[trackIndex];
};;

let globalCurrentTrack = getDailyTrack();
let globalIsPlaying = false;
let globalVolume = 0.5;
let globalPlayMode: PlayMode = 'loop';

let currentFade: number | null = null;
const cancelFade = () => {
  if (currentFade !== null) {
    cancelAnimationFrame(currentFade);
    currentFade = null;
  }
};

const listeners = new Set<() => void>();
const notifyListeners = () => listeners.forEach(fn => fn());

globalAudio.loop = globalPlayMode === 'loop';

globalAudio.addEventListener('play', () => { globalIsPlaying = true; notifyListeners(); });
globalAudio.addEventListener('pause', () => { globalIsPlaying = false; notifyListeners(); });

globalAudio.addEventListener('ended', () => {
  if (globalPlayMode === 'loop') return; 

  const currentIndex = PLAYLIST.findIndex(t => t.id === globalCurrentTrack.id);
  let nextIndex = 0;

  if (globalPlayMode === 'sequence') {
    nextIndex = (currentIndex + 1) % PLAYLIST.length;
  } else if (globalPlayMode === 'shuffle') {
    nextIndex = getNextShuffleIndex(currentIndex);
  }

  const nextTrack = PLAYLIST[nextIndex];
  globalCurrentTrack = nextTrack;
  globalAudio.src = nextTrack.url;
  globalAudio.setAttribute('data-track-id', nextTrack.id); 
  
  globalAudio.load();
  globalAudio.play().catch(e => console.warn("Auto-next play error", e));
  notifyListeners();
});

export const useSoundscape = () => {
  const [track, setTrack] = useState<Track>(globalCurrentTrack);
  const [isPlaying, setIsPlaying] = useState(globalIsPlaying);
  const [volume, setVolume] = useState(globalVolume);
  const [playMode, setPlayMode] = useState<PlayMode>(globalPlayMode);

  useEffect(() => {
    const updateState = () => {
      setTrack(globalCurrentTrack);
      setIsPlaying(globalIsPlaying);
      setVolume(globalVolume);
      setPlayMode(globalPlayMode);
    };
    listeners.add(updateState);
    return () => { listeners.delete(updateState); };
  }, []);

  const playBGM = useCallback((targetVolume = 0.4, fadeDuration = 2500) => {
    if (globalAudio.getAttribute('data-track-id') !== globalCurrentTrack.id) {
      globalAudio.src = globalCurrentTrack.url;
      globalAudio.setAttribute('data-track-id', globalCurrentTrack.id);
      globalAudio.load();
    }

    cancelFade();
    globalAudio.volume = 0;

    globalAudio.play().then(() => {
      const startTime = performance.now();
      const fadeIn = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / fadeDuration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        globalAudio.volume = targetVolume * ease;
        if (progress < 1) {
            currentFade = requestAnimationFrame(fadeIn);
        }
      };
      currentFade = requestAnimationFrame(fadeIn);
    }).catch(e => console.warn("> Autoplay intercepted", e));
  }, []);

  const playTrack = useCallback((t: Track) => {
    cancelFade();

    if (globalAudio.getAttribute('data-track-id') !== t.id) {
      globalAudio.src = t.url;
      globalAudio.setAttribute('data-track-id', t.id);
      globalCurrentTrack = t;
      globalAudio.load();
      notifyListeners();
    }
    
    globalAudio.volume = globalVolume;
    globalAudio.play().catch(e => console.warn("Play error (Path mismatch or Codec):", e));
  }, []);

  const pauseTrack = useCallback(() => { 
    cancelFade();
    globalAudio.pause(); 
  }, []);

  const togglePlay = useCallback(() => {
    if (globalIsPlaying) {
        pauseTrack();
    } else {
        playTrack(globalCurrentTrack);
    }
  }, [pauseTrack, playTrack]);

  const switchTrack = useCallback((t: Track) => {
    if (t.id === globalCurrentTrack.id) {
        if (!globalIsPlaying) playTrack(t); 
        return;
    }

    cancelFade();

    if (globalIsPlaying) {
      const startTime = performance.now();
      const initialVolume = globalAudio.volume;

      const fadeOut = (currentTime: number) => {
        const progress = Math.min((currentTime - startTime) / 800, 1);
        globalAudio.volume = Math.max(0, initialVolume * (1 - progress));
        
        if (progress < 1) {
          currentFade = requestAnimationFrame(fadeOut);
        } else {
          globalAudio.pause();
          
          globalCurrentTrack = t;
          globalAudio.src = t.url;
          globalAudio.setAttribute('data-track-id', t.id);
          globalAudio.load();
          notifyListeners();
          
          globalAudio.play().catch(e => console.warn("Play error", e));
          
          const startInTime = performance.now();
          const targetVol = globalVolume;
          const fadeIn = (inTime: number) => {
            const inProgress = Math.min((inTime - startInTime) / 1000, 1);
            globalAudio.volume = targetVol * Math.pow(inProgress, 2);
            if (inProgress < 1) {
                currentFade = requestAnimationFrame(fadeIn);
            }
          };
          currentFade = requestAnimationFrame(fadeIn);
        }
      };
      currentFade = requestAnimationFrame(fadeOut);
    } else {
      globalCurrentTrack = t;
      globalAudio.src = t.url;
      globalAudio.setAttribute('data-track-id', t.id);
      globalAudio.load();
      notifyListeners();
    }
  }, [playTrack, globalIsPlaying]);

  const changeVolume = useCallback((val: number) => {
    globalVolume = val;
    globalAudio.volume = val;
    notifyListeners();
  }, []);

  const togglePlayMode = useCallback(() => {
    const modes: PlayMode[] = ['loop', 'sequence', 'shuffle'];
    const nextMode = modes[(modes.indexOf(globalPlayMode) + 1) % modes.length];
    
    globalPlayMode = nextMode;
    globalAudio.loop = nextMode === 'loop'; 
    notifyListeners();
  }, []);

  return { 
    currentTrack: track, 
    isPlaying, 
    volume, 
    playMode, 
    playBGM, 
    togglePlay, 
    switchTrack, 
    changeVolume, 
    togglePlayMode,
    playlist: PLAYLIST 
  };
};