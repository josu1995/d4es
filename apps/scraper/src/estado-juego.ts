import { z } from 'zod';
import { Verificacion } from '@d4es/schema';
import { PATHS } from './paths.js';
import { readJsonIfExists } from './util/stable-json.js';

/**
 * Fuente unica de verdad sobre en que temporada/parche estamos. Cambiar de temporada es
 * editar este fichero; todo lo demas (banners, caducidad de guias) se recalcula.
 */
export const EstadoJuego = z.object({
  expansion: z.string(),
  temporadaActual: z.number().int(),
  temporadaNombreEn: z.string(),
  temporadaNombreEs: z.string().nullable(),
  parche: z.string(),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  finPrevisto: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  verificacion: Verificacion,
});
export type EstadoJuego = z.infer<typeof EstadoJuego>;

export async function loadEstadoJuego(): Promise<EstadoJuego> {
  const raw = await readJsonIfExists<unknown>(PATHS.estadoJuego);
  if (raw === null) throw new Error(`falta ${PATHS.estadoJuego}`);
  return EstadoJuego.parse(raw);
}
