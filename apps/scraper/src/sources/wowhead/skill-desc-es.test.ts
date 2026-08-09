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

  it('quita tambien el tiempo de reutilizacion con su unidad y el nbsp numerico', () => {
    const ficha =
      '<div data-skill-type="active"><div class="whtt-name">Apocalipsis</div>' +
      '<div class="whtt-description"><span>Tiempo de reutilización: </span><span>67&#160;s</span><br>' +
      '<span>Probabilidad de golpe de suerte: </span><span>20%</span><br>' +
      'Desatas el apocalipsis sobre tus enemigos.</div></div>';
    const r = extraerDescripcionActiva(ficha);
    expect(r?.desc).toBe('Desatas el apocalipsis sobre tus enemigos.');
  });

  it('quita cabeceras con sufijo ("por segundo", "cada 20 s") y las pegadas sin br', () => {
    const casos: [string, string][] = [
      // Torbellino: coste por segundo.
      ['Coste de furia: 15 por segundo<br>Probabilidad de golpe de suerte: 20%<br>Atacas rápidamente.', 'Atacas rápidamente.'],
      // Garra rauda: cargas con recarga.
      ['Tiempo de reutilización de las cargas: 4 cada 20&#160;s<br>Saltas hacia delante.', 'Saltas hacia delante.'],
      // Tenaza de acero: la fuente pega dos cabeceras SIN br.
      ['<span>Coste de furia:</span> <span>0</span><span>Cargas:</span> <span>2</span><br><span>Tiempo de reutilización de las cargas:</span> <span>11</span>&#160;s<br>Lanzas tres cadenas.', 'Lanzas tres cadenas.'],
      // Carga: sufijo de varias palabras ("por enemigo golpeado").
      ['Generación de furia: 5 por enemigo golpeado<br>Tiempo de reutilización: 17&#160;s<br>Corres hacia delante.', 'Corres hacia delante.'],
    ];
    for (const [cuerpo, esperado] of casos) {
      const ficha = `<div data-skill-type="active"><div class="whtt-name">X</div><div class="whtt-description">${cuerpo}</div></div>`;
      expect(extraerDescripcionActiva(ficha)?.desc).toBe(esperado);
    }
  });

  it('no confunde "Pasiva:" ni "Activa:" con una cabecera: son cuerpo', () => {
    const ficha =
      '<div data-skill-type="active"><div class="whtt-name">X</div>' +
      '<div class="whtt-description">Pasiva: Obtienes 1 de Resolución cada 5.0 s.<br>Activa: Te envuelves en piel blindada.</div></div>';
    expect(extraerDescripcionActiva(ficha)?.desc).toBe(
      'Pasiva: Obtienes 1 de Resolución cada 5.0 s. Activa: Te envuelves en piel blindada.',
    );
  });

  it('devuelve null si no hay bloque activo', () => {
    expect(extraerDescripcionActiva('<div data-skill-type="upgrade">x</div>')).toBeNull();
    expect(extraerDescripcionActiva('')).toBeNull();
  });
});
