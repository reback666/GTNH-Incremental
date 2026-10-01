// 测试专用辅助工具：住在 test/ 里，不进 src/。
import { MACHINE_MODELS, type MachineModel } from '../src/game/models';

// 按机型 id 取机型目录里的一台，写测试时省得每次全表 find。
export function modelById(id: string): MachineModel {
  const model = MACHINE_MODELS.find((model) => model.id === id);
  if (!model) throw new Error(`没有这个机型：${id}`);
  return model;
}
