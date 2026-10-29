// Variantes d'une grille : les 8 symétries du carré (les chiffres comptent des côtés, donc ne changent pas).
export function randomTransform(rng) {
  return { rot: rng.int(4), flip: rng.int(2) === 1 };
}

/** Applique la transformation à { N, clue }. */
export function applyTransform(p, tf) {
  const { N } = p;
  let cur = p.clue;
  const step = (fn) => {
    const next = new Int8Array(N * N);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const [rr, cc] = fn(r, c);
      next[rr * N + cc] = cur[r * N + c];
    }
    cur = next;
  };
  if (tf.flip) step((r, c) => [r, N - 1 - c]);
  for (let k = 0; k < tf.rot; k++) step((r, c) => [c, N - 1 - r]);
  return { N, clue: cur };
}
