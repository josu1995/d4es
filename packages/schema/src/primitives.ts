import { z } from 'zod';

/**
 * Las 8 clases. `slug` es una decision de URL (no una traduccion), asi que vive aqui.
 * El NOMBRE en castellano NO vive aqui: sale de data/curated/clases.json con su
 * procedencia, igual que cualquier otro termino del juego.
 */
export const CLASSES = [
  { id: 'barbarian', slug: 'barbaro', enUS: 'Barbarian' },
  { id: 'druid', slug: 'druida', enUS: 'Druid' },
  { id: 'necromancer', slug: 'nigromante', enUS: 'Necromancer' },
  { id: 'paladin', slug: 'paladin', enUS: 'Paladin' },
  { id: 'rogue', slug: 'picaro', enUS: 'Rogue' },
  { id: 'sorcerer', slug: 'hechicero', enUS: 'Sorcerer' },
  { id: 'spiritborn', slug: 'espiritista', enUS: 'Spiritborn' },
  { id: 'warlock', slug: 'brujo', enUS: 'Warlock' },
] as const;

export type ClassMeta = (typeof CLASSES)[number];

export const CLASS_IDS = CLASSES.map((c) => c.id) as unknown as [string, ...string[]];
export const ClassId = z.enum(CLASS_IDS);
export type ClassId = (typeof CLASSES)[number]['id'];

const BY_EN: ReadonlyMap<string, ClassMeta> = new Map(CLASSES.map((c) => [c.enUS.toLowerCase(), c]));
const BY_ID: ReadonlyMap<string, ClassMeta> = new Map(CLASSES.map((c) => [c.id, c]));
const BY_SLUG: ReadonlyMap<string, ClassMeta> = new Map(CLASSES.map((c) => [c.slug, c]));

/** Traduce el nombre de clase que publica la fuente ("Barbarian") a nuestro id. */
export function classFromEnglish(name: string): ClassMeta | undefined {
  return BY_EN.get(name.trim().toLowerCase());
}
export function classById(id: string): ClassMeta | undefined {
  return BY_ID.get(id);
}
export function classBySlug(slug: string): ClassMeta | undefined {
  return BY_SLUG.get(slug);
}

export const SLOT_IDS = [
  'helm',
  'chest',
  'gloves',
  'pants',
  'boots',
  'amulet',
  'ring1',
  'ring2',
  'weapon',
  'offhand',
  'weapon2',
  'weapon3',
  'weapon4',
] as const;
export const SlotId = z.enum(SLOT_IDS);
export type SlotId = (typeof SLOT_IDS)[number];

export const SkillCategory = z.enum([
  'basic',
  'core',
  'defensive',
  'mobility',
  'mastery',
  'ultimate',
  'passive',
  'aura',
  'valor',
  'justice',
  'wrath',
  'dominance',
  'unknown',
]);
export type SkillCategory = z.infer<typeof SkillCategory>;

/** Para que sirve la build. Es la taxonomia por la que de verdad se busca en D4. */
export const ContentTag = z.enum([
  'leveling',
  'endgame',
  'pit',
  'echoing-hatred',
  'lair-boss',
  'infernal-hordes',
  'speedfarm',
  'hardcore',
  'ladder',
]);
export type ContentTag = z.infer<typeof ContentTag>;

export const SourceSite = z.enum(['d4builds', 'maxroll', 'own']);
export type SourceSite = z.infer<typeof SourceSite>;

/**
 * Envoltorio de verificacion. Cualquier dato que pueda cambiar con un parche lo lleva,
 * y la UI pinta un aviso visible cuando `estado !== 'verificado'`.
 */
export const Verificacion = z.object({
  estado: z.enum(['verificado', 'por-verificar', 'inferido', 'comunidad']),
  fuente: z.string().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  parche: z.string().min(1),
});
export type Verificacion = z.infer<typeof Verificacion>;
