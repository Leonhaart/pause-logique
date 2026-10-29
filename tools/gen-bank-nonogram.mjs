// Génère la banque Nonogram : node tools/gen-bank-nonogram.mjs
// 100 grilles par taille (5, 10, 15) : 25 faciles, 50 moyennes, 25 difficiles. Reproductible, revérifié.
// Si tools/nonogram-images.json existe ({ "10": [{name, bits}], "15": [...] }), ces images sont utilisées en priorité.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, classify, packGrid, unpackGrid, repair, acceptable, SIZES } from '../js/games/nonogram/generator.js';
import { createRng } from '../js/core/rng.js';
import { cluesOf, countSolutions, solveWithTechniques } from '../js/games/nonogram/solver.js';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const COUNTS = { easy: 25, medium: 50, hard: 25 };
const images = existsSync(join(root, 'tools', 'nonogram-images.json')) ? JSON.parse(readFileSync(join(root, 'tools', 'nonogram-images.json'), 'utf8')) : {};
const out = {};
for (const N of SIZES) {
  out[N] = {};
  const seen = new Set();
  // 1. images : chacune est réparée (unicité) puis classée ; on les range par niveau.
  const byLevel = { easy: [], medium: [], hard: [] };
  (images[N] ?? []).forEach((img, k) => {
    const g = repair(unpackGrid(img.bits, N), N, createRng(`img:${N}:${k}`));
    if (!g || !acceptable(g, N, true)) return;
    const { rows, cols } = cluesOf(g, N);
    const level = classify(N, solveWithTechniques(rows, cols, N));
    if (level) byLevel[level].push({ bits: packGrid(g), name: img.name });
  });
  console.log(`${N}x${N} images classées :`, Object.fromEntries(Object.entries(byLevel).map(([l, v]) => [l, v.length])));
  for (const [level, n] of Object.entries(COUNTS)) {
    const list = (out[N][level] = []);
    const t0 = Date.now();
    for (const it of byLevel[level]) {
      if (list.length >= n) break;
      if (!seen.has(it.bits)) { seen.add(it.bits); list.push([it.bits, it.name]); }
    }
    const fromImages = list.length;
    // 2. compléter avec des motifs symétriques générés
    for (let k = 0; list.length < n; k++) {
      const g = generate(N, level, createRng(`bank:ng:${N}:${level}:${k}`));
      if (!g) continue;
      const bits = packGrid(g.grid);
      if (seen.has(bits)) continue;
      seen.add(bits);
      list.push([bits]);
    }
    // revérification indépendante
    for (const [bits] of list) {
      const { rows, cols } = cluesOf(unpackGrid(bits, N), N);
      if (countSolutions(rows, cols, N, 2) !== 1) throw new Error('non unique');
      if (classify(N, solveWithTechniques(rows, cols, N)) !== level) throw new Error('niveau incohérent');
    }
    console.log(`${N}x${N} ${level} : ${list.length} grilles dont ${fromImages} images, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}
const file = join(root, 'js', 'games', 'nonogram', 'bank.js');
writeFileSync(
  file,
  `// Fichier généré par tools/gen-bank-nonogram.mjs, ne pas modifier à la main.\n// BANK[taille][niveau] = [[bits hexadécimaux (ligne par ligne), nom optionnel], ...]\nexport const BANK = ${JSON.stringify(out)};\n`,
);
console.log('écrit :', file);
// Bibliothèque d'images complète, utilisée par le générateur embarqué pour reconstruire le stock consommé.
writeFileSync(
  join(root, 'js', 'games', 'nonogram', 'images.js'),
  `// Fichier généré par tools/gen-bank-nonogram.mjs, ne pas modifier à la main.\n// IMAGES[taille] = [[nom, bits hexadécimaux], ...]\nexport const IMAGES = ${JSON.stringify(Object.fromEntries(Object.entries(images).map(([n, l]) => [n, l.map((x) => [x.name, x.bits])])))};\n`,
);
