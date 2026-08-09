import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BuildIndex,
  CanonicalBuild,
  SkillsDataset,
  classById,
  skillNameKey,
  type BuildIndexRow,
  type SkillInfo,
} from '@d4es/schema';

function repoRoot(): string {
  let dir = resolve(dirname(fileURLToPath(import.meta.url)));
  for (let i = 0; i < 10; i++) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      const parsed = JSON.parse(readFileSync(pkg, 'utf8')) as { name?: string };
      if (parsed.name === 'd4es') return dir;
    }
    const padre = dirname(dir);
    if (padre === dir) break;
    dir = padre;
  }
  throw new Error('no encuentro la raiz del repo');
}

export const ROOT = repoRoot();
const DATA = join(ROOT, 'data');

/**
 * Todo se lee en tiempo de build desde data/. La web es 100% estatica: no hay base de
 * datos ni peticiones en runtime, y si los datos no validan, el build falla.
 */
export function loadIndex(): BuildIndex {
  const path = join(DATA, 'canonical', 'index.json');
  if (!existsSync(path)) {
    throw new Error(`falta ${path}. Ejecuta: npm run data:refresh`);
  }
  return BuildIndex.parse(JSON.parse(readFileSync(path, 'utf8')));
}

export function loadBuilds(): CanonicalBuild[] {
  const dir = join(DATA, 'canonical', 'builds');
  if (!existsSync(dir)) return [];
  const salida: CanonicalBuild[] = [];
  for (const clase of readdirSync(dir, { withFileTypes: true })) {
    if (!clase.isDirectory()) continue;
    for (const fichero of readdirSync(join(dir, clase.name))) {
      if (!fichero.endsWith('.json')) continue;
      const raw = JSON.parse(readFileSync(join(dir, clase.name, fichero), 'utf8'));
      salida.push(CanonicalBuild.parse(raw));
    }
  }
  return salida.sort((a, b) => a.id.localeCompare(b.id));
}

let cacheDataset: SkillsDataset | null = null;

/** Dataset de habilidades (descripciones, runas, categorias) para los tooltips. */
export function loadSkillsDataset(): SkillsDataset | null {
  if (cacheDataset) return cacheDataset;
  const path = join(DATA, 'canonical', 'skills-dataset.json');
  if (!existsSync(path)) return null;
  cacheDataset = SkillsDataset.parse(JSON.parse(readFileSync(path, 'utf8')));
  return cacheDataset;
}

export function skillInfo(nombreEn: string): SkillInfo | null {
  const dataset = loadSkillsDataset();
  return dataset?.byName[skillNameKey(nombreEn)] ?? null;
}

export interface CategoriaArbol {
  categoria: string;
  habilidades: SkillInfo[];
  /** Nodos del anillo que no son habilidades activas: son pasivas sin nombre publicado. */
  pasivas: number;
}

/**
 * Reconstruye el arbol de una clase: sus categorias en el orden real, con las
 * habilidades activas de cada una y cuantas pasivas la acompanan.
 *
 * La fuente dibuja su arbol en un canvas, asi que no se puede copiar; pero si publica el
 * tamano de cada anillo y la categoria de cada habilidad, y con eso se puede representar
 * sin inventar nada. Las pasivas se cuentan pero no se nombran, porque sus nombres no
 * estan publicados en ninguna parte.
 */
export function arbolDeClase(claseEnUS: string): CategoriaArbol[] {
  const dataset = loadSkillsDataset();
  if (!dataset) return [];

  const deLaClase = Object.values(dataset.byName)
    .filter((s) => s.class === claseEnUS && s.category !== null)
    // Las maestrias de arma (1h Axe, 2h Sword...) no son nodos del arbol.
    .filter((s) => !/^\dh |^polearm$/i.test(s.name))
    .sort((a, b) => a.orden - b.orden);

  const orden: string[] = [];
  const porCategoria = new Map<string, SkillInfo[]>();
  for (const s of deLaClase) {
    const cat = s.category!;
    if (!porCategoria.has(cat)) {
      porCategoria.set(cat, []);
      orden.push(cat);
    }
    porCategoria.get(cat)!.push(s);
  }

  const anillos = dataset.anillosPorClase[claseEnUS] ?? [];
  return orden.map((categoria, i) => {
    const habilidades = porCategoria.get(categoria) ?? [];
    const tamanoAnillo = anillos[i];
    return {
      categoria,
      habilidades,
      pasivas: tamanoAnillo !== undefined ? Math.max(0, tamanoAnillo - habilidades.length) : 0,
    };
  });
}

export interface EstadoJuego {
  expansion: string;
  temporadaActual: number;
  temporadaNombreEn: string;
  temporadaNombreEs: string | null;
  parche: string;
  inicio: string;
  finPrevisto: string;
  verificacion: { estado: string; fuente: string; fecha: string; parche: string };
}

export function loadEstado(): EstadoJuego {
  return JSON.parse(readFileSync(join(DATA, 'curated', 'estado-juego.json'), 'utf8')) as EstadoJuego;
}

export interface CoberturaI18n {
  generatedAt: string;
  diccionario: { sourceSha: string; counts: Record<string, number>; curated: Record<string, number> };
  resolucion: { hits: number; misses: number; missRate: number };
  sinTraducir: Record<string, { termino: string; veces: number }[]>;
}

export function loadCobertura(): CoberturaI18n | null {
  const path = join(DATA, 'reports', 'i18n-coverage.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as CoberturaI18n;
}

export interface EntradaDiccionario {
  idName: string;
  sno: number | null;
  category: string;
  en: string;
  es: string;
  source: string;
}

export interface Diccionario {
  meta: {
    generatedAt: string;
    sourceRepo: string;
    sourceSha: string;
    counts: Record<string, number>;
    curatedCounts: Record<string, number>;
  };
  byIdName: Record<string, EntradaDiccionario>;
  byEnglish: Record<string, EntradaDiccionario>;
}

let cacheDiccionario: Diccionario | null = null;

export function loadDiccionario(): Diccionario {
  if (cacheDiccionario) return cacheDiccionario;
  const path = join(DATA, 'i18n', 'dictionary.esES.json');
  if (!existsSync(path)) {
    throw new Error(`falta ${path}. Ejecuta: npm run i18n:sync && npm run i18n:build`);
  }
  cacheDiccionario = JSON.parse(readFileSync(path, 'utf8')) as Diccionario;
  return cacheDiccionario;
}

/** Todas las entradas de una categoria, ordenadas por su nombre en castellano. */
export function porCategoria(categoria: string): EntradaDiccionario[] {
  const dict = loadDiccionario();
  return Object.values(dict.byIdName)
    .filter((e) => e.category === categoria)
    .sort((a, b) => a.es.localeCompare(b.es, 'es'));
}

export function claseNombre(classId: string, diccionarioClases: Map<string, string>): string {
  const meta = classById(classId);
  return diccionarioClases.get(meta?.enUS ?? '') ?? meta?.enUS ?? classId;
}

/** Nombres de clase en castellano, con su procedencia (data/curated/clases.esES.json). */
export function loadClasesEs(): Map<string, string> {
  const path = join(DATA, 'curated', 'clases.esES.json');
  const mapa = new Map<string, string>();
  if (!existsSync(path)) return mapa;
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { entradas?: { en: string; es: string }[] };
  for (const e of parsed.entradas ?? []) mapa.set(e.en, e.es);
  return mapa;
}

export function buildUrl(row: Pick<BuildIndexRow, 'classSlug' | 'id'>): string {
  return `/builds/${row.classSlug}/${row.id}`;
}

/** Cuantos dias quedan de temporada. Negativo = ya deberia haber terminado. */
export function diasHastaFinDeTemporada(estado: EstadoJuego, hoy: Date): number {
  const fin = Date.parse(`${estado.finPrevisto}T00:00:00Z`);
  return Math.ceil((fin - hoy.getTime()) / 86_400_000);
}
