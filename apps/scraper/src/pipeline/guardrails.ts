/**
 * Cortafuegos antes de escribir nada publicable. La regla es: ante una anomalia, abortar
 * y avisar. Publicar 300 builds vacias porque la fuente cambio el HTML es mucho peor que
 * quedarse un dia con los datos de ayer.
 */

export interface GuardrailContext {
  buildsAnteriores: number;
  buildsActuales: number;
  eliminadas: number;
  ficherosTocados: number;
  missRateI18n: number;
  bytesDescargados: number;
  driftDetectado: boolean;
  /** Con datos de fixture los umbrales de volumen no aplican (son 8 builds, no 92). */
  modoFixture: boolean;
}

export interface GuardrailResultado {
  ok: boolean;
  fallos: string[];
  avisos: string[];
  etiquetas: string[];
}

export const LIMITES = {
  minBuilds: 40,
  variacionMaxima: 0.3,
  eliminadasMaximas: 10,
  ficherosTocadosParaEtiqueta: 0.4,
  missRateMaximo: 0.35,
  bytesMaximos: 25 * 1024 * 1024,
} as const;

export function evaluarGuardrails(ctx: GuardrailContext): GuardrailResultado {
  const fallos: string[] = [];
  const avisos: string[] = [];
  const etiquetas: string[] = [];

  if (ctx.modoFixture) {
    avisos.push('datos de FIXTURE: los umbrales de volumen no se aplican y esto no es publicable');
    etiquetas.push('fixture');
  } else {
    if (ctx.buildsActuales < LIMITES.minBuilds) {
      fallos.push(
        `solo se han normalizado ${ctx.buildsActuales} builds (minimo ${LIMITES.minBuilds}): la fuente probablemente ha cambiado`,
      );
    }

    if (ctx.buildsAnteriores > 0) {
      const variacion = Math.abs(ctx.buildsActuales - ctx.buildsAnteriores) / ctx.buildsAnteriores;
      if (variacion > LIMITES.variacionMaxima) {
        fallos.push(
          `el catalogo ha variado un ${(variacion * 100).toFixed(0)}% (${ctx.buildsAnteriores} -> ${ctx.buildsActuales}), por encima del ${LIMITES.variacionMaxima * 100}% permitido`,
        );
      }
    }

    if (ctx.eliminadas > LIMITES.eliminadasMaximas) {
      fallos.push(`se borrarian ${ctx.eliminadas} builds de una vez (maximo ${LIMITES.eliminadasMaximas})`);
    }
  }

  if (ctx.bytesDescargados > LIMITES.bytesMaximos) {
    fallos.push(`descarga de ${(ctx.bytesDescargados / 1024 / 1024).toFixed(1)} MB, por encima del limite`);
  }

  // Un miss rate alto no invalida los datos (la build sigue siendo correcta, solo se ve
  // en ingles), asi que avisa pero no aborta.
  if (ctx.missRateI18n > LIMITES.missRateMaximo) {
    avisos.push(
      `el ${(ctx.missRateI18n * 100).toFixed(1)}% de los terminos no tiene traduccion verificada; revisa data/curated/skills.esES.json`,
    );
    etiquetas.push('i18n-bajo');
  }

  if (ctx.buildsAnteriores > 0 && ctx.ficherosTocados / ctx.buildsAnteriores > LIMITES.ficherosTocadosParaEtiqueta) {
    avisos.push(`cambian ${ctx.ficherosTocados} ficheros: revisa el PR a mano antes de mergear`);
    etiquetas.push('big-diff');
  }

  if (ctx.driftDetectado) {
    avisos.push('la forma del JSON de origen ha cambiado: revisa el bloque de drift del informe');
    etiquetas.push('drift');
  }

  return { ok: fallos.length === 0, fallos, avisos, etiquetas };
}
