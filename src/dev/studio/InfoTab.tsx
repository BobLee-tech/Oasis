import { useState } from 'react';
import { api, type Credits, type Profile, type TrackDetail } from './api';
import type { StudioActions } from './StudioApp';
import { ImportPanel } from './ImportPanel';
import { Button, Counter, DraftNote, Section, SourceTag } from './ui';
import { cx, inputClass } from './classes';

const ROLES: { key: keyof Credits; label: string }[] = [
  { key: 'lyricist', label: '作词' },
  { key: 'composer', label: '作曲' },
  { key: 'arranger', label: '编曲' },
  { key: 'vocal', label: '演唱' },
];

const joinNames = (names?: string[]) => (names ?? []).join(' / ');
const splitNames = (value: string) => value.split(/\s*[/／、,，]\s*/).map(name => name.trim()).filter(Boolean);

type FactKey = 'titleAlt' | 'album' | 'trackNo' | 'released' | 'tieIn';
const FACTS: { key: FactKey; label: string; hint?: string }[] = [
  { key: 'titleAlt', label: '译名' },
  { key: 'album', label: '专辑' },
  { key: 'trackNo', label: '曲序' },
  { key: 'released', label: '发行日', hint: 'YYYY-MM-DD' },
  { key: 'tieIn', label: '出处', hint: '游戏 / 动画 / 电影…' },
];

export function InfoTab({ detail, actions, limits }: { detail: TrackDetail; actions: StudioActions; limits: { intro: number } }) {
  const { identity, profile, merged } = detail;
  const id = identity.id;
  const [facts, setFacts] = useState<Record<FactKey, string>>(() => ({
    titleAlt: profile.titleAlt ?? '',
    album: profile.album ?? '',
    trackNo: profile.trackNo ? String(profile.trackNo) : '',
    released: profile.released ?? '',
    tieIn: profile.tieIn ?? '',
  }));
  const [credits, setCredits] = useState<Record<keyof Credits, string>>(() => ({
    lyricist: joinNames(profile.credits?.lyricist),
    composer: joinNames(profile.credits?.composer),
    arranger: joinNames(profile.credits?.arranger),
    vocal: joinNames(profile.credits?.vocal),
  }));
  const draft = profile.sources?.draft;
  // 你还没写介绍时，用草稿预填：改一改再保存，就是采纳
  const [intro, setIntro] = useState(profile.intro ?? draft?.intro ?? '');
  const introFromDraft = !profile.intro && Boolean(draft?.intro) && intro === draft?.intro;

  const importedCredits = (() => {
    for (const name of ['netease', 'vocadb', 'musicbrainz', 'web'] as const) {
      const value = profile.sources?.[name]?.credits;
      if (value && Object.keys(value).length) return value;
    }
    return undefined;
  })();
  const importedFact = (key: FactKey) => {
    const value = (['netease', 'vocadb', 'musicbrainz', 'web'] as const)
      .map(name => profile.sources?.[name]?.[key])
      .find(item => item !== undefined && item !== '');
    if (key === 'album') return identity.tags.album ?? value;
    if (key === 'trackNo') return identity.tags.trackNumber ?? value;
    return value;
  };

  const saveFacts = () => {
    const patch: Parameters<typeof api.saveProfile>[1] = {
      titleAlt: facts.titleAlt.trim() || null,
      album: facts.album.trim() || null,
      trackNo: facts.trackNo ? Number(facts.trackNo) : null,
      released: facts.released.trim() || null,
      tieIn: facts.tieIn.trim() || null,
    };
    const manualCredits: Credits = {};
    for (const role of ROLES) {
      const names = splitNames(credits[role.key]);
      if (names.length) manualCredits[role.key] = names;
    }
    patch.credits = Object.keys(manualCredits).length ? manualCredits : null;
    return actions.run('保存资料', () => api.saveProfile(id, patch));
  };

  const refs = profile.sources?.refs ?? [];

  return (
    <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Section
          title="事实"
          aside={<Button tone="primary" onClick={saveFacts}>保存</Button>}
        >
          <p className="mb-3 text-[12px] text-slate-500">留空 = 用导入的值（灰字）。你填了就以你为准，出处记为「你」。</p>
          <div className="space-y-2">
            {FACTS.map(fact => (
              <FactRow
                key={fact.key}
                label={fact.label}
                merged={merged[fact.key] !== undefined ? String(merged[fact.key]) : ''}
                source={merged.provenance[fact.key]}
                value={facts[fact.key]}
                placeholder={String(importedFact(fact.key) ?? fact.hint ?? '')}
                onChange={value => setFacts(current => ({ ...current, [fact.key]: value }))}
              />
            ))}
            <div className="pt-2 text-[12px] text-slate-500">
              署名 <SourceTag source={merged.provenance.credits} />
              {profile.sources?.netease?.creditsMissing && !importedCredits && <span className="ml-2 text-rose-500">网易云歌词头没有署名</span>}
            </div>
            {ROLES.map(role => (
              <FactRow
                key={role.key}
                label={role.label}
                merged={joinNames(merged.credits?.[role.key])}
                value={credits[role.key]}
                placeholder={joinNames(importedCredits?.[role.key])}
                onChange={value => setCredits(current => ({ ...current, [role.key]: value }))}
              />
            ))}
          </div>
        </Section>

        <Section
          title="关于这首歌"
          aside={
            <div className="flex items-center gap-2">
              <Counter value={intro} max={limits.intro} />
              <Button
                tone="primary"
                disabled={[...intro].length > limits.intro || intro === (profile.intro ?? '')}
                onClick={() => actions.run('保存介绍', () => api.saveProfile(id, { intro: intro.trim() || null }))}
              >
                保存
              </Button>
            </div>
          }
        >
          <p className="mb-2 text-[12px] text-slate-500">
            60–120 字，唱片内页说明的语气：安静、克制，不是百科。第一句会被 Miku 用来向访客介绍这首歌，要能单独成立。
          </p>
          <textarea
            className={cx(inputClass, 'h-32 font-[family-name:var(--font-zh)] text-[14px] leading-relaxed', introFromDraft && 'border-dashed border-amber-300 bg-amber-50/30')}
            value={intro}
            onChange={event => setIntro(event.target.value)}
          />
          {!profile.intro && draft?.intro && (
            <DraftNote confidence={draft.confidence} refs={draft.refs}>
              {intro !== draft.intro && (
                <button type="button" className="text-[11px] text-amber-800 hover:underline" onClick={() => setIntro(draft.intro ?? '')}>
                  恢复草稿
                </button>
              )}
            </DraftNote>
          )}
          {(refs.length > 0 || detail.neteaseTags.length > 0 || detail.album?.story) && (
            <div className="mt-3 space-y-2 border-t border-black/5 pt-3">
              <h4 className="text-[12px] tracking-wide text-slate-500">参考（只给你看，不进档案）</h4>
              {detail.album?.story && (
                <Ref title={`专辑叙事 · ${detail.album.album}`} text={detail.album.story} />
              )}
              {detail.neteaseTags.length > 0 && (
                <p className="text-[12px] text-slate-500">网易云推荐标签（众包，仅供标心境时参考）：{detail.neteaseTags.join(' · ')}</p>
              )}
              {refs.map(ref => (
                <Ref key={`${ref.url}-${ref.text.slice(0, 20)}`} title={ref.title ?? ref.source} url={ref.url} meta={`${ref.fetchedAt}${ref.license ? ` · ${ref.license}` : ''}`} text={ref.text} />
              ))}
            </div>
          )}
        </Section>

        <ProfileSources profile={profile} />
      </div>

      <ImportPanel detail={detail} actions={actions} />
    </div>
  );
}

function FactRow({
  label, merged, source, value, placeholder, onChange,
}: {
  label: string;
  merged: string;
  source?: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid grid-cols-[3.5rem_1fr] items-center gap-2">
      <span className="text-[12px] text-slate-500">{label}</span>
      <span className="flex items-center gap-2">
        <input className={inputClass} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
        <span className="w-16 shrink-0 text-right">{merged && <SourceTag source={source} />}</span>
      </span>
    </label>
  );
}

function Ref({ title, url, meta, text }: { title: string; url?: string; meta?: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg bg-black/[0.025] p-2">
      <div className="flex items-baseline justify-between gap-2">
        <button type="button" className="truncate text-left text-[12px] text-slate-700" onClick={() => setOpen(value => !value)}>
          {open ? '▾' : '▸'} {title}
        </button>
        <span className="shrink-0 text-[10px] text-slate-400">
          {meta}
          {url && <a className="ml-1 text-[#1B7A74] hover:underline" href={url} target="_blank" rel="noreferrer">原文</a>}
        </span>
      </div>
      <p className={cx('mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-600', !open && 'line-clamp-2')}>{text}</p>
    </div>
  );
}

function ProfileSources({ profile }: { profile: Profile }) {
  const sources = Object.entries(profile.sources ?? {}).filter(([key]) => key !== 'refs');
  if (!sources.length) return null;
  return (
    <Section title="导入记录">
      <div className="space-y-2">
        {sources.map(([name, value]) => (
          <details key={name} className="rounded-lg bg-black/[0.025] p-2">
            <summary className="cursor-pointer text-[12px] text-slate-600">
              {name}
              {value && typeof value === 'object' && 'fetchedAt' in value && <span className="ml-2 text-slate-400">{String(value.fetchedAt)}</span>}
            </summary>
            <pre className="mt-1 overflow-x-auto font-mono text-[11px] text-slate-500">{JSON.stringify(value, null, 2)}</pre>
          </details>
        ))}
      </div>
    </Section>
  );
}
