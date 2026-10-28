import { describe, it, expect } from 'vitest';
import { extractImages, imageTier, pickCover, parseFocus, withFocus, setImageFocus, coverLayout, readCoverChoice, writeCoverChoice, resolveCover, setCoverFocus, stripCoverDef } from './coverImage';

const md = [
  '开头一段。',
  '',
  '![](https://img.example/photo.webp)',
  '',
  '*图：金贝尔艺术博物馆，Carol M. Highsmith 摄。来源：Wikimedia Commons*',
  '',
  '![](https://img.example/diagram.webp)',
  '*图：外墙后退。原创概念剖面，不表示实际尺寸。*',
  '',
  '![向日葵](https://img.example/plain.webp "标题")',
  '',
  '正文。',
  '',
  '![](https://img.example/art.webp)',
  '',
  '*图：本文生成式概念插画。*',
].join('\n');

describe('extractImages', () => {
  it('reads src, alt and the caption line right after each image', () => {
    const imgs = extractImages(md);
    expect(imgs.map((i) => i.src)).toEqual(['https://img.example/photo.webp', 'https://img.example/diagram.webp', 'https://img.example/plain.webp', 'https://img.example/art.webp']);
    expect(imgs[2].alt).toBe('向日葵');
    expect(imgs[2].caption).toBe('');
    expect(imgs[0].caption.startsWith('图：金贝尔')).toBe(true);
    expect(md.slice(imgs[3].urlStart, imgs[3].urlEnd)).toBe('https://img.example/art.webp');
  });
});

describe('imageTier / pickCover', () => {
  it('ranks illustration > uncaptioned > credited photo, and never picks a diagram', () => {
    const tiers = extractImages(md).map(imageTier);
    expect(tiers).toEqual([2, 3, 1, 0]);
    expect(pickCover(md)?.src).toBe('https://img.example/art.webp');
  });
  it('takes the earliest image within the best tier', () => {
    expect(pickCover('![](a.webp)\n\n![](b.webp)')?.src).toBe('a.webp');
  });
  it('falls back to a photo, and returns null when only diagrams remain', () => {
    expect(pickCover('![](p.webp)\n*图：某某 摄*')?.src).toBe('p.webp');
    expect(pickCover('![](d.webp)\n*图：结构示意，作者自制。*')).toBeNull();
    expect(pickCover('no images')).toBeNull();
  });
});

describe('focus in the image url', () => {
  it('round-trips through the url fragment and normalises order', () => {
    const src = withFocus('https://img.example/a.webp', [0.28, 0.1, 0.64, 0.32]);
    expect(src).toBe('https://img.example/a.webp#focus=0.28,0.1,0.64,0.32');
    expect(parseFocus(src)).toEqual([0.28, 0.1, 0.64, 0.32]);
    expect(parseFocus('a.webp#focus=0.9,0.8,0.1,0.2')).toEqual([0.1, 0.2, 0.9, 0.8]);
    expect(parseFocus('a.webp#focus=0.5,0.5,0.5,0.5')).toBeNull();
    expect(parseFocus('a.webp')).toBeNull();
  });
  it('rewrites only that image in the markdown, replacing an old box', () => {
    const img = pickCover(md)!;
    const next = setImageFocus(md, img, [0.1, 0.2, 0.3, 0.4]);
    expect(pickCover(next)?.src).toBe('https://img.example/art.webp#focus=0.1,0.2,0.3,0.4');
    const again = setImageFocus(next, pickCover(next)!, [0, 0, 0.5, 0.5]);
    expect(again.match(/#focus=/g)).toHaveLength(1);
    expect(setImageFocus(again, pickCover(again)!, null)).toBe(md);
  });
});

describe('coverLayout', () => {
  const inside = (l: ReturnType<typeof coverLayout>, f: [number, number, number, number], W: number, H: number) =>
    l.left + f[0] * l.width >= -0.01 && l.top + f[1] * l.height >= -0.01 &&
    l.left + f[2] * l.width <= W + 0.01 && l.top + f[3] * l.height <= H + 0.01;

  it('fills the strip and keeps the box inside when it fits', () => {
    const f: [number, number, number, number] = [0.3, 0.38, 0.7, 0.64];
    const l = coverLayout(532, 164, 1600, 900, f);
    expect(l.letterbox).toBe(false);
    expect(l.width).toBeGreaterThanOrEqual(532);
    expect(l.height).toBeGreaterThanOrEqual(164);
    expect(inside(l, f, 532, 164)).toBe(true);
  });
  it('shrinks a portrait so the whole head fits, and says so', () => {
    const head: [number, number, number, number] = [0.28, 0.1, 0.64, 0.32];
    const l = coverLayout(532, 164, 1344, 2304, head);
    expect(l.letterbox).toBe(true);
    expect(inside(l, head, 532, 164)).toBe(true);
  });
  it('never leaves a gap on the side that the image could cover', () => {
    const l = coverLayout(532, 164, 1600, 900, [0.9, 0.1, 1, 0.2]);
    expect(l.left).toBeLessThanOrEqual(0);
    expect(l.left + l.width).toBeGreaterThanOrEqual(532 - 0.01);
    expect(l.top).toBeLessThanOrEqual(0);
  });
  it('centres the image without a box', () => {
    const l = coverLayout(500, 100, 1000, 1000, null);
    expect(l.letterbox).toBe(false);
    expect(l.top).toBeCloseTo(-200);
  });
  it('without a box, aims a portrait at its upper third so the face stays in', () => {
    const l = coverLayout(532, 164, 1344, 2304, null);
    expect(l.letterbox).toBe(false);
    expect((-l.top + 82) / l.height).toBeCloseTo(0.3, 2);
  });
});

describe('hand-picked cover line', () => {
  const body = '正文\n\n![](https://img.example/art.webp)\n*图：本文生成式概念插画。*\n';

  it('is auto without the line, and resolves to the auto pick', () => {
    expect(readCoverChoice(body)).toEqual({ kind: 'auto' });
    expect(resolveCover(body)).toBe('https://img.example/art.webp');
    expect(writeCoverChoice(body, { kind: 'auto' })).toBe(body);
  });
  it('writes one line at the end, replaces it, and removes it again', () => {
    const a = writeCoverChoice(body, { kind: 'src', src: '/garden/plates/ume.webp' });
    expect(a.endsWith('\n\n[oasis-cover]: /garden/plates/ume.webp\n')).toBe(true);
    expect(resolveCover(a)).toBe('/garden/plates/ume.webp');
    const b = writeCoverChoice(a, { kind: 'none' });
    expect(b.match(/oasis-cover/g)).toHaveLength(1);
    expect(resolveCover(b)).toBeNull();
    expect(writeCoverChoice(b, { kind: 'auto' })).toBe(body);
  });
  it('puts the focus box on the line when hand-picked, on the body image when auto', () => {
    const a = setCoverFocus(writeCoverChoice(body, { kind: 'src', src: 'https://img.example/up.webp' }), [0.1, 0.2, 0.3, 0.4]);
    expect(resolveCover(a)).toBe('https://img.example/up.webp#focus=0.1,0.2,0.3,0.4');
    expect(a).toContain('![](https://img.example/art.webp)');
    const b = setCoverFocus(body, [0.1, 0.2, 0.3, 0.4]);
    expect(b).toContain('![](https://img.example/art.webp#focus=0.1,0.2,0.3,0.4)');
  });
  it('is stripped for excerpts and crawlers', () => {
    expect(stripCoverDef('短文。\n\n[oasis-cover]: none\n').trim()).toBe('短文。');
    expect(stripCoverDef(body)).toBe(body);
  });
});
