import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RawD4BuildsCatalog, RawD4BuildsTierList } from '@d4es/schema';
import { Resolver, type Dictionary } from '@d4es/i18n';
import { normalizeD4BuildsCatalog } from './normalize.js';
import { PATHS } from '../../paths.js';
import type { EstadoJuego } from '../../estado-juego.js';

const catalogo = RawD4BuildsCatalog.parse(
  JSON.parse(readFileSync(join(PATHS.fixtures, 'd4builds-catalog.sample.json'), 'utf8')),
);
const tierList = RawD4BuildsTierList.parse(
  JSON.parse(readFileSync(join(PATHS.fixtures, 'd4builds-tierlist.sample.json'), 'utf8')),
);

const estado: EstadoJuego = {
  expansion: 'Lord of Hatred',
  temporadaActual: 14,
  temporadaNombreEn: 'Season of Death Awakening',
  temporadaNombreEs: null,
  parche: '3.1.2',
  inicio: '2026-06-30',
  finPrevisto: '2026-09-15',
  verificacion: { estado: 'por-verificar', fuente: 'test', fecha: '2026-08-08', parche: '3.1.2' },
};

function diccionario(entradas: { category: string; en: string; es: string }[] = []): Dictionary {
  const dict: Dictionary = {
    meta: { generatedAt: '2026-08-08T00:00:00.000Z', sourceRepo: 'test', sourceSha: 'x', counts: {}, curatedCounts: {} },
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

function normalizar(dict: Dictionary = diccionario()) {
  return normalizeD4BuildsCatalog({
    catalog: catalogo,
    tierList,
    resolver: new Resolver(dict),
    capturedAt: '2026-08-08T00:00:00.000Z',
    estado,
  });
}

describe('normalizeD4BuildsCatalog', () => {
  it('normaliza todas las builds del fixture', () => {
    const { builds, avisos } = normalizar();
    expect(builds).toHaveLength(8);
    expect(avisos).toHaveLength(0);
  });

  it('sale ordenado por id, para que el diff del PR sea legible', () => {
    const ids = normalizar().builds.map((b) => b.id);
    expect(ids).toEqual([...ids].sort());
  });

  it('es determinista: dos pasadas producen exactamente lo mismo', () => {
    expect(JSON.stringify(normalizar().builds)).toBe(JSON.stringify(normalizar().builds));
  });

  it('mapea las clases nuevas de Lord of Hatred', () => {
    const builds = normalizar().builds;
    expect(builds.find((b) => b.id === 'judgement-paladin-endgame')?.classId).toBe('paladin');
    expect(builds.find((b) => b.id === 'hell-fracture-warlock-endgame')?.classId).toBe('warlock');
  });

  it('cruza el tier list con el catalogo', () => {
    const charge = normalizar().builds.find((b) => b.id === 'charge-barbarian-endgame');
    expect(charge?.ratings.tierLabel).toBe('S');
    expect(charge?.ratings.pitTier).toBe(150);
  });

  it('deja sin tier las builds que no salen en la tier list', () => {
    const firewall = normalizar().builds.find((b) => b.id === 'firewall-sorcerer-leveling');
    expect(firewall?.ratings.tierLabel).toBeNull();
    expect(firewall?.variants[0]?.levelBand).toBe('leveling');
  });

  it('elige como skill principal la que da nombre a la build', () => {
    const charge = normalizar().builds.find((b) => b.id === 'charge-barbarian-endgame');
    // "War Cry" tiene el mismo rango 15 que "Charge": sin la heuristica del nombre,
    // el desempate seria arbitrario y la clave de correlacion inestable.
    expect(charge?.correlationKey).toBe('barbarian::skill__charge::generic');
  });

  it('declara honestamente que no hay equipo ni paragon', () => {
    const v = normalizar().builds[0]?.variants[0];
    expect(v?.completeness.hasSkills).toBe(true);
    expect(v?.completeness.hasGear).toBe(false);
    expect(v?.completeness.hasParagon).toBe(false);
  });

  it('enlaza siempre a la fuente original', () => {
    for (const b of normalizar().builds) {
      expect(b.variants[0]?.source.url).toMatch(/^https:\/\/d4builds\.gg\/builds\//);
      expect(b.variants[0]?.source.site).toBe('d4builds');
    }
  });

  it('sin diccionario deja todo en ingles y sin procedencia', () => {
    const skills = normalizar().builds.flatMap((b) => b.variants[0]!.skills);
    expect(skills.length).toBeGreaterThan(0);
    for (const s of skills) {
      expect(s.ref.esES).toBeNull();
      expect(s.ref.i18n).toBe('none');
    }
  });

  it('usa el castellano en el titulo cuando la habilidad esta traducida', () => {
    const dict = diccionario([{ category: 'skill', en: 'Charge', es: 'Embestida' }]);
    const charge = normalizar(dict).builds.find((b) => b.id === 'charge-barbarian-endgame');
    expect(charge?.title.es).toBe('Embestida');
    expect(charge?.title.en).toBe('Charge');
  });

  it('no descarta en silencio: una habilidad con rango imposible genera aviso', () => {
    const roto = structuredClone(catalogo);
    roto.result.pageContext.builds[0]!.skills![0]!.rank = 99;
    const { avisos, builds } = normalizeD4BuildsCatalog({
      catalog: roto,
      tierList,
      resolver: new Resolver(diccionario()),
      capturedAt: '2026-08-08T00:00:00.000Z',
      estado,
    });
    expect(avisos.some((a) => a.includes('fuera de'))).toBe(true);
    // La build sobrevive sin esa habilidad; no se pierde entera por un dato raro.
    expect(builds).toHaveLength(8);
  });

  it('avisa y omite una clase que no conoce', () => {
    const roto = structuredClone(catalogo);
    roto.result.pageContext.builds[0]!.class = 'Crusader';
    const { avisos, builds } = normalizeD4BuildsCatalog({
      catalog: roto,
      tierList,
      resolver: new Resolver(diccionario()),
      capturedAt: '2026-08-08T00:00:00.000Z',
      estado,
    });
    expect(builds).toHaveLength(7);
    expect(avisos.some((a) => a.includes('clase desconocida'))).toBe(true);
  });
});
