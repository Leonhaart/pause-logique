// Génère la banque Takuzu : node tools/gen-bank-takuzu.mjs
// 100 grilles par taille (6, 8, 10) : 25 faciles, 50 moyennes, 25 difficiles. Reproductible, revérifié.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, classify, SIZES } from '../js/games/takuzu/generator.js';
import { createRng } from '../js/core/rng.js';
import { parsePuz, formatPuz, countSolutions, solveWithTechniques } from '../js/games/takuzu/solver.js';

const COUNTS = { easy: 25, medium: 50, hard: 25 };
const out = {};
for (const N of SIZES) {
  out[N] = {};
  const seen = new Set();
  for (const [level, n] of Object.entries(COUNTS)) {
    const list = (out[N][level] = []);
    const t0 = Date.now();
    for (let k = 0; list.length < n; k++) {
      const g = generate(N, level, createRng(`bank:tk:${N}:${level}:${k}`));
      if (!g) continue;
      const puz = formatPuz(g.puz);
      if (seen.has(puz)) continue;
      const back = parsePuz(puz);
      if (countSolutions(back, N, 2).count !== 1) throw new Error('non unique');
      if (classify(N, solveWithTechniques(back, N, { maxLevel: 5 })) !== level) throw new Error('niveau incohérent');
      seen.add(puz);
      list.push(puz);
    }
    console.log(`${N}x${N} ${level} : ${list.length} grilles en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}
const file = join(fileURLToPath(import.meta.url), '..', '..', 'js', 'games', 'takuzu', 'bank.js');
writeFileSync(
  file,
  `// Fichier généré par tools/gen-bank-takuzu.mjs, ne pas modifier à la main.\n// BANK[taille][niveau] = [grille, ...] ; une lettre par case, ligne par ligne : . vide, 0 ou 1 donné.\nexport const BANK = ${JSON.stringify(out)};\n`,
);
console.log('écrit :', file);
