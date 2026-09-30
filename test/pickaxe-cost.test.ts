import { describe, expect, it } from 'vitest';
import {
  PICKAXE_COST_SCALE,
  pickaxeUpgradeCoinTier,
  pickaxeUpgradeCost,
  pickaxeUpgradeTier,
  type PickaxeLine,
} from '../src/numeric/pickaxe';
import { ZERO, dec, pow } from '../src/numeric/decimal';
import { GameCore } from '../src/game/core';
import { SAVE_VERSION } from '../src/game/constants';

// 基准价：machineCost({ baseCost, tier, purchased: 0 }) 里基准价就是 500×4^(tier-1)
function baseCost(tier: number) {
  return dec('500').times(pow('4', tier - 1));
}

describe('pickaxeUpgradeTier 映射', () => {
  it('金刚杵：第 n 次升级 → tier = n+1', () => {
    // level 从 0 数，level=0 是第 1 次升级
    expect(pickaxeUpgradeTier('vajra', 0)).toBe(2);
    expect(pickaxeUpgradeTier('vajra', 1)).toBe(3);
    expect(pickaxeUpgradeTier('vajra', 4)).toBe(6);
  });

  it('连锁采集：第 n 次升级 → tier = n+1', () => {
    expect(pickaxeUpgradeTier('collect', 0)).toBe(2);
    expect(pickaxeUpgradeTier('collect', 2)).toBe(4);
  });

  it('连锁爆破：第 n 次升级 → tier = floor((n-1)/2)+1', () => {
    // 每级电压给 2 次爆破机会，所以两次升级共用同一 tier
    expect(pickaxeUpgradeTier('blast', 0)).toBe(1); // n=1
    expect(pickaxeUpgradeTier('blast', 1)).toBe(1); // n=2
    expect(pickaxeUpgradeTier('blast', 2)).toBe(2); // n=3
    expect(pickaxeUpgradeTier('blast', 3)).toBe(2); // n=4
    expect(pickaxeUpgradeTier('blast', 4)).toBe(3); // n=5
  });
});

describe('pickaxeUpgradeCoinTier 币种', () => {
  it('用第 n 级币，而不是第 tier 级币', () => {
    // 金刚杵第 1 次升级（挖 T1）花第 1 级币
    expect(pickaxeUpgradeCoinTier('vajra', 0)).toBe(1);
    expect(pickaxeUpgradeCoinTier('vajra', 1)).toBe(2);
    expect(pickaxeUpgradeCoinTier('vajra', 4)).toBe(5);
  });

  it('连锁采集同样用第 n 级币', () => {
    expect(pickaxeUpgradeCoinTier('collect', 0)).toBe(1);
    expect(pickaxeUpgradeCoinTier('collect', 3)).toBe(4);
  });

  it('连锁爆破：paymentTier(tier) = max(1, tier-1)', () => {
    // tier=1 → 第 1 级币（下限 1）
    expect(pickaxeUpgradeCoinTier('blast', 0)).toBe(1);
    expect(pickaxeUpgradeCoinTier('blast', 1)).toBe(1);
    // tier=2 → 第 1 级币
    expect(pickaxeUpgradeCoinTier('blast', 2)).toBe(1);
    // tier=3 → 第 2 级币
    expect(pickaxeUpgradeCoinTier('blast', 4)).toBe(2);
  });

  it('币种永远不小于 1', () => {
    for (const line of ['vajra', 'collect', 'blast'] as PickaxeLine[]) {
      for (let level = 0; level < 8; level += 1) {
        expect(pickaxeUpgradeCoinTier(line, level)).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('三线价格系数', () => {
  it('系数就是规格里的 0.5 / 2 / 1', () => {
    expect(PICKAXE_COST_SCALE.vajra).toBe('0.5');
    expect(PICKAXE_COST_SCALE.collect).toBe('2');
    expect(PICKAXE_COST_SCALE.blast).toBe('1');
  });

  it('金刚杵：价 = 500×4^n ÷ 2', () => {
    // 第 1 次升级：tier=2，基准价 500×4 = 2000，×0.5 = 1000
    expect(pickaxeUpgradeCost('vajra', 0, baseCost).toNumber()).toBe(1000);
    // 第 2 次升级：tier=3，基准价 8000，×0.5 = 4000
    expect(pickaxeUpgradeCost('vajra', 1, baseCost).toNumber()).toBe(4000);
  });

  it('连锁采集：价 = 500×4^n × 2', () => {
    // 第 1 次升级：tier=2，2000 × 2 = 4000
    expect(pickaxeUpgradeCost('collect', 0, baseCost).toNumber()).toBe(4000);
    // 第 2 次升级：tier=3，8000 × 2 = 16000
    expect(pickaxeUpgradeCost('collect', 1, baseCost).toNumber()).toBe(16000);
  });

  it('连锁爆破：价 = 500×4^(tier-1)', () => {
    // tier=1：500 × 1 = 500
    expect(pickaxeUpgradeCost('blast', 0, baseCost).toNumber()).toBe(500);
    expect(pickaxeUpgradeCost('blast', 1, baseCost).toNumber()).toBe(500);
    // tier=2：500 × 4 = 2000
    expect(pickaxeUpgradeCost('blast', 2, baseCost).toNumber()).toBe(2000);
  });

  it('价格向下取整', () => {
    // 基准价 3 × 0.5 = 1.5 → 1
    expect(pickaxeUpgradeCost('vajra', 0, () => dec('3')).toNumber()).toBe(1);
  });
});

describe('GameCore 实际升级：扣币、买不起、跨电压', () => {
  // 直接把等级摆到指定位置，再看这一次升级的行为
  function coreAt(line: PickaxeLine, level: number): GameCore {
    const core = new GameCore();
    if (line === 'vajra') core.pickaxeVajra = level;
    else if (line === 'collect') core.pickaxeCollect = level;
    else core.pickaxeBlast = level;
    return core;
  }

  it('买不起：canUpgradePickaxe 为 false，且升级不改变等级', () => {
    const core = coreAt('vajra', 0);
    // 清空所有币
    for (let i = 0; i < core.coins.length; i += 1) core.coins[i] = ZERO;
    expect(core.canAffordPickaxeOf('vajra')).toBe(false);
    // 等级为 0 时 canUpgradePickaxe 还要过机会判定，这里直接看扣币结果
    const before = core.pickaxeLevel('vajra');
    core.upgradePickaxe('vajra');
    expect(core.pickaxeLevel('vajra')).toBe(before);
  });

  it('刚好够：扣光币，等级 +1', () => {
    const core = coreAt('vajra', 0);
    // vajra 从 LV 才开始发机会（vajraChances(1)=0），提到 LV 才能过机会判定
    core.maxTier = 2;
    const price = core.pickaxeUpgradeCostOf('vajra');
    const payTier = core.pickaxeUpgradeCoinTierOf('vajra');
    for (let i = 0; i < core.coins.length; i += 1) core.coins[i] = ZERO;
    core.coins[payTier - 1] = price;
    expect(core.canAffordPickaxeOf('vajra')).toBe(true);
    expect(core.canUpgradePickaxe('vajra')).toBe(true);
    expect(core.upgradePickaxe('vajra')).toBe(true);
    expect(core.pickaxeLevel('vajra')).toBe(1);
    expect(core.coins[payTier - 1]!.toNumber()).toBe(0);
  });

  it('差一点买不起：币少 1，升级失败且币不动', () => {
    const core = coreAt('collect', 0);
    const price = core.pickaxeUpgradeCostOf('collect');
    const payTier = core.pickaxeUpgradeCoinTierOf('collect');
    for (let i = 0; i < core.coins.length; i += 1) core.coins[i] = ZERO;
    core.coins[payTier - 1] = price.minus(1);
    const before = core.coins[payTier - 1]!;
    expect(core.canAffordPickaxeOf('collect')).toBe(false);
    core.upgradePickaxe('collect');
    expect(core.pickaxeLevel('collect')).toBe(0);
    expect(core.coins[payTier - 1]!.eq(before)).toBe(true);
  });

  it('先扣币再 +1：扣币失败时等级不涨', () => {
    const core = coreAt('blast', 0);
    const payTier = core.pickaxeUpgradeCoinTierOf('blast');
    for (let i = 0; i < core.coins.length; i += 1) core.coins[i] = ZERO;
    core.coins[payTier - 1] = ZERO;
    expect(core.upgradePickaxe('blast')).toBe(false);
    expect(core.pickaxeLevel('blast')).toBe(0);
  });

  it('跨电压：industry 宇宙下低一级的币能折算过来付', () => {
    // 等级 0 → tier=1 → payTier=1，没有低一级可折算，所以用等级 1：
    // 等级 1 → tier=2 → payTier=2，低一级是 1，索引合法
    const core = coreAt('vajra', 1);
    // 机会上限要够：vajraChances(3) = 2 > 等级 1，升级才不会被机会判定挡掉
    core.maxTier = 3;
    core.universes = ['industry'];
    const price = core.pickaxeUpgradeCostOf('vajra');
    const payTier = core.pickaxeUpgradeCoinTierOf('vajra');
    for (let i = 0; i < core.coins.length; i += 1) core.coins[i] = ZERO;
    // 只给低一级的币，价值够就能付（1 个高一级币 = 4 个低一级币）
    core.coins[payTier - 2] = price.times(4);
    expect(core.canAffordPickaxeOf('vajra')).toBe(true);
    expect(core.canUpgradePickaxe('vajra')).toBe(true);
    expect(core.upgradePickaxe('vajra')).toBe(true);
    expect(core.pickaxeLevel('vajra')).toBe(2);
  });

  it('跨电压：价值不够时不放行', () => {
    const core = coreAt('vajra', 0);
    core.universes = ['industry'];
    const price = core.pickaxeUpgradeCostOf('vajra');
    const payTier = core.pickaxeUpgradeCoinTierOf('vajra');
    for (let i = 0; i < core.coins.length; i += 1) core.coins[i] = ZERO;
    core.coins[payTier - 2] = price.times(4).minus(1);
    expect(core.canAffordPickaxeOf('vajra')).toBe(false);
    expect(core.upgradePickaxe('vajra')).toBe(false);
    expect(core.pickaxeLevel('vajra')).toBe(0);
  });
});

describe('存档版本', () => {
  it('这次改动不新增持久化字段，版本号不动', () => {
    expect(SAVE_VERSION).toBe(18);
  });
});
