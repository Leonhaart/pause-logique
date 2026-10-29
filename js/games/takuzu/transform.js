// Variantes d'une grille sans changer sa difficulté : rotation, symétrie, échange des 0 et des 1.
export function randomTransform(rng) {
  return { rot: rng.int(4), flip: rng.int(2) === 1, swap: rng.int(2) === 1 };
}

/** Applique la transformation à une grille (Int8Array, -1 vide). */
export function applyTransform(g, N, tf) {
  let cur = g;
  const turn = (a) => {
    const b = new Int8Array(a.length);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) b[c * N + (N - 1 - r)] = a[r * N + c];
    return b;
  };
  if (tf.flip) {
    const b = new Int8Array(cur.length);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) b[r * N + (N - 1 - c)] = cur[r * N + c];
    cur = b;
  }
  for (let k = 0; k < tf.rot; k++) cur = turn(cur);
  if (tf.swap) cur = cur.map((v) => (v < 0 ? v : 1 - v));
  return cur;
}
