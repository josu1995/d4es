import { z } from 'zod';
import { Verificacion } from './primitives.js';

/**
 * Modelo del contenido propio: jefes, llaves, materiales y recetas de crafteo.
 *
 * Principio rector: ningun numero vive en la prosa. Todo lo que puede cambiar con un
 * parche vive aqui y la guia lo renderiza, de modo que actualizar el juego es tocar un
 * JSON y no reescribir textos. Y todo campo dudoso arrastra su `Verificacion`, para que
 * la web pueda pintar un aviso visible en lugar de dar por buena una cifra sin confirmar.
 */

/** Texto con procedencia. `es` puede ser null: entonces la web muestra el ingles. */
export const TextoVerificado = z.object({
  en: z.string().min(1),
  es: z.string().min(1).nullable(),
  verificacion: Verificacion,
});
export type TextoVerificado = z.infer<typeof TextoVerificado>;

export const TIERS_JEFE = ['initiate', 'greater', 'exalted', 'estacional'] as const;
export const TierJefe = z.enum(TIERS_JEFE);

export const Jefe = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  nombre: TextoVerificado,
  tier: TierJefe,
  ubicacion: z.string().nullable(),
  /** Llave que se gasta para abrir su alijo. Referencia a `llaves.json`. */
  llaveRequerida: z.string().nullable(),
  /** Llave que suelta su alijo (asi se alimenta el escalon siguiente). */
  sueltaLlave: z.string().nullable(),
  /**
   * Desde Lord of Hatred se pelea PRIMERO y despues se gasta la llave para abrir el
   * alijo. Se guarda explicito porque casi toda la informacion antigua dice lo contrario.
   */
  ordenCombate: z.enum(['lucha-luego-alijo', 'invocacion-previa']),
  /** Unicos "firma" que suelta. No pretende ser la tabla completa. */
  unicos: z.array(z.string()),
  notas: z.array(z.string()),
  verificacion: Verificacion,
});
export type Jefe = z.infer<typeof Jefe>;

export const Llave = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  nombre: TextoVerificado,
  abre: z.array(z.string()),
  seObtieneEn: z.array(z.string()),
  verificacion: Verificacion,
});
export type Llave = z.infer<typeof Llave>;

export const Material = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  nombre: TextoVerificado,
  paraQue: z.array(z.string()),
  fuentes: z.array(
    z.object({
      actividad: z.string(),
      detalle: z.string().nullable(),
      verificacion: Verificacion,
    }),
  ),
  verificacion: Verificacion,
});
export type Material = z.infer<typeof Material>;

/** Un numero que puede cambiar con un parche, con su procedencia pegada. */
export const Cifra = z.object({
  valor: z.number(),
  verificacion: Verificacion,
});
export type Cifra = z.infer<typeof Cifra>;

export const Receta = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  nombre: TextoVerificado,
  donde: z.enum(['cubo-horadrico', 'joyero', 'herrero']),
  entradas: z.array(
    z.object({
      materialId: z.string(),
      cantidad: Cifra.nullable(),
      nota: z.string().nullable(),
    }),
  ),
  requisitos: z.array(z.string()),
  /**
   * `aleatorio-del-slot` obliga a razonar con probabilidad (de ahi la calculadora);
   * `especifico` no, porque eliges el objetivo.
   */
  resultado: z.enum(['aleatorio-del-slot', 'especifico', 'iconico-aleatorio']),
  /** Tamano del conjunto del que sale el resultado, si es aleatorio. */
  tamanoPool: Cifra.nullable(),
  notas: z.array(z.string()),
  verificacion: Verificacion,
});
export type Receta = z.infer<typeof Receta>;

export const GrafoContenido = z.object({
  jefes: z.array(Jefe),
  llaves: z.array(Llave),
  materiales: z.array(Material),
  recetas: z.array(Receta),
  iconicos: z.array(z.string()),
});
export type GrafoContenido = z.infer<typeof GrafoContenido>;

// --- Matematica del crafteo aleatorio ------------------------------------------------

export interface CosteEsperado {
  /** Probabilidad de acertar en un intento. */
  p: number;
  /** Intentos esperados hasta el primer acierto (media geometrica). */
  intentosEsperados: number;
  /** Intentos necesarios para tener un 90 % de haberlo sacado ya. */
  intentosP90: number;
  /** Coste esperado en el material principal. */
  costeEsperado: number;
  costeP90: number;
}

/**
 * Coste de una receta de resultado aleatorio. Es la cuenta que de verdad importa: no
 * "cuanto cuesta un intento" sino "cuantos intentos hasta tenerlo", y sobre todo el
 * percentil 90, que es el peor caso razonable con el que hay que contar.
 */
export function costeEsperado(tamanoPool: number, costePorIntento: number): CosteEsperado {
  if (tamanoPool <= 0) throw new Error('el pool debe ser mayor que 0');
  const p = 1 / tamanoPool;
  const intentosEsperados = tamanoPool;
  // P(al menos uno en k) >= 0,9  ->  k >= ln(0,1) / ln(1-p)
  const intentosP90 = p >= 1 ? 1 : Math.ceil(Math.log(0.1) / Math.log(1 - p));
  return {
    p,
    intentosEsperados,
    intentosP90,
    costeEsperado: intentosEsperados * costePorIntento,
    costeP90: intentosP90 * costePorIntento,
  };
}
