import type { SceneFilter, SceneMachineState } from './state';

export interface FactoryView {
  update(machines: SceneMachineState[], animated: boolean, filter?: SceneFilter): void;
  focus(modelId: string, index?: number): void;
  reset(): void;
  overview(): void;
  select(modelId: string | null, index?: number): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export interface SceneLabel {
  id: string;
  x: number;
  y: number;
  visible: boolean;
  index: number;
}

export function createFactoryView(canvas: HTMLCanvasElement, onSelect: (id: string, index: number) => void, onProject?: (labels: SceneLabel[]) => void, options?: { compact?: boolean }): Promise<FactoryView>;
