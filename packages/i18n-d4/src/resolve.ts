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
        const conX = this.dict.byEnglish[`affix:${normalizeName(`x ${opts.enUS}`)}`];
        if (conX) return conX;

        // La pagina de la build pega el grupo de templado al nombre del afijo:
        // "Maximum Life (Worldly Endurance - Defensive)". El afijo es el mismo; el
        // parentesis dice de que grupo lo sacas, no que afijo es.
        const sinGrupo = opts.enUS.replace(/\s*\([^)]*\)\s*$/, '').trim();
        if (sinGrupo !== opts.enUS && sinGrupo.length > 0) {
          return (
            this.dict.byEnglish[`affix:${normalizeName(sinGrupo)}`] ??
            this.dict.byEnglish[`affix:${normalizeName(`x ${sinGrupo}`)}`]
          );
        }
        return undefined;
      }

      if (category === 'aspect') return this.lookupAspecto(opts.enUS);
    }
    return undefined;
  }

  /**
   * Los aspectos se guardan en el diccionario SIN la palabra "Aspect": "Crushing Aspect"
   * esta como `crushing` ("aplastante") y "Aspect of Glynn's Anvil" como
   * `of glynn s anvil` ("del yunque de Glynn"). Se busca sin esa palabra y se recompone.
   *
   * Y se recompone con "RASGO", no con "Aspecto": asi se llaman en el cliente espanol.
   * Eso no es una suposicion — se comprobo contra el listado de Wowhead en castellano,
   * cruzando por el identificador interno del juego: 36 de 36 nombres compuestos salen
   * identicos a los que publica la fuente ("Rasgo aplastante", "Rasgo del yunque de
   * Glynn"). Incluido el detalle raro de que el propio juego escribe "Rasgo abrumadora",
   * con el adjetivo en femenino: se reproduce tal cual, porque el nombre es ese y no nos
   * toca a nosotros arreglarle la concordancia al juego.
   *
   * Sigue siendo una COMPOSICION nuestra de dos piezas oficiales, y por eso queda dicho
   * aqui: si algun dia el diccionario trae el nombre entero, esto sobra.
   *
   * Sin esto, los 153 aspectos que aparecen en las builds salian TODOS en ingles pese a
   * estar los 522 en el diccionario.
   */
  private lookupAspecto(enUS: string): DictionaryEntry | undefined {
    const sinPalabra = enUS.replace(/\baspects?\b/gi, ' ').replace(/\s+/g, ' ').trim();
    if (sinPalabra === '' || sinPalabra.length === enUS.length) return undefined;

    const entrada = this.dict.byEnglish[`aspect:${normalizeName(sinPalabra)}`];
    if (!entrada) return undefined;

    return {
      ...entrada,
      // El ingles que se publica es el de la fuente, no el fragmento del diccionario.
      en: enUS,
      es: `Rasgo ${entrada.es}`,
    };
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
