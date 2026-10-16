// 基地配色。电压色与 style.css 的 --vt1..14 保持一致（MAX 的彩虹渐变取品红代表色）。
export const VOLTAGE_COLORS = [
  '#ff5555',
  '#778899',
  '#ff8c00',
  '#ffd700',
  '#696969',
  '#4169e1',
  '#ff00ff',
  '#00ced1',
  '#008000',
  '#8b0000',
  '#8b008b',
  '#0000cd',
  '#aa0000',
  '#ff55ff',
] as const;

export function voltageColor(tier: number): string {
  return VOLTAGE_COLORS[Math.max(0, Math.min(VOLTAGE_COLORS.length - 1, tier - 1))]!;
}

export const COLORS = {
  charcoal: '#25282b',
  charcoalDark: '#17191b',
  steel: '#5d646b',
  steelLight: '#8a939b',
  copper: '#c46a2f',
  amber: '#ffb43a',
  hazard: '#f2c230',
  teal: '#2fb5a3',
  tealDark: '#1d6f66',
  concrete: '#4a4d50',
  ground: '#2d3033',
} as const;

/** 状态灯颜色 */
export const STATUS_COLORS = {
  running: '#5dff7a',
  idle: '#ffb43a',
  unpowered: '#ff7a1a',
  stopped: '#7c8288',
  faulty: '#ff3030',
  storage: '#3fd8ff',
} as const;

export const STATUS_LABELS = {
  running: '运行',
  idle: '待机',
  unpowered: '缺电',
  stopped: '停机',
  faulty: '故障',
  storage: '储能',
} as const;
