import { z } from 'zod';

/**
 * De donde sale una traduccion al castellano. NO existe 'machine' ni 'llm' a proposito:
 * el sistema de tipos hace imposible expresar una traduccion inventada.
 */
export const I18nSource = z.enum(['d4companion', 'wowhead-es', 'curated', 'none']);
export type I18nSource = z.infer<typeof I18nSource>;

export const GameRefCategory = z.enum([
  'skill',
  'skillVariant',
  'rune',
  'runeword',
  'affix',
  'aspect',
  'unique',
  'itemType',
  'paragonBoard',
  'glyph',
  'charm',
  'seal',
  'mercenary',
  'warPlanNode',
  'boss',
  'material',
  'class',
]);
export type GameRefCategory = z.infer<typeof GameRefCategory>;

/**
 * Toda referencia al juego pasa por aqui. `enUS` siempre esta; `esES` es null cuando no
 * tenemos traduccion verificada, y en ese caso la UI pinta el ingles con un chip "EN".
 */
export const GameRef = z
  .object({
    idName: z.string().min(1),
    sno: z.number().int().positive().nullable(),
    category: GameRefCategory,
    enUS: z.string().min(1),
    esES: z.string().min(1).nullable(),
    i18n: I18nSource,
  })
  .superRefine((v, ctx) => {
    const traducido = v.esES !== null;
    const tieneProcedencia = v.i18n !== 'none';
    if (traducido !== tieneProcedencia) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: traducido
          ? `GameRef "${v.idName}": tiene traduccion al castellano pero i18n === 'none' (traduccion sin procedencia)`
          : `GameRef "${v.idName}": declara procedencia "${v.i18n}" pero esES es null`,
        path: ['esES'],
      });
    }
  });

export type GameRef = z.infer<typeof GameRef>;

/** Referencia sin traduccion verificada. Es el estado por defecto y es legitimo. */
export function untranslatedRef(input: {
  idName: string;
  category: GameRefCategory;
  enUS: string;
  sno?: number | null;
}): GameRef {
  return {
    idName: input.idName,
    sno: input.sno ?? null,
    category: input.category,
    enUS: input.enUS,
    esES: null,
    i18n: 'none',
  };
}

/** Referencia traducida. Exige declarar de donde sale la traduccion. */
export function translatedRef(input: {
  idName: string;
  category: GameRefCategory;
  enUS: string;
  esES: string;
  i18n: Exclude<I18nSource, 'none'>;
  sno?: number | null;
}): GameRef {
  return {
    idName: input.idName,
    sno: input.sno ?? null,
    category: input.category,
    enUS: input.enUS,
    esES: input.esES,
    i18n: input.i18n,
  };
}

/** Lo que hay que pintar en pantalla. */
export function display(ref: GameRef): string {
  return ref.esES ?? ref.enUS;
}

export function isUntranslated(ref: GameRef): boolean {
  return ref.esES === null;
}
