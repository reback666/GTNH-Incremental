import type { ContentDefinition, MachineModel, MachineProperties } from './types';
import { MACHINE_CATEGORIES } from './types';
import { fromSaveString } from '../numeric/decimal';

const CATEGORIES = new Set<string>(MACHINE_CATEGORIES);
const KEY = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const COLOR = /^#[a-fA-F0-9]{6}$/;

function positiveAmount(value: string, label: string) {
  try {
    const amount = fromSaveString(value);
    if (amount.isFinite() && amount.gt(0)) return amount;
  } catch {
    // 统一给出配置字段的位置，避免只显示底层数字解析错误。
  }
  throw new Error(`${label} 必须是正数文本`);
}

// 配置在启动与构建时经过同一个入口；重复 ID、错拼电压等错误不能静默覆盖内容。
export function createContentRegistry(definition: ContentDefinition) {
  const { rules, families } = definition;
  const seen = new Set<string>();
  const modelKeys = new Set<string>();
  for (const voltage of definition.voltages) {
    if (!KEY.test(voltage.id) || seen.has(voltage.id)) throw new Error(`电压 ID 重复或非法：${voltage.id}`);
    if (!KEY.test(voltage.modelKey) || modelKeys.has(voltage.modelKey)) throw new Error(`电压机器键重复或非法：${voltage.modelKey}`);
    if (!KEY.test(voltage.textureKey) || !KEY.test(voltage.ore.texture)) throw new Error(`电压素材键非法：${voltage.id}`);
    if (voltage.color !== null && !COLOR.test(voltage.color)) throw new Error(`电压配色非法：${voltage.id}`);
    if (voltage.color === null && voltage.id !== 'MAX') throw new Error('彩虹电压配色只用于 MAX');
    if (!voltage.coin || !voltage.ore.material || !['none', 'halo', 'fuzzy'].includes(voltage.ore.fx)) throw new Error(`电压资源配置不完整：${voltage.id}`);
    seen.add(voltage.id);
    modelKeys.add(voltage.modelKey);
  }
  if (definition.voltages[0]?.id !== 'ULV' || definition.voltages.at(-1)?.id !== 'MAX') {
    throw new Error('电压序列必须以 ULV 开始、以 MAX 结束');
  }
  const voltages = definition.voltages.map((voltage, index) => ({ ...voltage, tier: index + 1 }));
  const byId = new Map(voltages.map((voltage) => [voltage.id, voltage]));
  const tierOf = (id: string): number => {
    const voltage = byId.get(id);
    if (!voltage) throw new Error(`未定义的电压：${id}`);
    return voltage.tier;
  };
  for (const step of [rules.voltageStep, rules.coinStep, rules.computeStep]) {
    if (!Number.isInteger(step) || step <= 1) throw new Error('资源递增倍率必须是大于 1 的整数');
  }
  for (const colors of [rules.rainbow, rules.rainbowText]) {
    if (colors.length < 2 || colors.some((color) => !COLOR.test(color))) throw new Error('彩虹配色至少需要两种有效颜色');
  }
  tierOf(rules.researchVoltage);
  tierOf(rules.researchGateVoltage);
  for (const id of Object.keys(rules.generatorEfficiency)) tierOf(id);
  for (const efficiency of [...Object.values(rules.generatorEfficiency), rules.defaultGeneratorEfficiency]) {
    if (positiveAmount(efficiency, '默认燃料效率').gt(1)) throw new Error('默认燃料效率必须在 0 到 1 之间');
  }

  const validateMachine = (machine: MachineProperties, id: string) => {
    if (!CATEGORIES.has(machine.category) || !['single', 'multiblock'].includes(machine.block)) throw new Error(`机器类别或结构类型非法：${id}`);
    for (const value of [machine.outputFactor, machine.costFactor]) {
      positiveAmount(value, `机器倍率：${id}`);
    }
    if (machine.fuelEfficiency !== undefined && positiveAmount(machine.fuelEfficiency, `燃料效率：${id}`).gt(1)) throw new Error(`燃料效率超出范围：${id}`);
    if (machine.computeRole !== undefined && !['produce', 'consume'].includes(machine.computeRole)) throw new Error(`计算角色非法：${id}`);
    if (machine.requiresUniverse !== undefined && !['arcane', 'abyss'].includes(machine.requiresUniverse)) throw new Error(`机器宇宙条件非法：${id}`);
    if (!machine.name || (machine.icon !== undefined && !KEY.test(machine.icon))) throw new Error(`机器名称或图标非法：${id}`);
    for (const value of [machine.visPowered, machine.overclockable]) {
      if (value !== undefined && typeof value !== 'boolean') throw new Error(`机器开关必须是布尔值：${id}`);
    }
  };
  const models: MachineModel[] = [];
  const ids = new Set<string>();
  const add = (model: MachineModel) => {
    if (!KEY.test(model.id) || ids.has(model.id)) throw new Error(`机器 ID 重复或非法：${model.id}`);
    validateMachine(model, model.id);
    ids.add(model.id);
    models.push(model);
  };
  for (const { voltage, ...machine } of definition.machines) {
    add({ ...machine, tier: tierOf(voltage), icon: machine.icon ?? machine.id });
  }
  const familyIds = new Set<string>();
  for (const family of families) {
    const { id, fromVoltage, toVoltage, voltageInName = true, overrides = {}, ...properties } = family;
    if (!KEY.test(id) || familyIds.has(id)) throw new Error(`机器系列 ID 重复或非法：${id}`);
    familyIds.add(id);
    const from = fromVoltage === undefined ? 1 : tierOf(fromVoltage);
    const to = toVoltage === undefined ? voltages.length : tierOf(toVoltage);
    if (from > to) throw new Error(`机器系列电压范围颠倒：${id}`);
    for (const key of Object.keys(overrides)) tierOf(key);
    for (const voltage of voltages) {
      if (voltage.tier < from || voltage.tier > to) continue;
      add({
        ...properties,
        name: voltageInName ? `${voltage.name ?? voltage.id} ${properties.name}` : properties.name,
        icon: properties.icon ?? `${id}-${voltage.textureKey}`,
        ...overrides[voltage.id],
        id: `${id}-${voltage.modelKey}`,
        tier: voltage.tier,
      });
    }
  }
  const byModelId = new Map(models.map((model) => [model.id, model]));
  const family = (id: string) => {
    const found = families.find((item) => item.id === id);
    if (!found) throw new Error(`未定义的机器系列：${id}`);
    return found;
  };
  return { voltages, models, byModelId, tierOf, family, rules };
}
