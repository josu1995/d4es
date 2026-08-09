import {
  MAX_WARPLAN_POINTS,
  SLOT_IDS,
  WARPLAN_ACTIVITIES,
  computeCompletenessScore,
  computeConsensus,
  pickPrimaryVariant,
  type BuildVariant,
  type CanonicalBuild,
  type GearItem,
  type SlotId,
} from '@d4es/schema';
import { Resolver, normalizeName } from '@d4es/i18n';
import type { GearItemRaw, PaginaRaw, StatsSlotRaw, VarianteRaw } from './scrape-pages.js';
import type { PlanGuerraRaw } from './warplans.js';
import type { MercenariosRaw } from './mercenarios.js';
import { normalizarGiro, parseCasilla } from './paragon-casillas.js';
import { hashOf } from '../../util/stable-json.js';

/**
 * Convierte lo extraido de la pagina de una build en variantes canonicas con equipo,
 * Paragon y mercenarios. Es la pieza que rellena las pestanas que hasta ahora decian
 * "pronto".
 *
 * Sigue siendo una funcion pura: ni red, ni reloj. Las fechas salen del snapshot.
 */

/** El nombre de ranura que publica la fuente, en ingles, a nuestro identificador. */
const SLOTS_FIJOS: Record<string, SlotId> = {
  helm: 'helm',
  'chest armor': 'chest',
  chest: 'chest',
  gloves: 'gloves',
  pants: 'pants',
  boots: 'boots',
  amulet: 'amulet',
  'ring 1': 'ring1',
  'ring 2': 'ring2',
};

/** Ranuras de arma en el orden en que se van asignando. */
const RANURAS_ARMA: SlotId[] = ['weapon', 'weapon2', 'weapon3', 'weapon4'];

function esOffhand(nombre: string): boolean {
  return /off-?hand|shield|focus|totem|shard/.test(nombre);
}

/**
 * Asigna ranura. Las fijas van por nombre; las armas por orden de aparicion, porque el
 * Barbaro lleva cuatro y la fuente las nombra de formas distintas segun el tipo.
 */
function asignarSlots(items: readonly { slot: string }[]): (SlotId | null)[] {
  let siguienteArma = 0;
  return items.map((item) => {
    const clave = normalizeName(item.slot);
    const fijo = SLOTS_FIJOS[clave];
    if (fijo) return fijo;
    if (esOffhand(clave)) return 'offhand';
    if (/weapon|wield|two-?handed|bow|crossbow|staff|wand|sword|mace|axe|dagger|scythe|polearm|glaive|quarterstaff/.test(clave)) {
      const asignada = RANURAS_ARMA[siguienteArma];
      siguienteArma++;
      return asignada ?? null;
    }
    return null;
  });
}

const CALIDADES: Record<string, GearItem['quality']> = {
  unique: 'unique',
  mythic: 'unique',
  legendary: 'legendary',
  rare: 'rare',
  magic: 'magic',
};

function afijosDeSlot(stats: readonly StatsSlotRaw[], nombreSlot: string): StatsSlotRaw | undefined {
  const objetivo = normalizeName(nombreSlot);
  return stats.find((s) => normalizeName(s.slot) === objetivo);
}

/**
 * Limpia el nombre de un tablero de Paragon. El extractor ya lo hace, pero se repite
 * aqui a proposito: el normalizador no debe fiarse de que el crudo venga limpio, porque
 * entonces cualquier crudo antiguo o cualquier fallo del extractor acaba publicado tal
 * cual. Aqui es barato y evita sacar "1Starting Board Str 105*Dex 59" a la web.
 */
export function limpiarNombreTablero(texto: string): string {
  return texto
    .replace(/^\d+\s*/, '')
    .split(/\s+(?:Str|Dex|Int|Will|Fue|Des|Vol)\s+\d/)[0]!
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fondos que la fuente pinta detras del icono del nodo. No son el nodo: hay que
 * descartarlos para quedarse con el fichero que SI lleva su nombre.
 */
const FONDOS_DE_NODO = new Set([
  'passive_active',
  'passive_inactive',
  'skill_minor_active',
  'skill_minor_inactive',
  'category_active',
  'category_inactive',
]);

/** El nombre del nodo viaja en el fichero de su icono: .../Skills/VoH2/corrupted_roots.png */
export function slugDeNodo(iconos: readonly string[]): string | null {
  const propios = iconos.filter((i) => !FONDOS_DE_NODO.has(i) && !i.startsWith('category_'));
  return propios[propios.length - 1] ?? null;
}

/**
 * De `corrupted_roots` a "Corrupted Roots". Solo es el ultimo recurso: el nombre bueno
 * sale del catalogo, que publica los 100 nodos con su nombre y su descripcion. Esto no
 * inventa traduccion ninguna (sigue siendo ingles), solo presenta el identificador de la
 * fuente de forma legible mientras el dataset no este disponible.
 */
export function nombreDesdeSlug(slug: string): string {
  return slug
    .replace(/_/g, ' ')
    .split(' ')
    .map((p) => (p.length > 0 ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join(' ')
    .trim();
}

/**
 * De quien es el arbol de mercenario que publica la build, y que ha cogido en el.
 *
 * La fuente no dice el mercenario: pinta su arbol de habilidades. Se deduce del dataset
 * del catalogo, donde la `class` de una habilidad de mercenario ES el mercenario
 * ("Varyana, The Berserker Crone"). El dueño con mas habilidades COGIDAS es el
 * contratado; si aparece un segundo dueño, es el refuerzo.
 *
 * Solo cuentan los nodos cogidos (`skill__tree__item--active`): el arbol se publica
 * entero con todas las habilidades disponibles, y sin filtrar saldrian todas como si la
 * build las llevara. Y cada nodo viene TRIPLICADO en el DOM (57 nodos = 19 unicos; 15
 * activos = 5 unicos), asi que se deduplica por slug: sin eso cada habilidad se
 * publicaria tres veces.
 */
function normalizarMercenario(
  crudo: MercenariosRaw | undefined,
  resolver: Resolver,
  mercenarioPorHabilidad: ReadonlyMap<string, string>,
): BuildVariant['mercenary'] {
  const vistos = new Set<string>();
  const cogidos = (crudo?.nodos ?? []).filter((n) => {
    if (!n.clases.includes('skill__tree__item--active') || (n.puntos !== null && n.puntos <= 0)) {
      return false;
    }
    const clave = n.slug || normalizeName(n.nombre);
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
  if (cogidos.length === 0) return null;

  const porDueno = new Map<string, typeof cogidos>();
  for (const n of cogidos) {
    const dueno = mercenarioPorHabilidad.get(normalizeName(n.nombre));
    if (!dueno) continue;
    if (!porDueno.has(dueno)) porDueno.set(dueno, []);
    porDueno.get(dueno)!.push(n);
  }
  if (porDueno.size === 0) return null;

  const ordenados = [...porDueno.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
  const [contratado, habilidades] = ordenados[0]!;

  return {
    ref: resolver.resolve('mercenary', contratado),
    skills: habilidades
      .sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))
      .map((n) => resolver.resolve('skill', n.nombre)),
    reinforcement: ordenados[1] ? resolver.resolve('mercenary', ordenados[1][0]) : null,
  };
}

/**
 * Los planes de guerra de la fuente: siete actividades, cada una con SU bolsa de 7
 * puntos. Un nodo cuenta como invertido cuando la fuente le pone la clase `allocated`
 * (y entonces, y solo entonces, pinta su contador "1/1"); `available` y `locked` son
 * nodos que la build no ha cogido. Los `category` no son nodos: son el icono de la
 * actividad.
 *
 * Se guardan solo los invertidos, que es lo que la build recomienda de verdad. La forma
 * completa del arbol es identica en todas las builds y repetirla 92 veces solo engordaria
 * el repositorio.
 */
function normalizarPlanes(
  planes: readonly PlanGuerraRaw[],
  resolver: Resolver,
  nombreDeNodo: (slug: string) => string | null,
): BuildVariant['warPlan'] {
  const actividades = planes
    .map((plan) => {
      const invertidos = plan.nodos.filter((n) => n.clases.includes('allocated') && !n.clases.includes('category'));
      const nodes = invertidos
        .map((n) => {
          const slug = slugDeNodo(n.iconos);
          if (!slug) return null;
          return {
            ref: resolver.resolve('warPlanNode', nombreDeNodo(slug) ?? nombreDesdeSlug(slug)),
            slug,
            // Los rombos son los nodos menores del arbol; los circulos, los mayores.
            minor: n.clases.includes('diamond'),
          };
        })
        .filter((n): n is NonNullable<typeof n> => n !== null)
        .slice(0, MAX_WARPLAN_POINTS);

      const actividad = plan.actividad.trim() || nombreDesdeSlug(plan.slug);
      return {
        ref: resolver.resolve('warPlanNode', actividad),
        slug: plan.slug || normalizeName(actividad).replace(/\s+/g, '_'),
        spent: nodes.length,
        remaining:
          plan.restantes === null ? null : Math.min(Math.max(plan.restantes, 0), MAX_WARPLAN_POINTS),
        nodes,
      };
    })
    // Una actividad sin puntos es una actividad para la que esta build no propone plan.
    .filter((a) => a.nodes.length > 0 && a.slug.length > 0);

  if (actividades.length === 0) return null;
  return { activities: actividades.slice(0, WARPLAN_ACTIVITIES), inferred: false };
}

/**
 * La lista de "stats" de una ranura en la fuente NO son solo afijos: lleva dentro cosas
 * de su propia interfaz. Publicarlas metia en la ficha lineas que no existen en el juego
 * y que ademas salian en ingles con distintivo de sin traducir, como si fueran afijos que
 * no supieramos traducir. Eran 869 apariciones, la primera causa de "sin traducir" de
 * todo el proyecto:
 *
 *  - `Transfigure`: el boton de transfiguracion, al final de CADA ranura (811 veces).
 *  - `Weapon Type`: el selector de tipo de arma.
 *  - `Stat 1`..`Stat 4`, `Tempering Stat 1`: huecos del formulario sin rellenar.
 *  - `Aspect of ...` / `... Aspect`: el aspecto de la pieza, que ya se publica aparte
 *    como su nombre; repetido aqui no aporta y ademas no es un afijo.
 */
const NO_ES_AFIJO = /^(transfigure|weapon type|(tempering\s+)?stat\s*\d+)$/i;

export function esAfijoDeVerdad(texto: string): boolean {
  const t = texto.trim();
  if (t.length === 0) return false;
  if (NO_ES_AFIJO.test(t)) return false;
  return !/\baspects?\b/i.test(t);
}

/**
 * Gema o runa. La fuente las sirve desde carpetas distintas del CDN y ese es el dato
 * fiable; el nombre no vale, porque "Skull" podria ser cualquier cosa. Si algun dia
 * cambiaran las carpetas, se cae al tipo que ya extrae el scraper del nombre del fichero
 * ("grand-diamond"), que es la otra pista que publica.
 */
const GEMAS = /\b(diamond|ruby|skull|topaz|sapphire|emerald|amethyst)\b/i;

export function esGema(engarce: { tipo: string; icono: string | null }): boolean {
  if (engarce.icono?.includes('/Gems/')) return true;
  if (engarce.icono?.includes('/Runes/')) return false;
  return GEMAS.test(engarce.tipo);
}

/** Un afijo templado o con estrellas no es "otro afijo": es el mismo con mas informacion. */
function construirGear(
  crudo: GearItemRaw,
  slot: SlotId,
  stats: readonly StatsSlotRaw[],
  resolver: Resolver,
): GearItem {
  const esMitico = crudo.calidad === 'mythic';
  const calidad: GearItem['quality'] =
    (crudo.calidad ? CALIDADES[crudo.calidad] : undefined) ?? 'legendary';
  const nombre = crudo.nombre?.trim() ?? '';

  // Si el nombre acaba en "Aspect", la fuente esta nombrando el aspecto, no un objeto.
  const esAspecto = /\baspect\b/i.test(nombre);
  const item = nombre && !esAspecto ? resolver.resolve('unique', nombre) : null;
  const aspect = esAspecto ? resolver.resolve('aspect', nombre) : null;

  const bloque = afijosDeSlot(stats, crudo.slot);
  const afijos = (bloque?.afijos ?? [])
    .filter((a) => esAfijoDeVerdad(a.texto))
    .map((a, i) => ({
    ref: resolver.resolve('affix', a.texto),
    greater: a.ga > 0,
    tempered: a.templado,
    order: i,
  }));

  const quality: GearItem['quality'] = esAspecto ? 'legendary' : calidad;

  return {
    slot,
    item,
    quality,
    mythic: { isMythic: esMitico, craftPath: null },
    aspect,
    affixes: afijos.slice(0, 8),
    sockets: crudo.engarces
      .filter((e) => e.nombre.length > 0)
      .slice(0, 3)
      // Gema o runa segun la carpeta de la que la sirve la fuente. Publicarlo todo como
      // runa hacia que "Diamond", "Ruby"... se buscaran en la lista de runas del juego,
      // donde no estan: 701 apariciones sin traducir por una etiqueta mal puesta.
      .map((e) => resolver.resolve(esGema(e) ? 'gem' : 'rune', e.nombre)),
    minItemPower: null,
    // La imagen con que la fuente pinta la pieza: la unica previsualizacion posible para
    // las legendarias, que no tienen objeto base con nombre.
    icon: crudo.icono ?? null,
  };
}

export interface EnriquecerResultado {
  build: CanonicalBuild;
  /** Que se ha podido rellenar, para el informe. */
  relleno: { gear: number; paragon: number; mercenarios: number; variantesExtra: number };
}

function construirVariante(
  base: BuildVariant,
  crudo: VarianteRaw,
  capturadoEn: string,
  resolver: Resolver,
  etiqueta: string | null,
  mercenarioPorHabilidad: ReadonlyMap<string, string>,
  nombreDeNodo: (slug: string) => string | null,
): BuildVariant {
  const slots = asignarSlots(crudo.gear);
  const gear: Record<string, GearItem> = {};
  crudo.gear.forEach((item, i) => {
    const slot = slots[i];
    // Sin ranura reconocible no se puede colocar: mejor omitirlo que inventarse un sitio.
    if (!slot || gear[slot]) return;
    gear[slot] = construirGear(item, slot, crudo.stats, resolver);
  });

  const boards = crudo.paragon
    .map((b) => ({ ...b, tablero: limpiarNombreTablero(b.tablero) }))
    .filter((b) => b.tablero.length > 0)
    .slice(0, 9)
    .map((b, i) => ({
      ref: resolver.resolve('paragonBoard', b.tablero),
      order: i,
      rotation: normalizarGiro(b.giro),
      glyph: b.glifo
        ? {
            ref: resolver.resolve('glyph', b.glifo),
            // Si la fuente no publica el nivel, se queda en null y la ficha no lo pinta.
            rank: b.nivelGlifo === null ? null : Math.min(Math.max(b.nivelGlifo, 1), 150),
          }
        : null,
      // Solo las casillas que la build recorre; la forma completa del tablero vive en el
      // catalogo compartido (paragon-boards-dataset.json), indexado por clase + nombre.
      tiles: (b.casillas ?? [])
        .map(parseCasilla)
        .filter((c): c is NonNullable<typeof c> => c !== null && c.activa)
        .map((c) => `r${c.row}c${c.col}`),
    }));

  const mercenary = normalizarMercenario(crudo.mercenarios, resolver, mercenarioPorHabilidad);

  const warPlan = normalizarPlanes(crudo.warPlans, resolver, nombreDeNodo);

  const flags = {
    hasSkills: base.skills.length > 0,
    hasGear: Object.keys(gear).length > 0,
    hasParagon: boards.length > 0,
    hasTalisman: false,
    hasMercenary: mercenary !== null,
    hasWarPlan: warPlan !== null,
  };

  return {
    ...base,
    id: `d4builds:${base.source.externalId}:${crudo.index}`,
    source: {
      ...base.source,
      variantIndex: crudo.index,
      variantLabel: etiqueta ?? base.source.variantLabel,
      url: `https://d4builds.gg/builds/${base.source.externalId}/?var=${crudo.index}`,
      capturedAt: capturadoEn,
      snapshotHash: hashOf(crudo),
    },
    gear,
    paragon: { level: crudo.paragonNivel ?? null, boards },
    mercenary,
    warPlan,
    completeness: { ...flags, score: computeCompletenessScore(flags) },
  };
}

/**
 * Fusiona la pagina con la build ya normalizada del catalogo. Las habilidades siguen
 * viniendo del catalogo (ahi estan mejor estructuradas, con rangos y runas) y la pagina
 * aporta todo lo demas.
 */
export function enriquecerConPagina(
  build: CanonicalBuild,
  pagina: PaginaRaw,
  resolver: Resolver,
  /** habilidad de mercenario (normalizada) -> mercenario al que pertenece. */
  mercenarioPorHabilidad: ReadonlyMap<string, string> = new Map(),
  /**
   * slug del icono de un nodo de plan de guerra -> su nombre publicado. Sale del dataset
   * del catalogo, que trae los 100 nodos con nombre y descripcion. Sin el, se cae al
   * nombre deducido del propio slug.
   */
  nombreDeNodo: (slug: string) => string | null = () => null,
): EnriquecerResultado {
  const base = build.variants.find((v) => v.source.site === 'd4builds') ?? build.variants[0]!;

  const variantes = pagina.porVariante.map((crudo) => {
    const etiqueta = pagina.variantes.find((v) => v.index === crudo.index)?.etiqueta ?? null;
    return construirVariante(
      base,
      crudo,
      pagina.capturadoEn,
      resolver,
      etiqueta,
      mercenarioPorHabilidad,
      nombreDeNodo,
    );
  });

  // Las variantes distintas de la primera no traen habilidades propias todavia: la fuente
  // las publica, pero el extractor aun no las lee. Se marca en `completeness` para que la
  // ficha lo diga en vez de aparentar que esa variante no usa habilidades.
  const finales = variantes.length > 0 ? variantes : build.variants;

  const enriquecida: CanonicalBuild = {
    ...build,
    variants: finales,
    primaryVariantId: pickPrimaryVariant(finales).id,
    consensus: computeConsensus(finales),
    updatedAt: pagina.capturadoEn > build.updatedAt ? pagina.capturadoEn : build.updatedAt,
  };

  const principal = finales.find((v) => v.id === enriquecida.primaryVariantId) ?? finales[0]!;
  return {
    build: enriquecida,
    relleno: {
      gear: Object.keys(principal.gear).length,
      paragon: principal.paragon.boards.length,
      mercenarios: principal.mercenary ? 1 : 0,
      variantesExtra: Math.max(0, finales.length - 1),
    },
  };
}

export const SLOTS_CONOCIDOS: readonly string[] = SLOT_IDS;
