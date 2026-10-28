// Génère sw-assets.js : liste des fichiers à pré-cacher + version (hash du contenu).
// À relancer avant chaque déploiement : node tools/gen-sw-assets.mjs
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const SKIP_DIRS = new Set(['.git', '.github', 'node_modules', 'tests', 'tools']);
const SKIP_FILES = new Set(['sw.js', 'sw-assets.js', 'package.json', 'README.md', '.gitignore', 'icon-maskable.svg']);

export function listAssets(dir = root) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) out.push(...listAssets(full));
    } else if (!SKIP_FILES.has(name) && !name.startsWith('.')) {
      out.push(relative(root, full).split(sep).join('/'));
    }
  }
  return out;
}

export function buildAssets() {
  const files = listAssets();
  const hash = createHash('sha1');
  for (const f of files) hash.update(f).update(readFileSync(join(root, f)));
  const version = hash.digest('hex').slice(0, 10);
  const assets = ['./', ...files];
  return { version, assets, source: `// Fichier généré par tools/gen-sw-assets.mjs, ne pas modifier à la main.\nself.APP_VERSION = ${JSON.stringify(version)};\nself.APP_ASSETS = ${JSON.stringify(assets, null, 2)};\n` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version, assets, source } = buildAssets();
  writeFileSync(join(root, 'sw-assets.js'), source);
  console.log(`sw-assets.js : ${assets.length} fichiers, version ${version}`);
}
