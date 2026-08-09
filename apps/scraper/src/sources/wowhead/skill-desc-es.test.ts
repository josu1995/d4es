import { describe, expect, it } from 'vitest';
import { extraerDescripcionActiva } from './skill-desc-es.js';

/** Recorte real de la ficha ES de Bola de rayos (wowhead.com/diablo-4/es/skill/514030). */
const FICHA = `
<div class="whtt-container" data-skill-type="active">
<div class="whtt-header-text"><div class="whtt-name">Bola de rayos</div></div>
<div class="whtt-scroll">
<div class="whtt-core" data-divider="full">
<div class="whtt-description"><span style="color: #B69E7A">Coste de maná: </span><span style="color: #FFFF74">30</span><br><span style="color: #B69E7A">Probabilidad de golpe de suerte: </span><span style="color: #FFFF74">5%</span><br>Lanzas una Bola de rayos que se desplaza lentamente hacia delante y electrocuta continuamente a los enemigos, lo que inflige <span style="color: #DBA864">120%</span> de daño por segundo.</div>
</div>
</div>
</div>
<div class="whtt-container" data-skill-type="upgrade">
<div class="whtt-header-text"><div class="whtt-name">Atracción</div></div>
<div class="whtt-description">Ahora <span>Bola de rayos</span> inflige 204% de daño por segundo.</div>
</div>
`;

describe('extraerDescripcionActiva', () => {
  it('saca nombre y cuerpo del primer bloque activo, sin las lineas de coste', () => {
    const r = extraerDescripcionActiva(FICHA);
    expect(r?.nombre).toBe('Bola de rayos');
    expect(r?.desc).toBe(
      'Lanzas una Bola de rayos que se desplaza lentamente hacia delante y electrocuta ' +
        'continuamente a los enemigos, lo que inflige 120% de daño por segundo.',
    );
  });

  it('no se lleva la mejora por delante: solo el bloque activo', () => {
    const r = extraerDescripcionActiva(FICHA);
    expect(r?.desc).not.toContain('Atracción');
    expect(r?.desc).not.toContain('204%');
  });

  it('devuelve null si no hay bloque activo', () => {
    expect(extraerDescripcionActiva('<div data-skill-type="upgrade">x</div>')).toBeNull();
    expect(extraerDescripcionActiva('')).toBeNull();
  });
});
