import { describe, expect, it } from 'vitest';
import { untranslatedRef, translatedRef, type CanonicalBuild } from '@d4es/schema';
import { calcularHistorial, firmaDeBuild } from './historial.js';

/** Build minima pero valida, con lo justo para que la firma tenga de que tirar. */
function build(id: string, opts: Partial<{ tier: string; casco: string; glifo: string }> = {}): CanonicalBuild {
  const { tier = 'S', casco = 'Tuskhelm', glifo = 'Might' } = opts;
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
    skills: [
      {
        ref: untranslatedRef({ idName: 'skill__charge', category: 'skill', enUS: 'Charge' }),
        order: 0,
        rank: 5,
        skillVariant: null,
        runes: [],
        category: 'unknown' as const,
      },
    ],
    gear: {
      helm: {
        slot: 'helm' as const,
        item: translatedRef({
          idName: `unique__${casco}`,
          category: 'unique',
          enUS: casco,
          esES: `${casco} en castellano`,
          i18n: 'd4companion' as const,
        }),
        quality: 'unique' as const,
        mythic: { isMythic: false, craftPath: null },
        aspect: null,
        affixes: [],
        sockets: [],
        minItemPower: null,
        icon: null,
      },
    },
    paragon: {
      level: 300,
      boards: [
        {
          ref: untranslatedRef({ idName: 'pb__start', category: 'paragonBoard', enUS: 'Starting Board' }),
          order: 0,
          rotation: 0,
          glyph: {
            ref: untranslatedRef({ idName: `glyph__${glifo}`, category: 'glyph', enUS: glifo }),
            rank: null,
          },
          tiles: [],
        },
      ],
    },
    talisman: null,
    runewords: [],
    mercenary: null,
    warPlan: null,
    completeness: {
      hasSkills: true,
      hasGear: true,
      hasParagon: true,
      hasTalisman: false,
      hasMercenary: false,
      hasWarPlan: false,
      score: 0.6,
    },
  };
  return {
    id,
    correlationKey: `k::${id}`,
    classId: 'barbarian',
    title: { es: id, en: id },
    summary: { es: null, en: null },
    tags: { playstyle: [], content: [], element: [] },
    ratings: { tierLabel: tier, tierRank: 1, pitTier: 150 },
    gameVersion: { patch: '3.1.2', season: 14 },
    variants: [variante],
    primaryVariantId: variante.id,
    consensus: { variantCount: 1, coreSkills: [], coreUniques: [], fields: [] },
    updatedAt: '2026-08-09T00:00:00.000Z',
  } as CanonicalBuild;
}

const FECHA1 = '2026-08-09T00:00:00.000Z';
const FECHA2 = '2026-08-10T00:00:00.000Z';

describe('firmaDeBuild', () => {
  it('recoge tier, habilidades, equipo, tableros y glifos', () => {
    const f = firmaDeBuild(build('a'));
    const claves = Object.keys(f).map((k) => k.split('\u0001')[0]);
    expect(new Set(claves)).toEqual(new Set(['tier', 'pit', 'habilidad', 'equipo', 'tablero', 'glifo']));
  });

  it('no mira el orden de la barra: la clave es el nombre de la habilidad', () => {
    const a = build('a');
    const b = build('a');
    b.variants[0]!.skills[0]!.order = 4;
    expect(firmaDeBuild(a)).toEqual(firmaDeBuild(b));
  });
});

describe('calcularHistorial', () => {
  it('la primera pasada solo siembra: no inventa cambios', () => {
    const r = calcularHistorial([build('a'), build('b')], null, FECHA1);
    expect(r.conCambios).toBe(0);
    expect(r.historial.pasadas).toBe(1);
    expect(r.historial.builds['a']!.entradas).toEqual([]);
    expect(Object.keys(r.historial.builds['a']!.firma).length).toBeGreaterThan(0);
  });

  it('registra el cambio de una sola build como cambio de la fuente', () => {
    const antes = calcularHistorial([build('a'), build('b'), build('c'), build('d')], null, FECHA1);
    const despues = calcularHistorial(
      [build('a', { casco: 'Otro' }), build('b'), build('c'), build('d')],
      antes.historial,
      FECHA2,
    );
    expect(despues.conCambios).toBe(1);
    const entrada = despues.historial.builds['a']!.entradas[0]!;
    expect(entrada.ambito).toBe('fuente');
    expect(entrada.fecha).toBe(FECHA2);
    expect(entrada.cambios).toHaveLength(1);
    expect(entrada.cambios[0]).toMatchObject({ tipo: 'equipo', donde: 'helm' });
    expect(entrada.cambios[0]!.antes?.en).toBe('Tuskhelm');
    expect(entrada.cambios[0]!.despues?.en).toBe('Otro');
    // Y las que no cambiaron siguen sin historia.
    expect(despues.historial.builds['b']!.entradas).toEqual([]);
  });

  it('cuando cambia medio catalogo a la vez, es cosa NUESTRA y no se atribuye a las guias', () => {
    const antes = calcularHistorial([build('a'), build('b'), build('c'), build('d')], null, FECHA1);
    // Un cambio de parser o de diccionario: todas las builds cambian el mismo campo.
    const despues = calcularHistorial(
      ['a', 'b', 'c', 'd'].map((id) => build(id, { casco: 'Renombrado' })),
      antes.historial,
      FECHA2,
    );
    expect(despues.conCambios).toBe(0);
    expect(despues.atribuidosAlSitio).toContain('equipo');
    expect(despues.historial.builds['a']!.entradas[0]!.ambito).toBe('sitio');
  });

  it('separa en la misma pasada lo nuestro de lo de la fuente', () => {
    const antes = calcularHistorial([build('a'), build('b'), build('c'), build('d')], null, FECHA1);
    const despues = calcularHistorial(
      [
        // El casco cambia en todas (nuestro); el tier solo en una (de la fuente).
        build('a', { casco: 'Renombrado', tier: 'B' }),
        build('b', { casco: 'Renombrado' }),
        build('c', { casco: 'Renombrado' }),
        build('d', { casco: 'Renombrado' }),
      ],
      antes.historial,
      FECHA2,
    );
    const entradas = despues.historial.builds['a']!.entradas;
    const fuente = entradas.find((e) => e.ambito === 'fuente')!;
    const sitio = entradas.find((e) => e.ambito === 'sitio')!;
    expect(fuente.cambios.map((c) => c.tipo)).toEqual(['tier']);
    expect(sitio.cambios.map((c) => c.tipo)).toEqual(['equipo']);
    expect(despues.conCambios).toBe(1);
  });

  it('acumula entradas y conserva la fecha de inicio', () => {
    const p1 = calcularHistorial([build('a'), build('b')], null, FECHA1);
    const p2 = calcularHistorial([build('a', { glifo: 'Otro' }), build('b')], p1.historial, FECHA2);
    const p3 = calcularHistorial(
      [build('a', { glifo: 'Otro', tier: 'A' }), build('b')],
      p2.historial,
      '2026-08-11T00:00:00.000Z',
    );
    expect(p3.historial.desde).toBe(FECHA1);
    expect(p3.historial.pasadas).toBe(3);
    // La mas reciente primero.
    expect(p3.historial.builds['a']!.entradas.map((e) => e.fecha)).toEqual([
      '2026-08-11T00:00:00.000Z',
      FECHA2,
    ]);
  });

  it('una build nueva no genera cambios, solo firma', () => {
    const p1 = calcularHistorial([build('a')], null, FECHA1);
    const p2 = calcularHistorial([build('a'), build('nueva')], p1.historial, FECHA2);
    expect(p2.conCambios).toBe(0);
    expect(p2.historial.builds['nueva']!.entradas).toEqual([]);
  });

  it('es determinista', () => {
    const p1 = calcularHistorial([build('a'), build('b')], null, FECHA1);
    const x = calcularHistorial([build('a', { casco: 'X' }), build('b')], p1.historial, FECHA2);
    const y = calcularHistorial([build('a', { casco: 'X' }), build('b')], p1.historial, FECHA2);
    expect(JSON.stringify(x.historial)).toBe(JSON.stringify(y.historial));
  });
});
