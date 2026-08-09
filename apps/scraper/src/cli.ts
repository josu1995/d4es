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
  join(PATHS.curated, 'gemas.esES.json'),
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
    // La segunda tiene los 7 puntos de plan de guerra gastados (Remaining: 0), que es
    // la unica forma de ver como se marca un nodo invertido frente a uno vacio.
    const porDefecto = ['ddaaaed4-6f3b-4c97-b65b-55b04aa2ae39', '526f92bf-ebc2-40c9-acc8-75f2dfd3e744'];
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
  const minutosArg = args.find((a) => a.startsWith('--minutos='));
  const minutos = minutosArg ? Number(minutosArg.split('=')[1]) : 90;
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

  process.stdout.write(`Extrayendo ${ids.length} paginas de build (presupuesto ${minutos} min)...\n`);
  const resumen = await runScrapePages(ids, { forzar, minutos });
  process.stdout.write(
    `\n${resumen.total} paginas | equipo: ${resumen.conEquipo} | paragon: ${resumen.conParagon} | ` +
      `arbol: ${resumen.conArbol} | mercenarios: ${resumen.conMercenarios} | fallos: ${resumen.fallos.length}` +
      (resumen.pendientes > 0 ? ` | PENDIENTES: ${resumen.pendientes}` : '') +
      '\n',
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

/**
 * Rellena las traducciones de habilidades cruzando los listados de Wowhead en ingles y
 * en castellano por el identificador interno del juego. No traduce nada: copia la
 * traduccion oficial y anota de donde sale.
 */
async function cmdSkillsWowhead(): Promise<number> {
  const { cosecharSkillsEs } = await import('./sources/wowhead/skills-es.js');
  const hoy = new Date().toISOString().slice(0, 10);
  process.stdout.write('Cosechando nombres de habilidad en castellano...\n');
  const res = await cosecharSkillsEs(hoy);
  process.stdout.write(`\n${res.total} traducciones (${res.nuevas} nuevas)\n`);
  if (res.sinPareja.length > 0) {
    process.stdout.write(`${res.sinPareja.length} habilidades sin pareja en castellano (se quedan en ingles)\n`);
  }
  process.stdout.write('Ejecuta ahora: i18n:build && normalize\n');
  return EXIT.ok;
}

/**
 * Rellena las DESCRIPCIONES en castellano de las habilidades ya cosechadas: la ficha ES
 * de Wowhead ya se descargaba entera para las mejoras y la descripcion se tiraba. Solo
 * pide las habilidades con SNO conocido; el resto sigue en ingles con su distintivo.
 */
async function cmdSkillsDesc(): Promise<number> {
  const { cosecharDescripcionesEs } = await import('./sources/wowhead/skill-desc-es.js');
  const arg = process.argv.slice(3).find((a) => a.startsWith('--fichas='));
  const maxFichas = arg ? Number(arg.split('=')[1]) : 200;

  process.stdout.write(`Cosechando descripciones de habilidad en castellano (hasta ${maxFichas} fichas)...\n`);
  const res = await cosecharDescripcionesEs(maxFichas);
  process.stdout.write(`\n${res.fichas} fichas pedidas | ${res.nuevas} descripciones nuevas\n`);
  if (res.descartadas.length > 0) {
    process.stdout.write(`${res.descartadas.length} descartadas (nombre que no casa o ficha sin bloque):\n`);
    for (const d of res.descartadas.slice(0, 10)) process.stdout.write(`  ${d}\n`);
  }
  if (res.fallos.length > 0) {
    process.stdout.write(`${res.fallos.length} fallos de peticion (reanudable, vuelve a ejecutar):\n`);
    for (const f of res.fallos.slice(0, 10)) process.stdout.write(`  ${f}\n`);
  }
  process.stdout.write('Ejecuta ahora: i18n:build && normalize\n');
  return EXIT.ok;
}

/**
 * Rellena las traducciones de las MEJORAS DE RAMA del arbol, que son el mayor agujero de
 * traduccion del proyecto. Como esas mejoras no llevan identificador propio en la pagina,
 * se emparejan por posicion dentro de la misma ficha y se exige que todas las habilidades
 * donde aparece un termino lo traduzcan igual.
 */
async function cmdUpgradesWowhead(): Promise<number> {
  const { cosecharUpgradesEs } = await import('./sources/wowhead/upgrades-es.js');
  const hoy = new Date().toISOString().slice(0, 10);
  const arg = process.argv.slice(3).find((a) => a.startsWith('--fichas='));
  const maxFichas = arg ? Number(arg.split('=')[1]) : 400;

  process.stdout.write(`Cosechando mejoras de rama en castellano (hasta ${maxFichas} fichas)...\n`);
  const res = await cosecharUpgradesEs(hoy, maxFichas);
  process.stdout.write(`\n${res.fichas} fichas pedidas | ${res.total} traducciones (${res.nuevas} nuevas)\n`);
  if (res.descuadradas.length > 0) {
    process.stdout.write(`${res.descuadradas.length} habilidades descartadas por descuadre de listas:\n`);
    for (const d of res.descuadradas.slice(0, 10)) process.stdout.write(`  ${d}\n`);
  }
  if (res.contradictorios.length > 0) {
    process.stdout.write(`${res.contradictorios.length} terminos con traducciones contradictorias (no se publican):\n`);
    for (const c of res.contradictorios.slice(0, 10)) process.stdout.write(`  ${c}\n`);
  }
  process.stdout.write('Ejecuta ahora: i18n:build && normalize\n');
  return EXIT.ok;
}

/**
 * Descarga los iconos que la web referencia y los deja auto-hospedados. Solo funciona
 * donde el CDN sea alcanzable: en la practica, GitHub Actions.
 */
async function cmdIconos(): Promise<number> {
  const { runIconos } = await import('./pipeline/iconos-cmd.js');
  process.stdout.write('Descargando iconos...\n');
  const res = await runIconos();
  process.stdout.write(
    `  ${res.referenciados} referenciados | ya estaban: ${res.yaEstaban} | nuevos: ${res.descargados} ` +
      `(${(res.bytes / 1024 / 1024).toFixed(1)} MB)\n`,
  );
  if (res.fallidos.length > 0) {
    process.stdout.write(`  ${res.fallidos.length} sin descargar (ver data/reports/iconos.json):\n`);
    for (const f of res.fallidos.slice(0, 8)) process.stdout.write(`    ${f.ruta}: ${f.motivo}\n`);
  }
  if (res.huerfanosBorrados.length > 0) {
    process.stdout.write(`  ${res.huerfanosBorrados.length} iconos huerfanos barridos
`);
  }
  if (res.parado) {
    process.stderr.write('  PARADO: se alcanzo el tope de tamano de una pasada. Revisa antes de seguir.\n');
    return EXIT.guardrail;
  }
  return EXIT.ok;
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
  'i18n:skills:wowhead': cmdSkillsWowhead,
  'i18n:skills:desc': cmdSkillsDesc,
  'i18n:upgrades:wowhead': cmdUpgradesWowhead,
  'iconos:descargar': cmdIconos,
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
