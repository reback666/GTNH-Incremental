import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import { baseModelOf, MACHINE_MODELS } from '../src/game/models';
import { dec } from '../src/numeric/decimal';
import { deserialize, serialize } from '../src/game/save';
import { buildSnapshot } from '../src/game/presentation/snapshot';
import { advanceSimulation } from '../src/game/runtime';

function setup() {
  const core = new GameCore();
  core.maxTier = 8;
  core.universes = ['arcane'];
  core.coins = core.coins.map(() => dec('1e20'));
  core.ores = core.ores.map(() => dec('1e20'));
  core.random = () => 0.999;
  expect(core.arcaneExpedition.act({ type: 'research', id: 'A0' }, core.arcaneContext())).toBe(true);
  return core;
}

describe('原工业与奥术节点接入', () => {
  it('沿用原分级币付款，A0不改原节点、源质和矿石库存', () => {
    const core = new GameCore(); core.maxTier = 2; core.universes = ['arcane'];
    core.coins[1] = dec('1e10');
    expect(core.arcaneExpedition.act({ type: 'research', id: 'A0' }, core.arcaneContext())).toBe(false);
    const cost = core.arcaneContext().firstMachineCost(2);
    core.coins[0] = cost;
    expect(core.arcaneExpedition.act({ type: 'research', id: 'A0' }, core.arcaneContext())).toBe(true);
    expect(core.coins[0]!.toString()).toBe('0');
    expect(core.coins[1]!.toString()).toBe('10000000000');
    expect(core.counts).toEqual({}); expect(core.essentia.toString()).toBe('0');
    const node = baseModelOf('arcane', 2); core.counts[node.id] = 1;
    const extra = core.arcaneExpedition.visOutput(core.arcaneContext());
    const report = core.tick(1);
    expect(report.visProduced.eq(core.nodeVisRated().times('0.5').plus(extra))).toBe(true);
    expect(core.nodeEssentiaDemandRated().toString()).toBe('1');
  });

  it('调查和魔导研究使用原电网，缺电不推进，电力明细包含设施', () => {
    const core = setup();
    expect(core.arcaneExpedition.act({ type: 'build-survey', tier: 2 }, core.arcaneContext())).toBe(true);
    const survey = core.arcaneExpedition.state.surveys[0]!;
    core.tick(10); expect(survey.work).toBe('0');
    const gen = baseModelOf('generator', 2); core.counts[gen.id] = 2;
    core.tick(10); expect(dec(survey.work).gt(0)).toBe(true);
    expect(buildSnapshot(core).power.consumed.rows.some(row => row.name.includes('魔导研究'))).toBe(true);
  });

  it('普通机附魔只追加实际制造收益，不增加耗矿，也不凭空产币', () => {
    const plain = setup(); plain.arcaneExpedition.state.research = 3;
    const model = baseModelOf('machine', 2), generator = baseModelOf('generator', 2);
    plain.counts[model.id] = 1; plain.counts[generator.id] = 4;
    const enchanted = deserialize(serialize(plain)); enchanted.random = () => 0.999;
    expect(enchanted.enchant(model.id, 1)).toBe(true);
    const base = plain.tick(1), boosted = enchanted.tick(1);
    expect(boosted.coinsGained[1]!.eq(base.coinsGained[1]!.times('1.04'))).toBe(true);
    expect(boosted.oreSpent.map(v => v.toString())).toEqual(base.oreSpent.map(v => v.toString()));
    enchanted.counts[generator.id] = 0;
    expect(enchanted.tick(1).coinsGained[1]!.isZero()).toBe(true);
    enchanted.counts[generator.id] = 4; enchanted.ores = enchanted.ores.map(() => dec('0'));
    expect(enchanted.tick(1).coinsGained[1]!.isZero()).toBe(true);
  });

  it('附魔缺灵气只减少附加，升级补差，新购不自动附魔，出售清掉权益', () => {
    const core = setup(); core.arcaneExpedition.state.research = 6;
    const model = baseModelOf('machine', 2); core.counts[model.id] = 2;
    const initial = core.enchantmentQuote(model, 1).cost;
    expect(core.enchant(model.id, 1)).toBe(true);
    expect(core.enchantmentQuote(model, 3).cost.eq(initial.times(2))).toBe(true);
    expect(core.enchant(model.id, 3)).toBe(true); expect(core.enchantments[model.id]).toEqual([0, 0, 2]);
    core.counts[model.id] = 3;
    expect(core.enchantmentQuote(model, 1).count).toBe(1);
    core.arcaneExpedition.state.nodes = [];
    const generator = baseModelOf('generator', 2); core.counts[generator.id] = 4;
    const original = deserialize(serialize(core)); original.enchantments = {}; original.random = () => 0.999;
    expect(core.tick(1).coinsGained[1]!.eq(original.tick(1).coinsGained[1]!)).toBe(true);
    core.sell(model, 3); expect(core.enchantments[model.id]).toBeUndefined();
  });

  it('灵气按高、中、低分配，同级比例不依赖机型遍历顺序', () => {
    const core = setup();
    const models = MACHINE_MODELS.filter(m => m.category !== 'miner' && m.tier === 2 && m.visPowered);
    expect(models.length).toBeGreaterThanOrEqual(2);
    for (const model of models.slice(0, 2)) core.counts[model.id] = 1;
    core.tick(1);
    const [first, second] = models;
    expect(core.lastVisRatios.get(first!.id)!.eq(core.lastVisRatios.get(second!.id)!)).toBe(true);
    expect(core.setVisPriority(second!.id, 0)).toBe(true);
    core.tick(1);
    expect(core.lastVisRatios.get(first!.id)!.isZero()).toBe(true);
    expect(core.lastVisRatios.get(second!.id)!.gt(0)).toBe(true);
  });

  it('节点、队列、附魔和优先级保存往返，转生仅保留图鉴', async () => {
    const core = setup(); core.arcaneExpedition.state.research = 3;
    const model = baseModelOf('machine', 2); core.counts[model.id] = 2;
    core.enchant(model.id, 1); core.setVisPriority(model.id, 0);
    core.arcaneExpedition.act({ type: 'build-survey', tier: 2 }, core.arcaneContext());
    const restored = deserialize(serialize(core));
    expect(restored.arcaneExpedition.state).toEqual(core.arcaneExpedition.state);
    expect(restored.enchantments).toEqual(core.enchantments);
    expect(restored.visPriorities).toEqual(core.visPriorities);
    const online = deserialize(serialize(restored)), offline = deserialize(serialize(restored));
    online.random = offline.random = () => 0.999;
    for (let i = 0; i < 10; i++) online.tick(1);
    await advanceSimulation({ seconds: 10, tick: step => { offline.tick(step); } });
    expect(serialize(online)).toEqual(serialize(offline));
    const codex = JSON.stringify(restored.arcaneExpedition.state.codex);
    restored.maxTier = 7; restored.riftOffered = false;
    expect(restored.rebirth('rift')).not.toBeNull();
    expect(restored.arcaneExpedition.state.nodes).toHaveLength(0);
    expect(JSON.stringify(restored.arcaneExpedition.state.codex)).toBe(codex);
    expect(restored.enchantments).toEqual({});
  });
});
