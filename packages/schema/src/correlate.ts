import type { BuildVariant, GearItem, SkillEntry } from './build.js';
import type { GameRef } from './gameref.js';

/** >= AUTO se agrupa solo. Entre REVIEW y AUTO va a revision humana. < REVIEW se descarta. */
export const MATCH_AUTO_THRESHOLD = 0.9;
export const MATCH_REVIEW_THRESHOLD = 0.65;

const STOPWORDS = new Set([
  'build',
  'guide',
  'endgame',
  'leveling',
  'season',
  'the',
  'of',
  'and',
  'de',
  'del',
  'la',
  'el',
  'y',
  'guia',
  'temporada',
]);

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function normalizeTitle(title: string): string[] {
  return slugify(title)
    .split('-')
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/** Categorias que definen "de que va" la build. Las defensivas y de movilidad no cuentan. */
const PRIMARY_CATEGORIES = new Set(['core', 'ultimate', 'mastery', 'wrath']);

/**
 * Skill principal: la de mayor rango entre las categorias que definen la build.
 * Los empates se rompen de forma determinista (nunca por orden de llegada).
 */
export function pickPrimarySkill(skills: readonly SkillEntry[]): SkillEntry | undefined {
  const candidatas = skills.filter((s) => PRIMARY_CATEGORIES.has(s.category));
  const pool = candidatas.length > 0 ? candidatas : skills;
  if (pool.length === 0) return undefined;
  return [...pool].sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    if (a.order !== b.order) return a.order - b.order;
    return a.ref.idName.localeCompare(b.ref.idName);
  })[0];
}

export function skillIdNames(variant: BuildVariant): string[] {
  return variant.skills.map((s) => s.ref.idName).sort();
}

export function uniqueIdNames(variant: BuildVariant): string[] {
  const out: string[] = [];
  for (const item of Object.values(variant.gear) as GearItem[]) {
    if (item?.item && item.quality === 'unique') out.push(item.item.idName);
  }
  return out.sort();
}

export function correlationKey(
  classId: string,
  primarySkillIdName: string | null,
  archetype: string | null,
): string {
  return `${classId}::${primarySkillIdName ?? 'unknown'}::${archetype ?? 'generic'}`;
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export interface MatchInput {
  classId: string;
  title: string;
  skills: readonly string[];
  uniques: readonly string[];
  primarySkill: string | null;
}

/**
 * Cuanto se parecen dos builds de fuentes distintas. Solo tiene sentido dentro de la
 * misma clase: entre clases distintas devuelve 0 siempre.
 */
export function matchScore(a: MatchInput, b: MatchInput): number {
  if (a.classId !== b.classId) return 0;
  const skills = jaccard(a.skills, b.skills);
  const primary = a.primarySkill !== null && a.primarySkill === b.primarySkill ? 1 : 0;
  const uniques = jaccard(a.uniques, b.uniques);
  const title = jaccard(normalizeTitle(a.title), normalizeTitle(b.title));
  return round4(0.45 * skills + 0.2 * primary + 0.25 * uniques + 0.1 * title);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export type MatchVerdict = 'auto' | 'review' | 'reject';

export function classifyMatch(score: number): MatchVerdict {
  if (score >= MATCH_AUTO_THRESHOLD) return 'auto';
  if (score >= MATCH_REVIEW_THRESHOLD) return 'review';
  return 'reject';
}

// --- Consenso y diff entre variantes -------------------------------------------------

export interface ConsensusFieldOut {
  key: string;
  status: 'agree' | 'differ' | 'only-in';
  label: GameRef | null;
  values: Record<string, string | number | null>;
}

/**
 * Compara las variantes campo a campo. NO fusiona nada: solo dice en que coinciden y en
 * que no, que es lo que alimenta el bloque de consenso y la vista de comparacion.
 */
export function computeConsensus(variants: readonly BuildVariant[]): {
  variantCount: number;
  coreSkills: GameRef[];
  coreUniques: GameRef[];
  fields: ConsensusFieldOut[];
} {
  const n = variants.length;
  const fields: ConsensusFieldOut[] = [];

  // Habilidades: clave = idName, valor = rango en cada variante.
  const skillRefs = new Map<string, GameRef>();
  const skillRanks = new Map<string, Map<string, number>>();
  for (const v of variants) {
    for (const s of v.skills) {
      skillRefs.set(s.ref.idName, s.ref);
      if (!skillRanks.has(s.ref.idName)) skillRanks.set(s.ref.idName, new Map());
      skillRanks.get(s.ref.idName)!.set(v.id, s.rank);
    }
  }
  const coreSkills: GameRef[] = [];
  for (const [idName, porVariante] of [...skillRanks.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const values: Record<string, string | number | null> = {};
    for (const v of variants) values[v.id] = porVariante.get(v.id) ?? null;
    const presentes = porVariante.size;
    const rangos = new Set(porVariante.values());
    let status: ConsensusFieldOut['status'];
    if (presentes < n) status = 'only-in';
    else if (rangos.size > 1) status = 'differ';
    else status = 'agree';
    if (presentes === n) coreSkills.push(skillRefs.get(idName)!);
    fields.push({ key: `skill:${idName}`, status, label: skillRefs.get(idName) ?? null, values });
  }

  // Unicos por slot.
  const uniqueRefs = new Map<string, GameRef>();
  const uniquesPorVariante = new Map<string, Set<string>>();
  for (const v of variants) {
    const set = new Set<string>();
    for (const item of Object.values(v.gear) as GearItem[]) {
      if (item?.item && item.quality === 'unique') {
        set.add(item.item.idName);
        uniqueRefs.set(item.item.idName, item.item);
      }
    }
    uniquesPorVariante.set(v.id, set);
  }
  const coreUniques: GameRef[] = [];
  for (const [idName, ref] of [...uniqueRefs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const values: Record<string, string | number | null> = {};
    let presentes = 0;
    for (const v of variants) {
      const tiene = uniquesPorVariante.get(v.id)?.has(idName) ?? false;
      values[v.id] = tiene ? 'si' : null;
      if (tiene) presentes++;
    }
    const status = presentes === n ? 'agree' : 'only-in';
    if (presentes === n) coreUniques.push(ref);
    fields.push({ key: `unique:${idName}`, status, label: ref, values });
  }

  // Glifos y su rango.
  const glyphRefs = new Map<string, GameRef>();
  // El rango puede ser null si la fuente publica el glifo pero no su nivel; en el
  // consenso eso se representa con 'presente', que basta para decir si coinciden.
  const glyphRanks = new Map<string, Map<string, number | string>>();
  for (const v of variants) {
    for (const b of v.paragon.boards) {
      if (!b.glyph) continue;
      glyphRefs.set(b.glyph.ref.idName, b.glyph.ref);
      if (!glyphRanks.has(b.glyph.ref.idName)) glyphRanks.set(b.glyph.ref.idName, new Map());
      glyphRanks.get(b.glyph.ref.idName)!.set(v.id, b.glyph.rank ?? 'presente');
    }
  }
  for (const [idName, porVariante] of [...glyphRanks.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const values: Record<string, string | number | null> = {};
    for (const v of variants) values[v.id] = porVariante.get(v.id) ?? null;
    const status: ConsensusFieldOut['status'] =
      porVariante.size < n ? 'only-in' : new Set(porVariante.values()).size > 1 ? 'differ' : 'agree';
    fields.push({ key: `glyph:${idName}`, status, label: glyphRefs.get(idName) ?? null, values });
  }

  return { variantCount: n, coreSkills, coreUniques, fields };
}

export interface DiffSection {
  section: 'skills' | 'gear' | 'paragon';
  rows: ConsensusFieldOut[];
}

/** El diff de la vista `/comparar`: solo las filas donde hay algo que mirar. */
export function computeDiff(a: BuildVariant, b: BuildVariant): DiffSection[] {
  const { fields } = computeConsensus([a, b]);
  const interesantes = fields.filter((f) => f.status !== 'agree');
  return [
    { section: 'skills', rows: interesantes.filter((f) => f.key.startsWith('skill:')) },
    { section: 'gear', rows: interesantes.filter((f) => f.key.startsWith('unique:')) },
    { section: 'paragon', rows: interesantes.filter((f) => f.key.startsWith('glyph:')) },
  ];
}

/**
 * Que variante se enseña por defecto: la mas completa, con desempate por recencia y,
 * a igualdad, a favor de la fuente con licencia mas limpia (d4builds antes que BYOL).
 */
const SITE_PREFERENCE: Record<string, number> = { own: 3, d4builds: 2, maxroll: 1 };

export function pickPrimaryVariant(variants: readonly BuildVariant[]): BuildVariant {
  const ordenadas = [...variants].sort((x, y) => {
    if (y.completeness.score !== x.completeness.score) return y.completeness.score - x.completeness.score;
    const px = SITE_PREFERENCE[x.source.site] ?? 0;
    const py = SITE_PREFERENCE[y.source.site] ?? 0;
    if (py !== px) return py - px;
    const tx = Date.parse(x.source.capturedAt);
    const ty = Date.parse(y.source.capturedAt);
    if (ty !== tx) return ty - tx;
    return x.id.localeCompare(y.id);
  });
  return ordenadas[0]!;
}

/** Pesos de completitud. Skills y gear son lo que de verdad hace util a una build. */
export function computeCompletenessScore(flags: {
  hasSkills: boolean;
  hasGear: boolean;
  hasParagon: boolean;
  hasTalisman: boolean;
  hasMercenary: boolean;
  hasWarPlan: boolean;
}): number {
  const pesos = {
    hasSkills: 0.35,
    hasGear: 0.3,
    hasParagon: 0.2,
    hasTalisman: 0.05,
    hasMercenary: 0.05,
    hasWarPlan: 0.05,
  } as const;
  let total = 0;
  for (const [k, peso] of Object.entries(pesos)) {
    if (flags[k as keyof typeof flags]) total += peso;
  }
  return Math.round(total * 100) / 100;
}
