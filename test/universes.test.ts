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
    core.researchedModels.push('c-8');
    const model = modelById('c-8');
    const need = core.coinPriceOf(model).times(coinValueInTier1(7));
    core.coins[0] = need.plus('1000'); // 只有 ULV 铜币

    expect(core.canAfford(model)).toBe(false);
    expect(core.buy(model, 1)).toBe(0);
  });

  it('工业宇宙：跨电压结算，低级币按币值顶钱，且精确扣款', () => {
    const core = new GameCore();
    core.maxTier = 8;
    core.researchedModels.push('c-8');
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

  it('工业宇宙：跨电压结算先用本级币，不够才动低一级的', () => {
    // 买 3 级机器按 2 级（LV）币结算，首台价格 8000 枚 LV 币
    const lvOnly = new GameCore();
    lvOnly.maxTier = 3;
    lvOnly.addUniverse('industry');
    lvOnly.coins[0] = dec('100000'); // 只有 ULV 币时照旧能买：按 4:1 顶钱
    expect(lvOnly.buy(modelById('c-3'), 1)).toBe(1);
    expect(lvOnly.coins[0]!.toString()).toBe('68000');
    expect(lvOnly.coins[1]!.toString()).toBe('0');

    const enough = new GameCore();
    enough.maxTier = 3;
    enough.addUniverse('industry');
    enough.coins[1] = dec('10000'); // 本级币够：只扣本级，低级币一枚都不动
    enough.coins[0] = dec('5000');
    expect(enough.buy(modelById('c-3'), 1)).toBe(1);
    expect(enough.coins[1]!.toString()).toBe('2000');
    expect(enough.coins[0]!.toString()).toBe('5000');

    const short = new GameCore();
    short.maxTier = 3;
    short.addUniverse('industry');
    short.coins[1] = dec('1000'); // 本级不够：先扣光本级，再用低级币补
    short.coins[0] = dec('40000');
    expect(short.buy(modelById('c-3'), 1)).toBe(1);
    expect(short.coins[1]!.toString()).toBe('0');
    expect(short.coins[0]!.toString()).toBe('12000');
  });

  it('工业宇宙：零钱也付得掉，不会因为凑整而白拿机器', () => {
    const core = new GameCore();
    core.maxTier = 3;
    core.addUniverse('industry');
    const model = modelById('c-3');
    const priceValue = core.coinPriceOf(model).times(coinValueInTier1(2));
    // 本级差一点点，靠低级币的零头补齐
    core.coins[1] = dec('7999.5');
    core.coins[0] = dec('2');
    const before = walletValue(core);
    expect(core.buy(model, 1)).toBe(1);
    expect(walletValue(core).toString()).toBe(before.minus(priceValue).toString());
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

  it('宇宙目录：四个宇宙各有一句话说明，四个都已实现', () => {
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
      'arcane',
      'abyss',
      'silicon',
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

  it('选好的宇宙跟着存档走，转生时才生效、用完清空', () => {
    const core = new GameCore();
    expect(core.setPendingUniverse('arcane')).toBe(true);
    expect(core.pendingUniverse).toBe('arcane');
    // 只是记住选择，不会立刻拥有
    expect(core.hasUniverse('arcane')).toBe(false);

    // 切页面 / 刷新都不该丢
    const restored = deserialize(serialize(core));
    expect(restored.pendingUniverse).toBe('arcane');
    expect(serialize(restored)).toEqual(serialize(core));

    // 转生时才真正拿到，并把选择清掉
    restored.maxTier = 14;
    restored.runEU = dec('1e24');
    restored.rebirth('max', restored.pendingUniverse ?? undefined);
    expect(restored.hasUniverse('arcane')).toBe(true);
    expect(restored.pendingUniverse).toBe(null);

    // 已经拥有的不能再选；取消选择也可以
    expect(restored.setPendingUniverse('arcane')).toBe(false);
    expect(restored.setPendingUniverse(null)).toBe(true);
  });

  it('开发者模式：可以直接获得宇宙，方便立刻测试', () => {
    const core = new GameCore();
    expect(core.devGrantUniverse('arcane')).toBe(false); // 没开开发者模式
    core.setDevMode(true);
    expect(core.devGrantUniverse('arcane')).toBe(true);
    expect(core.hasUniverse('arcane')).toBe(true);
    expect(core.devGrantUniverse('arcane')).toBe(false); // 不重复
  });

  it('开发者模式：也能把宇宙撤掉，并清掉挂在它上面的待选', () => {
    const core = new GameCore();
    core.setDevMode(true);
    core.devGrantUniverse('arcane');
    core.setPendingUniverse('abyss');

    // 撤掉没拥有的宇宙返回 false
    expect(core.devRevokeUniverse('industry')).toBe(false);
    expect(core.devRevokeUniverse('arcane')).toBe(true);
    expect(core.hasUniverse('arcane')).toBe(false);
    // 待选挂的不是被撤掉的那个，应该保留
    expect(core.pendingUniverse).toBe('abyss');

    core.devGrantUniverse('abyss');
    core.setPendingUniverse('abyss');
    core.devRevokeUniverse('abyss');
    expect(core.pendingUniverse).toBe(null); // 撤掉时把待选一起清掉

    // 关掉开发者模式之后不能再撤
    core.devGrantUniverse('arcane');
    core.setDevMode(false);
    expect(core.devRevokeUniverse('arcane')).toBe(false);
    expect(core.hasUniverse('arcane')).toBe(true);
  });
});
