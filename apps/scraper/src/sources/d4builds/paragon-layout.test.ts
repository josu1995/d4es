import { describe, expect, it } from 'vitest';
import { construirLayoutParagon } from './paragon-layout.js';
import { normalizarGiro, parseCasilla } from './paragon-casillas.js';
import type { PaginaRaw } from './scrape-pages.js';

function paginaConParagon(
  buildId: string,
  paragon: { tablero: string; giro?: number | null; casillas: string[] }[],
): PaginaRaw {
  return {
    buildId,
    url: `https://d4builds.gg/builds/${buildId}/`,
    capturadoEn: '2026-08-09T10:00:00.000Z',
    pestanas: ['Paragon'],
    variantes: [{ index: 0, etiqueta: 'Standard Build' }],
    porVariante: [
      {
        index: 0,
        etiqueta: 'Standard Build',
        gear: [],
        stats: [],
        arbol: [],
        paragon: paragon.map((p) => ({
          tablero: p.tablero,
          glifo: null,
          nivelGlifo: null,
          icono: null,
          giro: p.giro ?? 0,
          casillas: p.casillas,
        })),
        mercenarios: { etiquetas: [], nodos: [] },
        paragonNivel: 300,
        warPlans: [],
        debug: {},
      },
    ],
  };
}

describe('parseCasilla', () => {
  it('entiende el formato nuevo, con rareza', () => {
    expect(parseCasilla('r2c11:Will:common:active:enabled')).toEqual({
      row: 2,
      col: 11,
      tipo: 'Will',
      rareza: 'common',
      activa: true,
    });
  });

  it('tolera el formato antiguo, sin rareza', () => {
    expect(parseCasilla('r7c6:Int')).toEqual({ row: 7, col: 6, tipo: 'Int', rareza: null, activa: false });
    expect(parseCasilla('r3c12:Dex:active:enabled:radius')).toMatchObject({ rareza: null, activa: true });
  });

  it('no confunde un tipo con pinta de estado: la rareza va en minusculas', () => {
    // El tipo sale del alt tal cual ("Legendary" seria un alt posible); la rareza
    // compactada siempre va en minusculas y en su posicion.
    expect(parseCasilla('r1c1:Legendary:legendary:enabled')).toMatchObject({
      tipo: 'Legendary',
      rareza: 'legendary',
    });
  });

  it('descarta lo que no tiene posicion', () => {
    expect(parseCasilla('sin-posicion:Will')).toBeNull();
    expect(parseCasilla('')).toBeNull();
  });
});

describe('normalizarGiro', () => {
  it('reduce el giro acumulado de la fuente a la vuelta', () => {
    expect(normalizarGiro(0)).toBe(0);
    expect(normalizarGiro(450)).toBe(90);
    expect(normalizarGiro(540)).toBe(180);
    expect(normalizarGiro(630)).toBe(270);
    expect(normalizarGiro(900)).toBe(180);
    expect(normalizarGiro(-90)).toBe(270);
  });

  it('descarta lo que no cae en un cuarto exacto', () => {
    expect(normalizarGiro(37)).toBeNull();
    expect(normalizarGiro(null)).toBeNull();
    expect(normalizarGiro(undefined)).toBeNull();
  });
});

describe('construirLayoutParagon', () => {
  it('guarda la forma una vez aunque la vean varias builds', () => {
    const paginas = [
      { clase: 'barbaro', pagina: paginaConParagon('a', [{ tablero: 'Carnage', casillas: ['r1c1:Str:common', 'r1c2:Dex:magic:active'] }]) },
      { clase: 'barbaro', pagina: paginaConParagon('b', [{ tablero: '2Carnage Str 110•Dex 59', casillas: ['r1c1:Str:common', 'r1c2:Dex:magic'] }]) },
    ];
    const { dataset, avisos } = construirLayoutParagon(paginas, '2026-08-09T10:00:00.000Z');
    expect(avisos).toEqual([]);
    expect(dataset.boards).toHaveLength(1);
    expect(dataset.boards[0]).toMatchObject({ clase: 'barbaro', name: 'Carnage', rows: 1, cols: 2 });
    expect(dataset.boards[0]!.tiles).toEqual([
      { row: 1, col: 1, type: 'Str', rarity: 'common' },
      { row: 1, col: 2, type: 'Dex', rarity: 'magic' },
    ]);
  });

  it('separa por clase: el Starting Board del barbaro no es el del nigromante', () => {
    const paginas = [
      { clase: 'barbaro', pagina: paginaConParagon('a', [{ tablero: 'Starting Board', casillas: ['r1c1:Str:common'] }]) },
      { clase: 'nigromante', pagina: paginaConParagon('b', [{ tablero: 'Starting Board', casillas: ['r1c1:Int:common'] }]) },
    ];
    const { dataset, avisos } = construirLayoutParagon(paginas, '2026-08-09T10:00:00.000Z');
    expect(avisos).toEqual([]);
    expect(dataset.boards).toHaveLength(2);
    expect(dataset.boards.map((b) => `${b.clase}:${b.tiles[0]!.type}`)).toEqual([
      'barbaro:Str',
      'nigromante:Int',
    ]);
  });

  it('canoniza el alias del glifo: "Paragon Glyph" y "Glyph" son la misma casilla', () => {
    const paginas = [
      { clase: 'barbaro', pagina: paginaConParagon('a', [{ tablero: 'Carnage', casillas: ['r7c11:Glyph:rare'] }]) },
      { clase: 'barbaro', pagina: paginaConParagon('b', [{ tablero: 'Carnage', casillas: ['r7c11:Paragon Glyph:rare'] }]) },
    ];
    const { dataset, avisos } = construirLayoutParagon(paginas, '2026-08-09T10:00:00.000Z');
    expect(avisos).toEqual([]);
    expect(dataset.boards[0]!.tiles[0]!.type).toBe('Glyph');
  });

  it('avisa si dos builds discrepan en el tipo de una casilla, y conserva la primera', () => {
    const paginas = [
      { clase: 'barbaro', pagina: paginaConParagon('a', [{ tablero: 'Carnage', casillas: ['r1c1:Str:common'] }]) },
      { clase: 'barbaro', pagina: paginaConParagon('b', [{ tablero: 'Carnage', casillas: ['r1c1:Will:common'] }]) },
    ];
    const { dataset, avisos } = construirLayoutParagon(paginas, '2026-08-09T10:00:00.000Z');
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('r1c1');
    expect(dataset.boards[0]!.tiles[0]!.type).toBe('Str');
  });

  it('completa la rareza que un crudo antiguo no traia, sin avisar', () => {
    const paginas = [
      { clase: 'barbaro', pagina: paginaConParagon('vieja', [{ tablero: 'Carnage', casillas: ['r1c1:Str'] }]) },
      { clase: 'barbaro', pagina: paginaConParagon('nueva', [{ tablero: 'Carnage', casillas: ['r1c1:Str:rare'] }]) },
    ];
    const { dataset, avisos } = construirLayoutParagon(paginas, '2026-08-09T10:00:00.000Z');
    expect(avisos).toEqual([]);
    expect(dataset.boards[0]!.tiles[0]!.rarity).toBe('rare');
  });

  it('es determinista: mismo orden de tableros y casillas en dos pasadas', () => {
    const paginas = [
      {
        clase: 'picaro',
        pagina: paginaConParagon('a', [
          { tablero: 'Wither', casillas: ['r2c2:Dex:common', 'r1c1:Will:common'] },
          { tablero: 'Frailty', casillas: ['r1c1:Int:common'] },
        ]),
      },
    ];
    const a = construirLayoutParagon(paginas, '2026-08-09T10:00:00.000Z');
    const b = construirLayoutParagon(paginas, '2026-08-09T10:00:00.000Z');
    expect(JSON.stringify(a.dataset)).toBe(JSON.stringify(b.dataset));
    expect(a.dataset.boards.map((x) => x.name)).toEqual(['Frailty', 'Wither']);
    expect(a.dataset.boards[1]!.tiles.map((t) => `r${t.row}c${t.col}`)).toEqual(['r1c1', 'r2c2']);
  });
});
