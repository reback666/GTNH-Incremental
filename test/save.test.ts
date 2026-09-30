import { describe, expect, it } from 'vitest';
import { deserialize, type SaveData } from '../src/game/save';

// 读档清洗：存档是玩家机器上的数据，坏值不能进到模拟里，也不能因为一个字段坏了
// 就把整份存档丢掉（见 src/game/save.ts 的 clean* 一组）。

function emptySave(): SaveData {
  return {
    version: 17,
    ores: [],
    coins: [],
    maxTier: 1,
    unlockedVeins: [0],
    playSeconds: 0,
    totalOre: '0',
    totalCoins: '0',
    totalOreSpent: '0',
  };
}

describe('读档清洗', () => {
  it('越界、负数、乱写的值都收敛到合法范围', () => {
    const core = deserialize({
      ...emptySave(),
      ores: ['100', 'oops', '-5'],
      counts: { 'm-1': -5, 'm-2': 1.5, 'no-such-model': 3 },
      overclock: { 'm-1': 99, 'm-2': 2 },
      faults: { 'm-2': 99 },
      stopped: { 'm-2': true, 'g-ulv': true },
      maxTier: 999,
      peakTier: 999,
      unlockedVeins: [3, 3, 99, -1],
      playSeconds: -10,
      researchProgressByModel: { 'm-9': 'abc', 'no-such-model': '10' },
    });

    expect(core.maxTier).toBe(14);
    expect(core.peakTier).toBe(14);
    expect(core.unlockedVeins).toEqual([3]);
    expect(core.playSeconds).toBe(0);
    // 越界等级按 0 处理，'oops' 也退回 0
    expect(core.ores[0]!.toString()).toBe('100');
    expect(core.ores[1]!.toString()).toBe('0');
    expect(core.ores[2]!.toString()).toBe('0');
    // 负台数丢掉、小数台数取整、不存在的机型丢掉
    expect(core.counts).toEqual({ 'm-2': 1 });
    expect(core.overclockOf('m-1')).toBe(0);
    expect(core.overclockOf('m-2')).toBe(2);
    // 故障台数不超过剩下的台数
    expect(core.faults['m-2']).toBe(1);
    // 没建过的机型不留停机记录
    expect(core.stopped).toEqual({ 'm-2': true });
    expect(Object.keys(core.researchProgress)).toEqual([]);
  });

  it('缺字段的残档按默认值读入，不再整份丢掉', () => {
    const core = deserialize({ version: 17 } as SaveData);
    expect(core.maxTier).toBe(1);
    expect(core.unlockedVeins).toEqual([0]);
    expect(core.playSeconds).toBe(0);
    expect(core.counts).toEqual({});
    expect(core.grid).toBe('normal');
    expect(core.grids).toEqual(['normal']);
  });

  it('电网模式写坏了就退回普通电网，并保证它一定已解锁', () => {
    const core = deserialize({ ...emptySave(), grid: 'nonsense', grids: ['nonsense'] });
    expect(core.grid).toBe('normal');
    expect(core.grids).toEqual(['normal']);
  });

  it('平行宇宙与待选宇宙只认实现过的，重复项只留一个', () => {
    const core = deserialize({
      ...emptySave(),
      universes: ['arcane', 'arcane', 'no-such-universe'],
      pendingUniverse: 'arcane',
    });
    expect(core.universes).toEqual(['arcane']);
    // 已经拿到的宇宙不能再挂进「下次转生带」
    expect(core.pendingUniverse).toBeNull();
  });
});
