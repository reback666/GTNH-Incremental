import { CONTENT, tierOf } from '../content';
import type { MachineCategory, MachineModel } from '../content/types';
export type { MachineCategory, MachineModel, BlockKind } from '../content/types';

const fromTier = (familyId: string) => tierOf(CONTENT.family(familyId).fromVoltage ?? CONTENT.voltages[0].id);
export const STORAGE_FROM_TIER = fromTier('b');
export const PURIFIER_FROM_TIER = fromTier('p');
export const ARCANE_MACHINE_FACTOR = CONTENT.family('mm').outputFactor;
export const ARCANE_FROM_TIER = fromTier('mm');
export const ARCANE_TO_TIER = tierOf(CONTENT.family('mm').toVoltage ?? CONTENT.voltages.at(-1)!.id);
export const MACHINE_MODELS: MachineModel[] = CONTENT.models;

// 类别 → 该类的全部机型。模拟与快照每秒要问几十次，预生成一份就够，
// 不必每次都筛一遍机型目录。数组冻结：调用方一律只读。
const BY_CATEGORY = new Map<MachineCategory, readonly MachineModel[]>();
for (const model of MACHINE_MODELS) {
  const list = BY_CATEGORY.get(model.category);
  BY_CATEGORY.set(model.category, list ? [...list, model] : [model]);
}
for (const [category, list] of BY_CATEGORY) BY_CATEGORY.set(category, Object.freeze(list));


export function modelsOf(category: MachineCategory): readonly MachineModel[] {
  return BY_CATEGORY.get(category) ?? [];
}

// 基准机型：取目录中该类别、该电压的第一个机型。
export function baseModelOf(category: MachineCategory, tier: number): MachineModel {
  const found = modelsOf(category).find((model) => model.tier === tier);
  if (!found) throw new Error(`${category} 在 tier ${tier} 没有机型`);
  return found;
}

// 只有跑配方的机器能超频：采矿机与制造机。
// 发电机没有配方，原版 GT 也不给发电机超频，所以不给档位。
export function canOverclock(model: MachineModel): boolean {
  return model.overclockable ?? (model.category === 'miner' || model.category === 'machine');
}
