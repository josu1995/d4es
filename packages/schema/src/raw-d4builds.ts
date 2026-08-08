import { z } from 'zod';

/**
 * Esquema LAXO del JSON crudo de d4builds. Es `.passthrough()` a proposito: la fuente puede
 * añadir campos sin romper la ingesta, y el drift se detecta aparte con el fingerprint de
 * forma (ver apps/scraper/src/pipeline/fingerprint.ts), no rechazando datos.
 *
 * Endpoint verificado el 8-ago-2026:
 *   https://d4builds.gg/page-data/index/page-data.json      (catalogo, ~794 KB, 92 builds)
 *   https://d4builds.gg/page-data/tierlist/page-data.json   (tier list)
 */

export const RawD4BuildsSkill = z
  .object({
    name: z.string(),
    rank: z.number().nullable().optional(),
    spec: z.boolean().nullable().optional(),
    rune: z.array(z.string()).nullable().optional(),
    specialUrl: z.string().nullable().optional(),
    recolorUrl: z.string().nullable().optional(),
  })
  .passthrough();
export type RawD4BuildsSkill = z.infer<typeof RawD4BuildsSkill>;

export const RawD4BuildsEntry = z
  .object({
    name: z.string(),
    seo_url: z.string(),
    seo_name: z.string().nullable().optional(),
    class: z.string(),
    content: z.string().nullable().optional(),
    tier: z.number().nullable().optional(),
    season: z.number().nullable().optional(),
    pit: z.number().nullable().optional(),
    cc: z.string().nullable().optional(),
    buildid: z.string().nullable().optional(),
    skills: z.array(RawD4BuildsSkill).nullable().optional(),
  })
  .passthrough();
export type RawD4BuildsEntry = z.infer<typeof RawD4BuildsEntry>;

export const RawD4BuildsCatalog = z
  .object({
    result: z
      .object({
        pageContext: z
          .object({
            builds: z.array(RawD4BuildsEntry),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();
export type RawD4BuildsCatalog = z.infer<typeof RawD4BuildsCatalog>;

export const RawD4BuildsTierRow = z
  .object({
    build: z.string(),
    class: z.string(),
    link2: z.string().nullable().optional(),
  })
  .passthrough();

export const RawD4BuildsTierList = z
  .object({
    result: z
      .object({
        pageContext: z
          .object({
            tierListData: z.array(RawD4BuildsTierRow),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();
export type RawD4BuildsTierList = z.infer<typeof RawD4BuildsTierList>;

/** El tier list guarda la letra en una columna con el nombre del contenido ("Endgame": "S"). */
export function tierLabelFromRow(row: Record<string, unknown>): string | null {
  for (const clave of ['Endgame', 'Leveling', 'Speedfarm', 'Bossing']) {
    const v = row[clave];
    if (typeof v === 'string' && /^[SABCDF]\+?$/.test(v.trim())) return v.trim();
  }
  return null;
}
