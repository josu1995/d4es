import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { PATHS } from '../../paths.js';
import { stableStringify } from '../../util/stable-json.js';
import { extraerPlanesDeGuerra, type PlanGuerraRaw } from './warplans.js';

/**
 * Sonda de reconocimiento. NO extrae datos todavia: solo describe el DOM real de una
 * pagina de build para poder escribir los parsers con precision.
 *
 * Existe porque desde la red de trabajo d4builds esta bloqueado y el lector proxy no
 * hidrata la pagina: la unica forma de ver como es por dentro es ejecutar un navegador
 * de verdad en GitHub Actions y traerse de vuelta una descripcion.
 *
 * Deliberadamente NO vuelca el HTML completo de la pagina (es contenido de terceros):
 * saca un mapa de frecuencia de clases CSS y muestras pequenas y acotadas, que es lo
 * justo para programar contra ellas.
 */

const BASE = 'https://d4builds.gg/builds';
const UA = 'd4es-bot/0.1 (+https://github.com/josu1995/d4es; proyecto personal de fans)';

/** Contenedores que nos interesan, con la profundidad de muestra que queremos de cada uno. */
const ZONAS = [
  { nombre: 'navegacion', selector: '[class*="builder__navigation"]', muestra: 3000 },
  { nombre: 'variantes', selector: '[class*="builder__variant"]', muestra: 2000 },
  { nombre: 'equipo', selector: '[class*="builder__gear__item"]', muestra: 4000 },
  { nombre: 'stats', selector: '[class*="builder__stats"]', muestra: 2500 },
  { nombre: 'paragon', selector: '[class*="paragon__board"]', muestra: 2500 },
  { nombre: 'arbol', selector: '[class*="skill"][class*="tree"], [class*="builder__skills"]', muestra: 2500 },
  { nombre: 'mercenario', selector: '[class*="mercenar"]', muestra: 2000 },
  { nombre: 'gemas', selector: '[class*="gem"]', muestra: 1500 },
] as const;

interface ZonaInfo {
  selector: string;
  encontrados: number;
  clasesInternas: Record<string, number>;
  muestraHtml: string | null;
  textos: string[];
}

/**
 * Reconocimiento de la pestana "War Plans". El extractor de verdad vive en
 * `warplans.ts` y se ejecuta aqui tal cual: asi la sonda valida el MISMO codigo que
 * luego correra sobre las 92 paginas, en vez de validar una copia parecida.
 */
/**
 * Reconocimiento de una pestana cualquiera despues de pulsarla. Existe porque dos
 * pestanas se estan publicando a medias y no se sabe por que: mercenarios saca UNA
 * habilidad por build, y el Paragon se queda en cinco tableros cuando el juego permite
 * nueve. La sospecha es que las dos usan el mismo visor de arbol que los planes de
 * guerra, donde el contenido esta en `.viewer-node` y no donde lo busca el parser.
 */
export interface PestanaProbe {
  nombre: string;
  abierta: boolean;
  /** Cuantos nodos de visor hay: si salen, es un arbol y no una lista. */
  nodosVisor: number;
  /** Cuantos encuentra el selector que usa hoy el extractor. */
  segunElParserActual: number;
  /** Cuantos encuentra el selector que parece llevar el contenido de verdad. */
  segunElSelectorReal: number;
  /** Muestras de ESE selector: es con lo que se escribe el parser nuevo. */
  muestrasReales: string[];
  clases: Record<string, number>;
  textos: string[];
  muestras: string[];
}

export interface WarPlansProbe {
  /** false si la pestana no existe o no llego a montarse. */
  abierta: boolean;
  /** true si el visor es un <canvas> de verdad (entonces no habria nada que leer). */
  esCanvasReal: boolean;
  planes: PlanGuerraRaw[];
  /** Tooltip capturado al posar el raton sobre un nodo, si aparece: confirma el nombre. */
  tooltip: string | null;
  /** Censo de respaldo del visor. Solo se rellena si la extraccion sale vacia. */
  censo: { clases: Record<string, number>; muestras: string[] } | null;
}

export interface ProbeResult {
  url: string;
  capturadoEn: string;
  titulo: string;
  /** Todas las clases del documento con su frecuencia: el mapa del terreno. */
  clasesGlobales: Record<string, number>;
  zonas: Record<string, ZonaInfo>;
  /** Texto de los elementos que parecen pestanas de navegacion. */
  pestanas: string[];
  /** Etiquetas de variante (Endgame, Speedfarm...). */
  variantes: string[];
  /** Origenes de imagen agrupados por carpeta del CDN. */
  imagenes: Record<string, string[]>;
  /** Cualquier lista larga de texto: suele ser el equipo o los afijos. */
  bloquesDeTexto: { selector: string; lineas: string[] }[];
  /** Reconocimiento de la pestana de Planes de guerra (hay que pulsarla para verla). */
  warPlans?: WarPlansProbe;
  /** Detalle de las pestanas que hay que pulsar: mercenarios y Paragon. */
  detallePestanas?: PestanaProbe[];
}

/**
 * Pestanas a reconocer, con el selector que usa hoy su extractor y el que parece llevar
 * el contenido de verdad.
 *
 * Lo que se descubrio en la ronda anterior:
 *  - Mercenarios: el extractor de hoy lee `.build__skill__wrapper`, que es la BARRA DE
 *    HABILIDADES DEL JUGADOR, no el mercenario. El mercenario esta en un arbol DOM
 *    (`.skill__tree__item`: 57 nodos, 15 cogidos) con el nombre de la habilidad en la
 *    clase del nodo (`raheirs_aegis`, `iron_wolfs_call`...).
 *  - Paragon: hay 731 casillas (`.paragon__board__tile`) que no se leen, y el nivel de
 *    Paragon anda suelto por ahi.
 */
const PESTANAS_SONDA = [
  {
    nombre: 'Mercenaries',
    selectorActual: '.build__skill__wrapper, .builder__skill__wrapper',
    selectorReal: '.skill__tree__item',
  },
  { nombre: 'Paragon', selectorActual: '.paragon__board', selectorReal: '.paragon__board__tile' },
] as const;

/** Abre una pestana y la describe: que hay, cuanto ve el parser de hoy y que se pierde. */
async function describirPestana(
  page: Page,
  nombre: string,
  selectorActual: string,
  selectorReal: string,
): Promise<PestanaProbe> {
  const boton = page.locator('.builder__navigation__link', { hasText: nombre }).first();
  const vacio: PestanaProbe = {
    nombre,
    abierta: false,
    nodosVisor: 0,
    segunElParserActual: 0,
    segunElSelectorReal: 0,
    muestrasReales: [],
    clases: {},
    textos: [],
    muestras: [],
  };
  if ((await boton.count()) === 0) return vacio;
  await boton.click({ timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(2500);

  return page.evaluate(
    ({ nombre, selectorActual, selectorReal }) => {
      const limpiar = (s: string) => s.replace(/\s+/g, ' ').trim();
      const contenido = document.querySelector('.builder__content') ?? document.body;

      const clases: Record<string, number> = {};
      for (const el of Array.from(contenido.querySelectorAll('*'))) {
        for (const c of Array.from(el.classList)) clases[c] = (clases[c] ?? 0) + 1;
      }

      const textos = new Set<string>();
      for (const el of Array.from(contenido.querySelectorAll('*'))) {
        if (el.children.length > 0) continue;
        const t = limpiar(el.textContent ?? '');
        if (t.length > 0 && t.length < 60) textos.add(t);
      }

      const nodos = Array.from(document.querySelectorAll('.viewer-node'));
      const muestras = [
        ...nodos.slice(0, 2).map((n) => n.outerHTML.slice(0, 900)),
        ...Array.from(document.querySelectorAll(selectorActual))
          .slice(0, 2)
          .map((n) => n.outerHTML.slice(0, 900)),
      ];

      return {
        nombre,
        abierta: true,
        nodosVisor: nodos.length,
        segunElParserActual: document.querySelectorAll(selectorActual).length,
        segunElSelectorReal: document.querySelectorAll(selectorReal).length,
        // Se cogen de sitios distintos de la lista (no los cuatro primeros, que suelen
        // ser todos iguales) para ver tambien un nodo cogido y uno sin coger.
        muestrasReales: (() => {
          const todos = Array.from(document.querySelectorAll(selectorReal));
          const idx = [0, 1, Math.floor(todos.length / 3), Math.floor(todos.length / 2), todos.length - 1];
          const vistos = new Set<number>();
          const salida: string[] = [];
          for (const i of idx) {
            if (i < 0 || i >= todos.length || vistos.has(i)) continue;
            vistos.add(i);
            salida.push(todos[i]!.outerHTML.slice(0, 700));
          }
          return salida;
        })(),
        clases: Object.fromEntries(
          Object.entries(clases)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 45),
        ),
        textos: Array.from(textos).slice(0, 45),
        muestras,
      };
    },
    { nombre, selectorActual, selectorReal },
  );
}

/**
 * Ejecuta el extractor de planes de guerra y le anade lo que solo interesa en sonda:
 * la confirmacion de que el visor no es un canvas, el tooltip de un nodo (que es donde
 * la fuente publica el nombre en limpio) y un censo de respaldo si no sale ningun nodo.
 */
async function describirWarPlans(page: Page): Promise<WarPlansProbe> {
  const planes = await extraerPlanesDeGuerra(page);
  const esCanvasReal = await page.evaluate(() => document.querySelector('.skill-tree-viewer canvas') !== null);

  // El nombre del nodo no esta en el texto del DOM: se confirma con el tooltip.
  let tooltip: string | null = null;
  const nodo = page.locator('.viewer-node').filter({ hasText: /\d+\/\d+/ }).first();
  if ((await nodo.count()) > 0) {
    await nodo.hover({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
    tooltip = await page.evaluate(() => {
      const t = document.querySelector('[class*="tooltip"], [role="tooltip"], [class*="popover"]');
      return t ? t.outerHTML.slice(0, 1800) : null;
    });
  }

  // Solo si el extractor se queda a cero hace falta volver a mirar el terreno.
  const salieronNodos = planes.some((p) => p.nodos.length > 0);
  const censo = salieronNodos
    ? null
    : await page.evaluate(() => {
        const visor = document.querySelector('.skill-tree-viewer, [class*="skill-tree-viewer"]');
        if (!visor) return { clases: {}, muestras: [] };
        const clases: Record<string, number> = {};
        for (const el of Array.from(visor.querySelectorAll('*'))) {
          for (const c of Array.from(el.classList)) clases[c] = (clases[c] ?? 0) + 1;
        }
        const lienzo = visor.querySelector('[class*="viewer-canvas"]');
        return {
          clases: Object.fromEntries(
            Object.entries(clases)
              .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
              .slice(0, 60),
          ),
          muestras: Array.from(lienzo?.children ?? [])
            .filter((h) => h.tagName.toLowerCase() !== 'svg')
            .slice(0, 3)
            .map((h) => h.outerHTML.slice(0, 1800)),
        };
      });

  return { abierta: planes.length > 0, esCanvasReal, planes, tooltip, censo };
}

async function describir(page: Page, url: string): Promise<ProbeResult> {
  return page.evaluate(
    ({ zonas, url }) => {
      const contar = (nodos: Element[]): Record<string, number> => {
        const mapa: Record<string, number> = {};
        for (const n of nodos) {
          for (const c of Array.from(n.classList)) mapa[c] = (mapa[c] ?? 0) + 1;
        }
        return Object.fromEntries(
          Object.entries(mapa)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 120),
        );
      };

      const limpiar = (s: string) => s.replace(/\s+/g, ' ').trim();

      const zonasOut: Record<string, unknown> = {};
      for (const z of zonas) {
        const nodos = Array.from(document.querySelectorAll(z.selector));
        const primero = nodos[0] ?? null;
        zonasOut[z.nombre] = {
          selector: z.selector,
          encontrados: nodos.length,
          clasesInternas: contar(nodos.slice(0, 40).flatMap((n) => Array.from(n.querySelectorAll('*')).slice(0, 60))),
          muestraHtml: primero ? primero.outerHTML.slice(0, z.muestra) : null,
          textos: nodos
            .slice(0, 12)
            .map((n) => limpiar(n.textContent ?? ''))
            .filter((t) => t.length > 0 && t.length < 400),
        };
      }

      // Candidatos a pestana: elementos cortos y clicables en zonas de navegacion.
      const pestanas = Array.from(
        document.querySelectorAll('[class*="navigation"] *, [role="tab"], [class*="tab"]'),
      )
        .map((n) => limpiar(n.textContent ?? ''))
        .filter((t) => t.length > 1 && t.length < 40);

      const variantes = Array.from(document.querySelectorAll('[class*="variant"] input, [class*="variant"]'))
        .map((n) => {
          const el = n as HTMLInputElement;
          return limpiar(el.value || el.textContent || '');
        })
        .filter((t) => t.length > 0 && t.length < 40);

      const imagenes: Record<string, string[]> = {};
      for (const img of Array.from(document.querySelectorAll('img'))) {
        const src = (img as HTMLImageElement).src;
        if (!src || src.startsWith('data:')) continue;
        const m = src.match(/DIABLO4\/([^/]+)\//);
        const carpeta = m?.[1] ?? 'otros';
        if (!imagenes[carpeta]) imagenes[carpeta] = [];
        if (imagenes[carpeta].length < 8) imagenes[carpeta].push(src);
      }

      // Bloques con muchas lineas de texto: candidatos a lista de afijos o de stats.
      const bloquesDeTexto: { selector: string; lineas: string[] }[] = [];
      for (const cand of ['[class*="item"]', '[class*="affix"]', '[class*="dropdown"]', '[class*="stat"]']) {
        const nodos = Array.from(document.querySelectorAll(cand)).slice(0, 6);
        const lineas = nodos.map((n) => limpiar(n.textContent ?? '')).filter((t) => t.length > 2 && t.length < 300);
        if (lineas.length > 0) bloquesDeTexto.push({ selector: cand, lineas });
      }

      return {
        url,
        capturadoEn: new Date().toISOString(),
        titulo: document.title,
        clasesGlobales: contar(Array.from(document.querySelectorAll('*'))),
        zonas: zonasOut as ProbeResult['zonas'],
        pestanas: Array.from(new Set(pestanas)).slice(0, 30),
        variantes: Array.from(new Set(variantes)).slice(0, 20),
        imagenes,
        bloquesDeTexto,
      } as ProbeResult;
    },
    { zonas: ZONAS as unknown as { nombre: string; selector: string; muestra: number }[], url },
  );
}

export async function probeBuildPage(buildId: string, variante = 0): Promise<ProbeResult> {
  const url = `${BASE}/${buildId}/?var=${variante}`;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ userAgent: UA, viewport: { width: 1600, height: 1200 } });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // La pagina se monta por JS: hay que esperar a que aparezca el equipo, no al load.
    await page
      .waitForSelector('[class*="builder__gear__item"]', { timeout: 45_000 })
      .catch(() => process.stderr.write('  aviso: no aparecio builder__gear__item\n'));
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    // Margen para las peticiones de tooltips/iconos que llegan despues.
    await page.waitForTimeout(5000);

    // Primero la pestana inicial (equipo), que es la que esta montada; los planes de
    // guerra van despues porque hay que pulsar y eso ya cambia lo que hay en pantalla.
    const base = await describir(page, url);

    // Mercenarios y Paragon ANTES que los planes: los planes dejan abierta su pestana y
    // cada una monta lo suyo al pulsarla, asi que el orden importa.
    const detallePestanas: PestanaProbe[] = [];
    for (const p of PESTANAS_SONDA) {
      detallePestanas.push(
        await describirPestana(page, p.nombre, p.selectorActual, p.selectorReal).catch(() => ({
          nombre: p.nombre,
          abierta: false,
          nodosVisor: 0,
          segunElParserActual: 0,
          segunElSelectorReal: 0,
          muestrasReales: [],
          clases: {},
          textos: [],
          muestras: [],
        })),
      );
    }

    const warPlans = await describirWarPlans(page).catch(() => undefined);
    return { ...base, detallePestanas, ...(warPlans ? { warPlans } : {}) };
  } finally {
    await browser.close();
  }
}

export async function runProbe(buildIds: string[]): Promise<void> {
  const dir = join(PATHS.reports, 'probe');
  await mkdir(dir, { recursive: true });
  for (const id of buildIds) {
    process.stdout.write(`Sondeando ${id}...\n`);
    const res = await probeBuildPage(id);
    await writeFile(join(dir, `${id}.json`), stableStringify(res), 'utf8');
    process.stdout.write(
      `  pestanas: ${res.pestanas.length} | variantes: ${res.variantes.length} | ` +
        `equipo: ${res.zonas['equipo']?.encontrados ?? 0} nodos | paragon: ${res.zonas['paragon']?.encontrados ?? 0}\n`,
    );
    for (const p of res.detallePestanas ?? []) {
      process.stdout.write(
        `  ${p.nombre}: ${p.abierta ? 'abierta' : 'NO se abrio'} | nodos de visor: ${p.nodosVisor} | ` +
          `lo que ve el parser de hoy: ${p.segunElParserActual} | el selector real: ${p.segunElSelectorReal}
`,
      );
    }
    const wp = res.warPlans;
    if (wp) {
      process.stdout.write(
        `  planes de guerra: ${wp.abierta ? `${wp.planes.length} actividades` : 'no se abrio'}` +
          `${wp.esCanvasReal ? ' (CANVAS: no hay DOM)' : ''} | tooltip: ${wp.tooltip ? 'si' : 'no'}\n`,
      );
      for (const p of wp.planes) {
        const invertidos = p.nodos.filter((n) => n.texto && !n.texto.startsWith('0/')).length;
        process.stdout.write(
          `    - ${p.actividad || '(sin alt)'}: ${p.nodos.length} nodos, ${invertidos} con puntos, restantes=${p.restantes ?? '?'}\n`,
        );
      }
    }
  }
}
