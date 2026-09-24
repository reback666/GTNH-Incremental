import { describe, expect, it } from 'vitest';
import { canRunRecipe } from '../src/numeric/recipe';

describe('配方准入', () => {
  it('机器电压不低于配方等级时才能跑该配方', () => {
    expect(canRunRecipe(5, 5)).toBe(true);
    expect(canRunRecipe(6, 2)).toBe(true);
    expect(canRunRecipe(14, 1)).toBe(true);
  });

  it('电压不足时跑不了', () => {
    expect(canRunRecipe(5, 6)).toBe(false);
    expect(canRunRecipe(2, 6)).toBe(false);
    expect(canRunRecipe(1, 14)).toBe(false);
  });

  it('越界等级直接报错', () => {
    expect(() => canRunRecipe(15, 1)).toThrow(RangeError);
    expect(() => canRunRecipe(5, 0)).toThrow(RangeError);
    expect(() => canRunRecipe(0, 1)).toThrow(RangeError);
  });
});
