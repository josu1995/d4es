import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  BuildIndex,
  CanonicalBuild,
  MATCH_AUTO_THRESHOLD,
  MATCH_REVIEW_THRESHOLD,
  assertBuildInvariants,
  classifyMatch,
  matchScore,
  pickPrimarySkill,
  type MatchInput,
} from '@d4es/schema';
import { PATHS } from '../paths.js';
import { readJsonIfExists, stableStringify, writeIfChanged } from '../util/stable-json.js';

export interface VerifyResultado {
  ok: boolean;
  builds: number;
  errores: string[];
  avisos: string[];
}

async function leerBuilds(): Promise<{ path: string; raw: unknown }[]> {
  if (!existsSync(PATHS.canonicalBuilds)) return [];
  const entradas = await readdir(PATHS.canonicalBuilds, { withFileTypes: true, recursive: true });
  const salida: { path: string; raw: unknown }[] = [];
  for (const e of entradas) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    const path = join(e.parentPath ?? e.path, e.name);
    salida.push({ path, raw: JSON.parse(await readFile(path, 'utf8')) });
  }
  return salida;
}

export async function runVerify(): Promise<VerifyResultado> {
  const errores: string[] = [];
  const avisos: string[] = [];
  const ficheros = await leerBuilds();
  const builds: CanonicalBuild[] = [];

  for (const { path, raw } of ficheros) {
    const parsed = CanonicalBuild.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues.slice(0, 3)) {
        errores.push(`${path}: ${issue.path.join('.')} — ${issue.message}`);
      }
      continue;
    }
    builds.push(parsed.data);
    errores.push(...assertBuildInvariants(parsed.data).map((e) => `${path}: ${e}`));
  }

  const indice = await readJsonIfExists<unknown>(PATHS.buildIndex);
  if (indice === null) {
    errores.push(`falta ${PATHS.buildIndex}`);
  } else {
    const parsed = BuildIndex.safeParse(indice);
    if (!parsed.success) {
      errores.push(`index.json no valida: ${parsed.error.issues[0]?.message}`);
    } else {
      if (parsed.data.count !== builds.length) {
        errores.push(`index.json dice ${parsed.data.count} builds pero hay ${builds.length} ficheros`);
      }
      const idsIndice = new Set(parsed.data.builds.map((b) => b.id));
      for (const b of builds) {
        if (!idsIndice.has(b.id)) errores.push(`${b.id}: esta en disco pero no en index.json`);
      }
    }
  }

  // Auditoria de traducciones: ninguna puede llevar castellano sin declarar procedencia.
  let refs = 0;
  let sinTraducir = 0;
  for (const b of builds) {
    for (const v of b.variants) {
      for (const s of v.skills) {
        for (const ref of [s.ref, s.skillVariant, ...s.runes]) {
          if (!ref) continue;
          refs++;
          if (ref.esES === null) sinTraducir++;
          if (ref.esES !== null && ref.i18n === 'none') {
            errores.push(`${b.id}: "${ref.idName}" tiene traduccion sin procedencia`);
          }
        }
      }
    }
  }
  if (refs > 0) {
    const pct = (sinTraducir / refs) * 100;
    avisos.push(`terminos sin traduccion verificada: ${sinTraducir}/${refs} (${pct.toFixed(1)}%)`);
  }

  return { ok: errores.length === 0, builds: builds.length, errores, avisos };
}

/**
 * Busca builds que sean la misma cosa en fuentes distintas. Con una sola fuente no
 * encuentra nada, pero deja el informe listo para cuando entre maxroll via BYOL.
 */
export async function runCorrelate(): Promise<{ candidatos: number; auto: number }> {
  const ficheros = await leerBuilds();
  const builds = ficheros
    .map((f) => CanonicalBuild.safeParse(f.raw))
    .filter((r): r is { success: true; data: CanonicalBuild } => r.success)
    .map((r) => r.data);

  const entradas = builds.map((b) => {
    const principal = b.variants.flatMap((v) => v.skills);
    return {
      build: b,
      input: {
        classId: b.classId,
        title: b.title.en,
        skills: [...new Set(principal.map((s) => s.ref.idName))].sort(),
        uniques: [],
        primarySkill: pickPrimarySkill(principal)?.ref.idName ?? null,
      } satisfies MatchInput,
    };
  });

  const candidatos: { a: string; b: string; score: number; veredicto: string }[] = [];
  let auto = 0;
  for (let i = 0; i < entradas.length; i++) {
    for (let j = i + 1; j < entradas.length; j++) {
      const x = entradas[i]!;
      const y = entradas[j]!;
      // Solo tiene sentido correlacionar entre FUENTES distintas: dos builds de la misma
      // fuente que se parecen son variantes legitimas, no duplicados.
      const fuentesX = new Set(x.build.variants.map((v) => v.source.site));
      const fuentesY = new Set(y.build.variants.map((v) => v.source.site));
      if ([...fuentesX].every((s) => fuentesY.has(s))) continue;

      const score = matchScore(x.input, y.input);
      const veredicto = classifyMatch(score);
      if (veredicto === 'reject') continue;
      if (veredicto === 'auto') auto++;
      candidatos.push({ a: x.build.id, b: y.build.id, score, veredicto });
    }
  }

  candidatos.sort((p, q) => q.score - p.score || p.a.localeCompare(q.a));
  await writeIfChanged(
    join(PATHS.reports, 'match-candidates.json'),
    stableStringify({
      umbrales: { auto: MATCH_AUTO_THRESHOLD, revision: MATCH_REVIEW_THRESHOLD },
      nota: 'Los candidatos en revision NO se agrupan solos: confirmalos en data/curated/correlations.json',
      candidatos,
    }),
  );
  return { candidatos: candidatos.length, auto };
}
