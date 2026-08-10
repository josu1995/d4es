import {
  MAX_ENTRADAS_HISTORIAL,
  type CambioBuild,
  type CanonicalBuild,
  type Historial,
  type HistorialBuild,
  type TerminoBreve,
  type TipoCambio,
} from '@d4es/schema';

/**
 * Calcula el historial de cambios de cada build comparando la pasada de hoy con la firma
 * que dejo la anterior. Funcion pura: ni red, ni reloj, ni git.
 *
 * La FIRMA es un mapa `clave -> valor` con lo que le importa a alguien que ya esta
 * jugando la build: su tier, que habilidades lleva, que hay en cada ranura, sus engarces,
 * sus glifos y su mercenario. No entran los afijos: cambian por cualquier retoque del
 * autor y ahogarian lo importante.
 *
 * La clave incluye el "donde" (la ranura, el numero de tablero), asi que comparar dos
 * firmas da directamente la lista de cambios sin tener que recorrer la build otra vez.
 */

/**
 * Separador interno de claves y valores. Es un caracter de control: no aparece en ningun
 * nombre del juego, asi que no puede partir un termino por accidente.
 */
const SEP = '\u0001';

/** El valor de la firma guarda las dos caras para poder pintar el cambio despues. */
function valor(ref: { esES: string | null; enUS: string } | null): string {
  return ref ? `${ref.esES ?? ''}${SEP}${ref.enUS}` : '';
}

function desdeValor(v: string): TerminoBreve | null {
  if (v.length === 0) return null;
  const [es, en] = v.split(SEP);
  return { es: es !== undefined && es.length > 0 ? es : null, en: en ?? '' };
}

function clave(tipo: TipoCambio, donde: string): string {
  return `${tipo}${SEP}${donde}`;
}

function desdeClave(k: string): { tipo: TipoCambio; donde: string } {
  const [tipo, donde] = k.split(SEP);
  return { tipo: (tipo ?? 'equipo') as TipoCambio, donde: donde ?? '' };
}

/**
 * Firma de una build: lo que, si cambia, le importa a quien la esta jugando.
 */
export function firmaDeBuild(build: CanonicalBuild): Record<string, string> {
  const firma: Record<string, string> = {};
  const v = build.variants.find((x) => x.id === build.primaryVariantId) ?? build.variants[0];
  if (!v) return firma;

  if (build.ratings.tierLabel) {
    firma[clave('tier', '')] = `${build.ratings.tierLabel}${SEP}${build.ratings.tierLabel}`;
  }
  if (build.ratings.pitTier !== null) {
    firma[clave('pit', '')] = `${build.ratings.pitTier}${SEP}${build.ratings.pitTier}`;
  }

  // Las habilidades van por NOMBRE y no por posicion: mover una de sitio en la barra no
  // es un cambio de build, y publicarlo como tal seria ruido.
  for (const s of v.skills) firma[clave('habilidad', s.ref.enUS)] = valor(s.ref);

  for (const [slot, pieza] of Object.entries(v.gear)) {
    const principal = pieza.item ?? pieza.aspect;
    if (principal) firma[clave('equipo', slot)] = valor(principal);
    pieza.sockets.forEach((s, i) => {
      firma[clave('engarce', `${slot}#${i + 1}`)] = valor(s);
    });
  }

  v.paragon.boards.forEach((b, i) => {
    firma[clave('tablero', String(i + 1))] = valor(b.ref);
    if (b.glyph) firma[clave('glifo', String(i + 1))] = valor(b.glyph.ref);
  });

  if (v.mercenary) firma[clave('mercenario', '')] = valor(v.mercenary.ref);

  return firma;
}

function compararFirmas(
  antes: Record<string, string>,
  despues: Record<string, string>,
): CambioBuild[] {
  const cambios: CambioBuild[] = [];
  for (const k of new Set([...Object.keys(antes), ...Object.keys(despues)])) {
    const a = antes[k] ?? '';
    const d = despues[k] ?? '';
    if (a === d) continue;
    const { tipo, donde } = desdeClave(k);
    cambios.push({ tipo, donde, antes: desdeValor(a), despues: desdeValor(d) });
  }
  // Orden estable: sin esto dos pasadas identicas darian diffs distintos.
  return cambios.sort(
    (x, y) => x.tipo.localeCompare(y.tipo) || x.donde.localeCompare(y.donde),
  );
}

export interface ResultadoHistorial {
  historial: Historial;
  /** Builds con cambios de la fuente en esta pasada. */
  conCambios: number;
  /** Tipos de cambio que se han atribuido al sitio por afectar a medio catalogo. */
  atribuidosAlSitio: string[];
}

/**
 * Cuando cambia el parser o el diccionario, cambian casi todas las builds a la vez y
 * siempre en el mismo tipo de campo. Ese umbral separa "el autor de la guia cambio algo"
 * de "lo cambiamos nosotros".
 */
const UMBRAL_CAMBIO_DEL_SITIO = 0.5;

export function calcularHistorial(
  builds: readonly CanonicalBuild[],
  previo: Historial | null,
  fecha: string,
): ResultadoHistorial {
  const porBuild = new Map<string, CambioBuild[]>();
  const cuentaPorTipo = new Map<TipoCambio, number>();

  for (const build of builds) {
    const firma = firmaDeBuild(build);
    const anterior = previo?.builds[build.id]?.firma;
    // Una build nueva no tiene historia: se guarda su firma y ya.
    if (!anterior) continue;
    const cambios = compararFirmas(anterior, firma);
    if (cambios.length === 0) continue;
    porBuild.set(build.id, cambios);
    for (const t of new Set(cambios.map((c) => c.tipo))) {
      cuentaPorTipo.set(t, (cuentaPorTipo.get(t) ?? 0) + 1);
    }
  }

  const minimoParaSerDelSitio = Math.max(2, Math.ceil(builds.length * UMBRAL_CAMBIO_DEL_SITIO));
  const tiposDelSitio = new Set<TipoCambio>(
    [...cuentaPorTipo.entries()]
      .filter(([, n]) => n >= minimoParaSerDelSitio)
      .map(([t]) => t),
  );

  const salida: Record<string, HistorialBuild> = {};
  let conCambios = 0;
  for (const build of builds) {
    const firma = firmaDeBuild(build);
    const entradasPrevias = previo?.builds[build.id]?.entradas ?? [];
    const cambios = porBuild.get(build.id) ?? [];

    const deLaFuente = cambios.filter((c) => !tiposDelSitio.has(c.tipo));
    const delSitio = cambios.filter((c) => tiposDelSitio.has(c.tipo));
    const entradas = [...entradasPrevias];
    if (deLaFuente.length > 0) {
      entradas.unshift({ fecha, ambito: 'fuente', cambios: deLaFuente });
      conCambios++;
    }
    if (delSitio.length > 0) {
      entradas.unshift({ fecha, ambito: 'sitio', cambios: delSitio });
    }

    salida[build.id] = { firma, entradas: entradas.slice(0, MAX_ENTRADAS_HISTORIAL) };
  }

  return {
    historial: {
      generatedAt: fecha,
      desde: previo?.desde ?? fecha,
      pasadas: (previo?.pasadas ?? 0) + 1,
      builds: salida,
    },
    conCambios,
    atribuidosAlSitio: [...tiposDelSitio].sort(),
  };
}
