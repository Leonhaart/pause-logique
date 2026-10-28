import { h } from './core/dom.js';
import { setLanguage, t } from './core/i18n.js';
import { getSettings, applySettings, subscribe } from './core/settings.js';
import { parseHash, hashes } from './core/router.js';
import { getGame, isLevel } from './games/registry.js';
import { mountHome } from './ui/home.js';
import { mountLevels } from './ui/levels.js';
import { mountPlay } from './ui/play.js';

const app = document.getElementById('app');
let current = null;

const nav = {
  go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  },
};

function render() {
  current?.destroy?.();
  current = null;
  const route = parseHash(location.hash);
  document.title = t('app.name');
  if (route.name === 'levels' && getGame(route.gameId)) current = mountLevels(app, route.gameId, nav);
  else if (route.name === 'play' && getGame(route.gameId) && isLevel(route.level)) current = mountPlay(app, route, nav);
  else {
    if (route.name !== 'home') history.replaceState(null, '', hashes.home());
    current = mountHome(app, nav);
  }
  app.firstElementChild?.focus?.({ preventScroll: true });
  window.scrollTo(0, 0);
}

applySettings();
setLanguage(getSettings().lang);
let lastLang = getSettings().lang;
subscribe((s) => {
  if (s.lang !== lastLang) {
    lastLang = s.lang;
    setLanguage(s.lang);
    // Ne pas détruire une partie en cours : la langue s'applique au prochain écran.
    if (parseHash(location.hash).name !== 'play') render();
  }
});
window.addEventListener('hashchange', render);
render();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // Si une nouvelle version prend le contrôle alors que l'app est déjà ouverte : proposer de recharger.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || document.querySelector('.update-banner')) return;
    document.body.append(
      h('div', { class: 'update-banner', role: 'status' },
        h('span', {}, t('update.ready')),
        h('button', { class: 'btn btn-primary', onClick: () => location.reload() }, t('update.reload'))),
    );
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
