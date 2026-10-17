import { CONTENT } from './index';

export function voltageCssVariables(): Record<string, string> {
  const gradient = (colors: string[]) => `linear-gradient(90deg, ${colors.join(', ')})`;
  return Object.fromEntries(CONTENT.voltages.flatMap((voltage) => [
    [`--vt${voltage.tier}`, voltage.color ?? gradient(CONTENT.rules.rainbow)],
    [`--vt${voltage.tier}-text`, voltage.color ?? gradient(CONTENT.rules.rainbowText)],
  ]));
}
