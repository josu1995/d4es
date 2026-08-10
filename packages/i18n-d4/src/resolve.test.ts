import { describe, expect, it } from 'vitest';
import { Resolver } from './resolve.js';
import { limpiarLocalisation, normalizeName, type Dictionary } from './types.js';

function dict(entradas: { category: string; en: string; es: string }[]): Dictionary {
  const d: Dictionary = {
    meta: { generatedAt: '2026-08-09T00:00:00.000Z', sourceRepo: 't', sourceSha: 'x', counts: {}, curatedCounts: {} },
    byIdName: {},
    byEnglish: {},
  };
  for (const e of entradas) {
    const item = { idName: e.en, sno: null, category: e.category, en: e.en, es: e.es, source: 'd4companion' as const };
    d.byIdName[`${e.category}:${e.en}`] = item;
    d.byEnglish[`${e.category}:${normalizeName(e.en)}`] = item;
  }
  return d;
}

describe('Resolver', () => {
  const resolver = () =>
    new Resolver(
      dict([
        { category: 'affix', en: 'Cooldown Reduction', es: 'de reducción de tiempo de reutilización' },
        { category: 'affix', en: 'x Vulnerable Damage Multiplier', es: 'Multiplicador de daño por vulnerabilidad x' },
        { category: 'skill', en: 'Whirlwind', es: 'Torbellino' },
      ]),
    );

  it('traduce lo que encuentra y declara la procedencia', () => {
    const ref = resolver().resolve('skill', 'Whirlwind');
    expect(ref.esES).toBe('Torbellino');
    expect(ref.i18n).toBe('d4companion');
  });

  it('no inventa: lo que no encuentra se queda en ingles y sin procedencia', () => {
    const ref = resolver().resolve('skill', 'Habilidad Inexistente');
    expect(ref.esES).toBeNull();
    expect(ref.i18n).toBe('none');
  });

  // Los multiplicadores llevan una "x" en el texto del juego que las fuentes omiten.
  it('reintenta los afijos multiplicativos con el prefijo x', () => {
    const ref = resolver().resolve('affix', 'Vulnerable Damage Multiplier');
    expect(ref.esES).toBe('Multiplicador de daño por vulnerabilidad x');
  });

  it('ese reintento es solo para afijos, no para otras categorias', () => {
    const d = dict([{ category: 'skill', en: 'x Algo', es: 'Algo' }]);
    expect(new Resolver(d).resolve('skill', 'Algo').esES).toBeNull();
  });

  it('ignora mayusculas y puntuacion al buscar', () => {
    expect(resolver().resolve('affix', 'cooldown  reduction').esES).not.toBeNull();
  });

  it('lleva la cuenta de aciertos y fallos', () => {
    const r = resolver();
    r.resolve('skill', 'Whirlwind');
    r.resolve('skill', 'Desconocida');
    const s = r.stats();
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(1);
    expect(s.missRate).toBe(0.5);
    expect(s.porCategoria['skill']?.[0]?.termino).toBe('Desconocida');
  });
});

describe('limpiarLocalisation', () => {
  it('conserva si el bonus es porcentual', () => {
    expect(limpiarLocalisation('inflige un {c_random}[Affix_Value_1*100|x%|]{/c} mas')).toBe('inflige un X% mas');
  });

  it('sustituye por X las formulas sin formato', () => {
    expect(limpiarLocalisation('inflige [(Owner.Weapon_Damage) * Affix_Value_0] de daño')).toBe(
      'inflige X de daño',
    );
  });

  it('quita condicionales y etiquetas de estilo', () => {
    expect(limpiarLocalisation('{if:SF.IsMythic}{c_mythic}{/if}{c_important}Pisotón{/c} sube')).toBe(
      'Pisotón sube',
    );
  });

  it('no deja marcado suelto', () => {
    const salida = limpiarLocalisation('{c_a}Uno{/c} [X|y%|] {u}dos{/u}');
    expect(salida).not.toMatch(/[{}[\]|]/);
  });
});

/**
 * El diccionario oficial guarda los aspectos SIN la palabra "Aspect" y el nombre completo
 * en castellano se forma con "Rasgo" delante. Sin esto, los 153 aspectos que salen en las
 * builds aparecian todos en ingles teniendo los 522 en el diccionario.
 */
describe('aspectos: se recompone el nombre completo', () => {
  const r = () =>
    new Resolver(
      dict([
        { category: 'aspect', en: 'Crushing', es: 'aplastante' },
        { category: 'aspect', en: "of Glynn's Anvil", es: 'del yunque de Glynn' },
        { category: 'aspect', en: "Edgemaster's", es: 'de maestro de filos' },
        { category: 'aspect', en: 'Overwhelming', es: 'abrumadora' },
      ]),
    );

  it('resuelve el adjetivo delante: "Crushing Aspect"', () => {
    expect(r().resolve('aspect', 'Crushing Aspect').esES).toBe('Rasgo aplastante');
  });

  it('resuelve el complemento detras: "Aspect of Glynn\'s Anvil"', () => {
    expect(r().resolve('aspect', "Aspect of Glynn's Anvil").esES).toBe('Rasgo del yunque de Glynn');
  });

  it('resuelve el posesivo: "Edgemaster\'s Aspect"', () => {
    expect(r().resolve('aspect', "Edgemaster's Aspect").esES).toBe('Rasgo de maestro de filos');
  });

  it('reproduce la concordancia rara del propio juego, no la "arregla"', () => {
    // El cliente espanol dice literalmente "Rasgo abrumadora". Es su nombre, no una errata
    // nuestra: comprobado contra Wowhead en castellano cruzando por el id del juego.
    expect(r().resolve('aspect', 'Overwhelming Aspect').esES).toBe('Rasgo abrumadora');
  });

  it('conserva el ingles de la FUENTE, no el fragmento del diccionario', () => {
    expect(r().resolve('aspect', 'Crushing Aspect').enUS).toBe('Crushing Aspect');
  });

  it('un aspecto que no esta sigue sin traducirse: no se inventa el prefijo', () => {
    const ref = r().resolve('aspect', 'Aspect of Nothing At All');
    expect(ref.esES).toBeNull();
    expect(ref.i18n).toBe('none');
  });
});

describe('afijos: el grupo de templado no cambia el afijo', () => {
  const r = () =>
    new Resolver(
      dict([
        { category: 'affix', en: 'Maximum Life', es: 'de vida máxima' },
        { category: 'affix', en: 'x Vulnerable Damage', es: 'Daño por vulnerabilidad x' },
      ]),
    );

  it('quita el parentesis que pega la fuente', () => {
    expect(r().resolve('affix', 'Maximum Life (Worldly Endurance - Defensive)').esES).toBe('de vida máxima');
  });

  it('el parentesis tampoco estorba al reintento con la "x" de multiplicador', () => {
    expect(r().resolve('affix', 'Vulnerable Damage (Worldly Destruction - Weapons)').esES).toBe(
      'Daño por vulnerabilidad x',
    );
  });

  it('sin parentesis sigue funcionando igual', () => {
    expect(r().resolve('affix', 'Maximum Life').esES).toBe('de vida máxima');
  });
});

/**
 * Casos reales del catalogo: 54 terminos (158 apariciones) que estaban en el diccionario
 * y salian en ingles por diferencias de escritura entre la fuente y el juego.
 */
describe('afijos: las formas en que la fuente los escribe distinto', () => {
  const r = () =>
    new Resolver(
      dict([
        // El diccionario CONSERVA el numero, pero no el simbolo de % ni la X del hueco.
        {
          category: 'affix',
          en: 'Lucky Hit: Up to a 15 Chance to Restore Primary Resource',
          es: 'Golpe de suerte: Hasta un 15 de probabilidad de restaurar recurso principal',
        },
        { category: 'affix', en: 'x All Damage Multiplier', es: 'Multiplicador de todo el daño x' },
        { category: 'affix', en: 'to War Cry', es: 'a Grito de guerra' },
        { category: 'affix', en: 'Critical Strike Chance', es: 'de probabilidad de golpe crítico' },
      ]),
    );

  it('quita el % y la X con que la fuente marca el hueco del valor', () => {
    expect(
      r().resolve('affix', 'Lucky Hit: Up to a 15% Chance to Restore X Primary Resource (Worldly Stability - Resource)')
        .esES,
    ).toBe('Golpe de suerte: Hasta un 15 de probabilidad de restaurar recurso principal');
  });

  it('corrige las erratas de la propia fuente', () => {
    expect(r().resolve('affix', 'All Damage Multipler').esES).toBe('Multiplicador de todo el daño x');
    expect(r().resolve('affix', 'Critcal Strike Chance').esES).toBe('de probabilidad de golpe crítico');
  });

  it('entiende el "Ranks" que antepone la fuente a los rangos de habilidad', () => {
    expect(r().resolve('affix', 'Ranks to War Cry').esES).toBe('a Grito de guerra');
  });

  it('un afijo que NO esta en el diccionario se unifica pero no se inventa', () => {
    // La fuente lo publica con el valor delante y con el grupo detras; es el mismo afijo,
    // asi que se publica una sola forma en ingles, sin traduccion.
    const a = r().resolve('affix', '242 Primary Core Stat');
    const b = r().resolve('affix', 'Primary Core Stat (Worldly Stability - Resource)');
    expect(a.esES).toBeNull();
    expect(a.enUS).toBe('Primary Core Stat');
    expect(b.enUS).toBe('Primary Core Stat');
  });
});
