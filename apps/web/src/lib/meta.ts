import type { CanonicalBuild, GameRef } from '@d4es/schema';

/**
 * El meta en cifras: que llevan de verdad las builds del catalogo.
 *
 * Todo el mundo publica tier lists, que son una opinion. Esto es otra cosa: contar lo que
 * las 92 builds EQUIPAN. Sale entero de los datos canonicos, sin extraer nada nuevo, y es
 * algo que solo se puede hacer teniendo el catalogo entero delante — la ficha de una build
 * no te dice si su aspecto lo lleva todo el mundo o solo ella.
 *
 * Se cuenta UNA VEZ POR BUILD (por su variante principal), no por aparicion: si una build
 * lleva el mismo aspecto en dos ranuras, sigue siendo una build.
 */

export interface FilaMeta {
  es: string | null;
  en: string;
  /** Cuantas builds lo llevan. */
  builds: number;
  /** Sobre cuantas se cuenta (el total del grupo). */
  de: number;
  /** Clases distintas en las que aparece. */
  clases: number;
}

function vacio(): Map<string, { ref: GameRef; builds: Set<string>; clases: Set<string> }> {
  return new Map();
}

export interface MetaCategoria {
  /** Identificador estable para anclas y filtros. */
  id: string;
  titulo: string;
  /** Una linea que explica que se esta contando y por que importa. */
  pie: string;
  filas: FilaMeta[];
}

export interface MetaClase {
  claseId: string;
  builds: number;
  categorias: MetaCategoria[];
}

function aFilas(
  mapa: ReturnType<typeof vacio>,
  total: number,
  limite: number,
): FilaMeta[] {
  return [...mapa.values()]
    .map((x) => ({
      es: x.ref.esES,
      en: x.ref.enUS,
      builds: x.builds.size,
      de: total,
      clases: x.clases.size,
    }))
    // Desempate por nombre para que dos pasadas den lo mismo.
    .sort((a, b) => b.builds - a.builds || (a.es ?? a.en).localeCompare(b.es ?? b.en, 'es'))
    .slice(0, limite);
}

/**
 * Cuenta aspectos, unicos, habilidades, glifos, tableros, runas y mercenarios sobre un
 * conjunto de builds. `limite` corta cada lista para que la pagina siga siendo legible.
 */
export function contarMeta(builds: readonly CanonicalBuild[], limite = 15): MetaCategoria[] {
  const aspectos = vacio();
  const unicos = vacio();
  const habilidades = vacio();
  const glifos = vacio();
  const tableros = vacio();
  const runas = vacio();
  const mercenarios = vacio();

  const anotar = (
    mapa: ReturnType<typeof vacio>,
    ref: GameRef,
    buildId: string,
    claseId: string,
  ) => {
    // La clave es el nombre ingles: es lo unico que existe siempre (el castellano puede
    // faltar, y el idName no lo traen todas las categorias).
    const k = ref.enUS;
    let e = mapa.get(k);
    if (!e) {
      e = { ref, builds: new Set(), clases: new Set() };
      mapa.set(k, e);
    }
    e.builds.add(buildId);
    e.clases.add(claseId);
  };

  for (const b of builds) {
    const v = b.variants.find((x) => x.id === b.primaryVariantId) ?? b.variants[0];
    if (!v) continue;
    for (const s of v.skills) anotar(habilidades, s.ref, b.id, b.classId);
    for (const pieza of Object.values(v.gear)) {
      if (pieza.item) anotar(unicos, pieza.item, b.id, b.classId);
      if (pieza.aspect) anotar(aspectos, pieza.aspect, b.id, b.classId);
      for (const s of pieza.sockets) anotar(runas, s, b.id, b.classId);
    }
    for (const t of v.paragon.boards) {
      anotar(tableros, t.ref, b.id, b.classId);
      if (t.glyph) anotar(glifos, t.glyph.ref, b.id, b.classId);
    }
    if (v.mercenary) anotar(mercenarios, v.mercenary.ref, b.id, b.classId);
  }

  const total = builds.length;
  return [
    {
      id: 'aspectos',
      titulo: 'Aspectos más equipados',
      pie: 'De todas las piezas legendarias del catálogo, éstos son los poderes que más se repiten.',
      filas: aFilas(aspectos, total, limite),
    },
    {
      id: 'unicos',
      titulo: 'Únicos y míticos más equipados',
      pie: 'Lo que de verdad hay que buscar: si un único aparece en media lista, es prioridad de farmeo.',
      filas: aFilas(unicos, total, limite),
    },
    {
      id: 'habilidades',
      titulo: 'Habilidades más usadas',
      pie: 'Las que ocupan barra. Mezcla todas las clases, así que lo interesante es mirarlo por clase.',
      filas: aFilas(habilidades, total, limite),
    },
    {
      id: 'glifos',
      titulo: 'Glifos más engarzados',
      pie: 'Los que conviene subir primero en la Fosa, porque los vas a usar juegues lo que juegues.',
      filas: aFilas(glifos, total, limite),
    },
    {
      id: 'tableros',
      titulo: 'Tableros de Paragón más montados',
      pie: 'Qué tableros se repiten entre builds de la misma clase.',
      filas: aFilas(tableros, total, limite),
    },
    {
      id: 'runas',
      titulo: 'Runas y gemas más engarzadas',
      pie: 'Lo que se pone en los huecos. Ojo: gemas y runas se cuentan juntas porque comparten hueco.',
      filas: aFilas(runas, total, limite),
    },
    {
      id: 'mercenarios',
      titulo: 'Mercenarios contratados',
      pie: 'Cuál se lleva, sobre las builds que publican mercenario.',
      filas: aFilas(mercenarios, total, limite),
    },
  ].filter((c) => c.filas.length > 0);
}

/**
 * El "núcleo" de una clase: lo que llevan CASI TODAS sus builds. Es la respuesta a «si
 * juego esta clase, ¿qué voy a necesitar sí o sí?», que ninguna ficha suelta contesta.
 */
export function nucleoDeClase(
  builds: readonly CanonicalBuild[],
  umbral = 0.6,
): { es: string | null; en: string; builds: number; de: number; tipo: string }[] {
  const total = builds.length;
  if (total < 3) return [];
  const categorias = contarMeta(builds, 100);
  const salida: { es: string | null; en: string; builds: number; de: number; tipo: string }[] = [];
  for (const c of categorias) {
    // Los tableros y las habilidades son casi obligados por clase: no aportan como
    // "núcleo", que va de lo que hay que conseguir.
    if (c.id === 'tableros' || c.id === 'habilidades') continue;
    for (const f of c.filas) {
      if (f.builds / total >= umbral) salida.push({ ...f, tipo: c.id });
    }
  }
  return salida.sort((a, b) => b.builds - a.builds || (a.es ?? a.en).localeCompare(b.es ?? b.en, 'es'));
}
