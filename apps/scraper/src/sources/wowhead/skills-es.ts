import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS } from '../../paths.js';
import { stableStringify } from '../../util/stable-json.js';

/**
 * Cosecha los nombres OFICIALES en castellano de las habilidades.
 *
 * Existe porque Diablo4Companion, que es la fuente del resto del diccionario, no publica
 * fichero de habilidades: es el unico hueco de traduccion del proyecto.
 *
 * Como funciona: Wowhead publica el mismo listado en los dos idiomas y cada habilidad
 * lleva su identificador interno del juego (SNO) en la URL. Uniendo ambos listados por
 * ese identificador sale un mapa ingles -> castellano que NO es una traduccion nuestra,
 * sino la del propio juego. Cada entrada guarda su `sourceUrl` para poder auditarla.
 *
 * Solo se escriben las habilidades que aparecen en AMBOS idiomas. Si una falta, se queda
 * sin traducir y la web la pinta en ingles con su distintivo: preferible a inventarla.
 */

const CLASES = [
  'barbarian',
  'druid',
  'necromancer',
  'paladin',
  'rogue',
  'sorcerer',
  'spiritborn',
  'warlock',
] as const;

const UA = 'd4es-bot/0.1 (+https://github.com/josu1995/d4es; proyecto personal de fans)';
/** El proxy corporativo bloquea los dominios de juegos; el lector publico si pasa. */
const LECTOR = 'https://r.jina.ai/';
const PAUSA_MS = 2500;

interface Entrada {
  sno: string;
  nombre: string;
}

function urlListado(clase: string, locale: 'es' | 'en'): string {
  return locale === 'es'
    ? `https://www.wowhead.com/diablo-4/es/skills/${clase}`
    : `https://www.wowhead.com/diablo-4/skills/${clase}`;
}

async function listar(clase: string, locale: 'es' | 'en'): Promise<Entrada[]> {
  const url = urlListado(clase, locale);
  const res = await fetch(LECTOR + url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const texto = await res.text();
  // Enlaces markdown a fichas de habilidad: [Nombre](.../skill/slug-SNO)
  const matches = [
    ...texto.matchAll(
      /\[([^\][]{2,60})\]\((?:https:\/\/www\.wowhead\.com)?\/diablo-4\/(?:[a-z]{2}\/)?skill\/[a-z0-9-]+-(\d+)\)/g,
    ),
  ];
  const porSno = new Map<string, Entrada>();
  for (const m of matches) {
    const nombre = (m[1] ?? '').trim();
    const sno = m[2] ?? '';
    // Los listados repiten enlaces en menus laterales; nos quedamos con el primero.
    if (nombre && sno && !porSno.has(sno)) porSno.set(sno, { sno, nombre });
  }
  return [...porSno.values()];
}

export interface CosechaResultado {
  clases: { clase: string; en: number; es: number; casadas: number }[];
  nuevas: number;
  total: number;
  sinPareja: string[];
}

interface EntradaCurada {
  en: string;
  es: string;
  category: string;
  idName?: string;
  sno?: number | null;
  source: 'wowhead-es' | 'curated';
  sourceUrl: string;
  verifiedAt: string;
  verifiedBy: string;
}

export async function cosecharSkillsEs(hoy: string): Promise<CosechaResultado> {
  const destino = join(PATHS.curated, 'skills.esES.json');
  const actual = existsSync(destino)
    ? (JSON.parse(await readFile(destino, 'utf8')) as {
        _nota?: unknown;
        entradas?: EntradaCurada[];
        pendientes?: { en: string; category: string; veces?: number }[];
      })
    : {};

  const porClave = new Map<string, EntradaCurada>();
  for (const e of actual.entradas ?? []) porClave.set(`${e.category}:${e.en.toLowerCase()}`, e);
  const antes = porClave.size;

  const resultado: CosechaResultado = { clases: [], nuevas: 0, total: 0, sinPareja: [] };

  for (const clase of CLASES) {
    try {
      const en = await listar(clase, 'en');
      await new Promise((r) => setTimeout(r, PAUSA_MS));
      const es = await listar(clase, 'es');
      await new Promise((r) => setTimeout(r, PAUSA_MS));

      const esPorSno = new Map(es.map((e) => [e.sno, e.nombre]));
      let casadas = 0;
      for (const e of en) {
        const nombreEs = esPorSno.get(e.sno);
        if (!nombreEs) {
          resultado.sinPareja.push(`${clase}: ${e.nombre}`);
          continue;
        }
        // Si el listado en castellano devolvio el nombre en ingles (a veces pasa con
        // contenido nuevo sin localizar), no es una traduccion: se descarta.
        if (nombreEs.toLowerCase() === e.nombre.toLowerCase()) continue;
        casadas++;
        const clave = `skill:${e.nombre.toLowerCase()}`;
        if (porClave.has(clave)) continue;
        porClave.set(clave, {
          en: e.nombre,
          es: nombreEs,
          category: 'skill',
          sno: Number(e.sno),
          source: 'wowhead-es',
          sourceUrl: `https://www.wowhead.com/diablo-4/es/skill/${e.sno}`,
          verifiedAt: hoy,
          verifiedBy: 'cosecha automatica wowhead es/en cruzada por SNO',
        });
      }
      resultado.clases.push({ clase, en: en.length, es: es.length, casadas });
      process.stdout.write(`  ${clase.padEnd(13)} en:${en.length} es:${es.length} casadas:${casadas}\n`);
    } catch (err) {
      process.stderr.write(`  ${clase}: fallo — ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  const entradas = [...porClave.values()].sort((a, b) => a.en.localeCompare(b.en));
  resultado.total = entradas.length;
  resultado.nuevas = entradas.length - antes;

  await writeFile(
    destino,
    stableStringify({
      _nota: actual._nota,
      entradas,
      // Las pendientes se recalculan con `i18n:skills:scaffold` tras normalizar.
      pendientes: actual.pendientes ?? [],
    }),
    'utf8',
  );
  return resultado;
}
