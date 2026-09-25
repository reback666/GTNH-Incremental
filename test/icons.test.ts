import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MACHINE_MODELS } from '../src/game/models';

const ICON_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'assets',
  'machines',
);

function pngSize(bytes: Buffer): string {
  // PNG 的宽高写在 IHDR 里：文件头 8 字节 + 长度 4 + 类型 4 之后就是宽高各 4 字节
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

// 图标是脚本生成的，最容易出的错是漏生成（界面会静默回退成代码画的图标）和尺寸变了。
describe('机型图标', () => {
  it('每个机型都有图标文件，且都是 32×32', () => {
    const missing: string[] = [];
    const wrongSize: string[] = [];
    for (const model of MACHINE_MODELS) {
      const file = path.join(ICON_DIR, `${model.id}.png`);
      if (!existsSync(file)) {
        missing.push(model.id);
        continue;
      }
      const size = pngSize(readFileSync(file));
      if (size !== '32x32') wrongSize.push(`${model.id}=${size}`);
    }
    expect(missing, '缺图标的机型').toEqual([]);
    expect(wrongSize, '尺寸不对的图标').toEqual([]);
  });

  it('采矿机与制造机的 14 级图标两两不同（机壳按电压染色生效）', () => {
    for (const prefix of ['m-', 'c-']) {
      const hashes = new Set<string>();
      for (let tier = 1; tier <= 14; tier += 1) {
        const file = path.join(ICON_DIR, `${prefix}${tier}.png`);
        hashes.add(createHash('md5').update(readFileSync(file)).digest('hex'));
      }
      expect(hashes.size, `${prefix} 系列的图标数`).toBe(14);
    }
  });

  it('镐子三条线各有 14 张 32×32 图标，同一线内按电压色两两不同', () => {
    const dir = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'src',
      'assets',
      'pickaxe',
    );
    for (const line of ['vajra', 'drill', 'blast']) {
      const hashes = new Set<string>();
      for (let tier = 1; tier <= 14; tier += 1) {
        const file = path.join(dir, `${line}-${tier}.png`);
        expect(existsSync(file), `缺 ${line}-${tier}.png`).toBe(true);
        const bytes = readFileSync(file);
        expect(pngSize(bytes), `${line}-${tier} 尺寸`).toBe('32x32');
        hashes.add(createHash('md5').update(bytes).digest('hex'));
      }
      expect(hashes.size, `${line} 系列的图标数`).toBe(14);
    }
  });
});
