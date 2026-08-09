import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { PATHS } from '../../paths.js';
import { stableStringify } from '../../util/stable-json.js';

/**
 * Extractor de la pagina de cada build. Es la unica via para el equipo y el Paragon:
 * no estan en ningun JSON publico, solo en el DOM que monta el JavaScript de la pagina.
 *
 * Estructura real verificada con la sonda (data/reports/probe):
 *   .builder__navigation__link > span      pestanas: Gear & Skills, Skill Tree, Paragon,
 *                                          Mercenaries, War Plans, Notes
 *   .builder__gear__item                   una por ranura
 *     .builder__gear__icon img             icono + alt con el nombre
 *     .builder__gear__name(--unique|--mythic)
 *     .builder__gear__slot                 nombre de ranura en ingles
 *     .builder__gems__item img             engarces (runas/gemas), alt = nombre
 *   .builder__stats__slot                  afijos por ranura
 *     .dropdown__button__wrapper           cada afijo
 *     .dropdown__button__tempering         marca de templado
 *     .greater__affix__button--filled      estrella de afijo superior
 *
 * Las pestanas distintas de la primera se montan AL PULSARLAS, de ahi los clics.
 *
 * La pestana "Notes" NO se extrae a proposito: es el texto de la guia escrito por su
 * autor. Copiarlo seria apropiarse de su trabajo; enlazamos al original y punto.
 */

const BASE = 'https://d4builds.gg/builds';
const UA = 'd4es-bot/0.1 (+https://github.com/josu1995/d4es; proyecto personal de fans)';

/** Pausa entre paginas. No hay prisa, pero tampoco hace falta ser lentos. */
const PAUSA_MS = 1200;
/** Espera tras pulsar una pestana, que se monta por JS. */
const ESPERA_PESTANA_MS = 1800;

export interface Engarce {
  nombre: string;
  tipo: string;
  icono: string | null;
}

export interface GearItemRaw {
  slot: string;
  nombre: string | null;
  /** Modificador que publica la fuente: unique, mythic, o vacio (legendario/aspecto). */
  calidad: string | null;
  icono: string | null;
  engarces: Engarce[];
}

export interface AfijoRaw {
  texto: string;
  templado: boolean;
  /** Estrellas de afijo superior rellenas en ese afijo. */
  ga: number;
}

export interface StatsSlotRaw {
  slot: string;
  afijos: AfijoRaw[];
}

export interface DebugZona {
  clases: Record<string, number>;
  muestra: string | null;
  textos: string[];
}

export interface VarianteRaw {
  index: number;
  etiqueta: string | null;
  gear: GearItemRaw[];
  stats: StatsSlotRaw[];
  /** Siempre vacio: el arbol se dibuja en canvas y no hay DOM que leer. */
  arbol: { categoria: string; nodos: { nombre: string; puntos: number | null }[] }[];
  /** Confirmacion de que sigue siendo canvas, por si algun dia deja de serlo. */
  arbolEsCanvas?: boolean;
  paragon: { tablero: string; glifo: string | null; nivelGlifo: number | null; icono: string | null }[];
  mercenarios: { nombre: string; rol: string | null; habilidades: string[]; icono: string | null }[];
  warPlans: { nombre: string; detalle: string | null }[];
  /** Descripcion cruda de las pestanas cuyo parser aun no esta afinado. */
  debug: Record<string, DebugZona>;
}

export interface PaginaRaw {
  buildId: string;
  url: string;
  capturadoEn: string;
  pestanas: string[];
  variantes: { index: number; etiqueta: string }[];
  porVariante: VarianteRaw[];
}

/** Descripcion generica de una zona: sirve para afinar parsers sin otro viaje a CI. */
async function describirZona(page: Page, selector: string): Promise<DebugZona> {
  return page.evaluate((sel) => {
    const limpiar = (s: string) => s.replace(/\s+/g, ' ').trim();
    const nodos = Array.from(document.querySelectorAll(sel));
    const clases: Record<string, number> = {};
    for (const n of nodos.slice(0, 60)) {
      for (const d of Array.from(n.querySelectorAll('*')).slice(0, 80)) {
        for (const c of Array.from(d.classList)) clases[c] = (clases[c] ?? 0) + 1;
      }
    }
    return {
      clases: Object.fromEntries(Object.entries(clases).sort((a, b) => b[1] - a[1]).slice(0, 40)),
      muestra: nodos[0] ? nodos[0].outerHTML.slice(0, 2500) : null,
      textos: nodos.slice(0, 8).map((n) => limpiar(n.textContent ?? '')).filter((t) => t.length > 0 && t.length < 300),
    };
  }, selector);
}

/** Pulsa una pestana por el texto de su <span> y espera a que monte su contenido. */
async function abrirPestana(page: Page, nombre: string): Promise<boolean> {
  const boton = page.locator('.builder__navigation__link', { hasText: nombre }).first();
  if ((await boton.count()) === 0) return false;
  await boton.click({ timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(ESPERA_PESTANA_MS);
  return true;
}

async function extraerGear(page: Page): Promise<GearItemRaw[]> {
  return page.evaluate(() => {
    const limpiar = (s: string) => s.replace(/\s+/g, ' ').trim();
    return Array.from(document.querySelectorAll('.builder__gear__item')).map((item) => {
      const nombreEl = item.querySelector('.builder__gear__name');
      const clases = Array.from(nombreEl?.classList ?? []);
      // La calidad viaja como modificador BEM: builder__gear__name--unique / --mythic
      const calidad =
        clases.map((c) => c.split('--')[1]).find((m): m is string => typeof m === 'string' && m.length > 0) ?? null;
      const img = item.querySelector('.builder__gear__icon img') as HTMLImageElement | null;
      const engarces = Array.from(item.querySelectorAll('.builder__gems__item img')).map((g) => {
        const gi = g as HTMLImageElement;
        // El tipo va en el nombre del fichero: .../Runes/ritual.png, .../Gems/ruby.png
        const m = gi.src.match(/\/([^/]+)\/([^/]+)\.png$/);
        return { nombre: limpiar(gi.alt), tipo: m?.[2] ?? m?.[1] ?? 'desconocido', icono: gi.src || null };
      });
      return {
        slot: limpiar(item.querySelector('.builder__gear__slot')?.textContent ?? ''),
        nombre: nombreEl ? limpiar(nombreEl.textContent ?? '') || null : null,
        calidad,
        icono: img?.src ?? null,
        engarces,
      };
    });
  });
}

/**
 * Estructura real (verificada con la sonda):
 *   .builder__stats__group           un bloque por ranura
 *     .builder__stats__slot          nombre de la ranura
 *     .builder__stats__priority
 *       .builder__stat               un afijo
 *         .greater__affix__button--filled   estrella de afijo superior
 *         .dropdown__button__wrapper        el texto del afijo
 */
async function extraerStats(page: Page): Promise<StatsSlotRaw[]> {
  return page.evaluate(() => {
    const limpiar = (s: string) => s.replace(/\s+/g, ' ').trim();
    return Array.from(document.querySelectorAll('.builder__stats__group')).map((grupo) => {
      const nombreSlot = limpiar(grupo.querySelector('.builder__stats__slot')?.textContent ?? '');

      const afijos = Array.from(grupo.querySelectorAll('.builder__stat')).map((stat) => ({
        texto: limpiar(stat.querySelector('.dropdown__button__wrapper')?.textContent ?? ''),
        // El templado se marca con una clase que contiene "tempering" en algun punto.
        templado: stat.querySelector('[class*="tempering"]') !== null,
        ga: stat.querySelectorAll('.greater__affix__button--filled').length,
      }));

      return { slot: nombreSlot, afijos: afijos.filter((a) => a.texto.length > 0) };
    });
  });
}

/**
 * El nombre del tablero viene todo pegado: numero de orden, nombre y las estadisticas
 * que aporta ("2Carnage Str 110*Dex 59..."), con el glifo entre parentesis en un hijo.
 * Hay que despiezarlo, y por eso este parser tiene mas cocina que los demas.
 */
async function extraerParagon(page: Page): Promise<VarianteRaw['paragon']> {
  return page.evaluate(() => {
    const limpiar = (s: string) => s.replace(/\s+/g, ' ').trim();
    return Array.from(document.querySelectorAll('.paragon__board')).map((b) => {
      const nombreEl = b.querySelector('.paragon__board__name');
      const glifoEl = b.querySelector('.paragon__board__name__glyph');
      const textoGlifo = limpiar(glifoEl?.textContent ?? '');

      let tablero = limpiar((nombreEl?.textContent ?? '').replace(textoGlifo, ''));
      // Fuera el numero de orden inicial.
      tablero = tablero.replace(/^\d+\s*/, '');
      // Fuera el bloque de estadisticas, que empieza en la primera abreviatura.
      tablero = tablero.split(/\s+(?:Str|Dex|Int|Will|Fue|Des|Int|Vol)\s+\d/)[0] ?? tablero;
      tablero = limpiar(tablero);

      // El glifo llega entre parentesis; el nivel no siempre se publica.
      const nivel = textoGlifo.match(/\b(\d+)\b/);
      const glifo = limpiar(textoGlifo.replace(/[()]/g, '').replace(/\b\d+\b/g, ''));

      return {
        tablero,
        glifo: glifo.length > 0 ? glifo : null,
        nivelGlifo: nivel ? Number(nivel[1]) : null,
        icono: null,
      };
    });
  });
}

/**
 * El arbol de habilidades se dibuja en un CANVAS (`skill-tree-viewer` / `viewer-canvas`),
 * no en el DOM: no hay nada que leer y no lo va a haber. Se deja constancia aqui para que
 * nadie vuelva a intentarlo. La informacion util (que habilidad, con cuantos puntos y con
 * que mejoras) ya viene del catalogo publico, que es mas fiable.
 */
async function extraerArbolImposible(page: Page): Promise<boolean> {
  return page.evaluate(() => document.querySelector('.skill-tree-viewer, .viewer-canvas') !== null);
}

/**
 * Los mercenarios tambien usan un visor de arbol, pero el contratado y su refuerzo si
 * estan en el DOM como iconos (`.build__skill__wrapper`), con el nombre en el alt.
 */
async function extraerMercenarios(page: Page): Promise<VarianteRaw['mercenarios']> {
  return page.evaluate(() => {
    const limpiar = (s: string) => s.replace(/\s+/g, ' ').trim();
    const ROLES = ['Mercenary', 'Reinforcement'];
    return Array.from(document.querySelectorAll('.build__skill__wrapper, .builder__skill__wrapper'))
      .slice(0, 2)
      .map((w, i) => {
        const img = w.querySelector('img') as HTMLImageElement | null;
        // El nombre util esta en el alt del icono; el src da el identificador interno.
        const nombre = limpiar(img?.alt ?? '');
        return {
          nombre,
          rol: ROLES[i] ?? null,
          habilidades: [],
          icono: img?.src ?? null,
        };
      })
      .filter((m) => m.nombre.length > 0);
  });
}

async function extraerWarPlans(page: Page): Promise<VarianteRaw['warPlans']> {
  return page.evaluate(() => {
    const limpiar = (s: string) => s.replace(/\s+/g, ' ').trim();
    return Array.from(document.querySelectorAll('[class*="warplan"], [class*="war__plan"]'))
      .map((w) => ({
        nombre: limpiar(w.querySelector('[class*="name"], [class*="title"]')?.textContent ?? ''),
        detalle: limpiar(w.textContent ?? '').slice(0, 200) || null,
      }))
      .filter((w) => w.nombre.length > 0);
  });
}

async function extraerVariante(page: Page, index: number, etiqueta: string | null): Promise<VarianteRaw> {
  const debug: Record<string, DebugZona> = {};

  // La primera pestana ya viene montada.
  const gear = await extraerGear(page);
  const stats = await extraerStats(page);
  if (stats.every((s) => s.afijos.length === 0)) {
    debug['stats'] = await describirZona(page, '.builder__stats__group');
  }

  // El arbol es canvas: no se intenta extraer, solo se comprueba que sigue siendolo por
  // si algun dia lo cambian a DOM y merece la pena volver.
  await abrirPestana(page, 'Skill Tree');
  const arbolEsCanvas = await extraerArbolImposible(page);

  await abrirPestana(page, 'Paragon');
  const paragon = await extraerParagon(page);
  if (paragon.length === 0) debug['paragon'] = await describirZona(page, '.paragon__board');

  await abrirPestana(page, 'Mercenaries');
  const mercenarios = await extraerMercenarios(page);
  if (mercenarios.length === 0) debug['mercenarios'] = await describirZona(page, '.builder__content > *');

  await abrirPestana(page, 'War Plans');
  const warPlans = await extraerWarPlans(page);
  if (warPlans.length === 0) debug['warplans'] = await describirZona(page, '.builder__content > *');

  return { index, etiqueta, gear, stats, arbol: [], arbolEsCanvas, paragon, mercenarios, warPlans, debug };
}

async function abrirPagina(browser: Browser, url: string): Promise<Page> {
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1600, height: 1400 } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.builder__gear__item', { timeout: 45_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  return page;
}

export async function scrapeBuildPage(browser: Browser, buildId: string, maxVariantes = 6): Promise<PaginaRaw> {
  const url = `${BASE}/${buildId}/?var=0`;
  const page = await abrirPagina(browser, url);

  const pestanas = await page.$$eval('.builder__navigation__link span', (ns) =>
    ns.map((n) => (n.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean),
  );

  const etiquetas = await page.$$eval('[class*="builder__variant"] input', (inputs) =>
    inputs.map((i) => (i as HTMLInputElement).value.trim()).filter(Boolean),
  );
  const variantes = (etiquetas.length > 0 ? etiquetas : ['Standard Build'])
    .slice(0, maxVariantes)
    .map((etiqueta, index) => ({ index, etiqueta }));

  const porVariante: VarianteRaw[] = [];
  porVariante.push(await extraerVariante(page, 0, variantes[0]?.etiqueta ?? null));
  await page.context().close();

  // Cada variante es una carga de pagina distinta (?var=N).
  for (const v of variantes.slice(1)) {
    await new Promise((r) => setTimeout(r, PAUSA_MS));
    const p = await abrirPagina(browser, `${BASE}/${buildId}/?var=${v.index}`);
    porVariante.push(await extraerVariante(p, v.index, v.etiqueta));
    await p.context().close();
  }

  return {
    buildId,
    url,
    capturadoEn: new Date().toISOString(),
    pestanas,
    variantes,
    porVariante,
  };
}

export interface ResumenScrape {
  total: number;
  conEquipo: number;
  conParagon: number;
  conArbol: number;
  conMercenarios: number;
  pendientes: number;
  agotadoElTiempo: boolean;
  fallos: { buildId: string; error: string }[];
}

export async function runScrapePages(
  buildIds: string[],
  opciones: { forzar: boolean; minutos: number },
): Promise<ResumenScrape> {
  const dir = join(PATHS.raw, 'd4builds', 'pages');
  await mkdir(dir, { recursive: true });

  const resumen: ResumenScrape = {
    total: 0,
    conEquipo: 0,
    conParagon: 0,
    conArbol: 0,
    conMercenarios: 0,
    pendientes: 0,
    agotadoElTiempo: false,
    fallos: [],
  };

  // Presupuesto de tiempo: al agotarse se sale limpiamente para que el workflow llegue
  // a publicar lo extraido. El checkpoint hace que la siguiente pasada continue donde
  // esta se quedo, en vez de empezar de cero.
  const limite = Date.now() + opciones.minutos * 60_000;

  const browser = await chromium.launch();
  try {
    for (const buildId of buildIds) {
      if (Date.now() > limite) {
        resumen.agotadoElTiempo = true;
        resumen.pendientes = buildIds.length - resumen.total;
        process.stdout.write(`\nPresupuesto de ${opciones.minutos} min agotado; quedan ${resumen.pendientes}.\n`);
        break;
      }
      const destino = join(dir, `${buildId}.json`);
      // Checkpoint: si ya esta, no se vuelve a pedir. Asi el workflow puede ir por
      // lotes sin repetir trabajo ni castigar al origen.
      if (!opciones.forzar && existsSync(destino)) {
        const previo = JSON.parse(await readFile(destino, 'utf8')) as PaginaRaw;
        resumen.total++;
        if (previo.porVariante[0]?.gear.length) resumen.conEquipo++;
        if (previo.porVariante[0]?.paragon.length) resumen.conParagon++;
        if (previo.porVariante[0]?.arbol.length) resumen.conArbol++;
        if (previo.porVariante[0]?.mercenarios.length) resumen.conMercenarios++;
        continue;
      }

      try {
        const pagina = await scrapeBuildPage(browser, buildId);
        await writeFile(destino, stableStringify(pagina), 'utf8');
        resumen.total++;
        const v = pagina.porVariante[0];
        if (v?.gear.length) resumen.conEquipo++;
        if (v?.paragon.length) resumen.conParagon++;
        if (v?.arbol.length) resumen.conArbol++;
        if (v?.mercenarios.length) resumen.conMercenarios++;
        process.stdout.write(
          `  ${buildId}: ${v?.gear.length ?? 0} piezas, ${v?.stats.length ?? 0} ranuras con afijos, ` +
            `${v?.paragon.length ?? 0} tableros, ${pagina.variantes.length} variantes\n`,
        );
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        resumen.fallos.push({ buildId, error });
        process.stderr.write(`  ${buildId}: FALLO — ${error}\n`);
      }
      await new Promise((r) => setTimeout(r, PAUSA_MS));
    }
  } finally {
    await browser.close();
  }

  await mkdir(PATHS.reports, { recursive: true });
  await writeFile(join(PATHS.reports, 'scrape-pages.json'), stableStringify(resumen), 'utf8');
  return resumen;
}
