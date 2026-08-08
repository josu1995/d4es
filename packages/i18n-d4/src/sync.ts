import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { COMPANION_DATA_PATH, COMPANION_FILES, COMPANION_REPO } from './types.js';

const UA = 'd4es-bot/0.1 (+https://github.com/; proyecto personal, sin fines comerciales)';

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

/** Resuelve `master` a un commit concreto para poder fijar la version usada. */
export async function resolveCompanionSha(ref = 'master'): Promise<string> {
  const data = (await getJson(
    `https://api.github.com/repos/${COMPANION_REPO}/commits/${ref}`,
  )) as { sha?: string };
  if (!data.sha) throw new Error('la API de GitHub no devolvio sha');
  return data.sha;
}

/**
 * Descarga los .esES.json y .enUS.json de Diablo4Companion a vendor/, fijando el commit.
 * Se ejecuta a mano (`npm run i18n:sync`), no en cada build.
 */
export async function syncCompanion(vendorDir: string, ref = 'master'): Promise<{ sha: string; files: string[] }> {
  const sha = await resolveCompanionSha(ref);
  await mkdir(vendorDir, { recursive: true });

  const escritos: string[] = [];
  for (const { file } of COMPANION_FILES) {
    for (const locale of ['esES', 'enUS'] as const) {
      const nombre = `${file}.${locale}.json`;
      const url = `https://raw.githubusercontent.com/${COMPANION_REPO}/${sha}/${COMPANION_DATA_PATH}/${nombre}`;
      const cuerpo = await getText(url);
      await writeFile(join(vendorDir, nombre), cuerpo, 'utf8');
      escritos.push(nombre);
      process.stdout.write(`  ${nombre} (${(cuerpo.length / 1024).toFixed(0)} KB)\n`);
    }
  }

  await writeFile(
    join(vendorDir, '_source.json'),
    `${JSON.stringify({ repo: COMPANION_REPO, ref, sha, syncedAt: new Date().toISOString(), files: escritos }, null, 2)}\n`,
    'utf8',
  );
  return { sha, files: escritos };
}
