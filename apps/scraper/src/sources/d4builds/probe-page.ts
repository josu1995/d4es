import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { PATHS } from '../../paths.js';
import { stableStringify } from '../../util/stable-json.js';

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
 * Reconocimiento de UNA solapa de la pestana "War Plans". Cada actividad (Susurros,
 * Mazmorras de pesadilla, Mareas infernales, Subciudad, Guaridas de jefe, Hordas
 * infernales, Fosa) tiene su propio arbol dentro del mismo visor.
 */
export interface SolapaPlanProbe {
  /** El alt del icono de la solapa: es el nombre de la actividad. */
  actividad: string;
  icono: string | null;
  activa: boolean;
  /** Puntos que quedan por gastar, tal cual lo publica la cabecera. */
  restantes: string | null;
  /** Censo COMPLETO de clases del visor (sin recortar): aqui salen los nodos. */
  clases: Record<string, number>;
  /** Nombres de atributo distintos vistos en el visor: delata data-*, title, alt. */
  atributos: string[];
  /** Textos cortos distintos: los contadores "1/1" y, con suerte, los nombres. */
  textos: string[];
  /** Origenes de imagen distintos: el nombre del nodo suele ir en el fichero. */
  imagenes: string[];
  /** outerHTML acotado de los primeros hijos del lienzo, para ver la forma real. */
  muestras: string[];
}

export interface WarPlansProbe {
  /** false si la pestana no existe o no llego a montarse. */
  abierta: boolean;
  /** true si el visor es un <canvas> de verdad (entonces no hay nada que leer). */
  esCanvasReal: boolean;
  solapas: SolapaPlanProbe[];
  /** Tooltip capturado al posar el raton sobre un nodo invertido, si aparece. */
  tooltip: string | null;
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
}

/** Selector del visor de arboles, que War Plans comparte con el arbol de habilidades. */
const VISOR = '.skill-tree-viewer, [class*="skill-tree-viewer"]';

/**
 * Describe la solapa de plan de guerra que este activa en ese momento. Se ejecuta
 * dentro de la pagina, y saca lo justo para programar el parser: censo de clases,
 * nombres de atributo, textos e imagenes; nada de volcar el HTML entero (es de
 * terceros), solo muestras acotadas.
 */
async function describirSolapaActiva(page: Page): Promise<Omit<SolapaPlanProbe, 'actividad' | 'icono' | 'activa'>> {
  return page.evaluate((visorSel) => {
    const limpiar = (s: string) => s.replace(/\s+/g, ' ').trim();
    const visor = document.querySelector(visorSel);
    if (!visor) {
      return { restantes: null, clases: {}, atributos: [], textos: [], imagenes: [], muestras: [] };
    }

    const todos = Array.from(visor.querySelectorAll('*'));
    const clases: Record<string, number> = {};
    const atributos = new Set<string>();
    const textos = new Set<string>();
    const imagenes = new Set<string>();

    for (const el of todos) {
      for (const c of Array.from(el.classList)) clases[c] = (clases[c] ?? 0) + 1;
      for (const a of Array.from(el.attributes)) atributos.add(a.name);
      if (el.children.length === 0) {
        const t = limpiar(el.textContent ?? '');
        if (t.length > 0 && t.length < 60) textos.add(t);
      }
      const src = (el as HTMLImageElement).src;
      if (typeof src === 'string' && src.length > 0 && !src.startsWith('data:')) imagenes.add(src);
    }

    // El lienzo lleva dentro el SVG de las lineas y, detras, los nodos. Interesan los nodos.
    const lienzo = visor.querySelector('[class*="viewer-canvas"]');
    const hijos = Array.from(lienzo?.children ?? []).filter((h) => h.tagName.toLowerCase() !== 'svg');
    const muestras = hijos.slice(0, 3).map((h) => h.outerHTML.slice(0, 1800));

    return {
      restantes: limpiar(visor.querySelector('[class*="remaining__total"]')?.textContent ?? '') || null,
      clases: Object.fromEntries(
        Object.entries(clases)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 60),
      ),
      atributos: Array.from(atributos).sort(),
      textos: Array.from(textos).slice(0, 40),
      imagenes: Array.from(imagenes).slice(0, 20),
      muestras,
    };
  }, VISOR);
}

/**
 * Abre "War Plans" y recorre sus siete solapas de actividad, describiendo cada una.
 *
 * Se hace aqui y no en el extractor porque el contenido de la pestana solo se monta al
 * pulsarla, y cada solapa se monta al pulsar SU boton: sin clics no hay DOM que mirar.
 */
async function describirWarPlans(page: Page): Promise<WarPlansProbe> {
  const vacio: WarPlansProbe = { abierta: false, esCanvasReal: false, solapas: [], tooltip: null };

  const boton = page.locator('.builder__navigation__link', { hasText: 'War Plans' }).first();
  if ((await boton.count()) === 0) return vacio;
  await boton.click({ timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const esCanvasReal = await page.evaluate(() => document.querySelector('.skill-tree-viewer canvas') !== null);

  const solapas: SolapaPlanProbe[] = [];
  const tabs = page.locator('.warplan-tab, [class*="warplan-tab"]:not([class*="tabs"])');
  const total = await tabs.count();
  for (let i = 0; i < total; i++) {
    const tab = tabs.nth(i);
    await tab.click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const cabecera = await tab.evaluate((el) => {
      const img = el.querySelector('img') as HTMLImageElement | null;
      return {
        actividad: img?.alt ?? '',
        icono: img?.src ?? null,
        activa: el.className.includes('active'),
      };
    });
    solapas.push({ ...cabecera, ...(await describirSolapaActiva(page)) });
  }

  // Si el nombre del nodo no esta en el DOM, estara en el tooltip al pasar el raton.
  let tooltip: string | null = null;
  const invertido = page.locator('.skill-tree-viewer [class*="viewer-canvas"] *', { hasText: /^\d+\/\d+$/ }).first();
  if ((await invertido.count()) > 0) {
    await invertido.hover({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
    tooltip = await page.evaluate(() => {
      const t = document.querySelector('[class*="tooltip"], [role="tooltip"], [class*="popover"]');
      return t ? t.outerHTML.slice(0, 1800) : null;
    });
  }

  return { abierta: true, esCanvasReal, solapas, tooltip };
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
    const warPlans = await describirWarPlans(page).catch(() => undefined);
    return warPlans ? { ...base, warPlans } : base;
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
    const wp = res.warPlans;
    if (wp) {
      process.stdout.write(
        `  planes de guerra: ${wp.abierta ? `${wp.solapas.length} solapas` : 'no se abrio'}` +
          `${wp.esCanvasReal ? ' (CANVAS: no hay DOM)' : ''} | tooltip: ${wp.tooltip ? 'si' : 'no'}\n`,
      );
      for (const s of wp.solapas) {
        process.stdout.write(`    - ${s.actividad || '(sin alt)'}: restantes=${s.restantes ?? '?'}, ${s.textos.length} textos\n`);
      }
    }
  }
}
