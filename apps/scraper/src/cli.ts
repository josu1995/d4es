import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { buildDictionary, syncCompanion } from '@d4es/i18n';
import { PATHS } from './paths.js';
import { scrapeD4BuildsCatalog } from './sources/d4builds/scrape.js';
import { runNormalize } from './pipeline/normalize-cmd.js';
import { runCorrelate, runVerify } from './pipeline/verify.js';
import { readJsonIfExists, stableStringify, writeIfChanged } from './util/stable-json.js';

/**
 * Codigos de salida (los usa .github/workflows/ingest.yml para decidir que hacer):
 *   0 todo bien   1 error   2 guardrail disparado   3 cambio de temporada detectado
 */
const EXIT = { ok: 0, error: 1, guardrail: 2, temporada: 3 } as const;

const CURATED = [
  join(PATHS.curated, 'clases.esES.json'),
  join(PATHS.curated, 'skills.esES.json'),
  join(PATHS.curated, 'terminos.esES.json'),
];

async function cmdI18nSync(): Promise<number> {
  process.stdout.write('Descargando Diablo4Companion (MIT) a vendor/...\n');
  const { sha } = await syncCompanion(PATHS.vendor);
  process.stdout.write(`Listo. Commit fijado: ${sha}\n`);
  return EXIT.ok;
}

async function cmdI18nBuild(): Promise<number> {
  process.stdout.write('Compilando diccionario esES...\n');
  const dict = await buildDictionary({ vendorDir: PATHS.vendor, curatedFiles: CURATED, now: new Date() });
  await mkdir(PATHS.i18nDir, { recursive: true });
  // El diccionario se versiona: asi la web se construye sin salir a internet.
  await writeIfChanged(PATHS.dictionary, stableStringify(dict));
  const total = Object.values(dict.meta.counts).reduce((a, b) => a + b, 0);
  const curados = Object.values(dict.meta.curatedCounts).reduce((a, b) => a + b, 0);
  process.stdout.write(`  ${total} terminos de Companion + ${curados} curados a mano\n`);
  for (const [cat, n] of Object.entries(dict.meta.counts).sort()) {
    process.stdout.write(`    ${cat.padEnd(14)} ${n}\n`);
  }
  return EXIT.ok;
}

/**
 * Vuelca a data/curated/skills.esES.json los terminos que se han quedado sin traducir.
 * No traduce nada: solo deja la lista de trabajo para rellenar a mano con procedencia.
 */
async function cmdSkillsScaffold(): Promise<number> {
  const cobertura = await readJsonIfExists<{
    sinTraducir: Record<string, { termino: string; veces: number }[]>;
  }>(join(PATHS.reports, 'i18n-coverage.json'));
  if (!cobertura) {
    process.stderr.write('No hay informe de cobertura. Ejecuta antes: normalize\n');
    return EXIT.error;
  }

  const path = join(PATHS.curated, 'skills.esES.json');
  const actual =
    (await readJsonIfExists<{ pendientes?: unknown[]; entradas?: { en: string; category: string }[] }>(path)) ?? {};
  const yaTraducidos = new Set((actual.entradas ?? []).map((e) => `${e.category}:${e.en}`));

  const pendientes: { en: string; category: string; veces: number }[] = [];
  for (const [category, terminos] of Object.entries(cobertura.sinTraducir)) {
    for (const t of terminos) {
      if (yaTraducidos.has(`${category}:${t.termino}`)) continue;
      pendientes.push({ en: t.termino, category, veces: t.veces });
    }
  }
  pendientes.sort((a, b) => b.veces - a.veces || a.en.localeCompare(b.en));

  const salida = { ...actual, pendientes, entradas: actual.entradas ?? [] };
  await writeIfChanged(path, stableStringify(salida));
  process.stdout.write(`  ${pendientes.length} terminos pendientes de traducir en ${path}\n`);
  return EXIT.ok;
}

/**
 * Sonda de reconocimiento del DOM de una pagina de build. Solo se puede ejecutar donde
 * d4builds sea alcanzable y haya navegador (en la practica: GitHub Actions).
 */
async function cmdProbePage(): Promise<number> {
  const { runProbe } = await import('./sources/d4builds/probe-page.js');
  const ids = process.argv.slice(3).filter((a) => !a.startsWith('-'));
  if (ids.length === 0) {
    // Por defecto, una build endgame con equipo completo y otra de subida de nivel.
    const indice = await readJsonIfExists<{ builds: { id: string }[] }>(PATHS.buildIndex);
    const porDefecto = ['ddaaaed4-6f3b-4c97-b65b-55b04aa2ae39'];
    if (!indice) {
      process.stderr.write('No hay indice; usando la build de referencia.\n');
    }
    await runProbe(porDefecto);
    return EXIT.ok;
  }
  await runProbe(ids);
  return EXIT.ok;
}

/**
 * Extrae equipo, arbol, Paragon y mercenarios de las paginas de build. Solo funciona
 * donde d4builds sea alcanzable y haya navegador: en la practica, GitHub Actions.
 */
async function cmdScrapePages(): Promise<number> {
  const { runScrapePages } = await import('./sources/d4builds/scrape-pages.js');
  const args = process.argv.slice(3);
  const forzar = args.includes('--forzar');
  const limiteArg = args.find((a) => a.startsWith('--limite='));
  const limite = limiteArg ? Number(limiteArg.split('=')[1]) : Infinity;
  const explicitos = args.filter((a) => !a.startsWith('-'));

  let ids: string[] = explicitos;
  if (ids.length === 0) {
    const builds = await leerExternalIds();
    ids = builds.slice(0, Number.isFinite(limite) ? limite : undefined);
  }
  if (ids.length === 0) {
    process.stderr.write('No hay builds que procesar (falta data/canonical).\n');
    return EXIT.error;
  }

  process.stdout.write(`Extrayendo ${ids.length} paginas de build...\n`);
  const resumen = await runScrapePages(ids, { forzar });
  process.stdout.write(
    `\n${resumen.total} paginas | equipo: ${resumen.conEquipo} | paragon: ${resumen.conParagon} | ` +
      `arbol: ${resumen.conArbol} | mercenarios: ${resumen.conMercenarios} | fallos: ${resumen.fallos.length}\n`,
  );
  // Los fallos no tumban el workflow: se anotan y se reintentan en la siguiente pasada.
  return EXIT.ok;
}

/** Los uuid de d4builds viven en el `externalId` de cada variante ya normalizada. */
async function leerExternalIds(): Promise<string[]> {
  const { readdir, readFile } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  if (!existsSync(PATHS.canonicalBuilds)) return [];
  const entradas = await readdir(PATHS.canonicalBuilds, { withFileTypes: true, recursive: true });
  const ids = new Set<string>();
  for (const e of entradas) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    const raw = JSON.parse(await readFile(join(e.parentPath ?? e.path, e.name), 'utf8')) as {
      variants?: { source?: { site?: string; externalId?: string } }[];
    };
    for (const v of raw.variants ?? []) {
      if (v.source?.site === 'd4builds' && v.source.externalId) ids.add(v.source.externalId);
    }
  }
  return [...ids].sort();
}

async function cmdScrapeCatalog(): Promise<number> {
  process.stdout.write('Descargando el catalogo de d4builds...\n');
  const informe = await scrapeD4BuildsCatalog({ now: new Date() });
  if (informe.drift.length > 0) {
    process.stderr.write('\nSCHEMA_DRIFT: la forma del JSON de origen ha cambiado\n');
    for (const d of informe.drift) {
      for (const r of d.added.slice(0, 10)) process.stderr.write(`  + ${d.nombre} ${r}\n`);
      for (const r of d.removed.slice(0, 10)) process.stderr.write(`  - ${d.nombre} ${r}\n`);
    }
    return EXIT.guardrail;
  }
  return EXIT.ok;
}

async function cmdNormalize(): Promise<number> {
  process.stdout.write('Normalizando...\n');
  const res = await runNormalize();
  for (const a of res.avisos) process.stdout.write(`  aviso: ${a}\n`);

  if (!res.ok) {
    process.stderr.write('\nGUARDRAIL: no se ha escrito nada.\n');
    for (const f of res.fallos) process.stderr.write(`  - ${f}\n`);
    return EXIT.guardrail;
  }

  process.stdout.write(`  ${res.builds} builds, ${res.ficherosTocados} ficheros tocados\n`);
  if (res.etiquetas.length > 0) process.stdout.write(`  etiquetas: ${res.etiquetas.join(', ')}\n`);

  if (res.cambioDeTemporada) {
    process.stderr.write(
      '\nCAMBIO DE TEMPORADA detectado: el origen ya publica una temporada mayor que la\n' +
        'configurada en data/curated/estado-juego.json. Hay que ejecutar el corte de temporada\n' +
        'antes de publicar, o la web se quedara diciendo cosas de la temporada anterior.\n',
    );
    return EXIT.temporada;
  }
  return EXIT.ok;
}

async function cmdCorrelate(): Promise<number> {
  const res = await runCorrelate();
  process.stdout.write(`Correlacion: ${res.candidatos} candidatos (${res.auto} agrupables solos)\n`);
  return EXIT.ok;
}

async function cmdVerify(): Promise<number> {
  const res = await runVerify();
  for (const a of res.avisos) process.stdout.write(`  ${a}\n`);
  if (!res.ok) {
    process.stderr.write(`\nVERIFICACION FALLIDA (${res.errores.length} errores):\n`);
    for (const e of res.errores.slice(0, 25)) process.stderr.write(`  - ${e}\n`);
    if (res.errores.length > 25) process.stderr.write(`  ... y ${res.errores.length - 25} mas\n`);
    return EXIT.error;
  }
  process.stdout.write(`Verificacion OK: ${res.builds} builds validas\n`);
  return EXIT.ok;
}

const COMANDOS: Record<string, () => Promise<number>> = {
  'i18n:sync': cmdI18nSync,
  'i18n:build': cmdI18nBuild,
  'i18n:skills:scaffold': cmdSkillsScaffold,
  'scrape:catalog': cmdScrapeCatalog,
  'probe:page': cmdProbePage,
  'scrape:pages': cmdScrapePages,
  normalize: cmdNormalize,
  correlate: cmdCorrelate,
  verify: cmdVerify,
};

async function main(): Promise<void> {
  const comando = process.argv[2];
  if (!comando || !(comando in COMANDOS)) {
    process.stderr.write(`Uso: d4es <comando>\n\nComandos:\n  ${Object.keys(COMANDOS).join('\n  ')}\n`);
    process.exit(EXIT.error);
  }
  const codigo = await COMANDOS[comando]!();
  process.exit(codigo);
}

main().catch((err: unknown) => {
  process.stderr.write(`\nERROR: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(EXIT.error);
});
