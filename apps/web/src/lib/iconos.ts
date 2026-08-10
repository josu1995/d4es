import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ICONO_CDN,
  codexDeIcono,
  iconoDeActividadPlan,
  iconoDeCasillaParagon,
  iconoDeClase,
  iconoDeCodex,
  iconoDeNodoPlan,
  iconoDeRanura,
  iconoDeUnico,
  iconoHabilidad,
  type CodexCategoria,
  type Icono,
} from '@d4es/schema';
import { ROOT } from './data';

/**
 * Iconos del juego. Son assets de Blizzard servidos por el CDN de d4builds
 * (sunderarmor.com), el mismo origen que usa su web.
 *
 * Se prefieren los AUTO-HOSPEDADOS en `public/iconos`, que descarga el workflow
 * `iconos.yml` en CI (desde la red de trabajo el CDN esta bloqueado). Y se cae al CDN
 * para los que todavia no esten: asi la migracion no rompe nada mientras se completa, y
 * cada pasada del workflow deja mas iconos servidos por nosotros.
 *
 * La URL de origen y la ruta local se construyen en `@d4es/schema`, que es lo que usa
 * tambien el descargador: si cada lado llevara su copia, el dia que cambien de carpeta se
 * arreglaria uno y el otro seguiria pidiendo ficheros que ya nadie usa.
 */

const PUBLICO = join(ROOT, 'apps', 'web', 'public');

/** Se lista una vez: son cientos de ficheros y miles de llamadas. */
let cacheLocales: Set<string> | null = null;

function locales(): Set<string> {
  if (cacheLocales) return cacheLocales;
  const encontrados = new Set<string>();
  const raiz = join(PUBLICO, 'iconos');
  if (existsSync(raiz)) {
    for (const familia of readdirSync(raiz, { withFileTypes: true })) {
      if (!familia.isDirectory()) continue;
      for (const f of readdirSync(join(raiz, familia.name))) {
        encontrados.add(`/iconos/${familia.name}/${f}`);
      }
    }
  }
  cacheLocales = encontrados;
  return encontrados;
}

/** Ruta local si ya esta descargado; si no, la del CDN. */
function servir(icono: Icono): string {
  return locales().has(decodeURI(icono.ruta)) ? icono.ruta : icono.url;
}

export function iconoSkill(nombreEn: string): string {
  return servir(iconoHabilidad(nombreEn));
}

export function iconoClase(classId: string): string {
  return servir(iconoDeClase(classId));
}

/**
 * Igual que `iconoSkill`, pero partiendo del slug ya calculado que guarda el indice de
 * builds (`skillIcons`), en vez del nombre.
 */
export function iconoSkillPorSlug(slug: string): string {
  return servir({
    url: `${ICONO_CDN}/Skills/VoH2/${encodeURIComponent(slug)}.png`,
    ruta: `/iconos/habilidades/${encodeURIComponent(slug)}.png`,
  });
}

export function iconoUnico(nombreEn: string): string {
  return servir(iconoDeUnico(nombreEn));
}

export function iconoActividadPlan(slug: string): string {
  return servir(iconoDeActividadPlan(slug));
}

export function iconoNodoPlan(slug: string): string {
  return servir(iconoDeNodoPlan(slug));
}

/**
 * Icono generico de ranura, para las piezas que no son unicas ni miticas (un legendario
 * con su aspecto). Los aspectos no tienen icono propio en el CDN, asi que sin esto esas
 * piezas salian sin imagen.
 */
const RANURA_CDN: Record<string, string> = {
  helm: 'helm',
  chest: 'chest_armor',
  gloves: 'gloves',
  pants: 'pants',
  boots: 'boots',
  amulet: 'amulet',
  ring1: 'ring_1',
  ring2: 'ring_2',
  weapon: 'weapon',
  weapon2: 'weapon',
  weapon3: 'weapon',
  weapon4: 'weapon',
  offhand: 'offhand',
};

export function iconoRanura(slot: string): string | null {
  const nombre = RANURA_CDN[slot];
  return nombre ? servir(iconoDeRanura(nombre)) : null;
}

/**
 * Categoria del codice de una pieza legendaria (la "imagen" con que la fuente pinta las
 * piezas con aspecto). Etiquetas en castellano compuestas en la interfaz: son rotulos de
 * la propia fuente, no terminos del juego, igual que "Tablero inicial".
 */
export function iconoCodex(categoria: CodexCategoria): string {
  return servir(iconoDeCodex(categoria));
}

/** Icono de una casilla de Paragon, en su variante apagada o encendida. */
export function iconoCasillaParagon(tipo: string, activa: boolean): string {
  return servir(iconoDeCasillaParagon(tipo, activa));
}

export { codexDeIcono };

export const CODEX_ES: Record<CodexCategoria, string> = {
  offensive: 'Ofensivo',
  defensive: 'Defensivo',
  utility: 'Utilidad',
  mobility: 'Movilidad',
};

/** Cuantos iconos se sirven ya desde casa: lo pinta la pagina de estado de los datos. */
export function iconosAutoHospedados(): number {
  return locales().size;
}

export { ICONO_CDN };

/** Color del nombre segun la calidad, como en el juego. */
export const COLOR_CALIDAD: Record<string, string> = {
  unique: 'text-rareza-unico',
  legendary: 'text-rareza-legendario',
  rare: 'text-rareza-raro',
  magic: 'text-rareza-magico',
  normal: 'text-rareza-normal',
};

/** Colores por categoria de habilidad, alineados con la jerarquia visual del juego. */
export const COLOR_CATEGORIA: Record<string, string> = {
  Basic: 'var(--color-ceniza)',
  Core: 'var(--color-brasa-viva)',
  Defensive: 'var(--color-rareza-magico)',
  Ultimate: 'var(--color-oro)',
  Aura: 'var(--color-oro)',
  Valor: 'var(--color-rareza-mitico)',
  Justice: 'var(--color-rareza-mitico)',
  Wrath: 'var(--color-brasa)',
};

export function colorCategoria(categoria: string | null): string {
  return (categoria && COLOR_CATEGORIA[categoria]) || 'var(--color-grabado-vivo)';
}
