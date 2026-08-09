import type { Page } from 'playwright';

/**
 * Extractor de la pestana "War Plans" (Planes de guerra).
 *
 * Estructura real, verificada con la sonda (data/reports/probe):
 *
 *   .builder__navigation__link "War Plans"   hay que pulsarla: se monta al pulsar
 *   .warplan-tabs > .warplan-tab             SIETE solapas, una por actividad. El alt de
 *                                            su <img> es el nombre (Whispers, Nightmare
 *                                            Dungeons, Helltides, Undercity, Boss Lairs,
 *                                            Infernal Hordes, Pits) y el fichero, el slug.
 *   .skill__tree__remaining__total           puntos que quedan por gastar en esa solapa
 *   .viewer-canvas                           el lienzo; dentro, un <svg> con las lineas
 *   .viewer-node                             CADA NODO, posicionado con left/top
 *     img .../Skills/VoH2/<slug>.png         el icono, cuyo FICHERO es el nombre del nodo
 *     img .../SkillTree/skill_minor_*.png    fondo, que delata el estado
 *     texto "1/1" / "0/1"                    puntos invertidos en el nodo
 *
 * Dos avisos importantes:
 *
 * 1. NO es un canvas. El arbol de habilidades si lo es, y por eso se reconstruye a mano;
 *    este visor comparte nombre de clases con aquel pero pinta nodos como DOM de verdad.
 *    Comprobado con `document.querySelector('.skill-tree-viewer canvas') === null`.
 *
 * 2. El nombre del nodo NO esta en el texto del DOM: solo en el fichero del icono y en el
 *    tooltip (que exige posar el raton nodo a nodo, 100 veces por pagina). Se saca del
 *    fichero, y el nombre y la descripcion en limpio salen del catalogo publico, que ya
 *    trae los 100 nodos como entradas sin clase dentro de `skills`.
 *
 * Por eso aqui se registra lo que la fuente publica TAL CUAL (clases sin interpretar,
 * ficheros de icono, contadores y posiciones) y la interpretacion vive en la
 * normalizacion: si algun dia entendemos mejor la semantica, se corrige sin volver a
 * pedir las 92 paginas.
 */

export interface NodoPlanRaw {
  /** Clases tal cual: allocated, available, locked, --noPoints, large-circle, diamond... */
  clases: string[];
  /** Fichero de cada icono del nodo, sin extension. El del nodo trae su nombre. */
  iconos: string[];
  /** Contador que pinta el nodo: "1/1", "0/1". Null si no pinta ninguno. */
  texto: string | null;
  /** Posicion en el lienzo, para poder reconstruir el orden del arbol. */
  x: number | null;
  y: number | null;
}

/** Una arista del arbol: la fuente la pinta como un <path d="M x1 y1 L x2 y2">. */
export interface AristaPlanRaw {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PlanGuerraRaw {
  /** Nombre de la actividad en ingles, del alt del icono de la solapa. */
  actividad: string;
  /** Slug estable, del fichero del icono: whispers, nightmare_dungeons, pits... */
  slug: string;
  icono: string | null;
  /** Puntos sin gastar que publica la cabecera de esa solapa. */
  restantes: number | null;
  nodos: NodoPlanRaw[];
  /** Aristas entre nodos, en las mismas coordenadas que `x`/`y` de los nodos. */
  lineas: AristaPlanRaw[];
}

/** Espera tras pulsar una solapa: el arbol se vuelve a montar entero. */
const ESPERA_SOLAPA_MS = 1000;

/** Lee los nodos y las aristas de la solapa que este activa en ese momento. */
async function leerSolapaActiva(
  page: Page,
): Promise<{ restantes: number | null; nodos: NodoPlanRaw[]; lineas: AristaPlanRaw[] }> {
  return page.evaluate(() => {
    const limpiar = (s: string) => s.replace(/\s+/g, ' ').trim();
    const fichero = (src: string) => {
      const m = src.match(/\/([^/]+)\.(?:png|webp|jpg|svg)(?:\?.*)?$/i);
      return m?.[1] ? decodeURIComponent(m[1]) : null;
    };
    const px = (v: string) => {
      const n = Number.parseFloat(v);
      return Number.isFinite(n) ? Math.round(n) : null;
    };

    const restantesTexto = limpiar(document.querySelector('[class*="remaining__total"]')?.textContent ?? '');
    const restantes = /^\d+$/.test(restantesTexto) ? Number(restantesTexto) : null;

    const nodos = Array.from(document.querySelectorAll('.viewer-node')).map((n) => {
      const el = n as HTMLElement;
      const iconos: string[] = [];
      for (const img of Array.from(el.querySelectorAll('img'))) {
        const f = fichero((img as HTMLImageElement).src);
        if (f) iconos.push(f);
      }
      const texto = limpiar(el.textContent ?? '');
      return {
        clases: Array.from(el.classList).filter((c) => c !== 'viewer-node'),
        iconos,
        texto: texto.length > 0 && texto.length < 20 ? texto : null,
        x: px(el.style.left),
        y: px(el.style.top),
      };
    });

    // Las aristas van en un <svg class="viewer-lines"> con dos trazos por linea (base y
    // relleno), en las MISMAS coordenadas que el left/top de los nodos. Se deduplican.
    const vistas = new Set<string>();
    const lineas: AristaPlanRaw[] = [];
    for (const p of Array.from(document.querySelectorAll('.viewer-lines path'))) {
      const d = p.getAttribute('d') ?? '';
      const m = d.match(/^\s*M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*L\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*$/);
      if (!m) continue;
      const [x1, y1, x2, y2] = [Math.round(+m[1]!), Math.round(+m[2]!), Math.round(+m[3]!), Math.round(+m[4]!)];
      const clave = `${x1},${y1},${x2},${y2}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      lineas.push({ x1, y1, x2, y2 });
    }

    return { restantes, nodos, lineas };
  });
}

/**
 * Abre la pestana de planes de guerra y recorre sus siete solapas. Devuelve [] si la
 * pestana no existe (una build vieja, o un rediseno de la fuente): eso lo distingue el
 * llamante, que deja constancia en el informe en vez de tragarselo en silencio.
 */
export async function extraerPlanesDeGuerra(page: Page): Promise<PlanGuerraRaw[]> {
  const nav = page.locator('.builder__navigation__link', { hasText: 'War Plans' }).first();
  if ((await nav.count()) === 0) return [];
  await nav.click({ timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // Hijos directos: asi se cogen los <button> y no sus <img>, que comparten prefijo.
  const solapas = page.locator('.warplan-tabs > .warplan-tab');
  const total = await solapas.count();

  const planes: PlanGuerraRaw[] = [];
  for (let i = 0; i < total; i++) {
    const solapa = solapas.nth(i);
    await solapa.click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(ESPERA_SOLAPA_MS);

    const cabecera = await solapa.evaluate((el) => {
      const img = el.querySelector('img') as HTMLImageElement | null;
      const src = img?.src ?? '';
      const m = src.match(/\/([^/]+)\.png(?:\?.*)?$/i);
      return { actividad: img?.alt ?? '', slug: m?.[1] ?? '', icono: src || null };
    });

    const { restantes, nodos, lineas } = await leerSolapaActiva(page);
    planes.push({ ...cabecera, restantes, nodos, lineas });
  }

  return planes;
}
