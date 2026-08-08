import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { join } from 'node:path';
import { PATHS } from '../../paths.js';
import {
  bodyPathFor,
  fetchWithCache,
  loadCacheIndex,
  metaPathFor,
  saveCacheIndex,
  type CacheIndex,
} from '../../http/fetcher.js';
import { diffShape, shapePaths } from '../../pipeline/fingerprint.js';
import { readJsonIfExists, stableStringify, writeIfChanged } from '../../util/stable-json.js';

export const FUENTE = 'd4builds';

/**
 * Endpoints verificados el 8-ago-2026. Son ficheros estaticos de Gatsby servidos
 * publicamente; el robots.txt de d4builds solo prohibe `/?skills`.
 */
export const ENDPOINTS = {
  catalog: 'https://d4builds.gg/page-data/index/page-data.json',
  tierlist: 'https://d4builds.gg/page-data/tierlist/page-data.json',
} as const;

export interface SnapshotMeta {
  url: string;
  sha256: string;
  lastChangedAt: string;
  bytes: number;
}

export interface ScrapeReport {
  descargas: { nombre: string; estado: string; bytes: number }[];
  drift: { nombre: string; added: string[]; removed: string[] }[];
  bytesTotales: number;
}

type Fingerprints = Record<string, string[]>;

export async function scrapeD4BuildsCatalog(opts: { now: Date }): Promise<ScrapeReport> {
  const index: CacheIndex = await loadCacheIndex();
  const fingerprints = (await readJsonIfExists<Fingerprints>(PATHS.fingerprints)) ?? {};

  const informe: ScrapeReport = { descargas: [], drift: [], bytesTotales: 0 };

  for (const [nombre, url] of Object.entries(ENDPOINTS)) {
    const bodyPath = bodyPathFor(FUENTE, nombre);
    await mkdir(dirname(bodyPath), { recursive: true });

    const res = await fetchWithCache(url, `${FUENTE}:${nombre}`, bodyPath, index, opts.now);
    const bytes = Buffer.byteLength(res.body, 'utf8');
    informe.bytesTotales += bytes;

    // El cuerpo se escribe siempre (esta fuera de git); los metadatos solo si cambian,
    // que es lo que mantiene limpio el working tree cuando no hay novedades.
    await writeFile(bodyPath, res.body, 'utf8');
    const meta: SnapshotMeta = { url, sha256: res.sha, lastChangedAt: res.lastChangedAt, bytes };
    await writeIfChanged(metaPathFor(FUENTE, nombre), stableStringify(meta));

    let parsed: unknown;
    try {
      parsed = JSON.parse(res.body);
    } catch (err) {
      throw new Error(`SCHEMA_DRIFT: ${url} ya no devuelve JSON valido (${String(err)})`);
    }

    const forma = shapePaths(parsed);
    const anterior = fingerprints[`${FUENTE}:${nombre}`];
    if (anterior) {
      const d = diffShape(anterior, forma);
      if (d.changed) informe.drift.push({ nombre, added: d.added, removed: d.removed });
    }
    fingerprints[`${FUENTE}:${nombre}`] = forma;

    informe.descargas.push({ nombre, estado: res.status, bytes });
    process.stdout.write(`  ${nombre}: ${res.status} (${(bytes / 1024).toFixed(0)} KB)\n`);
  }

  await saveCacheIndex(index);
  await writeIfChanged(PATHS.fingerprints, stableStringify(fingerprints));
  return informe;
}

/** Lee el snapshot ya descargado. Si no existe, cae al fixture para poder trabajar sin red. */
export async function readSnapshot(nombre: keyof typeof ENDPOINTS): Promise<{
  body: unknown;
  meta: SnapshotMeta;
  desdeFixture: boolean;
}> {
  const bodyPath = bodyPathFor(FUENTE, nombre);
  if (existsSync(bodyPath)) {
    const meta = await readJsonIfExists<SnapshotMeta>(metaPathFor(FUENTE, nombre));
    if (!meta) throw new Error(`falta el meta de ${nombre}; vuelve a ejecutar scrape:catalog`);
    return { body: JSON.parse(await readFile(bodyPath, 'utf8')), meta, desdeFixture: false };
  }

  const fixture = join(PATHS.fixtures, `d4builds-${nombre}.sample.json`);
  if (!existsSync(fixture)) {
    throw new Error(
      `no hay snapshot de "${nombre}" ni fixture en ${fixture}. Ejecuta scrape:catalog (necesita salida a internet).`,
    );
  }
  const body = JSON.parse(await readFile(fixture, 'utf8'));
  return {
    body,
    meta: {
      url: ENDPOINTS[nombre],
      sha256: 'fixture',
      // Fecha fija: el fixture es un dato congelado, no algo que "acaba de pasar".
      lastChangedAt: '2026-08-08T00:00:00.000Z',
      bytes: 0,
    },
    desdeFixture: true,
  };
}
