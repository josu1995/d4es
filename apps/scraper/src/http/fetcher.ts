import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS } from '../paths.js';
import { readJsonIfExists, sha256, stableStringify } from '../util/stable-json.js';

/**
 * User-Agent identificable y con contacto. Si molestamos, que puedan escribirnos antes
 * de bloquearnos; y si alguien revisa sus logs, que vea quien es.
 */
export const USER_AGENT =
  process.env['D4ES_USER_AGENT'] ??
  'd4es-bot/0.1 (+https://github.com/; proyecto personal de fans, sin fines comerciales)';

const RATE_LIMIT_MS = Number(process.env['D4ES_RATE_LIMIT_MS'] ?? 1500);
const MAX_REINTENTOS = 3;

export interface CacheEntry {
  etag: string | null;
  lastModified: string | null;
  sha256: string;
  /**
   * Cuando cambio el CONTENIDO por ultima vez. Deliberadamente no guardamos
   * "ultima comprobacion": si lo hicieramos, cada ejecucion ensuciaria el repo y
   * dispararia un deploy de Netlify aunque no hubiera nada nuevo.
   */
  lastChangedAt: string;
  bytes: number;
}

export type CacheIndex = Record<string, CacheEntry>;

let ultimaPeticion = 0;

async function esperarTurno(): Promise<void> {
  const ahora = Date.now();
  const espera = ultimaPeticion + RATE_LIMIT_MS - ahora;
  if (espera > 0) await new Promise((r) => setTimeout(r, espera + Math.random() * 400));
  ultimaPeticion = Date.now();
}

export async function loadCacheIndex(): Promise<CacheIndex> {
  return (await readJsonIfExists<CacheIndex>(PATHS.rawIndex)) ?? {};
}

export async function saveCacheIndex(index: CacheIndex): Promise<void> {
  await mkdir(PATHS.raw, { recursive: true });
  await writeFile(PATHS.rawIndex, stableStringify(index), 'utf8');
}

export interface FetchResult {
  status: 'nuevo' | 'sin-cambios' | 'actualizado';
  body: string;
  sha: string;
  lastChangedAt: string;
}

/**
 * Descarga con cache condicional (ETag / Last-Modified) y comparacion de hash. Un 304 o
 * un cuerpo identico devuelven 'sin-cambios' y el llamante no escribe nada.
 */
export async function fetchWithCache(
  url: string,
  cacheKey: string,
  bodyPath: string,
  index: CacheIndex,
  now: Date,
): Promise<FetchResult> {
  const previo = index[cacheKey];
  const headers: Record<string, string> = { 'user-agent': USER_AGENT, accept: 'application/json,*/*' };
  if (previo?.etag) headers['if-none-match'] = previo.etag;
  if (previo?.lastModified) headers['if-modified-since'] = previo.lastModified;

  let ultimoError: unknown;
  for (let intento = 1; intento <= MAX_REINTENTOS; intento++) {
    try {
      await esperarTurno();
      const res = await fetch(url, { headers, redirect: 'follow' });

      if (res.status === 304 && previo && existsSync(bodyPath)) {
        return {
          status: 'sin-cambios',
          body: await readFile(bodyPath, 'utf8'),
          sha: previo.sha256,
          lastChangedAt: previo.lastChangedAt,
        };
      }

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get('retry-after') ?? 0);
        const espera = retryAfter > 0 ? retryAfter * 1000 : 2000 * intento * intento;
        if (intento < MAX_REINTENTOS) {
          await new Promise((r) => setTimeout(r, espera));
          continue;
        }
      }

      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status} ${res.statusText}`);

      const body = await res.text();
      const sha = sha256(body);
      const sinCambios = previo?.sha256 === sha;

      index[cacheKey] = {
        etag: res.headers.get('etag'),
        lastModified: res.headers.get('last-modified'),
        sha256: sha,
        lastChangedAt: sinCambios ? previo.lastChangedAt : now.toISOString(),
        bytes: Buffer.byteLength(body, 'utf8'),
      };

      return {
        status: sinCambios ? 'sin-cambios' : previo ? 'actualizado' : 'nuevo',
        body,
        sha,
        lastChangedAt: index[cacheKey]!.lastChangedAt,
      };
    } catch (err) {
      ultimoError = err;
      if (intento < MAX_REINTENTOS) {
        await new Promise((r) => setTimeout(r, 2000 * intento));
      }
    }
  }
  throw new Error(`fallo al descargar ${url}: ${String(ultimoError)}`);
}

export function bodyPathFor(fuente: string, nombre: string): string {
  return join(PATHS.raw, fuente, 'bodies', `${nombre}.json`);
}

export function metaPathFor(fuente: string, nombre: string): string {
  return join(PATHS.raw, fuente, `${nombre}.meta.json`);
}
