import { skillIconSlug } from '@d4es/schema';

/**
 * Iconos del juego servidos por el CDN de d4builds (sunderarmor.com). Es el mismo origen
 * que usa su web; son assets del juego (Blizzard), no arte propio de d4builds. Patron
 * verificado el 8-ago-2026 contra las paginas renderizadas:
 *   Skills/VoH2/charge_battering_ram.png · Classes/2/barbarian.png
 *
 * Fragilidad conocida: si cambian de carpeta (VoH2 -> otra), los iconos caen al
 * placeholder con la inicial; la web sigue funcionando. El plan a medio plazo es
 * auto-hospedarlos descargandolos en la ingesta de CI.
 */
const CDN = 'https://sunderarmor.com/DIABLO4';

export function iconoSkill(nombreEn: string): string {
  return `${CDN}/Skills/VoH2/${skillIconSlug(nombreEn)}.png`;
}

export function iconoClase(classId: string): string {
  return `${CDN}/Classes/2/${classId}.png`;
}

/** Patron verificado en el DOM real: Uniques/2/tuskhelm_of_joritz_the_mighty.png */
export function iconoUnico(nombreEn: string): string {
  return `${CDN}/Uniques/2/${skillIconSlug(nombreEn)}.png`;
}

/**
 * Icono generico de ranura, para las piezas que no son unicas ni miticas (un legendario
 * con su aspecto). Es el mismo que usa la fuente en su lista de estadisticas:
 * Uniques/ring_1.png, Uniques/chest_armor.png...
 *
 * Los aspectos no tienen icono propio en el CDN (la carpeta Codex solo trae iconos de
 * categoria), asi que sin esto esas piezas salian sin imagen.
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
  return nombre ? `${CDN}/Uniques/${nombre}.png` : null;
}

/**
 * Icono de una actividad de plan de guerra. El slug es el que publica la propia fuente en
 * el fichero de su solapa: WarPlans/whispers.png, WarPlans/boss_lairs.png...
 */
export function iconoActividadPlan(slug: string): string {
  return `${CDN}/WarPlans/${slug}.png`;
}

/**
 * Icono de un nodo de plan de guerra. El slug ya viene del propio fichero que publica la
 * fuente, asi que aqui NO se pasa por skillIconSlug: eso se comeria el apostrofe de
 * "choron's_haste" y dejaria el icono roto.
 */
export function iconoNodoPlan(slug: string): string {
  return `${CDN}/Skills/VoH2/${encodeURIComponent(slug)}.png`;
}

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
