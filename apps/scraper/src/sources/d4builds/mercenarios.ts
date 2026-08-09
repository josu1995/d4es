import type { Page } from 'playwright';

/**
 * Extractor de la pestana de mercenarios.
 *
 * El extractor anterior leia `.build__skill__wrapper`, que NO es el mercenario: es la
 * barra de habilidades del JUGADOR, que sigue visible con cualquier pestana abierta. Por
 * eso cada build publicaba una sola "habilidad de mercenario", y encima a veces era una
 * habilidad de la clase. El dato bueno estaba al lado, sin leer.
 *
 * La forma real, verificada con la sonda:
 *
 *   .skill__tree__item                     un nodo del arbol del mercenario (57 en la
 *                                          build de referencia, 15 cogidos)
 *     class="... raheirs_aegis"            el slug del nodo, entre las clases
 *     class="... skill__tree__item--active" cogido por la build
 *     img.skill__tree__item__icon[alt]     el NOMBRE en limpio ("Raheir's Aegis")
 *     .skill__tree__item__count            "1/1" o "0/1": puntos invertidos y maximo
 *     style="top: 470px; left: 1130px"     posicion en el arbol
 *   .skill__tree__category                 las categorias en las que se agrupan
 *
 * Igual que en los planes de guerra, aqui se registra lo que publica la fuente SIN
 * interpretarlo: quien es el mercenario se deduce despues, en la normalizacion, cruzando
 * las habilidades con el dataset del catalogo.
 */

export interface NodoMercenarioRaw {
  /** Nombre en limpio, del alt del icono. */
  nombre: string;
  /** Fichero del icono, que es el identificador estable. */
  slug: string | null;
  /** Clases tal cual, sin interpretar. */
  clases: string[];
  /** Puntos invertidos y maximo, del contador "1/1". */
  puntos: number | null;
  maximo: number | null;
  x: number | null;
  y: number | null;
}

export interface MercenariosRaw {
  /** Etiquetas que publica la pestana: Mercenary, Reinforcement, Skill, Opportunity... */
  etiquetas: string[];
  nodos: NodoMercenarioRaw[];
}

export async function extraerMercenarios(page: Page): Promise<MercenariosRaw> {
  const nav = page.locator('.builder__navigation__link', { hasText: 'Mercenaries' }).first();
  if ((await nav.count()) === 0) return { etiquetas: [], nodos: [] };
  await nav.click({ timeout: 15_000 }).catch(() => {});
  // El arbol se monta al pulsar; se espera a que aparezca en vez de a ojo.
  await page.waitForSelector('.skill__tree__item', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(800);

  return page.evaluate(() => {
    const limpiar = (s: string) => s.replace(/\s+/g, ' ').trim();
    const px = (v: string) => {
      const n = Number.parseFloat(v);
      return Number.isFinite(n) ? Math.round(n) : null;
    };
    const fichero = (src: string) => {
      const m = src.match(/\/([^/]+)\.(?:png|webp|jpg)(?:\?.*)?$/i);
      return m?.[1] ? decodeURIComponent(m[1]) : null;
    };

    const nodos = Array.from(document.querySelectorAll('.skill__tree__item')).map((n) => {
      const el = n as HTMLElement;
      const img = el.querySelector('img') as HTMLImageElement | null;
      const contador = limpiar(el.querySelector('.skill__tree__item__count')?.textContent ?? '');
      const m = contador.match(/^(\d+)\s*\/\s*(\d+)$/);
      return {
        nombre: limpiar(img?.alt ?? ''),
        slug: img ? fichero(img.src) : null,
        clases: Array.from(el.classList).filter((c) => c !== 'skill__tree__item'),
        puntos: m ? Number(m[1]) : null,
        maximo: m ? Number(m[2]) : null,
        x: px(el.style.left),
        y: px(el.style.top),
      };
    });

    const etiquetas = Array.from(document.querySelectorAll('.skill__tree__category'))
      .map((c) => limpiar(c.textContent ?? ''))
      .filter((t) => t.length > 0 && t.length < 40);

    return { etiquetas, nodos: nodos.filter((n) => n.nombre.length > 0) };
  });
}
