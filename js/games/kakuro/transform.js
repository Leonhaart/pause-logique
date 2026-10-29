// Variante d'une grille : transposition (lignes et colonnes échangées, les sommes suivent).
// Les autres symétries déplaceraient les cases de consigne, qui doivent rester avant leur suite.
export function randomTransform(rng) {
  return { transpose: rng.int(2) === 1 };
}

/** Applique la transformation à une grille { N, white, down, right, given }. */
export function applyTransform(p, tf) {
  if (!tf.transpose) return p;
  const { N } = p;
  const white = new Uint8Array(N * N);
  const down = new Int8Array(N * N);
  const right = new Int8Array(N * N);
  const given = new Int8Array(N * N);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const a = r * N + c;
      const b = c * N + r;
      white[b] = p.white[a];
      down[b] = p.right[a];
      right[b] = p.down[a];
      given[b] = p.given?.[a] ?? 0;
    }
  }
  return { N, white, down, right, given };
}
