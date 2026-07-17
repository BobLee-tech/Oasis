import { describe, it, expect } from 'vitest';
import { readingMinutes, readingTimeLabel, extractToc, slugify } from './reading';

describe('readingMinutes', () => {
  it('is never below 1 minute, even for empty content', () => {
    expect(readingMinutes('')).toBe(1);
  });

  it('counts CJK characters at ~400/min', () => {
    expect(readingMinutes('字'.repeat(400))).toBe(1);
    expect(readingMinutes('字'.repeat(401))).toBe(2);
  });

  it('counts latin words at ~200/min', () => {
    expect(readingMinutes(Array(200).fill('word').join(' '))).toBe(1);
    expect(readingMinutes(Array(201).fill('word').join(' '))).toBe(2);
  });

  it('excludes image/link URLs from the word count', () => {
    const withLongUrl = `text ![alt](https://example.com/${'x'.repeat(500)}.png)`;
    expect(readingMinutes(withLongUrl)).toBe(1);
  });
});

describe('readingTimeLabel', () => {
  it('formats as "<n> min read"', () => {
    expect(readingTimeLabel('short')).toBe('1 min read');
  });
});

describe('slugify', () => {
  it('lowercases, trims, and hyphenates whitespace', () => {
    expect(slugify('  Hello World  ')).toBe('hello-world');
  });
  it('strips punctuation and collapses repeated hyphens', () => {
    expect(slugify('Hello, World!! -- Foo')).toBe('hello-world-foo');
  });
  it('preserves CJK characters', () => {
    expect(slugify('花园 architecture')).toBe('花园-architecture');
  });
  it('falls back to "section" when nothing is left', () => {
    expect(slugify('!!!')).toBe('section');
  });
});

describe('extractToc', () => {
  it('extracts h2/h3 headings with levels', () => {
    const md = '# Title\n\n## First\n\ntext\n\n### Nested\n\nmore';
    expect(extractToc(md)).toEqual([
      { id: 'first', text: 'First', level: 2 },
      { id: 'nested', text: 'Nested', level: 3 },
    ]);
  });

  it('ignores headings inside fenced code blocks', () => {
    const md = '## Real\n\n```\n## Not a heading\n```\n\n## Also Real';
    const toc = extractToc(md);
    expect(toc.map(t => t.text)).toEqual(['Real', 'Also Real']);
  });

  it('strips markdown link/emphasis syntax from the heading text', () => {
    const md = '## **Bold** and [a link](https://x.com)';
    expect(extractToc(md)[0].text).toBe('Bold and a link');
  });

  it('disambiguates duplicate heading text with a numeric suffix', () => {
    const md = '## Same\n\n## Same';
    expect(extractToc(md).map(t => t.id)).toEqual(['same', 'same-1']);
  });
});
