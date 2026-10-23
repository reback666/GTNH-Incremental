import { afterEach, describe, expect, it, vi } from 'vitest';
import voltages from '../src/content/voltages.json';
import families from '../src/content/machine-families.json';
import machines from '../src/content/machines.json';
import rules from '../src/content/rules.json';
import { createContentRegistry } from '../src/content/registry';
import type { ContentDefinition } from '../src/content/types';

function definition(): ContentDefinition {
  return structuredClone({ voltages, families, machines, rules }) as ContentDefinition;
}

function withCustomContent(): ContentDefinition {
  const content = definition();
  const inherited = content.voltages.find((voltage) => voltage.id === 'UIV')!;
  content.voltages.splice(content.voltages.findIndex((voltage) => voltage.id === 'UMV'), 0, {
    ...inherited, id: 'Q', name: '量子电压', modelKey: 'quantum', casingVoltage: 'UIV', coin: '量子币',
    ore: { ...inherited.ore, material: '量子矿石' },
  });
  content.machines.push({
    id: 'q-assembler', name: '量子组装机', voltage: 'Q', category: 'machine', block: 'single',
    outputFactor: '2', costFactor: '3', icon: 'c-12', overclockable: true,
  });
  return content;
}

afterEach(() => {
  vi.doUnmock('../src/content/voltages.json');
  vi.doUnmock('../src/content/machines.json');
  vi.resetModules();
});

describe('内容注册与扩展', () => {
  it('插入电压自动扩展机器系列，原有机器 ID 和素材键保持不变', () => {
    const original = createContentRegistry(definition());
    const extended = createContentRegistry(withCustomContent());
    expect(extended.tierOf('UMV')).toBe(original.tierOf('UMV') + 1);
    expect(extended.byModelId.get('c-13')).toMatchObject({ tier: 14, name: '史诗组装构建者 IV', icon: 'c-13' });
    expect(extended.byModelId.get('c-quantum')).toMatchObject({ tier: 13, name: '量子电压 制造机', icon: 'c-12' });
    expect(extended.byModelId.get('q-assembler')).toMatchObject({ tier: 13, outputFactor: '2', icon: 'c-12' });
    expect(extended.byModelId.get('mm-quantum')).toBeUndefined();
  });

  it.each(['voltage', 'modelKey', 'machine', 'reference', 'factor'] as const)('拒绝会串档或覆盖内容的错误配置：%s', (kind) => {
    const content = definition();
    if (kind === 'voltage') content.voltages[1].id = content.voltages[0].id;
    if (kind === 'modelKey') content.voltages[1].modelKey = content.voltages[0].modelKey;
    if (kind === 'machine') content.machines.push({ ...content.machines[0] });
    if (kind === 'reference') content.machines[0].voltage = 'missing';
    if (kind === 'factor') content.families[0].outputFactor = '-1';
    expect(() => createContentRegistry(content)).toThrow();
  });

  it('自定义倍率保留大数精度，允许超过普通浮点数范围的十进制文本', () => {
    const content = definition();
    content.machines[0].outputFactor = '1e500';
    expect(createContentRegistry(content).models[0].outputFactor).toBe('1e500');
  });

  it('只修改内容数据即可在购买入口使用新电压和机型，并按标识恢复原存档', async () => {
    const content = withCustomContent();
    vi.doMock('../src/content/voltages.json', () => ({ default: content.voltages }));
    vi.doMock('../src/content/machines.json', () => ({ default: content.machines }));
    vi.resetModules();
    const [{ GameCore }, { serialize, deserialize }, { dec }, { setCore }, { useGameStore }, pinia] = await Promise.all([
      import('../src/game/core'), import('../src/game/save'), import('../src/numeric/decimal'),
      import('../src/game/engine'), import('../src/game/store'), import('pinia'),
    ]);
    const core = new GameCore();
    core.maxTier = 13;
    core.coins = core.coins.map(() => dec('1e30'));
    core.researchedModels = ['c-quantum', 'q-assembler'];
    setCore(core);
    pinia.setActivePinia(pinia.createPinia());
    const store = useGameStore();
    store.refresh();
    store.buy('q-assembler', 1, 'coin');
    expect(core.countOf('q-assembler')).toBe(1);
    const quantum = store.snap.columns.find((column) => column.kind === 'machine')!.tiers.find((row) => row.tier === 13)!;
    expect(quantum.voltage).toBe('量子电压');
    expect(quantum.models.find((model) => model.id === 'q-assembler')?.count).toBe(1);
    expect(store.snap.coins[0].name).toBe('量子币');
    expect(store.snap.ores[0].name).toBe('量子矿石');

    const saved = serialize(core);
    expect(saved.voltageIds).toContain('Q');
    expect(deserialize(saved).countOf('q-assembler')).toBe(1);
    const old = {
      ...saved, voltageIds: voltages.map((voltage) => voltage.id), maxTier: 15, peakTier: 15,
      ores: voltages.map((_, index) => String(index + 1)), coins: voltages.map(() => '100'),
      counts: { 'c-13': 2, 'c-15': 3 }, overclock: { 'c-13': 1 },
      faults: { 'c-13': 1 }, stopped: { 'c-15': true as const },
      researchedModels: ['c-13', 'c-15'], pickaxeVajra: 14,
      runHistory: [{ run: 1, route: 'max', maxTier: 15, cables: '100', seconds: 1000 }],
    };
    const restored = deserialize(old);
    expect(restored.maxTier).toBe(16);
    expect(restored.peakTier).toBe(16);
    expect(restored.ores.slice(12).map(String)).toEqual(['0', '13', '14', '15']);
    expect(restored.countOf('c-13')).toBe(2);
    expect(restored.overclockOf('c-13')).toBe(1);
    expect(restored.faults['c-13']).toBe(1);
    expect(restored.stopped['c-15']).toBe(true);
    expect(restored.pickaxeVajra).toBe(15);
    expect(restored.runHistory[0].maxTier).toBe(16);
    expect(serialize(deserialize(serialize(restored)))).toEqual(serialize(restored));
    const legacy: import('../src/game/save').SaveData = { ...old, version: 25 };
    delete legacy.voltageIds;
    expect(deserialize(legacy).ores.map(String)).toEqual(restored.ores.map(String));
    expect(deserialize(legacy).counts).toEqual(restored.counts);

    const [{ modelIconUrl }, { veinIconUrl }, { casingUrl }, { pickaxeIconUrl }] = await Promise.all([
      import('../src/game/icons'), import('../src/game/veins'), import('../src/scene/textures'), import('../src/game/pickaxe-icons'),
    ]);
    expect(modelIconUrl('q-assembler')).toBe(modelIconUrl('c-12'));
    expect(modelIconUrl('q-assembler')).toBeTruthy();
    expect(veinIconUrl(12)).toBe(veinIconUrl(11));
    expect(casingUrl(13, 'side')).toBe(casingUrl(12, 'side'));
    expect(pickaxeIconUrl('vajra', 13)).toBe(pickaxeIconUrl('vajra', 12));
  });
});
