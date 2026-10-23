export const MACHINE_CATEGORIES = ['miner', 'generator', 'machine', 'storage', 'purifier', 'research', 'arcane', 'abyss'] as const;
export type MachineCategory = typeof MACHINE_CATEGORIES[number];
export type BlockKind = 'single' | 'multiblock';
export type VeinFx = 'none' | 'halo' | 'fuzzy';

export interface VoltageDefinition {
  id: string;
  name?: string;
  // 这两个键属于内容身份和素材文件名，调整电压顺序时不能随序号重编号。
  modelKey: string;
  textureKey: string;
  casingVoltage?: string;
  color: string | null;
  coin: string;
  ore: {
    material: string;
    fx: VeinFx;
    texture: string;
    dye?: string;
    animation?: { jar?: string; file?: string; frameTicks?: number };
  };
}

export interface MachineProperties {
  name: string;
  category: MachineCategory;
  block: BlockKind;
  outputFactor: string;
  costFactor: string;
  fuelEfficiency?: string;
  computeRole?: 'produce' | 'consume';
  requiresUniverse?: 'arcane' | 'abyss';
  visPowered?: boolean;
  overclockable?: boolean;
  icon?: string;
}

export interface MachineFamily extends MachineProperties {
  id: string;
  fromVoltage?: string;
  toVoltage?: string;
  voltageInName?: boolean;
  overrides?: Record<string, Partial<MachineProperties>>;
}

export interface MachineDefinition extends MachineProperties {
  id: string;
  voltage: string;
}

export interface MachineModel extends MachineProperties {
  id: string;
  tier: number;
}

export interface ContentRules {
  voltageStep: number;
  coinStep: number;
  computeStep: number;
  researchVoltage: string;
  researchGateVoltage: string;
  generatorEfficiency: Record<string, string>;
  defaultGeneratorEfficiency: string;
  rainbow: string[];
  rainbowText: string[];
}

export interface ContentDefinition {
  voltages: VoltageDefinition[];
  families: MachineFamily[];
  machines: MachineDefinition[];
  rules: ContentRules;
}
