// Génère la banque de grilles Sudoku : node tools/gen-bank-sudoku.mjs
// 25 faciles, 50 moyennes, 25 difficiles. Reproductible (graines fixes). Chaque grille est revérifiée.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, LEVEL_RATING } from '../js/games/sudoku/generator.js';
import { createRng } from '../js/core/rng.js';
import { parse, format, countSolutions, solve, solveWithTechniques } from '../js/games/sudoku/solver.js';

const COUNTS = { easy: 25, medium: 50, hard: 25 };
const out = {};
const seen = new Set();
for (const [level, n] of Object.entries(COUNTS)) {
  out[level] = [];
  for (let k = 0; out[level].length < n; k++) {
    const g = generate(level, createRng(`bank:${level}:${k}`));
    if (seen.has(g.puzzle)) continue;
    // revérification indépendante
    const puz = parse(g.puzzle);
    if (countSolutions(puz, 2) !== 1) throw new Error('non unique');
    if (format(solve(puz)) !== g.solution) throw new Error('solution incohérente');
    const r = solveWithTechniques(puz, { solution: parse(g.solution) });
    if (!r.solved || r.rating !== LEVEL_RATING[level]) throw new Error('niveau incohérent');
    seen.add(g.puzzle);
    out[level].push([g.puzzle, g.solution]);
  }
  console.log(`${level} : ${out[level].length} grilles`);
}
const file = join(fileURLToPath(import.meta.url), '..', '..', 'js', 'games', 'sudoku', 'bank.js');
writeFileSync(
  file,
  `// Fichier généré par tools/gen-bank-sudoku.mjs, ne pas modifier à la main.\n// Chaque entrée : [grille de départ, solution], 81 chiffres, 0 = case vide.\nexport const BANK = ${JSON.stringify(out)};\n`,
);
console.log('écrit :', file);
