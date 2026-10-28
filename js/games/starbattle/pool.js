// Stock de grilles : banque fournie + grilles fabriquées sur l'appareil.
// Une grille terminée est « consommée » ; le générateur ne reconstruit que ce qui a été consommé.
import { storage } from '../../core/storage.js';
import { newSeed } from '../../core/rng.js';
import { BANK } from './bank.js';

const KEY = 'sb:pool';
const key = (N, level) => `${N}-${level}`;
const read = () => {
  const s = storage.get(KEY, null);
  return s && typeof s === 'object' ? { used: s.used ?? {}, extra: s.extra ?? {} } : { used: {}, extra: {} };
};
const write = (s) => storage.set(KEY, s);
const running = new Set();

export const bankSize = (N, level) => BANK[N][level].length;

/** Grille de la banque ou fabriquée localement d'après son identifiant (b12, g…). */
export function byId(N, level, pid) {
  if (pid?.startsWith('b')) {
    const e = BANK[N][level][+pid.slice(1)];
    return e ? { pid, reg: e[0], sol: e[1] } : null;
  }
  const e = read().extra[key(N, level)]?.find((x) => x.pid === pid);
  return e ? { ...e } : null;
}

function availableIds(N, level) {
  const s = read();
  const used = new Set(s.used[key(N, level)] ?? []);
  const ids = [];
  BANK[N][level].forEach((_, i) => { if (!used.has(i)) ids.push('b' + i); });
  for (const e of s.extra[key(N, level)] ?? []) ids.push(e.pid);
  return ids;
}

/** Choisit une grille non encore jouée (sinon n'importe laquelle). rng : générateur à graine. */
export function pick(N, level, rng) {
  let ids = availableIds(N, level);
  if (!ids.length) ids = BANK[N][level].map((_, i) => 'b' + i);
  return byId(N, level, ids[rng.int(ids.length)]);
}

/** À appeler quand la grille est terminée. */
export function consume(N, level, pid) {
  const s = read();
  const k = key(N, level);
  if (pid.startsWith('b')) {
    const used = new Set(s.used[k] ?? []);
    used.add(+pid.slice(1));
    s.used[k] = [...used];
  } else {
    s.extra[k] = (s.extra[k] ?? []).filter((e) => e.pid !== pid);
  }
  write(s);
  refill(N, level);
}

/** Reconstruit une grille à la fois jusqu'à retrouver la taille du stock d'origine. */
export function refill(N, level) {
  const k = key(N, level);
  if (running.has(k) || typeof Worker === 'undefined') return;
  if (availableIds(N, level).length >= bankSize(N, level)) return;
  let worker;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  } catch {
    return;
  }
  running.add(k);
  const done = () => {
    running.delete(k);
    worker.terminate();
  };
  worker.onmessage = (e) => {
    const g = e.data;
    done();
    if (g.failed) return;
    const s = read();
    (s.extra[k] ??= []).push({ pid: 'g' + newSeed(), reg: g.reg, sol: g.sol });
    write(s);
    refill(N, level);
  };
  worker.onerror = done;
  worker.postMessage({ N, level, seed: 'refill:' + newSeed() });
}

/** Au lancement : complète les stocks entamés (par exemple si l'application a été fermée en cours de route). */
export function refillAll() {
  for (const N of Object.keys(BANK)) for (const level of Object.keys(BANK[N])) refill(+N, level);
}
