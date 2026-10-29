// Worker de test : répond « ok » pour prouver que les workers en module fonctionnent.
self.onmessage = () => self.postMessage('ok');
