// Variantes d'une grille sans changer sa difficulté : rotation, symétrie, ré-étiquetage des régions.
export function randomTransform(rng, N) {
  return { rot: rng.int(4), flip: rng.int(2) === 1, perm: rng.shuffle([...Array(N).keys()]) };
}

function mapCell(r, c, N, { rot, flip }) {
  if (flip) c = N - 1 - c;
  for (let k = 0; k < rot; k++) [r, c] = [c, N - 1 - r];
  return [r, c];
}

/** reg : Int8Array des régions, sol : colonne de l'étoile par ligne. Les règles sont invariantes. */
export function applyTransform(reg, sol, N, tf) {
  const reg2 = new Int8Array(N * N);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const [r2, c2] = mapCell(r, c, N, tf);
      reg2[r2 * N + c2] = tf.perm[reg[r * N + c]];
    }
  }
  const sol2 = new Array(N);
  for (let r = 0; r < N; r++) {
    const [r2, c2] = mapCell(r, sol[r], N, tf);
    sol2[r2] = c2;
  }
  return { reg: reg2, sol: sol2 };
}
