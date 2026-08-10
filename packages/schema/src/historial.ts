import { z } from 'zod';

/**
 * Historial de cambios por build: que cambio de verdad en cada build y cuando.
 *
 * Por que existe: la fuente publica la FOTO de hoy. Si el autor de una guia cambia un
 * aspecto o baja una habilidad, el que ya esta jugando esa build no se entera salvo que
 * la revise a mano. Como aqui los datos se normalizan de forma determinista y se
 * commitean, se puede guardar la pelicula y no solo la foto.
 *
 * Se acumula: cada pasada de `normalize` compara la FIRMA de cada build con la de la
 * pasada anterior y, si algo cambio, añade una entrada. La firma vive en el mismo fichero
 * para no depender de escarbar en el git (que ademas mezcla cambios de la fuente con los
 * nuestros).
 *
 * El guardarrail importante: cuando cambiamos NOSOTROS el parser o el diccionario, cambian
 * casi todas las builds a la vez. Eso no es un cambio de la build y publicarlo como tal
 * seria mentir al lector. Por eso, si un mismo tipo de cambio afecta a mas de la mitad del
 * catalogo en una sola pasada, se marca como cambio del sitio (`ambito: 'sitio'`) y la
 * ficha no lo pinta.
 */

export const TIPOS_CAMBIO = [
  'tier',
  'pit',
  'habilidad',
  'equipo',
  'engarce',
  'glifo',
  'tablero',
  'mercenario',
] as const;
export type TipoCambio = (typeof TIPOS_CAMBIO)[number];

/** Un termino tal como se pinta: castellano si lo hay, y siempre el ingles. */
export const TerminoBreve = z.object({
  es: z.string().nullable(),
  en: z.string(),
});
export type TerminoBreve = z.infer<typeof TerminoBreve>;

export const CambioBuild = z.object({
  tipo: z.enum(TIPOS_CAMBIO),
  /** Donde: la ranura, la actividad, el numero de tablero... Vacio si no aplica. */
  donde: z.string(),
  antes: TerminoBreve.nullable(),
  despues: TerminoBreve.nullable(),
});
export type CambioBuild = z.infer<typeof CambioBuild>;

export const EntradaHistorial = z.object({
  /** Fecha del SNAPSHOT que lo trajo, no del reloj: la normalizacion es determinista. */
  fecha: z.string().datetime(),
  /**
   * De quien es el cambio. `fuente` = lo cambio el autor de la guia. `sitio` = lo
   * cambiamos nosotros (parser, esquema, traducciones) y afecto a medio catalogo.
   */
  ambito: z.enum(['fuente', 'sitio']),
  cambios: z.array(CambioBuild),
});
export type EntradaHistorial = z.infer<typeof EntradaHistorial>;

export const HistorialBuild = z.object({
  /** Firma de la ultima pasada, para poder comparar en la siguiente. */
  firma: z.record(z.string(), z.string()),
  entradas: z.array(EntradaHistorial),
});
export type HistorialBuild = z.infer<typeof HistorialBuild>;

export const Historial = z.object({
  generatedAt: z.string().datetime(),
  /** Desde cuando se registra. Antes de esta fecha no hay pelicula, solo foto. */
  desde: z.string().datetime(),
  /** Cuantas pasadas se han registrado. */
  pasadas: z.number().int().min(0),
  builds: z.record(z.string(), HistorialBuild),
});
export type Historial = z.infer<typeof Historial>;

/** Tope de entradas por build: es un historial util, no un archivo eterno. */
export const MAX_ENTRADAS_HISTORIAL = 40;
