import { describe, expect, it } from 'vitest';
import { Resolver, type Dictionary } from '@d4es/i18n';
import { CanonicalBuild, untranslatedRef, type BuildVariant } from '@d4es/schema';
import {
  enriquecerConPagina,
  esAfijoDeVerdad,
  esGema,
  limpiarNombreTablero,
  nombreDesdeSlug,
  slugDeNodo,
} from './normalize-pages.js';
import type { PaginaRaw } from './scrape-pages.js';

function diccionario(entradas: { category: string; en: string; es: string }[]): Dictionary {
  const dict: Dictionary = {
    meta: { generatedAt: '2026-08-09T00:00:00.000Z', sourceRepo: 't', sourceSha: 'x', counts: {}, curatedCounts: {} },
    byIdName: {},
    byEnglish: {},
  };
  for (const e of entradas) {
    const item = { idName: e.en, sno: null, category: e.category, en: e.en, es: e.es, source: 'd4companion' as const };
    dict.byIdName[`${e.category}:${e.en}`] = item;
    dict.byEnglish[`${e.category}:${e.en.toLowerCase()}`] = item;
  }
  return dict;
}

const varianteBase: BuildVariant = {
  id: 'd4builds:uuid-1:0',
  source: {
    site: 'd4builds',
    externalId: 'uuid-1',
    variantIndex: 0,
    variantLabel: null,
    url: 'https://d4builds.gg/builds/x/',
    author: 'Rob2628',
    capturedAt: '2026-08-08T00:00:00.000Z',
    snapshotHash: 'a'.repeat(64),
    provenance: 'server-scrape',
  },
  levelBand: 'endgame',
  skills: [
    {
      ref: untranslatedRef({ idName: 'skill__charge', category: 'skill', enUS: 'Charge' }),
      order: 0,
      rank: 15,
      skillVariant: null,
      runes: [],
      category: 'unknown',
    },
  ],
  gear: {},
  paragon: { level: null, boards: [] },
  talisman: null,
  runewords: [],
  mercenary: null,
  warPlan: null,
  completeness: {
    hasSkills: true,
    hasGear: false,
    hasParagon: false,
    hasTalisman: false,
    hasMercenary: false,
    hasWarPlan: false,
    score: 0.35,
  },
};

const buildBase: CanonicalBuild = CanonicalBuild.parse({
  id: 'charge-barbarian-endgame',
  correlationKey: 'barbarian::skill__charge::generic',
  classId: 'barbarian',
  title: { es: 'Carga', en: 'Charge' },
  summary: { es: null, en: null },
  tags: { playstyle: [], content: ['endgame'], element: [] },
  ratings: { tierLabel: 'S', tierRank: 1, pitTier: 150 },
  gameVersion: { patch: '3.1.2', season: 14 },
  variants: [varianteBase],
  primaryVariantId: varianteBase.id,
  consensus: { variantCount: 1, coreSkills: [], coreUniques: [], fields: [] },
  updatedAt: '2026-08-08T00:00:00.000Z',
});

function pagina(overrides: Partial<PaginaRaw['porVariante'][number]> = {}): PaginaRaw {
  return {
    buildId: 'uuid-1',
    url: 'https://d4builds.gg/builds/uuid-1/?var=0',
    capturadoEn: '2026-08-09T10:00:00.000Z',
    pestanas: ['Gear & Skills', 'Skill Tree', 'Paragon', 'Mercenaries', 'War Plans', 'Notes'],
    variantes: [{ index: 0, etiqueta: 'Standard Build' }],
    porVariante: [
      {
        index: 0,
        etiqueta: 'Standard Build',
        gear: [
          {
            slot: 'Helm',
            nombre: 'Tuskhelm of Joritz the Mighty',
            calidad: 'unique',
            icono: 'https://sunderarmor.com/DIABLO4/Uniques/2/tuskhelm.png',
            engarces: [{ nombre: 'Noc', tipo: 'ritual', icono: null }],
          },
          {
            slot: 'Boots',
            nombre: 'Overheating Aspect',
            calidad: null,
            icono: null,
            engarces: [],
          },
          {
            slot: 'Ring 1',
            nombre: 'Ring of Starless Skies',
            calidad: 'mythic',
            icono: null,
            engarces: [],
          },
        ],
        stats: [
          {
            slot: 'Helm',
            afijos: [
              { texto: 'Cooldown Reduction', templado: false, ga: 1 },
              { texto: 'Maximum Life', templado: true, ga: 0 },
            ],
          },
        ],
        arbol: [],
        paragon: [{ tablero: 'Blood Drinker', glifo: 'Might', nivelGlifo: 100, icono: null }],
        // La fuente muestra HABILIDADES de mercenario, no el mercenario en si.
        // El arbol del mercenario tal como lo publica la fuente: se publica ENTERO, con
        // las disponibles y las cogidas, y solo cuentan las que llevan --active.
        mercenarios: {
          etiquetas: ['Mercenary', 'Reinforcement'],
          nodos: [
            {
              nombre: 'Ground Slam',
              slug: 'ground_slam',
              clases: ['r1', 'c1', 'skill__tree__item--active', 'ground_slam'],
              puntos: 1,
              maximo: 1,
              x: 100,
              y: 200,
            },
            {
              nombre: 'Consecrated Shield',
              slug: 'consecrated_shield',
              clases: ['r1', 'c2', 'consecrated_shield'],
              puntos: 0,
              maximo: 1,
              x: 300,
              y: 200,
            },
          ],
        },
        paragonNivel: 287,
        warPlans: [],
        debug: {},
        ...overrides,
      },
    ],
  };
}

/** habilidad de mercenario -> mercenario al que pertenece, como en el dataset real. */
const duenos = new Map([['ground slam', 'Raheir, The Shieldbearer']]);

const dict = diccionario([
  { category: 'unique', en: 'Tuskhelm of Joritz the Mighty', es: 'Yelmo colmillado de Joritz el Poderoso' },
  { category: 'aspect', en: 'Overheating Aspect', es: 'Aspecto de sobrecalentamiento' },
  { category: 'affix', en: 'Cooldown Reduction', es: 'de reducción de tiempo de reutilización' },
  { category: 'paragonBoard', en: 'Blood Drinker', es: 'Bebedor de sangre' },
  { category: 'glyph', en: 'Might', es: 'Poderío' },
]);

describe('limpiarNombreTablero', () => {
  it('quita el numero de orden y las estadisticas pegadas', () => {
    expect(limpiarNombreTablero('2Carnage Str 110•Dex 59•Int 20')).toBe('Carnage');
    expect(limpiarNombreTablero('1Starting Board Str 105•Dex 59')).toBe('Starting Board');
  });

  it('deja intacto un nombre que ya viene limpio', () => {
    expect(limpiarNombreTablero('Blood Drinker')).toBe('Blood Drinker');
  });
});

describe('enriquecerConPagina', () => {
  it('coloca cada pieza en su ranura', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict), duenos);
    const gear = build.variants[0]!.gear;
    expect(Object.keys(gear).sort()).toEqual(['boots', 'helm', 'ring1']);
    expect(gear['helm']?.item?.esES).toBe('Yelmo colmillado de Joritz el Poderoso');
  });

  it('distingue un aspecto de un objeto unico', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict), duenos);
    const botas = build.variants[0]!.gear['boots']!;
    expect(botas.item).toBeNull();
    expect(botas.aspect?.esES).toBe('Aspecto de sobrecalentamiento');
    expect(botas.quality).toBe('legendary');
  });

  it('marca la calidad mitica sin confundirla con la rareza', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict), duenos);
    const anillo = build.variants[0]!.gear['ring1']!;
    expect(anillo.mythic.isMythic).toBe(true);
    expect(anillo.quality).toBe('unique');
  });

  it('conserva afijo superior y templado', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict), duenos);
    const afijos = build.variants[0]!.gear['helm']!.affixes;
    expect(afijos[0]?.greater).toBe(true);
    expect(afijos[0]?.ref.esES).toBe('de reducción de tiempo de reutilización');
    expect(afijos[1]?.tempered).toBe(true);
  });

  it('trae los engarces', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict), duenos);
    expect(build.variants[0]!.gear['helm']!.sockets).toHaveLength(1);
  });

  it('trae el tablero de paragon con su glifo traducido', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict), duenos);
    const boards = build.variants[0]!.paragon.boards;
    expect(boards).toHaveLength(1);
    expect(boards[0]?.ref.esES).toBe('Bebedor de sangre');
    expect(boards[0]?.glyph?.ref.esES).toBe('Poderío');
    expect(boards[0]?.glyph?.rank).toBe(100);
  });

  it('conserva las habilidades del catalogo: la pagina no las pisa', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict), duenos);
    expect(build.variants[0]!.skills).toHaveLength(1);
    expect(build.variants[0]!.skills[0]?.rank).toBe(15);
  });

  it('sube la completitud al aportar equipo, paragon y mercenario', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict), duenos);
    const c = build.variants[0]!.completeness;
    expect(c.hasGear).toBe(true);
    expect(c.hasParagon).toBe(true);
    expect(c.hasMercenary).toBe(true);
    expect(c.score).toBeGreaterThan(varianteBase.completeness.score);
  });

  it('el resultado sigue validando contra el esquema canonico', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict), duenos);
    expect(CanonicalBuild.safeParse(build).success).toBe(true);
  });

  it('es determinista', () => {
    const a = enriquecerConPagina(buildBase, pagina(), new Resolver(dict), duenos).build;
    const b = enriquecerConPagina(buildBase, pagina(), new Resolver(dict), duenos).build;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('sin diccionario no inventa: todo queda en ingles y sin procedencia', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(diccionario([])), duenos);
    const casco = build.variants[0]!.gear['helm']!;
    expect(casco.item?.esES).toBeNull();
    expect(casco.item?.i18n).toBe('none');
  });

  it('omite una pieza cuya ranura no reconoce en vez de colocarla a ciegas', () => {
    const p = pagina();
    p.porVariante[0]!.gear.push({ slot: 'Ranura Inventada', nombre: 'Algo', calidad: null, icono: null, engarces: [] });
    const { build } = enriquecerConPagina(buildBase, p, new Resolver(dict), duenos);
    expect(Object.keys(build.variants[0]!.gear)).toHaveLength(3);
  });
});

/**
 * Nodos reales de la solapa de Susurros, copiados de la sonda del DOM
 * (data/reports/probe): un nodo de categoria, tres circulos invertidos, rombos sin
 * contador y circulos sin coger. Es la mezcla exacta que publica la fuente.
 */
const PLAN_SUSURROS = {
  actividad: 'Whispers',
  slug: 'whispers',
  icono: 'https://sunderarmor.com/DIABLO4/WarPlans/whispers.png',
  restantes: 4,
  lineas: [{ x1: 380, y1: 213, x2: 580, y2: 154 }],
  nodos: [
    { clases: ['category', 'unlocked'], iconos: ['category_active', 'category_whispers'], texto: null, x: 580, y: 154 },
    { clases: ['large-circle', 'allocated'], iconos: ['passive_active', 'corrupted_roots'], texto: '1/1', x: 380, y: 213 },
    { clases: ['large-circle', 'allocated'], iconos: ['passive_active', 'roots_of_power'], texto: '1/1', x: 279, y: 317 },
    { clases: ['diamond', 'allocated'], iconos: ['skill_minor_active', 'tree_of_plenty'], texto: '1/1', x: 498, y: 316 },
    { clases: ['diamond', 'locked'], iconos: ['skill_minor_inactive', 'fortune_or_famine'], texto: null, x: 429, y: 489 },
    { clases: ['large-circle', 'available'], iconos: ['passive_inactive', 'grim_mysteries'], texto: '0/1', x: 505, y: 647 },
  ],
};

describe('planes de guerra', () => {
  const nombres = new Map([
    ['corrupted roots', 'Corrupted Roots'],
    ['roots of power', 'Roots of Power'],
    ['tree of plenty', 'Tree of Plenty'],
  ]);
  const nombreDeNodo = (slug: string) => nombres.get(slug.replace(/_/g, ' ')) ?? null;

  function conPlanes(planes: unknown[]) {
    const p = pagina();
    p.porVariante[0]!.warPlans = planes as PaginaRaw['porVariante'][number]['warPlans'];
    return enriquecerConPagina(buildBase, p, new Resolver(dict), duenos, nombreDeNodo);
  }

  it('coge solo los nodos invertidos: ni categoria, ni disponibles, ni bloqueados', () => {
    const { build } = conPlanes([PLAN_SUSURROS]);
    const plan = build.variants[0]!.warPlan!;
    expect(plan.activities).toHaveLength(1);
    expect(plan.activities[0]!.nodes.map((n) => n.ref.enUS)).toEqual([
      'Corrupted Roots',
      'Roots of Power',
      'Tree of Plenty',
    ]);
    expect(plan.activities[0]!.spent).toBe(3);
    expect(plan.activities[0]!.remaining).toBe(4);
  });

  it('distingue el rombo (nodo menor) del circulo (nodo mayor)', () => {
    const { build } = conPlanes([PLAN_SUSURROS]);
    expect(build.variants[0]!.warPlan!.activities[0]!.nodes.map((n) => n.minor)).toEqual([false, false, true]);
  });

  it('descarta el fondo del icono y se queda con el fichero que lleva el nombre', () => {
    expect(slugDeNodo(['passive_active', 'corrupted_roots'])).toBe('corrupted_roots');
    expect(slugDeNodo(['skill_minor_inactive', 'fortune_or_famine'])).toBe('fortune_or_famine');
    expect(slugDeNodo(['category_active', 'category_whispers'])).toBeNull();
  });

  it('sin dataset cae al nombre deducido del slug, siempre en ingles', () => {
    const p = pagina();
    p.porVariante[0]!.warPlans = [PLAN_SUSURROS] as PaginaRaw['porVariante'][number]['warPlans'];
    const { build } = enriquecerConPagina(buildBase, p, new Resolver(dict), duenos);
    const nodos = build.variants[0]!.warPlan!.activities[0]!.nodes;
    expect(nodos[0]!.ref.enUS).toBe('Corrupted Roots');
    expect(nodos[0]!.ref.esES).toBeNull();
    expect(nodos[0]!.ref.i18n).toBe('none');
    expect(nombreDesdeSlug('choron\'s_haste')).toBe("Choron's Haste");
  });

  it('una actividad sin puntos invertidos no se publica', () => {
    const vacia = { ...PLAN_SUSURROS, slug: 'pits', restantes: 7, nodos: [PLAN_SUSURROS.nodos[0], PLAN_SUSURROS.nodos[5]] };
    const { build } = conPlanes([PLAN_SUSURROS, vacia]);
    expect(build.variants[0]!.warPlan!.activities.map((a) => a.slug)).toEqual(['whispers']);
  });

  it('sin ningun punto en ninguna actividad no hay plan que publicar', () => {
    const vacia = { ...PLAN_SUSURROS, restantes: 7, nodos: [PLAN_SUSURROS.nodos[0]] };
    const { build } = conPlanes([vacia]);
    expect(build.variants[0]!.warPlan).toBeNull();
    expect(build.variants[0]!.completeness.hasWarPlan).toBe(false);
  });

  it('el plan extraido sigue validando contra el esquema canonico', () => {
    const { build } = conPlanes([PLAN_SUSURROS]);
    expect(CanonicalBuild.safeParse(build).success).toBe(true);
  });
});

/**
 * La lista de "stats" de la fuente lleva dentro cosas de su interfaz. Publicarlas metia
 * en la ficha 869 lineas que no existen en el juego, en ingles y marcadas como sin
 * traducir: era la primera causa de "sin traducir" de todo el proyecto.
 */
describe('esAfijoDeVerdad', () => {
  it('descarta el boton de transfiguracion, que sale en CADA ranura', () => {
    expect(esAfijoDeVerdad('Transfigure')).toBe(false);
  });

  it('descarta el selector de tipo de arma', () => {
    expect(esAfijoDeVerdad('Weapon Type')).toBe(false);
  });

  it('descarta los huecos del formulario sin rellenar', () => {
    expect(esAfijoDeVerdad('Stat 1')).toBe(false);
    expect(esAfijoDeVerdad('Tempering Stat 1')).toBe(false);
  });

  it('descarta el aspecto, que ya se publica como nombre de la pieza', () => {
    expect(esAfijoDeVerdad('Aspect of Gloom')).toBe(false);
    expect(esAfijoDeVerdad('Overcharged Aspect')).toBe(false);
  });

  it('deja pasar los afijos de verdad, incluido el grupo de templado pegado', () => {
    expect(esAfijoDeVerdad('Maximum Life')).toBe(true);
    expect(esAfijoDeVerdad('Cooldown Reduction (Worldly Stability - Resource)')).toBe(true);
    expect(esAfijoDeVerdad('Critical Strike Damage')).toBe(true);
  });
});

/**
 * Una gema no es una runa, aunque las dos se engarcen. Publicarlas todas como runa hacia
 * que "Diamond", "Ruby"... se buscaran en la lista de runas del juego, donde no estan:
 * 701 apariciones sin traducir por una etiqueta mal puesta.
 */
describe('esGema', () => {
  it('se fia de la carpeta del CDN, que es el dato fiable', () => {
    expect(esGema({ tipo: 'grand-diamond', icono: 'https://x/DIABLO4/Gems/grand-diamond.png' })).toBe(true);
    expect(esGema({ tipo: 'ritual', icono: 'https://x/DIABLO4/Runes/ritual.png' })).toBe(false);
  });

  it('sin icono se cae al tipo, que es la otra pista que publica la fuente', () => {
    expect(esGema({ tipo: 'grand-ruby', icono: null })).toBe(true);
    expect(esGema({ tipo: 'invocation', icono: null })).toBe(false);
  });

  it('una runa que se llame como una gema no se confunde si hay icono', () => {
    expect(esGema({ tipo: 'skull', icono: 'https://x/DIABLO4/Runes/skull.png' })).toBe(false);
  });
});

/**
 * El extractor anterior leia la barra de habilidades del JUGADOR creyendo que era el
 * mercenario, asi que cada build publicaba una sola "habilidad de mercenario" y a veces
 * era una habilidad de la clase.
 */
describe('mercenario', () => {
  it('coge solo las habilidades marcadas como cogidas, no el arbol entero', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict), duenos);
    const m = build.variants[0]!.mercenary!;
    expect(m.skills.map((s) => s.enUS)).toEqual(['Ground Slam']);
    expect(m.ref.enUS).toBe('Raheir, The Shieldbearer');
  });

  it('sin ninguna cogida no publica mercenario', () => {
    const p = pagina();
    for (const n of p.porVariante[0]!.mercenarios.nodos) {
      n.clases = n.clases.filter((c) => c !== 'skill__tree__item--active');
    }
    const { build } = enriquecerConPagina(buildBase, p, new Resolver(dict), duenos);
    expect(build.variants[0]!.mercenary).toBeNull();
    expect(build.variants[0]!.completeness.hasMercenary).toBe(false);
  });

  it('publica el nivel de Paragon que trae la pagina', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict), duenos);
    expect(build.variants[0]!.paragon.level).toBe(287);
  });

  it('deduplica las habilidades: el DOM trae cada nodo por triplicado', () => {
    const p = pagina();
    const nodos = p.porVariante[0]!.mercenarios.nodos;
    const activo = nodos[0]!;
    // Tres copias identicas del mismo nodo cogido, como en el DOM real (57 = 19 x 3).
    nodos.unshift({ ...activo }, { ...activo });
    const { build } = enriquecerConPagina(buildBase, p, new Resolver(dict), duenos);
    expect(build.variants[0]!.mercenary!.skills.map((s) => s.enUS)).toEqual(['Ground Slam']);
  });
});

describe('paragon: giro y casillas', () => {
  const conCasillas = () =>
    pagina({
      paragon: [
        {
          tablero: 'Blood Drinker',
          glifo: 'Might',
          nivelGlifo: null,
          icono: null,
          giro: 540,
          casillas: [
            'r2c10:Will:common:enabled',
            'r2c11:Will:common:active:enabled',
            'r3c11:Glyph:rare:active',
            'r7c6:Int:magic',
          ],
        },
      ],
    });

  it('normaliza el giro acumulado de la fuente y lo publica', () => {
    const { build } = enriquecerConPagina(buildBase, conCasillas(), new Resolver(dict), duenos);
    expect(build.variants[0]!.paragon.boards[0]!.rotation).toBe(180);
  });

  it('publica solo las casillas que la build recorre, compactas', () => {
    const { build } = enriquecerConPagina(buildBase, conCasillas(), new Resolver(dict), duenos);
    expect(build.variants[0]!.paragon.boards[0]!.tiles).toEqual(['r2c11', 'r3c11']);
  });

  it('tolera un crudo antiguo sin giro ni casillas', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict), duenos);
    const board = build.variants[0]!.paragon.boards[0]!;
    expect(board.rotation).toBeNull();
    expect(board.tiles).toEqual([]);
  });
});

describe('previsualizacion de equipo', () => {
  it('conserva la imagen con que la fuente pinta la pieza', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict), duenos);
    expect(build.variants[0]!.gear['helm']!.icon).toBe(
      'https://sunderarmor.com/DIABLO4/Uniques/2/tuskhelm.png',
    );
    // Y tolera piezas sin imagen (crudos antiguos o fallos de la fuente).
    expect(build.variants[0]!.gear['boots']!.icon).toBeNull();
  });
});
