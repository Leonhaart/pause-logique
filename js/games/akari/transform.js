// Variantes d'une grille sans changer sa difficulté : rotation et symétrie.
export function randomTransform(rng) {
  return { rot: rng.int(4), flip: rng.int(2) === 1 };
}

/** Applique la transformation à une grille { N, wall, num }. */
export function applyTransform(p, tf) {
  const { N } = p;
  let wall = p.wall;
  let num = p.num;
  const turn = (map) => {
    const w = new Uint8Array(N * N);
    const n = new Int8Array(N * N);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const [r2, c2] = map(r, c);
      w[r2 * N + c2] = wall[r * N + c];
      n[r2 * N + c2] = num[r * N + c];
    }
    wall = w;
    num = n;
  };
  if (tf.flip) turn((r, c) => [r, N - 1 - c]);
  for (let k = 0; k < tf.rot; k++) turn((r, c) => [c, N - 1 - r]);
  return { N, wall, num };
}
