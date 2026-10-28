import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { parse, format, solve, countSolutions, solveWithTechniques, rate, nextPlacement, conflicts, candidates, popcnt } from '../js/games/sudoku/solver.js';
import { generate, LEVEL_RATING } from '../js/games/sudoku/generator.js';
import { randomTransform, applyTransform } from '../js/games/sudoku/transform.js';

// Exemple classique (Wikipédia) : une seule solution.
const WIKI = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const WIKI_SOL = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

test('solveur : grille connue, solution unique', () => {
  assert.equal(countSolutions(parse(WIKI), 5), 1);
  assert.equal(format(solve(parse(WIKI))), WIKI_SOL);
});

test('solveur : grille vide -> plusieurs solutions ; grille contradictoire -> 0', () => {
  assert.equal(countSolutions(new Int8Array(81), 3), 3);
  const bad = parse(WIKI);
  bad[2] = 5; // deux 5 dans la première ligne
  assert.equal(countSolutions(bad, 2), 0);
  assert.ok(conflicts(bad).size >= 2);
});

test('techniques : la grille classique se résout et reste cohérente avec la solution', () => {
  const r = solveWithTechniques(parse(WIKI), { solution: parse(WIKI_SOL) });
  assert.equal(r.solved, true);
  assert.equal(r.rating, 1);
  assert.equal(format(r.grid), WIKI_SOL);
});

test('candidats : une case remplie n en a aucun, une case vide en a au moins un', () => {
  const c = candidates(parse(WIKI));
  assert.equal(c[0], 0);
  assert.ok(popcnt(c[2]) >= 1);
});

for (const level of ['easy', 'medium', 'hard']) {
  test(`générateur ${level} : solution unique, niveau exact, étapes toutes valides`, () => {
    for (let k = 0; k < 6; k++) {
      const g = generate(level, createRng(`test:${level}:${k}`));
      const puz = parse(g.puzzle);
      const sol = parse(g.solution);
      assert.equal(countSolutions(puz, 2), 1, 'unicité');
      assert.equal(format(solve(puz)), g.solution);
      const r = solveWithTechniques(puz, { solution: sol }); // lève si une étape est fausse
      assert.equal(r.solved, true);
      assert.equal(r.rating, LEVEL_RATING[level]);
      assert.equal(rate(puz), LEVEL_RATING[level]);
      if (level === 'easy') assert.ok(g.clues >= 36);
    }
  });
}

test('générateur : reproductible avec la même graine', () => {
  const a = generate('medium', createRng('same'));
  const b = generate('medium', createRng('same'));
  assert.equal(a.puzzle, b.puzzle);
});

test('transformations : unicité, niveau et solution conservés', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const g = generate(level, createRng(`tf:${level}`));
    for (let k = 0; k < 4; k++) {
      const tf = randomTransform(createRng(`tf:${level}:${k}`));
      const p = applyTransform(g.puzzle, tf);
      const s = applyTransform(g.solution, tf);
      assert.notEqual(p, g.puzzle);
      assert.equal(countSolutions(parse(p), 2), 1);
      assert.equal(format(solve(parse(p))), s);
      assert.equal(rate(parse(p)), LEVEL_RATING[level]);
    }
  }
});

test('indice : le placement proposé est correct', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const g = generate(level, createRng(`hint:${level}`));
    const hint = nextPlacement(parse(g.puzzle));
    assert.ok(hint);
    assert.equal(parse(g.solution)[hint.i], hint.d);
  }
});

import { BANK } from '../js/games/sudoku/bank.js';
import { puzzleFor, BANK_SIZES } from '../js/games/sudoku/puzzle.js';

test('banque : 25 faciles, 50 moyennes, 25 difficiles, toutes valides et distinctes', () => {
  const all = new Set();
  for (const level of ['easy', 'medium', 'hard']) {
    assert.equal(BANK[level].length, BANK_SIZES[level]);
    for (const [p, s] of BANK[level]) {
      assert.match(p, /^[0-9]{81}$/);
      assert.match(s, /^[1-9]{81}$/);
      assert.equal(countSolutions(parse(p), 2), 1);
      assert.equal(format(solve(parse(p))), s);
      assert.equal(rate(parse(p)), LEVEL_RATING[level]);
      all.add(p);
    }
  }
  assert.equal(all.size, 100);
});

test('puzzleFor : déterministe, valide, et varié selon la graine', () => {
  const a = puzzleFor('hard', createRng('hard:s1'));
  const b = puzzleFor('hard', createRng('hard:s1'));
  const c = puzzleFor('hard', createRng('hard:s2'));
  assert.deepEqual(a, b);
  assert.notEqual(a.puzzle, c.puzzle);
  assert.equal(countSolutions(parse(a.puzzle), 2), 1);
  assert.equal(rate(parse(a.puzzle)), 3);
});
