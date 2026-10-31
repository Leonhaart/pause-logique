// Choix de l'indice : parmi toutes les déductions disponibles, la plus facile ;
// à niveau égal, la plus proche de la dernière action du joueur (sinon au hasard).

export const manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

/**
 * collect()   : déductions disponibles dans l'état courant, de la technique la plus simple (tableau de pas ; vide si rien).
 * apply(step) : applique un pas à l'état simulé.
 * fresh(step) : changements visibles par le joueur qu'il n'a pas encore faits (tableau ; vide si aucun).
 * where(step, fresh) : positions [ligne, colonne] concernées, pour la proximité.
 * last        : [ligne, colonne] de la dernière action, ou null.
 * Retourne { step, fresh, prior: [techniques appliquées avant] } ou null.
 */
export function planHint({ collect, apply, fresh, where, last = null, guard = 400, rnd = Math.random }) {
  const prior = [];
  for (let n = 0; n < guard; n++) {
    const cands = collect();
    if (!cands.length) return null;
    const usable = [];
    for (const step of cands) {
      const f = fresh(step);
      if (f.length) usable.push({ step, fresh: f });
    }
    if (usable.length) {
      const level = Math.min(...usable.map((u) => u.step.level ?? 0));
      const pool = usable.filter((u) => (u.step.level ?? 0) === level);
      let best = pool[0];
      if (last) {
        let bd = Infinity;
        for (const u of pool) {
          const d = Math.min(...where(u.step, u.fresh).map((p) => manhattan(p, last)), Infinity);
          if (d < bd) { bd = d; best = u; }
        }
      } else best = pool[Math.floor(rnd() * pool.length)];
      return { step: best.step, fresh: best.fresh, prior: [...new Set(prior)] };
    }
    for (const s of cands) { apply(s); prior.push(s.tech); }
  }
  return null;
}

/** Bloc de mots-clés : « ligne 3, colonne 4 » à partir d'un index sur une grille de n colonnes. */
export const rc = (i, n) => ({ r: Math.floor(i / n) + 1, c: (i % n) + 1 });
