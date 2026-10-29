// Génère la banque Kakuro : node tools/gen-bank-kakuro.mjs
// 100 grilles par taille (6, 8, 10) : 25 faciles, 50 moyennes, 25 difficiles. Reproductible, revérifié.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, SIZES, rate, levelOf } from '../js/games/kakuro/generator.js';
import { createRng } from '../js/core/rng.js';
import { parsePuz, countSolutions } from '../js/games/kakuro/solver.js';

const COUNTS = { easy: 25, medium: 50, hard: 25 };
const out = {};
for (const N of SIZES) {
  out[N] = {};
  const seen = new Set();
  for (const [level, n] of Object.entries(COUNTS)) {
    const list = (out[N][level] = []);
    const t0 = Date.now();
    for (let k = 0; list.length < n; k++) {
      const g = generate(N, level, createRng(`bank:kk:${N}:${level}:${k}`), { maxTries: 100000 });
      if (!g) continue;
      const puz = g.puz;
      if (seen.has(puz)) continue;
      const back = parsePuz(puz, N);
      if (countSolutions(back, 2).count !== 1) throw new Error('non unique');
      if (levelOf(rate(back)) !== level) throw new Error('niveau incohérent');
      seen.add(puz);
      list.push(puz);
    }
    console.log(`${N}x${N} ${level} : ${list.length} grilles en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}
const file = join(fileURLToPath(import.meta.url), '..', '..', 'js', 'games', 'kakuro', 'bank.js');
writeFileSync(
  file,
  `// Fichier généré par tools/gen-bank-kakuro.mjs, ne pas modifier à la main.\n// BANK[taille][niveau] = [grille, ...]  ; N*N cases séparées par des virgules (. blanche, 1-9 donné, # noire, d/r sommes).\nexport const BANK = ${JSON.stringify(out)};\n`,
);
console.log('écrit :', file);
