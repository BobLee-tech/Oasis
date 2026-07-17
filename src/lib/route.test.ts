import { describe, it, expect } from 'vitest';
import { parseHash, formatHash } from './route';

describe('parseHash', () => {
  it('treats an empty or unknown hash as welcome (no valid route)', () => {
    expect(parseHash('')).toEqual({ view: 'welcome' });
    expect(parseHash('#/nonsense')).toEqual({ view: 'welcome' });
  });

  it('maps each URL segment to its internal view name', () => {
    expect(parseHash('#/garden')).toEqual({ view: 'garden' });
    expect(parseHash('#/resonance')).toEqual({ view: 'soundscape' });
    expect(parseHash('#/constellation')).toEqual({ view: 'orchard' });
    expect(parseHash('#/lanterns')).toEqual({ view: 'lights' });
  });

  it('only garden carries a postId, and it is decoded', () => {
    expect(parseHash('#/garden/abc-123')).toEqual({ view: 'garden', postId: 'abc-123' });
    expect(parseHash('#/garden/hello%20world')).toEqual({ view: 'garden', postId: 'hello world' });
  });

  it('ignores a trailing segment on non-garden views', () => {
    expect(parseHash('#/lanterns/extra')).toEqual({ view: 'lights' });
  });
});

describe('formatHash', () => {
  it('renders welcome as the bare root', () => {
    expect(formatHash('welcome')).toBe('#/');
  });

  it('renders each view to its external segment', () => {
    expect(formatHash('garden')).toBe('#/garden');
    expect(formatHash('soundscape')).toBe('#/resonance');
    expect(formatHash('orchard')).toBe('#/constellation');
    expect(formatHash('lights')).toBe('#/lanterns');
  });

  it('falls back to root for a view with no known URL segment', () => {
    expect(formatHash('echoes')).toBe('#/');
  });

  it('encodes a postId for garden', () => {
    expect(formatHash('garden', 'hello world')).toBe('#/garden/hello%20world');
  });
});

describe('parseHash <-> formatHash round trip', () => {
  it('recovers the same route for every routable view', () => {
    (['garden', 'soundscape', 'orchard', 'lights'] as const).forEach((view) => {
      expect(parseHash(formatHash(view))).toEqual({ view });
    });
  });

  it('recovers a postId containing special characters', () => {
    const postId = 'post/with slashes & spaces';
    const hash = formatHash('garden', postId);
    expect(parseHash(hash)).toEqual({ view: 'garden', postId });
  });
});
