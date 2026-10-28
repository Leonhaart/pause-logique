// Stockage local sûr : localStorage si disponible, sinon mémoire.
const PREFIX = 'pl:';
const mem = new Map();
let ls = null;
try {
  ls = globalThis.localStorage ?? null;
  if (ls) {
    ls.setItem(PREFIX + '_t', '1');
    ls.removeItem(PREFIX + '_t');
  }
} catch {
  ls = null;
}

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = ls ? ls.getItem(PREFIX + key) : mem.get(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    const raw = JSON.stringify(value);
    try {
      if (ls) ls.setItem(PREFIX + key, raw);
      else mem.set(key, raw);
    } catch {
      mem.set(key, raw);
    }
  },
  remove(key) {
    try {
      if (ls) ls.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
    mem.delete(key);
  },
  clear() {
    try {
      if (ls) {
        for (const k of Object.keys(ls)) if (k.startsWith(PREFIX)) ls.removeItem(k);
      }
    } catch {
      /* ignore */
    }
    mem.clear();
  },
};
