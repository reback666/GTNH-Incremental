import type { FactoryFacility, FactoryMachine } from '../game/presentation/types';
import type { MachineKind } from '../game/core';

export const SCENE_WIDTH = 1100;
export const SCENE_HEIGHT = 580;
export interface Point { x: number; y: number }
export interface Site { kind: MachineKind; x: number; y: number; color: string; label: string }

export const SITES: Site[] = [
  { kind: 'miner', x: -3, y: 2, color: '#64d4ce', label: '采矿区' },
  { kind: 'generator', x: 0, y: -3, color: '#ffc36b', label: '能源核心' },
  { kind: 'machine', x: 0, y: 1, color: '#85baff', label: '制造车间' },
  { kind: 'storage', x: 3, y: -1, color: '#a6a2ff', label: '储能矩阵' },
  { kind: 'purifier', x: 3, y: 3, color: '#9bd397', label: '环境控制' },
  { kind: 'research', x: -4, y: -3, color: '#d6a4ed', label: '研究中心' },
  { kind: 'arcane', x: -5, y: 0, color: '#ce94f1', label: '灵气节点' },
  { kind: 'abyss', x: 5, y: 0, color: '#ef8397', label: '腐蚀抑制' },
];

export function project(x: number, y: number, z = 0): Point {
  return { x: SCENE_WIDTH / 2 + (x - y) * 53, y: 290 + (x + y) * 26 - z };
}

export function viewportPoint(point: Point, zoom: number): Point {
  return { x: SCENE_WIDTH / 2 + (point.x - SCENE_WIDTH / 2) * zoom,
    y: SCENE_HEIGHT / 2 + (point.y - SCENE_HEIGHT / 2) * zoom };
}

export const CONNECTIONS: [MachineKind, MachineKind, 'power' | 'ore' | 'coin'][] = [
  ['miner', 'generator', 'ore'], ['miner', 'machine', 'ore'],
  ['generator', 'machine', 'power'], ['generator', 'storage', 'power'],
  ['generator', 'research', 'power'], ['generator', 'purifier', 'power'],
  ['arcane', 'generator', 'power'],
];

export interface MachinePlacement {
  machine: FactoryMachine;
  rack: number;
  rackX: number;
  rackY: number;
  rackSize: number;
  x: number;
  y: number;
  base: number;
  size: number;
  height: number;
}

export const MACHINES_PER_LAYER = 16;
export const LAYERS_PER_RACK = 3;
export const MACHINES_PER_RACK = MACHINES_PER_LAYER * LAYERS_PER_RACK;
export const MAX_VISIBLE_RACKS = 4;

export function rackCount(count: number): number {
  return Math.min(MAX_VISIBLE_RACKS, Math.ceil(Math.max(0, count) / MACHINES_PER_RACK));
}

// 每组填满三层后增加并列机组；高数量按有限机组聚合，不改变真实台数。
export function machinePlacements(facility: FactoryFacility): MachinePlacement[] {
  const limit = Math.min(MACHINES_PER_RACK * MAX_VISIBLE_RACKS, Math.max(0, facility.count));
  if (!limit) return [];
  const source = facility.machines.filter(machine => machine.count > 0);
  if (!source.length) return [];
  const allocations = source.map(machine => Math.max(1, Math.floor(machine.count / facility.count * limit)));
  while (allocations.reduce((sum, n) => sum + n, 0) > limit) {
    const largest = allocations.indexOf(Math.max(...allocations));
    allocations[largest]--;
  }
  while (allocations.reduce((sum, n) => sum + n, 0) < limit) {
    let next = 0;
    source.forEach((machine, i) => { if (machine.count / (allocations[i] + 1) > source[next].count / (allocations[next] + 1)) next = i; });
    allocations[next]++;
  }
  const units = source.flatMap((machine, i) => Array.from({ length: allocations[i] }, () => machine));
  const racks = rackCount(facility.count);
  const rackColumns = Math.min(2, racks);
  const rackRows = Math.ceil(racks / rackColumns);
  const rackSize = racks === 1 ? 2.1 : 1.1;
  const rackSpacing = rackSize + 0.1;
  return units.map((machine, i) => {
    const rack = Math.floor(i / MACHINES_PER_RACK);
    const rackPopulation = Math.min(MACHINES_PER_RACK, limit - rack * MACHINES_PER_RACK);
    const cols = Math.min(4, Math.ceil(Math.sqrt(Math.min(rackPopulation, MACHINES_PER_LAYER))));
    const cell = i % MACHINES_PER_LAYER;
    const size = Math.min(1, (rackSize - 0.12) / cols - 0.06);
    const spacing = size + 0.06;
    const height = size * 52;
    const rackX = (rack % rackColumns - (rackColumns - 1) / 2) * rackSpacing;
    const rackY = (Math.floor(rack / rackColumns) - (rackRows - 1) / 2) * rackSpacing;
    return { machine, rack, rackX, rackY, rackSize, size, height,
      x: rackX + (cell % cols - (cols - 1) / 2) * spacing - size / 2,
      y: rackY + (Math.floor(cell / cols) - (cols - 1) / 2) * spacing - size / 2,
      base: 10 + Math.floor((i % MACHINES_PER_RACK) / MACHINES_PER_LAYER) * (height + 6) };
  });
}

export function hitFacility(point: Point, facilities: FactoryFacility[], zoom = 1): MachineKind | null {
  const x = SCENE_WIDTH / 2 + (point.x - SCENE_WIDTH / 2) / zoom;
  const y = SCENE_HEIGHT / 2 + (point.y - SCENE_HEIGHT / 2) / zoom;
  const ordered = [...SITES].sort((a, b) => (b.x + b.y) - (a.x + a.y));
  for (const site of ordered) {
    const facility = facilities.find(item => item.kind === site.kind);
    if (!facility) continue;
    const center = project(site.x, site.y);
    const height = Math.max(32, ...machinePlacements(facility).map(item => item.base + item.height));
    const width = facility.count > 16 ? 128 : 112;
    if (Math.abs(x - center.x) <= width && y >= center.y - height - 48 && y <= center.y + 54) return site.kind;
  }
  return null;
}
