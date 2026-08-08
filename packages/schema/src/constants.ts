/**
 * Constantes del juego. Un unico sitio donde tocar cuando llega un parche.
 * Estado verificado: parche 3.1.2, Temporada 14 (Lord of Hatred), 8-ago-2026.
 */

export const MAX_LEVEL = 70;

/**
 * El arbol rediseñado de Lord of Hatred da hasta 12 puntos por habilidad, pero el equipo
 * suma rangos encima: d4builds publica rangos de 14-15 en builds reales. El limite del
 * esquema es deliberadamente generoso para no rechazar datos validos de la fuente.
 */
export const MAX_SKILL_RANK = 20;
export const MAX_SKILL_POINTS_FROM_TREE = 12;

export const MAX_GLYPH_RANK = 150;
export const GLYPH_LEGENDARY_THRESHOLD = 51;
export const MAX_PIT_TIER = 150;

export const MAX_CHARMS = 6;
export const MAX_PARAGON_BOARDS = 9;
export const MAX_SKILL_BAR = 12;

export const TORMENT_TIERS = 12;
export const DIFFICULTY_COUNT = 16;

/** Item Power minimo para la receta "Upgrade to Mythic" del Cubo Horadrico. */
export const MYTHIC_UPGRADE_MIN_ITEM_POWER = 850;
/** Fragmentos de Pandemonium por intento (bajado de 5 a 4 en el parche 3.1.1). */
export const MYTHIC_UPGRADE_FRAGMENT_COST = 4;

export const CURRENT_SEASON = 14;
export const CURRENT_PATCH = '3.1.2';
