// Worker : fabrique une grille de remplacement sans bloquer l'interface.
import { generate } from './generator.js';
import { createRng } from '../../core/rng.js';
import { formatReg, formatSol } from './solver.js';

self.onmessage = (e) => {
  const { N, level, seed } = e.data;
  const g = generate(N, level, createRng(seed), { maxTries: 20000, deadlineMs: 120000 });
  self.postMessage(g ? { N, level, reg: formatReg(g.reg), sol: formatSol(g.sol) } : { N, level, failed: true });
};
