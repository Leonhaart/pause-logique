// Génère la banque Star Battle : node tools/gen-bank-starbattle.mjs
// 100 grilles par taille (8, 10, 12) : 25 faciles, 50 moyennes, 25 difficiles. Reproductible, revérifié.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, classify, SIZES } from '../js/games/starbattle/generator.js';
import { createRng } from '../js/core/rng.js';
import { parseReg, formatReg, formatSol, countSolutions, solveWithTechniques } from '../js/games/starbattle/solver.js';

const COUNTS = { easy: 25, medium: 50, hard: 25 };
const out = {};
for (const N of SIZES) {
  out[N] = {};
  const seen = new Set();
  for (const [level, n] of Object.entries(COUNTS)) {
    const list = (out[N][level] = []);
    const t0 = Date.now();
    for (let k = 0; list.length < n; k++) {
      const g = generate(N, level, createRng(`bank:sb:${N}:${level}:${k}`));
      if (!g) continue;
      const reg = formatReg(g.reg);
      if (seen.has(reg)) continue;
      // revérification indépendante
      const back = parseReg(reg);
      if (countSolutions(back, N, 2) !== 1) throw new Error('non unique');
      if (classify(N, solveWithTechniques(back, N, { maxLevel: 5 })) !== level) throw new Error('niveau incohérent');
      seen.add(reg);
      list.push([reg, formatSol(g.sol)]);
    }
    console.log(`${N}x${N} ${level} : ${list.length} grilles en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}
const file = join(fileURLToPath(import.meta.url), '..', '..', 'js', 'games', 'starbattle', 'bank.js');
writeFileSync(
  file,
  `// Fichier généré par tools/gen-bank-starbattle.mjs, ne pas modifier à la main.\n// BANK[taille][niveau] = [[régions, solution], ...] ; régions : une lettre base 36 par case (ligne par ligne), solution : colonne de l'étoile de chaque ligne.\nexport const BANK = ${JSON.stringify(out)};\n`,
);
console.log('écrit :', file);
