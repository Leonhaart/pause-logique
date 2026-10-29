// Worker : fabrique une grille de remplacement sans bloquer l'interface.
// Elle part d'une image de la bibliothèque (non encore utilisée) ; sinon, d'un motif symétrique.
import { generate, packGrid, unpackGrid } from './generator.js';
import { createRng } from '../../core/rng.js';
import { IMAGES } from './images.js';

self.onmessage = (e) => {
  const { N, level, seed, exclude = [] } = e.data;
  const rng = createRng(seed);
  const skip = new Set(exclude);
  const lib = (IMAGES[N] ?? []).filter(([name]) => !skip.has(name));
  let picked = null;
  let g = null;
  if (lib.length) {
    g = generate(N, level, rng, {
      maxTries: 4000,
      deadlineMs: 60000,
      source: (r) => {
        picked = lib[r.int(lib.length)];
        return unpackGrid(picked[1], N);
      },
    });
  }
  if (!g) {
    picked = null;
    g = generate(N, level, rng, { maxTries: 50000, deadlineMs: 120000 });
  }
  self.postMessage(g ? { N, level, bits: packGrid(g.grid), name: picked ? picked[0] : '', color: picked ? picked[2] ?? '' : '' } : { N, level, failed: true });
};
