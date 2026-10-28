// Chronomètre de temps de jeu actif (pause possible, horloge injectable pour les tests).
export class Timer {
  constructor(now = () => performance.now()) {
    this._now = now;
    this._acc = 0;
    this._start = null;
  }
  get running() {
    return this._start !== null;
  }
  start() {
    if (this._start === null) this._start = this._now();
  }
  pause() {
    if (this._start !== null) {
      this._acc += this._now() - this._start;
      this._start = null;
    }
  }
  elapsed() {
    return this._acc + (this._start !== null ? this._now() - this._start : 0);
  }
  set(ms) {
    this._acc = Math.max(0, ms);
    if (this._start !== null) this._start = this._now();
  }
}
