// Transformations qui conservent la difficulté et l'unicité : permutation des chiffres,
// des bandes, des lignes dans une bande (idem colonnes) et transposition.
import { parse, format } from './solver.js';

export function randomTransform(rng) {
  const digits = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const axis = () => {
    const bands = rng.shuffle([0, 1, 2]);
    const order = [];
    for (const b of bands) for (const k of rng.shuffle([0, 1, 2])) order.push(b * 3 + k);
    return order;
  };
  return { digits, rows: axis(), cols: axis(), transpose: rng.next() < 0.5 };
}

/** Applique la transformation à une chaîne de 81 chiffres. */
export function applyTransform(str, tf) {
  const src = parse(str);
  const out = new Int8Array(81);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const d = src[tf.rows[r] * 9 + tf.cols[c]];
      const v = d ? tf.digits[d - 1] : 0;
      out[tf.transpose ? c * 9 + r : r * 9 + c] = v;
    }
  }
  return format(out);
}
