import { z } from 'zod';
import { GameRef } from './gameref.js';
import { ClassId, ContentTag, SkillCategory, SlotId, SourceSite } from './primitives.js';
import { MAX_CHARMS, MAX_GLYPH_RANK, MAX_PARAGON_BOARDS, MAX_SKILL_BAR, MAX_SKILL_RANK } from './constants.js';

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
  rank: z.number().int().min(1).max(MAX_SKILL_RANK),
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
});
export type GearItem = z.infer<typeof GearItem>;

export const ParagonBoard = z.object({
  ref: GameRef,
  order: z.number().int().min(0),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).nullable(),
  glyph: z
    .object({
      ref: GameRef,
      rank: z.number().int().min(1).max(MAX_GLYPH_RANK),
    })
    .nullable(),
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
  warPlan: z
    .object({
      route: z.array(GameRef).max(5),
      trees: z.array(z.object({ ref: GameRef, nodes: z.array(GameRef) })).max(7),
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
  builds: z.array(BuildIndexRow),
});
export type BuildIndex = z.infer<typeof BuildIndex>;
