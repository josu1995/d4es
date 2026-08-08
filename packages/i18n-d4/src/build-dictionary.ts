import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMPANION_FILES,
  COMPANION_REPO,
  CompanionFile,
  CuratedFile,
  type CompanionFileSpec,
  type CompanionRow,
  type Dictionary,
  type DictionaryEntry,
  normalizeName,
} from './types.js';

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

/** Clave de union entre el fichero ingles y el espanol, segun la spec del fichero. */
function claveDe(fila: CompanionRow, spec: CompanionFileSpec): string | null {
  const partes: string[] = [];
  for (const campo of spec.keyFields) {
    const v = fila[campo];
    if (typeof v !== 'string' || v === '') return null;
    partes.push(v);
  }
  return partes.join('|');
}

/** Texto que se pinta. En los afijos es la descripcion, porque no tienen nombre. */
function textoDe(fila: CompanionRow, spec: CompanionFileSpec): string | null {
  const v = fila[spec.nameField];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function snoOf(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Compila el diccionario. La clave del asunto: se cargan los ficheros enUS Y esES y se
 * unen por IdName. Eso produce un mapa ingles -> castellano, que es lo que hace falta
 * porque d4builds publica NOMBRES EN INGLES, no IdNames del juego.
 */
export async function buildDictionary(opts: {
  vendorDir: string;
  curatedFiles: string[];
  now: Date;
}): Promise<Dictionary> {
  const byIdName: Record<string, DictionaryEntry> = {};
  const byEnglish: Record<string, DictionaryEntry> = {};
  const counts: Record<string, number> = {};
  const curatedCounts: Record<string, number> = {};

  let sha = 'desconocido';
  const sourcePath = join(opts.vendorDir, '_source.json');
  if (existsSync(sourcePath)) {
    const src = (await readJson(sourcePath)) as { sha?: string };
    if (src.sha) sha = src.sha;
  }

  for (const spec of COMPANION_FILES) {
    const { file, category } = spec;
    const esPath = join(opts.vendorDir, `${file}.esES.json`);
    const enPath = join(opts.vendorDir, `${file}.enUS.json`);
    if (!existsSync(esPath) || !existsSync(enPath)) {
      process.stderr.write(`  aviso: falta ${file} en vendor/, se omite (ejecuta i18n:sync)\n`);
      continue;
    }

    const es = CompanionFile.parse(await readJson(esPath));
    const en = CompanionFile.parse(await readJson(enPath));
    const enPorClave = new Map<string, string>();
    for (const fila of en) {
      const clave = claveDe(fila, spec);
      const nombre = textoDe(fila, spec);
      if (clave && nombre && !enPorClave.has(clave)) enPorClave.set(clave, nombre);
    }

    let n = 0;
    for (const fila of es) {
      const clave = claveDe(fila, spec);
      const nombreEs = textoDe(fila, spec);
      if (!clave || !nombreEs) continue;
      const nombreEn = enPorClave.get(clave);
      // Sin el nombre en ingles no se puede casar lo que publica la fuente: se descarta.
      if (!nombreEn) continue;

      const item: DictionaryEntry = {
        idName: clave,
        sno: snoOf(fila['IdSno']),
        category,
        en: nombreEn,
        es: nombreEs,
        source: 'd4companion',
      };
      byIdName[`${category}:${clave}`] = item;
      const claveEn = `${category}:${normalizeName(nombreEn)}`;
      // Primero gana: las colisiones son variantes del mismo nombre, no terminos distintos.
      if (!byEnglish[claveEn]) byEnglish[claveEn] = item;
      n++;
    }
    counts[category] = (counts[category] ?? 0) + n;
  }

  // Entradas curadas a mano. Siempre pisan a Companion: son una decision explicita.
  for (const path of opts.curatedFiles) {
    if (!existsSync(path)) continue;
    const parsed = CuratedFile.parse(await readJson(path));
    for (const e of parsed.entradas) {
      const item: DictionaryEntry = {
        idName: e.idName ?? `curated_${normalizeName(e.en).replace(/ /g, '_')}`,
        sno: e.sno ?? null,
        category: e.category,
        en: e.en,
        es: e.es,
        source: e.source,
      };
      byIdName[`${e.category}:${item.idName}`] = item;
      byEnglish[`${e.category}:${normalizeName(e.en)}`] = item;
      curatedCounts[e.category] = (curatedCounts[e.category] ?? 0) + 1;
    }
  }

  return {
    meta: {
      generatedAt: opts.now.toISOString(),
      sourceRepo: COMPANION_REPO,
      sourceSha: sha,
      counts,
      curatedCounts,
    },
    byIdName,
    byEnglish,
  };
}
