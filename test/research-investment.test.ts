import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { serialize, deserialize } from '../src/game/save';
import { dec } from '../src/numeric/decimal';
import { advanceSimulation } from '../src/game/runtime';
import { modelById } from './helpers';

function researchFactory() {
  const core = new GameCore();
  core.maxTier = 7;
  core.counts = { 'x-7': 1, 'r-7': 1 };
  core.storedEU = dec('1e12');
  core.coins[6] = dec('1e9');
  core.random = () => 0.999;
  return core;
}

describe('研究投资与原算力体系衔接', () => {
  it('币不足时不选中、不扣款、不解锁；付款后仍需算力推进', () => {
    const core = researchFactory();
    const model = modelById('c-8');
    const price = core.researchInvestmentFor(model);
    core.coins[6] = price.minus(1);
    expect(core.canInvestResearch(model)).toBe(false);
    expect(core.setResearchTarget(model.id)).toBe(false);
    expect(core.researchTarget).toBeNull();
    expect(core.coins[6]!.eq(price.minus(1))).toBe(true);
    core.coins[6] = price;
    expect(core.setResearchTarget(model.id)).toBe(true);
    expect(core.coins[6]!.isZero()).toBe(true);
    expect(core.isModelResearched(model)).toBe(false);
    expect(core.researchProgressOf(model.id).isZero()).toBe(true);
    core.tick(1);
    expect(core.researchProgressOf(model.id).toString()).toBe('1');
    expect(core.isModelResearched(model)).toBe(false);
    for (let i = 1; i < Math.ceil(core.researchRequiredFor(model).toNumber()); i++) core.tick(1);
    expect(core.isModelResearched(model)).toBe(true);
    expect(core.researchTarget).toBeNull();
  });

  it('缺电时不推进，停研究站时不靠等待自动完成', () => {
    const core = researchFactory();
    expect(core.setResearchTarget('c-8')).toBe(true);
    core.storedEU = dec('0');
    core.tick(120);
    expect(core.researchProgressOf('c-8').isZero()).toBe(true);
    core.storedEU = dec('1e12');
    core.stopped['r-7'] = true;
    core.tick(120);
    expect(core.researchProgressOf('c-8').isZero()).toBe(true);
  });

  it('付款后尚无进度也可切换并读档，恢复项目不重复扣款', () => {
    const core = researchFactory();
    expect(core.setResearchTarget('c-8')).toBe(true);
    expect(core.setResearchTarget('m-8')).toBe(true);
    const saved = serialize(core);
    const restored = deserialize(saved);
    const wallet = restored.coins[6]!.toString();
    expect(restored.setResearchTarget('c-8')).toBe(true);
    expect(restored.setResearchTarget('c-8')).toBe(true);
    expect(restored.coins[6]!.toString()).toBe(wallet);
    expect(restored.researchInvestments).toContain('m-8');
    expect(serialize(deserialize(serialize(restored)))).toEqual(serialize(restored));
  });

  it('v26 原研究目标和进度免补缴，旧矿石与各级币保持原值', () => {
    const core = researchFactory();
    core.researchTarget = 'c-8';
    core.researchProgress['m-8'] = dec('12.5');
    core.ores[0] = dec('123');
    const legacy = { ...serialize(core), version: 26 };
    delete legacy.researchInvestments;
    const restored = deserialize(legacy);
    const coins = restored.coins.map(value => value.toString());
    expect(restored.researchTargetModel()?.id).toBe('c-8');
    expect(restored.setResearchTarget('m-8')).toBe(true);
    expect(restored.researchProgressOf('m-8').toString()).toBe('12.5');
    expect(restored.setResearchTarget('c-8')).toBe(true);
    expect(restored.coins.map(value => value.toString())).toEqual(coins);
    expect(restored.ores[0]!.toString()).toBe('123');
  });

  it('工业宇宙研究投资沿用跨电压支付，开局不能绕过研究开放条件', () => {
    const core = researchFactory();
    core.universes = ['industry'];
    core.coins[6] = dec('0');
    core.coins[0] = dec('1e12');
    expect(core.canInvestResearch(modelById('c-8'))).toBe(true);
    expect(core.setResearchTarget('c-8')).toBe(true);
    expect(core.coins[0]!.lt('1e12')).toBe(true);
    const starter = new GameCore();
    starter.coins[6] = dec('1e12');
    expect(starter.setResearchTarget('c-8')).toBe(false);
    expect(starter.coins[6]!.toString()).toBe('1000000000000');
  });

  it('在线离线研究结果一致，完成后不会自动付费研究下一项', async () => {
    const online = researchFactory();
    expect(online.setResearchTarget('c-8')).toBe(true);
    const offline = deserialize(serialize(online));
    offline.random = () => 0.999;
    const wallet = online.coins[6]!.toString();
    for (let i = 0; i < 240; i++) online.tick(1);
    await advanceSimulation({ seconds: 240, tick: step => offline.tick(step) });
    expect(serialize(offline)).toEqual(serialize(online));
    expect(offline.researchedModels).toEqual(['c-8']);
    expect(offline.coins[6]!.toString()).toBe(wallet);
    expect(offline.researchInvestments).toEqual(['c-8']);
    expect(offline.researchTarget).toBeNull();
  });

  it('转生清空本轮投资和进度', () => {
    const core = researchFactory();
    expect(core.setResearchTarget('c-8')).toBe(true);
    expect(core.rebirth('rift')).not.toBeNull();
    expect(core.researchInvestments).toEqual([]);
    expect(core.researchProgress).toEqual({});
  });
});
