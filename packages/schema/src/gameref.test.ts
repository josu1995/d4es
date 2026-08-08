import { describe, expect, it } from 'vitest';
import { GameRef, display, isUntranslated, translatedRef, untranslatedRef } from './gameref.js';

describe('GameRef', () => {
  it('acepta una referencia sin traducir', () => {
    const ref = untranslatedRef({ idName: 'Necromancer_Blight', category: 'skill', enUS: 'Blight' });
    expect(GameRef.safeParse(ref).success).toBe(true);
    expect(isUntranslated(ref)).toBe(true);
    expect(display(ref)).toBe('Blight');
  });

  it('acepta una traduccion con procedencia declarada', () => {
    const ref = translatedRef({
      idName: 'Rare_001_Intelligence_Main',
      category: 'glyph',
      enUS: 'Enchantment',
      esES: 'Encantamiento',
      i18n: 'd4companion',
    });
    expect(GameRef.safeParse(ref).success).toBe(true);
    expect(display(ref)).toBe('Encantamiento');
  });

  // Este es el invariante que hace imposible colar una traduccion inventada.
  it('rechaza una traduccion sin procedencia', () => {
    const res = GameRef.safeParse({
      idName: 'inventado',
      sno: null,
      category: 'skill',
      enUS: 'Whirlwind',
      esES: 'Torbellino',
      i18n: 'none',
    });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toContain('sin procedencia');
  });

  it('rechaza declarar procedencia sin traduccion', () => {
    const res = GameRef.safeParse({
      idName: 'x',
      sno: null,
      category: 'skill',
      enUS: 'Whirlwind',
      esES: null,
      i18n: 'd4companion',
    });
    expect(res.success).toBe(false);
  });
});
