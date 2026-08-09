import { describe, expect, it } from 'vitest';
import { Resolver, type Dictionary } from '@d4es/i18n';
import { CanonicalBuild, untranslatedRef, type BuildVariant } from '@d4es/schema';
import { enriquecerConPagina, limpiarNombreTablero } from './normalize-pages.js';
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
        mercenarios: [{ nombre: 'Raheir', rol: 'Shieldbearer', habilidades: ['Ground Slam'], icono: null }],
        warPlans: [],
        debug: {},
        ...overrides,
      },
    ],
  };
}

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
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict));
    const gear = build.variants[0]!.gear;
    expect(Object.keys(gear).sort()).toEqual(['boots', 'helm', 'ring1']);
    expect(gear['helm']?.item?.esES).toBe('Yelmo colmillado de Joritz el Poderoso');
  });

  it('distingue un aspecto de un objeto unico', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict));
    const botas = build.variants[0]!.gear['boots']!;
    expect(botas.item).toBeNull();
    expect(botas.aspect?.esES).toBe('Aspecto de sobrecalentamiento');
    expect(botas.quality).toBe('legendary');
  });

  it('marca la calidad mitica sin confundirla con la rareza', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict));
    const anillo = build.variants[0]!.gear['ring1']!;
    expect(anillo.mythic.isMythic).toBe(true);
    expect(anillo.quality).toBe('unique');
  });

  it('conserva afijo superior y templado', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict));
    const afijos = build.variants[0]!.gear['helm']!.affixes;
    expect(afijos[0]?.greater).toBe(true);
    expect(afijos[0]?.ref.esES).toBe('de reducción de tiempo de reutilización');
    expect(afijos[1]?.tempered).toBe(true);
  });

  it('trae los engarces', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict));
    expect(build.variants[0]!.gear['helm']!.sockets).toHaveLength(1);
  });

  it('trae el tablero de paragon con su glifo traducido', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict));
    const boards = build.variants[0]!.paragon.boards;
    expect(boards).toHaveLength(1);
    expect(boards[0]?.ref.esES).toBe('Bebedor de sangre');
    expect(boards[0]?.glyph?.ref.esES).toBe('Poderío');
    expect(boards[0]?.glyph?.rank).toBe(100);
  });

  it('conserva las habilidades del catalogo: la pagina no las pisa', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict));
    expect(build.variants[0]!.skills).toHaveLength(1);
    expect(build.variants[0]!.skills[0]?.rank).toBe(15);
  });

  it('sube la completitud al aportar equipo, paragon y mercenario', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict));
    const c = build.variants[0]!.completeness;
    expect(c.hasGear).toBe(true);
    expect(c.hasParagon).toBe(true);
    expect(c.hasMercenary).toBe(true);
    expect(c.score).toBeGreaterThan(varianteBase.completeness.score);
  });

  it('el resultado sigue validando contra el esquema canonico', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(dict));
    expect(CanonicalBuild.safeParse(build).success).toBe(true);
  });

  it('es determinista', () => {
    const a = enriquecerConPagina(buildBase, pagina(), new Resolver(dict)).build;
    const b = enriquecerConPagina(buildBase, pagina(), new Resolver(dict)).build;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('sin diccionario no inventa: todo queda en ingles y sin procedencia', () => {
    const { build } = enriquecerConPagina(buildBase, pagina(), new Resolver(diccionario([])));
    const casco = build.variants[0]!.gear['helm']!;
    expect(casco.item?.esES).toBeNull();
    expect(casco.item?.i18n).toBe('none');
  });

  it('omite una pieza cuya ranura no reconoce en vez de colocarla a ciegas', () => {
    const p = pagina();
    p.porVariante[0]!.gear.push({ slot: 'Ranura Inventada', nombre: 'Algo', calidad: null, icono: null, engarces: [] });
    const { build } = enriquecerConPagina(buildBase, p, new Resolver(dict));
    expect(Object.keys(build.variants[0]!.gear)).toHaveLength(3);
  });
});
