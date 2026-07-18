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
    expect(parseHash('#/atelier')).toEqual({ view: 'atelier' });
  });

  it('garden and atelier carry an itemId, decoded', () => {
    expect(parseHash('#/garden/abc-123')).toEqual({ view: 'garden', itemId: 'abc-123' });
    expect(parseHash('#/garden/hello%20world')).toEqual({ view: 'garden', itemId: 'hello world' });
    expect(parseHash('#/atelier/art-1')).toEqual({ view: 'atelier', itemId: 'art-1' });
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
    expect(formatHash('atelier')).toBe('#/atelier');
  });

  it('falls back to root for a view with no known URL segment', () => {
    expect(formatHash('echoes')).toBe('#/');
  });

  it('encodes an itemId for garden and atelier', () => {
    expect(formatHash('garden', 'hello world')).toBe('#/garden/hello%20world');
    expect(formatHash('atelier', 'art 1')).toBe('#/atelier/art%201');
  });
});

describe('parseHash <-> formatHash round trip', () => {
  it('recovers the same route for every routable view', () => {
    (['garden', 'soundscape', 'orchard', 'lights', 'atelier'] as const).forEach((view) => {
      expect(parseHash(formatHash(view))).toEqual({ view });
    });
  });

  it('recovers an itemId containing special characters', () => {
    const itemId = 'post/with slashes & spaces';
    const hash = formatHash('garden', itemId);
    expect(parseHash(hash)).toEqual({ view: 'garden', itemId });
  });
});
