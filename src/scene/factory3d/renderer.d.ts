import type { SceneMachineState } from './state';

export interface FactoryView {
  update(machines: SceneMachineState[], animated: boolean): void;
  focus(modelId: string): void;
  reset(): void;
  overview(): void;
  select(modelId: string | null): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export interface SceneLabel {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}

export function createFactoryView(canvas: HTMLCanvasElement, onSelect: (id: string) => void, onProject?: (labels: SceneLabel[]) => void): Promise<FactoryView>;
