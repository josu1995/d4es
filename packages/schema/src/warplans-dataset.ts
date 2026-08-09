import { z } from 'zod';
import { WARPLAN_ACTIVITIES } from './constants.js';

/**
 * Forma de los arboles de planes de guerra: donde va cada nodo y que nodos une cada
 * arista, por actividad.
 *
 * Vive aparte de las builds a proposito. La forma del arbol es la MISMA en las 92 builds
 * (verificado nodo a nodo: mismos slugs, mismas coordenadas y mismas figuras en las siete
 * actividades), asi que se guarda UNA vez. Cada build solo publica que nodos invierte, y
 * la ficha cruza ambas cosas para pintar el arbol entero con los suyos encendidos.
 *
 * Las coordenadas son las que usa la fuente en su lienzo, sin reescalar: la web las mete
 * tal cual en el `viewBox` de un SVG y deja que el navegador haga la escala.
 */

export const WarPlanNodeLayout = z.object({
  /** Slug del fichero del icono: corrupted_roots, chorons_haste... */
  slug: z.string().min(1),
  /** Nombre en ingles publicado por el catalogo. Nunca traducido aqui: esto no es i18n. */
  name: z.string().min(1),
  x: z.number().int(),
  y: z.number().int(),
  /** Los rombos son los nodos menores del arbol; los circulos, los mayores. */
  minor: z.boolean(),
});
export type WarPlanNodeLayout = z.infer<typeof WarPlanNodeLayout>;

export const WarPlanEdgeLayout = z.object({
  x1: z.number().int(),
  y1: z.number().int(),
  x2: z.number().int(),
  y2: z.number().int(),
});
export type WarPlanEdgeLayout = z.infer<typeof WarPlanEdgeLayout>;

export const WarPlanActivityLayout = z.object({
  slug: z.string().min(1),
  /** Nombre de la actividad en ingles, tal como lo publica la fuente. */
  name: z.string().min(1),
  nodes: z.array(WarPlanNodeLayout).min(1),
  edges: z.array(WarPlanEdgeLayout),
  /** El nodo central con el icono de la actividad. No es un nodo invertible. */
  center: z.object({ x: z.number().int(), y: z.number().int() }).nullable(),
  /** Caja que encierra el dibujo, ya con margen: va directa al viewBox del SVG. */
  viewBox: z.object({
    x: z.number().int(),
    y: z.number().int(),
    w: z.number().int().positive(),
    h: z.number().int().positive(),
  }),
});
export type WarPlanActivityLayout = z.infer<typeof WarPlanActivityLayout>;

export const WarPlansDataset = z.object({
  generatedAt: z.string().datetime(),
  source: z.string(),
  /** Cuantas paginas se leyeron para construirlo. */
  pages: z.number().int().min(0),
  activities: z.array(WarPlanActivityLayout).max(WARPLAN_ACTIVITIES),
});
export type WarPlansDataset = z.infer<typeof WarPlansDataset>;
