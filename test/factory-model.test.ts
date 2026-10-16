import { describe, expect, it } from 'vitest';
import {
  allocateBudget,
  apportionStatus,
  buildFactoryPlan,
  splitStatus,
  type FactoryInput,
  type FactoryInputModel,
} from '../src/rendering/factory-model';

function model(id: string, count: number, extra: Partial<FactoryInputModel> = {}): FactoryInputModel {
  return {
    id,
    name: id,
    block: 'single',
    count,
    running: count,
    idle: 0,
    stopped: false,
    stoppable: true,
    faulty: 0,
    ...extra,
  };
}

function input(columns: { kind: string; models: FactoryInputModel[]; tier?: number }[], extra: Partial<FactoryInput> = {}): FactoryInput {
  return {
    columns: columns.map((col) => ({
      kind: col.kind,
      title: col.kind,
      count: col.models.reduce((sum, m) => sum + m.count, 0),
      tiers: [{ tier: col.tier ?? 1, voltage: 'ULV', unlocked: true, models: col.models }],
    })),
    maxTier: 1,
    power: { ratio: '100%', ratioShort: false },
    risk: { outage: false, bandName: '清洁' },
    currentVein: { tier: 1, name: '铜' },
    ...extra,
  };
}

describe('factory-model', () => {
  it('空存档：有分区环境但没有任何机器代表', () => {
    const plan = buildFactoryPlan(input([{ kind: 'miner', models: [model('m-1', 0)] }, { kind: 'generator', models: [model('g-ulv', 0)] }]));
    expect(plan.units).toHaveLength(0);
    expect(plan.groups).toHaveLength(0);
    expect(plan.totalMachines).toBe(0);
    expect(plan.zones.length).toBe(2);
  });

  it('海量机器受全局与每机型上限约束，但真实台数保留', () => {
    const plan = buildFactoryPlan(input([{ kind: 'machine', models: [model('a', 1_000_000), model('b', 50)] }]));
    expect(plan.totalMachines).toBe(1_000_050);
    expect(plan.units.length).toBeLessThanOrEqual(192);
    const a = plan.groups.find((g) => g.modelId === 'a')!;
    expect(a.shown).toBe(12);
    expect(a.aggregated).toBe(1_000_000 - 12);
  });

  it('前面的类别不吞掉后面的：预算紧时每个拥有机型都有至少 1 个代表', () => {
    const many = Array.from({ length: 30 }, (_, i) => model(`m${i}`, 999));
    const plan = buildFactoryPlan(
      input([
        { kind: 'miner', models: many },
        { kind: 'storage', models: [model('s-1', 1, { stoppable: false })] },
      ]),
      { perSingle: 12, perMulti: 4, total: 40 },
    );
    expect(plan.units.length).toBe(40);
    for (const group of plan.groups) expect(group.shown).toBeGreaterThanOrEqual(1);
    expect(plan.hiddenModels).toBe(0);
  });

  it('allocateBudget 逐层平分，差距不超过 1', () => {
    const shown = allocateBudget([{ count: 100, cap: 12 }, { count: 100, cap: 12 }, { count: 2, cap: 12 }], 15);
    expect(shown.reduce((a, b) => a + b, 0)).toBe(15);
    expect(shown[2]).toBe(2);
    expect(Math.abs(shown[0]! - shown[1]!)).toBeLessThanOrEqual(1);
  });

  it('代表 key 稳定：增加别的机型或改状态不改变已有 key', () => {
    // 快照里同级所有机型都会列出（未拥有时 count = 0），布局按完整机型表计算
    const before = buildFactoryPlan(input([{ kind: 'machine', models: [model('a', 3), model('b', 0)] }]));
    const after = buildFactoryPlan(
      input([{ kind: 'machine', models: [model('a', 3, { running: 1, faulty: 1 }), model('b', 2)] }]),
    );
    const keysA = (p: typeof before) => p.units.filter((u) => u.modelId === 'a').map((u) => `${u.key}@${u.x},${u.z}`);
    expect(keysA(after)).toEqual(keysA(before));
  });

  it('紧凑布局：新存档只有矿区/生产/供电基座，未拥有机型不占地', () => {
    const empty = buildFactoryPlan(
      input([
        { kind: 'miner', models: [model('m-1', 0)] },
        { kind: 'machine', models: Array.from({ length: 20 }, (_, i) => model(`x${i}`, 0)) },
        { kind: 'generator', models: [model('g-ulv', 0)] },
        { kind: 'arcane', models: [model('ar', 0)] },
      ]),
    );
    const active = empty.zones.filter((z) => z.d > 0).map((z) => z.kind).sort();
    expect(active).toEqual(['generator', 'machine', 'miner']);
    const many = Array.from({ length: 20 }, (_, i) => model(`x${i}`, i === 0 ? 1 : 0));
    const one = buildFactoryPlan(input([{ kind: 'machine', models: many }]));
    const zone = one.zones[0]!;
    // 20 个机型里只拥有 1 个：分区不会按 20 个机型预留
    expect(zone.w).toBeLessThan(8);
    expect(zone.d).toBeLessThan(8);
  });

  it('多机型分区排成近方形网格，不是长条', () => {
    const models = Array.from({ length: 30 }, (_, i) => model(`m${i}`, 50));
    const plan = buildFactoryPlan(input([{ kind: 'machine', models }]), { perSingle: 12, perMulti: 4, total: 400 });
    const zone = plan.zones[0]!;
    const ratio = Math.max(zone.w, zone.d) / Math.min(zone.w, zone.d);
    expect(ratio).toBeLessThan(2);
    // 机位互不重叠
    const g = plan.groups;
    for (let i = 0; i < g.length; i += 1) {
      for (let j = i + 1; j < g.length; j += 1) {
        const a = g[i]!;
        const b = g[j]!;
        const overlap = Math.abs(a.padX - b.padX) * 2 < a.padW + b.padW && Math.abs(a.padZ - b.padZ) * 2 < a.padD + b.padD;
        expect(overlap).toBe(false);
      }
    }
    for (const unit of plan.units) {
      const pad = g.find((x) => x.modelId === unit.modelId)!;
      expect(Math.abs(unit.x - pad.padX)).toBeLessThan(pad.padW / 2);
      expect(Math.abs(unit.z - pad.padZ)).toBeLessThan(pad.padD / 2);
    }
  });

  it('真实状态：故障、手动停机、缺电、储能各自区分且总和等于台数', () => {
    const faulty = splitStatus(model('x', 10, { running: 6, faulty: 2 }), 'machine', false);
    expect(faulty).toMatchObject({ running: 6, faulty: 2, idle: 2 });
    const stopped = splitStatus(model('x', 5, { running: 0, stopped: true, faulty: 1 }), 'machine', false);
    expect(stopped).toMatchObject({ stopped: 4, faulty: 1, running: 0 });
    const outage = splitStatus(model('x', 4, { running: 0 }), 'machine', true);
    expect(outage.unpowered).toBe(4);
    const storage = splitStatus(model('s', 3, { stoppable: false }), 'storage', true);
    expect(storage.storage).toBe(3);
    const counts = splitStatus(model('x', 1000, { running: 990, faulty: 3 }), 'machine', false);
    const statuses = apportionStatus(counts, 12);
    expect(statuses).toHaveLength(12);
    // 少量故障也至少显示 1 个
    expect(statuses).toContain('faulty');
    expect(statuses.filter((s) => s === 'running').length).toBeGreaterThan(6);
  });
});
