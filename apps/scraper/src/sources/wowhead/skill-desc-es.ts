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
  /** Descripciones de mejoras de rama (las "inscripciones" del tooltip). */
  nuevasMejoras: number;
  /** Fichas cuyo bloque activo no casa con el nombre esperado, o sin descripcion. */
  descartadas: string[];
  fallos: string[];
}

function limpiarTexto(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    // El nbsp de los valores ("67 s") llega como  : a espacio normal.
    .replace(/ /g, ' ')
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

  // Fuera las cabeceras "etiqueta: valor" (coste, golpe de suerte, tiempo de
  // reutilizacion "67 s", "15 por segundo", "4 cada 20 s"...): en el tooltip ya se
  // pintan aparte y aqui solo duplicarian. Se quitan por FRAGMENTOS y no por lineas,
  // porque la fuente a veces pega dos cabeceras sin <br> ("Coste de furia: 0Cargas: 2").
  // El valor tiene que empezar por digitos: "Pasiva: Obtienes..." es cuerpo y se queda.
  const FRAGMENTO =
    /^[^:.!?]{1,60}:\s*[\d.,]+\s*%?\s*(s\b\.?|seg\.?|por\s+[a-záéíóúüñ]+(\s+[a-záéíóúüñ]+){0,2}|cada\s+[\d.,]+\s*s\b)?\s*/iu;
  const lineas = limpiarTexto(descHtml).split('\n');
  let inicio = 0;
  while (inicio < lineas.length) {
    let linea = lineas[inicio]!.trim();
    let recorte = linea.match(FRAGMENTO);
    while (recorte) {
      linea = linea.slice(recorte[0].length);
      recorte = linea.match(FRAGMENTO);
    }
    if (linea.length > 0) {
      lineas[inicio] = linea;
      break;
    }
    inicio++;
  }
  const desc = lineas.slice(inicio).join(' ').replace(/\s+/g, ' ').trim();
  if (desc.length === 0) return null;

  return { nombre: limpiarTexto(nombre), desc };
}

/**
 * Descripciones de las MEJORAS de rama de la ficha (lo que el tooltip llama
 * inscripciones). Se devuelven indexadas por su nombre EN CASTELLANO, que es lo que
 * permite casarlas sin depender de la posicion: el nombre ya se cosecho antes y esta
 * verificado, asi que si coincide es la misma mejora.
 */
export function extraerDescripcionesMejoras(html: string): Map<string, string> {
  const salida = new Map<string, string>();
  for (const bloque of html.split('data-skill-type="upgrade"').slice(1)) {
    const nombre = bloque.match(/<div class="whtt-name">([^<]+)<\/div>/)?.[1];
    const desc = bloque.match(/<div class="whtt-description">(.*?)<\/div>/s)?.[1];
    if (!nombre || !desc) continue;
    const limpio = limpiarTexto(desc).replace(/\s+/g, ' ').trim();
    if (limpio.length === 0) continue;
    // Si un nombre sale dos veces con textos distintos no se elige a dedo: se descarta.
    const clave = limpiarTexto(nombre);
    if (salida.has(clave) && salida.get(clave) !== limpio) salida.set(clave, '');
    else if (!salida.has(clave)) salida.set(clave, limpio);
  }
  for (const [k, v] of salida) if (v === '') salida.delete(k);
  return salida;
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

  const res: CosechaDescripciones = { fichas: 0, nuevas: 0, nuevasMejoras: 0, descartadas: [], fallos: [] };
  const guardar = async () => {
    await writeFile(
      destino,
      stableStringify({ _nota: fichero._nota, entradas, pendientes: fichero.pendientes ?? [] }),
      'utf8',
    );
  };

  // Que mejoras tiene cada habilidad: lo publica el catalogo de d4builds en el dataset.
  const dataset = JSON.parse(
    await readFile(join(PATHS.canonical, 'skills-dataset.json'), 'utf8'),
  ) as { byName: Record<string, { name: string; runes?: Record<string, string> }> };
  const mejorasDeSkill = new Map<string, string[]>();
  for (const info of Object.values(dataset.byName)) {
    const mejoras = Object.keys(info.runes ?? {});
    if (mejoras.length > 0) mejorasDeSkill.set(info.name.toLowerCase(), mejoras);
  }
  const upgradePorEn = new Map<string, EntradaCurada>();
  for (const e of entradas) {
    if (e.category === 'skillUpgrade') upgradePorEn.set(e.en.toLowerCase(), e);
  }

  // Se pide la ficha si falta la descripcion de la habilidad O la de alguna de sus
  // mejoras: es la misma pagina, asi que una peticion cubre las dos cosas.
  const pendientes = entradas.filter((e) => {
    if (e.category !== 'skill' || !e.sno) return false;
    if (!e.desc) return true;
    return (mejorasDeSkill.get(e.en.toLowerCase()) ?? []).some((m) => {
      const up = upgradePorEn.get(m.toLowerCase());
      return up !== undefined && !up.desc;
    });
  });
  process.stdout.write(`${pendientes.length} fichas por pedir (habilidad y/o sus mejoras sin descripcion)\n`);

  for (const e of pendientes) {
    if (res.fichas >= maxFichas) break;
    try {
      const html = await fichaEs(e.sno!);
      res.fichas++;

      const activa = extraerDescripcionActiva(html);
      if (!activa) {
        res.descartadas.push(`${e.en}: la ficha no trae bloque activo con descripcion`);
      } else if (activa.nombre !== e.es) {
        // El nombre del bloque debe ser la traduccion ya cosechada: si no, esta pagina no
        // es la que se esperaba (redireccion, SNO reciclado...) y no se publica nada.
        res.descartadas.push(`${e.en}: el bloque dice "${activa.nombre}" y se esperaba "${e.es}"`);
        continue;
      } else if (!e.desc) {
        e.desc = activa.desc;
        res.nuevas++;
      }

      // Las mejoras de esta ficha, casadas por su nombre en castellano (ya verificado).
      const porNombreEs = extraerDescripcionesMejoras(html);
      let mejorasNuevas = 0;
      for (const m of mejorasDeSkill.get(e.en.toLowerCase()) ?? []) {
        const up = upgradePorEn.get(m.toLowerCase());
        if (!up || up.desc) continue;
        const desc = porNombreEs.get(up.es);
        if (!desc) continue;
        up.desc = desc;
        mejorasNuevas++;
        res.nuevasMejoras++;
      }

      process.stdout.write(`  [${res.fichas}] ${e.es.padEnd(28)} +${mejorasNuevas} mejoras\n`);
    } catch (err) {
      res.fallos.push(`${e.en}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (res.fichas % 8 === 0) await guardar();
    await new Promise((r) => setTimeout(r, PAUSA_MS));
  }

  await guardar();
  return res;
}
