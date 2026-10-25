// src/components/OasisLights.tsx
// ✉️ 尺牍 · 邻家来信：一位邻居一封信。移近信封会自己拆开、八行笺抽出半截；点一下抽出来、摊开读；
//   ⌘ / Ctrl 点击直接登门（热区本身就是普通链接）。最后一只没封口的空信封是「虚席以待」：回帖里有可复制的名帖与来信。
//   信、封舌、烛与竹影在 lights/letterScene.ts（WebGL，不进 React）；这里只管页头、热区、展读的按钮与建不起 WebGL 时的退路。
//   数据：src/data/friends.ts（color 是笺色，since 是落款的结邻日）。演示稿与取舍：docs/chidu-demo.html。
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from 'framer-motion';
import { FRIENDS } from '../data/friends';
import { PLACE_NAME } from '../lib/places';
import { useCoarsePointer } from '../hooks/useCoarsePointer';
import { buildLetters, dateLine, SELF } from './lights/letters';
import { createLetterScene, hasWebGL, type LetterScene } from './lights/letterScene';
// 字只在进这一处时才加载（随本场所的 chunk）：页面朱雀仿宋、信上志莽行书 + Homemade Apple、西文 IM Fell
import '@free-fonts/zhuque-fangsong/zhuque-fangsong.css';
import '@fontsource/zhi-mang-xing/400.css';
import '@fontsource/homemade-apple/400.css';
import '@fontsource/im-fell-english/400.css';
import '@fontsource/im-fell-english/400-italic.css';
import '@fontsource/im-fell-english-sc/400.css';
import './lights/lights.css';

// 素材根：默认随站点部署在 public/lights；纸色与纸面法线与园图同一份（public/yuantu/tex）
const BASE = ((import.meta.env.VITE_LIGHTS_BASE as string | undefined) || '/lights').replace(/\/$/, '');
const YUANTU_BASE = ((import.meta.env.VITE_YUANTU_BASE as string | undefined) || '/yuantu').replace(/\/$/, '');
const CN = '〇一二三四五六七八九十';

interface OasisLightsProps {
  isDark: boolean;
}

export const OasisLights = ({ isDark }: OasisLightsProps) => {
  const reduce = !!useReducedMotion();
  const coarse = useCoarsePointer();
  const selfUrl = typeof window !== 'undefined' ? `${window.location.origin}/` : '/';
  const letters = useMemo(() => buildLetters(FRIENDS, selfUrl), [selfUrl]);
  const [gl, setGl] = useState(hasWebGL);
  const [ready, setReady] = useState(false);
  const [reading, setReading] = useState(-1);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('');

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLElement>(null);
  const hitRefs = useRef<HTMLElement[]>([]);
  const actsRef = useRef<HTMLDivElement>(null);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const goRef = useRef<HTMLAnchorElement>(null);
  const engine = useRef<LetterScene | null>(null);

  // 桌子：挂载即摆，卸载即收（GPU 资源全部释放）；昼夜另有一处跟着走
  useEffect(() => {
    if (!gl) return;
    const root = rootRef.current, stage = stageRef.current, head = headRef.current, acts = actsRef.current, prev = prevRef.current, next = nextRef.current;
    if (!root || !stage || !head || !acts || !prev || !next) return;
    try {
      engine.current = createLetterScene({
        root, stage, head, acts, prev, next, letters, hits: hitRefs.current.slice(0, letters.length),
        base: BASE, yuantuBase: YUANTU_BASE, night: isDark, reduce, coarse,
        onRead: (i) => { setReading(i); if (i >= 0) setCopied(''); },
        onShown: (s) => { setShown(s); if (s) requestAnimationFrame(() => goRef.current?.focus({ preventScroll: true })); },
        onReady: () => setReady(true),
      });
    } catch (err) {
      // 显卡建不起 WebGL 上下文：退回 DOM 信封，别让整站跟着白屏
      console.warn('[lights] 尺牍没能摆上桌，退回信封列表', err);
      queueMicrotask(() => setGl(false));
      return;
    }
    return () => { engine.current?.destroy(); engine.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, letters]);

  const firstNight = useRef(true);
  useEffect(() => {
    if (firstNight.current) { firstNight.current = false; return; }
    engine.current?.setNight(isDark);
  }, [isDark]);

  const nf = FRIENDS.length;
  const lede = `凡${CN[nf] ?? nf}封，虚一席以待。信封移近会自己拆开，点一下抽出来读。`;
  const cur = reading >= 0 ? letters[reading] : null;
  const vacant = cur?.kind === 'vacant';

  const copyCard = async () => {
    const txt = `站名：${SELF.name}\n地址：${selfUrl}\n简介：${SELF.desc}\n头像：${new URL('/miku.jpg', selfUrl).href}`;
    try { await navigator.clipboard.writeText(txt); setCopied('ok'); } catch { setCopied('fail'); }
    window.setTimeout(() => setCopied(''), 1800);
  };

  return (
    <div
      ref={rootRef}
      className="oasis-lights"
      data-ready={ready ? '' : undefined}
      data-reading={reading >= 0 ? '' : undefined}
      style={{ '--lt-paper': `url(${YUANTU_BASE}/tex/yinshou-paper.webp)` } as CSSProperties}
    >
      <div ref={stageRef} className="lt-stage" aria-hidden />

      <header ref={headRef} className="lt-head">
        <div className="lt-kick lt-rise"><b>{PLACE_NAME.lights}</b><i /><span>Letters from Neighbors</span></div>
        <h1 className="lt-rise" style={{ '--d': 1 } as CSSProperties}>邻家尺牍</h1>
        <p>
          <span className="sr-only">{lede}</span>
          <span aria-hidden>{[...lede].map((ch, i) => <span key={i} className="lt-ch" style={{ '--i': i } as CSSProperties}>{ch}</span>)}</span>
          {gl && !coarse && <small>熟客：<kbd>⌘</kbd> / <kbd>Ctrl</kbd> 点信封，直接登门。</small>}
        </p>
      </header>

      {gl ? (
        <>
          <nav className="lt-hits" aria-label="邻家来信">
            {letters.map((l, i) => l.kind === 'friend' ? (
              <a
                key={l.url}
                ref={(el) => { if (el) hitRefs.current[i] = el; }}
                href={l.url} target="_blank" rel="noopener noreferrer"
                aria-label={`${l.name} 的来信：${l.desc}。寄自 ${l.host}。回车展读，⌘ 点击直接登门`}
              />
            ) : (
              <button
                key="vacant" type="button"
                ref={(el) => { if (el) hitRefs.current[i] = el; }}
                aria-label="虚席以待：一只空信封。展读回帖，交换友链"
              />
            ))}
          </nav>

          <div className={`lt-reader${reading >= 0 ? ' on' : ''}${shown ? ' shown' : ''}`} role="dialog" aria-modal="true" aria-label={cur ? (vacant ? '回帖' : `${cur.name} 的来信`) : undefined}>
            <div className="lt-scrim" onClick={() => engine.current?.close()} />
            <div ref={actsRef} className="lt-acts">
              {vacant && (
                <p className="lt-mingtie"><b>名帖</b>{SELF.name} ／ <code>{letters[letters.length - 1].host}</code> ／ {SELF.desc}</p>
              )}
              <div className="lt-row">
                {cur && !vacant && (
                  <a ref={goRef} className="lt-go" href={cur.url} target="_blank" rel="noopener noreferrer">
                    <span>登门拜访</span><small>{cur.host}</small><span aria-hidden>↗</span>
                  </a>
                )}
                {vacant && (
                  <>
                    <a ref={goRef} className="lt-go" href={`mailto:${SELF.mail}?subject=${encodeURIComponent('交换友链')}`}><span>来信</span><span aria-hidden>↗</span></a>
                    <button type="button" className="lt-ghost" onClick={copyCard}>{copied === 'ok' ? '已复制' : copied === 'fail' ? '复制不了，请手抄' : '复制名帖'}</button>
                  </>
                )}
                <button type="button" className="lt-ghost" onClick={() => engine.current?.close()}>放回信封</button>
              </div>
            </div>
            <button ref={prevRef} type="button" className="lt-side lt-prev" disabled={reading <= 0} onClick={() => engine.current?.open(reading - 1)}>上一封</button>
            <button ref={nextRef} type="button" className="lt-side lt-next" disabled={reading < 0 || reading >= letters.length - 1} onClick={() => engine.current?.open(reading + 1)}>下一封</button>
            <p className="sr-only" aria-live="polite">
              {cur && (vacant
                ? `回帖。园门常开，想把你的花园连过来？来信。名帖：${SELF.name}，${selfUrl}，${SELF.desc}`
                : `${cur.name} 的来信。见字如面。${cur.desc}。${(FRIENDS[reading]?.lines ?? []).join('')}${cur.name}，${dateLine(FRIENDS[reading]?.since)}结邻，寄自 ${cur.host}。`)}
            </p>
          </div>
        </>
      ) : (
        <div className="lt-nogl">
          <div>
            <ul>
              {letters.filter((l) => l.kind === 'friend').map((l) => (
                <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer"><span>{l.name}</span><small>寄自 {l.host}</small></a></li>
              ))}
            </ul>
            <p>虚一席以待——想把你的花园连过来？<a href={`mailto:${SELF.mail}?subject=${encodeURIComponent('交换友链')}`}>来信</a></p>
          </div>
        </div>
      )}
    </div>
  );
};
