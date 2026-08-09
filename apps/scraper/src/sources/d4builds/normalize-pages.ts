import {
  SLOT_IDS,
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
  const afijos = (bloque?.afijos ?? []).map((a, i) => ({
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
      .map((e) => resolver.resolve('rune', e.nombre)),
    minItemPower: null,
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
    .filter((b) => b.tablero.length > 0)
    .slice(0, 9)
    .map((b, i) => ({
      ref: resolver.resolve('paragonBoard', b.tablero),
      order: i,
      rotation: null,
      glyph: b.glifo
        ? {
            ref: resolver.resolve('glyph', b.glifo),
            // Si la fuente no publica el nivel, se queda en null y la ficha no lo pinta.
            rank: b.nivelGlifo === null ? null : Math.min(Math.max(b.nivelGlifo, 1), 150),
          }
        : null,
    }));

  const merc = crudo.mercenarios[0];
  const mercenary = merc
    ? {
        ref: resolver.resolve('mercenary', merc.nombre),
        skills: merc.habilidades.filter(Boolean).map((h) => resolver.resolve('skill', h)),
        reinforcement: crudo.mercenarios[1] ? resolver.resolve('mercenary', crudo.mercenarios[1].nombre) : null,
      }
    : null;

  const flags = {
    hasSkills: base.skills.length > 0,
    hasGear: Object.keys(gear).length > 0,
    hasParagon: boards.length > 0,
    hasTalisman: false,
    hasMercenary: mercenary !== null,
    hasWarPlan: crudo.warPlans.length > 0,
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
    paragon: { level: null, boards },
    mercenary,
    warPlan:
      crudo.warPlans.length > 0
        ? {
            route: crudo.warPlans.slice(0, 5).map((w) => resolver.resolve('warPlanNode', w.nombre)),
            trees: [],
            inferred: false,
          }
        : null,
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
): EnriquecerResultado {
  const base = build.variants.find((v) => v.source.site === 'd4builds') ?? build.variants[0]!;

  const variantes = pagina.porVariante.map((crudo) => {
    const etiqueta = pagina.variantes.find((v) => v.index === crudo.index)?.etiqueta ?? null;
    return construirVariante(base, crudo, pagina.capturadoEn, resolver, etiqueta);
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
