import test from 'node:test';
import assert from 'node:assert/strict';
import { BANK } from '../js/games/nonogram/bank.js';
import { cluesOf, runsOf, arrangements, solveLine, basicLine, simpleLine, countSolutions, solveWithTechniques, findStep } from '../js/games/nonogram/solver.js';
import { generate, classify, packGrid, unpackGrid, SIZES } from '../js/games/nonogram/generator.js';
import { createRng } from '../js/core/rng.js';
import { pick, consume, byId, bankSize } from '../js/games/nonogram/pool.js';

test('indices : séquences de blocs', () => {
  assert.deepEqual(runsOf(0b0110111, 7), [3, 2]);
  const { rows, cols } = cluesOf([1, 1, 0, 0, 1, 1, 0, 0, 0], 3);
  assert.deepEqual(rows, [[2], [2], []]);
  assert.deepEqual(cols, [[1], [2], [1]]);
});

test('ligne : arrangements et déduction complète', () => {
  assert.equal(arrangements([2, 1], 5).length, 3);
  const r = solveLine([4], 5, 0, 0);
  assert.equal(r.f, 0b01110);
  assert.equal(solveLine([3], 5, 0b00001, 0b00100), null); // impossible
  assert.equal(solveLine([1, 1], 3, 0, 0).f, 0b101);
});

test('techniques simples : toujours des sous-ensembles de la déduction complète', () => {
  const rng = createRng('sub');
  for (let k = 0; k < 400; k++) {
    const n = 5 + rng.int(8);
    let m = 0;
    for (let i = 0; i < n; i++) if (rng.next() < 0.55) m |= 1 << i;
    const clue = runsOf(m, n);
    // état partiel cohérent avec m
    let f = 0;
    let e = 0;
    for (let i = 0; i < n; i++) {
      if (rng.next() < 0.3) { if ((m >> i) & 1) f |= 1 << i; else e |= 1 << i; }
    }
    const full = solveLine(clue, n, f, e);
    for (const fn of [basicLine, simpleLine]) {
      const s = fn(clue, n, f, e);
      assert.ok(s, 'contradiction à tort');
      assert.equal(s.f & ~full.f, 0, `${fn.name} : case noire à tort`);
      assert.equal(s.e & ~full.e, 0, `${fn.name} : croix à tort`);
      assert.equal(s.f & s.e, 0);
    }
  }
});

test('banque : 100 grilles par taille, répartition 25/50/25', () => {
  for (const N of SIZES) {
    assert.deepEqual(Object.fromEntries(Object.entries(BANK[N]).map(([k, v]) => [k, v.length])), { easy: 25, medium: 50, hard: 25 });
  }
});

test('banque : solution unique, résoluble par techniques, niveau annoncé', () => {
  for (const N of SIZES) {
    const seen = new Set();
    for (const [level, list] of Object.entries(BANK[N])) {
      list.forEach(([bits], k) => {
        assert.ok(!seen.has(bits), 'doublon');
        seen.add(bits);
        const g = unpackGrid(bits, N);
        const { rows, cols } = cluesOf(g, N);
        assert.equal(countSolutions(rows, cols, N, 2), 1, `${N} ${level} #${k} non unique`);
        const r = solveWithTechniques(rows, cols, N);
        assert.ok(r.solved, `${N} ${level} #${k} non résolue`);
        assert.equal(classify(N, r), level, `${N} ${level} #${k} niveau`);
        for (let i = 0; i < N * N; i++) assert.equal(r.cells[i] === 1, g[i] === 1);
      });
    }
  }
});

test('générateur : grille unique pour chaque difficulté', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const g = generate(10, level, createRng('gen' + level));
    assert.ok(g);
    const { rows, cols } = cluesOf(g.grid, 10);
    assert.equal(countSolutions(rows, cols, 10, 2), 1);
    assert.equal(classify(10, solveWithTechniques(rows, cols, 10)), level);
  }
});

test('bits : aller-retour', () => {
  const rng = createRng('bits');
  for (const N of SIZES) {
    const g = Uint8Array.from({ length: N * N }, () => rng.int(2));
    assert.deepEqual(unpackGrid(packGrid(g), N), g);
  }
});

test('indice : chaque pas est juste', () => {
  for (const N of SIZES) {
    const g = unpackGrid(BANK[N].hard[2][0], N);
    const { rows, cols } = cluesOf(g, N);
    const cells = new Uint8Array(N * N);
    for (let n = 0; n < 5000 && cells.includes(0); n++) {
      const s = findStep(cells, N, rows, cols, 4);
      assert.ok(s);
      s.cells.forEach((idx, j) => {
        assert.equal(s.values[j] === 1, g[idx] === 1, 'déduction fausse');
        cells[idx] = s.values[j];
      });
    }
    assert.ok(!cells.includes(0));
  }
});

test('stock : tirage et consommation', () => {
  const rng = createRng('pool');
  const N = 5;
  const seen = new Set();
  for (let k = 0; k < bankSize(N, 'hard'); k++) {
    const g = pick(N, 'hard', rng);
    assert.ok(!seen.has(g.pid));
    seen.add(g.pid);
    consume(N, 'hard', g.pid);
  }
  assert.ok(byId(N, 'hard', 'b0'));
  assert.ok(pick(N, 'hard', rng));
});

test('images : bibliothèque cohérente avec la banque', async () => {
  const { IMAGES } = await import('../js/games/nonogram/images.js');
  for (const N of [10, 15]) {
    assert.ok(IMAGES[N].length > 100);
    for (const [name, bits] of IMAGES[N]) {
      assert.ok(name.length >= 1);
      assert.equal(bits.length, Math.ceil((N * N) / 4));
    }
    const names = new Set(IMAGES[N].map((x) => x[0]));
    for (const list of Object.values(BANK[N])) for (const e of list) if (e[1]) assert.ok(names.has(e[1]), 'nom absent de la bibliothèque');
  }
});
