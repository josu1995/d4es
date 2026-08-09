import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  CLASSES,
  iconoDeActividadPlan,
  iconoDeClase,
  iconoDeNodoPlan,
  iconoDeRanura,
  iconoDeUnico,
  iconoHabilidad,
  type CanonicalBuild,
  type Icono,
  type WarPlansDataset,
} from '@d4es/schema';
import { PATHS } from '../paths.js';
import { readJsonIfExists, stableStringify, writeIfChanged } from '../util/stable-json.js';

/**
 * Descarga los iconos que usa la web y los deja auto-hospedados en `apps/web/public`.
 *
 * Hoy se cargan en caliente del CDN de d4builds. Funciona, pero es frágil: el dia que
 * cambien de carpeta (ya pasó una vez: VoH2) la ficha se queda sin un solo icono. Y
 * ademas se le carga el trafico a un tercero en cada visita.
 *
 * No se puede ejecutar desde la red de trabajo (el proxy bloquea el CDN), asi que corre en
 * GitHub Actions, igual que el extractor de paginas.
 *
 * Dos decisiones deliberadas:
 * - Se descarga SOLO lo que la web referencia de verdad, sacado de los datos canonicos, no
 *   un volcado del CDN entero: no somos un espejo de sus assets.
 * - Hay un tope de tamano. Un fallo de la fuente que devolviera HTML de error en vez de
 *   PNG, o una explosion del numero de iconos, engordaria el repositorio para siempre y en
 *   un commit automatico nadie lo miraria. Si se pasa, se para y se reporta.
 */

const UA = 'd4es-bot/0.1 (+https://github.com/josu1995/d4es; proyecto personal de fans)';
const PAUSA_MS = 120;
/** Tope de lo descargado en una pasada. Por encima, algo va mal. */
const TOPE_MB = 80;
/** Un PNG de icono ronda los 10-40 KB; menos de esto no es una imagen. */
const MINIMO_BYTES = 200;

const RANURAS = [
  'helm',
  'chest_armor',
  'gloves',
  'pants',
  'boots',
  'amulet',
  'ring_1',
  'ring_2',
  'weapon',
  'offhand',
];

export interface IconosResultado {
  referenciados: number;
  yaEstaban: number;
  descargados: number;
  fallidos: { ruta: string; motivo: string }[];
  bytes: number;
  parado: boolean;
  /** Iconos que ya no referencia nadie y se han barrido. */
  huerfanosBorrados: string[];
}

async function leerBuilds(): Promise<CanonicalBuild[]> {
  if (!existsSync(PATHS.canonicalBuilds)) return [];
  const entradas = await readdir(PATHS.canonicalBuilds, { withFileTypes: true, recursive: true });
  const builds: CanonicalBuild[] = [];
  for (const e of entradas) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    builds.push(JSON.parse(await readFile(join(e.parentPath ?? e.path, e.name), 'utf8')) as CanonicalBuild);
  }
  return builds;
}

/** Todo lo que la web puede llegar a pintar, sin duplicados. */
export async function reunirIconos(): Promise<Icono[]> {
  const porRuta = new Map<string, Icono>();
  const anadir = (i: Icono) => porRuta.set(i.ruta, i);

  for (const c of CLASSES) anadir(iconoDeClase(c.id));
  for (const r of RANURAS) anadir(iconoDeRanura(r));

  const dataset = await readJsonIfExists<{ byName: Record<string, { name: string; class: string | null }> }>(
    join(PATHS.canonical, 'skills-dataset.json'),
  );
  for (const s of Object.values(dataset?.byName ?? {})) {
    // Las entradas SIN clase de ese dataset no son habilidades: son los nodos de plan de
    // guerra (y tres disparadores de refuerzo). Sus iconos ya vienen del catalogo de
    // planes, con el nombre de fichero exacto que publica la fuente; pedirlos tambien por
    // aqui solo generaba 404 duplicados.
    if (!s.class) continue;
    anadir(iconoHabilidad(s.name));
  }

  const planes = await readJsonIfExists<WarPlansDataset>(join(PATHS.canonical, 'warplans-dataset.json'));
  for (const a of planes?.activities ?? []) {
    anadir(iconoDeActividadPlan(a.slug));
    for (const n of a.nodes) anadir(iconoDeNodoPlan(n.slug));
  }

  for (const b of await leerBuilds()) {
    for (const v of b.variants) {
      for (const s of v.skills) anadir(iconoHabilidad(s.ref.enUS));
      for (const pieza of Object.values(v.gear)) {
        if (pieza.item) anadir(iconoDeUnico(pieza.item.enUS));
      }
    }
  }

  return [...porRuta.values()].sort((a, b) => a.ruta.localeCompare(b.ruta));
}

export async function runIconos(): Promise<IconosResultado> {
  const iconos = await reunirIconos();
  const res: IconosResultado = {
    referenciados: iconos.length,
    yaEstaban: 0,
    descargados: 0,
    fallidos: [],
    bytes: 0,
    parado: false,
    huerfanosBorrados: [],
  };

  for (const icono of iconos) {
    const destino = join(PATHS.webPublic, icono.ruta);
    if (existsSync(destino)) {
      res.yaEstaban++;
      continue;
    }
    if (res.bytes > TOPE_MB * 1024 * 1024) {
      res.parado = true;
      break;
    }

    try {
      const respuesta = await fetch(icono.url, { headers: { 'user-agent': UA } });
      if (!respuesta.ok) {
        res.fallidos.push({ ruta: icono.ruta, motivo: `HTTP ${respuesta.status}` });
        continue;
      }
      const cuerpo = Buffer.from(await respuesta.arrayBuffer());
      // Un HTML de error pesa poco y no empieza por la firma PNG: no se guarda como icono.
      if (cuerpo.length < MINIMO_BYTES || cuerpo.subarray(1, 4).toString('latin1') !== 'PNG') {
        res.fallidos.push({ ruta: icono.ruta, motivo: `no es un PNG (${cuerpo.length} bytes)` });
        continue;
      }
      await mkdir(dirname(destino), { recursive: true });
      await writeFile(destino, cuerpo);
      res.descargados++;
      res.bytes += cuerpo.length;
    } catch (err) {
      res.fallidos.push({ ruta: icono.ruta, motivo: err instanceof Error ? err.message : String(err) });
    }
    await new Promise((r) => setTimeout(r, PAUSA_MS));
  }

  // Iconos que ya no referencia nadie. Salen solos: un cambio en como se construye el
  // nombre del fichero deja atras la version anterior, y si no se barren se quedan en el
  // repositorio para siempre. Solo se borra DENTRO de public/iconos y solo lo que no
  // aparece en la lista de referenciados, que se acaba de calcular de los datos.
  const referenciadas = new Set(iconos.map((i) => decodeURIComponent(i.ruta)));
  const raiz = join(PATHS.webPublic, 'iconos');
  if (existsSync(raiz)) {
    for (const familia of await readdir(raiz, { withFileTypes: true })) {
      if (!familia.isDirectory()) continue;
      for (const fichero of await readdir(join(raiz, familia.name))) {
        const ruta = `/iconos/${familia.name}/${fichero}`;
        if (referenciadas.has(decodeURIComponent(ruta))) continue;
        await rm(join(raiz, familia.name, fichero));
        res.huerfanosBorrados.push(ruta);
      }
    }
  }

  await mkdir(PATHS.reports, { recursive: true });
  await writeIfChanged(
    join(PATHS.reports, 'iconos.json'),
    stableStringify({
      referenciados: res.referenciados,
      enDisco: res.yaEstaban + res.descargados,
      descargadosEstaVez: res.descargados,
      megasEstaVez: Number((res.bytes / 1024 / 1024).toFixed(2)),
      parado: res.parado,
      huerfanosBorrados: res.huerfanosBorrados,
      // Los que faltan quedan por escrito: un icono que no existe en la fuente suele
      // significar que el nombre no casa, y eso hay que mirarlo, no esconderlo.
      fallidos: res.fallidos.slice(0, 80),
    }),
  );
  return res;
}
