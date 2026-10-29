// Variantes d'une grille sans changer sa difficulté : rotation et symétrie (les comptes suivent).
export function randomTransform(rng) {
  return { rot: rng.int(4), flip: rng.int(2) === 1 };
}

/** Applique la transformation à une grille { N, tree, rows, cols }. */
export function applyTransform(p, tf) {
  const { N } = p;
  let tree = p.tree;
  let rows = p.rows.slice();
  let cols = p.cols.slice();
  if (tf.flip) {
    const b = new Uint8Array(N * N);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) b[r * N + (N - 1 - c)] = tree[r * N + c];
    tree = b;
    cols = cols.reverse();
  }
  for (let k = 0; k < tf.rot; k++) {
    const b = new Uint8Array(N * N);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) b[c * N + (N - 1 - r)] = tree[r * N + c];
    tree = b;
    const nr = cols.slice();
    const nc = rows.slice().reverse();
    rows = nr;
    cols = nc;
  }
  return { N, tree, rows, cols };
}
