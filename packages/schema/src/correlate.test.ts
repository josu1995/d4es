import { describe, expect, it } from 'vitest';
import {
  MATCH_AUTO_THRESHOLD,
  MATCH_REVIEW_THRESHOLD,
  classifyMatch,
  computeCompletenessScore,
  computeConsensus,
  computeDiff,
  correlationKey,
  matchScore,
  normalizeTitle,
  pickPrimaryVariant,
  slugify,
  type MatchInput,
} from './correlate.js';
import type { BuildVariant } from './build.js';
import { translatedRef, untranslatedRef } from './gameref.js';

const base: MatchInput = {
  classId: 'sorcerer',
  title: 'Ball Lightning Endgame Build',
  skills: ['a', 'b', 'c', 'd'],
  uniques: ['u1', 'u2'],
  primarySkill: 'a',
};

describe('slugify', () => {
  it('quita acentos y enes', () => {
    expect(slugify('Bárbaro Torbellino Ñu')).toBe('barbaro-torbellino-nu');
  });
  it('no deja guiones sueltos en los extremos', () => {
    expect(slugify('  ¡Hola, mundo!  ')).toBe('hola-mundo');
  });
});

describe('normalizeTitle', () => {
  it('descarta palabras de relleno', () => {
    expect(normalizeTitle('Ball Lightning Endgame Build Guide')).toEqual(['ball', 'lightning']);
  });
});

describe('matchScore', () => {
  it('da 0 entre clases distintas aunque todo lo demas coincida', () => {
    expect(matchScore(base, { ...base, classId: 'druid' })).toBe(0);
  });

  it('da 1 consigo misma', () => {
    expect(matchScore(base, base)).toBe(1);
  });

  it('es simetrica', () => {
    const otra: MatchInput = { ...base, skills: ['a', 'b', 'x'], uniques: ['u1'], title: 'Ball Lightning Pit' };
    expect(matchScore(base, otra)).toBe(matchScore(otra, base));
  });

  it('baja cuando cambia la skill principal aunque compartan habilidades', () => {
    const conMismasSkills = { ...base, primarySkill: 'd' };
    expect(matchScore(base, conMismasSkills)).toBeLessThan(1);
  });
});

describe('classifyMatch', () => {
  it('clasifica los casos frontera de forma estable', () => {
    expect(classifyMatch(0.64)).toBe('reject');
    expect(classifyMatch(MATCH_REVIEW_THRESHOLD)).toBe('review');
    expect(classifyMatch(0.66)).toBe('review');
    expect(classifyMatch(0.89)).toBe('review');
    expect(classifyMatch(MATCH_AUTO_THRESHOLD)).toBe('auto');
    expect(classifyMatch(0.91)).toBe('auto');
  });
});

describe('correlationKey', () => {
  it('es estable y legible', () => {
    expect(correlationKey('sorcerer', 'Sorcerer_BallLightning', null)).toBe(
      'sorcerer::Sorcerer_BallLightning::generic',
    );
  });
  it('marca como unknown la build sin skill principal', () => {
    expect(correlationKey('druid', null, 'minion')).toBe('druid::unknown::minion');
  });
});

// --- helpers para construir variantes de prueba ---------------------------------------

function variante(id: string, skills: { idName: string; rank: number }[], opciones?: Partial<BuildVariant>): BuildVariant {
  return {
    id,
    source: {
      site: 'd4builds',
      externalId: id,
      variantIndex: 0,
      variantLabel: null,
      url: 'https://d4builds.gg/builds/x/',
      author: null,
      capturedAt: '2026-08-08T00:00:00.000Z',
      snapshotHash: 'a'.repeat(64),
      provenance: 'server-scrape',
    },
    levelBand: 'endgame',
    skills: skills.map((s, i) => ({
      ref: untranslatedRef({ idName: s.idName, category: 'skill', enUS: s.idName }),
      order: i,
      rank: s.rank,
      skillVariant: null,
      runes: [],
      category: 'core',
    })),
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
    ...opciones,
  };
}

describe('computeConsensus', () => {
  const a = variante('a', [{ idName: 'S1', rank: 5 }, { idName: 'S2', rank: 3 }]);
  const b = variante('b', [{ idName: 'S1', rank: 5 }, { idName: 'S3', rank: 2 }]);

  it('marca agree lo que coincide en todas', () => {
    const c = computeConsensus([a, b]);
    expect(c.fields.find((f) => f.key === 'skill:S1')?.status).toBe('agree');
    expect(c.coreSkills.map((r) => r.idName)).toEqual(['S1']);
  });

  it('marca only-in lo que solo tiene una fuente', () => {
    const c = computeConsensus([a, b]);
    expect(c.fields.find((f) => f.key === 'skill:S2')?.status).toBe('only-in');
    expect(c.fields.find((f) => f.key === 'skill:S3')?.status).toBe('only-in');
  });

  it('marca differ cuando el rango no cuadra', () => {
    const c = computeConsensus([a, variante('c', [{ idName: 'S1', rank: 9 }, { idName: 'S2', rank: 3 }])]);
    expect(c.fields.find((f) => f.key === 'skill:S1')?.status).toBe('differ');
  });

  it('nunca fusiona: conserva el valor de cada variante por separado', () => {
    const c = computeConsensus([a, b]);
    expect(c.fields.find((f) => f.key === 'skill:S2')?.values).toEqual({ a: 3, b: null });
  });
});

describe('computeDiff', () => {
  it('solo devuelve filas donde hay algo que mirar', () => {
    const secciones = computeDiff(
      variante('a', [{ idName: 'S1', rank: 5 }]),
      variante('b', [{ idName: 'S1', rank: 5 }]),
    );
    expect(secciones.flatMap((s) => s.rows)).toHaveLength(0);
  });

  it('reparte las filas por seccion', () => {
    const secciones = computeDiff(
      variante('a', [{ idName: 'S1', rank: 5 }]),
      variante('b', [{ idName: 'S1', rank: 8 }]),
    );
    expect(secciones.find((s) => s.section === 'skills')?.rows).toHaveLength(1);
    expect(secciones.find((s) => s.section === 'gear')?.rows).toHaveLength(0);
  });
});

describe('pickPrimaryVariant', () => {
  it('prefiere la variante mas completa', () => {
    const floja = variante('floja', [{ idName: 'S1', rank: 1 }]);
    const buena = variante('buena', [{ idName: 'S1', rank: 1 }], {
      completeness: { ...floja.completeness, score: 0.9 },
    });
    expect(pickPrimaryVariant([floja, buena]).id).toBe('buena');
  });

  it('a igualdad, prefiere la fuente de licencia mas limpia', () => {
    const maxroll = variante('m', [{ idName: 'S1', rank: 1 }]);
    maxroll.source = { ...maxroll.source, site: 'maxroll' };
    const d4b = variante('d', [{ idName: 'S1', rank: 1 }]);
    expect(pickPrimaryVariant([maxroll, d4b]).id).toBe('d');
  });
});

describe('computeCompletenessScore', () => {
  it('vale 0 sin nada y 1 con todo', () => {
    const nada = {
      hasSkills: false,
      hasGear: false,
      hasParagon: false,
      hasTalisman: false,
      hasMercenary: false,
      hasWarPlan: false,
    };
    expect(computeCompletenessScore(nada)).toBe(0);
    expect(
      computeCompletenessScore({
        hasSkills: true,
        hasGear: true,
        hasParagon: true,
        hasTalisman: true,
        hasMercenary: true,
        hasWarPlan: true,
      }),
    ).toBe(1);
  });

  it('solo con habilidades no llega ni a la mitad: falta lo mas caro', () => {
    const score = computeCompletenessScore({
      hasSkills: true,
      hasGear: false,
      hasParagon: false,
      hasTalisman: false,
      hasMercenary: false,
      hasWarPlan: false,
    });
    expect(score).toBe(0.35);
  });
});

describe('traducciones en el consenso', () => {
  it('conserva la referencia traducida como etiqueta', () => {
    const conEs = variante('a', [{ idName: 'S1', rank: 1 }]);
    conEs.skills[0]!.ref = translatedRef({
      idName: 'S1',
      category: 'skill',
      enUS: 'Blight',
      esES: 'Plaga',
      i18n: 'curated',
    });
    const c = computeConsensus([conEs]);
    expect(c.fields[0]?.label?.esES).toBe('Plaga');
  });
});
