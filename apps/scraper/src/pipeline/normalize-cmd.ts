import { mkdir, readdir, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import {
  BuildIndex,
  Historial,
  RawD4BuildsCatalog,
  RawD4BuildsTierList,
  SkillsDataset,
  classById,
  skillIconSlug,
  skillNameKey,
  unwrapTemplates,
  type BuildIndexRow,
  type CanonicalBuild,
  type SkillInfo,
} from '@d4es/schema';
import { Resolver, type Dictionary } from '@d4es/i18n';
import { PATHS } from '../paths.js';
import { loadEstadoJuego } from '../estado-juego.js';
import { readSnapshot } from '../sources/d4builds/scrape.js';
import { normalizeD4BuildsCatalog } from '../sources/d4builds/normalize.js';
import { enriquecerConPagina } from '../sources/d4builds/normalize-pages.js';
import { construirLayoutPlanes } from '../sources/d4builds/warplans-layout.js';
import { construirLayoutParagon } from '../sources/d4builds/paragon-layout.js';
import { calcularHistorial } from './historial.js';
import type { PaginaRaw } from '../sources/d4builds/scrape-pages.js';
import { readJsonIfExists, stableStringify, writeIfChanged } from '../util/stable-json.js';
import { evaluarGuardrails } from './guardrails.js';

export interface NormalizeResultado {
  ok: boolean;
  cambioDeTemporada: boolean;
  ficherosTocados: number;
  builds: number;
  fallos: string[];
  avisos: string[];
  etiquetas: string[];
}

async function idsExistentes(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (!existsSync(PATHS.canonicalBuilds)) return mapa;
  const entradas = await readdir(PATHS.canonicalBuilds, { withFileTypes: true, recursive: true });
  for (const e of entradas) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    const completa = join(e.parentPath ?? e.path, e.name);
    mapa.set(e.name.replace(/\.json$/, ''), completa);
  }
  return mapa;
}

/**
 * Extrae el dataset de habilidades que el catalogo trae de regalo en pageContext.skills:
 * categoria, descripcion y descripciones de runas. Es la materia prima de los tooltips.
 */
/**
 * Tamaño de cada anillo del arbol por clase. Es lo unico que la fuente publica sobre la
 * forma del arbol (el resto lo dibuja en un canvas), y basta para representarlo.
 */
function extraerAnillos(estructura: unknown): Record<string, number[]> {
  const raiz = (estructura as { result?: { pageContext?: { skillTreeStructure?: unknown } } }).result?.pageContext
    ?.skillTreeStructure;
  if (!raiz || typeof raiz !== 'object') return {};
  const salida: Record<string, number[]> = {};
  for (const [clase, valor] of Object.entries(raiz as Record<string, unknown>)) {
    if (Array.isArray(valor) && valor.every((n) => typeof n === 'number')) {
      salida[clase] = valor as number[];
    }
  }
  return salida;
}

function extraerDataset(catalogo: unknown, generatedAt: string): SkillsDataset {
  const pc = (catalogo as { result?: { pageContext?: { skills?: unknown } } }).result?.pageContext;
  const crudas = Array.isArray(pc?.skills) ? (pc.skills as Record<string, unknown>[]) : [];
  const byName: Record<string, SkillInfo> = {};

  const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
  const lineas = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(unwrapTemplates) : [];

  for (const [indice, s] of crudas.entries()) {
    const name = texto(s['name']);
    if (!name) continue;
    const tags = Array.isArray(s['tags']) ? (s['tags'] as unknown[]).filter((t): t is string => typeof t === 'string') : [];
    const runas: Record<string, string> = {};
    if (Array.isArray(s['runes'])) {
      for (const r of s['runes'] as Record<string, unknown>[]) {
        const rn = texto(r['name']);
        const rd = lineas(r['description']).join(' ');
        if (rn && rd) runas[rn] = rd;
      }
    }
    // El coste viene en campos distintos por clase (fury_cost, wrath_generate...).
    const coste = Object.entries(s)
      .filter(([k, v]) => /_cost$|_generate$/.test(k) && (typeof v === 'string' || typeof v === 'number'))
      .map(([k, v]) => `${String(v)} (${k.replace(/_/g, ' ')})`)
      .join(', ');

    byName[skillNameKey(name)] = {
      name,
      class: texto(s['class']),
      // El orden del listado de origen conserva el orden real del arbol.
      orden: indice,
      category: tags[0] ?? null,
      tags,
      description: lineas(s['description']).join(' ') || null,
      extra: lineas(s['extra']),
      cost: coste || null,
      luckyHit: texto(s['lucky_hit']),
      runes: runas,
    };
  }

  return {
    generatedAt,
    source: 'd4builds pageContext.skills',
    count: Object.keys(byName).length,
    byName,
    anillosPorClase: {},
  };
}

function fila(build: CanonicalBuild): BuildIndexRow {
  const clase = classById(build.classId);
  const principal = build.variants.find((v) => v.id === build.primaryVariantId) ?? build.variants[0]!;
  const hasMythic = build.variants.some((v) =>
    Object.values(v.gear).some((g) => g?.mythic.isMythic === true),
  );
  return {
    id: build.id,
    classId: build.classId,
    classSlug: clase?.slug ?? build.classId,
    title: build.title.es,
    titleEn: build.title.en,
    tierLabel: build.ratings.tierLabel,
    pitTier: build.ratings.pitTier,
    content: build.tags.content,
    sources: [...new Set(build.variants.map((v) => v.source.site))].sort(),
    authors: [...new Set(build.variants.map((v) => v.source.author).filter((a): a is string => a !== null))].sort(),
    // El indice guarda lo que se PINTA, para que el filtrado en cliente no tenga que
    // resolver referencias ni cargar el diccionario entero.
    skills: principal.skills.map((s) => s.ref.esES ?? s.ref.enUS),
    // El icono de la variante de skill (si la hay) es el que pinta d4builds.
    skillIcons: principal.skills.map((s) => skillIconSlug(s.skillVariant?.enUS ?? s.ref.enUS)),
    hasMythic,
    completeness: principal.completeness.score,
    season: build.gameVersion.season,
    updatedAt: build.updatedAt,
  };
}

/**
 * Cuando una parte suficiente del catalogo declara una temporada MAYOR que la
 * configurada, es que ha cambiado la season: la ingesta se para sola y abre incidencia
 * con el checklist, en vez de publicar builds de dos temporadas mezcladas.
 *
 * El umbral no es capricho. Unas pocas builds adelantadas al PTR no son un cambio de
 * temporada, y pararse por ellas dejaria el sitio congelado sin motivo; pero esperar a la
 * mayoria llegaria tarde y ya habriamos publicado la mezcla. Un quinto del catalogo es el
 * punto donde ya no es ruido.
 *
 * Se exporta para poder probarlo: es la unica pieza que impide publicar datos de dos
 * temporadas, se dispara una vez cada tres meses y, si se rompe, se rompe en silencio.
 */
export const UMBRAL_CAMBIO_TEMPORADA = 0.2;

export function detectarTemporada(builds: readonly CanonicalBuild[], actual: number): number | null {
  if (builds.length === 0) return null;
  const conteo = new Map<number, number>();
  for (const b of builds) conteo.set(b.gameVersion.season, (conteo.get(b.gameVersion.season) ?? 0) + 1);
  // De mayor a menor: si el origen ya publica dos temporadas por delante, manda la mayor.
  const candidatas = [...conteo.entries()].sort((a, b) => b[0] - a[0]);
  for (const [temporada, veces] of candidatas) {
    if (temporada > actual && veces / builds.length > UMBRAL_CAMBIO_TEMPORADA) return temporada;
  }
  return null;
}

export async function runNormalize(): Promise<NormalizeResultado> {
  const estado = await loadEstadoJuego();
  const dict = await readJsonIfExists<Dictionary>(PATHS.dictionary);
  if (!dict) {
    throw new Error(`falta ${PATHS.dictionary}. Ejecuta primero: npm run i18n:sync && npm run i18n:build`);
  }

  const catalogo = await readSnapshot('catalog');
  const tierlist = await readSnapshot('tierlist').catch(() => null);
  if (catalogo.desdeFixture) {
    process.stdout.write('  aviso: normalizando desde FIXTURE (no hay snapshot descargado)\n');
  }

  const resolver = new Resolver(dict);
  const { builds, avisos } = normalizeD4BuildsCatalog({
    catalog: RawD4BuildsCatalog.parse(catalogo.body),
    tierList: tierlist ? RawD4BuildsTierList.parse(tierlist.body) : null,
    resolver,
    capturedAt: catalogo.meta.lastChangedAt,
    estado,
  });

  // Enriquecimiento con lo extraido de las paginas: equipo, Paragon y mercenarios.
  const relleno = { conGear: 0, conParagon: 0, conMercenario: 0, paginas: 0 };

  // La pagina muestra habilidades de mercenario, no el mercenario. Este mapa permite
  // deducir de quien son: el dataset trae la clase de cada habilidad, y para las de
  // mercenario esa clase es el propio mercenario ("Varyana, The Berserker Crone").
  const mercenarioPorHabilidad = new Map<string, string>();
  // Los 100 nodos de plan de guerra viajan en ESE MISMO dataset, como las entradas sin
  // clase: la pagina solo publica el fichero del icono (corrupted_roots), y el nombre en
  // limpio y su descripcion salen de aqui. Se cruzan por la misma clave que las skills.
  const nombreDeNodoPlan = new Map<string, string>();
  {
    const dsPrevio = await readJsonIfExists<{ byName?: Record<string, { name: string; class: string | null }> }>(
      join(PATHS.canonical, 'skills-dataset.json'),
    );
    for (const s of Object.values(dsPrevio?.byName ?? {})) {
      if (s.class && /Raheir|Varyana|Subo|Aldkin/.test(s.class)) {
        mercenarioPorHabilidad.set(skillNameKey(s.name), s.class);
      }
      if (!s.class) nombreDeNodoPlan.set(skillNameKey(s.name), s.name);
    }
  }
  const nombreDeNodo = (slug: string): string | null =>
    nombreDeNodoPlan.get(skillNameKey(decodeURIComponent(slug).replace(/_/g, ' '))) ?? null;
  const dirPaginas = join(PATHS.raw, 'd4builds', 'pages');
  // Se van guardando para construir despues, de una vez, los catalogos con la forma de
  // los arboles de planes de guerra (la misma en todas las builds) y de los tableros de
  // Paragon (la misma por tablero; se necesita la clase porque los tableros son por
  // clase y "Starting Board" se repite en las cinco con casillas distintas).
  const paginasLeidas: PaginaRaw[] = [];
  const paginasConClase: { clase: string; pagina: PaginaRaw }[] = [];
  if (existsSync(dirPaginas)) {
    for (let i = 0; i < builds.length; i++) {
      const build = builds[i]!;
      const externalId = build.variants.find((v) => v.source.site === 'd4builds')?.source.externalId;
      if (!externalId) continue;
      const pagina = await readJsonIfExists<PaginaRaw>(join(dirPaginas, `${externalId}.json`));
      if (!pagina) continue;
      paginasLeidas.push(pagina);
      paginasConClase.push({ clase: classById(build.classId)?.slug ?? build.classId, pagina });
      relleno.paginas++;
      const res = enriquecerConPagina(build, pagina, resolver, mercenarioPorHabilidad, nombreDeNodo);
      builds[i] = res.build;
      if (res.relleno.gear > 0) relleno.conGear++;
      if (res.relleno.paragon > 0) relleno.conParagon++;
      if (res.relleno.mercenarios > 0) relleno.conMercenario++;
    }
    if (relleno.paginas > 0) {
      process.stdout.write(
        `  paginas aplicadas: ${relleno.paginas} | con equipo: ${relleno.conGear} | ` +
          `paragon: ${relleno.conParagon} | mercenarios: ${relleno.conMercenario}\n`,
      );
    }
  }

  const previo = await readJsonIfExists<BuildIndex>(PATHS.buildIndex);
  const existentes = await idsExistentes();
  const nuevos = new Set(builds.map((b) => b.id));
  const aBorrar = [...existentes.keys()].filter((id) => !nuevos.has(id));

  const stats = resolver.stats();
  const previoValido = previo ? BuildIndex.safeParse(previo) : null;
  // Una base de fixtures no sirve para medir la variacion de la primera ingesta real.
  const lineaBase = previoValido?.success && previoValido.data.origen === 'real' ? previoValido.data.count : 0;
  const guard = evaluarGuardrails({
    buildsAnteriores: lineaBase,
    buildsActuales: builds.length,
    eliminadas: aBorrar.length,
    ficherosTocados: builds.length,
    missRateI18n: stats.missRate,
    bytesDescargados: catalogo.meta.bytes + (tierlist?.meta.bytes ?? 0),
    driftDetectado: false,
    modoFixture: catalogo.desdeFixture,
  });

  if (!guard.ok) {
    return {
      ok: false,
      cambioDeTemporada: false,
      ficherosTocados: 0,
      builds: builds.length,
      fallos: guard.fallos,
      avisos: [...avisos, ...guard.avisos],
      etiquetas: guard.etiquetas,
    };
  }

  // A partir de aqui ya se escribe.
  let tocados = 0;
  for (const build of builds) {
    const clase = classById(build.classId);
    const destino = join(PATHS.canonicalBuilds, clase?.slug ?? build.classId, `${build.id}.json`);
    await mkdir(join(PATHS.canonicalBuilds, clase?.slug ?? build.classId), { recursive: true });
    if (await writeIfChanged(destino, stableStringify(build))) tocados++;
  }
  for (const id of aBorrar) {
    const path = existentes.get(id)!;
    await rm(path);
    tocados++;
    avisos.push(`${id}: ya no esta en el origen — fichero eliminado (${relative(PATHS.data, path)})`);
  }

  const indice: BuildIndex = {
    // Deterministico a proposito: la fecha sale del snapshot, no del reloj, para que dos
    // ejecuciones seguidas no generen un diff falso ni un deploy innecesario.
    generatedAt: catalogo.meta.lastChangedAt,
    season: estado.temporadaActual,
    patch: estado.parche,
    count: builds.length,
    origen: catalogo.desdeFixture ? 'fixture' : 'real',
    builds: builds.map(fila),
  };
  if (await writeIfChanged(PATHS.buildIndex, stableStringify(BuildIndex.parse(indice)))) tocados++;

  // La forma de los arboles de planes de guerra. Una sola vez para las 92 builds: es
  // identica en todas, y asi la ficha puede pintar el arbol entero, no solo los nodos
  // que coge cada build.
  if (paginasLeidas.length > 0) {
    const layout = construirLayoutPlanes(paginasLeidas, nombreDeNodo, catalogo.meta.lastChangedAt);
    avisos.push(...layout.avisos);
    if (layout.dataset.activities.length > 0) {
      const path = join(PATHS.canonical, 'warplans-dataset.json');
      if (await writeIfChanged(path, stableStringify(layout.dataset))) tocados++;
      const nodos = layout.dataset.activities.reduce((n, a) => n + a.nodes.length, 0);
      process.stdout.write(
        `  planes de guerra: ${layout.dataset.activities.length} actividades, ${nodos} nodos de forma\n`,
      );
    }
  }

  // El historial: que cambio en cada build respecto a la pasada anterior. Se calcula
  // DESPUES de los guardarrailes, con las builds que de verdad se han publicado, y su
  // fecha es la del snapshot (determinista, como todo lo demas).
  {
    const path = join(PATHS.canonical, 'historial.json');
    const previo = await readJsonIfExists<Historial>(path);
    const res = calcularHistorial(builds, previo, catalogo.meta.lastChangedAt);
    if (await writeIfChanged(path, stableStringify(Historial.parse(res.historial)))) tocados++;
    process.stdout.write(
      `  historial: pasada ${res.historial.pasadas} | ${res.conCambios} builds con cambios de la fuente\n`,
    );
    if (res.atribuidosAlSitio.length > 0) {
      // No es un fallo: es el guardarrail funcionando. Pero queda dicho, porque significa
      // que esta pasada tocamos algo nosotros y esos cambios NO son de las guias.
      avisos.push(
        `historial: ${res.atribuidosAlSitio.join(', ')} cambiaron en medio catalogo a la vez — ` +
          `se atribuyen al sitio, no a las builds`,
      );
    }
  }

  // La forma de los tableros de Paragon, una sola vez por tablero: con ella la ficha
  // dibuja el tablero entero y enciende solo las casillas que la build recorre.
  if (paginasConClase.length > 0) {
    const layout = construirLayoutParagon(paginasConClase, catalogo.meta.lastChangedAt);
    avisos.push(...layout.avisos);
    if (layout.dataset.boards.length > 0) {
      const path = join(PATHS.canonical, 'paragon-boards-dataset.json');
      if (await writeIfChanged(path, stableStringify(layout.dataset))) tocados++;
      const casillas = layout.dataset.boards.reduce((n, b) => n + b.tiles.length, 0);
      process.stdout.write(
        `  paragon: ${layout.dataset.boards.length} tableros de forma, ${casillas} casillas\n`,
      );
    }
  }

  // El dataset de habilidades (tooltips y arbol): viene de regalo en el mismo catalogo.
  const dataset = extraerDataset(catalogo.body, catalogo.meta.lastChangedAt);
  const estructura = await readSnapshot('treeStructure').catch(() => null);
  if (estructura) dataset.anillosPorClase = extraerAnillos(estructura.body);
  if (dataset.count > 0) {
    const datasetPath = join(PATHS.canonical, 'skills-dataset.json');
    if (await writeIfChanged(datasetPath, stableStringify(SkillsDataset.parse(dataset)))) tocados++;
  }

  await mkdir(PATHS.reports, { recursive: true });
  await writeIfChanged(
    join(PATHS.reports, 'i18n-coverage.json'),
    stableStringify({
      generatedAt: catalogo.meta.lastChangedAt,
      diccionario: { sourceSha: dict.meta.sourceSha, counts: dict.meta.counts, curated: dict.meta.curatedCounts },
      resolucion: { hits: stats.hits, misses: stats.misses, missRate: stats.missRate },
      sinTraducir: stats.porCategoria,
    }),
  );

  const temporadaNueva = detectarTemporada(builds, estado.temporadaActual);

  await writeIfChanged(
    join(PATHS.reports, 'ingesta.json'),
    stableStringify({
      generatedAt: catalogo.meta.lastChangedAt,
      builds: builds.length,
      eliminadas: aBorrar.length,
      avisos,
      etiquetas: guard.etiquetas,
      temporadaDetectada: temporadaNueva,
      temporadaConfigurada: estado.temporadaActual,
    }),
  );

  return {
    ok: true,
    cambioDeTemporada: temporadaNueva !== null,
    ficherosTocados: tocados,
    builds: builds.length,
    fallos: [],
    avisos: [...avisos, ...guard.avisos],
    etiquetas: guard.etiquetas,
  };
}
