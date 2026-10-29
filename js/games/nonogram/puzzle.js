import { createRng } from '../../core/rng.js';
import { unpackGrid } from './generator.js';
import { cluesOf } from './solver.js';
import { pick, byId } from './pool.js';

/** Grille jouée : identifiant mémorisé dans la sauvegarde sinon tirage ; miroir gauche-droite tiré de la graine. */
export function puzzleFor(N, level, seed, rng, pid) {
  const base = (pid && byId(N, level, pid)) || pick(N, level, rng);
  let grid = unpackGrid(base.bits, N);
  if (createRng(`flip:${N}:${level}:${seed}`).int(2)) {
    const f = new Uint8Array(N * N);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) f[r * N + c] = grid[r * N + (N - 1 - c)];
    grid = f;
  }
  const { rows, cols } = cluesOf(grid, N);
  return { pid: base.pid, name: base.name, grid, rows, cols };
}
