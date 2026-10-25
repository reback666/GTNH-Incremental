import type { SceneFilter, SceneMachineState } from './state';
import type { GroundDesign, GroundEdit, GroundEditor } from './ground';
import type { GroundStructure } from './ground-structure';

export interface FactoryView {
  update(machines: SceneMachineState[], animated: boolean, filter?: SceneFilter, ownedCount?: number): void;
  focus(modelId: string, index?: number): void;
  reset(): void;
  select(modelId: string | null, index?: number): void;
  setVisible(visible: boolean): void;
  setGround(design: GroundDesign, site: string, structure?: GroundStructure | null): Promise<void>;
  setGroundEditor(editor: GroundEditor): void;
  applyGroundEdit(edit: GroundEdit): void;
  moveCamera(forward: number, side?: number, lift?: number): void;
  dispose(): void;
}

export interface SceneLabel {
  id: string;
  x: number;
  y: number;
  visible: boolean;
  index: number;
}

export interface FactoryViewOptions {
  onGroundEdit?: (edit: GroundEdit) => void;
  onGroundHover?: (edit: GroundEdit) => void;
  onGroundError?: (message: string) => void;
  onGroundExit?: () => void;
  onGroundUndo?: (redo: boolean) => void;
}
export function createFactoryView(canvas: HTMLCanvasElement, onSelect: (id: string, index: number) => void, onProject?: (labels: SceneLabel[]) => void, options?: FactoryViewOptions): Promise<FactoryView>;
