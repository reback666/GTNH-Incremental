const files = import.meta.glob('../assets/casings/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const ores = import.meta.glob('../assets/veins/base/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export function casingUrl(tier: number, face: 'side' | 'top'): string | undefined {
  return files[`../assets/casings/${tier}-${face}.png`];
}
export function oreUrl(tier: number): string | undefined { return ores[`../assets/veins/base/t${tier}.png`]; }
