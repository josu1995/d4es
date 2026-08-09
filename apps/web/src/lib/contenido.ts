import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Jefe, Llave, Material, Receta, slugify, type Cifra, type TextoVerificado } from '@d4es/schema';
import { ROOT, loadDiccionario, porCategoria } from './data';

const CURATED = join(ROOT, 'data', 'curated');

function leer<T>(fichero: string, clave: string, esquema: { parse: (v: unknown) => T }): T[] {
  const path = join(CURATED, fichero);
  if (!existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const lista = Array.isArray(raw[clave]) ? (raw[clave] as unknown[]) : [];
  return lista.map((x) => esquema.parse(x));
}

let cache: {
  jefes: Jefe[];
  llaves: Llave[];
  materiales: Material[];
  recetas: Receta[];
  iconicos: string[];
} | null = null;

export function loadContenido() {
  if (cache) return cache;
  const recetasRaw = existsSync(join(CURATED, 'recetas-miticos.json'))
    ? (JSON.parse(readFileSync(join(CURATED, 'recetas-miticos.json'), 'utf8')) as { iconicos?: string[] })
    : {};
  cache = {
    jefes: leer('jefes.json', 'jefes', Jefe),
    llaves: leer('llaves.json', 'llaves', Llave),
    materiales: leer('materiales.json', 'materiales', Material),
    recetas: leer('recetas-miticos.json', 'recetas', Receta),
    iconicos: recetasRaw.iconicos ?? [],
  };
  return cache;
}

/** Texto a mostrar de un campo verificado: castellano si lo hay, si no el ingles. */
export function texto(t: TextoVerificado): string {
  return t.es ?? t.en;
}

export function esDudoso(v: { estado: string }): boolean {
  return v.estado !== 'verificado';
}

export function valorCifra(c: Cifra | null): number | null {
  return c?.valor ?? null;
}

// --- Unicos -------------------------------------------------------------------------

export interface UnicoFicha {
  slug: string;
  en: string;
  es: string;
  idName: string;
  /** Jefes que lo sueltan, segun el grafo curado. */
  jefes: Jefe[];
  esIconico: boolean;
}

let cacheUnicos: UnicoFicha[] | null = null;

/**
 * Cruza el diccionario oficial (que da el nombre en castellano) con el grafo curado de
 * jefes (que dice quien lo suelta). El resultado es la respuesta a la pregunta que de
 * verdad se hace el jugador: "quiero este unico, de donde sale".
 */
export function loadUnicos(): UnicoFicha[] {
  if (cacheUnicos) return cacheUnicos;
  const { jefes, iconicos } = loadContenido();
  const normal = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const porUnico = new Map<string, Jefe[]>();
  for (const jefe of jefes) {
    for (const u of jefe.unicos) {
      const k = normal(u);
      if (!porUnico.has(k)) porUnico.set(k, []);
      porUnico.get(k)!.push(jefe);
    }
  }
  const setIconicos = new Set(iconicos.map(normal));

  const vistos = new Set<string>();
  cacheUnicos = porCategoria('unique')
    .map((e) => {
      const slug = slugify(e.en);
      return {
        slug,
        en: e.en,
        es: e.es,
        idName: e.idName,
        jefes: porUnico.get(normal(e.en)) ?? [],
        esIconico: setIconicos.has(normal(e.en)),
      };
    })
    // El diccionario trae variantes con el mismo nombre visible: nos quedamos con la primera.
    .filter((u) => {
      if (u.slug === '' || vistos.has(u.slug)) return false;
      vistos.add(u.slug);
      return true;
    });
  return cacheUnicos;
}

export function buscarUnico(slug: string): UnicoFicha | undefined {
  return loadUnicos().find((u) => u.slug === slug);
}

/** Traduce un nombre de unico en ingles usando el diccionario oficial. */
export function unicoEnCastellano(nombreEn: string): string {
  const dict = loadDiccionario();
  const k = `unique:${nombreEn.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
  return dict.byEnglish[k]?.es ?? nombreEn;
}
