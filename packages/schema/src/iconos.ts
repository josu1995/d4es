import { skillIconSlug } from './skills-dataset.js';

/**
 * De donde sale cada icono y donde se guarda si lo auto-hospedamos.
 *
 * Vive en el esquema, y no en la web, porque hay DOS consumidores que deben construir
 * exactamente la misma URL: la web al pintar, y el descargador al traerselos. Si cada uno
 * llevara su copia, el dia que la fuente cambie de carpeta se arreglaria uno y el otro se
 * quedaria descargando ficheros que ya nadie pide.
 *
 * Son assets del juego (Blizzard) servidos por el CDN de d4builds, el mismo origen que usa
 * su web. Auto-hospedarlos quita el hotlink, que es frágil: si cambian de carpeta, hoy los
 * iconos desaparecen de golpe.
 */

export const ICONO_CDN = 'https://sunderarmor.com/DIABLO4';

/** Carpeta local por familia. La ruta publica final es `/iconos/<familia>/<fichero>`. */
export type FamiliaIcono = 'habilidades' | 'clases' | 'unicos' | 'ranuras' | 'planes' | 'actividades';

export interface Icono {
  /** URL de origen. */
  url: string;
  /** Ruta publica servida por la web: `/iconos/...`. */
  ruta: string;
}

function icono(familia: FamiliaIcono, carpetaCdn: string, fichero: string): Icono {
  return {
    url: `${ICONO_CDN}/${carpetaCdn}/${encodeURIComponent(fichero)}.png`,
    ruta: `/iconos/${familia}/${encodeURIComponent(fichero)}.png`,
  };
}

export function iconoHabilidad(nombreEn: string): Icono {
  return icono('habilidades', 'Skills/VoH2', skillIconSlug(nombreEn));
}

export function iconoDeClase(classId: string): Icono {
  return icono('clases', 'Classes/2', classId);
}

export function iconoDeUnico(nombreEn: string): Icono {
  return icono('unicos', 'Uniques/2', skillIconSlug(nombreEn));
}

/** Icono generico de ranura, para las piezas que no son unicas ni miticas. */
export function iconoDeRanura(fichero: string): Icono {
  return icono('ranuras', 'Uniques', fichero);
}

/**
 * Nodo de plan de guerra. El slug viene del propio fichero que publica la fuente, asi que
 * NO pasa por skillIconSlug: eso se comeria el apostrofe de "choron's_haste".
 */
export function iconoDeNodoPlan(slug: string): Icono {
  return icono('planes', 'Skills/VoH2', slug);
}

export function iconoDeActividadPlan(slug: string): Icono {
  return icono('actividades', 'WarPlans', slug);
}
