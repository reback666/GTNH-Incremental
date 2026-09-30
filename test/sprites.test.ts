import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_SPRITES, PALETTE, SPRITES, SPRITE_GRID } from '../src/game/sprites';

// 像素图标是手写的坐标表，最容易出的错是越界和写错颜色名，这里挡住。
describe('像素图标', () => {
  for (const [kind, rects] of Object.entries(SPRITES)) {
    it(`${kind} 的每个方块都在 ${SPRITE_GRID}×${SPRITE_GRID} 网格内且颜色合法`, () => {
      expect(rects.length).toBeGreaterThan(0);
      for (const [x, y, w, h, color] of rects) {
        expect(x, `${kind} x`).toBeGreaterThanOrEqual(0);
        expect(y, `${kind} y`).toBeGreaterThanOrEqual(0);
        expect(x + w, `${kind} 右边`).toBeLessThanOrEqual(SPRITE_GRID);
        expect(y + h, `${kind} 下边`).toBeLessThanOrEqual(SPRITE_GRID);
        expect(w).toBeGreaterThan(0);
        expect(h).toBeGreaterThan(0);
        expect(PALETTE[color], `${kind} 用了未定义的颜色 ${color}`).toBeTruthy();
      }
    });
  }

  it('每一个类别图标都有内容', () => {
    expect(Object.keys(SPRITES).sort()).toEqual([
      'abyss',
      'arcane',
      'generator',
      'machine',
      'miner',
      'purifier',
      'research',
      'storage',
      'vein',
    ]);
  });

  // 成就配图那一组同样要挡住越界与写错颜色
  for (const [kind, rects] of Object.entries(ACHIEVEMENT_SPRITES)) {
    it(`成就配图 ${kind} 的方块都在网格内且颜色合法`, () => {
      expect(rects.length).toBeGreaterThan(0);
      for (const [x, y, w, h, color] of rects) {
        expect(x, `${kind} x`).toBeGreaterThanOrEqual(0);
        expect(y, `${kind} y`).toBeGreaterThanOrEqual(0);
        expect(x + w, `${kind} 右边`).toBeLessThanOrEqual(SPRITE_GRID);
        expect(y + h, `${kind} 下边`).toBeLessThanOrEqual(SPRITE_GRID);
        expect(w).toBeGreaterThan(0);
        expect(h).toBeGreaterThan(0);
        expect(PALETTE[color], `${kind} 用了未定义的颜色 ${color}`).toBeTruthy();
      }
    });
  }
});
