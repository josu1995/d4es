import { sha256 } from '../util/stable-json.js';

/**
 * Hash de la FORMA del JSON, no de su contenido. Sirve para detectar que la fuente ha
 * cambiado su esquema (campo nuevo, campo que desaparece, tipo que cambia) sin que un
 * cambio normal de datos dispare una falsa alarma.
 */
export function shapePaths(value: unknown, maxDepth = 6): string[] {
  const rutas = new Set<string>();
  walk(value, '', 0, maxDepth, rutas);
  return [...rutas].sort();
}

function tipoDe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function walk(value: unknown, ruta: string, depth: number, maxDepth: number, out: Set<string>): void {
  if (depth > maxDepth) return;
  if (Array.isArray(value)) {
    out.add(`${ruta}:array`);
    // Se recorre una muestra: los arrays de la fuente son homogeneos y 25 elementos
    // bastan para ver campos opcionales sin que el coste crezca con el catalogo.
    for (const item of value.slice(0, 25)) walk(item, `${ruta}[]`, depth + 1, maxDepth, out);
    return;
  }
  if (value !== null && typeof value === 'object') {
    out.add(`${ruta}:object`);
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      walk(v, ruta === '' ? k : `${ruta}.${k}`, depth + 1, maxDepth, out);
    }
    return;
  }
  out.add(`${ruta}:${tipoDe(value)}`);
}

export function fingerprint(value: unknown): string {
  return sha256(shapePaths(value).join('\n'));
}

export interface DriftResult {
  changed: boolean;
  added: string[];
  removed: string[];
}

export function diffShape(anterior: readonly string[], actual: readonly string[]): DriftResult {
  const a = new Set(anterior);
  const b = new Set(actual);
  const added = [...b].filter((x) => !a.has(x)).sort();
  const removed = [...a].filter((x) => !b.has(x)).sort();
  return { changed: added.length > 0 || removed.length > 0, added, removed };
}
