import { mkdir, readdir, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import {
  BuildIndex,
  RawD4BuildsCatalog,
  RawD4BuildsTierList,
  classById,
  type BuildIndexRow,
  type CanonicalBuild,
} from '@d4es/schema';
import { Resolver, type Dictionary } from '@d4es/i18n';
import { PATHS } from '../paths.js';
import { loadEstadoJuego } from '../estado-juego.js';
import { readSnapshot } from '../sources/d4builds/scrape.js';
import { normalizeD4BuildsCatalog } from '../sources/d4builds/normalize.js';
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
    hasMythic,
    completeness: principal.completeness.score,
    season: build.gameVersion.season,
    updatedAt: build.updatedAt,
  };
}

/** Si la mayoria del catalogo ya declara una temporada mayor, es que ha cambiado la season. */
function detectarTemporada(builds: readonly CanonicalBuild[], actual: number): number | null {
  if (builds.length === 0) return null;
  const conteo = new Map<number, number>();
  for (const b of builds) conteo.set(b.gameVersion.season, (conteo.get(b.gameVersion.season) ?? 0) + 1);
  for (const [temporada, veces] of conteo) {
    if (temporada > actual && veces / builds.length > 0.2) return temporada;
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

  const previo = await readJsonIfExists<BuildIndex>(PATHS.buildIndex);
  const existentes = await idsExistentes();
  const nuevos = new Set(builds.map((b) => b.id));
  const aBorrar = [...existentes.keys()].filter((id) => !nuevos.has(id));

  const stats = resolver.stats();
  const guard = evaluarGuardrails({
    buildsAnteriores: previo?.count ?? 0,
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
    builds: builds.map(fila),
  };
  if (await writeIfChanged(PATHS.buildIndex, stableStringify(BuildIndex.parse(indice)))) tocados++;

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
