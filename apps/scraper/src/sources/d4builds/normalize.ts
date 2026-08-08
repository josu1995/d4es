import {
  CanonicalBuild,
  MAX_SKILL_RANK,
  classFromEnglish,
  computeCompletenessScore,
  computeConsensus,
  correlationKey,
  pickPrimaryVariant,
  slugify,
  tierLabelFromRow,
  type BuildVariant,
  type ContentTag,
  type GameRef,
  type RawD4BuildsCatalog,
  type RawD4BuildsEntry,
  type RawD4BuildsTierList,
  type SkillEntry,
} from '@d4es/schema';
import { Resolver, normalizeName } from '@d4es/i18n';
import type { EstadoJuego } from '../../estado-juego.js';
import { hashOf } from '../../util/stable-json.js';

export interface NormalizeInput {
  catalog: RawD4BuildsCatalog;
  tierList: RawD4BuildsTierList | null;
  resolver: Resolver;
  /** Cuando cambio el contenido del snapshot. NO es "ahora": normalize es determinista. */
  capturedAt: string;
  estado: EstadoJuego;
}

export interface NormalizeOutput {
  builds: CanonicalBuild[];
  /** Ningun elemento del origen se descarta en silencio: todo lo omitido aparece aqui. */
  avisos: string[];
}

const CONTENT_MAP: Record<string, ContentTag> = {
  endgame: 'endgame',
  leveling: 'leveling',
  speedfarm: 'speedfarm',
  speedfarming: 'speedfarm',
  bossing: 'lair-boss',
  hardcore: 'hardcore',
  pit: 'pit',
};

function contentTags(content: string | null | undefined): ContentTag[] {
  if (!content) return [];
  const tag = CONTENT_MAP[content.trim().toLowerCase()];
  return tag ? [tag] : [];
}

function tierIndex(tierList: RawD4BuildsTierList | null): Map<string, string> {
  const mapa = new Map<string, string>();
  if (!tierList) return mapa;
  for (const row of tierList.result.pageContext.tierListData) {
    const label = tierLabelFromRow(row as unknown as Record<string, unknown>);
    if (label) mapa.set(`${normalizeName(row.class)}::${normalizeName(row.build)}`, label);
  }
  return mapa;
}

function normalizarHabilidades(entry: RawD4BuildsEntry, resolver: Resolver, avisos: string[]): SkillEntry[] {
  const salida: SkillEntry[] = [];
  const skills = entry.skills ?? [];
  for (const [i, s] of skills.entries()) {
    // 0 = en la barra sin puntos (la otorga el equipo). Lo publica asi la fuente.
    const rank = s.rank ?? 0;
    if (rank < 0 || rank > MAX_SKILL_RANK) {
      // No se recorta en silencio: si la fuente publica un rango fuera de rango,
      // queremos enterarnos, porque suele significar que el juego ha cambiado.
      avisos.push(
        `${entry.seo_url}: habilidad "${s.name}" con rango ${rank} fuera de [0, ${MAX_SKILL_RANK}] — omitida`,
      );
      continue;
    }
    salida.push({
      ref: resolver.resolve('skill', s.name),
      order: i,
      rank,
      skillVariant: s.specialUrl ? resolver.resolve('skillVariant', s.specialUrl) : null,
      runes: (s.rune ?? []).slice(0, 3).map((r) => resolver.resolve('rune', r)),
      category: 'unknown',
    });
  }
  return salida;
}

/**
 * La skill que da nombre a la build suele ser la principal ("Charge", "Ball Lightning").
 * Es una señal mucho mejor que el rango, porque el catalogo no publica la categoria.
 */
function elegirPrincipal(entry: RawD4BuildsEntry, skills: readonly SkillEntry[]): GameRef | null {
  if (skills.length === 0) return null;
  const objetivo = normalizeName(entry.name);
  const porNombre = skills.find((s) => normalizeName(s.ref.enUS) === objetivo);
  if (porNombre) return porNombre.ref;
  const porRango = [...skills].sort(
    (a, b) => b.rank - a.rank || a.order - b.order || a.ref.idName.localeCompare(b.ref.idName),
  )[0];
  return porRango?.ref ?? null;
}

export function normalizeD4BuildsCatalog(input: NormalizeInput): NormalizeOutput {
  const avisos: string[] = [];
  const tiers = tierIndex(input.tierList);
  const builds: CanonicalBuild[] = [];
  const vistos = new Set<string>();

  for (const entry of input.catalog.result.pageContext.builds) {
    const clase = classFromEnglish(entry.class);
    if (!clase) {
      avisos.push(`${entry.seo_url}: clase desconocida "${entry.class}" — build omitida`);
      continue;
    }
    const id = slugify(entry.seo_url);
    if (id === '') {
      avisos.push(`build sin seo_url utilizable ("${entry.name}") — omitida`);
      continue;
    }
    if (vistos.has(id)) {
      avisos.push(`${id}: id repetido en el catalogo de origen — se queda la primera`);
      continue;
    }
    vistos.add(id);

    const skills = normalizarHabilidades(entry, input.resolver, avisos);
    const principal = elegirPrincipal(entry, skills);
    const externalId = entry.buildid ?? entry.seo_url;
    const esLeveling = (entry.content ?? '').trim().toLowerCase() === 'leveling';

    const flags = {
      hasSkills: skills.length > 0,
      // El catalogo de d4builds no publica equipo ni paragon: eso llega en la fase de
      // Playwright. Se declara honestamente para que la ficha lo diga.
      hasGear: false,
      hasParagon: false,
      hasTalisman: false,
      hasMercenary: false,
      hasWarPlan: false,
    };

    const variante: BuildVariant = {
      id: `d4builds:${externalId}:0`,
      source: {
        site: 'd4builds',
        externalId,
        variantIndex: 0,
        variantLabel: entry.content ?? null,
        url: `https://d4builds.gg/builds/${entry.seo_url}/`,
        author: entry.cc ?? null,
        capturedAt: input.capturedAt,
        snapshotHash: hashOf(entry),
        provenance: 'server-scrape',
      },
      levelBand: esLeveling ? 'leveling' : 'endgame',
      skills,
      gear: {},
      paragon: { level: null, boards: [] },
      talisman: null,
      runewords: [],
      mercenary: null,
      warPlan: null,
      completeness: { ...flags, score: computeCompletenessScore(flags) },
    };

    const tituloEs = principal?.esES ?? null;
    const build: CanonicalBuild = {
      id,
      correlationKey: correlationKey(clase.id, principal?.idName ?? null, null),
      classId: clase.id,
      title: {
        es: tituloEs ?? entry.name,
        en: entry.name,
      },
      summary: { es: null, en: null },
      tags: { playstyle: [], content: contentTags(entry.content), element: [] },
      ratings: {
        tierLabel: tiers.get(`${normalizeName(entry.class)}::${normalizeName(entry.name)}`) ?? null,
        tierRank: entry.tier ?? null,
        pitTier: entry.pit ?? null,
      },
      gameVersion: {
        patch: input.estado.parche,
        season: entry.season ?? input.estado.temporadaActual,
      },
      variants: [variante],
      primaryVariantId: pickPrimaryVariant([variante]).id,
      consensus: computeConsensus([variante]),
      updatedAt: input.capturedAt,
    };

    const parsed = CanonicalBuild.safeParse(build);
    if (!parsed.success) {
      avisos.push(`${id}: no valida contra el esquema canonico — ${parsed.error.issues[0]?.message}`);
      continue;
    }
    builds.push(parsed.data);
  }

  builds.sort((a, b) => a.id.localeCompare(b.id));
  return { builds, avisos };
}
