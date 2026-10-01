import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/core';
import {
  CHALLENGES,
  challengeSettles,
  evaluateChallenge,
} from '../src/game/challenges';
import { rebirthCables } from '../src/numeric/rebirth';
import { dec } from '../src/numeric/decimal';
import { serialize, deserialize, type SaveData } from '../src/game/save';

// 挑战时间线（docs/转生拓展大纲.md M3）：
// 转生时挂 0 或 1 个挑战，全程受检，违规即失效；通过则线缆结算乘倍率 + 首通成就。

describe('挑战数据与判定函数', () => {
  it('五个挑战：倍率与门控按拍板定死', () => {
    expect(CHALLENGES.map((challenge) => [challenge.id, challenge.bonus])).toEqual([
      ['pure', '1.3'],
      ['red', '1.5'],
      ['grid', '1.2'],
      ['power', '1.25'],
      ['speedrun', '1.4'],
    ]);
    expect(CHALLENGES.find((c) => c.id === 'red')?.requireUniverse).toBe('abyss');
    expect(CHALLENGES.filter((c) => c.requireUniverse === undefined).length).toBe(4);
  });

  it('纯净：污染超过 30% 违规，恰好 30% 不算', () => {
    const base = {
      gridCount: 1,
      powerRatio: 1,
      playSeconds: 0,
      maxTier: 1,
      primed: true,
    };
    expect(evaluateChallenge('pure', { ...base, pollution: dec('30') }).violated).toBe(false);
    expect(evaluateChallenge('pure', { ...base, pollution: dec('30.1') }).violated).toBe(true);
  });

  it('赤色：首次到 60% 才开始判定，跌破才违规；从未到 60% 等于没参与', () => {
    const base = { gridCount: 1, powerRatio: 1, playSeconds: 0, maxTier: 1 };
    // 开局污染 0：不违规也没热身
    expect(evaluateChallenge('red', { ...base, pollution: dec('0'), primed: false })).toEqual({
      violated: false,
      primed: false,
    });
    // 到 60%：热身完成
    expect(evaluateChallenge('red', { ...base, pollution: dec('60'), primed: false })).toEqual({
      violated: false,
      primed: true,
    });
    // 热身后跌破：违规
    expect(evaluateChallenge('red', { ...base, pollution: dec('59.9'), primed: true }).violated).toBe(
      true,
    );
    // 没热身过就不算通过
    expect(challengeSettles('red', false, false)).toBe(false);
    expect(challengeSettles('red', false, true)).toBe(true);
  });

  it('断网：解锁第二个电网即违规', () => {
    const base = {
      pollution: dec('0'),
      gridCount: 1,
      powerRatio: 1,
      playSeconds: 0,
      maxTier: 1,
      primed: true,
    };
    expect(evaluateChallenge('grid', base).violated).toBe(false);
    expect(evaluateChallenge('grid', { ...base, gridCount: 2 }).violated).toBe(true);
  });

  it('稳频：供电率跌破 95% 违规（断电的 0% 也算）', () => {
    const base = { pollution: dec('0'), gridCount: 1, playSeconds: 0, maxTier: 1, primed: true };
    expect(evaluateChallenge('power', { ...base, powerRatio: 0.95 }).violated).toBe(false);
    expect(evaluateChallenge('power', { ...base, powerRatio: 0.9 }).violated).toBe(true);
    expect(evaluateChallenge('power', { ...base, powerRatio: 0 }).violated).toBe(true);
  });

  it('极限：8 小时没到 MAX 违规；到了 MAX 之后超时不罚', () => {
    const base = { pollution: dec('0'), gridCount: 1, powerRatio: 1, primed: true };
    const eightHours = 8 * 3600;
    expect(
      evaluateChallenge('speedrun', { ...base, gridCount: 1, playSeconds: eightHours - 1, maxTier: 1 })
        .violated,
    ).toBe(false);
    expect(
      evaluateChallenge('speedrun', { ...base, gridCount: 1, playSeconds: eightHours, maxTier: 1 })
        .violated,
    ).toBe(true);
    expect(
      evaluateChallenge('speedrun', { ...base, gridCount: 1, playSeconds: eightHours + 1, maxTier: 14 })
        .violated,
    ).toBe(false);
  });
});

describe('挑战在核心里生效', () => {
  function maxCore(): GameCore {
    const core = new GameCore();
    core.maxTier = 14;
    core.runEU = dec('1e40'); // MAX 公式 224 条
    return core;
  }

  it('转生时挂上新挑战：违规的结算不加成', () => {
    const core = maxCore();
    core.activeChallenge = 'pure';
    core.pollution = dec('50'); // 一拍就冒烟
    core.tick(1);
    expect(core.challengeViolated).toBe(true);
    const gained = core.rebirth('max');
    expect(gained?.toString()).toBe(rebirthCables({ totalEU: '1e40', maxTier: 14, rebirthCount: 0 }).toString());
    expect(core.completedChallenges).toEqual([]);
  });

  it('通过的挑战结算乘倍率并记首通；重复通过不重复记', () => {
    const core = maxCore();
    core.activeChallenge = 'pure'; // 全程无机器，污染 0
    core.tick(1);
    const expected = rebirthCables({ totalEU: '1e40', maxTier: 14, rebirthCount: 0 })
      .times('1.3')
      .floor();
    expect(core.rebirth('max')?.toString()).toBe(expected.toString());
    expect(core.completedChallenges).toEqual(['pure']);
    // 二周目再过一次：已首通，不再追加
    core.runEU = dec('1e40');
    core.tick(1);
    core.rebirth('max');
    expect(core.completedChallenges).toEqual(['pure']);
  });

  it('挂挑战走转生选择：新周目立即生效，选择用掉即清空', () => {
    const core = maxCore();
    expect(core.setPendingChallenge('nope')).toBe(false);
    expect(core.setPendingChallenge('pure')).toBe(true);
    core.rebirth('max');
    expect(core.activeChallenge).toBe('pure');
    expect(core.pendingChallenge).toBeNull();
    expect(core.challengeViolated).toBe(false);
  });

  it('赤色门控：要已拥有深渊宇宙、或本次转生正带上它', () => {
    const core = maxCore();
    expect(core.setPendingChallenge('red')).toBe(false);
    core.pendingUniverse = 'abyss';
    expect(core.setPendingChallenge('red')).toBe(true);
    const owned = maxCore();
    owned.universes = ['abyss'];
    expect(owned.setPendingChallenge('red')).toBe(true);
  });

  it('稳频：开局缺电一拍就失效', () => {
    const core = new GameCore();
    core.activeChallenge = 'power';
    core.maxTier = 1;
    core.counts['m-1'] = 1; // 只有耗电没有发电
    core.tick(1);
    expect(core.challengeViolated).toBe(true);
  });

  it('断网：解锁第二个电网就失效', () => {
    const core = new GameCore();
    core.activeChallenge = 'grid';
    core.maxTier = 2;
    core.grids.push('stable');
    core.tick(1);
    expect(core.challengeViolated).toBe(true);
  });
});

describe('转生履历（C1）', () => {
  it('每次转生记一条：路线、宇宙、挑战、线缆、时长、电压', () => {
    const core = new GameCore();
    core.maxTier = 14;
    core.runEU = dec('1e40');
    core.playSeconds = 3600;
    core.activeChallenge = 'pure';
    core.rebirth('max', 'industry');
    expect(core.runHistory.length).toBe(1);
    const first = core.runHistory[0]!;
    expect(first.run).toBe(1);
    expect(first.route).toBe('max');
    expect(first.universe).toBe('industry');
    expect(first.challenge).toBe('pure');
    expect(first.challengePassed).toBe(true);
    expect(first.maxTier).toBe(14);
    expect(first.seconds).toBe(3600);
    // 第二趟：裂缝路线、没挂挑战
    core.riftOffered = false;
    core.maxTier = 7; // LuV，裂缝条件
    core.rebirth('rift');
    const second = core.runHistory[0]!;
    expect(second.run).toBe(2);
    expect(second.route).toBe('rift');
    expect(second.challenge).toBe('');
    expect(second.challengePassed).toBe(false);
  });

  it('超过 50 条丢最旧的', () => {
    const core = new GameCore();
    core.maxTier = 14;
    for (let i = 0; i < 55; i += 1) {
      core.maxTier = 14; // 转生会把它归 1，每轮重新打到 MAX
      core.runEU = dec('1e40');
      core.rebirth('max');
    }
    expect(core.runHistory.length).toBe(50);
    expect(core.runHistory[0]!.run).toBe(55);
    expect(core.runHistory[49]!.run).toBe(6);
  });

  it('履历进存档（v20）并完整往返', () => {
    const core = new GameCore();
    core.maxTier = 14;
    core.runEU = dec('1e40');
    core.activeChallenge = 'grid';
    core.playSeconds = 7200;
    core.rebirth('max');
    const restored = deserialize(serialize(core));
    expect(restored.runHistory.length).toBe(1);
    expect(restored.runHistory[0]!.challenge).toBe('grid');
    expect(restored.runHistory[0]!.cables).toBe(core.runHistory[0]!.cables);
    // 旧档没有该字段：读入为空数组；脏条目被丢掉
    const legacy = deserialize({ version: 19 } as SaveData);
    expect(legacy.runHistory).toEqual([]);
    const messy = deserialize({
      runHistory: [{ run: 1, route: 'nonsense' }, 'junk', { run: 2, route: 'max', cables: '10' }],
    } as unknown as SaveData);
    expect(messy.runHistory.length).toBe(1);
    expect(messy.runHistory[0]!.run).toBe(2);
  });
});

describe('挑战存档（v19）', () => {
  it('五个字段完整往返', () => {
    const core = new GameCore();
    core.activeChallenge = 'pure';
    core.challengeViolated = true;
    core.challengePrimed = true;
    core.completedChallenges = ['grid', 'power'];
    core.pendingChallenge = 'red';
    const restored = deserialize(serialize(core));
    expect(restored.activeChallenge).toBe('pure');
    expect(restored.challengeViolated).toBe(true);
    expect(restored.challengePrimed).toBe(true);
    expect(restored.completedChallenges).toEqual(['grid', 'power']);
    expect(restored.pendingChallenge).toBe('red');
  });

  it('旧存档没有这些字段：按没挂挑战读入，乱写的 id 丢弃', () => {
    const core = deserialize({ version: 18 } as SaveData);
    expect(core.activeChallenge).toBeNull();
    expect(core.completedChallenges).toEqual([]);
    const messy = deserialize({
      activeChallenge: 'nope',
      pendingChallenge: 42,
      completedChallenges: ['pure', 'nonsense'],
    } as unknown as SaveData);
    expect(messy.activeChallenge).toBeNull();
    expect(messy.pendingChallenge).toBeNull();
    expect(messy.completedChallenges).toEqual(['pure']);
  });
});
