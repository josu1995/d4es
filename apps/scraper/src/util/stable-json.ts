import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Serializacion con claves ordenadas. Sin esto, el diff del PR diario seria ruido y no
 * se podria revisar de un vistazo lo que ha cambiado de verdad en las builds.
 */
export function stableStringify(value: unknown): string {
  return `${JSON.stringify(ordenar(value), null, 2)}\n`;
}

function ordenar(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordenar);
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) out[k] = ordenar(src[k]);
    return out;
  }
  return value;
}

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Hash del CONTENIDO, no de su representacion: dos ordenes de clave dan el mismo hash. */
export function hashOf(value: unknown): string {
  return sha256(JSON.stringify(ordenar(value)));
}

/**
 * Escribe solo si el contenido cambia. Es lo que hace que ejecutar el pipeline dos veces
 * seguidas deje el working tree limpio y que Netlify no gaste un deploy por nada.
 */
export async function writeIfChanged(path: string, contenido: string): Promise<boolean> {
  if (existsSync(path)) {
    const actual = await readFile(path, 'utf8');
    if (actual === contenido) return false;
  } else {
    await mkdir(dirname(path), { recursive: true });
  }
  await writeFile(path, contenido, 'utf8');
  return true;
}

export async function readJsonIfExists<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}
