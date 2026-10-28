import { parseReg, parseSol } from './solver.js';
import { randomTransform, applyTransform } from './transform.js';
import { createRng } from '../../core/rng.js';
import { pick, byId } from './pool.js';

/**
 * Grille jouée : identifiant mémorisé dans la sauvegarde (restore.pid) sinon tirage selon la graine,
 * puis transformation tirée de la graine (même graine = même aspect).
 */
export function puzzleFor(N, level, seed, rng, pid) {
  const base = (pid && byId(N, level, pid)) || pick(N, level, rng);
  const tf = randomTransform(createRng(`tf:${N}:${level}:${seed}`), N);
  const { reg, sol } = applyTransform(parseReg(base.reg), parseSol(base.sol), N, tf);
  return { pid: base.pid, reg, sol };
}
