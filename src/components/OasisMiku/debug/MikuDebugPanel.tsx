// 🔬 仅开发环境：在 VA 平面上实时画出她的心境点，以及当前曲目心境的每个字段从哪来。
//   Alt+M 开关（index.tsx 里 lazy 引入，生产构建整块裁掉）。以 8Hz 轮询 brain 的调试快照，不进逐帧渲染。
import { useEffect, useState, type RefObject } from 'react';
import { FEELS, FEEL_LABELS, FEEL_VA } from '../../../lib/trackMood';
import type { MikuDebugSnapshot } from '../useMikuBrain';

const SIZE = 132;
const toX = (v: number) => ((v + 1) / 2) * SIZE;
const toY = (a: number) => ((1 - a) / 2) * SIZE;

export default function MikuDebugPanel({ source }: { source: RefObject<MikuDebugSnapshot | null> }) {
  const [snap, setSnap] = useState<MikuDebugSnapshot | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setSnap(source.current ? { ...source.current } : null), 125);
    return () => window.clearInterval(id);
  }, [source]);
  if (!snap) return null;
  const mood = snap.mood;
  const row = (label: string, value: string, prov?: string) => (
    <div className="flex justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span>{value}{prov && <span className="text-slate-400"> · {prov}</span>}</span>
    </div>
  );
  return (
    <div className="fixed left-3 bottom-3 z-[400] w-[230px] rounded-xl border border-white/15 bg-[#0B1020]/88 p-3 font-mono text-[10px] leading-[1.6] text-slate-200 shadow-xl backdrop-blur-md pointer-events-none">
      <div className="mb-1 tracking-[0.14em] text-[#66DED5]">MIKU · AFFECT</div>
      <svg width={SIZE} height={SIZE} className="mx-auto mb-2 block rounded bg-white/5">
        <line x1={SIZE / 2} y1={0} x2={SIZE / 2} y2={SIZE} stroke="rgba(255,255,255,0.15)" />
        <line x1={0} y1={SIZE / 2} x2={SIZE} y2={SIZE / 2} stroke="rgba(255,255,255,0.15)" />
        {Object.entries(FEEL_VA).map(([feel, p]) => (
          <g key={feel}>
            <circle cx={toX(p.v)} cy={toY(p.a)} r={2} fill={mood?.feel === feel ? '#FFB7C5' : 'rgba(255,255,255,0.35)'} />
            <text x={toX(p.v) + 3} y={toY(p.a) - 2} fontSize={7} fill="rgba(255,255,255,0.45)">{feel}</text>
          </g>
        ))}
        <circle cx={toX(snap.target.v)} cy={toY(snap.target.a)} r={5} fill="none" stroke="rgba(102,222,213,0.6)" strokeDasharray="2 2" />
        <circle cx={toX(snap.m.v)} cy={toY(snap.m.a)} r={3.5} fill="#39C5BB" />
        <text x={3} y={SIZE - 3} fontSize={7} fill="rgba(255,255,255,0.35)">V→ A↑</text>
      </svg>
      {/* 情绪色调：十根条；粉色刻度是这首歌标的强度（÷3），黄色是叠上当前段弧线后的；条会被拉向它的 r 倍（缺省 65%，叠上她的底色） */}
      <div className="mb-2 grid grid-cols-[2.2rem_1fr_1.6rem] items-center gap-x-1.5 gap-y-[2px]">
        {FEELS.map(feel => (
          <div key={feel} className="contents">
            <span className="text-slate-400">{FEEL_LABELS[feel]}</span>
            <span className="relative h-[5px] rounded-full bg-white/10">
              <span className="absolute inset-y-0 left-0 rounded-full bg-[#39C5BB]" style={{ width: `${Math.round(snap.tone[feel] * 100)}%` }} />
              {mood?.feels[feel] ? <span className="absolute -inset-y-[2px] w-px bg-[#FFB7C5]" style={{ left: `${(mood.feels[feel]! / 3) * 100}%` }} /> : null}
              {snap.feelsNow?.[feel] && snap.feelsNow[feel] !== mood?.feels[feel] ? <span className="absolute -inset-y-[2px] w-px bg-[#FDE68A]" style={{ left: `${(snap.feelsNow[feel]! / 3) * 100}%` }} /> : null}
            </span>
            <span className="text-right">{snap.tone[feel].toFixed(2)}</span>
          </div>
        ))}
      </div>
      {row('关系', snap.owner ? '站主' : '访客')}
      {row('心境', `V ${snap.m.v.toFixed(2)} · A ${snap.m.a.toFixed(2)}`)}
      {row('情绪', snap.emotion ? `${snap.emotion.kind} ${snap.emotion.intensity.toFixed(2)}` : '—')}
      {row('唤醒', snap.arousal01.toFixed(2))}
      {row('触碰', snap.zone ?? '—')}
      {row('共鸣', `r ${snap.resonance.r.toFixed(2)}${snap.resonance.comfort ? ' · 陪着' : ''}`)}
      {snap.owner && row('倾向', `${snap.lean ? FEEL_LABELS[snap.lean as keyof typeof FEEL_LABELS] : '—'} · 低落连听 ${snap.lowStreak}`)}
      {snap.felt && row('felt', FEELS.filter(feel => snap.felt![feel]).map(feel => `${FEEL_LABELS[feel]}${snap.felt![feel]}`).join(' '))}
      <div className="my-1 h-px bg-white/10" />
      {snap.line ? (
        <>
          {row('规则', `${snap.line.ruleId} · ${snap.line.score}`)}
          {row('场域', snap.line.field)}
          <div className="text-slate-400">{snap.line.addressReason}</div>
        </>
      ) : <div className="text-slate-400">还没说话</div>}
      <div className="my-1 h-px bg-white/10" />
      {mood ? (
        <>
          {row('曲目', snap.trackId ?? '—')}
          {row('feels', FEELS.filter(feel => mood.feels[feel]).map(feel => `${FEEL_LABELS[feel]}${mood.feels[feel]}`).join(' ') || '—', mood.provenance.feels)}
          {mood.blend && row('复合', mood.blend)}
          {row('valence', mood.valence.toFixed(2), mood.provenance.valence)}
          {row('词 / 曲', `${(snap.faceValence ?? mood.lyricValence).toFixed(2)} / ${(snap.soundValence ?? mood.soundValence).toFixed(2)}${mood.split ? ' · 反差' : ''}`)}
          {row('arousal', mood.arousal.toFixed(2), mood.provenance.arousal)}
          {row('bpm', mood.bpm ? String(mood.bpm) : '—', mood.provenance.bpm)}
          {row('副歌', `${snap.chorus ?? '—'} · ${mood.sections.length} 段`, mood.provenance.sections)}
          {row('段落', snap.segment ? `${snap.segment.at}#${snap.segment.n} · ${snap.segment.index + 1}/${mood.segments.length}` : '—')}
          {snap.arc && row('弧线', [snap.arc.dv ? `dv ${snap.arc.dv > 0 ? '+' : ''}${snap.arc.dv}` : '', snap.arc.da ? `da ${snap.arc.da > 0 ? '+' : ''}${snap.arc.da}` : '', ...FEELS.filter(feel => snap.arc!.feels?.[feel]).map(feel => `${FEEL_LABELS[feel]}+${snap.arc!.feels![feel]}`)].filter(Boolean).join(' ') || '—')}
          {row('意象', mood.imagery.join(' ') || '—', mood.provenance.imagery)}
          {row('季节', mood.season ?? '—', mood.provenance.season)}
          {row('律动增益', snap.rhythmGain.toFixed(2))}
        </>
      ) : (
        <div className="text-slate-400">{snap.trackId ? '曲目心境加载中…' : '未在播放'}</div>
      )}
    </div>
  );
}
