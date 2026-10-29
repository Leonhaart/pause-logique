// Worker : fabrique une grille de remplacement sans bloquer l'interface.
import { generate } from './generator.js';
import { createRng } from '../../core/rng.js';
import { formatPuz } from './solver.js';

self.onmessage = (e) => {
  const { N, level, seed } = e.data;
  const g = generate(N, level, createRng(seed), { maxTries: 2000, deadlineMs: 60000 });
  self.postMessage(g ? { N, level, puz: formatPuz(g.puz) } : { N, level, failed: true });
};
