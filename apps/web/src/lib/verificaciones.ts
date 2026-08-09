import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadBuilds } from './data';
import { loadContenido } from './contenido';

/**
 * Recorre el contenido curado y saca TODO lo que no está verificado dentro del juego.
 *
 * Por qué existe: la regla del proyecto es que un dato dudoso se marca y no se esconde, y
 * cada ficha ya pinta su aviso. Pero un aviso suelto en una página perdida no se puede
 * "ir tachando": para saber qué queda hay que abrir los JSON a mano. Esto lo da hecho —
 * qué falta, en qué fichero, en qué ruta y de dónde salió el dato — para poder recorrerlo
 * con el juego abierto y corregirlo de un tirón.
 *
 * No verifica nada por su cuenta, obviamente: eso solo se puede hacer dentro del juego.
 */

const CURATED = join(ROOT, 'data', 'curated');

export interface Pendiente {
  fichero: string;
  /** Ruta dentro del JSON, para poder ir directo al campo: `jefes[3].nombre`. */
  ruta: string;
  /** Nombre legible de la cosa a la que pertenece el dato. */
  titulo: string;
  estado: 'por-verificar' | 'inferido' | 'comunidad';
  fuente: string;
  fecha: string;
  parche: string;
}

interface Envoltorio {
  estado?: string;
  fuente?: string;
  fecha?: string;
  parche?: string;
}

const NO_VERIFICADOS = new Set(['por-verificar', 'inferido', 'comunidad']);

/** Nombre legible del objeto que contiene el dato, buscando hacia arriba. */
function tituloDe(nodo: Record<string, unknown>, heredado: string): string {
  const n = nodo['nombre'];
  if (typeof n === 'string') return n;
  if (n && typeof n === 'object') {
    const nn = n as Record<string, unknown>;
    const es = nn['es'];
    const en = nn['en'];
    if (typeof es === 'string') return es;
    if (typeof en === 'string') return en;
  }
  const id = nodo['id'];
  if (typeof id === 'string') return id;
  return heredado;
}

function recorrer(valor: unknown, fichero: string, ruta: string, titulo: string, salida: Pendiente[]): void {
  if (Array.isArray(valor)) {
    valor.forEach((v, i) => recorrer(v, fichero, `${ruta}[${i}]`, titulo, salida));
    return;
  }
  if (!valor || typeof valor !== 'object') return;

  const nodo = valor as Record<string, unknown>;
  const propio = tituloDe(nodo, titulo);

  const v = nodo['verificacion'] as Envoltorio | undefined;
  if (v && typeof v.estado === 'string' && NO_VERIFICADOS.has(v.estado)) {
    salida.push({
      fichero,
      ruta: ruta || '(raíz)',
      titulo: propio,
      estado: v.estado as Pendiente['estado'],
      fuente: v.fuente ?? '(sin fuente declarada)',
      fecha: v.fecha ?? '',
      parche: v.parche ?? '',
    });
  }

  for (const [clave, hijo] of Object.entries(nodo)) {
    if (clave === 'verificacion') continue;
    recorrer(hijo, fichero, ruta ? `${ruta}.${clave}` : clave, propio, salida);
  }
}

let cache: Pendiente[] | null = null;

export function pendientesDeVerificar(): Pendiente[] {
  if (cache) return cache;
  const salida: Pendiente[] = [];
  if (existsSync(CURATED)) {
    for (const fichero of readdirSync(CURATED).sort()) {
      if (!fichero.endsWith('.json')) continue;
      // Estos dos no son contenido de juego: son diccionario y configuración.
      if (fichero.startsWith('skills.') || fichero.startsWith('clases.')) continue;
      const raw = JSON.parse(readFileSync(join(CURATED, fichero), 'utf8')) as unknown;
      recorrer(raw, fichero, '', fichero.replace('.json', ''), salida);
    }
  }
  cache = salida;
  return cache;
}

export interface UnicoSinOrigen {
  en: string;
  es: string | null;
  /** En cuantas builds publicadas aparece equipado. */
  builds: number;
}

/**
 * Únicos que las builds equipan de verdad y de los que NO sabemos decir de dónde salen.
 *
 * Es la otra cara del hueco de las tablas de botín. La tabla completa de cada jefe no
 * está publicada por nadie de forma contrastable, así que no se puede rellenar; pero sí
 * se puede decir exactamente QUÉ falta y en qué orden importa, cruzando dos cosas que ya
 * tenemos: lo que llevan las 92 builds y el grafo curado de jefes. Ordenado por cuántas
 * builds lo usan, porque no es lo mismo un único que llevan trece que uno que no lleva
 * nadie.
 */
export function unicosSinOrigen(): UnicoSinOrigen[] {
  const normal = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const conOrigen = new Set<string>();
  for (const jefe of loadContenido().jefes) {
    for (const u of jefe.unicos) conOrigen.add(normal(u));
  }

  const usados = new Map<string, { es: string | null; builds: number }>();
  for (const build of loadBuilds()) {
    // Un único que sale en dos variantes de la misma build cuenta una vez.
    const enEstaBuild = new Set<string>();
    for (const v of build.variants) {
      for (const pieza of Object.values(v.gear)) {
        if (!pieza.item || pieza.quality !== 'unique') continue;
        enEstaBuild.add(pieza.item.enUS);
        if (!usados.has(pieza.item.enUS)) {
          usados.set(pieza.item.enUS, { es: pieza.item.esES, builds: 0 });
        }
      }
    }
    for (const en of enEstaBuild) usados.get(en)!.builds++;
  }

  return [...usados.entries()]
    .filter(([en]) => !conOrigen.has(normal(en)))
    .map(([en, v]) => ({ en, es: v.es, builds: v.builds }))
    .sort((a, b) => b.builds - a.builds || a.en.localeCompare(b.en));
}

export function pendientesPorFichero(): { fichero: string; items: Pendiente[] }[] {
  const mapa = new Map<string, Pendiente[]>();
  for (const p of pendientesDeVerificar()) {
    if (!mapa.has(p.fichero)) mapa.set(p.fichero, []);
    mapa.get(p.fichero)!.push(p);
  }
  return [...mapa.entries()]
    .map(([fichero, items]) => ({ fichero, items }))
    .sort((a, b) => b.items.length - a.items.length || a.fichero.localeCompare(b.fichero));
}
