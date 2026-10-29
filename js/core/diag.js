// Diagnostic : les workers en module fonctionnent-ils, et combien de grilles l'appareil a-t-il fabriquées ?
import { storage } from './storage.js';

/** Lance un worker de test ; résout { ok, ms } ou { ok: false, reason }. */
export function probeWorker(timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (typeof Worker === 'undefined') return resolve({ ok: false, reason: 'absent' });
    let w;
    const t0 = performance.now();
    const end = (r) => { clearTimeout(timer); try { w?.terminate(); } catch { /* rien */ } resolve(r); };
    const timer = setTimeout(() => end({ ok: false, reason: 'timeout' }), timeoutMs);
    try {
      w = new Worker(new URL('./probe-worker.js', import.meta.url), { type: 'module' });
    } catch {
      return end({ ok: false, reason: 'module' });
    }
    w.onmessage = () => end({ ok: true, ms: Math.round(performance.now() - t0) });
    w.onerror = () => end({ ok: false, reason: 'error' });
    w.postMessage('ping');
  });
}

const POOLS = ['sb:pool', 'ng:pool', 'tk:pool', 'fu:pool', 'te:pool', 'ak:pool'];

/** Grilles fabriquées sur l'appareil et en réserve, tous jeux confondus. */
export function rebuiltCount() {
  let n = 0;
  for (const k of POOLS) {
    const s = storage.get(k, null);
    if (s && typeof s === 'object' && s.extra) for (const list of Object.values(s.extra)) if (Array.isArray(list)) n += list.length;
  }
  return n;
}
