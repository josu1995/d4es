import { z } from 'zod';

/**
 * Dataset de habilidades que publica el propio catalogo de d4builds
 * (result.pageContext.skills, 431 entradas): categoria, etiquetas, descripcion y las
 * descripciones de cada runa. Es lo que alimenta los tooltips de la web.
 */

export const SkillInfo = z.object({
  /** Nombre en ingles tal como lo usa la fuente ("Whirlwind"). */
  name: z.string(),
  class: z.string().nullable(),
  /** Posicion en el listado de origen: conserva el orden real del arbol. */
  orden: z.number().int().min(0).default(0),
  /** Primer tag de la fuente ("Core", "Brawling"...). Solo para mostrar. */
  category: z.string().nullable(),
  tags: z.array(z.string()),
  /** Descripcion en ingles, con los valores {x} ya desenvueltos. */
  description: z.string().nullable(),
  /** Lineas extra ("Physical Damage", requisitos de arsenal...). */
  extra: z.array(z.string()),
  /** Coste/generacion tal cual la publica la fuente ("15 per second"). */
  cost: z.string().nullable(),
  luckyHit: z.string().nullable(),
  /** Descripcion de cada runa de la habilidad, por nombre en ingles. */
  runes: z.record(z.string(), z.string()),
});
export type SkillInfo = z.infer<typeof SkillInfo>;

export const SkillsDataset = z.object({
  generatedAt: z.string().datetime(),
  source: z.string(),
  count: z.number().int(),
  /** clave: nombre normalizado (minusculas, alfanumerico y espacios). */
  byName: z.record(z.string(), SkillInfo),
  /**
   * Tamaño de cada anillo del arbol por clase, tal como lo publica la fuente
   * (Barbaro: [4,8,7,7,8,6,5]). La diferencia con las habilidades activas con nombre
   * son las pasivas, cuyos nombres NO publica: se representan sin nombre en vez de
   * inventarlos.
   */
  anillosPorClase: z.record(z.string(), z.array(z.number().int())).default({}),
});
export type SkillsDataset = z.infer<typeof SkillsDataset>;

export function skillNameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Slug de icono de la fuente: "Charge Battering Ram" -> "charge_battering_ram".
 * Verificado contra las URLs reales de sunderarmor.com/DIABLO4/Skills/VoH2/.
 */
export function skillIconSlug(name: string): string {
  return skillNameKey(name).replace(/ /g, '_');
}

/** Quita las llaves de los valores plantilla de la fuente: "{71} damage" -> "71 damage". */
export function unwrapTemplates(texto: string): string {
  return texto.replace(/\{([^}]*)\}/g, '$1');
}
