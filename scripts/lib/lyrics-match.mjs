import {
  artistVariants,
  normalizeIdentity,
} from './track-identity.mjs';

export const overlap = (leftValue, rightValue) => {
  const left = normalizeIdentity(leftValue);
  const right = normalizeIdentity(rightValue);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  }
  const leftSet = new Set([...left]);
  const rightSet = new Set([...right]);
  const common = [...rightSet].filter(character => leftSet.has(character)).length;
  return common / Math.max(leftSet.size, rightSet.size);
};

export const rankLrclibCandidates = (candidates, identity, identityConfig) => {
  const expectedArtists = artistVariants(identity.lookup.artists, identityConfig.artistAliases);
  const duration = identity.tags.durationMs / 1_000;
  return candidates
    .filter(candidate => typeof candidate?.syncedLyrics === 'string' && candidate.syncedLyrics.trim())
    .map(candidate => {
      const titleScore = overlap(identity.lookup.title, candidate.trackName);
      const artistScore = Math.max(0, ...expectedArtists.map(artist => overlap(artist, candidate.artistName)));
      const albumScore = identity.lookup.album && candidate.albumName
        ? overlap(identity.lookup.album, candidate.albumName)
        : 0.5;
      const durationScore = duration && Number(candidate.duration)
        ? Math.max(0, 1 - Math.abs(duration - Number(candidate.duration)) / 15)
        : 0.5;
      return {
        candidate,
        score: titleScore * 0.58 + artistScore * 0.22 + durationScore * 0.14 + albumScore * 0.06,
        titleScore,
        artistScore,
        albumScore,
        durationDelta: duration && Number(candidate.duration)
          ? Math.abs(duration - Number(candidate.duration))
          : null,
      };
    })
    .sort((left, right) => right.score - left.score);
};

export const acceptableLrclibCandidate = candidate =>
  Boolean(
    candidate &&
    candidate.titleScore >= 0.84 &&
    candidate.artistScore >= 0.55 &&
    candidate.score >= 0.9,
  );
