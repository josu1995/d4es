import { ParagonBoardsDataset, type ParagonBoardLayout, type ParagonTileLayout } from '@d4es/schema';
import type { PaginaRaw } from './scrape-pages.js';
import { limpiarNombreTablero } from './normalize-pages.js';
import { parseCasilla } from './paragon-casillas.js';

/**
 * Construye el catalogo con la FORMA de los tableros de Paragon a partir de las paginas
 * ya extraidas, igual que `warplans-layout.ts` hace con los planes de guerra.
 *
 * Por que existe: la forma de un tablero no depende de la build. "Cult Leader" tiene las
 * mismas ~180 casillas en todas las builds que lo montan; lo que cambia por build es que
 * casillas recorre, con que giro lo coloca y que glifo engarza. Guardar la forma dentro
 * de cada build repetiria ~750 casillas 92 veces.
 *
 * Se indexa por CLASE + NOMBRE porque los tableros son por clase, y la etiqueta
 * "Starting Board" de la fuente se repite en las cinco clases con casillas distintas.
 *
 * Las casillas llegan en la rejilla logica de la fuente (clases r2 c11), SIN girar: el
 * giro es CSS del tablero y es un dato de la build, no de la forma.
 *
 * Si dos paginas discrepan en el TIPO de una casilla, NO se elige a dedo: se queda la
 * primera lectura y la discrepancia sale como aviso, porque significaria que la fuente ha
 * cambiado el tablero y hay que mirarlo. La rareza es la excepcion: las paginas extraidas
 * antes de agosto de 2026 no la traen (sale null), asi que un null se rellena con la
 * primera lectura que si la tenga — eso es completar, no discrepar.
 */

interface Acumulado {
  clase: string;
  name: string;
  tiles: Map<string, ParagonTileLayout>;
}

/**
 * El alt de la casilla del glifo varia segun la build ("Glyph" con el engarce vacio,
 * "Paragon Glyph" con glifo puesto), pero es la MISMA casilla: sin canonizarlo, cada
 * tablero salia con un aviso de discrepancia falso por build. Verificado en la primera
 * normalizacion real: 66 "Glyph" + 3 "Paragon Glyph", siempre en la misma posicion.
 */
function tipoCanonico(tipo: string): string {
  return /^paragon glyph$/i.test(tipo) ? 'Glyph' : tipo;
}

export interface ParagonLayoutResultado {
  dataset: ParagonBoardsDataset;
  avisos: string[];
}

export function construirLayoutParagon(
  paginas: readonly { clase: string; pagina: PaginaRaw }[],
  generatedAt: string,
): ParagonLayoutResultado {
  const avisos: string[] = [];
  const porTablero = new Map<string, Acumulado>();

  for (const { clase, pagina } of paginas) {
    for (const variante of pagina.porVariante) {
      for (const board of variante.paragon ?? []) {
        const name = limpiarNombreTablero(board.tablero);
        if (name.length === 0 || (board.casillas ?? []).length === 0) continue;

        const clave = `${clase}::${name}`;
        let acc = porTablero.get(clave);
        if (!acc) {
          acc = { clase, name, tiles: new Map() };
          porTablero.set(clave, acc);
        }

        for (const compacta of board.casillas ?? []) {
          const c = parseCasilla(compacta);
          if (!c) continue;
          const tipo = tipoCanonico(c.tipo);
          const pos = `r${c.row}c${c.col}`;
          const previa = acc.tiles.get(pos);
          if (!previa) {
            acc.tiles.set(pos, { row: c.row, col: c.col, type: tipo, rarity: c.rareza });
            continue;
          }
          if (previa.type !== tipo) {
            avisos.push(
              `paragon "${clase}/${name}": la casilla ${pos} es "${previa.type}" y "${tipo}" ` +
                `segun la build — se conserva la primera lectura`,
            );
            continue;
          }
          // Completar la rareza que los crudos antiguos no traian no es una discrepancia.
          if (previa.rarity === null && c.rareza !== null) {
            acc.tiles.set(pos, { ...previa, rarity: c.rareza });
          } else if (previa.rarity !== null && c.rareza !== null && previa.rarity !== c.rareza) {
            avisos.push(
              `paragon "${clase}/${name}": la casilla ${pos} es "${previa.rarity}" y "${c.rareza}" ` +
                `segun la build — se conserva la primera lectura`,
            );
          }
        }
      }
    }
  }

  const boards: ParagonBoardLayout[] = [];
  for (const acc of porTablero.values()) {
    const tiles = [...acc.tiles.values()].sort((a, b) => a.row - b.row || a.col - b.col);
    if (tiles.length === 0) continue;
    boards.push({
      clase: acc.clase,
      name: acc.name,
      tiles,
      rows: Math.max(...tiles.map((t) => t.row)),
      cols: Math.max(...tiles.map((t) => t.col)),
    });
  }

  // Orden estable y alfabetico: aqui no hay un "orden de la fuente" que respetar, porque
  // cada build monta tableros distintos.
  boards.sort((a, b) => a.clase.localeCompare(b.clase) || a.name.localeCompare(b.name));

  return {
    dataset: ParagonBoardsDataset.parse({
      generatedAt,
      source: 'd4builds:pages',
      pages: paginas.length,
      boards,
    }),
    avisos,
  };
}
