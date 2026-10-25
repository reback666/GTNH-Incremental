import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONTENT } from '../src/content';

// 配置中的素材键拼错会在界面里变成缺图；构建前直接指出实际缺少的文件。
const missing = new Set<string>();
const check = (path: string) => {
  if (!existsSync(fileURLToPath(new URL(`../src/assets/${path}`, import.meta.url)))) missing.add(path);
};
for (const voltage of CONTENT.voltages) {
  for (const line of ['vajra', 'drill', 'blast']) check(`pickaxe/${line}-${voltage.textureKey}.png`);
  check(`veins/${voltage.ore.texture}.png`);
  check(`veins/base/${voltage.ore.texture}.png`);
}
for (const model of CONTENT.models) check(`machines/${model.icon}.png`);
if (missing.size > 0) throw new Error(`内容引用的素材不存在：\n${[...missing].join('\n')}`);
console.log(`内容检查通过：${CONTENT.voltages.length} 档电压，${CONTENT.models.length} 个机型。`);
