import { describe, expect, it } from 'vitest';
import { diffShape, fingerprint, shapePaths } from './fingerprint.js';
import { evaluarGuardrails, type GuardrailContext } from './guardrails.js';
import { hashOf, stableStringify } from '../util/stable-json.js';

describe('fingerprint de forma', () => {
  it('ignora los cambios de valor', () => {
    const a = { builds: [{ name: 'Charge', pit: 150 }] };
    const b = { builds: [{ name: 'Whirlwind', pit: 120 }] };
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('detecta un campo nuevo', () => {
    const antes = shapePaths({ builds: [{ name: 'x' }] });
    const despues = shapePaths({ builds: [{ name: 'x', nuevo: 1 }] });
    const d = diffShape(antes, despues);
    expect(d.changed).toBe(true);
    expect(d.added).toContain('builds[].nuevo:number');
  });

  it('detecta un campo que desaparece', () => {
    const d = diffShape(shapePaths({ a: 1, b: 2 }), shapePaths({ a: 1 }));
    expect(d.removed).toContain('b:number');
  });

  it('detecta un cambio de tipo', () => {
    const d = diffShape(shapePaths({ pit: 150 }), shapePaths({ pit: '150' }));
    expect(d.added).toContain('pit:string');
    expect(d.removed).toContain('pit:number');
  });

  it('no cambia porque crezca el catalogo', () => {
    const uno = { builds: [{ name: 'a' }] };
    const muchos = { builds: Array.from({ length: 50 }, (_, i) => ({ name: `b${i}` })) };
    expect(fingerprint(uno)).toBe(fingerprint(muchos));
  });
});

describe('serializacion estable', () => {
  it('ordena las claves para que el diff sea legible', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{\n  "a": 2,\n  "b": 1\n}\n');
  });

  it('el hash depende del contenido, no del orden de las claves', () => {
    expect(hashOf({ a: 1, b: 2 })).toBe(hashOf({ b: 2, a: 1 }));
  });
});

const sano: GuardrailContext = {
  buildsAnteriores: 92,
  buildsActuales: 92,
  eliminadas: 0,
  ficherosTocados: 3,
  missRateI18n: 0.1,
  bytesDescargados: 900_000,
  driftDetectado: false,
  modoFixture: false,
};

describe('guardrails', () => {
  it('deja pasar una ingesta normal', () => {
    expect(evaluarGuardrails(sano).ok).toBe(true);
  });

  it('aborta si el catalogo se desploma', () => {
    const r = evaluarGuardrails({ ...sano, buildsActuales: 12 });
    expect(r.ok).toBe(false);
    expect(r.fallos.join(' ')).toContain('minimo');
  });

  it('aborta si el catalogo varia demasiado de golpe', () => {
    expect(evaluarGuardrails({ ...sano, buildsActuales: 50 }).ok).toBe(false);
  });

  it('aborta antes de borrar media web', () => {
    expect(evaluarGuardrails({ ...sano, eliminadas: 40 }).ok).toBe(false);
  });

  it('un miss rate alto avisa pero no aborta: la build sigue siendo correcta en ingles', () => {
    const r = evaluarGuardrails({ ...sano, missRateI18n: 0.9 });
    expect(r.ok).toBe(true);
    expect(r.etiquetas).toContain('i18n-bajo');
  });

  it('marca big-diff cuando cambia demasiado sin llegar a ser sospechoso', () => {
    const r = evaluarGuardrails({ ...sano, ficherosTocados: 80 });
    expect(r.ok).toBe(true);
    expect(r.etiquetas).toContain('big-diff');
  });

  it('en modo fixture no aplica los umbrales de volumen', () => {
    const r = evaluarGuardrails({ ...sano, buildsActuales: 8, buildsAnteriores: 92, modoFixture: true });
    expect(r.ok).toBe(true);
    expect(r.etiquetas).toContain('fixture');
  });

  it('etiqueta el drift para que no se mergee solo', () => {
    expect(evaluarGuardrails({ ...sano, driftDetectado: true }).etiquetas).toContain('drift');
  });
});
