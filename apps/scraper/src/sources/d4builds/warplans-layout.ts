import {
  WarPlansDataset,
  type WarPlanActivityLayout,
  type WarPlanEdgeLayout,
  type WarPlanNodeLayout,
} from '@d4es/schema';
import type { PaginaRaw } from './scrape-pages.js';
import { slugDeNodo, nombreDesdeSlug } from './normalize-pages.js';

/**
 * Construye el catalogo con la FORMA de los arboles de planes de guerra a partir de las
 * paginas ya extraidas.
 *
 * Por que existe: la forma no depende de la build. Se comprobo nodo a nodo entre builds
 * distintas y coinciden los slugs, las coordenadas y las figuras en las siete
 * actividades. Guardarla dentro de cada build seria repetir ~100 nodos 92 veces para
 * nada; guardarla una vez deja la ficha capaz de pintar el arbol entero con los nodos de
 * la build encendidos y los demas apagados, igual que se hace con el arbol de
 * habilidades.
 *
 * Si dos paginas discrepan en donde va un nodo, NO se elige a dedo: se queda la primera
 * lectura y la discrepancia sale como aviso, porque significaria que la fuente ha
 * cambiado el arbol y hay que mirarlo.
 */

/** Margen alrededor del dibujo, en las coordenadas de la fuente. */
const MARGEN = 60;

interface Acumulado {
  slug: string;
  name: string;
  nodes: Map<string, WarPlanNodeLayout>;
  edges: Map<string, WarPlanEdgeLayout>;
  center: { x: number; y: number } | null;
}

export interface LayoutResultado {
  dataset: WarPlansDataset;
  avisos: string[];
}

export function construirLayoutPlanes(
  paginas: readonly PaginaRaw[],
  nombreDeNodo: (slug: string) => string | null,
  generatedAt: string,
): LayoutResultado {
  const avisos: string[] = [];
  const porActividad = new Map<string, Acumulado>();

  for (const pagina of paginas) {
    for (const variante of pagina.porVariante) {
      for (const plan of variante.warPlans) {
        if (!plan.slug) continue;
        let acc = porActividad.get(plan.slug);
        if (!acc) {
          acc = {
            slug: plan.slug,
            name: plan.actividad.trim() || nombreDesdeSlug(plan.slug),
            nodes: new Map(),
            edges: new Map(),
            center: null,
          };
          porActividad.set(plan.slug, acc);
        }

        for (const nodo of plan.nodos) {
          if (nodo.x === null || nodo.y === null) continue;
          // El nodo de categoria es el icono de la actividad, no un nodo invertible.
          if (nodo.clases.includes('category')) {
            acc.center ??= { x: nodo.x, y: nodo.y };
            continue;
          }
          const slug = slugDeNodo(nodo.iconos);
          if (!slug) continue;

          const previo = acc.nodes.get(slug);
          if (previo) {
            if (previo.x !== nodo.x || previo.y !== nodo.y) {
              avisos.push(
                `plan "${plan.slug}": el nodo "${slug}" aparece en (${previo.x},${previo.y}) y en ` +
                  `(${nodo.x},${nodo.y}) segun la build — se conserva la primera lectura`,
              );
            }
            continue;
          }
          acc.nodes.set(slug, {
            slug,
            name: nombreDeNodo(slug) ?? nombreDesdeSlug(slug),
            x: nodo.x,
            y: nodo.y,
            minor: nodo.clases.includes('diamond'),
          });
        }

        for (const l of plan.lineas ?? []) {
          acc.edges.set(`${l.x1},${l.y1},${l.x2},${l.y2}`, l);
        }
      }
    }
  }

  const activities: WarPlanActivityLayout[] = [];
  for (const acc of porActividad.values()) {
    const nodes = [...acc.nodes.values()].sort((a, b) => a.y - b.y || a.x - b.x || a.slug.localeCompare(b.slug));
    if (nodes.length === 0) continue;

    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    if (acc.center) {
      xs.push(acc.center.x);
      ys.push(acc.center.y);
    }
    const minX = Math.min(...xs) - MARGEN;
    const minY = Math.min(...ys) - MARGEN;

    activities.push({
      slug: acc.slug,
      name: acc.name,
      nodes,
      edges: [...acc.edges.values()].sort(
        (a, b) => a.x1 - b.x1 || a.y1 - b.y1 || a.x2 - b.x2 || a.y2 - b.y2,
      ),
      center: acc.center,
      viewBox: {
        x: minX,
        y: minY,
        w: Math.max(...xs) + MARGEN - minX,
        h: Math.max(...ys) + MARGEN - minY,
      },
    });
  }

  // Orden estable: el que publica la fuente en sus solapas, que es el de la primera pagina.
  const orden = new Map([...porActividad.keys()].map((s, i) => [s, i]));
  activities.sort((a, b) => (orden.get(a.slug) ?? 0) - (orden.get(b.slug) ?? 0));

  return {
    dataset: WarPlansDataset.parse({
      generatedAt,
      source: 'd4builds:pages',
      pages: paginas.length,
      activities,
    }),
    avisos,
  };
}
