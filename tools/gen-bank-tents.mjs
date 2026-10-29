// Génère la banque Tents : node tools/gen-bank-tents.mjs
// 100 grilles par taille (6, 8, 10) : 25 faciles, 50 moyennes, 25 difficiles. Reproductible, revérifié.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, classify, SIZES } from '../js/games/tents/generator.js';
import { createRng } from '../js/core/rng.js';
import { parsePuz, formatPuz, countSolutions, solveWithTechniques } from '../js/games/tents/solver.js';

const COUNTS = { easy: 25, medium: 50, hard: 25 };
const out = {};
for (const N of SIZES) {
  out[N] = {};
  const seen = new Set();
  for (const [level, n] of Object.entries(COUNTS)) {
    const list = (out[N][level] = []);
    const t0 = Date.now();
    for (let k = 0; list.length < n; k++) {
      const g = generate(N, level, createRng(`bank:te:${N}:${level}:${k}`), { maxTries: 100000 });
      if (!g) continue;
      const puz = formatPuz(g.puz);
      if (seen.has(puz)) continue;
      const back = parsePuz(puz, N);
      if (countSolutions(back, 2).count !== 1) throw new Error('non unique');
      if (classify(N, solveWithTechniques(back, { maxLevel: 5 })) !== level) throw new Error('niveau incohérent');
      seen.add(puz);
      list.push(puz);
    }
    console.log(`${N}x${N} ${level} : ${list.length} grilles en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}
const file = join(fileURLToPath(import.meta.url), '..', '..', 'js', 'games', 'tents', 'bank.js');
writeFileSync(
  file,
  `// Fichier généré par tools/gen-bank-tents.mjs, ne pas modifier à la main.\n// BANK[taille][niveau] = [grille, ...]  ; N*N cases (. vide, T arbre), puis les comptes des lignes, puis ceux des colonnes.\nexport const BANK = ${JSON.stringify(out)};\n`,
);
console.log('écrit :', file);
