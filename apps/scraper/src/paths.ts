import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        const parsed = JSON.parse(readFileSync(pkg, 'utf8')) as { name?: string };
        if (parsed.name === 'd4es') return dir;
      } catch {
        /* seguimos subiendo */
      }
    }
    const padre = dirname(dir);
    if (padre === dir) break;
    dir = padre;
  }
  throw new Error('no encuentro la raiz del repo (package.json con name "d4es")');
}

export const REPO_ROOT = findRepoRoot(resolve(dirname(fileURLToPath(import.meta.url))));

export const PATHS = {
  data: join(REPO_ROOT, 'data'),
  raw: join(REPO_ROOT, 'data', 'raw'),
  rawIndex: join(REPO_ROOT, 'data', 'raw', '_index.json'),
  fingerprints: join(REPO_ROOT, 'data', 'raw', '_fingerprints.json'),
  canonical: join(REPO_ROOT, 'data', 'canonical'),
  canonicalBuilds: join(REPO_ROOT, 'data', 'canonical', 'builds'),
  buildIndex: join(REPO_ROOT, 'data', 'canonical', 'index.json'),
  curated: join(REPO_ROOT, 'data', 'curated'),
  reports: join(REPO_ROOT, 'data', 'reports'),
  i18nDir: join(REPO_ROOT, 'data', 'i18n'),
  dictionary: join(REPO_ROOT, 'data', 'i18n', 'dictionary.esES.json'),
  vendor: join(REPO_ROOT, 'packages', 'i18n-d4', 'vendor'),
  estadoJuego: join(REPO_ROOT, 'data', 'curated', 'estado-juego.json'),
  fixtures: join(REPO_ROOT, 'apps', 'scraper', 'fixtures'),
  webPublic: join(REPO_ROOT, 'apps', 'web', 'public'),
} as const;
