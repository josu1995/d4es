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
  { file: 'Affixes', category: 'affix', keyFields: ['IdName'], nameField: 'DescriptionClean', descField: null },
  { file: 'Aspects', category: 'aspect', keyFields: ['IdName'], nameField: 'Name', descField: 'DescriptionClean' },
  { file: 'Uniques', category: 'unique', keyFields: ['IdName'], nameField: 'Name', descField: 'DescriptionClean' },
  { file: 'Runes', category: 'rune', keyFields: ['IdName'], nameField: 'Name', descField: 'DescriptionClean' },
  { file: 'ParagonGlyphs', category: 'glyph', keyFields: ['IdName'], nameField: 'Name', descField: null },
  { file: 'ParagonBoards', category: 'paragonBoard', keyFields: ['IdName'], nameField: 'Name', descField: null },
  { file: 'ItemTypes', category: 'itemType', keyFields: ['Type', 'Rarerity'], nameField: 'Name', descField: null },
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
  /** Descripcion del poder, en castellano, para unicos, aspectos y runas. */
  desc?: string;
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

/**
 * Convierte el campo `Localisation` de Companion en texto legible.
 *
 * Ese campo trae el texto oficial del juego con su marcado interno: etiquetas de color
 * ({c_important}...{/c}), condicionales ({if:...}...{/if}) y expresiones de valor
 * ([Affix_Value_1*100|x%|]). El campo `DescriptionClean` ya viene limpio, pero se come
 * los valores y deja frases rotas ("inflige un mas de dano"), asi que aqui se limpia el
 * marcado conservando el formato del valor, que es justo lo que hace falta entender.
 */
export function limpiarLocalisation(texto: string): string {
  return (
    texto
      // Expresiones de valor. Pueden ser simples ([Affix_Value_1*100|x%|]) o formulas
      // enteras con parentesis y sin formato. En ambos casos el numero concreto depende
      // del objeto, asi que se sustituye por un marcador legible que conserva SI el
      // bonus es porcentual, que es la parte que de verdad importa entender.
      .replace(/\[([^\]]*)\]/g, (_, interior: string) => {
        const partes = interior.split('|');
        const formato = partes.length >= 2 ? (partes[partes.length - 2] ?? '').trim() : '';
        return formato.includes('%') ? 'X%' : 'X';
      })
      // Condicionales y etiquetas de color/estilo del marcado interno del juego.
      .replace(/\{if:[^}]*\}/gi, '')
      .replace(/\{else\}/gi, '')
      .replace(/\{\/?[a-z_][^}]*\}/gi, '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([.,;:!?])/g, '$1')
      .trim()
  );
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
  /** Descripcion en castellano, tal como la publica la ficha de la fuente. */
  desc: z.string().min(1).optional(),
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
