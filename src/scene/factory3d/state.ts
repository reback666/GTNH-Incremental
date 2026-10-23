import config from '../../content/scene-machines.json';
import { CONTENT } from '../../content';
import type { MachineKind } from '../../game/core';
import type { FactoryOverview } from '../../game/presentation/types';

export interface SceneMachineState {
  id: string;
  name: string;
  category: MachineKind;
  count: number;
  running: number;
  activity: number;
  accent: string;
}

export const SCENE_VOLTAGE = config.voltage;
export const SCENE_MODELS = config.machines.map(profile => {
  const model = CONTENT.byModelId.get(profile.modelId);
  if (!model || model.tier !== CONTENT.tierOf(config.voltage)) throw new Error(`场景机型与电压不符：${profile.modelId}`);
  return { ...profile, name: model.name, category: model.category };
});

export function sceneMachines(factory: FactoryOverview, demo: boolean, running: boolean): SceneMachineState[] {
  const owned = new Map(factory.facilities.flatMap(facility => facility.machines.map(machine => [machine.modelId, { ...machine, activity: facility.activity }] as const)));
  return SCENE_MODELS.map(model => {
    const machine = owned.get(model.modelId);
    return {
      id: model.modelId, name: model.name, category: model.category, accent: model.accent,
      count: demo ? 1 : machine?.count ?? 0,
      running: demo ? (running ? 1 : 0) : machine?.running ?? 0,
      activity: demo ? (running ? 1 : 0) : machine?.activity ?? 0,
    };
  });
}
