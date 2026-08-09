import { z } from 'zod';
import { GameRef } from './gameref.js';
import { ClassId, ContentTag, SkillCategory, SlotId, SourceSite } from './primitives.js';
import {
  MAX_CHARMS,
  MAX_GLYPH_RANK,
  MAX_PARAGON_BOARDS,
  MAX_SKILL_BAR,
  MAX_SKILL_RANK,
  MAX_WARPLAN_POINTS,
  WARPLAN_ACTIVITIES,
} from './constants.js';

/** De donde vino exactamente esta variante y con que se puede auditar. */
export const SourceRef = z.object({
  site: SourceSite,
  externalId: z.string().min(1),
  variantIndex: z.number().int().min(0),
  variantLabel: z.string().nullable(),
  /** Enlace canonico al original. Siempre visible en la ficha. */
  url: z.string().url(),
  author: z.string().nullable(),
  capturedAt: z.string().datetime(),
  snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
  provenance: z.enum(['server-scrape', 'user-provided', 'original']),
});
export type SourceRef = z.infer<typeof SourceRef>;

export const SkillEntry = z.object({
  ref: GameRef,
  order: z.number().int().min(0),
  /** 0 es valido: habilidad en la barra sin puntos invertidos (la otorga el equipo). */
  rank: z.number().int().min(0).max(MAX_SKILL_RANK),
  /** Skill Variant del rework de Lord of Hatred: puede cambiar la etiqueta elemental. */
  skillVariant: GameRef.nullable(),
  runes: z.array(GameRef).max(3),
  category: SkillCategory,
});
export type SkillEntry = z.infer<typeof SkillEntry>;

export const GearAffix = z.object({
  ref: GameRef,
  greater: z.boolean(),
  tempered: z.boolean(),
  order: z.number().int().min(0),
});

export const GearItem = z.object({
  slot: SlotId,
  item: GameRef.nullable(),
  quality: z.enum(['normal', 'magic', 'rare', 'legendary', 'unique']),
  /** Mythic 3.0: "mitico" es una CALIDAD, no una rareza. Por eso va aparte de `quality`. */
  mythic: z.object({
    isMythic: z.boolean(),
    craftPath: z.enum(['horadric-cube', 'jeweler', 'blacksmith']).nullable(),
  }),
  aspect: GameRef.nullable(),
  affixes: z.array(GearAffix).max(8),
  sockets: z.array(GameRef).max(3),
  minItemPower: z.number().int().positive().nullable(),
  /**
   * URL de la imagen con que la fuente pinta la pieza. Es la unica previsualizacion
   * posible para las legendarias, que no tienen objeto base con nombre. `default` para
   * que los canonicos escritos antes de este campo sigan parseando.
   */
  icon: z.string().nullable().default(null),
});
export type GearItem = z.infer<typeof GearItem>;

export const ParagonBoard = z.object({
  ref: GameRef,
  order: z.number().int().min(0),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).nullable(),
  glyph: z
    .object({
      ref: GameRef,
      /** null cuando la fuente publica el glifo pero no su nivel: no se inventa un 1. */
      rank: z.number().int().min(1).max(MAX_GLYPH_RANK).nullable(),
    })
    .nullable(),
  /**
   * Casillas que la build recorre en este tablero, compactas ("r2c11") y en la rejilla
   * logica SIN girar. La forma completa del tablero (tipo y rareza de cada casilla) vive
   * una sola vez en `paragon-boards-dataset.json`, indexada por clase + nombre; la ficha
   * cruza ambas cosas para dibujar el tablero con el camino encendido. `default` para que
   * los canonicos escritos antes de este campo sigan parseando.
   */
  tiles: z.array(z.string().regex(/^r\d+c\d+$/)).default([]),
});

export const Completeness = z.object({
  hasSkills: z.boolean(),
  hasGear: z.boolean(),
  hasParagon: z.boolean(),
  hasTalisman: z.boolean(),
  hasMercenary: z.boolean(),
  hasWarPlan: z.boolean(),
  score: z.number().min(0).max(1),
});
export type Completeness = z.infer<typeof Completeness>;

export const BuildVariant = z.object({
  id: z.string().min(1),
  source: SourceRef,
  levelBand: z.enum(['leveling', 'endgame']),
  skills: z.array(SkillEntry).max(MAX_SKILL_BAR),
  gear: z.record(SlotId, GearItem),
  paragon: z.object({
    level: z.number().int().min(0).nullable(),
    boards: z.array(ParagonBoard).max(MAX_PARAGON_BOARDS),
  }),
  talisman: z
    .object({
      seal: GameRef.nullable(),
      charms: z.array(GameRef).max(MAX_CHARMS),
    })
    .nullable(),
  runewords: z
    .array(
      z.object({
        ritual: GameRef,
        invocation: GameRef,
      }),
    )
    .max(2),
  mercenary: z
    .object({
      ref: GameRef,
      skills: z.array(GameRef),
      reinforcement: GameRef.nullable(),
    })
    .nullable(),
  /**
   * Planes de guerra. La fuente publica SIETE arboles independientes, uno por actividad
   * (Susurros, Mazmorras de pesadilla, Mareas infernales, Subciudad, Guaridas de jefe,
   * Hordas infernales y la Fosa), y cada uno tiene su propia bolsa de 7 puntos: por eso
   * `spent + remaining === MAX_WARPLAN_POINTS` en todas las actividades.
   *
   * Solo se guardan los nodos invertidos, que es lo que la build recomienda. La forma
   * completa del arbol es la MISMA en todas las builds, asi que pintarla entera pide un
   * catalogo compartido aparte, no repetirla 92 veces.
   */
  warPlan: z
    .object({
      activities: z
        .array(
          z.object({
            ref: GameRef,
            /** Slug estable que publica la fuente: whispers, boss_lairs, pits... */
            slug: z.string().min(1),
            spent: z.number().int().min(0).max(MAX_WARPLAN_POINTS),
            remaining: z.number().int().min(0).max(MAX_WARPLAN_POINTS).nullable(),
            /**
             * Nodos con puntos invertidos, en el orden en que los pinta la fuente. El
             * `slug` es la clave con la que se cruzan con el catalogo de la forma del
             * arbol: el nombre no vale, porque los apostrofes ("Choron's Haste") no
             * sobreviven a la normalizacion y dejarian nodos sin casar.
             */
            nodes: z
              .array(z.object({ ref: GameRef, slug: z.string().min(1), minor: z.boolean() }))
              .max(MAX_WARPLAN_POINTS),
          }),
        )
        .max(WARPLAN_ACTIVITIES),
      /** true = propuesta nuestra, no de la fuente. Se marca en la UI. */
      inferred: z.boolean(),
    })
    .nullable(),
  completeness: Completeness,
});
export type BuildVariant = z.infer<typeof BuildVariant>;

export const ConsensusField = z.object({
  key: z.string(),
  status: z.enum(['agree', 'differ', 'only-in']),
  label: GameRef.nullable(),
  values: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
});

export const BuildConsensus = z.object({
  variantCount: z.number().int().min(1),
  /** Habilidades presentes en TODAS las variantes. Es lo que se muestra por defecto. */
  coreSkills: z.array(GameRef),
  coreUniques: z.array(GameRef),
  fields: z.array(ConsensusField),
});
export type BuildConsensus = z.infer<typeof BuildConsensus>;

export const CanonicalBuild = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'el id es un slug en minusculas, digitos y guiones'),
  correlationKey: z.string().min(1),
  classId: ClassId,
  title: z.object({ es: z.string().min(1), en: z.string().min(1) }),
  summary: z.object({ es: z.string().max(400).nullable(), en: z.string().max(400).nullable() }),
  tags: z.object({
    playstyle: z.array(z.string()),
    content: z.array(ContentTag),
    element: z.array(z.string()),
  }),
  ratings: z.object({
    tierLabel: z.string().nullable(),
    tierRank: z.number().int().nullable(),
    pitTier: z.number().int().nullable(),
  }),
  gameVersion: z.object({ patch: z.string(), season: z.number().int() }),
  variants: z.array(BuildVariant).min(1),
  primaryVariantId: z.string().min(1),
  consensus: BuildConsensus,
  updatedAt: z.string().datetime(),
});
export type CanonicalBuild = z.infer<typeof CanonicalBuild>;

/** Invariantes que Zod no puede expresar solo con tipos. */
export function assertBuildInvariants(build: CanonicalBuild): string[] {
  const errores: string[] = [];
  const ids = new Set(build.variants.map((v) => v.id));
  if (ids.size !== build.variants.length) {
    errores.push(`${build.id}: hay ids de variante repetidos`);
  }
  if (!ids.has(build.primaryVariantId)) {
    errores.push(`${build.id}: primaryVariantId "${build.primaryVariantId}" no esta en variants[]`);
  }
  if (build.consensus.variantCount !== build.variants.length) {
    errores.push(`${build.id}: consensus.variantCount no cuadra con variants.length`);
  }
  return errores;
}

/** Fila ligera del indice que consume el listado con facetas (objetivo: < 150 KB en total). */
export const BuildIndexRow = z.object({
  id: z.string(),
  classId: ClassId,
  classSlug: z.string(),
  title: z.string(),
  titleEn: z.string(),
  tierLabel: z.string().nullable(),
  pitTier: z.number().int().nullable(),
  content: z.array(ContentTag),
  sources: z.array(SourceSite),
  authors: z.array(z.string()),
  skills: z.array(z.string()),
  /** Slugs de icono paralelos a `skills` (skillIconSlug del nombre o su variante). */
  skillIcons: z.array(z.string()),
  hasMythic: z.boolean(),
  completeness: z.number(),
  season: z.number().int(),
  updatedAt: z.string().datetime(),
});
export type BuildIndexRow = z.infer<typeof BuildIndexRow>;

export const BuildIndex = z.object({
  generatedAt: z.string().datetime(),
  season: z.number().int(),
  patch: z.string(),
  count: z.number().int(),
  /**
   * De donde salieron estos datos. Los guardrails comparan contra la ejecucion anterior,
   * y una base 'fixture' (8 builds de prueba) no es una vara de medir valida para la
   * primera ingesta real (92): en ese caso se ignora como linea base. El default es
   * 'fixture' a proposito: un indice sin procedencia declarada (anterior a este campo)
   * no puede usarse como referencia.
   */
  origen: z.enum(['fixture', 'real']).default('fixture'),
  builds: z.array(BuildIndexRow),
});
export type BuildIndex = z.infer<typeof BuildIndex>;
