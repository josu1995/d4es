import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS } from '../../paths.js';
import { stableStringify } from '../../util/stable-json.js';
import type { EntradaCurada } from './upgrades-es.js';

/**
 * Cosecha las DESCRIPCIONES en castellano de las habilidades cuya ficha ya conocemos.
 *
 * Los tooltips de la web pintaban la descripcion siempre en ingles (la del catalogo de
 * d4builds) porque no habia ninguna en castellano en el proyecto. Pero la ficha de cada
 * habilidad en Wowhead ES ya se estaba descargando entera para las mejoras de rama... y
 * la descripcion se tiraba. Esta cosecha la recoge:
 *
 * - Solo se piden las habilidades que ya estan en `skills.esES.json` con su SNO: si
 *   Wowhead no ha localizado una habilidad, no hay ficha ES que pedir y su tooltip se
 *   queda en ingles con su distintivo, como manda la regla 1.
 * - La ficha ES trae el tooltip del juego: un bloque `data-skill-type="active"` con el
 *   nombre (`whtt-name`) y la descripcion (`whtt-description`). Se exige que el nombre
 *   del bloque coincida con la traduccion ya cosechada: si no coincide, la pagina no es
 *   la que se esperaba y se descarta con aviso.
 * - Las lineas de coste ("Coste de mana: 30", "Probabilidad de golpe de suerte: 5%") van
 *   dentro de la misma descripcion, separadas por <br>: se quitan las cabeceras con pinta
 *   de "etiqueta: valor" y se publica el cuerpo.
 * - La descripcion se guarda EN LA MISMA entrada curada (`desc`), con lo que hereda su
 *   `sourceUrl` y su `verifiedAt`: la procedencia es la misma ficha.
 *
 * Es reanudable: las entradas que ya tienen `desc` no se vuelven a pedir, y se vuelca a
 * disco cada pocas fichas.
 */

const UA = 'd4es-bot/0.1 (+https://github.com/josu1995/d4es; proyecto personal de fans)';
const LECTOR = 'https://r.jina.ai/';
const PAUSA_MS = 2000;
const ESPERA_429_MS = 25_000;
const REINTENTOS = 3;

export interface CosechaDescripciones {
  fichas: number;
  nuevas: number;
  /** Fichas cuyo bloque activo no casa con el nombre esperado, o sin descripcion. */
  descartadas: string[];
  fallos: string[];
}

function limpiarTexto(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Saca nombre y descripcion del PRIMER bloque activo de la ficha (el de la propia
 * habilidad; los siguientes son sus mejoras y el pie repite el primero).
 */
export function extraerDescripcionActiva(html: string): { nombre: string; desc: string } | null {
  const bloque = html.split('data-skill-type="active"')[1];
  if (!bloque) return null;
  const nombre = bloque.match(/<div class="whtt-name">([^<]+)<\/div>/)?.[1];
  const descHtml = bloque.match(/<div class="whtt-description">(.*?)<\/div>/s)?.[1];
  if (!nombre || !descHtml) return null;

  // Fuera las cabeceras "etiqueta: valor" (coste, golpe de suerte...): en el tooltip ya
  // se pintan aparte, y aqui solo duplicarian. El cuerpo empieza en la primera linea que
  // no tiene esa pinta.
  const lineas = limpiarTexto(descHtml).split('\n');
  let inicio = 0;
  while (inicio < lineas.length && /^[^:]{1,60}:\s*[\d.,%x\s]+$/.test(lineas[inicio]!.trim())) {
    inicio++;
  }
  const desc = lineas.slice(inicio).join(' ').replace(/\s+/g, ' ').trim();
  if (desc.length === 0) return null;

  return { nombre: limpiarTexto(nombre), desc };
}

async function fichaEs(sno: number): Promise<string> {
  const url = `https://www.wowhead.com/diablo-4/es/skill/${sno}`;
  for (let intento = 0; ; intento++) {
    const res = await fetch(LECTOR + url, {
      headers: { 'user-agent': UA, 'x-return-format': 'html' },
    });
    if (res.ok) return res.text();
    if (res.status === 429 && intento < REINTENTOS) {
      process.stdout.write(`    429, esperando ${(ESPERA_429_MS * (intento + 1)) / 1000}s...\n`);
      await new Promise((r) => setTimeout(r, ESPERA_429_MS * (intento + 1)));
      continue;
    }
    throw new Error(`${url} -> HTTP ${res.status}`);
  }
}

export async function cosecharDescripcionesEs(maxFichas = 200): Promise<CosechaDescripciones> {
  const destino = join(PATHS.curated, 'skills.esES.json');
  if (!existsSync(destino)) {
    throw new Error(`falta ${destino}. Ejecuta primero: i18n:skills:wowhead`);
  }
  const fichero = JSON.parse(await readFile(destino, 'utf8')) as {
    _nota?: unknown;
    entradas?: EntradaCurada[];
    pendientes?: unknown[];
  };
  const entradas = fichero.entradas ?? [];

  const res: CosechaDescripciones = { fichas: 0, nuevas: 0, descartadas: [], fallos: [] };
  const guardar = async () => {
    await writeFile(
      destino,
      stableStringify({ _nota: fichero._nota, entradas, pendientes: fichero.pendientes ?? [] }),
      'utf8',
    );
  };

  const pendientes = entradas.filter((e) => e.category === 'skill' && e.sno && !e.desc);
  process.stdout.write(`${pendientes.length} habilidades con ficha ES y sin descripcion\n`);

  for (const e of pendientes) {
    if (res.fichas >= maxFichas) break;
    try {
      const html = await fichaEs(e.sno!);
      res.fichas++;
      const activa = extraerDescripcionActiva(html);
      if (!activa) {
        res.descartadas.push(`${e.en}: la ficha no trae bloque activo con descripcion`);
        continue;
      }
      // El nombre del bloque debe ser la traduccion ya cosechada: si no, esta pagina no
      // es la que se esperaba (redireccion, SNO reciclado...) y no se publica nada.
      if (activa.nombre !== e.es) {
        res.descartadas.push(`${e.en}: el bloque dice "${activa.nombre}" y se esperaba "${e.es}"`);
        continue;
      }
      e.desc = activa.desc;
      res.nuevas++;
      process.stdout.write(`  [${res.fichas}] ${e.es.padEnd(28)} ${activa.desc.slice(0, 60)}...\n`);
    } catch (err) {
      res.fallos.push(`${e.en}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (res.fichas % 8 === 0) await guardar();
    await new Promise((r) => setTimeout(r, PAUSA_MS));
  }

  await guardar();
  return res;
}
