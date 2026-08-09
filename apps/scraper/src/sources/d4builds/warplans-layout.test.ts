import { describe, expect, it } from 'vitest';
import { construirLayoutPlanes } from './warplans-layout.js';
import type { PaginaRaw } from './scrape-pages.js';

/** Nodos reales de la solapa de Susurros, tal como los devuelve la sonda del DOM. */
const NODOS = [
  { clases: ['category', 'unlocked'], iconos: ['category_active', 'category_whispers'], texto: null, x: 580, y: 154 },
  { clases: ['large-circle', 'allocated'], iconos: ['passive_active', 'corrupted_roots'], texto: '1/1', x: 380, y: 213 },
  { clases: ['diamond', 'locked'], iconos: ['skill_minor_inactive', 'tree_of_plenty'], texto: null, x: 498, y: 316 },
];

function pagina(planes: unknown[], buildId = 'uuid-1'): PaginaRaw {
  return {
    buildId,
    url: '',
    capturadoEn: '2026-08-09T00:00:00.000Z',
    pestanas: [],
    variantes: [],
    porVariante: [
      {
        index: 0,
        etiqueta: null,
        gear: [],
        stats: [],
        arbol: [],
        paragon: [],
        mercenarios: [],
        warPlans: planes as PaginaRaw['porVariante'][number]['warPlans'],
        debug: {},
      },
    ],
  };
}

const PLAN = {
  actividad: 'Whispers',
  slug: 'whispers',
  icono: null,
  restantes: 4,
  nodos: NODOS,
  lineas: [{ x1: 380, y1: 213, x2: 580, y2: 154 }],
};

const nombres = new Map([
  ['corrupted_roots', 'Corrupted Roots'],
  ['tree_of_plenty', 'Tree of Plenty'],
]);
const nombreDeNodo = (slug: string) => nombres.get(slug) ?? null;
const cuando = '2026-08-09T00:00:00.000Z';

describe('construirLayoutPlanes', () => {
  it('saca la forma del arbol: nodos con su sitio, figura y nombre', () => {
    const { dataset } = construirLayoutPlanes([pagina([PLAN])], nombreDeNodo, cuando);
    const act = dataset.activities[0]!;
    expect(act.slug).toBe('whispers');
    expect(act.nodes).toHaveLength(2);
    expect(act.nodes.find((n) => n.slug === 'tree_of_plenty')?.minor).toBe(true);
    expect(act.nodes.find((n) => n.slug === 'corrupted_roots')).toMatchObject({
      name: 'Corrupted Roots',
      x: 380,
      y: 213,
      minor: false,
    });
  });

  it('guarda TODOS los nodos, se hayan invertido o no: el arbol se pinta entero', () => {
    const { dataset } = construirLayoutPlanes([pagina([PLAN])], nombreDeNodo, cuando);
    expect(dataset.activities[0]!.nodes.map((n) => n.slug).sort()).toEqual(['corrupted_roots', 'tree_of_plenty']);
  });

  it('el nodo de categoria no es un nodo: es el centro con el icono de la actividad', () => {
    const { dataset } = construirLayoutPlanes([pagina([PLAN])], nombreDeNodo, cuando);
    expect(dataset.activities[0]!.center).toEqual({ x: 580, y: 154 });
    expect(dataset.activities[0]!.nodes.some((n) => n.slug.startsWith('category'))).toBe(false);
  });

  it('la caja encierra todo el dibujo con margen', () => {
    const { dataset } = construirLayoutPlanes([pagina([PLAN])], nombreDeNodo, cuando);
    const vb = dataset.activities[0]!.viewBox;
    expect(vb.x).toBe(320);
    expect(vb.y).toBe(94);
    expect(vb.x + vb.w).toBe(640);
    expect(vb.y + vb.h).toBe(376);
  });

  it('fusiona varias builds sin duplicar: la forma es la misma en todas', () => {
    const { dataset, avisos } = construirLayoutPlanes(
      [pagina([PLAN]), pagina([PLAN], 'uuid-2')],
      nombreDeNodo,
      cuando,
    );
    expect(dataset.activities).toHaveLength(1);
    expect(dataset.activities[0]!.nodes).toHaveLength(2);
    expect(dataset.activities[0]!.edges).toHaveLength(1);
    expect(avisos).toEqual([]);
  });

  it('avisa si una build coloca un nodo en otro sitio en vez de elegir a dedo', () => {
    const movido = { ...PLAN, nodos: [{ ...NODOS[1]!, x: 999, y: 999 }] };
    const { dataset, avisos } = construirLayoutPlanes(
      [pagina([PLAN]), pagina([movido], 'uuid-2')],
      nombreDeNodo,
      cuando,
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('corrupted_roots');
    // Se conserva la primera lectura, no la ultima.
    expect(dataset.activities[0]!.nodes.find((n) => n.slug === 'corrupted_roots')?.x).toBe(380);
  });

  it('sin nombre publicado cae al slug, y sigue siendo ingles', () => {
    const { dataset } = construirLayoutPlanes([pagina([PLAN])], () => null, cuando);
    expect(dataset.activities[0]!.nodes.find((n) => n.slug === 'corrupted_roots')?.name).toBe('Corrupted Roots');
  });

  it('es determinista', () => {
    const a = construirLayoutPlanes([pagina([PLAN])], nombreDeNodo, cuando).dataset;
    const b = construirLayoutPlanes([pagina([PLAN])], nombreDeNodo, cuando).dataset;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
