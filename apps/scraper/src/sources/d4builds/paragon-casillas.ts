/**
 * Parseo del formato compacto en que el extractor guarda las casillas del Paragon:
 * "r2c11:Will:common:active:enabled". Vive en su propio modulo porque lo usan tanto el
 * normalizador (para quedarse con las casillas que la build recorre) como el constructor
 * del catalogo de tableros (para la forma completa), y meterlo en cualquiera de los dos
 * crearia un import circular.
 *
 * El formato es: posicion, tipo, y despues una mezcla de rareza y estados. La rareza va
 * en minusculas (common/magic/rare/legendary) y los estados son active/enabled/radius.
 * Las paginas extraidas antes de agosto de 2026 no traen rareza: se tolera y sale null.
 */

export const RAREZAS_PARAGON = ['common', 'magic', 'rare', 'legendary'] as const;
export type RarezaParagon = (typeof RAREZAS_PARAGON)[number];

const RAREZAS = new Set<string>(RAREZAS_PARAGON);
const ESTADOS = new Set(['active', 'enabled', 'radius']);

export interface CasillaParagon {
  row: number;
  col: number;
  /** Tipo que publica la fuente en el alt del icono: Will, Glyph, Paragon Starting Node... */
  tipo: string;
  rareza: RarezaParagon | null;
  /** La build recorre esta casilla. */
  activa: boolean;
}

export function parseCasilla(compacta: string): CasillaParagon | null {
  const [pos, tipo, ...resto] = compacta.split(':');
  const m = pos?.match(/^r(\d+)c(\d+)$/);
  if (!m) return null;

  let rareza: RarezaParagon | null = null;
  let activa = false;
  for (const token of resto) {
    if (RAREZAS.has(token)) rareza = token as RarezaParagon;
    else if (ESTADOS.has(token)) activa ||= token === 'active';
  }

  return { row: Number(m[1]), col: Number(m[2]), tipo: tipo ?? '', rareza, activa };
}

/**
 * El giro que publica la fuente es el acumulado de su animacion (450, 540, 900...), no
 * el giro efectivo. Se reduce a la vuelta y, si no cae en un cuarto exacto, se descarta:
 * un tablero girado 37 grados seria un fallo del extractor, no un dato.
 */
export function normalizarGiro(giro: number | null | undefined): 0 | 90 | 180 | 270 | null {
  if (giro === null || giro === undefined || !Number.isFinite(giro)) return null;
  const g = ((Math.round(giro) % 360) + 360) % 360;
  return g === 0 || g === 90 || g === 180 || g === 270 ? g : null;
}
