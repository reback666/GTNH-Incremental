import config from '../../content/scene-machines.json';
import nativeManifest from '../../assets/factory3d/native-manifest.json';
import { CONTENT } from '../../content';
import type { MachineKind } from '../../game/core';
import type { FactoryOverview } from '../../game/presentation/types';
import type { MachineModel } from '../../game/models';

export interface SceneMachineState {
  id: string;
  modelId?: string;
  name: string;
  category: MachineKind;
  count: number;
  running: number;
  activity: number;
  accent: string;
  tier: number;
  voltage: string;
  representation: 'block';
  modelKind: 'single' | 'multiblock' | 'custom' | 'effect';
  size: number[];
}

export interface SceneFilter { category?: MachineKind | ''; tier?: number | null }

export function matchesSceneFilter(machine: SceneMachineState, filter: SceneFilter = {}): boolean {
  return (!filter.category || machine.category === filter.category) && (filter.tier == null || machine.tier === filter.tier);
}


const nativeModels = nativeManifest.models as Record<string, { kind: SceneMachineState['modelKind']; size: number[] }>;
const sceneProfiles = config.machines.map(profile => {
  const model = CONTENT.byModelId.get(profile.modelId);
  if (!model || model.tier !== CONTENT.tierOf(config.voltage)) throw new Error(`场景机型与电压不符：${profile.modelId}`);
  return { ...profile, name: model.name, category: model.category };
});

export function sceneMachines(factory: FactoryOverview): SceneMachineState[] {
  const profiles = new Map(sceneProfiles.map(model => [model.modelId, model]));
  const owned = factory.facilities.flatMap(facility => facility.machines.map(machine => ({ ...machine, category: facility.kind, activity: facility.activity })));
  const sources = owned.filter(machine => machine.count > 0);
  return sources.map(machine => {
    const model = CONTENT.byModelId.get(machine.modelId);
    const profile = profiles.get(machine.modelId);
    const native = nativeModels[machine.modelId];
    if (!native) throw new Error(`缺少厂区原生模型：${machine.modelId}`);
    return {
      id: machine.modelId, modelId: machine.modelId, name: model?.name ?? machine.modelId,
      category: machine.category, accent: profile?.accent ?? CONTENT.voltages[machine.tier - 1]?.color ?? '#9caeb0',
      tier: machine.tier, voltage: CONTENT.voltages[machine.tier - 1]?.id ?? String(machine.tier),
      representation: 'block', modelKind: native.kind, size: native.size,
      count: machine.count, running: machine.running, activity: machine.activity,
    };
  });
}

export function sceneModelState(model: MachineModel, factory: FactoryOverview, count = 1, running = 0, activity = 0): SceneMachineState {
  const existing = sceneMachines(factory).find(machine => machine.id === model.id);
  if (existing) return { ...existing, count, running, activity };
  const native = nativeModels[model.id];
  if (!native) throw new Error('缺少厂区原生模型：' + model.id);
  return {
    id: model.id,
    modelId: model.id,
    name: model.name,
    category: model.category,
    count,
    running,
    activity,
    accent: CONTENT.voltages[model.tier - 1]?.color ?? '#9caeb0',
    tier: model.tier,
    voltage: CONTENT.voltages[model.tier - 1]?.id ?? String(model.tier),
    representation: 'block',
    modelKind: native.kind,
    size: native.size,
  };
}
