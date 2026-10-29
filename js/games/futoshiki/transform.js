// Variantes d'une grille sans changer sa difficulté : rotation, symétrie, inversion des chiffres (d -> N+1-d, signes inversés).
export function randomTransform(rng) {
  return { rot: rng.int(4), flip: rng.int(2) === 1, rev: rng.int(2) === 1 };
}

/** Applique la transformation à une grille { N, giv, rel }. */
export function applyTransform(p, tf) {
  const { N } = p;
  const at = (i) => {
    let r = Math.floor(i / N);
    let c = i % N;
    if (tf.flip) c = N - 1 - c;
    for (let k = 0; k < tf.rot; k++) [r, c] = [c, N - 1 - r];
    return r * N + c;
  };
  const giv = new Int8Array(N * N);
  p.giv.forEach((d, i) => { giv[at(i)] = d && tf.rev ? N + 1 - d : d; });
  const rel = p.rel.map(([a, b]) => (tf.rev ? [at(b), at(a)] : [at(a), at(b)]));
  return { N, giv, rel };
}
