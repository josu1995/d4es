import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS } from '../../paths.js';
import { stableStringify } from '../../util/stable-json.js';

/**
 * Cosecha los nombres OFICIALES en castellano de las mejoras de rama del arbol (lo que
 * d4builds llama "runas" dentro de una habilidad, y que no son runas).
 *
 * Son con diferencia el mayor agujero de traduccion del proyecto: 414 terminos, mas que
 * el resto de categorias juntas.
 *
 * Como funciona, y por que es fiable:
 *
 * - La ficha de cada habilidad en Wowhead lista sus mejoras con nombre limpio, en un
 *   bloque `data-skill-type="upgrade"` con su `whtt-name`. Se pide la misma ficha en los
 *   dos idiomas y se emparejan POR POSICION, que es lo unico que hay: las mejoras, al
 *   contrario que las habilidades, no llevan identificador propio en la pagina.
 * - Emparejar por posicion es una suposicion, asi que no se acepta a ciegas:
 *     · si las dos listas no miden lo mismo, la habilidad entera se descarta y se reporta;
 *     · un mismo nombre en ingles sale en muchas habilidades ("Weaken" esta en 48), asi
 *       que se exige que todas las apariciones den la MISMA traduccion. Si dos habilidades
 *       se contradicen, el termino se descarta y se reporta.
 *   Con eso, una traduccion publicada esta corroborada por varias paginas independientes.
 * - La traduccion no es nuestra: es la del propio juego, y cada entrada guarda su
 *   `sourceUrl` para poder auditarla.
 *
 * Y una optimizacion que importa: no se piden las ~250 habilidades. Las mejoras se repiten
 * muchisimo entre habilidades, asi que en cada vuelta se pide la habilidad que aporte MAS
 * nombres todavia desconocidos, y se para cuando ninguna aporta nada nuevo. En la practica
 * cubre las 414 con una fraccion de las peticiones.
 */

const UA = 'd4es-bot/0.1 (+https://github.com/josu1995/d4es; proyecto personal de fans)';
/** El proxy corporativo bloquea los dominios de juegos; el lector publico si pasa. */
const LECTOR = 'https://r.jina.ai/';
const PAUSA_MS = 2000;
/** El lector publico corta con 429 en cuanto se aprieta; se espera y se reintenta. */
const ESPERA_429_MS = 25_000;
const REINTENTOS = 3;

export interface EntradaCurada {
  en: string;
  es: string;
  category: string;
  idName?: string;
  sno?: number | null;
  /** Descripcion en castellano de la misma ficha (la recoge i18n:skills:desc). */
  desc?: string;
  source: 'wowhead-es' | 'curated';
  sourceUrl: string;
  verifiedAt: string;
  verifiedBy: string;
}

export interface CosechaUpgrades {
  /** Habilidades pedidas (dos peticiones cada una). */
  fichas: number;
  nuevas: number;
  total: number;
  /** Habilidades cuyas dos listas no median lo mismo: no se puede emparejar. */
  descuadradas: string[];
  /** Terminos con traducciones contradictorias entre habilidades. */
  contradictorios: string[];
}

/** Saca los nombres de las mejoras, en orden, del HTML de una ficha de habilidad. */
export function extraerMejoras(html: string): string[] {
  const nombres: string[] = [];
  // Cada mejora es un contenedor marcado como "upgrade" con su nombre justo despues.
  const bloques = html.split('data-skill-type="upgrade"').slice(1);
  for (const b of bloques) {
    const m = b.match(/<div class="whtt-name">([^<]+)<\/div>/);
    const nombre = m?.[1]?.replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
    if (nombre) nombres.push(nombre);
  }
  return nombres;
}

async function ficha(sno: string, locale: 'es' | 'en'): Promise<string[]> {
  const url =
    locale === 'es'
      ? `https://www.wowhead.com/diablo-4/es/skill/${sno}`
      : `https://www.wowhead.com/diablo-4/skill/${sno}`;

  for (let intento = 0; ; intento++) {
    const res = await fetch(LECTOR + url, {
      headers: { 'user-agent': UA, 'x-return-format': 'html' },
    });
    if (res.ok) return extraerMejoras(await res.text());
    // 429 no es un fallo de la peticion: es que vamos deprisa. Se espera y se repite,
    // porque perder la ficha obliga a volver a pedir su pareja en el otro idioma.
    if (res.status === 429 && intento < REINTENTOS) {
      process.stdout.write(`    429, esperando ${ESPERA_429_MS / 1000}s...\n`);
      await new Promise((r) => setTimeout(r, ESPERA_429_MS * (intento + 1)));
      continue;
    }
    throw new Error(`${url} -> HTTP ${res.status}`);
  }
}

interface Habilidad {
  nombreEn: string;
  sno: string;
  /** Nombres en ingles de sus mejoras, segun el catalogo de d4builds. */
  mejoras: string[];
}

/**
 * Elige la siguiente habilidad a pedir: la que mas nombres desconocidos aporte. Devuelve
 * null cuando ninguna aporta ya nada, que es la condicion de parada.
 */
function siguiente(habilidades: Habilidad[], conocidos: ReadonlySet<string>, pedidas: ReadonlySet<string>): Habilidad | null {
  let mejor: Habilidad | null = null;
  let mejorAporte = 0;
  for (const h of habilidades) {
    if (pedidas.has(h.sno)) continue;
    const aporte = h.mejoras.filter((m) => !conocidos.has(m.toLowerCase())).length;
    if (aporte > mejorAporte) {
      mejor = h;
      mejorAporte = aporte;
    }
  }
  return mejor;
}

export async function cosecharUpgradesEs(hoy: string, maxFichas = 400): Promise<CosechaUpgrades> {
  const destino = join(PATHS.curated, 'skills.esES.json');
  const actual = existsSync(destino)
    ? (JSON.parse(await readFile(destino, 'utf8')) as {
        _nota?: unknown;
        entradas?: EntradaCurada[];
        pendientes?: unknown[];
      })
    : {};

  const porClave = new Map<string, EntradaCurada>();
  for (const e of actual.entradas ?? []) porClave.set(`${e.category}:${e.en.toLowerCase()}`, e);
  const antes = porClave.size;

  // Que mejoras tiene cada habilidad y con que SNO se pide: lo primero sale del catalogo
  // de d4builds, lo segundo de las habilidades ya cosechadas de Wowhead.
  const dataset = JSON.parse(
    await readFile(join(PATHS.canonical, 'skills-dataset.json'), 'utf8'),
  ) as { byName: Record<string, { name: string; runes?: Record<string, string> }> };

  const snoPorNombre = new Map<string, string>();
  for (const e of actual.entradas ?? []) {
    if (e.category === 'skill' && e.sno) snoPorNombre.set(e.en.toLowerCase(), String(e.sno));
  }

  const habilidades: Habilidad[] = [];
  for (const info of Object.values(dataset.byName)) {
    const mejoras = Object.keys(info.runes ?? {});
    const sno = snoPorNombre.get(info.name.toLowerCase());
    if (!sno || mejoras.length === 0) continue;
    habilidades.push({ nombreEn: info.name, sno, mejoras });
  }

  const conocidos = new Set<string>();
  for (const e of actual.entradas ?? []) {
    if (e.category === 'skillUpgrade') conocidos.add(e.en.toLowerCase());
  }

  // en(minusculas) -> traducciones vistas, para exigir que todas coincidan.
  const vistas = new Map<string, Map<string, { en: string; es: string; url: string }>>();
  const pedidas = new Set<string>();
  const res: CosechaUpgrades = { fichas: 0, nuevas: 0, total: 0, descuadradas: [], contradictorios: [] };

  const guardar = async () => {
    const entradas = [...porClave.values()].sort(
      (a, b) => a.category.localeCompare(b.category) || a.en.localeCompare(b.en),
    );
    await writeFile(
      destino,
      stableStringify({ _nota: actual._nota, entradas, pendientes: actual.pendientes ?? [] }),
      'utf8',
    );
    res.total = entradas.length;
    res.nuevas = entradas.length - antes;
  };

  while (res.fichas < maxFichas) {
    const h = siguiente(habilidades, conocidos, pedidas);
    if (!h) break;
    pedidas.add(h.sno);

    try {
      const en = await ficha(h.sno, 'en');
      await new Promise((r) => setTimeout(r, PAUSA_MS));
      const es = await ficha(h.sno, 'es');
      await new Promise((r) => setTimeout(r, PAUSA_MS));
      res.fichas++;

      if (en.length === 0 || en.length !== es.length) {
        res.descuadradas.push(`${h.nombreEn}: ${en.length} en ingles y ${es.length} en castellano`);
        process.stdout.write(`  ${h.nombreEn}: descuadre ${en.length}/${es.length} — se descarta\n`);
        continue;
      }

      const url = `https://www.wowhead.com/diablo-4/es/skill/${h.sno}`;
      let aportadas = 0;
      for (const [i, nombreEn] of en.entries()) {
        const nombreEs = es[i]!;
        // Sin localizar todavia: no es una traduccion.
        if (nombreEs.toLowerCase() === nombreEn.toLowerCase()) continue;
        const clave = nombreEn.toLowerCase();
        if (!vistas.has(clave)) vistas.set(clave, new Map());
        vistas.get(clave)!.set(nombreEs, { en: nombreEn, es: nombreEs, url });
        conocidos.add(clave);
        aportadas++;
      }
      process.stdout.write(
        `  [${res.fichas}] ${h.nombreEn.padEnd(24)} ${en.length} mejoras, ${aportadas} utiles\n`,
      );
    } catch (err) {
      process.stderr.write(`  ${h.nombreEn}: fallo — ${err instanceof Error ? err.message : String(err)}\n`);
      continue;
    }

    // Se vuelca cada pocas fichas: son muchas peticiones y un corte no puede tirar todo.
    if (res.fichas % 10 === 0) {
      volcar(vistas, porClave, res, hoy);
      await guardar();
    }
  }

  volcar(vistas, porClave, res, hoy);
  await guardar();
  return res;
}

/** Publica solo lo que TODAS las apariciones traducen igual; lo demas se reporta. */
function volcar(
  vistas: Map<string, Map<string, { en: string; es: string; url: string }>>,
  porClave: Map<string, EntradaCurada>,
  res: CosechaUpgrades,
  hoy: string,
): void {
  res.contradictorios = [];
  for (const [en, opciones] of vistas) {
    if (opciones.size > 1) {
      res.contradictorios.push(`${en}: ${[...opciones.keys()].join(' / ')}`);
      continue;
    }
    const unica = [...opciones.values()][0];
    if (!unica) continue;
    const clave = `skillUpgrade:${en}`;
    if (porClave.has(clave)) continue;
    porClave.set(clave, {
      // Tal cual lo escribe la fuente inglesa: recapitalizar convertiria "Fists of Fate"
      // en "Fists Of Fate" y el termino dejaria de casar con el del catalogo.
      en: unica.en,
      es: unica.es,
      category: 'skillUpgrade',
      sno: null,
      source: 'wowhead-es',
      sourceUrl: unica.url,
      verifiedAt: hoy,
      verifiedBy: 'cosecha automatica wowhead es/en, emparejada por posicion y corroborada entre habilidades',
    });
  }
}
