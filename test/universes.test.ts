import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { deserialize, serialize } from '../src/game/save';
import { modelById } from '../src/game/models';
import { UNIVERSES, universeById } from '../src/game/universes';
import { ZERO, dec } from '../src/numeric/decimal';
import { coinValueInTier1 } from '../src/numeric/credit';

function walletValue(core: GameCore): ReturnType<typeof dec> {
  return core.coins.reduce((sum, held, index) => sum.plus(held.times(coinValueInTier1(index + 1))), ZERO);
}

// 平行宇宙：转生时带一个走，永久叠加，用来改写核心规则（计划书第五章）。
describe('平行宇宙', () => {
  it('转生时选一个宇宙，选过的永久叠加、不重复', () => {
    const core = new GameCore();
    expect(core.universes).toEqual([]);

    core.maxTier = 14;
    core.runEU = dec('1e24'); // 按公式结算要有累计 EU，否则线缆为 0
    expect(core.rebirth('max', 'industry')?.gt(0)).toBe(true);
    expect(core.hasUniverse('industry')).toBe(true);
    expect(core.addUniverse('industry')).toBe(false); // 已拥有，不重复

    core.maxTier = 14;
    core.runEU = dec('1e24');
    core.rebirth('max', 'arcane');
    expect(core.universes).toEqual(['industry', 'arcane']);

    // 不选也能转生
    core.maxTier = 14;
    core.runEU = dec('1e24');
    core.rebirth('max');
    expect(core.universes).toEqual(['industry', 'arcane']);
  });

  it('没有工业宇宙时，低等级的币买不了高级机器', () => {
    const core = new GameCore();
    core.maxTier = 8;
    core.researched.push(8);
    const model = modelById('c-8');
    const need = core.coinPriceOf(model).times(coinValueInTier1(7));
    core.coins[0] = need.plus('1000'); // 只有 ULV 铜币

    expect(core.canAfford(model)).toBe(false);
    expect(core.buy(model, 1)).toBe(0);
  });

  it('工业宇宙：跨电压结算，低级币按币值顶钱，且精确扣款', () => {
    const core = new GameCore();
    core.maxTier = 8;
    core.researched.push(8);
    core.addUniverse('industry');
    const model = modelById('c-8');
    const need = core.coinPriceOf(model).times(coinValueInTier1(7));
    core.coins[0] = need.plus('1000');

    expect(core.canAfford(model)).toBe(true);
    expect(core.buy(model, 1)).toBe(1);
    expect(core.countOf('c-8')).toBe(1);
    // 只花掉机器该花的钱，剩下的零头按 4:1 拆成各级币还回来
    expect(walletValue(core).toString()).toBe('1000');
  });

  it('工业宇宙：跨电压结算会把零钱按 4:1 归整到允许的最高币种', () => {
    const core = new GameCore();
    core.maxTier = 3;
    core.coins[0] = dec('100000');
    core.addUniverse('industry');
    // 买 3 级机器按 2 级币结算：零钱归整成 2 级币，1 级币只剩不足 4 枚
    expect(core.buy(modelById('c-3'), 1)).toBe(1);
    expect(core.coins[0]!.lt(4)).toBe(true);
    expect(walletValue(core).toString()).toBe('68000');
  });

  it('工业宇宙：并联折扣让同一机型的边际成本更低', () => {
    const plain = new GameCore();
    const industry = new GameCore();
    industry.addUniverse('industry');
    plain.counts['c-2'] = 50;
    industry.counts['c-2'] = 50;

    const model = modelById('c-2');
    const plainPrice = plain.coinPriceOf(model);
    const industryPrice = industry.coinPriceOf(model);
    expect(industryPrice.lt(plainPrice)).toBe(true);
    // 1.05^50 / 1.07^50 ≈ 0.38
    expect(industryPrice.div(plainPrice).lt('0.5')).toBe(true);
  });

  it('宇宙目录：四个宇宙各有一句话说明，只有工业宇宙是已实现', () => {
    expect(UNIVERSES.map((universe) => universe.id)).toEqual([
      'industry',
      'arcane',
      'abyss',
      'silicon',
    ]);
    for (const universe of UNIVERSES) {
      expect(universe.summary.length).toBeGreaterThan(0);
      expect(universe.effects.length).toBeGreaterThan(0);
    }
    expect(UNIVERSES.filter((universe) => universe.implemented).map((universe) => universe.id)).toEqual([
      'industry',
    ]);
    expect(universeById('industry')?.name).toBe('工业宇宙');
    expect(universeById('nope')).toBeUndefined();
  });

  it('存档往返保留宇宙，旧存档（v9）读进来是空的', () => {
    const core = new GameCore();
    core.universes = ['industry', 'arcane'];
    const restored = deserialize(serialize(core));
    expect(restored.universes).toEqual(['industry', 'arcane']);
    expect(serialize(restored)).toEqual(serialize(core));

    const legacy = { ...serialize(core), version: 9 } as Record<string, unknown>;
    delete legacy.universes;
    expect(deserialize(legacy as never).universes).toEqual([]);
  });
});
