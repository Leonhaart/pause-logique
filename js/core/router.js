// Routage par hash (fonctionne sur tout hébergement statique, sans configuration).
export function parseHash(hash) {
  const parts = String(hash || '')
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent);
  if (parts[0] === 'g' && parts[1]) return { name: 'levels', gameId: parts[1] };
  if (parts[0] === 'p' && parts[1] && parts[2] && parts[3]) {
    return { name: 'play', gameId: parts[1], level: parts[2], seed: parts[3] };
  }
  return { name: 'home' };
}

export const hashes = {
  home: () => '#/',
  levels: (id) => `#/g/${encodeURIComponent(id)}`,
  play: (id, level, seed) => `#/p/${encodeURIComponent(id)}/${encodeURIComponent(level)}/${encodeURIComponent(seed)}`,
};
