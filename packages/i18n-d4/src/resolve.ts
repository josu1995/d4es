import type { GameRef, GameRefCategory } from '@d4es/schema';
import { translatedRef, untranslatedRef } from '@d4es/schema';
import type { Dictionary, DictionaryEntry } from './types.js';
import { normalizeName } from './types.js';

/**
 * Unica via para crear un GameRef a partir de datos de una fuente. Si no hay traduccion
 * verificada devuelve esES: null — nunca inventa. Lleva la cuenta de los fallos para que
 * el guardrail del pipeline pueda abortar si se pasan del umbral.
 */
export class Resolver {
  private readonly dict: Dictionary;
  private hits = 0;
  private misses = 0;
  private readonly missesPorCategoria = new Map<string, Map<string, number>>();

  constructor(dict: Dictionary) {
    this.dict = dict;
  }

  private lookup(category: string, opts: { idName?: string; enUS?: string }): DictionaryEntry | undefined {
    if (opts.idName) {
      const porId = this.dict.byIdName[`${category}:${opts.idName}`];
      if (porId) return porId;
    }
    if (opts.enUS) {
      const directo = this.dict.byEnglish[`${category}:${normalizeName(opts.enUS)}`];
      if (directo) return directo;

      // Los multiplicadores llevan una "x" delante en el texto del juego ("x Vulnerable
      // Damage Multiplier") que las fuentes de builds omiten. Es el MISMO afijo, asi que
      // se reintenta con el prefijo antes de darlo por no encontrado.
      if (category === 'affix') {
        return this.dict.byEnglish[`affix:${normalizeName(`x ${opts.enUS}`)}`];
      }
    }
    return undefined;
  }

  /**
   * Resuelve por nombre en ingles, que es lo que publican las fuentes de builds.
   * `idNameHint` se usa cuando la fuente si da el IdName del juego (planners de maxroll).
   */
  resolve(category: GameRefCategory, enUS: string, idNameHint?: string): GameRef {
    const entrada = this.lookup(category, { idName: idNameHint, enUS });
    if (entrada) {
      this.hits++;
      return translatedRef({
        idName: entrada.idName,
        category,
        enUS: entrada.en,
        esES: entrada.es,
        i18n: entrada.source,
        sno: entrada.sno,
      });
    }
    this.misses++;
    if (!this.missesPorCategoria.has(category)) this.missesPorCategoria.set(category, new Map());
    const m = this.missesPorCategoria.get(category)!;
    m.set(enUS, (m.get(enUS) ?? 0) + 1);
    return untranslatedRef({
      // Id sintetico para poder referirse al termino aunque no tengamos su IdName real.
      // Sin ":" a proposito: esos dos puntos son el separador de claves del diccionario.
      idName: idNameHint ?? `${category}__${normalizeName(enUS).replace(/ /g, '_')}`,
      category,
      enUS,
    });
  }

  stats(): {
    hits: number;
    misses: number;
    total: number;
    missRate: number;
    porCategoria: Record<string, { termino: string; veces: number }[]>;
  } {
    const total = this.hits + this.misses;
    const porCategoria: Record<string, { termino: string; veces: number }[]> = {};
    for (const [cat, mapa] of this.missesPorCategoria) {
      porCategoria[cat] = [...mapa.entries()]
        .map(([termino, veces]) => ({ termino, veces }))
        .sort((a, b) => b.veces - a.veces || a.termino.localeCompare(b.termino));
    }
    return {
      hits: this.hits,
      misses: this.misses,
      total,
      missRate: total === 0 ? 0 : Math.round((this.misses / total) * 10000) / 10000,
      porCategoria,
    };
  }
}
