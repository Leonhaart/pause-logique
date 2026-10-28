import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { formatTime } from '../core/format.js';
import { Timer } from '../core/timer.js';
import { createRng, newSeed } from '../core/rng.js';
import { saveGame, loadSave, clearSave } from '../core/saves.js';
import { recordWin } from '../core/stats.js';
import { getSettings, subscribe } from '../core/settings.js';
import { hashes } from '../core/router.js';
import { getGame, importGame } from '../games/registry.js';
import { iconButton, iconEl, openSheet } from './components.js';
import { openSettings } from './sheets.js';

/** Écran de jeu : barre du haut, minuteur, pause, sauvegarde, fin de partie. Le jeu remplit `host`. */
export function mountPlay(root, route, nav) {
  const meta = getGame(route.gameId);
  const { gameId, level, seed } = route;
  const timer = new Timer();
  const saved = loadSave(gameId);
  const restore = saved && saved.level === level && String(saved.seed) === seed ? saved : null;
  if (restore) timer.set(restore.elapsed || 0);

  let lastState = restore ? restore.state : undefined;
  let paused = false;
  let finished = false;
  let destroyed = false;
  let handle = null;
  let doneSheet = null;
  let saveTimer = null;

  const timeEl = h('span', { class: 'timer-text' }, '00:00');
  const timerBtn = h('button', { class: 'timer-btn', onClick: () => setPaused(!paused), 'aria-label': t('shell.pause') }, timeEl);
  const settingsBtn = iconButton('settings', t('nav.settings'), () => openSettings());
  const host = h('div', { class: 'play-host' });
  const overlay = h('div', { class: 'pause-overlay', hidden: true },
    h('p', {}, t('shell.paused')),
    h('button', { class: 'btn btn-primary', onClick: () => setPaused(false) }, iconEl('play'), t('shell.resume')));

  const screen = h('section', { class: 'screen play' },
    h('header', { class: 'topbar play-top' },
      iconButton('back', t('nav.back'), () => nav.go(hashes.levels(gameId))),
      h('div', { class: 'play-title' }, h('span', { class: 'play-game' }, t(`game.${gameId}.name`)), h('span', { class: 'play-level' }, t(`level.${level}`))),
      h('div', { class: 'topbar-actions' }, timerBtn, settingsBtn)),
    h('div', { class: 'play-main' }, host, overlay));
  root.replaceChildren(screen);

  function applyTimerUi() {
    const on = getSettings().timer;
    timerBtn.hidden = !on;
    overlay.hidden = !(on && paused);
    host.toggleAttribute('inert', on && paused);
    timerBtn.setAttribute('aria-label', paused ? t('shell.resume') : t('shell.pause'));
    timerBtn.classList.toggle('is-paused', paused);
    timeEl.textContent = formatTime(timer.elapsed());
  }
  function setPaused(p) {
    if (finished) return;
    paused = p;
    if (p) {
      timer.pause();
      persistNow();
    } else timer.start();
    applyTimerUi();
  }
  function persistNow() {
    clearTimeout(saveTimer);
    if (finished || lastState === undefined) return;
    saveGame(gameId, { level, seed, elapsed: timer.elapsed(), state: lastState, at: Date.now() });
  }
  function save(state) {
    lastState = state;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistNow, 400);
  }
  function complete() {
    if (finished || destroyed) return;
    finished = true;
    timer.pause();
    clearTimeout(saveTimer);
    const ms = timer.elapsed();
    const timed = getSettings().timer;
    const { record } = recordWin(gameId, level, timed ? ms : null);
    clearSave(gameId);
    applyTimerUi();
    showDone(ms, timed, record);
  }
  function showDone(ms, timed, record) {
    const go = (hash) => {
      doneSheet?.close();
      nav.go(hash);
    };
    doneSheet = openSheet({
      title: t('done.title'),
      dismissible: false,
      build(body) {
        body.append(
          h('div', { class: 'done' },
            timed ? h('p', { class: 'done-time' }, t('done.time', { time: formatTime(ms) })) : null,
            record ? h('p', { class: 'done-record' }, iconEl('check'), t('done.record')) : null,
            h('p', { class: 'row-hint' }, t('done.seed', { seed })),
            h('div', { class: 'done-actions' },
              h('button', { class: 'btn btn-primary', onClick: () => go(hashes.play(gameId, level, newSeed())) }, t('done.again')),
              h('button', { class: 'btn', onClick: () => go(hashes.levels(gameId)) }, t('done.levels')),
              h('button', { class: 'btn btn-quiet', onClick: () => go(hashes.home()) }, t('done.home')))));
      },
    });
  }

  const ctx = {
    gameId, level, seed,
    rng: createRng(`${gameId}:${level}:${seed}`),
    restore: restore ? restore.state : null,
    settings: getSettings,
    onSettings: (fn) => subscribe(fn),
    save, complete,
    isPaused: () => paused,
    t,
  };

  const unsubSettings = subscribe((s) => {
    if (!s.timer && paused) setPaused(false);
    else applyTimerUi();
  });
  const tick = setInterval(() => {
    if (!paused && !finished) timeEl.textContent = formatTime(timer.elapsed());
  }, 250);
  const onVis = () => {
    if (finished) return;
    if (document.hidden) {
      timer.pause();
      persistNow();
      if (getSettings().timer) paused = true;
      applyTimerUi();
    } else if (!paused) timer.start();
  };
  const onHide = () => persistNow();
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', onHide);

  importGame(gameId)
    .then((mod) => {
      if (destroyed) return;
      handle = mod.mount(host, ctx);
      timer.start();
      applyTimerUi();
    })
    .catch((err) => {
      console.error(err);
      if (!destroyed) host.replaceChildren(h('p', { class: 'empty' }, t('shell.loadError')));
    });

  applyTimerUi();
  return {
    destroy() {
      destroyed = true;
      persistNow();
      clearInterval(tick);
      unsubSettings();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
      doneSheet?.close();
      handle?.destroy?.();
    },
  };
}
