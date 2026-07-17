import { describe, it, expect } from 'vitest';
import { extractWikiLinks, buildTitleIndex, resolveWikiLinks, buildBacklinkIndex } from './wikilinks';

interface P { id: string; title: string; content: string }

describe('extractWikiLinks', () => {
  it('extracts titles in order, untrimmed occurrences included raw', () => {
    expect(extractWikiLinks('看 [[A]] 与 [[ B ]] 的关系')).toEqual(['A', 'B']);
  });
  it('returns empty array for no links or empty content', () => {
    expect(extractWikiLinks('plain text')).toEqual([]);
    expect(extractWikiLinks('')).toEqual([]);
  });
});

describe('resolveWikiLinks', () => {
  const posts: P[] = [{ id: 'p1', title: '潮湿的安静', content: '' }];
  const index = buildTitleIndex(posts);

  it('resolves a matching title into a clickable hash link', () => {
    const out = resolveWikiLinks('参见 [[潮湿的安静]]', index);
    expect(out).toContain('#/garden/p1');
    expect(out).toContain('参见 [潮湿的安静]');
  });

  it('is case- and whitespace-insensitive when matching', () => {
    const out = resolveWikiLinks('[[ 潮湿的安静 ]]', index);
    expect(out).toContain('#/garden/p1');
  });

  it('renders unmatched titles as a pending wikilink span, not a broken link', () => {
    const out = resolveWikiLinks('[[还没写的标题]]', index);
    expect(out).toContain('wikilink-pending');
    expect(out).not.toContain('#/garden');
  });
});

describe('buildBacklinkIndex', () => {
  it('finds the post that links to a target, with surrounding context', () => {
    const posts: P[] = [
      { id: 'a', title: 'A', content: '与本测试无关' },
      { id: 'b', title: 'B', content: '那种感觉很像我在[[A]]里写过的潮湿安静。' },
    ];
    const index = buildBacklinkIndex(posts);
    const backlinks = index.get('a');
    expect(backlinks).toHaveLength(1);
    expect(backlinks![0].post.id).toBe('b');
    expect(backlinks![0].rawTitle).toBe('A');
    expect(backlinks![0].before).toContain('那种感觉很像我在');
  });

  it('excludes self-references', () => {
    const posts: P[] = [{ id: 'a', title: 'A', content: '自己提到[[A]]自己' }];
    const index = buildBacklinkIndex(posts);
    expect(index.get('a')).toBeUndefined();
  });

  it('counts repeated mentions of the same target from one source only once', () => {
    const posts: P[] = [
      { id: 'a', title: 'A', content: '' },
      { id: 'b', title: 'B', content: '[[A]] 出现两次 [[A]] 这里' },
    ];
    const index = buildBacklinkIndex(posts);
    expect(index.get('a')).toHaveLength(1);
  });

  it('ignores unmatched titles (unplanted seeds)', () => {
    const posts: P[] = [{ id: 'a', title: 'A', content: '提到 [[不存在的标题]]' }];
    const index = buildBacklinkIndex(posts);
    expect(index.size).toBe(0);
  });
});
