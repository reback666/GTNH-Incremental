import voltages from './voltages.json';
import families from './machine-families.json';
import machines from './machines.json';
import rules from './rules.json';
import type { MachineDefinition, MachineFamily, VoltageDefinition } from './types';
import { createContentRegistry } from './registry';

export const CONTENT = createContentRegistry({
  voltages: voltages as VoltageDefinition[],
  families: families as MachineFamily[],
  machines: machines as MachineDefinition[],
  rules,
});
export const VOLTAGES = CONTENT.voltages;
export const tierOf = CONTENT.tierOf;
