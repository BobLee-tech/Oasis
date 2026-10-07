// 工坊的几个小零件。克制：纸白底、墨色字、初音绿只用在「可以点」和「通过」上，樱粉只标「缺」。
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cx } from './classes';

type Tone = 'primary' | 'quiet' | 'danger';
export const Button = ({ tone = 'quiet', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) => (
  <button
    type="button"
    {...props}
    className={cx(
      'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] transition-colors duration-150',
      'disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oasis-teal',
      tone === 'primary' && 'bg-[#1B7A74] text-white hover:bg-[#16625d]',
      tone === 'quiet' && 'border border-black/10 bg-white/70 text-slate-700 hover:border-black/20 hover:bg-white',
      tone === 'danger' && 'border border-rose-300 bg-white text-rose-700 hover:bg-rose-50',
      className,
    )}
  />
);

/** 出处小字：manual = 你写的，其余是导入来源。 */
const SOURCE_LABELS: Record<string, string> = {
  manual: '你', netease: '网易云', vocadb: 'VocaDB', musicbrainz: 'MusicBrainz', web: '网页',
  tags: '音频标签', album: '专辑默认', auto: '自动', default: '缺省',
};
export const SourceTag = ({ source }: { source?: string }) =>
  source ? (
    <span
      className={cx(
        'rounded px-1 py-px font-mono text-[10px] leading-none',
        source === 'manual' ? 'bg-[#39C5BB]/15 text-[#1B7A74]' : 'bg-black/5 text-slate-500',
      )}
    >
      {SOURCE_LABELS[source] ?? source}
    </span>
  ) : null;

export const GateDot = ({ pass, label, title }: { pass: boolean | undefined; label?: string; title?: string }) => (
  <span
    title={title ?? label}
    className={cx(
      'inline-flex items-center gap-1 text-[11px]',
      pass === undefined ? 'text-slate-300' : pass ? 'text-[#1B7A74]' : 'text-rose-500',
    )}
  >
    <span
      className={cx(
        'inline-block h-1.5 w-1.5 rounded-full',
        pass === undefined ? 'bg-slate-200' : pass ? 'bg-[#39C5BB]' : 'bg-[#FF8FA6]',
      )}
    />
    {label}
  </span>
);

export const Section = ({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={cx('rounded-xl border border-black/[0.07] bg-white/80 p-4', className)}>
    <header className="mb-3 flex items-baseline justify-between gap-3">
      <h3 className="font-serif text-[15px] tracking-wide text-slate-800">{title}</h3>
      {aside}
    </header>
    {children}
  </section>
);

export const Counter = ({ value, max }: { value: string; max: number }) => {
  const length = [...value].length;
  return <span className={cx('font-mono text-[11px]', length > max ? 'text-rose-500' : 'text-slate-400')}>{length}/{max}</span>;
};

/** 草稿提示：来自网络资料的初稿，等你校准。 */
export const DraftNote = ({
  basis, confidence, refs, children,
}: {
  basis?: string;
  confidence?: 'high' | 'medium' | 'low';
  refs?: { title: string; url: string }[];
  children?: ReactNode;
}) => (
  <div className="mt-2 rounded-lg border border-dashed border-amber-300/80 bg-amber-50/60 px-3 py-2 text-[12px] leading-relaxed text-amber-900/80">
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded bg-amber-200/70 px-1.5 py-px font-mono text-[10px] text-amber-900">草稿</span>
      {confidence && <span className="text-[11px] text-amber-800/70">把握：{{ high: '高', medium: '中', low: '低' }[confidence]}</span>}
      <span className="ml-auto flex gap-2">{children}</span>
    </div>
    {basis && <p className="mt-1">{basis}</p>}
    {refs && refs.length > 0 && (
      <p className="mt-1 flex flex-wrap gap-x-3 text-[11px]">
        {refs.map(ref => (
          <a key={ref.url} href={ref.url} target="_blank" rel="noreferrer" className="text-amber-800 underline decoration-amber-300 underline-offset-2 hover:text-amber-950">
            {ref.title}
          </a>
        ))}
      </p>
    )}
  </div>
);
