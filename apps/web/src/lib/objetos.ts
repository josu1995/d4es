import { classById, type CanonicalBuild, type SlotId } from '@d4es/schema';
import { capitalizar } from './etiquetas';

/**
 * Datos para el evaluador de objetos, empaquetados para viajar dentro de la pagina.
 *
 * La pregunta que resuelve es la que un jugador se hace cien veces por sesion: "me ha
 * caido esto, ¿lo tiro o lo guardo?". La respuesta esta en un dato que ya tenemos y que
 * nadie mas publica en castellano: la lista PRIORIZADA de afijos que cada build quiere en
 * cada ranura (el bloque "Gear Stats" de la fuente, donde el orden ES la prioridad).
 *
 * Va todo al navegador y se calcula alli: no hay servidor que consultar, y asi la
 * herramienta funciona igual de rapido con el juego abierto al lado.
 *
 * Se empaqueta por INDICES en vez de repetir los nombres: son ~5.500 referencias a 148
 * afijos distintos, y en texto plano eso multiplicaria por veinte el tamaño de la pagina.
 */

export interface DatosEvaluador {
  /** Nombre de cada afijo, ya capitalizado para pintar. El indice es su identificador. */
  afijos: string[];
  /** Afijos sin traduccion verificada, por indice: la web les pone su distintivo. */
  sinTraducir: number[];
  clases: { id: string; slug: string; nombre: string }[];
  ranuras: { id: string; nombre: string }[];
  builds: {
    id: string;
    titulo: string;
    clase: string;
    url: string;
    tier: string | null;
    /** Por ranura, los indices de sus afijos EN ORDEN DE PRIORIDAD. */
    ranuras: Record<string, number[]>;
  }[];
}

/** Solo las ranuras donde la eleccion de afijos tiene sentido para comparar. */
const RANURAS: { id: SlotId; nombre: string }[] = [
  { id: 'helm', nombre: 'Yelmo' },
  { id: 'chest', nombre: 'Pechera' },
  { id: 'gloves', nombre: 'Guantes' },
  { id: 'pants', nombre: 'Pantalones' },
  { id: 'boots', nombre: 'Botas' },
  { id: 'amulet', nombre: 'Amuleto' },
  { id: 'ring1', nombre: 'Anillo' },
  { id: 'weapon', nombre: 'Arma' },
  { id: 'offhand', nombre: 'Mano izquierda' },
];

/**
 * Los dos anillos son la misma ranura para el jugador: un anillo que cae vale para
 * cualquiera de los dos huecos. Se fusionan para no partir la respuesta en dos.
 */
const EQUIVALENTES: Record<string, string> = { ring2: 'ring1', weapon2: 'weapon', weapon3: 'weapon', weapon4: 'weapon' };

export function datosEvaluador(
  builds: readonly CanonicalBuild[],
  nombreClase: (id: string) => string,
  buildUrl: (b: { classSlug: string; id: string }) => string,
): DatosEvaluador {
  const indicePorAfijo = new Map<string, number>();
  const afijos: string[] = [];
  const sinTraducir = new Set<number>();

  const indiceDe = (ref: { esES: string | null; enUS: string }): number => {
    const texto = capitalizar(ref.esES ?? ref.enUS);
    let i = indicePorAfijo.get(texto);
    if (i === undefined) {
      i = afijos.length;
      afijos.push(texto);
      indicePorAfijo.set(texto, i);
      if (ref.esES === null) sinTraducir.add(i);
    }
    return i;
  };

  const salida: DatosEvaluador['builds'] = [];
  for (const b of builds) {
    const v = b.variants.find((x) => x.id === b.primaryVariantId) ?? b.variants[0];
    if (!v) continue;
    const ranuras: Record<string, number[]> = {};
    for (const [slot, pieza] of Object.entries(v.gear)) {
      const destino = EQUIVALENTES[slot] ?? slot;
      if (!RANURAS.some((r) => r.id === destino)) continue;
      // Sin duplicados: una misma pieza puede traer el afijo normal y su version
      // templada, que tras unificar el grupo son el MISMO texto. Se conserva la primera
      // aparicion, que es la de mayor prioridad.
      const vistos = new Set<number>();
      const indices: number[] = [];
      for (const a of pieza.affixes) {
        const i = indiceDe(a.ref);
        if (vistos.has(i)) continue;
        vistos.add(i);
        indices.push(i);
      }
      // Si dos ranuras se fusionan (los dos anillos), se queda la lista mas completa:
      // fusionarlas de verdad mezclaria dos prioridades distintas y mentiria sobre el orden.
      if (!ranuras[destino] || indices.length > ranuras[destino]!.length) {
        ranuras[destino] = indices;
      }
    }
    const clase = classById(b.classId);
    salida.push({
      id: b.id,
      titulo: b.title.es,
      clase: b.classId,
      url: buildUrl({ classSlug: clase?.slug ?? b.classId, id: b.id }),
      tier: b.ratings.tierLabel,
      ranuras,
    });
  }

  const clasesUsadas = [...new Set(builds.map((b) => b.classId))];
  return {
    afijos,
    sinTraducir: [...sinTraducir].sort((a, b) => a - b),
    clases: clasesUsadas
      .map((id) => ({ id, slug: classById(id)?.slug ?? id, nombre: nombreClase(id) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    ranuras: RANURAS.map((r) => ({ id: r.id, nombre: r.nombre })),
    builds: salida.sort((a, b) => a.titulo.localeCompare(b.titulo, 'es')),
  };
}
