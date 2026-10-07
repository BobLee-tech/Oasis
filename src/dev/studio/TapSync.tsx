// 边听边打点（docs/music-design.md A4.3）：
//   空格 记下下一行的开始时间（吸附到 ±150ms 内最近的起音）
//   [ / ] 把上一个点微调 ∓50ms        ⌫ 撤回一行        回车 从上一个点前 2 秒重听
// 打完一遍直接试听回放（高亮跟着你打的点走），没问题再写入。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmtTime, type TrackDetail } from './api';
import { computeOnsets, snapToOnset, type OnsetEnvelope } from './onset';
import { player, usePlayerState } from './player';
import { Button, Section } from './ui';
import { cx, inputClass } from './classes';

interface Props {
  detail: TrackDetail;
  seedText: string;
  seedSource: string;
  onCancel?: () => void;
  onCommit: (lines: { startMs: number; ja: string }[]) => void;
}

const splitLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map(line => line.replace(/^\[[\d:.]+\]/, '').trim())
    .filter(Boolean);

export function TapSync({ detail, seedText, seedSource, onCancel, onCommit }: Props) {
  const [text, setText] = useState(seedText);
  const [stage, setStage] = useState<'edit' | 'tap'>('edit');
  const [stamps, setStamps] = useState<number[]>([]);
  const [snap, setSnap] = useState(true);
  const [envelope, setEnvelope] = useState<OnsetEnvelope | null>(null);
  const [envelopeState, setEnvelopeState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const state = usePlayerState();
  const listRef = useRef<HTMLOListElement>(null);
  const lines = useMemo(() => splitLines(text), [text]);
  const url = detail.track?.url ?? '';

  // 起音包络只算一次；解码 5 分钟的 FLAC 在本机约 1–2 秒
  const startTapping = () => {
    setStamps([]);
    player.seek(0);
    setStage('tap');
    if (envelopeState !== 'idle' || !url) return;
    setEnvelopeState('loading');
    computeOnsets(url)
      .then(value => {
        setEnvelope(value);
        setEnvelopeState('ready');
      })
      .catch(() => setEnvelopeState('failed'));
  };

  const stamp = useCallback(() => {
    setStamps(current => {
      if (current.length >= lines.length) return current;
      const raw = player.nowMs();
      const time = snap ? snapToOnset(envelope, raw) : raw;
      const floor = (current[current.length - 1] ?? -1) + 1;
      return [...current, Math.max(time, floor)];
    });
  }, [envelope, lines.length, snap]);

  useEffect(() => {
    if (stage !== 'tap') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (!state.playing && stamps.length === 0) player.play();
        else stamp();
      } else if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        const delta = event.key === '[' ? -50 : 50;
        setStamps(current => {
          if (!current.length) return current;
          const copy = [...current];
          const last = copy.length - 1;
          const lower = (copy[last - 1] ?? -1) + 1;
          copy[last] = Math.max(lower, copy[last] + delta);
          return copy;
        });
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        setStamps(current => current.slice(0, -1));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const last = stamps[stamps.length - 1];
        player.seek(Math.max(0, (last ?? 0) - 2_000));
        player.play();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, stamp, stamps, state.playing]);

  // 回放时高亮：按已打的点找当前行
  const playingIndex = useMemo(() => {
    let found = -1;
    for (let i = 0; i < stamps.length; i += 1) if (stamps[i] <= state.timeMs) found = i;
    return found;
  }, [stamps, state.timeMs]);
  const nextIndex = stamps.length;

  useEffect(() => {
    const target = listRef.current?.querySelector<HTMLElement>(`[data-line="${Math.max(nextIndex, playingIndex)}"]`);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [nextIndex, playingIndex]);

  const done = stamps.length === lines.length && lines.length >= 2;

  if (stage === 'edit') {
    return (
      <div className="space-y-4 p-4">
        <Section
          title="打点 · 准备歌词文本"
          aside={onCancel && <Button onClick={onCancel}>返回</Button>}
        >
          <p className="mb-2 text-[13px] text-slate-600">
            一行一句；空行会被忽略，带 [mm:ss] 时间戳的会被去掉重打。
            {seedSource && <span className="ml-1 text-slate-400">（预填自：{seedSource}）</span>}
          </p>
          <textarea
            className={cx(inputClass, 'h-[50vh] font-[family-name:var(--font-ja)] text-[14px] leading-relaxed')}
            value={text}
            onChange={event => setText(event.target.value)}
            placeholder="粘贴歌词原文，或先在「资料」页签的网页导入里框选歌词"
          />
          <div className="mt-3 flex items-center gap-3">
            <span className="text-[12px] text-slate-500">{lines.length} 行</span>
            <Button
              tone="primary"
              disabled={lines.length < 2}
              onClick={startTapping}
            >
              开始打点
            </Button>
          </div>
        </Section>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <Section
        title={`打点 · ${stamps.length}/${lines.length}`}
        aside={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[12px] text-slate-500">
              <input type="checkbox" checked={snap} onChange={event => setSnap(event.target.checked)} className="accent-[#39C5BB]" />
              吸附起音
              <span className="text-slate-400">
                {envelopeState === 'loading' ? '（分析中…）' : envelopeState === 'failed' ? '（不可用）' : ''}
              </span>
            </label>
            <Button onClick={() => setStage('edit')}>改文本</Button>
            <Button onClick={() => { setStamps([]); player.seek(0); }}>重来</Button>
            {done && (
              <>
                <Button onClick={() => { player.seek(Math.max(0, stamps[0] - 2_000)); player.play(); }}>试听回放</Button>
                <Button tone="primary" onClick={() => onCommit(lines.map((ja, index) => ({ startMs: stamps[index], ja })))}>
                  写入歌词
                </Button>
              </>
            )}
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-black/[0.03] px-3 py-2 text-[12px] text-slate-600">
          <span><kbd className="font-mono">空格</kbd> {stamps.length === 0 && !state.playing ? '开始播放' : '记下一行'}</span>
          <span><kbd className="font-mono">[</kbd> <kbd className="font-mono">]</kbd> 上一个点 ∓50ms</span>
          <span><kbd className="font-mono">⌫</kbd> 撤回</span>
          <span><kbd className="font-mono">回车</kbd> 退回上一个点前 2 秒</span>
          <span className="ml-auto font-mono text-slate-400">{fmtTime(state.timeMs)}</span>
        </div>
        <ol ref={listRef} className="max-h-[58vh] space-y-px overflow-y-auto">
          {lines.map((line, index) => (
            <li
              key={`${index}-${line}`}
              data-line={index}
              className={cx(
                'grid grid-cols-[4.5rem_1fr] gap-2 rounded px-2 py-1 transition-colors',
                index === nextIndex && 'bg-[#FFB7C5]/15 ring-1 ring-[#FFB7C5]/60',
                index === playingIndex && index !== nextIndex && 'bg-[#39C5BB]/10',
              )}
            >
              <button
                type="button"
                disabled={stamps[index] === undefined}
                onClick={() => player.seek(stamps[index])}
                className="text-left font-mono text-[11px] text-slate-400 enabled:hover:text-[#1B7A74]"
              >
                {stamps[index] !== undefined ? fmtTime(stamps[index]) : index === nextIndex ? '▸ 下一行' : ''}
              </button>
              <span className={cx('font-[family-name:var(--font-ja)] text-[14px]', stamps[index] === undefined ? 'text-slate-400' : 'text-slate-800')}>
                {line}
              </span>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
