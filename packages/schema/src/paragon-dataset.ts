import { z } from 'zod';

/**
 * Forma de los tableros de Paragon: que casilla hay en cada posicion de la rejilla, con
 * su tipo y su rareza.
 *
 * Vive aparte de las builds a proposito, igual que el catalogo de planes de guerra: la
 * forma de un tablero ("Cult Leader") es la MISMA en todas las builds que lo usan, asi
 * que se guarda UNA vez. Cada build solo publica que casillas recorre (`tiles` en su
 * `ParagonBoard`), con que giro lo coloca y que glifo engarza, y la ficha cruza ambas
 * cosas para dibujar el tablero entero con el camino encendido.
 *
 * A diferencia de los planes de guerra, el catalogo se indexa por CLASE + NOMBRE: los
 * tableros de Paragon son por clase, y la etiqueta "Starting Board" de la fuente se
 * repite en las cinco clases con casillas distintas (el del Barbaro reparte Fuerza; el
 * del Nigromante, Inteligencia).
 *
 * Las coordenadas son la rejilla logica de la fuente (fila/columna de sus clases r2 c11),
 * SIN girar: el giro es un dato de la build y se aplica al dibujar.
 */

export const PARAGON_RARITIES = ['common', 'magic', 'rare', 'legendary'] as const;

export const ParagonTileLayout = z.object({
  row: z.number().int().min(1),
  col: z.number().int().min(1),
  /** Tipo que publica la fuente en el alt del icono: Will, Glyph, Paragon Starting Node... */
  type: z.string(),
  /**
   * Rareza del fondo de la casilla (tile_bg_common.png -> common). null cuando todas las
   * paginas que la vieron eran anteriores a que el extractor la guardara.
   */
  rarity: z.enum(PARAGON_RARITIES).nullable(),
});
export type ParagonTileLayout = z.infer<typeof ParagonTileLayout>;

export const ParagonBoardLayout = z.object({
  /** Slug de la clase (barbaro, nigromante...): los tableros son por clase. */
  clase: z.string().min(1),
  /** Nombre en ingles publicado por la fuente, limpio. Nunca traducido aqui: no es i18n. */
  name: z.string().min(1),
  tiles: z.array(ParagonTileLayout).min(1),
  /** Dimensiones de la rejilla, para dimensionar el dibujo sin recorrer las casillas. */
  rows: z.number().int().positive(),
  cols: z.number().int().positive(),
});
export type ParagonBoardLayout = z.infer<typeof ParagonBoardLayout>;

export const ParagonBoardsDataset = z.object({
  generatedAt: z.string().datetime(),
  source: z.string(),
  /** Cuantas paginas se leyeron para construirlo. */
  pages: z.number().int().min(0),
  boards: z.array(ParagonBoardLayout),
});
export type ParagonBoardsDataset = z.infer<typeof ParagonBoardsDataset>;
