import { z } from 'zod';

/**
 * Ficheros de josdemmers/Diablo4Companion (licencia MIT) que traen la localizacion
 * OFICIAL del juego. No hay `Skills.*.json`: ese hueco se cubre con data/curated.
 */
/**
 * Los ficheros NO son homogeneos, asi que cada uno declara con que campo se une el par
 * enUS/esES y de que campo sale el texto que se pinta:
 *  - Affixes no tiene `Name` (un afijo se describe, no se nombra) -> DescriptionClean.
 *  - ItemTypes no tiene `IdName` -> la clave es Type + Rarerity.
 */
export const COMPANION_FILES = [
  { file: 'Affixes', category: 'affix', keyFields: ['IdName'], nameField: 'DescriptionClean' },
  { file: 'Aspects', category: 'aspect', keyFields: ['IdName'], nameField: 'Name' },
  { file: 'Uniques', category: 'unique', keyFields: ['IdName'], nameField: 'Name' },
  { file: 'Runes', category: 'rune', keyFields: ['IdName'], nameField: 'Name' },
  { file: 'ParagonGlyphs', category: 'glyph', keyFields: ['IdName'], nameField: 'Name' },
  { file: 'ParagonBoards', category: 'paragonBoard', keyFields: ['IdName'], nameField: 'Name' },
  { file: 'ItemTypes', category: 'itemType', keyFields: ['Type', 'Rarerity'], nameField: 'Name' },
] as const;

export type CompanionFileSpec = (typeof COMPANION_FILES)[number];

export const COMPANION_REPO = 'josdemmers/Diablo4Companion';
export const COMPANION_DATA_PATH = 'D4Companion/Data';

/**
 * Forma de una entrada de Companion: un registro suelto. No imponemos campos porque cada
 * fichero tiene los suyos; lo que se necesita se extrae segun la spec del fichero.
 */
export const CompanionFile = z.array(z.record(z.string(), z.unknown()));
export type CompanionRow = Record<string, unknown>;

export interface DictionaryEntry {
  idName: string;
  sno: number | null;
  category: string;
  en: string;
  es: string;
  source: 'd4companion' | 'wowhead-es' | 'curated';
}

export interface DictionaryMeta {
  generatedAt: string;
  sourceRepo: string;
  /** Commit exacto de Diablo4Companion usado. Se publica en /creditos. */
  sourceSha: string;
  counts: Record<string, number>;
  curatedCounts: Record<string, number>;
}

export interface Dictionary {
  meta: DictionaryMeta;
  /** clave: `${category}:${idName}` */
  byIdName: Record<string, DictionaryEntry>;
  /** clave: `${category}:${normalizeName(en)}` — la via real, porque las fuentes dan ingles */
  byEnglish: Record<string, DictionaryEntry>;
}

/** Normalizacion para comparar nombres en ingles entre fuentes distintas. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Entrada curada a mano (el hueco de las habilidades). La procedencia es obligatoria:
 * sin `sourceUrl` y `verifiedAt` la entrada no valida y no entra en el diccionario.
 */
export const CuratedEntry = z.object({
  en: z.string().min(1),
  es: z.string().min(1),
  category: z.string().min(1),
  idName: z.string().min(1).optional(),
  sno: z.number().int().positive().nullable().optional(),
  source: z.enum(['wowhead-es', 'curated']),
  sourceUrl: z.string().url(),
  verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  verifiedBy: z.string().min(1),
});
export type CuratedEntry = z.infer<typeof CuratedEntry>;

export const CuratedFile = z.object({
  /** Entradas pendientes de traducir. Se listan para que se vean, no se inventan. */
  pendientes: z.array(z.object({ en: z.string(), category: z.string() })).default([]),
  entradas: z.array(CuratedEntry).default([]),
});
export type CuratedFile = z.infer<typeof CuratedFile>;
