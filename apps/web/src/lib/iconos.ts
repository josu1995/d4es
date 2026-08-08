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
