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

    return await describir(page, url);
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
  }
}
