import { describe, expect, it } from 'vitest';
import { translatedRef, untranslatedRef, type CanonicalBuild } from '@d4es/schema';
import { contarMeta, nucleoDeClase } from './meta';
import { datosEvaluador } from './objetos';

/** Build de laboratorio: solo lo que estas dos funciones miran. */
function build(
  id: string,
  opts: {
    clase?: string;
    unico?: string;
    aspecto?: string;
    glifo?: string;
    afijos?: string[];
  } = {},
): CanonicalBuild {
  const { clase = 'barbarian', unico, aspecto, glifo, afijos = [] } = opts;
  const ref = (en: string, es: string | null, cat: string) =>
    es === null
      ? untranslatedRef({ idName: `${cat}__${en}`, category: cat as never, enUS: en })
      : translatedRef({
          idName: `${cat}__${en}`,
          category: cat as never,
          enUS: en,
          esES: es,
          i18n: 'd4companion',
        });

  const variante = {
    id: `${id}:0`,
    source: {
      site: 'd4builds' as const,
      externalId: id,
      variantIndex: 0,
      variantLabel: null,
      url: 'https://d4builds.gg/builds/x/',
      author: null,
      capturedAt: '2026-08-09T00:00:00.000Z',
      snapshotHash: 'a'.repeat(64),
      provenance: 'server-scrape' as const,
    },
    levelBand: 'endgame' as const,
    skills: [],
    gear: {
      helm: {
        slot: 'helm' as const,
        item: unico ? ref(unico, `${unico} ES`, 'unique') : null,
        quality: (unico ? 'unique' : 'legendary') as 'unique' | 'legendary',
        mythic: { isMythic: false, craftPath: null },
        aspect: aspecto ? ref(aspecto, `${aspecto} ES`, 'aspect') : null,
        affixes: afijos.map((a, i) => ({
          ref: ref(a, `${a} ES`, 'affix'),
          greater: false,
          tempered: false,
          order: i,
        })),
        sockets: [],
        minItemPower: null,
        icon: null,
      },
    },
    paragon: {
      level: 300,
      boards: glifo
        ? [
            {
              ref: ref('Starting Board', 'Tablero inicial', 'paragonBoard'),
              order: 0,
              rotation: 0 as const,
              glyph: { ref: ref(glifo, `${glifo} ES`, 'glyph'), rank: null },
              tiles: [],
            },
          ]
        : [],
    },
    talisman: null,
    runewords: [],
    mercenary: null,
    warPlan: null,
    completeness: {
      hasSkills: false,
      hasGear: true,
      hasParagon: Boolean(glifo),
      hasTalisman: false,
      hasMercenary: false,
      hasWarPlan: false,
      score: 0.5,
    },
  };

  return {
    id,
    correlationKey: `k::${id}`,
    classId: clase,
    title: { es: `Build ${id}`, en: `Build ${id}` },
    summary: { es: null, en: null },
    tags: { playstyle: [], content: [], element: [] },
    ratings: { tierLabel: 'S', tierRank: 1, pitTier: 150 },
    gameVersion: { patch: '3.1.2', season: 14 },
    variants: [variante],
    primaryVariantId: variante.id,
    consensus: { variantCount: 1, coreSkills: [], coreUniques: [], fields: [] },
    updatedAt: '2026-08-09T00:00:00.000Z',
  } as CanonicalBuild;
}

describe('contarMeta', () => {
  it('cuenta una vez por build, no por aparicion', () => {
    const cats = contarMeta([
      build('a', { unico: 'Shako' }),
      build('b', { unico: 'Shako' }),
      build('c', { unico: 'Otro' }),
    ]);
    const unicos = cats.find((c) => c.id === 'unicos')!;
    expect(unicos.filas[0]).toMatchObject({ en: 'Shako', builds: 2, de: 3 });
  });

  it('ordena por uso y desempata por nombre, para no depender del orden de entrada', () => {
    const a = contarMeta([build('1', { unico: 'Zeta' }), build('2', { unico: 'Alfa' })]);
    const b = contarMeta([build('2', { unico: 'Alfa' }), build('1', { unico: 'Zeta' })]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('no publica categorias vacias', () => {
    const cats = contarMeta([build('a')]);
    expect(cats.map((c) => c.id)).not.toContain('mercenarios');
  });
});

describe('nucleoDeClase', () => {
  it('saca lo que lleva la mayoria, y deja fuera lo minoritario', () => {
    const builds = [
      build('a', { unico: 'Comun', glifo: 'Raro' }),
      build('b', { unico: 'Comun' }),
      build('c', { unico: 'Comun' }),
      build('d', { unico: 'Suyo' }),
    ];
    const n = nucleoDeClase(builds);
    expect(n.map((x) => x.en)).toContain('Comun');
    expect(n.map((x) => x.en)).not.toContain('Suyo');
  });

  it('con muy pocas builds no dice nada: tres datos no son un patron', () => {
    expect(nucleoDeClase([build('a', { unico: 'X' }), build('b', { unico: 'X' })])).toEqual([]);
  });
});

describe('datosEvaluador', () => {
  const nombre = (id: string) => (id === 'barbarian' ? 'Bárbaro' : id);
  const url = (b: { classSlug: string; id: string }) => `/builds/${b.classSlug}/${b.id}`;

  it('empaqueta los afijos por indice y conserva su orden de prioridad', () => {
    const d = datosEvaluador([build('a', { afijos: ['Vida', 'Fuerza', 'Armadura'] })], nombre, url);
    expect(d.afijos).toEqual(['Vida ES', 'Fuerza ES', 'Armadura ES']);
    expect(d.builds[0]!.ranuras['helm']).toEqual([0, 1, 2]);
  });

  it('no repite un afijo dentro de la misma ranura', () => {
    // Pasa de verdad: el afijo normal y su version templada acaban con el mismo texto.
    const d = datosEvaluador([build('a', { afijos: ['Vida', 'Vida', 'Fuerza'] })], nombre, url);
    expect(d.builds[0]!.ranuras['helm']).toEqual([0, 1]);
  });

  it('marca los afijos sin traduccion para que la web les ponga su distintivo', () => {
    const b = build('a', { afijos: ['Vida'] });
    b.variants[0]!.gear['helm']!.affixes[0]!.ref = untranslatedRef({
      idName: 'affix__x',
      category: 'affix',
      enUS: 'Primary Core Stat',
    });
    const d = datosEvaluador([b], nombre, url);
    expect(d.afijos).toEqual(['Primary Core Stat']);
    expect(d.sinTraducir).toEqual([0]);
  });
});
